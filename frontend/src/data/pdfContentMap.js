const pdfContentMap = {
  accounts: {
    title: "NRI and Digital Account Access",
    description:
      "NRI account management, overseas remittance support, and profile update flows are treated as core account journeys.",
    highlights: [
      "NRE/NRO account servicing with online onboarding support.",
      "Remittance and foreign-income management assistance for global customers.",
      "Profile updates such as signature, nominee, PAN, name change, and mobile updation.",
      "Open subsequent NRE, account type conversion, and resident-holder linking support.",
    ],
    metrics: ["11,00,000+ NRI trust references", "24x7 support channels", "Global remittance access"],
  },
  investments: {
    title: "High-Net-Worth and Wealth Focus",
    description:
      "Dedicated wealth relationships, premium support, and customized investment decisions are provided for affluent users.",
    highlights: [
      "Dedicated wealth manager engagement for HNI customers.",
      "Relationship-led pricing and financial advisory access.",
      "Portfolio-oriented banking and investment workflows with FAQ-driven onboarding.",
    ],
    metrics: ["Dedicated wealth support", "Premium service model", "Personalized investment assistance"],
  },
  loans: {
    title: "Agri and Structured Financing",
    description:
      "Loan journeys include retail and agri-focused financing with tenure-led planning and EMI-first decision support.",
    highlights: [
      "Tractor and allied financing with flexible repayment tenure.",
      "EMI calculator-led borrowing decisions for clarity before application.",
      "Scheme-aligned support for rural and agri-banking segments including crop cover.",
      "Funding pathways for fishery, dairy, poultry, and horticulture activity.",
    ],
    metrics: ["12 to 84 month tenure references", "EMI planning emphasis", "Agri and allied financing"],
  },
  cards: {
    title: "Business and Usage Scale",
    description:
      "Card and payments narratives are tied to everyday consumer journeys and MSME business operations.",
    highlights: [
      "Business and credit card usage for operational spend control.",
      "Reward and transaction visibility for personal and enterprise use.",
      "Cross-channel card servicing through digital banking touchpoints.",
      "Farmer-focused RuPay card and card hotlist/reissue workflows.",
    ],
    metrics: ["20 Lakh+ business card references", "Unified payment journeys", "Digital card servicing"],
  },
  wholesale: {
    title: "Wholesale and Institutional Banking",
    description:
      "Enterprise banking focuses on CBX internet banking, institutional onboarding, and API-driven transaction scale.",
    highlights: [
      "CBX internet banking for high-volume corporate transactions.",
      "Products mapped for corporates, government, and financial institutions.",
      "Investment banking and capital support integrated into one wholesale journey.",
    ],
    metrics: ["40 Lakh+ active users references", "2.8 Cr+ API transactions references", "1.45 Lakh+ institutional customers"],
  },
  msme: {
    title: "MSME and Business Banking",
    description:
      "Business banking pages focus on MSME current accounts, working capital, business cards, and growth schemes.",
    highlights: [
      "One-place business banking for transactions, cards, and finance.",
      "Working capital and business card support for everyday operations.",
      "MSME solution stack aligned with growth and expansion journeys.",
    ],
    metrics: ["20 Lakh+ business credit cards references", "Current account + loan mix", "MSME growth solution framing"],
  },
  "government-schemes": {
    title: "Government Scheme Integration",
    description:
      "PM FME, CGTMSE, PMEGP, and startup guarantee style schemes are integrated within business and agri flows.",
    highlights: [
      "Scheme-linked onboarding for eligible business segments.",
      "Credit guarantee-backed financing support models.",
      "Government program discovery directly within banking journeys.",
    ],
    metrics: ["PM FME references", "CGTMSE references", "PMEGP and startup guarantee references"],
  },
  "trade-services": {
    title: "Global Trade and Forex Services",
    description:
      "Export/import trade pages include specialist support, bill discounting, buyers credit, and multi-currency funding.",
    highlights: [
      "Export and import service workflows under one trade stack.",
      "Bill discounting and buyers credit to improve business liquidity.",
      "Trade specialist assistance and competitive forex support.",
    ],
    metrics: ["22+ currency references", "Pre and post shipment funding", "Trade specialist-assisted journeys"],
  },
  support: {
    title: "Discover, Contact, Resolve",
    description:
      "Support discoverability is prioritized through EVA/chat/call/locate workflows and branch visibility.",
    highlights: [
      "Call, chat, and branch-locator-first support model.",
      "Customer assistance accessible across geographies.",
      "Service request and guidance entry points from one support layer.",
      "EVA and NRI mailbox touchpoints for quick issue routing.",
    ],
    metrics: ["EVA-first support pattern", "Branch locator coverage", "Contact channels always visible"],
  },
  regulatory: {
    title: "Compliance and Trust Signals",
    description:
      "Policy links and registration mentions (including DICGC references) are consistently surfaced as trust and compliance markers.",
    highlights: [
      "Policy visibility: privacy, terms, cookie, and consent links.",
      "Regulatory trust messages integrated into service navigation.",
      "Clear disclosure pathways for users before product decisions.",
    ],
    metrics: ["DICGC mention continuity", "Policy-first footer links", "Regulatory disclosure access"],
  },
};

export const brochureSegments = [
  { key: "accounts", label: "NRI" },
  { key: "investments", label: "HNI" },
  { key: "wholesale", label: "Wholesale" },
  { key: "trade-services", label: "Trade" },
  { key: "cards", label: "Cards" },
  { key: "msme", label: "MSME" },
  { key: "loans", label: "Agri Loans" },
  { key: "government-schemes", label: "Schemes" },
  { key: "support", label: "Support" },
  { key: "regulatory", label: "Compliance" },
];

export default pdfContentMap;
