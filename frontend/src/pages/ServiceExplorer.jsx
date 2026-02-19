import React, { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import HomeNavbar from "../components/home/HomeNavbar";
import serviceCatalog from "../data/serviceCatalog";
import pdfContentMap, { brochureSegments } from "../data/pdfContentMap";
import "./ServiceExplorer.css";

const toTitle = (value = "") =>
  value
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const formatInr = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const sanitizeNumericInput = (value, allowDecimal = false) => {
  const raw = String(value || "");
  const cleaned = raw.replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, "");
  if (!allowDecimal) return cleaned;
  const [integer = "", ...rest] = cleaned.split(".");
  const decimal = rest.join("");
  return rest.length ? `${integer}.${decimal}` : integer;
};

const calculatorConfigs = {
  "emi-calculator": {
    label: "EMI Calculator",
    subtitle: "Estimate monthly EMI for loans.",
    fields: [
      { key: "amount", label: "Loan Amount (Rs)", placeholder: "500000", allowDecimal: false },
      { key: "annualRate", label: "Interest % (Yearly)", placeholder: "9.5", allowDecimal: true },
      { key: "tenureMonths", label: "Tenure (Months)", placeholder: "60", allowDecimal: false },
    ],
  },
  "fd-calculator": {
    label: "FD Calculator",
    subtitle: "Estimate fixed deposit maturity value.",
    fields: [
      { key: "principal", label: "Deposit Amount (Rs)", placeholder: "300000", allowDecimal: false },
      { key: "annualRate", label: "Interest % (Yearly)", placeholder: "7", allowDecimal: true },
      { key: "tenureMonths", label: "Tenure (Months)", placeholder: "24", allowDecimal: false },
    ],
  },
  "rd-calculator": {
    label: "RD Calculator",
    subtitle: "Estimate recurring deposit growth.",
    fields: [
      { key: "monthlyDeposit", label: "Monthly Deposit (Rs)", placeholder: "5000", allowDecimal: false },
      { key: "annualRate", label: "Interest % (Yearly)", placeholder: "6.8", allowDecimal: true },
      { key: "tenureMonths", label: "Tenure (Months)", placeholder: "36", allowDecimal: false },
    ],
  },
  "sip-calculator": {
    label: "SIP Calculator",
    subtitle: "Estimate SIP maturity and wealth gain.",
    fields: [
      { key: "monthlyInvestment", label: "Monthly Investment (Rs)", placeholder: "5000", allowDecimal: false },
      { key: "annualRate", label: "Expected Return %", placeholder: "12", allowDecimal: true },
      { key: "tenureYears", label: "Tenure (Years)", placeholder: "10", allowDecimal: false },
    ],
  },
};

const calculatorExplainers = {
  "emi-calculator": {
    intro: "Quickly estimate your monthly loan outflow before you apply.",
    points: [
      "EMI = monthly amount you pay to close the loan in selected tenure.",
      "Total Interest shows borrowing cost over full tenure.",
      "Use this to compare loan amount or tenure options.",
    ],
  },
  "fd-calculator": {
    intro: "Check fixed deposit maturity and expected interest in advance.",
    points: [
      "Maturity Amount = principal + interest at selected rate and tenure.",
      "Total Interest helps you compare FD options across tenures.",
      "Use this before booking FD so return expectations are clear.",
    ],
  },
  "rd-calculator": {
    intro: "Plan monthly recurring deposit contribution with maturity preview.",
    points: [
      "Total Deposit = monthly installment x total months.",
      "Maturity Amount includes deposit + accrued interest.",
      "Use this for monthly savings goals and disciplined investment.",
    ],
  },
  "sip-calculator": {
    intro: "Estimate long-term wealth creation for monthly SIP investment.",
    points: [
      "Future Value projects corpus based on monthly investment and return.",
      "Estimated Gain shows projected growth above invested amount.",
      "Use this to plan target corpus and required SIP amount.",
    ],
  },
};

const defaultCalculatorExplainer = {
  intro: "Use the inputs to preview estimated payout values before making a financial decision.",
  points: [
    "Update amount, interest, and tenure to compare options quickly.",
    "Results refresh instantly as you edit input fields.",
    "Use estimates for planning; final values can vary by product terms.",
  ],
};

const getCalculatorResultRows = (key, result = {}) => {
  if (key === "emi-calculator") {
    return [
      { label: "Estimated EMI", value: formatInr(result.emi) },
      { label: "Total Payment", value: formatInr(result.totalPayable) },
      { label: "Total Interest", value: formatInr(result.totalInterest) },
    ];
  }
  if (key === "fd-calculator") {
    return [
      { label: "Maturity Amount", value: formatInr(result.maturityAmount) },
      { label: "Total Interest", value: formatInr(result.totalInterest) },
      { label: "Principal", value: formatInr(result.principal) },
    ];
  }
  if (key === "rd-calculator") {
    return [
      { label: "Maturity Amount", value: formatInr(result.maturityAmount) },
      { label: "Total Deposit", value: formatInr(result.totalDeposit) },
      { label: "Interest Earned", value: formatInr(result.totalInterest) },
    ];
  }
  if (key === "sip-calculator") {
    return [
      { label: "Future Value", value: formatInr(result.futureValue) },
      { label: "Total Invested", value: formatInr(result.totalInvestment) },
      { label: "Estimated Gain", value: formatInr(result.wealthGain) },
    ];
  }
  return [];
};

const implementationBlueprints = {
  accounts: {
    steps: [
      "Review eligibility and KYC details for {item}.",
      "Start the request using the primary action button.",
      "Submit required inputs/documents and confirm request.",
      "Track request status from profile/dashboard until completion.",
    ],
    options: ["Self-service online flow", "Assisted support request", "Branch-assisted processing"],
  },
  deposits: {
    steps: [
      "Choose deposit amount, tenure, and product type for {item}.",
      "Complete account and funding confirmation.",
      "Submit booking request and review acknowledgment.",
      "Track maturity/interest details from dashboard.",
    ],
    options: ["Online deposit booking", "Support-assisted booking", "Branch booking with advisor"],
  },
  cards: {
    steps: [
      "Select card variant under {item}.",
      "Complete eligibility and identity verification.",
      "Submit card request and confirm communication details.",
      "Track issuance/dispatch from card center.",
    ],
    options: ["Digital application", "Existing-customer quick apply", "Support/branch assisted card request"],
  },
  loans: {
    steps: [
      "Run eligibility and repayment planning for {item}.",
      "Submit loan application with required financial details.",
      "Complete verification and sanction review.",
      "Accept sanction terms and track disbursal.",
    ],
    options: ["Online loan application", "Advisor-assisted application", "Branch document-assisted processing"],
  },
  insurance: {
    steps: [
      "Select coverage plan for {item}.",
      "Share proposer/insured details and preferences.",
      "Review premium and policy inclusions.",
      "Complete proposal and track policy issuance.",
    ],
    options: ["Digital proposal request", "Callback-assisted onboarding", "In-branch insurance support"],
  },
  investments: {
    steps: [
      "Select investment route for {item}.",
      "Complete risk profile and account mapping.",
      "Confirm investment amount/frequency.",
      "Submit and monitor portfolio performance.",
    ],
    options: ["Self-service digital onboarding", "RM/advisor-assisted onboarding", "Support-led request flow"],
  },
  wholesale: {
    steps: [
      "Define business requirement for {item}.",
      "Submit organization and compliance details.",
      "Complete onboarding verification with operations team.",
      "Activate services and monitor execution status.",
    ],
    options: ["Relationship manager route", "Corporate support desk", "Institutional onboarding cell"],
  },
  agri: {
    steps: [
      "Choose agri product/service under {item}.",
      "Provide land/farm/business and identity details.",
      "Submit request and complete eligibility checks.",
      "Track approval and service activation.",
    ],
    options: ["Online assisted form", "Agri support desk", "Rural branch facilitation"],
  },
  msme: {
    steps: [
      "Select MSME requirement for {item}.",
      "Provide business profile and turnover details.",
      "Submit request with required documents.",
      "Track approval and activation timeline.",
    ],
    options: ["Digital MSME request", "Relationship manager support", "Branch MSME desk"],
  },
  "government-schemes": {
    steps: [
      "Choose scheme flow for {item}.",
      "Submit eligibility and documentation details.",
      "Complete scheme-specific verification.",
      "Track application outcome and next actions.",
    ],
    options: ["Online scheme request", "Support-assisted eligibility check", "Branch-assisted scheme filing"],
  },
  "trade-services": {
    steps: [
      "Select trade flow under {item}.",
      "Share transaction, counterparty, and compliance details.",
      "Complete documentation and risk review.",
      "Track issuance/settlement milestones.",
    ],
    options: ["Digital trade request", "Trade specialist assistance", "Corporate branch processing"],
  },
  support: {
    steps: [
      "Choose support topic for {item}.",
      "Submit case details and references.",
      "Receive ticket and follow updates.",
      "Confirm resolution and close request.",
    ],
    options: ["Support center ticket", "Phone/chat escalation", "Branch grievance desk"],
  },
  security: {
    steps: [
      "Open {item} and review recommended controls.",
      "Apply required security settings.",
      "Report suspicious events if applicable.",
      "Monitor alerts and keep controls updated.",
    ],
    options: ["Self-service security controls", "Support-led fraud escalation", "Branch security assistance"],
  },
  calculators: {
    steps: [
      "Enter amount, rate, and tenure for {item}.",
      "Review calculated estimate outputs.",
      "Compare alternate scenarios.",
      "Proceed using the relevant product action.",
    ],
    options: ["Instant on-page calculator", "Advisor discussion with estimates", "Support-assisted planning"],
  },
  offers: {
    steps: [
      "Select offer category under {item}.",
      "Review eligibility and campaign terms.",
      "Activate or proceed via linked action.",
      "Track redemption and benefit status.",
    ],
    options: ["Digital activation", "Payment/app linked activation", "Support-assisted activation"],
  },
  regulatory: {
    steps: [
      "Open policy or disclosure section for {item}.",
      "Review terms, obligations, and limits.",
      "Apply required actions if mentioned.",
      "Use support channels for clarification.",
    ],
    options: ["Self-read policy pages", "Support clarifications", "Compliance escalation route"],
  },
  about: {
    steps: [
      "Open section under {item}.",
      "Review institutional and service information.",
      "Use linked actions for next steps.",
      "Contact support for further guidance.",
    ],
    options: ["Information-only browsing", "Support-assisted follow-up", "Relationship manager connect"],
  },
};

const getImplementationGuide = ({ category, itemName, isAuthenticated }) => {
  const blueprint = implementationBlueprints[category] || {
    steps: [
      "Review details for {item}.",
      "Use the primary action to continue.",
      "Submit required inputs and confirmations.",
      "Track status and complete follow-up actions.",
    ],
    options: ["Online self-service", "Support-assisted flow", "Branch-assisted processing"],
  };

  const replaceTokens = (line = "") => String(line).replaceAll("{item}", itemName || "this service");
  const steps = blueprint.steps.map(replaceTokens);
  const options = [...blueprint.options];

  if (!isAuthenticated) {
    steps.unshift("Login or register to access full workflow and submission controls.");
  }

  return { steps, options };
};

const buildServiceRequestPath = ({ category = "", productSlug = "", productName = "" } = {}) => {
  const params = new URLSearchParams();
  params.set("topic", "service-requests");
  if (category) params.set("serviceCategory", category);
  if (productSlug) params.set("serviceSlug", productSlug);
  if (productName) params.set("serviceName", productName);
  return `/support?${params.toString()}`;
};

const getCategoryAction = ({ category, isAuthenticated }) => {
  if (!isAuthenticated) {
    if (category === "accounts") {
      return { to: "/register", label: "Open Account Now" };
    }
    return { to: "/login", label: "Login for Access" };
  }

  switch (category) {
    case "accounts":
      return { to: buildServiceRequestPath({ category: "accounts" }), label: "Manage Account Requests" };
    case "deposits":
      return { to: buildServiceRequestPath({ category: "deposits" }), label: "Book Deposit Request" };
    case "cards":
      return { to: "/cards", label: "Manage Card Usage" };
    case "loans":
      return { to: "/loans", label: "Apply for Loan" };
    case "insurance":
      return { to: buildServiceRequestPath({ category: "insurance" }), label: "Request Insurance Callback" };
    case "investments":
      return { to: buildServiceRequestPath({ category: "investments" }), label: "Request Investment Support" };
    case "wholesale":
      return { to: buildServiceRequestPath({ category: "wholesale" }), label: "Request Wholesale Banking" };
    case "agri":
      return { to: buildServiceRequestPath({ category: "agri" }), label: "Request Agri Banking" };
    case "msme":
      return { to: buildServiceRequestPath({ category: "msme" }), label: "Request MSME Banking" };
    case "government-schemes":
      return { to: buildServiceRequestPath({ category: "government-schemes" }), label: "Check Scheme Eligibility" };
    case "trade-services":
      return { to: buildServiceRequestPath({ category: "trade-services" }), label: "Request Trade Finance" };
    case "support":
      return { to: "/support", label: "Open Support Center" };
    case "security":
      return { to: "/security/transaction-pin", label: "Open Security Controls" };
    case "calculators":
      return { to: "/services/calculators/emi-calculator", label: "Use Calculators" };
    case "offers":
      return { to: buildServiceRequestPath({ category: "offers" }), label: "Request Offer Activation" };
    case "regulatory":
      return { to: "/services/regulatory/disclosures", label: "Read Disclosures" };
    case "about":
      return { to: "/services/about/who-we-are", label: "Know More" };
    default:
      return { to: buildServiceRequestPath({ category }), label: "Continue via Service Desk" };
  }
};

const productActionMap = {
  accounts: {
    "savings-account": { to: "/dashboard", label: "Open Savings Journey" },
    "salary-account": { to: "/dashboard", label: "Open Salary Account" },
    "current-account": { to: "/dashboard", label: "Open Current Account" },
    "nri-accounts": { to: "/dashboard", label: "Start NRI Journey" },
    "seamless-nri-banking": { to: "/dashboard", label: "Start NRI Journey" },
    "update-signature": { to: "/profile", label: "Request Signature Update" },
    "name-change-updation": { to: "/profile", label: "Request Name Update" },
    "mobile-number-updation": { to: "/profile", label: "Request Mobile Update" },
    "update-pan": { to: "/profile", label: "Update PAN Now" },
    "add-nominee": { to: "/profile#nominee", label: "Add Nominee Now" },
    "add-modify-nominee": { to: "/profile#nominee", label: "Modify Nominee" },
    "account-type-conversion": { to: "/profile", label: "Request Conversion" },
    "open-subsequent-nre": { to: "/dashboard", label: "Open Subsequent NRE" },
    "add-resident-holder": { to: "/profile", label: "Add Resident Holder" },
    "profile-updation": { to: "/profile", label: "Update Profile" },
  },
  deposits: {
    "fixed-deposit": { to: "/dashboard", label: "Open Fixed Deposit" },
    "recurring-deposit": { to: "/dashboard", label: "Start RD Plan" },
    "tax-saver-fd": { to: "/dashboard", label: "Book Tax Saver FD" },
    "nre-deposits": { to: "/dashboard", label: "Book NRE Deposit" },
    "nro-deposits": { to: "/dashboard", label: "Book NRO Deposit" },
    "open-fixed-deposit": { to: "/dashboard", label: "Open Fixed Deposit" },
    "add-nre-nro-fixed-deposit": { to: "/dashboard", label: "Book NRE/NRO FD" },
    "assured-returns-deposits": { to: "/dashboard", label: "Explore Assured Returns" },
  },
  cards: {
    "credit-cards": { to: "/cards", label: "Apply Credit Card" },
    "debit-cards": { to: "/cards", label: "Manage Debit Card" },
    "forex-cards": { to: "/cards", label: "Apply Forex Card" },
    "prepaid-cards": { to: "/cards", label: "Get Prepaid Card" },
    "track-credit-card": { to: "/cards", label: "Track Card Request" },
    "debit-card-pin-services": { to: "/security/transaction-pin", label: "Set Card PIN" },
    "card-hotlist-and-reissue": { to: "/cards", label: "Block or Reissue" },
    "rupay-farmer-platinum-card": { to: "/cards", label: "Apply Farmer Card" },
    "business-credit-cards": { to: "/cards", label: "Apply Business Card" },
  },
  loans: {
    "personal-loan": { to: "/loans?type=PERSONAL", label: "Apply Personal Loan" },
    "home-loan": { to: "/loans?type=HOME", label: "Apply Home Loan" },
    "car-loan": { to: "/loans?type=CAR", label: "Apply Car Loan" },
    "business-loan": { to: "/loans?type=BUSINESS", label: "Apply Business Loan" },
    "emi-calculator": { to: "/services/calculators/emi-calculator", label: "Use EMI Calculator" },
    "tractor-loan": { to: "/loans?type=TRACTOR", label: "Apply Tractor Loan" },
    "consumer-durable-loan": { to: "/loans?type=CONSUMER_DURABLE", label: "Apply Consumer Durable Loan" },
    "two-wheeler-loan": { to: "/loans?type=TWO_WHEELER", label: "Apply Two-Wheeler Loan" },
    "horticulture-loan": { to: "/loans?type=HORTICULTURE", label: "Apply Horticulture Loan" },
    "allied-activities-financing": { to: "/loans?type=ALLIED_ACTIVITIES", label: "Apply Allied Activities Loan" },
    "working-capital-financing": { to: "/loans?type=WORKING_CAPITAL", label: "Apply Working Capital Loan" },
  },
  insurance: {
    "life-insurance": { to: "/profile", label: "Get Life Cover Quote" },
    "health-insurance": { to: "/profile", label: "Get Health Cover Quote" },
    "travel-insurance": { to: "/profile", label: "Get Travel Cover" },
    "motor-insurance": { to: "/profile", label: "Get Motor Insurance" },
  },
  investments: {
    "mutual-funds": { to: "/profile", label: "Start Mutual Fund Request" },
    "demat-account": { to: "/profile", label: "Open Demat Request" },
    "sip-plans": { to: "/services/calculators/sip-calculator", label: "Plan SIP" },
    bonds: { to: "/profile", label: "Invest in Bonds" },
    "wealth-solutions": { to: "/profile", label: "Connect Relationship Manager" },
    "high-net-worth-banking": { to: "/profile", label: "Connect Relationship Manager" },
  },
  wholesale: {
    "cbx-internet-banking": { to: "/profile", label: "Request CBX Onboarding" },
    "corporates-banking": { to: "/profile", label: "Connect Corporate Desk" },
    "government-banking": { to: "/profile", label: "Start Government Banking Request" },
    "financial-institutions": { to: "/profile", label: "Connect Institutions Desk" },
    "investment-banking": { to: "/profile", label: "Connect Investment Banking" },
    "api-banking-transactions": { to: "/profile", label: "Request API Banking Access" },
  },
  agri: {
    "kisan-dhan-vikas-e-kendra": { to: "/profile", label: "Start Kisan Banking Request" },
    "tractor-loan-emi-calculator": { to: "/services/calculators/emi-calculator", label: "Calculate Tractor EMI" },
    "crop-insurance": { to: "/profile", label: "Start Crop Insurance Request" },
    "agri-and-allied-financing": { to: "/loans?type=ALLIED_ACTIVITIES", label: "Apply Agri Financing" },
    "dealer-network-financing": { to: "/profile", label: "Request Dealer Financing" },
    "rural-banking": { to: "/profile", label: "Start Rural Banking Request" },
  },
  msme: {
    "msme-banking-solutions": { to: "/profile", label: "Start MSME Onboarding" },
    "business-cards": { to: "/cards", label: "Apply Business Card" },
    "kaamyaabi-ki-kahaniyan": { to: "/profile", label: "View Growth Program" },
    "one-place-business-banking": { to: "/profile", label: "Open Business Onboarding" },
    "working-capital": { to: "/loans?type=WORKING_CAPITAL", label: "Apply Working Capital" },
  },
  "government-schemes": {
    "pm-fme": { to: "/profile", label: "Check PM FME Eligibility" },
    cgtmse: { to: "/profile", label: "Check CGTMSE Eligibility" },
    "startup-credit-guarantee": { to: "/profile", label: "Check Startup Guarantee" },
    pmegp: { to: "/profile", label: "Check PMEGP Eligibility" },
    "pm-fasal-bima-yojana": { to: "/profile", label: "Check PMFBY Eligibility" },
  },
  "trade-services": {
    "export-trade-services": { to: "/profile", label: "Start Export Finance" },
    "import-trade-services": { to: "/profile", label: "Start Import Finance" },
    "buyers-credit": { to: "/profile", label: "Request Buyers Credit" },
    "bill-discounting": { to: "/profile", label: "Start Bill Discounting" },
    "multi-currency-funding": { to: "/profile", label: "Request Multi-Currency Funding" },
    "trade-specialist-assistance": { to: "/profile", label: "Connect Trade Specialist" },
  },
  security: {
    "fraud-awareness": { to: "/services/security/fraud-awareness", label: "Learn Fraud Safety" },
    "safe-banking-guidelines": { to: "/services/security/safe-banking-guidelines", label: "Read Safety Guide" },
    "report-fraud": { to: "/profile", label: "Report Fraud Now" },
    "eva-digital-assistant": { to: "/services/security/eva-digital-assistant", label: "Open EVA" },
  },
  support: {
    "contact-us": { to: "/support?topic=contact-us", label: "Contact Support" },
    "service-requests": { to: "/support?topic=service-requests", label: "Track Service Requests" },
    "branch-locator": { to: "/support?topic=branch-locator", label: "Find Branch" },
    "grievance-redressal": { to: "/support?topic=grievance-redressal", label: "Raise Grievance" },
    "nri-mailbox": { to: "/support?topic=nri-mailbox", label: "Open NRI Mailbox Request" },
    "call-chat-locate": { to: "/support?topic=call-chat-locate", label: "Open Call/Chat/Locate" },
  },
  calculators: {
    "emi-calculator": { to: "/services/calculators/emi-calculator", label: "Use EMI Calculator" },
    "fd-calculator": { to: "/services/calculators/fd-calculator", label: "Use FD Calculator" },
    "rd-calculator": { to: "/services/calculators/rd-calculator", label: "Use RD Calculator" },
    "sip-calculator": { to: "/services/calculators/sip-calculator", label: "Use SIP Calculator" },
  },
  offers: {
    "shopping-offers": { to: "/payments", label: "Activate Shopping Offer" },
    "travel-offers": { to: "/payments", label: "Activate Travel Offer" },
    "dining-offers": { to: "/payments", label: "Activate Dining Offer" },
    "fuel-offers": { to: "/payments", label: "Activate Fuel Offer" },
    "global-remittance-rates": { to: "/payments", label: "Check Remittance Rates" },
  },
  about: {
    "who-we-are": { to: "/services/about/who-we-are", label: "Read About Bank" },
    leadership: { to: "/services/about/leadership", label: "View Leadership" },
    careers: { to: "/services/about/careers", label: "Explore Careers" },
    "investor-relations": { to: "/services/about/investor-relations", label: "View Investor Relations" },
    "high-net-worth-faq": { to: "/services/about/high-net-worth-faq", label: "Read HNI FAQ" },
  },
  regulatory: {
    disclosures: { to: "/services/regulatory/disclosures", label: "Read Disclosures" },
    "security-guidelines": { to: "/services/regulatory/security-guidelines", label: "Read Security Policy" },
    "privacy-policy": { to: "/services/regulatory/privacy-policy", label: "Read Privacy Policy" },
    "terms-and-conditions": { to: "/services/regulatory/terms-and-conditions", label: "Read Terms" },
  },
};

const getProductAction = ({ category, productSlug, productName = "", isAuthenticated }) => {
  if (!productSlug) {
    return getCategoryAction({ category, isAuthenticated });
  }

  if (!isAuthenticated) {
    const detailsPath = `/services/${category}/${productSlug}`;
    if (["support", "security", "regulatory", "about", "calculators"].includes(category)) {
      return { to: detailsPath, label: category === "calculators" ? "Open Calculator" : "View Service" };
    }
    if (["cards", "loans", "deposits", "investments", "insurance", "offers", "agri", "msme"].includes(category)) {
      return { to: "/register", label: "Start Online Application" };
    }
    if (["trade-services", "government-schemes", "wholesale"].includes(category)) {
      return { to: "/register", label: "Request Banking Access" };
    }
    if (
      category === "accounts" &&
      ["savings-account", "salary-account", "current-account", "nri-accounts", "seamless-nri-banking"].includes(productSlug)
    ) {
      return { to: "/register", label: "Open Account" };
    }
    return { to: "/login", label: "Login to Proceed" };
  }

  const mappedAction = productActionMap[category]?.[productSlug];
  if (mappedAction) {
    const serviceDeskCategories = [
      "accounts",
      "deposits",
      "insurance",
      "investments",
      "wholesale",
      "agri",
      "msme",
      "government-schemes",
      "trade-services",
    ];
    const shouldRouteToServiceDesk =
      isAuthenticated &&
      (mappedAction.to === "/profile" ||
        (mappedAction.to === "/dashboard" && serviceDeskCategories.includes(category)));

    if (shouldRouteToServiceDesk) {
      return {
        to: buildServiceRequestPath({
          category,
          productSlug,
          productName: productName || toTitle(productSlug),
        }),
        label: mappedAction.label,
      };
    }
    return mappedAction;
  }

  switch (category) {
    case "calculators":
      return { to: `/services/calculators/${productSlug}`, label: "Use Calculator" };
    case "about":
      return { to: `/services/about/${productSlug}`, label: "Explore Section" };
    case "regulatory":
      return { to: `/services/regulatory/${productSlug}`, label: "Read Policy" };
    case "cards":
      return { to: "/cards", label: "Apply for Card" };
    case "loans":
      return { to: "/loans", label: "Apply for Loan" };
    case "offers":
      return { to: "/payments", label: "Activate Offer" };
    case "support":
      return { to: "/support", label: "Open Support Center" };
    case "security":
      return { to: "/security/transaction-pin", label: "Open Security" };
    default:
      return isAuthenticated
        ? {
            to: buildServiceRequestPath({
              category,
              productSlug,
              productName: productName || toTitle(productSlug),
            }),
            label: `Request ${productName || toTitle(productSlug)}`,
          }
        : getCategoryAction({ category, isAuthenticated });
  }
};

const ServiceExplorer = () => {
  const { category, product } = useParams();
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const searchParams = new URLSearchParams(location.search);
  const searchQuery = String(searchParams.get("q") || "").trim();
  const normalizedQuery = searchQuery.toLowerCase();
  const [calculatorInputs, setCalculatorInputs] = useState({
    "emi-calculator": { amount: "500000", annualRate: "9.5", tenureMonths: "60" },
    "fd-calculator": { principal: "300000", annualRate: "7", tenureMonths: "24" },
    "rd-calculator": { monthlyDeposit: "5000", annualRate: "6.8", tenureMonths: "36" },
    "sip-calculator": { monthlyInvestment: "5000", annualRate: "12", tenureYears: "10" },
  });

  const currentCategory = category ? serviceCatalog[category] : null;
  const brochureContent = category ? pdfContentMap[category] : null;

  const selectedItem = useMemo(() => {
    if (!currentCategory || !product) return null;
    return currentCategory.items.find((item) => item.slug === product) || null;
  }, [currentCategory, product]);

  const activeCalculatorKey = useMemo(() => {
    if (selectedItem?.slug && calculatorConfigs[selectedItem.slug]) {
      return selectedItem.slug;
    }
    if (category === "calculators") {
      return "emi-calculator";
    }
    return "";
  }, [selectedItem, category]);

  const activeCalculatorConfig = activeCalculatorKey ? calculatorConfigs[activeCalculatorKey] : null;
  const activeCalculatorExplainer = activeCalculatorKey
    ? calculatorExplainers[activeCalculatorKey] || defaultCalculatorExplainer
    : null;

  const calculatorResults = useMemo(() => {
    const emiInput = calculatorInputs["emi-calculator"];
    const fdInput = calculatorInputs["fd-calculator"];
    const rdInput = calculatorInputs["rd-calculator"];
    const sipInput = calculatorInputs["sip-calculator"];

    const emiPrincipal = Number(emiInput.amount);
    const emiRateAnnual = Number(emiInput.annualRate);
    const emiMonths = Number(emiInput.tenureMonths);
    let emi = 0;
    let emiTotalPayable = 0;
    let emiTotalInterest = 0;
    if (Number.isFinite(emiPrincipal) && emiPrincipal > 0 && Number.isFinite(emiMonths) && emiMonths > 0) {
      const monthlyRate = Number.isFinite(emiRateAnnual) ? Math.max(0, emiRateAnnual) / 12 / 100 : 0;
      emi =
        monthlyRate === 0
          ? emiPrincipal / emiMonths
          : (emiPrincipal * monthlyRate * (1 + monthlyRate) ** emiMonths) / ((1 + monthlyRate) ** emiMonths - 1);
      emi = Number.isFinite(emi) ? emi : 0;
      emiTotalPayable = emi * emiMonths;
      emiTotalInterest = Math.max(0, emiTotalPayable - emiPrincipal);
    }

    const fdPrincipal = Number(fdInput.principal);
    const fdRateAnnual = Number(fdInput.annualRate);
    const fdMonths = Number(fdInput.tenureMonths);
    let fdMaturityAmount = 0;
    let fdInterest = 0;
    if (Number.isFinite(fdPrincipal) && fdPrincipal > 0 && Number.isFinite(fdMonths) && fdMonths > 0) {
      const monthlyRate = Number.isFinite(fdRateAnnual) ? Math.max(0, fdRateAnnual) / 12 / 100 : 0;
      fdMaturityAmount = fdPrincipal * (1 + monthlyRate) ** fdMonths;
      fdMaturityAmount = Number.isFinite(fdMaturityAmount) ? fdMaturityAmount : 0;
      fdInterest = Math.max(0, fdMaturityAmount - fdPrincipal);
    }

    const rdDeposit = Number(rdInput.monthlyDeposit);
    const rdRateAnnual = Number(rdInput.annualRate);
    const rdMonths = Number(rdInput.tenureMonths);
    let rdMaturityAmount = 0;
    let rdTotalDeposit = 0;
    let rdInterest = 0;
    if (Number.isFinite(rdDeposit) && rdDeposit > 0 && Number.isFinite(rdMonths) && rdMonths > 0) {
      const monthlyRate = Number.isFinite(rdRateAnnual) ? Math.max(0, rdRateAnnual) / 12 / 100 : 0;
      rdMaturityAmount =
        monthlyRate === 0
          ? rdDeposit * rdMonths
          : rdDeposit * (((1 + monthlyRate) ** rdMonths - 1) / monthlyRate) * (1 + monthlyRate);
      rdMaturityAmount = Number.isFinite(rdMaturityAmount) ? rdMaturityAmount : 0;
      rdTotalDeposit = rdDeposit * rdMonths;
      rdInterest = Math.max(0, rdMaturityAmount - rdTotalDeposit);
    }

    const sipMonthlyInvestment = Number(sipInput.monthlyInvestment);
    const sipRateAnnual = Number(sipInput.annualRate);
    const sipYears = Number(sipInput.tenureYears);
    const sipMonths = sipYears * 12;
    let sipFutureValue = 0;
    let sipTotalInvestment = 0;
    let sipWealthGain = 0;
    if (Number.isFinite(sipMonthlyInvestment) && sipMonthlyInvestment > 0 && Number.isFinite(sipYears) && sipYears > 0) {
      const monthlyRate = Number.isFinite(sipRateAnnual) ? Math.max(0, sipRateAnnual) / 12 / 100 : 0;
      sipFutureValue =
        monthlyRate === 0
          ? sipMonthlyInvestment * sipMonths
          : sipMonthlyInvestment * (((1 + monthlyRate) ** sipMonths - 1) / monthlyRate) * (1 + monthlyRate);
      sipFutureValue = Number.isFinite(sipFutureValue) ? sipFutureValue : 0;
      sipTotalInvestment = sipMonthlyInvestment * sipMonths;
      sipWealthGain = Math.max(0, sipFutureValue - sipTotalInvestment);
    }

    return {
      "emi-calculator": {
        emi,
        totalPayable: emiTotalPayable,
        totalInterest: emiTotalInterest,
      },
      "fd-calculator": {
        principal: fdPrincipal || 0,
        maturityAmount: fdMaturityAmount,
        totalInterest: fdInterest,
      },
      "rd-calculator": {
        maturityAmount: rdMaturityAmount,
        totalDeposit: rdTotalDeposit,
        totalInterest: rdInterest,
      },
      "sip-calculator": {
        futureValue: sipFutureValue,
        totalInvestment: sipTotalInvestment,
        wealthGain: sipWealthGain,
      },
    };
  }, [calculatorInputs]);

  const activeCalculatorRows = useMemo(
    () => getCalculatorResultRows(activeCalculatorKey, calculatorResults[activeCalculatorKey]),
    [activeCalculatorKey, calculatorResults]
  );

  const searchResults = useMemo(() => {
    if (!normalizedQuery) return [];

    const results = [];
    Object.entries(serviceCatalog).forEach(([key, value]) => {
      const categoryText = `${value.title} ${value.description}`.toLowerCase();
      const categoryMatch = categoryText.includes(normalizedQuery);
      const itemMatches = value.items.filter((item) =>
        `${item.name} ${item.detail} ${item.slug}`.toLowerCase().includes(normalizedQuery)
      );

      if (categoryMatch || itemMatches.length > 0) {
        results.push({ key, title: value.title, categoryMatch, itemMatches });
      }
    });
    return results;
  }, [normalizedQuery]);

  const filteredCategoryItems = useMemo(() => {
    if (!currentCategory || !normalizedQuery || selectedItem) {
      return currentCategory?.items || [];
    }
    return currentCategory.items.filter((item) =>
      `${item.name} ${item.detail} ${item.slug}`.toLowerCase().includes(normalizedQuery)
    );
  }, [currentCategory, normalizedQuery, selectedItem]);

  const categoryAction = getCategoryAction({ category, isAuthenticated });
  const selectedItemAction = selectedItem
    ? getProductAction({ category, productSlug: selectedItem.slug, productName: selectedItem.name, isAuthenticated })
    : categoryAction;
  const selectedItemGuide = selectedItem
    ? getImplementationGuide({ category, itemName: selectedItem.name, isAuthenticated })
    : null;
  const categoryGuide =
    !selectedItem && currentCategory
      ? getImplementationGuide({ category, itemName: currentCategory.title, isAuthenticated })
      : null;

  const handleCalculatorInputChange = (calculatorKey, fieldKey, nextValue, allowDecimal) => {
    if (!calculatorKey || !fieldKey) return;
    const sanitized = sanitizeNumericInput(nextValue, allowDecimal);
    setCalculatorInputs((current) => ({
      ...current,
      [calculatorKey]: {
        ...(current[calculatorKey] || {}),
        [fieldKey]: sanitized,
      },
    }));
  };

  let content;

  if (!category) {
    content = (
      <div className="service-page">
        <div className="service-shell">
          <div className="service-head">
            <h1>Banking Service Explorer</h1>
            <p>Browse every banking category and use service-specific actions from one place.</p>
          </div>
          {searchQuery && (
            <section className="service-search-results">
              <h2>Search Results for "{searchQuery}"</h2>
              {searchResults.length === 0 ? (
                <p>No services matched. Try a different keyword.</p>
              ) : (
                <div className="service-search-grid">
                  {searchResults.map((result) => (
                    <article key={result.key} className="service-search-card">
                      <Link to={`/services/${result.key}`}>{result.title}</Link>
                      {result.categoryMatch && <span>Category matched</span>}
                      {result.itemMatches.slice(0, 5).map((item) => (
                        <Link key={item.slug} to={`/services/${result.key}/${item.slug}`}>
                          {item.name}
                        </Link>
                      ))}
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
          <div className="service-category-grid">
            {Object.entries(serviceCatalog).map(([key, value]) => (
              <Link key={key} to={`/services/${key}`} className="service-category-card">
                <h3>{value.title}</h3>
                <p>{value.description}</p>
                <span>Explore Category</span>
              </Link>
            ))}
          </div>
          <div className="service-brochure-scope">
            <h2>Service Coverage Highlights</h2>
            <p>Explore key banking segments and open detailed feature pages for execution steps.</p>
            <div className="service-brochure-tags">
              {brochureSegments.map((entry) => (
                <Link key={entry.key} to={`/services/${entry.key}`}>
                  {entry.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  } else if (!currentCategory) {
    content = (
      <div className="service-page">
        <div className="service-shell">
          <div className="service-head">
            <h1>Service Not Found</h1>
            <p>The requested category is not available.</p>
          </div>
          <Link to="/services" className="service-btn service-btn-primary">
            Back to Services
          </Link>
        </div>
      </div>
    );
  } else {
    content = (
      <div className="service-page">
        <div className="service-shell">
          <div className="service-breadcrumb">
            <Link to="/">Home</Link>
            <span>/</span>
            <Link to="/services">Services</Link>
            <span>/</span>
            <span>{currentCategory.title}</span>
            {product && (
              <>
                <span>/</span>
                <span>{toTitle(product)}</span>
              </>
            )}
          </div>

          <div className="service-head">
            <h1>{currentCategory.title}</h1>
            <p>{currentCategory.description}</p>
            <div className="service-head-actions">
              {isAuthenticated ? (
                <Link to={categoryAction.to} className="service-btn service-btn-primary">
                  {categoryAction.label}
                </Link>
              ) : (
                <>
                  <Link to="/login" className="service-btn service-btn-primary">
                    Login to Continue
                  </Link>
                  <Link to="/register" className="service-btn service-btn-outline">
                    Open New Account
                  </Link>
                </>
              )}
            </div>
          </div>

          {brochureContent && (
            <section className="service-brochure-panel">
              <div>
                <h2>{brochureContent.title}</h2>
                <p>{brochureContent.description}</p>
              </div>
              <div className="service-brochure-grid">
                <article>
                  <h3>Highlights</h3>
                  <ul>
                    {brochureContent.highlights.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </article>
                <article>
                  <h3>Key Signals</h3>
                  <ul>
                    {brochureContent.metrics.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </article>
              </div>
            </section>
          )}

          {selectedItem ? (
            <div className="service-item-focus">
              <h2>{selectedItem.name}</h2>
              <p>{selectedItem.detail}</p>
              <div className="service-item-meta">
                <span>Category: {currentCategory.title}</span>
                <span>User Access: {isAuthenticated ? user?.role || "USER" : "Guest"}</span>
              </div>
              {selectedItemGuide && (
                <section className="service-implementation-panel">
                  <article className="service-implementation-card">
                    <h3>Application Steps</h3>
                    <ol>
                      {selectedItemGuide.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </article>
                  <article className="service-implementation-card">
                    <h3>Implementation Options</h3>
                    <ul>
                      {selectedItemGuide.options.map((option) => (
                        <li key={option}>{option}</li>
                      ))}
                    </ul>
                  </article>
                </section>
              )}
              {category === "calculators" && activeCalculatorConfig ? (
                <div className="service-calculator-panel">
                  <div className="service-calculator-head">
                    <h3>{activeCalculatorConfig.label}</h3>
                    <p>{activeCalculatorConfig.subtitle}</p>
                  </div>
                  {activeCalculatorExplainer ? (
                    <div className="service-calculator-explainer">
                      <h4>How This Calculator Works</h4>
                      <p>{activeCalculatorExplainer.intro}</p>
                      <ul>
                        {activeCalculatorExplainer.points.map((point) => (
                          <li key={point}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="service-calculator-grid">
                    {activeCalculatorConfig.fields.map((field) => (
                      <label key={field.key}>
                        {field.label}
                        <input
                          type="text"
                          inputMode={field.allowDecimal ? "decimal" : "numeric"}
                          placeholder={field.placeholder}
                          value={calculatorInputs[activeCalculatorKey]?.[field.key] || ""}
                          onChange={(event) =>
                            handleCalculatorInputChange(activeCalculatorKey, field.key, event.target.value, field.allowDecimal)
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <div className="service-calculator-results">
                    {activeCalculatorRows.map((row) => (
                      <article key={row.label}>
                        <small>{row.label}</small>
                        <strong>{row.value}</strong>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="service-item-cta">
                <Link to={selectedItemAction.to} className="service-btn service-btn-primary">
                  {selectedItemAction.label}
                </Link>
                <Link to={`/services/${category}`} className="service-btn service-btn-outline">
                  More in {currentCategory.title}
                </Link>
              </div>
            </div>
          ) : (
            <>
              {categoryGuide && (
                <section className="service-implementation-panel">
                  <article className="service-implementation-card">
                    <h3>Application Steps</h3>
                    <ol>
                      {categoryGuide.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </article>
                  <article className="service-implementation-card">
                    <h3>Implementation Options</h3>
                    <ul>
                      {categoryGuide.options.map((option) => (
                        <li key={option}>{option}</li>
                      ))}
                    </ul>
                  </article>
                </section>
              )}
              <div className="service-item-grid">
                {filteredCategoryItems.map((item) => {
                  const itemAction = getProductAction({
                    category,
                    productSlug: item.slug,
                    productName: item.name,
                    isAuthenticated,
                  });
                  const itemGuide = getImplementationGuide({
                    category,
                    itemName: item.name,
                    isAuthenticated,
                  });
                  const detailsPath = `/services/${category}/${item.slug}`;
                  const showDetails = itemAction.to !== detailsPath;

                  return (
                    <article key={item.slug} className="service-item-card">
                      <h3>{item.name}</h3>
                      <p>{item.detail}</p>
                      <div className="service-item-guide-preview">
                        <div className="service-item-guide-block">
                          <h4>Steps</h4>
                          <ol>
                            {itemGuide.steps.slice(0, 2).map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ol>
                        </div>
                        <div className="service-item-guide-block">
                          <h4>Options</h4>
                          <ul>
                            {itemGuide.options.slice(0, 2).map((option) => (
                              <li key={option}>{option}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <div className="service-item-actions">
                        <Link to={itemAction.to} className="service-btn service-btn-primary service-btn-card">
                          {itemAction.label}
                        </Link>
                        {showDetails && (
                          <Link to={detailsPath} className="service-btn service-btn-outline service-btn-card">
                            View Details
                          </Link>
                        )}
                      </div>
                    </article>
                  );
                })}
                {filteredCategoryItems.length === 0 && (
                  <article className="service-item-card">
                    <h3>No matching services</h3>
                    <p>Try another keyword from the navbar search.</p>
                  </article>
                )}
              </div>
              {category === "calculators" && activeCalculatorConfig ? (
                <section className="service-calculator-quick-guide">
                  <h3>Calculator Quick Explanations</h3>
                  <p>Use any calculator below for a quick estimate before you apply or invest.</p>
                  <div className="service-calculator-quick-grid">
                    {Object.entries(calculatorConfigs).map(([calculatorKey, config]) => (
                      <article key={calculatorKey}>
                        <h4>{config.label}</h4>
                        <p>{calculatorExplainers[calculatorKey]?.intro || defaultCalculatorExplainer.intro}</p>
                        <Link to={`/services/calculators/${calculatorKey}`}>Open {config.label}</Link>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
              {category === "calculators" && activeCalculatorConfig ? (
                <section className="service-calculator-panel">
                  <div className="service-calculator-head">
                    <h3>{activeCalculatorConfig.label}</h3>
                    <p>{activeCalculatorConfig.subtitle}</p>
                  </div>
                  {activeCalculatorExplainer ? (
                    <div className="service-calculator-explainer">
                      <h4>How This Calculator Works</h4>
                      <p>{activeCalculatorExplainer.intro}</p>
                      <ul>
                        {activeCalculatorExplainer.points.map((point) => (
                          <li key={point}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="service-calculator-grid">
                    {activeCalculatorConfig.fields.map((field) => (
                      <label key={field.key}>
                        {field.label}
                        <input
                          type="text"
                          inputMode={field.allowDecimal ? "decimal" : "numeric"}
                          placeholder={field.placeholder}
                          value={calculatorInputs[activeCalculatorKey]?.[field.key] || ""}
                          onChange={(event) =>
                            handleCalculatorInputChange(activeCalculatorKey, field.key, event.target.value, field.allowDecimal)
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <div className="service-calculator-results">
                    {activeCalculatorRows.map((row) => (
                      <article key={row.label}>
                        <small>{row.label}</small>
                        <strong>{row.value}</strong>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <HomeNavbar />
      {content}
    </>
  );
};

export default ServiceExplorer;
