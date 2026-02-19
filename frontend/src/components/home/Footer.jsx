import React from "react";
import { Link } from "react-router-dom";

const footerColumns = [
  {
    title: "About Us",
    links: [
      { label: "Who We Are", to: "/services/about/who-we-are" },
      { label: "Leadership", to: "/services/about/leadership" },
      { label: "Careers", to: "/services/about/careers" },
      { label: "Investor Relations", to: "/services/about/investor-relations" },
    ],
  },
  {
    title: "Products",
    links: [
      { label: "Savings Accounts", to: "/services/accounts/savings-account" },
      { label: "Credit Cards", to: "/services/cards/credit-cards" },
      { label: "Loans", to: "/services/loans/personal-loan" },
      { label: "Insurance", to: "/services/insurance/life-insurance" },
    ],
  },
  {
    title: "Calculators",
    links: [
      { label: "EMI Calculator", to: "/services/calculators/emi-calculator" },
      { label: "FD Calculator", to: "/services/calculators/fd-calculator" },
      { label: "RD Calculator", to: "/services/calculators/rd-calculator" },
      { label: "SIP Calculator", to: "/services/calculators/sip-calculator" },
    ],
  },
  {
    title: "Customer Support",
    links: [
      { label: "Contact Us", to: "/services/support/contact-us" },
      { label: "Service Requests", to: "/services/support/service-requests" },
      { label: "Branch Locator", to: "/services/support/branch-locator" },
      { label: "Report Fraud", to: "/services/security/report-fraud" },
    ],
  },
  {
    title: "Regulatory Links",
    links: [
      { label: "RBI Awareness", to: "/services/regulatory/disclosures" },
      { label: "Disclosures", to: "/services/regulatory/disclosures" },
      { label: "Security Guidelines", to: "/services/regulatory/security-guidelines" },
      { label: "Policies", to: "/services/regulatory/privacy-policy" },
    ],
  },
];

const Footer = () => {
  return (
    <footer className="home-footer">
      <div className="home-shell home-footer-grid">
        {footerColumns.map((column) => (
          <div key={column.title}>
            <h3>{column.title}</h3>
            <ul>
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link to={link.to}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="home-footer-bottom">
        <div className="home-shell">
          <p>&copy; 2026 BankIndia Ltd.</p>
          <div>
            <Link to="/services/regulatory/privacy-policy">Privacy Policy</Link>
            <Link to="/services/regulatory/terms-and-conditions">Terms</Link>
            <Link to="/services/regulatory/security-guidelines">Security</Link>
            <Link to="/services">Sitemap</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
