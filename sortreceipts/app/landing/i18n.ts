/**
 * 落地页的文案字典。
 *
 * 只有落地页用这一本，应用内的界面文案仍在 lib/i18n.tsx。分开的理由：
 * 落地页要按语言各自成一个 URL 给爬虫抓取，段落比界面文案长得多，
 * 混在一起会让那份双语文案表再翻五倍。
 *
 * 新增语言时改三处：这里、content.ts（分类与常见问题）、lib/locales.ts。
 */

import type { LandingLocale } from "@/lib/locales";

export interface LocaleMeta {
  /** Open Graph 用的语言代码，格式是 语言_地区 */
  ogLocale: string;
  /** 语言切换器里的名字，用该语言自己的写法，不翻译 */
  label: string;
  title: string;
  description: string;
}

export const LOCALE_META: Record<LandingLocale, LocaleMeta> = {
  en: {
    ogLocale: "en_US",
    label: "English",
    title: "SortReceipts — Receipts and Costs for Small Restaurants",
    description:
      "Photograph supplier invoices and café receipts: SortReceipts files each one under one of 8 restaurant cost categories and keeps monthly revenue, expenses and gross margin current. Free plan, no app.",
  },
  zh: {
    ogLocale: "zh_CN",
    label: "中文",
    title: "SortReceipts — 小餐饮店的票据与成本记账",
    description:
      "拍供应商发票和小票，SortReceipts 把每张票归到 8 个餐饮成本分类，并让当月营业额、支出和毛利保持最新。浏览器直接用，免费版不需要信用卡。",
  },
  es: {
    ogLocale: "es_ES",
    label: "Español",
    title: "SortReceipts — Recibos y costes para restaurantes",
    description:
      "Fotografía facturas de proveedor y recibos del local: SortReceipts los clasifica en una de 8 categorías de coste y mantiene al día ingresos, gastos y margen bruto del mes. Gratis y sin app.",
  },
  pt: {
    ogLocale: "pt_BR",
    label: "Português",
    title: "SortReceipts — Recibos e custos para restaurantes",
    description:
      "Fotografe notas de fornecedor e recibos do salão: o SortReceipts classifica cada um em uma das 8 categorias de custo e mantém receita, despesas e margem bruta do mês em dia. Grátis, sem aplicativo.",
  },
  fr: {
    ogLocale: "fr_FR",
    label: "Français",
    title: "SortReceipts — Reçus et coûts pour restaurants",
    description:
      "Photographiez factures fournisseurs et reçus de salle : SortReceipts classe chacun dans l'une des 8 catégories de coûts et tient à jour recettes, dépenses et marge brute du mois. Gratuit, sans app.",
  },
  de: {
    ogLocale: "de_DE",
    label: "Deutsch",
    title: "SortReceipts — Belege und Kosten für Restaurants",
    description:
      "Lieferantenrechnungen und Thekenbelege fotografieren: SortReceipts ordnet jeden Beleg einer von 8 Restaurant-Kostenkategorien zu und hält Umsatz, Ausgaben und Rohertrag des Monats aktuell. Kostenlos, ohne App.",
  },
  ja: {
    ogLocale: "ja_JP",
    label: "日本語",
    title: "SortReceipts — 飲食店のレシートと原価管理",
    description:
      "仕入れ先の請求書や店頭レシートを撮るだけで、8 つの飲食店向け原価カテゴリに分類し、当月の売上・支出・粗利を最新に保ちます。ブラウザで完結、無料プランあり。",
  },
  ko: {
    ogLocale: "ko_KR",
    label: "한국어",
    title: "SortReceipts — 음식점 영수증과 원가 관리",
    description:
      "공급업체 청구서와 매장 영수증을 찍으면 8개의 음식점 원가 분류로 나누고, 이번 달 매출·지출·매출총이익을 최신으로 유지합니다. 브라우저에서 바로 쓰고 무료 플랜이 있습니다.",
  },
};

export interface LandingStrings {
  navFeatures: string;
  navHow: string;
  navPricing: string;
  navFaq: string;
  navSignin: string;
  navStart: string;

  badge: string;
  h1: string;
  sub: string;
  ctaPrimary: string;
  ctaSecondary: string;
  ctaNote: string;
  proof1: string;
  proof2: string;
  proof3: string;

  stat1Value: string;
  stat1Label: string;
  stat2Value: string;
  stat2Label: string;
  stat3Value: string;
  stat3Label: string;
  stat4Value: string;
  stat4Label: string;

  featuresEyebrow: string;
  featuresTitle: string;
  featuresSub: string;
  f1Title: string;
  f1Desc: string;
  f2Title: string;
  f2Desc: string;
  f3Title: string;
  f3Desc: string;
  f4Title: string;
  f4Desc: string;

  howEyebrow: string;
  howTitle: string;
  howSub: string;

  valueEyebrow: string;
  valueTitle: string;
  valueSub: string;
  v1Title: string;
  v1Desc: string;
  v2Title: string;
  v2Desc: string;
  v3Title: string;
  v3Desc: string;
  v4Title: string;
  v4Desc: string;
  valueFit: string;

  catEyebrow: string;
  catTitle: string;
  catSub: string;

  pricingEyebrow: string;
  pricingTitle: string;
  pricingSub: string;
  planFree: string;
  planFreeNote: string;
  planPro: string;
  planProNote: string;
  planBiz: string;
  planBizNote: string;
  popular: string;
  perMonth: string;
  freeLabel: string;
  planFreeB1: string;
  planFreeB2: string;
  planFreeB3: string;
  planProB1: string;
  planProB2: string;
  planProB3: string;
  planProB4: string;
  planBizB1: string;
  planBizB2: string;
  planBizB3: string;
  planBizB4: string;
  ctaFree: string;
  ctaPro: string;
  ctaBiz: string;
  pricingNote: string;

  faqTitle: string;
  faqSub: string;

  finalTitle: string;
  finalSub: string;
  finalCta: string;

  footerTagline: string;
  footerRights: string;
  langSwitch: string;

  demoMonth: string;
  demoTotal: string;
  demoFiled: string;
}

export const LANDING_STRINGS: Record<LandingLocale, LandingStrings> = {
  en: {
    navFeatures: "Features",
    navHow: "How it works",
    navPricing: "Pricing",
    navFaq: "FAQ",
    navSignin: "Sign in",
    navStart: "Start free",

    badge: "Bookkeeping for restaurants, cafés and food trucks",
    h1: "A bag of supplier receipts, turned into a month of numbers.",
    sub: "SortReceipts reads supplier invoices and counter receipts, files each one under a restaurant cost category — food, payroll, rent, platform fees — and keeps revenue, expenses and gross margin current. It runs in your browser — no app to install.",
    ctaPrimary: "Start free",
    ctaSecondary: "See how it works",
    ctaNote: "5 receipts a month, free. No credit card.",
    proof1: "No card required",
    proof2: "Works in any browser",
    proof3: "Export to CSV anytime",

    stat1Value: "8",
    stat1Label: "restaurant cost categories",
    stat2Value: "CSV",
    stat2Label: "export for your accountant",
    stat3Value: "0",
    stat3Label: "apps to install",
    stat4Value: "PDF",
    stat4Label: "receipts and photos",

    featuresEyebrow: "Features",
    featuresTitle: "Everything after the photo",
    featuresSub: "Recognition, categorization, reports and questions — in one place.",
    f1Title: "Snap or import",
    f1Desc: "Supplier invoices, delivery slips and counter receipts come back as vendor, total, date and tax. A monthly supplier statement imports as one file.",
    f2Title: "Filed by cost type",
    f2Desc: "Every invoice lands under food, payroll, rent, utilities or platform fees, so a restaurant's cost structure stays readable.",
    f3Title: "Revenue, cost and margin",
    f3Desc: "Daily revenue minus recorded expenses gives gross margin; the category split and the month-end pack follow from the same records.",
    f4Title: "Ask your books",
    f4Desc: "Ask \"how much did I spend on food last month?\" and get an answer from your own records.",

    howEyebrow: "How it works",
    howTitle: "Three steps, then it keeps itself current",
    howSub: "No spreadsheet to build, no weekly catch-up. Once it is in, it is in.",

    valueEyebrow: "What it fixes",
    valueTitle: "The work you would rather not do",
    valueSub: "Most of the cost is not the bookkeeping itself. It is letting receipts pile up first.",
    v1Title: "Month-end catch-up",
    v1Desc: "Receipts wait until the last day. Photograph them as they happen and the month closes itself.",
    v2Title: "Totals typed twice",
    v2Desc: "Vendor, amount and date come out of the photo, so nothing gets re-entered.",
    v3Title: "No idea where the money went",
    v3Desc: "Every expense carries a category. Spend split and profit trend fit on one screen.",
    v4Title: "Reformatting before the accountant",
    v4Desc: "Export the month as CSV. Excel, Numbers and Sheets open it as is.",
    valueFit: "Built for one- and two-location restaurants, cafés and food trucks. Not a template for every industry.",

    catEyebrow: "Categories",
    catTitle: "Every invoice has a place to go",
    catSub: "A wholesaler invoice goes to Food & ingredients, a delivery platform payout to Platform fees. Eight categories cover a small restaurant's cost structure.",

    pricingEyebrow: "Pricing",
    pricingTitle: "Start free. Upgrade when it pays for itself.",
    pricingSub: "Billed month to month. Cancel whenever you like.",
    planFree: "Free",
    planFreeNote: "To get started",
    planPro: "Pro",
    planProNote: "Recommended",
    planBiz: "Business",
    planBizNote: "Everything",
    popular: "Most popular",
    perMonth: "/mo",
    freeLabel: "Free",
    planFreeB1: "5 receipts a month",
    planFreeB2: "1 project",
    planFreeB3: "Basic monthly reports",
    planProB1: "200 receipts a month",
    planProB2: "10 projects",
    planProB3: "AI business review",
    planProB4: "CSV export",
    planBizB1: "Unlimited receipts",
    planBizB2: "Unlimited projects",
    planBizB3: "Unlimited AI reviews",
    planBizB4: "Priority support",
    ctaFree: "Start free",
    ctaPro: "Choose Pro",
    ctaBiz: "Choose Business",
    pricingNote: "Prices in USD, billed monthly.",

    faqTitle: "Questions, answered",
    faqSub: "The short version. For anything else, ask us after you sign in.",

    finalTitle: "Your next receipt could be the last one you type",
    finalSub: "Start on the free plan. Five receipts a month, no card needed.",
    finalCta: "Start free",

    footerTagline: "SortReceipts — every receipt, sorted",
    footerRights: "© 2026 SortReceipts. All rights reserved.",
    langSwitch: "Switch language",

    demoMonth: "October 2026",
    demoTotal: "Expenses this month",
    demoFiled: "Auto-filed",
  },
  zh: {
    navFeatures: "功能",
    navHow: "怎么用",
    navPricing: "价格",
    navFaq: "常见问题",
    navSignin: "登录",
    navStart: "免费开始",

    badge: "为餐馆、咖啡店和餐车做的记账",
    h1: "一袋供应商票据，变成一份月底能看的数",
    sub: "SortReceipts 读供应商发票和小票，把每张票归到餐饮成本分类——食材、工资、房租、平台服务费——并让营业额、支出和毛利保持最新。用浏览器打开就能用，不用装 App。",
    ctaPrimary: "免费开始",
    ctaSecondary: "看看怎么用",
    ctaNote: "每月 5 张免费 · 不需要信用卡",
    proof1: "无需信用卡",
    proof2: "浏览器直接用",
    proof3: "随时导出 CSV",

    stat1Value: "8",
    stat1Label: "个餐饮成本分类",
    stat2Value: "CSV",
    stat2Label: "导出交给会计",
    stat3Value: "0",
    stat3Label: "个需要安装的 App",
    stat4Value: "PDF",
    stat4Label: "票据与照片都能传",

    featuresEyebrow: "功能",
    featuresTitle: "照片之后的事，全交给我们",
    featuresSub: "识别、分类、报表和问账，都在同一个地方完成。",
    f1Title: "拍照或整张导入",
    f1Desc: "供应商发票、送货单和柜台小票拍照识别，金额、日期和税额直接变成结构化字段；月度对账单一次导入。",
    f2Title: "按成本类型归类",
    f2Desc: "每张票落到食材、工资、房租、水电或平台服务费，一家店的成本结构一眼能看清。",
    f3Title: "营业额、成本和毛利",
    f3Desc: "按天记营业额，减去票据支出就是毛利；分类占比和月度交付包都从同一批记录出。",
    f4Title: "用大白话问账",
    f4Desc: "直接问「上个月食材花了多少」，答案来自你自己的记录，不是猜的。",

    howEyebrow: "怎么用",
    howTitle: "三步之后，它自己保持更新",
    howSub: "不用建表，不用每周补录，拍完就结束。",

    valueEyebrow: "解决什么",
    valueTitle: "这些活儿，本来都得你来做",
    valueSub: "票据整理最耗时间的地方，不是记账本身，是「先攒着，等有空一起弄」。",
    v1Title: "月底集中补录",
    v1Desc: "票据压到最后一天才动手。改成随手拍，当月账目自己就齐了。",
    v2Title: "金额敲两遍",
    v2Desc: "商户、金额和日期从照片里读出来，不需要你重复录入。",
    v3Title: "不知道钱花在哪",
    v3Desc: "每笔支出都带分类，占比和利润趋势在一屏里看得完。",
    v4Title: "交给会计前还要整理",
    v4Desc: "当月数据导出 CSV，Excel、Numbers 和 Sheets 都能直接打开。",
    valueFit: "为单店或两家店以内的餐馆、咖啡店和餐车准备，不做所有行业的通用模板。",

    catEyebrow: "分类",
    catTitle: "每张票据都有它该去的位置",
    catSub: "批发商的送货单进「食材」，外卖平台的扣点进「平台服务费」。八个分类覆盖一家小餐饮店的成本结构。",

    pricingEyebrow: "价格",
    pricingTitle: "先用免费的，值了再升级",
    pricingSub: "按月付费，随时可以取消。",
    planFree: "免费版",
    planFreeNote: "体验记账",
    planPro: "专业版",
    planProNote: "推荐",
    planBiz: "企业版",
    planBizNote: "全功能",
    popular: "最受欢迎",
    perMonth: "/月",
    freeLabel: "免费",
    planFreeB1: "每月 5 张票据",
    planFreeB2: "1 个项目",
    planFreeB3: "基础月度报表",
    planProB1: "每月 200 张票据",
    planProB2: "10 个项目",
    planProB3: "每月 AI 经营分析",
    planProB4: "CSV 导出",
    planBizB1: "不限票据数量",
    planBizB2: "不限项目数量",
    planBizB3: "不限 AI 分析次数",
    planBizB4: "优先支持",
    ctaFree: "免费开始",
    ctaPro: "选择专业版",
    ctaBiz: "选择企业版",
    pricingNote: "价格以美元计价，按月扣款。",

    faqTitle: "常见问题",
    faqSub: "先看短答案。还有别的疑问，登录后直接问我们。",

    finalTitle: "下一张小票，可以是最后一张需要手打的",
    finalSub: "从免费版开始。每月 5 张，不用绑卡。",
    finalCta: "免费开始",

    footerTagline: "SortReceipts · 每一张票据都归位",
    footerRights: "© 2026 SortReceipts. 保留所有权利。",
    langSwitch: "切换语言",

    demoMonth: "2026 年 10 月",
    demoTotal: "本月支出",
    demoFiled: "已自动分类",
  },
  es: {
    navFeatures: "Funciones",
    navHow: "Cómo funciona",
    navPricing: "Precios",
    navFaq: "Preguntas",
    navSignin: "Iniciar sesión",
    navStart: "Empezar gratis",

    badge: "Contabilidad para restaurantes, cafeterías y food trucks",
    h1: "Una bolsa de facturas de proveedor, convertida en las cifras del mes.",
    sub: "SortReceipts lee facturas de proveedor y recibos del local, clasifica cada uno en una categoría de coste —comida, nómina, alquiler, comisiones de plataforma— y mantiene al día ingresos, gastos y margen bruto. Funciona en el navegador, sin instalar nada.",
    ctaPrimary: "Empezar gratis",
    ctaSecondary: "Ver cómo funciona",
    ctaNote: "5 recibos al mes, gratis. Sin tarjeta.",
    proof1: "Sin tarjeta",
    proof2: "Funciona en cualquier navegador",
    proof3: "Exporta a CSV cuando quieras",

    stat1Value: "8",
    stat1Label: "categorías de coste",
    stat2Value: "CSV",
    stat2Label: "exportación para tu contador",
    stat3Value: "0",
    stat3Label: "apps que instalar",
    stat4Value: "PDF",
    stat4Label: "recibos y fotos",

    featuresEyebrow: "Funciones",
    featuresTitle: "Todo lo que pasa después de la foto",
    featuresSub: "Reconocimiento, clasificación, informes y consultas, en un solo lugar.",
    f1Title: "Fotografía o importa",
    f1Desc: "Facturas de proveedor, albaranes y recibos vuelven como proveedor, total, fecha e impuestos. Un extracto mensual del proveedor entra en un solo archivo.",
    f2Title: "Clasificado por tipo de coste",
    f2Desc: "Cada factura cae en comida, nómina, alquiler, suministros o comisiones de plataforma, para que la estructura de costes se lea de un vistazo.",
    f3Title: "Ingresos, coste y margen",
    f3Desc: "Los ingresos diarios menos los gastos registrados dan el margen bruto; el reparto por categoría y el paquete de fin de mes salen de los mismos registros.",
    f4Title: "Pregunta a tus cuentas",
    f4Desc: "Pregunta «¿cuánto gasté en comida el mes pasado?» y la respuesta sale de tus propios registros.",

    howEyebrow: "Cómo funciona",
    howTitle: "Tres pasos y se mantiene al día solo",
    howSub: "Sin hojas de cálculo y sin ponerte al día cada semana. Lo que entra, entra.",

    valueEyebrow: "Qué resuelve",
    valueTitle: "El trabajo que preferirías no hacer",
    valueSub: "Casi todo el coste no está en contabilizar, sino en dejar que los recibos se acumulen.",
    v1Title: "Ponerse al día a fin de mes",
    v1Desc: "Los recibos esperan hasta el último día. Fotografíalos cuando ocurren y el mes se cierra solo.",
    v2Title: "Importes tecleados dos veces",
    v2Desc: "Proveedor, importe y fecha salen de la foto, así que nada se vuelve a introducir.",
    v3Title: "No saber en qué se fue el dinero",
    v3Desc: "Cada gasto lleva una categoría. El reparto del gasto y la tendencia del beneficio caben en una pantalla.",
    v4Title: "Reformatear antes del contador",
    v4Desc: "Exporta el mes en CSV. Excel, Numbers y Sheets lo abren tal cual.",
    valueFit: "Pensado para restaurantes de uno o dos locales, cafeterías y food trucks. No es una plantilla para cualquier sector.",

    catEyebrow: "Categorías",
    catTitle: "Cada factura tiene su sitio",
    catSub: "Una factura de mayorista va a Comida e ingredientes; una comisión de reparto, a Comisiones de plataforma. Ocho categorías cubren la estructura de costes de un restaurante pequeño.",

    pricingEyebrow: "Precios",
    pricingTitle: "Empieza gratis. Sube cuando se pague solo.",
    pricingSub: "Facturado mes a mes. Cancela cuando quieras.",
    planFree: "Gratis",
    planFreeNote: "Para empezar",
    planPro: "Pro",
    planProNote: "Recomendado",
    planBiz: "Negocio",
    planBizNote: "Todo incluido",
    popular: "Más popular",
    perMonth: "/mes",
    freeLabel: "Gratis",
    planFreeB1: "5 recibos al mes",
    planFreeB2: "1 proyecto",
    planFreeB3: "Informes mensuales básicos",
    planProB1: "200 recibos al mes",
    planProB2: "10 proyectos",
    planProB3: "Análisis de negocio con IA",
    planProB4: "Exportación a CSV",
    planBizB1: "Recibos ilimitados",
    planBizB2: "Proyectos ilimitados",
    planBizB3: "Análisis con IA ilimitados",
    planBizB4: "Soporte prioritario",
    ctaFree: "Empezar gratis",
    ctaPro: "Elegir Pro",
    ctaBiz: "Elegir Negocio",
    pricingNote: "Precios en USD, facturación mensual.",

    faqTitle: "Preguntas frecuentes",
    faqSub: "La versión corta. Para lo demás, escríbenos tras iniciar sesión.",

    finalTitle: "Tu próximo recibo puede ser el último que teclees",
    finalSub: "Empieza con el plan gratis. Cinco recibos al mes, sin tarjeta.",
    finalCta: "Empezar gratis",

    footerTagline: "SortReceipts — cada recibo, en su sitio",
    footerRights: "© 2026 SortReceipts. Todos los derechos reservados.",
    langSwitch: "Cambiar idioma",

    demoMonth: "Octubre de 2026",
    demoTotal: "Gastos del mes",
    demoFiled: "Clasificado",
  },
  pt: {
    navFeatures: "Recursos",
    navHow: "Como funciona",
    navPricing: "Preços",
    navFaq: "Dúvidas",
    navSignin: "Entrar",
    navStart: "Começar grátis",

    badge: "Contabilidade para restaurantes, cafeterias e food trucks",
    h1: "Uma sacola de notas de fornecedor vira os números do mês.",
    sub: "O SortReceipts lê notas de fornecedor e recibos do salão, classifica cada um em uma categoria de custo — comida, folha, aluguel, taxas de plataforma — e mantém receita, despesas e margem bruta em dia. Roda no navegador, sem instalar aplicativo.",
    ctaPrimary: "Começar grátis",
    ctaSecondary: "Ver como funciona",
    ctaNote: "5 recibos por mês, grátis. Sem cartão.",
    proof1: "Sem cartão",
    proof2: "Funciona em qualquer navegador",
    proof3: "Exporte para CSV quando quiser",

    stat1Value: "8",
    stat1Label: "categorias de custo",
    stat2Value: "CSV",
    stat2Label: "exportação para o contador",
    stat3Value: "0",
    stat3Label: "aplicativos para instalar",
    stat4Value: "PDF",
    stat4Label: "recibos e fotos",

    featuresEyebrow: "Recursos",
    featuresTitle: "Tudo o que acontece depois da foto",
    featuresSub: "Reconhecimento, classificação, relatórios e perguntas, em um só lugar.",
    f1Title: "Fotografe ou importe",
    f1Desc: "Notas de fornecedor, romaneios e recibos voltam como fornecedor, total, data e impostos. Um extrato mensal do fornecedor entra em um só arquivo.",
    f2Title: "Classificado por tipo de custo",
    f2Desc: "Cada nota cai em alimentos, folha, aluguel, utilidades ou taxas de plataforma, para a estrutura de custos ficar legível.",
    f3Title: "Receita, custo e margem",
    f3Desc: "A receita diária menos as despesas registradas dá a margem bruta; a divisão por categoria e o pacote de fim de mês saem dos mesmos registros.",
    f4Title: "Pergunte às suas contas",
    f4Desc: "Pergunte “quanto gastei com alimentos no mês passado?” e a resposta vem dos seus próprios registros.",

    howEyebrow: "Como funciona",
    howTitle: "Três passos e ele se mantém atualizado",
    howSub: "Sem planilha para montar e sem correr atrás toda semana. O que entra, fica.",

    valueEyebrow: "O que resolve",
    valueTitle: "O trabalho que você preferia não fazer",
    valueSub: "Quase todo o custo não está em lançar, e sim em deixar os recibos acumularem.",
    v1Title: "Corrida de fim de mês",
    v1Desc: "Os recibos esperam até o último dia. Fotografe na hora e o mês fecha sozinho.",
    v2Title: "Valores digitados duas vezes",
    v2Desc: "Fornecedor, valor e data saem da foto, então nada é redigitado.",
    v3Title: "Não saber para onde o dinheiro foi",
    v3Desc: "Cada despesa tem uma categoria. A divisão do gasto e a tendência de lucro cabem em uma tela.",
    v4Title: "Reformatar antes do contador",
    v4Desc: "Exporte o mês em CSV. Excel, Numbers e Sheets abrem direto.",
    valueFit: "Feito para restaurantes de um ou dois endereços, cafeterias e food trucks. Não é um modelo para qualquer setor.",

    catEyebrow: "Categorias",
    catTitle: "Cada nota tem um lugar certo",
    catSub: "Uma nota de atacadista vai para Alimentos e ingredientes; uma taxa de entrega, para Taxas de plataforma. Oito categorias cobrem a estrutura de custos de um restaurante pequeno.",

    pricingEyebrow: "Preços",
    pricingTitle: "Comece grátis. Suba de plano quando se pagar.",
    pricingSub: "Cobrança mês a mês. Cancele quando quiser.",
    planFree: "Grátis",
    planFreeNote: "Para começar",
    planPro: "Pro",
    planProNote: "Recomendado",
    planBiz: "Negócio",
    planBizNote: "Tudo incluído",
    popular: "Mais popular",
    perMonth: "/mês",
    freeLabel: "Grátis",
    planFreeB1: "5 recibos por mês",
    planFreeB2: "1 projeto",
    planFreeB3: "Relatórios mensais básicos",
    planProB1: "200 recibos por mês",
    planProB2: "10 projetos",
    planProB3: "Análise de negócio com IA",
    planProB4: "Exportação em CSV",
    planBizB1: "Recibos ilimitados",
    planBizB2: "Projetos ilimitados",
    planBizB3: "Análises com IA ilimitadas",
    planBizB4: "Suporte prioritário",
    ctaFree: "Começar grátis",
    ctaPro: "Escolher Pro",
    ctaBiz: "Escolher Negócio",
    pricingNote: "Preços em USD, cobrança mensal.",

    faqTitle: "Perguntas frequentes",
    faqSub: "A versão curta. Para o resto, fale com a gente depois de entrar.",

    finalTitle: "Seu próximo recibo pode ser o último que você digita",
    finalSub: "Comece no plano grátis. Cinco recibos por mês, sem cartão.",
    finalCta: "Começar grátis",

    footerTagline: "SortReceipts — cada recibo no seu lugar",
    footerRights: "© 2026 SortReceipts. Todos os direitos reservados.",
    langSwitch: "Mudar idioma",

    demoMonth: "Outubro de 2026",
    demoTotal: "Despesas do mês",
    demoFiled: "Classificado",
  },
  fr: {
    navFeatures: "Fonctionnalités",
    navHow: "Comment ça marche",
    navPricing: "Tarifs",
    navFaq: "FAQ",
    navSignin: "Se connecter",
    navStart: "Commencer gratuitement",

    badge: "Comptabilité pour restaurants, cafés et food trucks",
    h1: "Un sac de factures fournisseurs, transformé en chiffres du mois.",
    sub: "SortReceipts lit les factures fournisseurs et les reçus de salle, classe chacun dans une catégorie de coût — aliments, salaires, loyer, commissions de plateforme — et tient à jour recettes, dépenses et marge brute. Tout se passe dans le navigateur, sans rien installer.",
    ctaPrimary: "Commencer gratuitement",
    ctaSecondary: "Voir comment ça marche",
    ctaNote: "5 reçus par mois, gratuit. Sans carte bancaire.",
    proof1: "Sans carte bancaire",
    proof2: "Fonctionne dans tout navigateur",
    proof3: "Export CSV à tout moment",

    stat1Value: "8",
    stat1Label: "catégories de coûts",
    stat2Value: "CSV",
    stat2Label: "export pour votre comptable",
    stat3Value: "0",
    stat3Label: "application à installer",
    stat4Value: "PDF",
    stat4Label: "reçus et photos",

    featuresEyebrow: "Fonctionnalités",
    featuresTitle: "Tout ce qui vient après la photo",
    featuresSub: "Reconnaissance, classement, rapports et questions, au même endroit.",
    f1Title: "Photographiez ou importez",
    f1Desc: "Factures fournisseurs, bons de livraison et reçus ressortent en fournisseur, total, date et taxes. Un relevé mensuel entre en un seul fichier.",
    f2Title: "Classé par type de coût",
    f2Desc: "Chaque facture tombe dans aliments, salaires, loyer, charges ou commissions de plateforme, pour que la structure de coûts reste lisible.",
    f3Title: "Recettes, coûts et marge",
    f3Desc: "Les recettes du jour moins les dépenses enregistrées donnent la marge brute ; la répartition par catégorie et le dossier de fin de mois viennent des mêmes écritures.",
    f4Title: "Interrogez vos comptes",
    f4Desc: "Demandez « combien ai-je dépensé en aliments le mois dernier ? » et la réponse vient de vos propres écritures.",

    howEyebrow: "Comment ça marche",
    howTitle: "Trois étapes, puis ça se tient à jour tout seul",
    howSub: "Pas de tableur à construire, pas de rattrapage hebdomadaire. Ce qui est saisi reste saisi.",

    valueEyebrow: "Ce que ça règle",
    valueTitle: "Le travail dont vous vous passeriez",
    valueSub: "L'essentiel du coût n'est pas la saisie, mais les reçus qu'on laisse s'entasser.",
    v1Title: "Rattrapage de fin de mois",
    v1Desc: "Les reçus attendent le dernier jour. Photographiez-les au fur et à mesure et le mois se clôture seul.",
    v2Title: "Montants tapés deux fois",
    v2Desc: "Fournisseur, montant et date sortent de la photo : rien n'est ressaisi.",
    v3Title: "Ne pas savoir où passe l'argent",
    v3Desc: "Chaque dépense porte une catégorie. Répartition de la dépense et tendance du résultat tiennent sur un écran.",
    v4Title: "Remettre en forme avant le comptable",
    v4Desc: "Exportez le mois en CSV. Excel, Numbers et Sheets l'ouvrent tel quel.",
    valueFit: "Pensé pour les restaurants d'un ou deux établissements, les cafés et les food trucks. Pas un modèle pour tous les secteurs.",

    catEyebrow: "Catégories",
    catTitle: "Chaque facture a sa place",
    catSub: "Une facture de grossiste va dans Aliments et ingrédients, une commission de livraison dans Commissions de plateforme. Huit catégories couvrent la structure de coûts d'un petit restaurant.",

    pricingEyebrow: "Tarifs",
    pricingTitle: "Commencez gratuitement. Passez au payant quand il se rentabilise.",
    pricingSub: "Facturé mois par mois. Annulable à tout moment.",
    planFree: "Gratuit",
    planFreeNote: "Pour démarrer",
    planPro: "Pro",
    planProNote: "Recommandé",
    planBiz: "Entreprise",
    planBizNote: "Tout inclus",
    popular: "Le plus choisi",
    perMonth: "/mois",
    freeLabel: "Gratuit",
    planFreeB1: "5 reçus par mois",
    planFreeB2: "1 projet",
    planFreeB3: "Rapports mensuels de base",
    planProB1: "200 reçus par mois",
    planProB2: "10 projets",
    planProB3: "Analyse IA de l'activité",
    planProB4: "Export CSV",
    planBizB1: "Reçus illimités",
    planBizB2: "Projets illimités",
    planBizB3: "Analyses IA illimitées",
    planBizB4: "Support prioritaire",
    ctaFree: "Commencer gratuitement",
    ctaPro: "Choisir Pro",
    ctaBiz: "Choisir Entreprise",
    pricingNote: "Prix en USD, facturation mensuelle.",

    faqTitle: "Questions fréquentes",
    faqSub: "La version courte. Pour le reste, écrivez-nous après connexion.",

    finalTitle: "Votre prochain reçu pourrait être le dernier que vous tapez",
    finalSub: "Commencez avec l'offre gratuite. Cinq reçus par mois, sans carte.",
    finalCta: "Commencer gratuitement",

    footerTagline: "SortReceipts — chaque reçu à sa place",
    footerRights: "© 2026 SortReceipts. Tous droits réservés.",
    langSwitch: "Changer de langue",

    demoMonth: "Octobre 2026",
    demoTotal: "Dépenses du mois",
    demoFiled: "Classé",
  },
  de: {
    navFeatures: "Funktionen",
    navHow: "So funktioniert's",
    navPricing: "Preise",
    navFaq: "FAQ",
    navSignin: "Anmelden",
    navStart: "Kostenlos starten",

    badge: "Buchhaltung für Restaurants, Cafés und Foodtrucks",
    h1: "Eine Tüte Lieferantenrechnungen wird zu den Zahlen des Monats.",
    sub: "SortReceipts liest Lieferantenrechnungen und Thekenbelege, ordnet jeden einer Kostenkategorie zu — Lebensmittel, Löhne, Miete, Plattformgebühren — und hält Umsatz, Ausgaben und Rohertrag aktuell. Läuft im Browser, ohne App.",
    ctaPrimary: "Kostenlos starten",
    ctaSecondary: "So funktioniert's",
    ctaNote: "5 Belege pro Monat, kostenlos. Ohne Karte.",
    proof1: "Keine Karte nötig",
    proof2: "Läuft in jedem Browser",
    proof3: "Jederzeit als CSV exportieren",

    stat1Value: "8",
    stat1Label: "Kostenkategorien",
    stat2Value: "CSV",
    stat2Label: "Export für Ihre Buchhaltung",
    stat3Value: "0",
    stat3Label: "Apps zu installieren",
    stat4Value: "PDF",
    stat4Label: "Belege und Fotos",

    featuresEyebrow: "Funktionen",
    featuresTitle: "Alles nach dem Foto",
    featuresSub: "Erkennung, Kategorisierung, Berichte und Fragen an einem Ort.",
    f1Title: "Fotografieren oder importieren",
    f1Desc: "Lieferantenrechnungen, Lieferscheine und Thekenbelege kommen als Händler, Summe, Datum und Steuer zurück. Eine Monatsabrechnung geht als eine Datei hinein.",
    f2Title: "Nach Kostentyp einsortiert",
    f2Desc: "Jede Rechnung landet bei Lebensmitteln, Löhnen, Miete, Nebenkosten oder Plattformgebühren, damit die Kostenstruktur lesbar bleibt.",
    f3Title: "Umsatz, Kosten und Rohertrag",
    f3Desc: "Tagesumsatz minus erfasste Ausgaben ergibt den Rohertrag; Kategorienverteilung und Monatsende-Paket folgen aus denselben Belegen.",
    f4Title: "Fragen Sie Ihre Bücher",
    f4Desc: "Fragen Sie „Wie viel habe ich letzten Monat für Lebensmittel ausgegeben?“ und die Antwort stammt aus Ihren eigenen Daten.",

    howEyebrow: "So funktioniert's",
    howTitle: "Drei Schritte, dann hält es sich selbst aktuell",
    howSub: "Keine Tabelle zu bauen, kein wöchentliches Nachholen. Was drin ist, bleibt drin.",

    valueEyebrow: "Was es löst",
    valueTitle: "Die Arbeit, die Sie lieber nicht machen",
    valueSub: "Der Aufwand liegt weniger im Buchen selbst als darin, Belege liegen zu lassen.",
    v1Title: "Nachholen am Monatsende",
    v1Desc: "Belege warten bis zum letzten Tag. Fotografieren Sie sie sofort, schließt der Monat sich selbst.",
    v2Title: "Beträge doppelt eintippen",
    v2Desc: "Händler, Betrag und Datum kommen aus dem Foto, nichts wird erneut eingegeben.",
    v3Title: "Keine Ahnung, wohin das Geld ging",
    v3Desc: "Jede Ausgabe trägt eine Kategorie. Verteilung und Gewinntrend passen auf einen Bildschirm.",
    v4Title: "Vor der Buchhaltung umformatieren",
    v4Desc: "Exportieren Sie den Monat als CSV. Excel, Numbers und Sheets öffnen sie direkt.",
    valueFit: "Gebaut für Restaurants mit einem oder zwei Standorten, Cafés und Foodtrucks. Keine Vorlage für jede Branche.",

    catEyebrow: "Kategorien",
    catTitle: "Jede Rechnung hat ihren Platz",
    catSub: "Eine Großhandelsrechnung geht zu Lebensmittel & Zutaten, eine Lieferplattform-Gebühr zu Plattformgebühren. Acht Kategorien decken die Kostenstruktur eines kleinen Restaurants.",

    pricingEyebrow: "Preise",
    pricingTitle: "Kostenlos starten. Upgraden, wenn es sich trägt.",
    pricingSub: "Monatlich abgerechnet. Jederzeit kündbar.",
    planFree: "Kostenlos",
    planFreeNote: "Zum Starten",
    planPro: "Pro",
    planProNote: "Empfohlen",
    planBiz: "Business",
    planBizNote: "Alles inklusive",
    popular: "Am beliebtesten",
    perMonth: "/Monat",
    freeLabel: "Kostenlos",
    planFreeB1: "5 Belege pro Monat",
    planFreeB2: "1 Projekt",
    planFreeB3: "Basis-Monatsberichte",
    planProB1: "200 Belege pro Monat",
    planProB2: "10 Projekte",
    planProB3: "KI-Analyse des Geschäfts",
    planProB4: "CSV-Export",
    planBizB1: "Unbegrenzte Belege",
    planBizB2: "Unbegrenzte Projekte",
    planBizB3: "Unbegrenzte KI-Analysen",
    planBizB4: "Prioritäts-Support",
    ctaFree: "Kostenlos starten",
    ctaPro: "Pro wählen",
    ctaBiz: "Business wählen",
    pricingNote: "Preise in USD, monatliche Abrechnung.",

    faqTitle: "Häufige Fragen",
    faqSub: "Die kurze Version. Für alles Weitere schreiben Sie uns nach der Anmeldung.",

    finalTitle: "Ihr nächster Beleg könnte der letzte sein, den Sie abtippen",
    finalSub: "Starten Sie kostenlos. Fünf Belege pro Monat, ohne Karte.",
    finalCta: "Kostenlos starten",

    footerTagline: "SortReceipts — jeder Beleg an seinem Platz",
    footerRights: "© 2026 SortReceipts. Alle Rechte vorbehalten.",
    langSwitch: "Sprache wechseln",

    demoMonth: "Oktober 2026",
    demoTotal: "Ausgaben diesen Monat",
    demoFiled: "Einsortiert",
  },
  ja: {
    navFeatures: "機能",
    navHow: "使い方",
    navPricing: "料金",
    navFaq: "よくある質問",
    navSignin: "ログイン",
    navStart: "無料で始める",

    badge: "飲食店・カフェ・キッチンカーのための記帳",
    h1: "仕入れの請求書の束を、その月の数字に。",
    sub: "SortReceipts は仕入れ先の請求書やレシートを読み取り、食材・人件費・家賃・プラットフォーム手数料といった原価カテゴリに分類し、売上・支出・粗利を最新に保ちます。ブラウザで動くので、アプリのインストールは不要です。",
    ctaPrimary: "無料で始める",
    ctaSecondary: "使い方を見る",
    ctaNote: "月 5 枚まで無料・クレジットカード不要",
    proof1: "カード登録不要",
    proof2: "どのブラウザでも動く",
    proof3: "いつでも CSV で書き出し",

    stat1Value: "8",
    stat1Label: "の原価カテゴリ",
    stat2Value: "CSV",
    stat2Label: "書き出して会計へ",
    stat3Value: "0",
    stat3Label: "インストールするアプリ",
    stat4Value: "PDF",
    stat4Label: "レシートも写真も",

    featuresEyebrow: "機能",
    featuresTitle: "写真のあとの作業は、すべてここで",
    featuresSub: "読み取り、分類、レポート、質問までを一か所で。",
    f1Title: "撮影・取り込み",
    f1Desc: "仕入れ先の請求書、納品書、店頭レシートが店名・金額・日付・税額に変わります。月次の明細は 1 ファイルで取り込めます。",
    f2Title: "原価の種類で分類",
    f2Desc: "請求書は食材・人件費・家賃・水道光熱費・プラットフォーム手数料のいずれかに入り、原価構造が読みやすいまま残ります。",
    f3Title: "売上・原価・粗利",
    f3Desc: "日々の売上から記録した支出を引くと粗利になります。カテゴリ別内訳と月末パッケージも同じ記録から作られます。",
    f4Title: "自分の帳簿に聞く",
    f4Desc: "「先月の食材費はいくら？」と聞くと、自分の記録から答えが出ます。",

    howEyebrow: "使い方",
    howTitle: "3 ステップで、あとは自動で最新のまま",
    howSub: "表を作る必要も、毎週まとめて入力する必要もありません。入れたら、入りっぱなしです。",

    valueEyebrow: "解決すること",
    valueTitle: "本当はやりたくない作業",
    valueSub: "手間の多くは記帳そのものではなく、レシートを溜めてからまとめて処理することにあります。",
    v1Title: "月末にまとめて入力",
    v1Desc: "レシートが最後の日まで溜まります。その場で撮れば、月は自然に締まります。",
    v2Title: "金額を二度打ち",
    v2Desc: "店名・金額・日付は写真から読み取るので、再入力はありません。",
    v3Title: "お金がどこへ消えたか分からない",
    v3Desc: "支出には必ずカテゴリが付きます。内訳と利益の推移は 1 画面で見えます。",
    v4Title: "会計に渡す前に整える",
    v4Desc: "月のデータを CSV で書き出し。Excel、Numbers、Sheets でそのまま開けます。",
    valueFit: "1〜2 店舗の飲食店、カフェ、キッチンカー向け。あらゆる業種向けの汎用テンプレートではありません。",

    catEyebrow: "カテゴリ",
    catTitle: "どの請求書にも行き先がある",
    catSub: "卸売の請求書は「食材」へ、配達プラットフォームの手数料は「プラットフォーム手数料」へ。8 つのカテゴリで小さな飲食店の原価構造をカバーします。",

    pricingEyebrow: "料金",
    pricingTitle: "まず無料で。元が取れたらアップグレード。",
    pricingSub: "月単位の請求。いつでも解約できます。",
    planFree: "無料",
    planFreeNote: "お試しに",
    planPro: "Pro",
    planProNote: "おすすめ",
    planBiz: "Business",
    planBizNote: "全機能",
    popular: "人気 No.1",
    perMonth: "/月",
    freeLabel: "無料",
    planFreeB1: "月 5 枚のレシート",
    planFreeB2: "1 プロジェクト",
    planFreeB3: "基本の月次レポート",
    planProB1: "月 200 枚のレシート",
    planProB2: "10 プロジェクト",
    planProB3: "月次の AI 経営分析",
    planProB4: "CSV 書き出し",
    planBizB1: "レシート枚数無制限",
    planBizB2: "プロジェクト数無制限",
    planBizB3: "AI 分析回数無制限",
    planBizB4: "優先サポート",
    ctaFree: "無料で始める",
    ctaPro: "Pro を選ぶ",
    ctaBiz: "Business を選ぶ",
    pricingNote: "価格は USD、月次請求です。",

    faqTitle: "よくある質問",
    faqSub: "まずは短い答えを。それ以外はログイン後にお問い合わせください。",

    finalTitle: "次のレシートを、最後に手入力する 1 枚に",
    finalSub: "無料プランから。月 5 枚、カード登録は不要です。",
    finalCta: "無料で始める",

    footerTagline: "SortReceipts — すべてのレシートを定位置へ",
    footerRights: "© 2026 SortReceipts. All rights reserved.",
    langSwitch: "言語を切り替える",

    demoMonth: "2026 年 10 月",
    demoTotal: "今月の支出",
    demoFiled: "自動分類済み",
  },
  ko: {
    navFeatures: "기능",
    navHow: "사용 방법",
    navPricing: "요금",
    navFaq: "자주 묻는 질문",
    navSignin: "로그인",
    navStart: "무료로 시작",

    badge: "음식점, 카페, 푸드트럭을 위한 장부",
    h1: "공급업체 청구서 한 뭉치를 그 달의 숫자로.",
    sub: "SortReceipts는 공급업체 청구서와 매장 영수증을 읽어 식자재, 인건비, 임대료, 플랫폼 수수료 같은 원가 분류에 넣고 매출·지출·매출총이익을 최신으로 유지합니다. 브라우저에서 바로 쓰고, 앱을 설치할 필요가 없습니다.",
    ctaPrimary: "무료로 시작",
    ctaSecondary: "사용 방법 보기",
    ctaNote: "월 5장 무료 · 카드 등록 없음",
    proof1: "카드 불필요",
    proof2: "어떤 브라우저에서도",
    proof3: "언제든 CSV 내보내기",

    stat1Value: "8",
    stat1Label: "개 원가 분류",
    stat2Value: "CSV",
    stat2Label: "회계용으로 내보내기",
    stat3Value: "0",
    stat3Label: "설치할 앱",
    stat4Value: "PDF",
    stat4Label: "영수증과 사진",

    featuresEyebrow: "기능",
    featuresTitle: "사진 이후의 일은 모두 여기서",
    featuresSub: "인식, 분류, 보고서, 질문까지 한곳에서.",
    f1Title: "촬영 또는 가져오기",
    f1Desc: "공급업체 청구서, 납품서, 매장 영수증이 상호·금액·날짜·세액으로 바뀝니다. 월별 명세서는 한 파일로 가져옵니다.",
    f2Title: "원가 유형으로 분류",
    f2Desc: "청구서가 식자재, 인건비, 임대료, 공과금, 플랫폼 수수료 중 하나로 들어가 원가 구조가 읽히게 남습니다.",
    f3Title: "매출·원가·매출총이익",
    f3Desc: "일별 매출에서 기록된 지출을 빼면 매출총이익이 됩니다. 분류별 비중과 월말 패키지도 같은 기록에서 나옵니다.",
    f4Title: "장부에 그냥 물어보기",
    f4Desc: "“지난달 식자재에 얼마 썼어?”라고 물으면 내 기록에서 답이 나옵니다.",

    howEyebrow: "사용 방법",
    howTitle: "세 단계면 그다음은 알아서 최신",
    howSub: "표를 만들 필요도, 매주 몰아서 입력할 필요도 없습니다. 들어간 것은 그대로 남습니다.",

    valueEyebrow: "해결하는 것",
    valueTitle: "하고 싶지 않은 일",
    valueSub: "수고의 대부분은 기록 자체보다 영수증을 쌓아 두는 데 있습니다.",
    v1Title: "월말에 몰아서 입력",
    v1Desc: "영수증이 마지막 날까지 쌓입니다. 그때그때 찍으면 월은 저절로 마감됩니다.",
    v2Title: "금액을 두 번 입력",
    v2Desc: "상호, 금액, 날짜는 사진에서 읽어 오므로 다시 입력할 것이 없습니다.",
    v3Title: "돈이 어디로 갔는지 모름",
    v3Desc: "모든 지출에 분류가 붙습니다. 지출 비중과 이익 추이는 한 화면에 들어옵니다.",
    v4Title: "회계사에게 넘기기 전 정리",
    v4Desc: "월 데이터를 CSV로 내보냅니다. Excel, Numbers, Sheets에서 바로 열립니다.",
    valueFit: "1~2개 매장 음식점, 카페, 푸드트럭을 위해 만들었습니다. 모든 업종을 위한 범용 템플릿은 아닙니다.",

    catEyebrow: "분류",
    catTitle: "모든 청구서에는 갈 곳이 있다",
    catSub: "도매 청구서는 '식자재'로, 배달 플랫폼 수수료는 '플랫폼 수수료'로 갑니다. 8개 분류가 작은 음식점의 원가 구조를 덮습니다.",

    pricingEyebrow: "요금",
    pricingTitle: "무료로 시작하고, 값어치가 되면 올리세요.",
    pricingSub: "월 단위 결제. 언제든 해지할 수 있습니다.",
    planFree: "무료",
    planFreeNote: "시작용",
    planPro: "Pro",
    planProNote: "추천",
    planBiz: "Business",
    planBizNote: "모든 기능",
    popular: "가장 인기",
    perMonth: "/월",
    freeLabel: "무료",
    planFreeB1: "월 5장 영수증",
    planFreeB2: "프로젝트 1개",
    planFreeB3: "기본 월별 보고서",
    planProB1: "월 200장 영수증",
    planProB2: "프로젝트 10개",
    planProB3: "월별 AI 경영 분석",
    planProB4: "CSV 내보내기",
    planBizB1: "영수증 무제한",
    planBizB2: "프로젝트 무제한",
    planBizB3: "AI 분석 무제한",
    planBizB4: "우선 지원",
    ctaFree: "무료로 시작",
    ctaPro: "Pro 선택",
    ctaBiz: "Business 선택",
    pricingNote: "가격은 USD 기준, 월 결제입니다.",

    faqTitle: "자주 묻는 질문",
    faqSub: "짧은 답부터. 그 밖의 문의는 로그인 후에 보내 주세요.",

    finalTitle: "다음 영수증은 직접 입력하는 마지막 한 장이 될 수 있습니다",
    finalSub: "무료 플랜으로 시작하세요. 월 5장, 카드 등록 없음.",
    finalCta: "무료로 시작",

    footerTagline: "SortReceipts — 모든 영수증을 제자리에",
    footerRights: "© 2026 SortReceipts. All rights reserved.",
    langSwitch: "언어 변경",

    demoMonth: "2026년 10월",
    demoTotal: "이번 달 지출",
    demoFiled: "자동 분류됨",
  },
};

