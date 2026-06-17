import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkQuota } from "@/lib/actions/user-actions";
import { LLM_BASE_URL, LLM_API_KEY } from "@/lib/env";

// ─── 简单内存限速（IP + UserID 双维度，每个维度独立限制） ───
const rateLimitWindow = 60_000; // 60 秒窗口
const rateLimitMax = 10; // 每个维度每分钟最多 10 次
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string): { allowed: boolean } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    // 新窗口，重置计数
    rateLimitMap.set(key, { count: 1, resetAt: now + rateLimitWindow });
    // 清理过期条目
    rateLimitMap.forEach((v, k) => {
      if (now > v.resetAt) rateLimitMap.delete(k);
    });
    return { allowed: true };
  }

  if (entry.count >= rateLimitMax) {
    return { allowed: false };
  }

  entry.count++;
  return { allowed: true };
}

// ─── 白名单文件类型 ───
const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "image/gif",
  "application/pdf",
]);

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif", ".pdf"]);

function getExtension(filename: string | undefined): string {
  if (!filename) return "";
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

export async function POST(req: NextRequest) {
  // 1. 鉴权：必须登录
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const userId = session.user.id;

  // 2. 配额检查
  try {
    const quota = await checkQuota();
    if (!quota.available) {
      return NextResponse.json(
        { error: "识别次数已用完，请升级套餐" },
        { status: 403 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "配额检查失败，请重新登录" },
      { status: 401 }
    );
  }

  // 3. IP 限速（防止滥用）
  const ip = req.headers.get("x-forwarded-for")
    || req.headers.get("x-real-ip")
    || "unknown";
  const rateResultIp = rateLimit(`ip:${ip}`);
  if (!rateResultIp.allowed) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试" },
      { status: 429 }
    );
  }

  // 4. UserID 限速（同一用户独立限制，避免同 IP 下其他用户被误伤）
  const rateResultUser = rateLimit(`user:${userId}`);
  if (!rateResultUser.allowed) {
    return NextResponse.json(
      { error: "识别过于频繁，请稍后再试" },
      { status: 429 }
    );
  }

  // 4. 解析上传
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const image = formData.get("image") as File | null;
  if (!image) {
    return NextResponse.json({ error: "请提供图片或PDF文件" }, { status: 400 });
  }

  // 5. 文件名扩展名校验
  const ext = getExtension(image.name);
  if (!ALLOWED_MIMES.has(image.type) && !ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: "不支持的文件类型" },
      { status: 400 }
    );
  }

  // 6. 文件大小限制
  if (image.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "文件不能超过 20MB" }, { status: 400 });
  }

  // ─── 以下保持原有的 OCR 逻辑不变 ───
  const VISION_MODEL = process.env.VISION_MODEL_NAME || "agnes-2.0-flash";
  const OCR_TIMEOUT_MS = 60_000;

  if (!LLM_API_KEY) {
    return NextResponse.json({ error: "LLM_API_KEY 未配置" }, { status: 500 });
  }

  try {
    const buffer = Buffer.from(await image.arrayBuffer());
    const base64 = buffer.toString("base64");
    const mimeType = image.type || "image/jpeg";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);

    try {
      const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LLM_API_KEY}`,
        },
        body: JSON.stringify({
          model: VISION_MODEL,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `你是一个专业的中国票据 OCR 助手。请从这张票据图片中提取信息，严格以 JSON 格式回复。

第一步：判断发票类型（invoiceType），然后按类型提取对应字段。

发票类型枚举：
- "vat_special" = 增值税专用发票（纸质）
- "vat_normal" = 增值税普通发票（纸质）
- "vat_special_electronic" = 增值税专用发票（电子/数电）
- "vat_normal_electronic" = 增值税普通发票（电子/数电）
- "electronic" = 电子发票（通用）
- "machine_printed" = 机打发票
- "receipt" = 收据/小票

通用字段（所有类型都要提取）：
{"merchantName": "销售方名称", "totalAmount": 0.00, "taxAmount": 0.00, "amountWithoutTax": 0.00, "taxRate": 0.00, "invoiceDate": "YYYY-MM-DD", "invoiceType": "发票类型枚举值", "invoiceNo": "发票号码", "invoiceCode": "发票代码", "checkCode": "校验码（后6位）", "buyerName": "购买方名称", "buyerTaxNo": "购买方纳税人识别号", "sellerTaxNo": "销售方纳税人识别号", "items": [{"name":"商品名称","quantity":1,"unitPrice":0.00,"amount":0.00,"taxRate":0.00,"taxAmount":0.00}], "rawText": "票据上的关键文字内容"}

各类型重点字段说明：
- 增值税专票(vat_special/vat_special_electronic)：必须有 buyerName、buyerTaxNo、sellerTaxNo、taxRate、amountWithoutTax；发票号码通常8位
- 增值税普票(vat_normal/vat_normal_electronic)：有 buyerName、buyerTaxNo、sellerTaxNo；发票号码通常8位
- 数电票(含electronic)：发票号码20位；无发票代码(invoiceCode=null)
- 机打发票(machine_printed)：发票号码8-10位；通常无税额明细
- 收据/小票(receipt)：通常无发票号码和税额

注意事项：
1. totalAmount 是价税合计金额
2. taxAmount 是税额，没有则为 0
3. amountWithoutTax 是不含税金额
4. taxRate 是税率（如 0.06 表示 6%）
5. invoiceDate 格式为 YYYY-MM-DD
6. checkCode 只填后6位数字
7. items 是商品明细行数组，没有则为空数组 []
8. 数电票的发票号码为20位，且没有发票代码
9. 如果某个字段无法识别，设为 null
10. rawText 中请保留票据上的关键文字
11. 只回复 JSON，不要添加任何其他文字`,
                },
                {
                  type: "image_url",
                  image_url: { url: `data:${mimeType};base64,${base64}` },
                },
              ],
            },
          ],
          temperature: 0.1,
          max_tokens: 2000,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error(`[OCR API] 视觉模型返回错误: ${response.status}`, errText);
        return NextResponse.json(
          { error: `视觉模型调用失败: ${response.status}`, fallback: true },
          { status: 502 }
        );
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content as string | undefined;

      if (!content) {
        return NextResponse.json(
          { error: "视觉模型返回为空", fallback: true },
          { status: 502 }
        );
      }

      // 提取 JSON（支持 markdown 代码块包裹和嵌套花括号）
      let jsonStr: string | null = null;

      // 优先从 ```json ... ``` 代码块中提取
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      } else {
        // 从第一个 { 到最后一个 } 提取（贪婪匹配，支持嵌套）
        const firstBrace = content.indexOf("{");
        const lastBrace = content.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          jsonStr = content.slice(firstBrace, lastBrace + 1);
        }
      }

      if (!jsonStr) {
        console.error("[OCR API] 无法从视觉模型回复中提取 JSON:", content.slice(0, 200));
        return NextResponse.json(
          { error: "无法解析视觉模型结果", fallback: true },
          { status: 502 }
        );
      }

      // 容错：移除尾随逗号（LLM 常见问题）
      const sanitized = jsonStr
        .replace(/,\s*([}\]])/g, "$1")  // 移除对象/数组末尾的逗号
        .replace(/,\s*,/g, ",");         // 移除连续逗号

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(sanitized);
      } catch (parseErr) {
        console.error("[OCR API] JSON 解析失败:", parseErr, "原始内容:", jsonStr.slice(0, 300));
        return NextResponse.json(
          { error: "视觉模型返回格式异常", fallback: true },
          { status: 502 }
        );
      }

      // 标准化字段
      const invoiceType = parsed.invoiceType || null;

      let invoiceNo: string | null = parsed.invoiceNo || null;
      if (invoiceNo) {
        invoiceNo = String(invoiceNo).replace(/\s/g, "");
      }

      // 数电票处理
      if (
        invoiceType === "vat_special_electronic" ||
        invoiceType === "vat_normal_electronic" ||
        invoiceType === "electronic"
      ) {
        if (invoiceNo && invoiceNo.length === 20) {
          parsed.invoiceCode = null;
        }
      }

      // 纸质票 20位号码修正
      if (
        (invoiceType === "vat_special" || invoiceType === "vat_normal") &&
        invoiceNo &&
        invoiceNo.length === 20
      ) {
        if (invoiceType === "vat_special") {
          parsed.invoiceType = "vat_special_electronic";
        } else if (invoiceType === "vat_normal") {
          parsed.invoiceType = "vat_normal_electronic";
        }
      }

      // 校验码只保留后6位
      let checkCode: string | null = parsed.checkCode || null;
      if (checkCode) {
        checkCode = String(checkCode).replace(/\s/g, "");
        if (checkCode.length > 6) checkCode = checkCode.slice(-6);
      }

      // 税率标准化
      let taxRate: number | null =
        typeof parsed.taxRate === "number" ? parsed.taxRate : null;
      if (taxRate !== null && taxRate > 1) {
        taxRate = taxRate / 100;
      }

      // 商品明细
      const items = Array.isArray(parsed.items)
        ? parsed.items.map((item: Record<string, unknown>) => ({
            name: String(item.name || ""),
            quantity: typeof item.quantity === "number" ? item.quantity : 1,
            unitPrice: typeof item.unitPrice === "number" ? item.unitPrice : 0,
            amount: typeof item.amount === "number" ? item.amount : 0,
            taxRate:
              typeof item.taxRate === "number"
                ? item.taxRate > 1
                  ? item.taxRate / 100
                  : item.taxRate
                : 0,
            taxAmount: typeof item.taxAmount === "number" ? item.taxAmount : 0,
          }))
        : [];

      return NextResponse.json({
        merchantName: parsed.merchantName || null,
        totalAmount:
          typeof parsed.totalAmount === "number" ? parsed.totalAmount : null,
        taxAmount:
          typeof parsed.taxAmount === "number" ? parsed.taxAmount : null,
        amountWithoutTax:
          typeof parsed.amountWithoutTax === "number"
            ? parsed.amountWithoutTax
            : null,
        taxRate,
        invoiceDate: parsed.invoiceDate || null,
        invoiceType: parsed.invoiceType || invoiceType,
        invoiceNo,
        invoiceCode: parsed.invoiceCode || null,
        checkCode,
        buyerName: parsed.buyerName || null,
        buyerTaxNo: parsed.buyerTaxNo || null,
        sellerTaxNo: parsed.sellerTaxNo || null,
        items,
        rawText: parsed.rawText || content,
        confidence: 0.9,
        source: "vision-llm" as const,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    console.error("[OCR API] 错误:", err?.constructor?.name, err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : "");
    const isAbort = err instanceof DOMException && err.name === "AbortError"
      || (err instanceof Error && err.name === "AbortError");
    const message = isAbort
      ? "视觉模型识别超时"
      : `视觉模型调用失败: ${err instanceof Error ? err.message : String(err)}`;
    return NextResponse.json(
      { error: message, fallback: true },
      { status: 502 }
    );
  }
}
