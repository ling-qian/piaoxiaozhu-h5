import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.plan.upsert({
    where: { code: "free" },
    update: {},
    create: {
      code: "free",
      name: "免费版",
      price: 0,
      quotaLimit: 10,
      duration: 30,
      features: "每月10次识别,基础分类,CSV导出",
    },
  });

  await prisma.plan.upsert({
    where: { code: "pro" },
    update: {},
    create: {
      code: "pro",
      name: "专业版",
      price: 29.9,
      quotaLimit: 200,
      duration: 30,
      features: "每月200次识别,5层分类引擎,Excel/CSV导出,LLM智能分类",
    },
  });

  await prisma.plan.upsert({
    where: { code: "enterprise" },
    update: {},
    create: {
      code: "enterprise",
      name: "企业版",
      price: 99,
      quotaLimit: -1,
      duration: 30,
      features: "无限次识别,全部功能,优先客服,API接口",
    },
  });

  console.log("Seed data inserted");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
