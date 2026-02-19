const serviceCatalog = {
  accounts: {
    title: "Account Services",
    description: "Manage savings, salary, and premium banking accounts with instant digital requests.",
    items: [
      {
        slug: "savings-account",
        name: "Savings Account",
        detail: "Zero-balance and premium variants with mobile and netbanking access.",
      },
      {
        slug: "salary-account",
        name: "Salary Account",
        detail: "Corporate salary account with benefits, insurance cover, and debit rewards.",
      },
      {
        slug: "current-account",
        name: "Current Account",
        detail: "Business-friendly current account with transaction bundles and merchant support.",
      },
      {
        slug: "nri-accounts",
        name: "NRI Accounts",
        detail: "NRE and NRO accounts with digital onboarding and foreign remittance support.",
      },
      {
        slug: "seamless-nri-banking",
        name: "Seamless NRI Banking",
        detail: "Access NRI banking services globally with online onboarding and instant service requests.",
      },
      {
        slug: "update-signature",
        name: "Update Signature",
        detail: "Submit and track signature update requests digitally for account verification.",
      },
      {
        slug: "name-change-updation",
        name: "Name Change Updation",
        detail: "Apply account holder name correction with document upload support.",
      },
      {
        slug: "mobile-number-updation",
        name: "Mobile Number Updation",
        detail: "Update registered mobile number for OTP and transaction alerts.",
      },
      {
        slug: "update-pan",
        name: "Update PAN",
        detail: "Update PAN details linked to your account for KYC and compliance.",
      },
      {
        slug: "add-nominee",
        name: "Add Nominee",
        detail: "Protect family access by registering a nominee in your account.",
      },
      {
        slug: "add-modify-nominee",
        name: "Add or Modify Nominee",
        detail: "Add a new nominee or update existing nominee mapping for account continuity.",
      },
      {
        slug: "account-type-conversion",
        name: "Account Type Conversion",
        detail: "Request conversion between eligible account variants based on profile needs.",
      },
      {
        slug: "open-subsequent-nre",
        name: "Open Subsequent NRE",
        detail: "Open additional NRE account from abroad using digital workflow.",
      },
      {
        slug: "add-resident-holder",
        name: "Add Resident Holder",
        detail: "Authorize resident joint-holder access for supported NRI account types.",
      },
      {
        slug: "profile-updation",
        name: "Profile Updation",
        detail: "Update address, email, contact details, and communication preferences.",
      },
    ],
  },
  deposits: {
    title: "Deposit Services",
    description: "Build secure returns using fixed and recurring deposit products.",
    items: [
      {
        slug: "fixed-deposit",
        name: "Fixed Deposit",
        detail: "Open fixed deposits online with flexible tenure and assured maturity values.",
      },
      {
        slug: "recurring-deposit",
        name: "Recurring Deposit",
        detail: "Start monthly savings plans with auto-debit and predictable returns.",
      },
      {
        slug: "tax-saver-fd",
        name: "Tax Saver FD",
        detail: "Claim applicable tax benefits with lock-in tax saver deposits.",
      },
      {
        slug: "nre-deposits",
        name: "NRE Deposits",
        detail: "NRE deposit options for non-resident customers with repatriation benefits.",
      },
      {
        slug: "nro-deposits",
        name: "NRO Deposits",
        detail: "Deposit options for rupee earnings with account-linked maturity handling.",
      },
      {
        slug: "open-fixed-deposit",
        name: "Open Fixed Deposit",
        detail: "Create and manage FD online from the dashboard in a few clicks.",
      },
      {
        slug: "add-nre-nro-fixed-deposit",
        name: "Add NRE or NRO Fixed Deposit",
        detail: "Book NRE/NRO fixed deposits directly through internet banking.",
      },
      {
        slug: "assured-returns-deposits",
        name: "Assured Returns Deposits",
        detail: "Access fixed and recurring deposits designed for stable growth planning.",
      },
    ],
  },
  cards: {
    title: "Card Services",
    description: "Control and optimize card usage with rewards, limits, and spend insights.",
    items: [
      {
        slug: "credit-cards",
        name: "Credit Cards",
        detail: "Lifestyle, cashback, and travel cards with reward redemption benefits.",
      },
      {
        slug: "debit-cards",
        name: "Debit Cards",
        detail: "Domestic and international debit cards with ATM and online security controls.",
      },
      {
        slug: "forex-cards",
        name: "Forex Cards",
        detail: "Multi-currency prepaid cards for seamless travel spending.",
      },
      {
        slug: "prepaid-cards",
        name: "Prepaid Cards",
        detail: "Gift and corporate prepaid cards with controlled loading limits.",
      },
      {
        slug: "track-credit-card",
        name: "Track Credit Card",
        detail: "Track application status, dispatch details, and activation steps.",
      },
      {
        slug: "debit-card-pin-services",
        name: "Debit Card PIN Services",
        detail: "Set, reset, and manage debit card PIN securely online.",
      },
      {
        slug: "card-hotlist-and-reissue",
        name: "Card Hotlist and Reissue",
        detail: "Block lost cards immediately and request reissue from one workflow.",
      },
      {
        slug: "rupay-farmer-platinum-card",
        name: "RuPay Farmer Platinum Debit Card",
        detail: "Farmer-focused card with insurance and agri service benefits.",
      },
      {
        slug: "business-credit-cards",
        name: "Business Credit Cards",
        detail: "Credit card products for MSME and business expense management.",
      },
    ],
  },
  loans: {
    title: "Loan Services",
    description: "Compare and apply for loans with transparent rate and tenure options.",
    items: [
      {
        slug: "personal-loan",
        name: "Personal Loan",
        detail: "Collateral-free personal loan approvals with quick disbursal.",
      },
      {
        slug: "home-loan",
        name: "Home Loan",
        detail: "Structured home loan options with long tenure and balance transfer.",
      },
      {
        slug: "car-loan",
        name: "Car Loan",
        detail: "New and used car financing with digital eligibility checks.",
      },
      {
        slug: "business-loan",
        name: "Business Loan",
        detail: "Funding support for MSME growth and working capital needs.",
      },
      {
        slug: "emi-calculator",
        name: "EMI Calculator",
        detail: "Calculate monthly EMI, total interest, and total payable instantly.",
      },
      {
        slug: "tractor-loan",
        name: "Tractor Loan",
        detail: "Agri-focused tractor financing with dealer network and flexible tenure.",
      },
      {
        slug: "consumer-durable-loan",
        name: "Consumer Durable Loan",
        detail: "Short-tenure financing for eligible consumer durable purchases.",
      },
      {
        slug: "two-wheeler-loan",
        name: "Two-Wheeler Loan",
        detail: "Fast approval two-wheeler financing with simple repayment structure.",
      },
      {
        slug: "horticulture-loan",
        name: "Horticulture Loan",
        detail: "Financing support for horticulture expansion and crop-linked projects.",
      },
      {
        slug: "allied-activities-financing",
        name: "Allied Activities Financing",
        detail: "Credit support for fishery, dairy, poultry, and allied rural business.",
      },
      {
        slug: "working-capital-financing",
        name: "Working Capital Financing",
        detail: "Business and MSME working capital limits to support daily operations.",
      },
    ],
  },
  insurance: {
    title: "Insurance Services",
    description: "Protect life, health, travel, and assets with partner insurance plans.",
    items: [
      { slug: "life-insurance", name: "Life Insurance", detail: "Term and wealth plans for family protection." },
      { slug: "health-insurance", name: "Health Insurance", detail: "Individual and family floater health plans." },
      { slug: "travel-insurance", name: "Travel Insurance", detail: "Domestic and international travel cover." },
      { slug: "motor-insurance", name: "Motor Insurance", detail: "Car and two-wheeler comprehensive plans." },
    ],
  },
  investments: {
    title: "Investment Services",
    description: "Build long-term wealth with diversified products and investment tools.",
    items: [
      { slug: "mutual-funds", name: "Mutual Funds", detail: "SIP and lump-sum mutual fund options by risk profile." },
      { slug: "demat-account", name: "Demat Account", detail: "Open and manage demat account for equity investing." },
      { slug: "sip-plans", name: "SIP Plans", detail: "Goal-based monthly SIP plans with auto-invest setup." },
      { slug: "bonds", name: "Bonds", detail: "Government and corporate bond investment opportunities." },
      {
        slug: "wealth-solutions",
        name: "Wealth Solutions",
        detail: "Dedicated wealth solutions for high-net-worth banking customers.",
      },
      {
        slug: "high-net-worth-banking",
        name: "High-Net-Worth Banking",
        detail: "Exclusive relationship-led services and privileged banking for affluent customers.",
      },
    ],
  },
  wholesale: {
    title: "Wholesale and Institutional Banking",
    description: "Enterprise-grade banking for corporates, institutions, and government bodies.",
    items: [
      {
        slug: "cbx-internet-banking",
        name: "CBX Internet Banking",
        detail: "Corporate banking platform for high-volume transactions and business operations.",
      },
      {
        slug: "corporates-banking",
        name: "Corporates Banking",
        detail: "Transaction banking, working capital, and structured business solutions.",
      },
      {
        slug: "government-banking",
        name: "Government Banking",
        detail: "Collection, disbursement, and institutional banking support for government entities.",
      },
      {
        slug: "financial-institutions",
        name: "Financial Institutions",
        detail: "Banking products tailored for institutional treasury and settlement requirements.",
      },
      {
        slug: "investment-banking",
        name: "Investment Banking",
        detail: "Advisory and capital market solutions for enterprise growth and restructuring.",
      },
      {
        slug: "api-banking-transactions",
        name: "API Banking Transactions",
        detail: "API-enabled transaction rails for large-scale digital payment operations.",
      },
    ],
  },
  agri: {
    title: "Agri Banking Solutions",
    description: "Financing and payment services designed for agri-business and rural segments.",
    items: [
      {
        slug: "kisan-dhan-vikas-e-kendra",
        name: "Kisan Dhan Vikas E-Kendra",
        detail: "Integrated agri banking service hub for financing and advisory support.",
      },
      {
        slug: "tractor-loan-emi-calculator",
        name: "Tractor Loan EMI Calculator",
        detail: "Estimate monthly EMI and repayment structure for tractor financing.",
      },
      {
        slug: "crop-insurance",
        name: "Crop Insurance",
        detail: "Insurance-linked protection for listed crops under supported schemes.",
      },
      {
        slug: "agri-and-allied-financing",
        name: "Agri and Allied Financing",
        detail: "Funding for agri operations, dairy, fishery, and poultry activities.",
      },
      {
        slug: "dealer-network-financing",
        name: "Dealer Network Financing",
        detail: "Access financing through wide dealer ecosystem for agri equipment.",
      },
      {
        slug: "rural-banking",
        name: "Rural Banking",
        detail: "Rural branch-led banking and payments support for farming communities.",
      },
    ],
  },
  msme: {
    title: "MSME Banking",
    description: "Business banking stack for MSME growth, cashflow, and expansion.",
    items: [
      {
        slug: "msme-banking-solutions",
        name: "MSME Banking Solutions",
        detail: "Core current account, lending, and payment products for MSME businesses.",
      },
      {
        slug: "business-cards",
        name: "Business Cards",
        detail: "Card products for business expenses, controls, and reward-led usage.",
      },
      {
        slug: "kaamyaabi-ki-kahaniyan",
        name: "Kaamyaabi Ki Kahaniyan",
        detail: "MSME success-oriented programs and growth guidance initiatives.",
      },
      {
        slug: "one-place-business-banking",
        name: "One Place for Business Banking",
        detail: "Unified dashboard for payments, cards, loans, and service requests.",
      },
      {
        slug: "working-capital",
        name: "Working Capital",
        detail: "Cashflow and operational funding products for daily business needs.",
      },
    ],
  },
  "government-schemes": {
    title: "Government Schemes",
    description: "Explore subsidy and guarantee linked schemes for business and agri segments.",
    items: [
      {
        slug: "pm-fme",
        name: "PM FME",
        detail: "Formalization support scheme for micro food processing enterprises.",
      },
      {
        slug: "cgtmse",
        name: "CGTMSE",
        detail: "Credit guarantee coverage for eligible MSME loans without collateral.",
      },
      {
        slug: "startup-credit-guarantee",
        name: "Credit Guarantee for Startups",
        detail: "Guarantee-linked financing support for startup business borrowing.",
      },
      {
        slug: "pmegp",
        name: "PMEGP",
        detail: "Prime Minister Employment Generation Programme linked financing support.",
      },
      {
        slug: "pm-fasal-bima-yojana",
        name: "PM Fasal Bima Yojana",
        detail: "Crop insurance support under scheme-linked agricultural coverage.",
      },
    ],
  },
  "trade-services": {
    title: "Global Trade Services",
    description: "Trade finance and import-export banking support for global business flows.",
    items: [
      {
        slug: "export-trade-services",
        name: "Export Trade Services",
        detail: "Pre and post-shipment funding with export transaction support.",
      },
      {
        slug: "import-trade-services",
        name: "Import Trade Services",
        detail: "Import-linked payment, credit, and compliance transaction flows.",
      },
      {
        slug: "buyers-credit",
        name: "Buyers Credit",
        detail: "Short-term import finance to optimize business cashflow.",
      },
      {
        slug: "bill-discounting",
        name: "Bill Discounting",
        detail: "Discounting solutions to unlock receivables and improve liquidity.",
      },
      {
        slug: "multi-currency-funding",
        name: "Multi-Currency Funding",
        detail: "Trade funding in multiple currencies with exchange-rate support.",
      },
      {
        slug: "trade-specialist-assistance",
        name: "Trade Specialist Assistance",
        detail: "Certified trade specialist guidance for cross-border banking operations.",
      },
    ],
  },
  security: {
    title: "Security and Fraud Awareness",
    description: "Learn safe banking practices and report suspicious activity quickly.",
    items: [
      {
        slug: "fraud-awareness",
        name: "Fraud Awareness",
        detail: "Recognize phishing, OTP scams, and secure your digital identity.",
      },
      {
        slug: "safe-banking-guidelines",
        name: "Safe Banking Guidelines",
        detail: "Use strong passwords, 2-step verification, and secure devices.",
      },
      {
        slug: "report-fraud",
        name: "Report Fraud",
        detail: "Escalate suspicious transactions through customer support channels.",
      },
      {
        slug: "eva-digital-assistant",
        name: "EVA Digital Assistant",
        detail: "Use EVA assistant for quick product discovery and support navigation.",
      },
    ],
  },
  support: {
    title: "Customer Support",
    description: "Reach support for account service requests and issue resolution.",
    items: [
      { slug: "contact-us", name: "Contact Us", detail: "24x7 customer care and branch assistance." },
      { slug: "service-requests", name: "Service Requests", detail: "Track service tickets and request updates." },
      { slug: "branch-locator", name: "Branch Locator", detail: "Locate nearest branch and ATM details." },
      { slug: "grievance-redressal", name: "Grievance Redressal", detail: "Escalation channels and resolution timelines." },
      { slug: "nri-mailbox", name: "NRI Mailbox", detail: "Dedicated NRI support request and communication mailbox." },
      { slug: "call-chat-locate", name: "Call Chat Locate", detail: "Unified contact panel for call, chat, and location support." },
    ],
  },
  calculators: {
    title: "Financial Calculators",
    description: "Use calculators for EMI, FD, RD, and SIP investment planning.",
    items: [
      { slug: "emi-calculator", name: "EMI Calculator", detail: "Estimate EMI for loan products." },
      { slug: "fd-calculator", name: "FD Calculator", detail: "Estimate FD maturity amount and returns." },
      { slug: "rd-calculator", name: "RD Calculator", detail: "Estimate recurring deposit maturity value." },
      { slug: "sip-calculator", name: "SIP Calculator", detail: "Estimate SIP wealth accumulation over time." },
    ],
  },
  offers: {
    title: "Exclusive Offers",
    description: "Find latest cashback, discounts, and partner merchant campaigns.",
    items: [
      { slug: "shopping-offers", name: "Shopping Offers", detail: "Card-based discounts on leading marketplaces." },
      { slug: "travel-offers", name: "Travel Offers", detail: "Airline, hotel, and holiday package discounts." },
      { slug: "dining-offers", name: "Dining Offers", detail: "Restaurant rewards and instant cashback deals." },
      { slug: "fuel-offers", name: "Fuel Offers", detail: "Fuel surcharge waivers and monthly cashback benefits." },
      { slug: "global-remittance-rates", name: "Global Remittance Rates", detail: "Track and use preferential foreign exchange rate offers." },
    ],
  },
  about: {
    title: "About BankIndia",
    description: "Learn about our leadership, careers, and customer-first banking mission.",
    items: [
      { slug: "who-we-are", name: "Who We Are", detail: "Our vision, values, and long-term banking commitments." },
      { slug: "leadership", name: "Leadership", detail: "Executive team and governance structure." },
      { slug: "careers", name: "Careers", detail: "Open roles and hiring programs across India." },
      { slug: "investor-relations", name: "Investor Relations", detail: "Disclosures, reports, and investor updates." },
      {
        slug: "high-net-worth-faq",
        name: "High-Net-Worth FAQ",
        detail: "Frequently asked questions for HNI relationship and wealth banking.",
      },
    ],
  },
  regulatory: {
    title: "Regulatory and Policy Information",
    description: "Review policy, disclosures, and regulatory guidance.",
    items: [
      { slug: "disclosures", name: "Disclosures", detail: "Regulatory disclosures and customer notices." },
      { slug: "security-guidelines", name: "Security Guidelines", detail: "Official digital banking safety guidelines." },
      { slug: "privacy-policy", name: "Privacy Policy", detail: "How customer data is handled and protected." },
      { slug: "terms-and-conditions", name: "Terms and Conditions", detail: "Product and service usage terms." },
    ],
  },
};

export default serviceCatalog;
