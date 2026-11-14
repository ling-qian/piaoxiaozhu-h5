/**
 * COS 预签名的回归。
 *
 * 签名错一个字节，COS 只回 `SignatureDoesNotMatch`，不告诉你错在哪，
 * 而这条路径又是 OCR 的唯一图片中转——它坏了，识别会退化到内联发送并被
 * 服务商 429。所以这里做两件事：
 *
 * 1. 用 node:crypto 另写一份同样的算法对拍。WebCrypto 与 node:crypto 的
 *    密钥处理方式不同，两边同时写错的概率远低于单边写错。
 * 2. 锁一组固定向量。签名算法一旦被"顺手优化"，这组会立刻变红。
 */

import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cosObjectSize,
  cosPresign,
  cosPresignGet,
  cosPresignPut,
  cosPublicUrl,
  cosUploadForVision,
} from "./cos";

// ──────────────────────────────────────────── 独立实现（对拍用）

interface RefOptions {
  bucket: string;
  region: string;
  secretId: string;
  secretKey: string;
  key: string;
  nowSec: number;
  expires?: number;
  method?: "PUT" | "GET" | "HEAD" | "DELETE";
  extraHeaders?: Record<string, string>;
}

/** 按 COS 官方算法重算一遍，只依赖 node:crypto */
function refPresign(o: RefOptions): string {
  const host = `${o.bucket}.cos.${o.region}.myqcloud.com`;
  const path = "/" + o.key.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
  const start = o.nowSec - 60;
  const keyTime = `${start};${o.nowSec + (o.expires ?? 900)}`;

  const pairs: Array<[string, string]> = [["host", host]];
  for (const [k, v] of Object.entries(o.extraHeaders ?? {})) pairs.push([k.toLowerCase(), v]);
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const headersStr = pairs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  const headerList = pairs.map(([k]) => k).join(";");
  const httpString = `${(o.method ?? "PUT").toLowerCase()}\n${path}\n\n${headersStr}\n`;
  const stringToSign = `sha1\n${keyTime}\n${createHash("sha1").update(httpString).digest("hex")}\n`;

  const signKey = createHmac("sha1", o.secretKey).update(keyTime).digest("hex");
  const signature = createHmac("sha1", signKey).update(stringToSign).digest("hex");

  const kt = encodeURIComponent(keyTime);
  return (
    `https://${host}${path}` +
    `?q-sign-algorithm=sha1&q-ak=${o.secretId}` +
    `&q-sign-time=${kt}&q-key-time=${kt}` +
    `&q-header-list=${encodeURIComponent(headerList)}` +
    `&q-url-param-list=&q-signature=${signature}`
  );
}

const BASE = {
  bucket: "pzx-1250000000",
  region: "ap-shanghai",
  secretId: "AKIDEXAMPLE",
  secretKey: "secret-example-key",
  key: "uploads/user-1/项目票据 001.jpg",
  nowSec: 1700000000,
  expires: 600,
  extraHeaders: { "Content-Length": "12345" },
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ──────────────────────────────────────────── 签名

describe("cosPresign", () => {
  it("与独立实现逐字符一致（含中文路径与额外头部）", async () => {
    expect(await cosPresign(BASE)).toBe(refPresign(BASE));
  });

  it("固定向量不变", async () => {
    // 这条不是"COS 官方给的样例"，而是把当前算法输出钉住：
    // 改签名逻辑时它会变红，提醒先拿真实请求去 COS 验一遍再更新。
    await expect(cosPresign(BASE)).resolves.toContain(
      "q-signature=a8ee0032d5694267e03a13e1e77bde6fd1976562"
    );
  });

  it("q-sign-time 里的分号必须编码，header 列表要带上 host", async () => {
    const url = await cosPresign({ ...BASE, extraHeaders: undefined });
    expect(url).toContain("q-sign-time=1699999940%3B1700000600");
    expect(url).toContain("q-header-list=host");
    expect(url).toContain("q-url-param-list=");
    expect(url).not.toContain("q-url-param-list=&q-signature=&");
  });

  it("额外头部按名字排序并参与签名", async () => {
    const url = await cosPresign(BASE);
    expect(url).toContain("q-header-list=content-length%3Bhost");

    // content-length 是签进去的：客户端多传一个字节，COS 就会判签名不匹配
    const other = await cosPresign({
      ...BASE,
      extraHeaders: { "Content-Length": "12346" },
    });
    expect(other).not.toBe(url);
  });

  it("不同 method 得到不同签名", async () => {
    const put = await cosPresignPut(BASE);
    const get = await cosPresignGet(BASE);
    expect(put).not.toBe(get);
    // method 进了 HttpString，所以只有 q-signature 这一段的取值不同
    const sig = (u: string) => u.split("q-signature=")[1];
    expect(sig(put)).not.toBe(sig(get));
  });

  it("路径按段编码：保留斜杠，中文与空格转义", async () => {
    const url = await cosPresign({ ...BASE, key: "/uploads/用户 1/a+b.jpg", extraHeaders: undefined });
    expect(url).toContain("/uploads/%E7%94%A8%E6%88%B7%201/a%2Bb.jpg?");
    // 开头的斜杠不能变成两个
    expect(url).not.toContain("//uploads");
  });

  it("cosPublicUrl 不带签名参数", () => {
    const url = cosPublicUrl("b-1", "ap-shanghai", "/a/b.jpg");
    expect(url).toBe("https://b-1.cos.ap-shanghai.myqcloud.com/a/b.jpg");
    expect(url).not.toContain("?");
  });
});

// ──────────────────────────────────────────── 读大小

describe("cosObjectSize", () => {
  it("按响应头返回真实大小", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(null, { status: 200, headers: { "content-length": "2048" } })
    );
    const r = await cosObjectSize(BASE);
    expect(r).toEqual({ exists: true, size: 2048 });
    // 只要响应头，不能把正文整张下载下来
    expect(vi.mocked(fetch).mock.calls[0]![1]).toMatchObject({ method: "GET" });
  });

  it("对象不存在时 exists=false", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));
    await expect(cosObjectSize(BASE)).resolves.toEqual({ exists: false, size: null });
  });

  it("缺 content-length 时大小为 null 而不是 NaN", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    await expect(cosObjectSize(BASE)).resolves.toEqual({ exists: true, size: null });
  });
});

// ──────────────────────────────────────────── 给视觉模型的中转

const COS_ENV = {
  COS_BUCKET_NAME: "pzx-1250000000",
  COS_REGION: "ap-shanghai",
  COS_SECRET_ID: "AKIDEXAMPLE",
  COS_SECRET_KEY: "secret-example-key",
};

describe("cosUploadForVision", () => {
  it("四个变量缺任意一个就返回 not_configured，且不发请求", async () => {
    const r = await cosUploadForVision(new ArrayBuffer(8), { ...COS_ENV, COS_SECRET_KEY: undefined });
    expect(r).toEqual({ reason: "not_configured" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("上传失败返回 upload_failed——调用方据此决定是否提示内联发送", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("AccessDenied", { status: 403 }));
    await expect(cosUploadForVision(new ArrayBuffer(8), COS_ENV)).resolves.toEqual({
      reason: "upload_failed",
    });
  });

  it("上传成功返回预签名 GET 地址（不是公网地址）", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    const r = await cosUploadForVision(new ArrayBuffer(8), COS_ENV);

    expect("url" in r).toBe(true);
    const url = "url" in r ? r.url : "";
    expect(url).toMatch(/^https:\/\/pzx-1250000000\.cos\.ap-shanghai\.myqcloud\.com\/ocr-tmp\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.jpg\?/);
    expect(url).toContain("q-sign-algorithm=sha1");
    // 私有桶：展示地址必须带签名
    expect(url).toContain("q-signature=");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0]![1]).toMatchObject({ method: "PUT" });
  });
});
