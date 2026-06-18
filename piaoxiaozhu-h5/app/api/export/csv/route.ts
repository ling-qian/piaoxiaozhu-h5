import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkExportPermission } from "@/lib/plan-config";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
  }

  // 检查导出权限
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { planCode: true },
  });
  if (!user || !checkExportPermission(user.planCode)) {
    return NextResponse.json(
      { error: "数据导出为付费功能，请升级到专业版或企业版" },
      { status: 403 }
    );
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
  });
  if (!project) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }

  const records = await prisma.record.findMany({
    where: { projectId, userId: session.user.id },
    orderBy: { invoiceDate: "desc" },
  });

  const BOM = "\uFEFF";
  const INVOICE_TYPE_LABELS: Record<string, string> = {
    vat_special: "增值税专用发票",
    vat_normal: "增值税普通发票",
    vat_special_electronic: "增值税专用发票(数电)",
    vat_normal_electronic: "增值税普通发票(数电)",
    electronic: "电子发票",
    machine_printed: "机打发票",
    receipt: "收据/小票",
  };
  const header = "商户名称,金额,税额,不含税金额,税率,日期,方向,一级分类,二级分类,发票类型,发票号码,发票代码,校验码,购买方,购买方税号,销售方税号,置信度,OCR原文";
  const rows = records.map((r) => {
    const escape = (s: string | null) => {
      if (!s) return '""';
      const str = s.replace(/"/g, '""');
      return `"${str}"`;
    };
    const typeLabel = r.invoiceType ? (INVOICE_TYPE_LABELS[r.invoiceType] || r.invoiceType) : "";
    return [
      escape(r.merchantName),
      Number(r.amount).toFixed(2),
      r.taxAmount ? Number(r.taxAmount).toFixed(2) : "",
      r.amountWithoutTax ? Number(r.amountWithoutTax).toFixed(2) : "",
      r.taxRate ? `${(Number(r.taxRate) * 100).toFixed(Number(r.taxRate) * 100 % 1 === 0 ? 0 : 1)}%` : "",
      r.invoiceDate || "",
      r.direction === "income" ? "收入" : "支出",
      escape(r.categoryL1),
      escape(r.categoryL2),
      escape(typeLabel),
      escape(r.invoiceNo),
      escape(r.invoiceCode),
      escape(r.checkCode),
      escape(r.buyerName),
      escape(r.buyerTaxNo),
      escape(r.sellerTaxNo),
      r.confidence ? Number(r.confidence).toFixed(2) : "",
      escape(r.rawText),
    ].join(",");
  });

  const csv = BOM + header + "\n" + rows.join("\n");

  const filename = encodeURIComponent(`${project.name}_记录导出_${new Date().toISOString().slice(0, 10)}.csv`);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
