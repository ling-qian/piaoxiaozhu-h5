/**
 * 落地页的内容数据。
 *
 * 分类、常见问题和使用流程放在这里，而不是 i18n.ts：这三份内容同时被页面和
 * JSON-LD 使用，只有一处来源才能保证结构化数据和页面上显示的文字一致。
 */

import type { LandingLocale } from "@/lib/locales";

/**
 * 分类模板：小餐饮店的八类成本。
 *
 * 与后端 `CATEGORY_L1_MAP_INTL`、前端 `lib/constants.ts` 的 `CATEGORIES`
 * 保持同一套 code 和同一组中文名。这里只负责展示文案，数量固定为八，
 * 不做行业切换——模板就是按一家小店排的。
 */
export const CATEGORY_LIST: Record<LandingLocale, string>[] = [
  {
    en: "Food & ingredients",
    zh: "食材采购",
    es: "Comida e ingredientes",
    pt: "Alimentos e ingredientes",
    fr: "Aliments et ingrédients",
    de: "Lebensmittel & Zutaten",
    ja: "食材",
    ko: "식자재",
  },
  {
    en: "Payroll",
    zh: "工资",
    es: "Nómina",
    pt: "Folha de pagamento",
    fr: "Salaires",
    de: "Löhne",
    ja: "人件費",
    ko: "인건비",
  },
  {
    en: "Rent",
    zh: "房租",
    es: "Alquiler",
    pt: "Aluguel",
    fr: "Loyer",
    de: "Miete",
    ja: "家賃",
    ko: "임대료",
  },
  {
    en: "Utilities",
    zh: "水电燃气",
    es: "Suministros",
    pt: "Utilidades",
    fr: "Eau, électricité, gaz",
    de: "Nebenkosten",
    ja: "水道光熱費",
    ko: "공과금",
  },
  {
    en: "Platform fees",
    zh: "平台服务费",
    es: "Comisiones de plataforma",
    pt: "Taxas de plataforma",
    fr: "Commissions de plateforme",
    de: "Plattformgebühren",
    ja: "プラットフォーム手数料",
    ko: "플랫폼 수수료",
  },
  {
    en: "Advertising",
    zh: "广告推广",
    es: "Publicidad",
    pt: "Publicidade",
    fr: "Publicité",
    de: "Werbung",
    ja: "広告・販促",
    ko: "광고·마케팅",
  },
  {
    en: "Office supplies",
    zh: "办公用品",
    es: "Material de oficina",
    pt: "Material de escritório",
    fr: "Fournitures de bureau",
    de: "Bürobedarf",
    ja: "事務用品",
    ko: "사무용품",
  },
  {
    en: "Other",
    zh: "其他",
    es: "Otros",
    pt: "Outros",
    fr: "Autres",
    de: "Sonstiges",
    ja: "その他",
    ko: "기타",
  },
];

export interface FaqEntry {
  q: Record<LandingLocale, string>;
  a: Record<LandingLocale, string>;
}

export const FAQ_LIST: FaqEntry[] = [
  {
    q: {
      en: "What is SortReceipts?",
      zh: "SortReceipts 是什么？",
      es: "¿Qué es SortReceipts?",
      pt: "O que é o SortReceipts?",
      fr: "Qu'est-ce que SortReceipts ?",
      de: "Was ist SortReceipts?",
      ja: "SortReceipts とは何ですか？",
      ko: "SortReceipts는 무엇인가요?",
    },
    a: {
      en: "A browser-based receipt scanner and cost tracker for small restaurants, cafés and food trucks. You photograph a supplier invoice, delivery slip or receipt, it reads the vendor, amount, date and tax, files the cost under one of eight restaurant categories, and keeps monthly revenue, expenses and gross margin up to date.",
      zh: "一个在浏览器里用的小餐饮记账工具，面向餐馆、咖啡店和餐车。你拍一张供应商发票、送货单或小票，它读出商户、金额、日期和税额，把成本归到八个餐饮分类之一，并持续更新当月营业额、支出和毛利。",
      es: "Un escáner de recibos y control de costes en el navegador para restaurantes, cafeterías y food trucks. Fotografías una factura de proveedor, un albarán o un recibo, lee proveedor, importe, fecha e impuestos, clasifica el coste en una de ocho categorías y mantiene al día ingresos, gastos y margen bruto del mes.",
      pt: "Um scanner de recibos e controle de custos no navegador para restaurantes, cafeterias e food trucks. Você fotografa uma nota de fornecedor, um romaneio ou um recibo, ele lê fornecedor, valor, data e impostos, classifica o custo em uma de oito categorias e mantém receita, despesas e margem bruta em dia.",
      fr: "Un scanner de reçus et un suivi de coûts dans le navigateur, pour les restaurants, cafés et food trucks. Vous photographiez une facture fournisseur, un bon de livraison ou un reçu : il lit le fournisseur, le montant, la date et les taxes, classe le coût dans l'une des huit catégories et tient à jour recettes, dépenses et marge brute du mois.",
      de: "Ein Belegscanner und eine Kostenverfolgung im Browser für Restaurants, Cafés und Foodtrucks. Sie fotografieren eine Lieferantenrechnung, einen Lieferschein oder einen Beleg; er liest Händler, Betrag, Datum und Steuer, ordnet die Kosten einer von acht Restaurantkategorien zu und hält Umsatz, Ausgaben und Rohertrag des Monats aktuell.",
      ja: "飲食店・カフェ・キッチンカー向けの、ブラウザで動くレシート読み取りと原価管理のツールです。仕入れ先の請求書や納品書、レシートを撮ると、店名・金額・日付・税額を読み取り、8 つの飲食店カテゴリのいずれかに分類し、当月の売上・支出・粗利を最新に保ちます。",
      ko: "음식점, 카페, 푸드트럭을 위한 브라우저 기반 영수증 인식·원가 관리 도구입니다. 공급업체 청구서나 납품서, 영수증을 찍으면 상호, 금액, 날짜, 세액을 읽어 8개 음식점 분류 중 하나로 넣고 이번 달 매출·지출·매출총이익을 최신으로 유지합니다.",
    },
  },
  {
    q: {
      en: "Is it built for restaurants, or for any business?",
      zh: "它只适合餐饮店，还是什么生意都能用？",
      es: "¿Está pensado para restaurantes o para cualquier negocio?",
      pt: "Ele foi feito para restaurantes ou para qualquer negócio?",
      fr: "Est-il conçu pour les restaurants ou pour toute entreprise ?",
      de: "Ist es für Restaurants gedacht oder für jedes Geschäft?",
      ja: "飲食店向けですか、それとも業種を問わず使えますか？",
      ko: "음식점만을 위한 건가요, 아니면 모든 업종이 쓸 수 있나요?",
    },
    a: {
      en: "It is built for small restaurants, cafés and food trucks. The eight categories — food, payroll, rent, utilities, platform fees, advertising, office supplies and other — match a food business's cost structure. Other businesses can use it, but a shop that resells stock will file most purchases under Other.",
      zh: "它按小餐饮店设计，适合餐馆、咖啡店和餐车。八个分类——食材、工资、房租、水电燃气、平台服务费、广告推广、办公用品和其他——正好是一家餐饮店的成本结构。别的行业也能用，但进货转卖的店会有很多支出落进「其他」。",
      es: "Está pensado para restaurantes, cafeterías y food trucks pequeños. Las ocho categorías —comida, nómina, alquiler, suministros, comisiones de plataforma, publicidad, material de oficina y otros— corresponden a la estructura de costes de un negocio de alimentación. Otros negocios pueden usarlo, pero una tienda que revende mercancía acabará en Otros.",
      pt: "Foi feito para restaurantes, cafeterias e food trucks pequenos. As oito categorias —alimentos, folha, aluguel, utilidades, taxas de plataforma, publicidade, material de escritório e outros— correspondem à estrutura de custos de um negócio de alimentação. Outros negócios podem usar, mas uma loja que revende mercadoria vai cair em Outros.",
      fr: "Il est conçu pour les petits restaurants, cafés et food trucks. Les huit catégories — aliments, salaires, loyer, charges, commissions de plateforme, publicité, fournitures et autres — correspondent à la structure de coûts d'une activité de restauration. D'autres activités peuvent l'utiliser, mais un commerce qui revend des marchandises classera l'essentiel dans Autres.",
      de: "Es ist für kleine Restaurants, Cafés und Foodtrucks gebaut. Die acht Kategorien — Lebensmittel, Löhne, Miete, Nebenkosten, Plattformgebühren, Werbung, Bürobedarf und Sonstiges — entsprechen der Kostenstruktur eines Gastronomiebetriebs. Andere Branchen können es nutzen, aber ein Händler, der Ware weiterverkauft, landet überwiegend bei Sonstiges.",
      ja: "小規模な飲食店・カフェ・キッチンカー向けに作っています。8 つのカテゴリ——食材、人件費、家賃、水道光熱費、プラットフォーム手数料、広告、事務用品、その他——が飲食店の原価構造に合っています。他の業種でも使えますが、仕入れて売る小売店は多くの支出が「その他」に入ります。",
      ko: "소규모 음식점, 카페, 푸드트럭을 위해 만들었습니다. 8개 분류 — 식자재, 인건비, 임대료, 공과금, 플랫폼 수수료, 광고, 사무용품, 기타 — 가 음식점의 원가 구조와 맞습니다. 다른 업종도 쓸 수 있지만, 사입해서 파는 소매점은 대부분의 지출이 '기타'로 갑니다.",
    },
  },
  {
    q: {
      en: "Which receipts can it read?",
      zh: "能识别哪些票据？",
      es: "¿Qué recibos puede leer?",
      pt: "Quais recibos ele lê?",
      fr: "Quels reçus peut-il lire ?",
      de: "Welche Belege kann es lesen?",
      ja: "どんなレシートを読み取れますか？",
      ko: "어떤 영수증을 읽을 수 있나요?",
    },
    a: {
      en: "Printed supplier invoices, delivery slips and receipts, as photos or PDFs, up to 15 MB per file. Handwritten notes and badly lit photos are less reliable — check the fields before you save.",
      zh: "打印出来的供应商发票、送货单和小票，照片或 PDF 都可以，单个文件不超过 15MB。手写字迹和光线很差的照片识别效果差一些，保存前请核对字段。",
      es: "Facturas de proveedor, albaranes y recibos impresos, como fotos o PDF, hasta 15 MB por archivo. Las notas manuscritas y las fotos con mala luz son menos fiables: revisa los campos antes de guardar.",
      pt: "Notas de fornecedor, romaneios e recibos impressos, em foto ou PDF, até 15 MB por arquivo. Textos à mão e fotos mal iluminadas são menos confiáveis — confira os campos antes de salvar.",
      fr: "Factures fournisseurs, bons de livraison et reçus imprimés, en photo ou PDF, jusqu'à 15 Mo par fichier. Les notes manuscrites et les photos mal éclairées sont moins fiables : vérifiez les champs avant d'enregistrer.",
      de: "Gedruckte Lieferantenrechnungen, Lieferscheine und Belege als Foto oder PDF, bis 15 MB pro Datei. Handschriftliches und schlecht beleuchtete Fotos sind unzuverlässiger — prüfen Sie die Felder vor dem Speichern.",
      ja: "印刷された仕入れ先の請求書、納品書、レシートを、写真または PDF で、1 ファイル 15MB まで。手書きのメモや暗い写真は精度が落ちるので、保存前に項目を確認してください。",
      ko: "인쇄된 공급업체 청구서, 납품서, 영수증을 사진 또는 PDF로, 파일당 15MB까지. 손글씨나 어두운 사진은 정확도가 떨어지므로 저장 전에 항목을 확인하세요.",
    },
  },
  {
    q: {
      en: "Do I need to install an app?",
      zh: "需要装 App 吗？",
      es: "¿Necesito instalar una app?",
      pt: "Preciso instalar um aplicativo?",
      fr: "Faut-il installer une application ?",
      de: "Brauche ich eine App?",
      ja: "アプリのインストールは必要ですか？",
      ko: "앱을 설치해야 하나요?",
    },
    a: {
      en: "No. SortReceipts runs in a mobile or desktop browser. Uploading, reviewing and exporting all happen on the web page, and the layout is built for a phone in one hand.",
      zh: "不需要。手机或电脑的浏览器打开就能用，上传、核对和导出都在网页里完成，界面按单手拿手机的尺寸设计。",
      es: "No. SortReceipts funciona en el navegador del móvil o del ordenador. Subir, revisar y exportar ocurre en la página, y el diseño está pensado para llevar el móvil en una mano.",
      pt: "Não. O SortReceipts roda no navegador do celular ou do computador. Enviar, revisar e exportar acontece na própria página, e o layout foi feito para usar o celular com uma mão.",
      fr: "Non. SortReceipts fonctionne dans le navigateur, sur mobile ou ordinateur. L'import, la vérification et l'export se font dans la page, et la mise en page est pensée pour un téléphone tenu d'une main.",
      de: "Nein. SortReceipts läuft im Browser auf Handy oder Rechner. Hochladen, prüfen und exportieren passiert auf der Seite selbst, und das Layout ist für ein Handy in einer Hand gebaut.",
      ja: "不要です。スマホやパソコンのブラウザで動きます。アップロード、確認、書き出しはすべてウェブページ内で完結し、片手で持つスマホに合わせたレイアウトです。",
      ko: "아니요. 휴대폰이나 컴퓨터 브라우저에서 바로 실행됩니다. 업로드, 확인, 내보내기가 모두 웹페이지에서 이루어지고, 한 손으로 든 휴대폰에 맞춘 화면입니다.",
    },
  },
  {
    q: {
      en: "Where is my data stored?",
      zh: "我的数据存放在哪里？",
      es: "¿Dónde se guardan mis datos?",
      pt: "Onde ficam meus dados?",
      fr: "Où sont stockées mes données ?",
      de: "Wo liegen meine Daten?",
      ja: "データはどこに保存されますか？",
      ko: "내 데이터는 어디에 저장되나요?",
    },
    a: {
      en: "Records are stored on Cloudflare infrastructure and encrypted in transit. Reports export to CSV so you keep a copy, and you can delete records from your account.",
      zh: "记录存放在 Cloudflare 的服务器上，传输过程加密。报表可以导出 CSV，让你手里有副本；账户里的记录也可以删除。",
      es: "Los registros se guardan en la infraestructura de Cloudflare y se cifran en tránsito. Los informes se exportan a CSV para que tengas una copia, y puedes borrar registros desde tu cuenta.",
      pt: "Os registros ficam na infraestrutura da Cloudflare e são criptografados em trânsito. Os relatórios podem ser exportados em CSV para você guardar uma cópia, e você pode excluir registros na sua conta.",
      fr: "Les données sont stockées sur l'infrastructure Cloudflare et chiffrées en transit. Les rapports s'exportent en CSV pour que vous en gardiez une copie, et vous pouvez supprimer des enregistrements depuis votre compte.",
      de: "Die Daten liegen auf Cloudflare-Infrastruktur und werden bei der Übertragung verschlüsselt. Berichte lassen sich als CSV exportieren, damit Sie eine Kopie behalten, und Sie können Einträge in Ihrem Konto löschen.",
      ja: "記録は Cloudflare の基盤に保存され、通信は暗号化されます。レポートは CSV で書き出せるので手元に控えを残せますし、アカウントから記録を削除できます。",
      ko: "기록은 Cloudflare 인프라에 저장되고 전송 구간이 암호화됩니다. 보고서는 CSV로 내보내 사본을 남길 수 있고, 계정에서 기록을 삭제할 수 있습니다.",
    },
  },
  {
    q: {
      en: "How much does it cost?",
      zh: "多少钱？",
      es: "¿Cuánto cuesta?",
      pt: "Quanto custa?",
      fr: "Combien ça coûte ?",
      de: "Was kostet es?",
      ja: "料金はいくらですか？",
      ko: "요금은 얼마인가요?",
    },
    a: {
      en: "The free plan covers 5 receipts a month and one project. Pro is $3.99 a month for 200 receipts, 10 projects, AI reviews and CSV export. Business is $13.99 a month with no receipt or project limit.",
      zh: "免费版每月 5 张票据、1 个项目。专业版每月 $3.99，含 200 张票据、10 个项目、AI 经营分析和 CSV 导出。企业版每月 $13.99，票据和项目都不限。",
      es: "El plan gratis incluye 5 recibos al mes y un proyecto. Pro cuesta $3.99 al mes con 200 recibos, 10 proyectos, análisis con IA y exportación a CSV. Negocio cuesta $13.99 al mes, sin límite de recibos ni de proyectos.",
      pt: "O plano grátis cobre 5 recibos por mês e um projeto. O Pro custa $3.99 por mês com 200 recibos, 10 projetos, análise com IA e exportação em CSV. O Negócio custa $13.99 por mês, sem limite de recibos ou projetos.",
      fr: "L'offre gratuite couvre 5 reçus par mois et un projet. Pro coûte $3.99 par mois : 200 reçus, 10 projets, analyses IA et export CSV. Entreprise coûte $13.99 par mois, sans limite de reçus ni de projets.",
      de: "Der kostenlose Plan umfasst 5 Belege pro Monat und ein Projekt. Pro kostet 3,99 $ pro Monat mit 200 Belegen, 10 Projekten, KI-Analysen und CSV-Export. Business kostet 13,99 $ pro Monat ohne Limit bei Belegen und Projekten.",
      ja: "無料プランは月 5 枚のレシートと 1 プロジェクト。Pro は月 $3.99 で 200 枚、10 プロジェクト、AI 分析、CSV 書き出しが付きます。Business は月 $13.99 でレシートもプロジェクトも無制限です。",
      ko: "무료 플랜은 월 5장과 프로젝트 1개를 제공합니다. Pro는 월 $3.99로 200장, 프로젝트 10개, AI 분석, CSV 내보내기가 포함됩니다. Business는 월 $13.99이며 영수증과 프로젝트에 제한이 없습니다.",
    },
  },
  {
    q: {
      en: "Can I hand the numbers to my accountant?",
      zh: "能把数据交给会计吗？",
      es: "¿Puedo pasar las cifras a mi contador?",
      pt: "Posso entregar os números ao meu contador?",
      fr: "Puis-je transmettre les chiffres à mon comptable ?",
      de: "Kann ich die Zahlen an meine Buchhaltung geben?",
      ja: "会計担当に数字を渡せますか？",
      ko: "숫자를 회계 담당자에게 넘길 수 있나요?",
    },
    a: {
      en: "Yes. Monthly reports export as CSV, which Excel, Numbers and Google Sheets all open. Each project keeps its own records, so one export covers one store.",
      zh: "可以。月度报表能导出 CSV，Excel、Numbers 和 Google Sheets 都能打开。每个项目的账目各自独立，一次导出一家店的记录。",
      es: "Sí. Los informes mensuales se exportan en CSV, que Excel, Numbers y Google Sheets abren. Cada proyecto lleva sus propios registros, así que una exportación cubre una tienda.",
      pt: "Sim. Os relatórios mensais são exportados em CSV, que Excel, Numbers e Google Sheets abrem. Cada projeto mantém os próprios registros, então uma exportação cobre uma loja.",
      fr: "Oui. Les rapports mensuels s'exportent en CSV, que Excel, Numbers et Google Sheets ouvrent. Chaque projet garde ses propres écritures : un export couvre un établissement.",
      de: "Ja. Monatsberichte lassen sich als CSV exportieren, das Excel, Numbers und Google Sheets öffnen. Jedes Projekt führt eigene Bücher, ein Export deckt also einen Standort ab.",
      ja: "はい。月次レポートは CSV で書き出せ、Excel、Numbers、Google Sheets で開けます。プロジェクトごとに帳簿が独立しているので、1 回の書き出しで 1 店舗分になります。",
      ko: "네. 월별 보고서를 CSV로 내보낼 수 있고 Excel, Numbers, Google Sheets에서 열립니다. 프로젝트마다 장부가 따로 있어 한 번 내보내면 한 매장 분량이 됩니다.",
    },
  },
];

export interface StepEntry {
  title: Record<LandingLocale, string>;
  text: Record<LandingLocale, string>;
}

/**
 * 使用流程。页面和 JSON-LD 的 HowTo 共用这一份，改动只需改一处。
 */
export const HOW_STEPS: StepEntry[] = [
  {
    title: {
      en: "Create a project for the shop",
      zh: "给门店建一个项目",
      es: "Crea un proyecto para el local",
      pt: "Crie um projeto para o restaurante",
      fr: "Créez un projet pour l'établissement",
      de: "Projekt für den Betrieb anlegen",
      ja: "店舗ごとにプロジェクトを作る",
      ko: "매장별 프로젝트 만들기",
    },
    text: {
      en: "One project is one restaurant or café, with its own books. A second location gets a second project.",
      zh: "一个项目对应一家店，账目各自独立。开第二家店就再建一个。",
      es: "Un proyecto es un restaurante o una cafetería, con sus propias cuentas. Un segundo local pide un segundo proyecto.",
      pt: "Um projeto é um restaurante ou cafeteria, com contas próprias. Um segundo endereço pede um segundo projeto.",
      fr: "Un projet, c'est un restaurant ou un café, avec ses propres comptes. Un deuxième établissement demande un deuxième projet.",
      de: "Ein Projekt ist ein Restaurant oder Café mit eigenen Büchern. Ein zweiter Standort bekommt ein zweites Projekt.",
      ja: "1 プロジェクトは 1 店舗分の帳簿です。2 店舗目は 2 つ目のプロジェクトになります。",
      ko: "프로젝트 하나가 음식점이나 카페 한 곳의 장부입니다. 두 번째 매장은 두 번째 프로젝트로 만듭니다.",
    },
  },
  {
    title: {
      en: "Snap invoices, or import a supplier statement",
      zh: "拍票据，或整张导入对账单",
      es: "Fotografía facturas o importa un extracto",
      pt: "Fotografe notas ou importe um extrato",
      fr: "Photographiez les factures ou importez un relevé",
      de: "Rechnungen fotografieren oder Abrechnung importieren",
      ja: "請求書を撮る、または明細をまとめて取り込む",
      ko: "청구서를 찍거나 명세서를 한 번에 가져오기",
    },
    text: {
      en: "Photograph supplier invoices, delivery slips and counter receipts, or import a monthly statement as one file and confirm its lines in one pass.",
      zh: "供应商发票、送货单和柜台小票可以拍照；整张月度对账单一次导入，核对一遍就能整批入账。",
      es: "Fotografía facturas de proveedor, albaranes y recibos, o importa un extracto mensual en un solo archivo y confirma sus líneas de una vez.",
      pt: "Fotografe notas de fornecedor, romaneios e recibos, ou importe um extrato mensal em um arquivo e confirme as linhas de uma vez.",
      fr: "Photographiez factures fournisseurs, bons de livraison et reçus, ou importez un relevé mensuel en un fichier et validez ses lignes d'un coup.",
      de: "Lieferantenrechnungen, Lieferscheine und Thekenbelege fotografieren oder eine Monatsabrechnung als eine Datei importieren und die Zeilen in einem Durchgang bestätigen.",
      ja: "仕入れ先の請求書、納品書、店頭レシートを撮影。月次の明細は 1 ファイルで取り込み、明細を一度に確認して計上できます。",
      ko: "공급업체 청구서, 납품서, 매장 영수증을 찍거나 월별 명세서를 한 파일로 가져와 항목을 한 번에 확인합니다.",
    },
  },
  {
    title: {
      en: "Read revenue, cost and margin",
      zh: "看营业额、成本和毛利",
      es: "Lee ingresos, coste y margen",
      pt: "Leia receita, custo e margem",
      fr: "Lisez recettes, coûts et marge",
      de: "Umsatz, Kosten und Rohertrag lesen",
      ja: "売上・原価・粗利を見る",
      ko: "매출·원가·매출총이익 보기",
    },
    text: {
      en: "Enter daily revenue; the report sets food, payroll and rent against it and exports the month as a pack for your accountant.",
      zh: "按天记营业额，报表把食材、工资和房租与它对起来，月底导出交付包给会计。",
      es: "Anota los ingresos diarios; el informe los compara con comida, nómina y alquiler, y exporta el mes como paquete para tu contador.",
      pt: "Lance a receita do dia; o relatório compara com alimentos, folha e aluguel, e exporta o mês como pacote para o contador.",
      fr: "Saisissez les recettes du jour ; le rapport les compare aux aliments, salaires et loyer, puis exporte le mois en dossier pour votre comptable.",
      de: "Täglichen Umsatz eintragen; der Bericht stellt ihn Lebensmitteln, Löhnen und Miete gegenüber und exportiert den Monat als Paket für die Buchhaltung.",
      ja: "日々の売上を入力すると、食材・人件費・家賃と突き合わせて表示し、月末には会計向けのパッケージとして書き出せます。",
      ko: "일별 매출을 입력하면 식자재, 인건비, 임대료와 함께 보여 주고, 월말에는 회계용 패키지로 내보냅니다.",
    },
  },
];

/** 页面上展示的常见问题，按当前语言取值 */
export function faqFor(locale: LandingLocale) {
  return FAQ_LIST.map((item) => ({ q: item.q[locale], a: item.a[locale] }));
}
