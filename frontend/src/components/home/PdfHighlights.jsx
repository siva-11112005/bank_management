import React from "react";
import { Link } from "react-router-dom";
import pdfContentMap, { brochureSegments } from "../../data/pdfContentMap";

const routeMap = {
  accounts: "/services/accounts/nri-accounts",
  investments: "/services/investments",
  loans: "/services/loans",
  cards: "/services/cards",
  wholesale: "/services/wholesale",
  msme: "/services/msme",
  "government-schemes": "/services/government-schemes",
  "trade-services": "/services/trade-services",
  support: "/services/support",
  regulatory: "/services/regulatory",
};

const verticals = brochureSegments
  .map((segment) => {
    const source = pdfContentMap[segment.key];
    if (!source) return null;
    return {
      key: segment.key,
      label: segment.label,
      title: source.title,
      points: source.highlights.slice(0, 3),
      route: routeMap[segment.key] || `/services/${segment.key}`,
    };
  })
  .filter(Boolean);

const metrics = [
  { value: "40 Lakh+", label: "CBX Active Users (Monthly)" },
  { value: "2.8 Cr+", label: "API Transactions (Monthly)" },
  { value: "1.45 Lakh+", label: "Institutional Customers" },
  { value: "80L+", label: "Current Accounts Across Segments" },
  { value: "9L Cr+", label: "Loans Disbursed" },
  { value: "9K+", label: "Branch Presence" },
];

const PdfHighlights = () => {
  return (
    <section className="home-shell pdf-highlights-section">
      <div className="pdf-highlight-head fade-up">
        <span className="pdf-pill">Service Coverage</span>
        <h2 className="section-title">Integrated Banking Verticals</h2>
        <p>
          Home page now renders all mapped banking segments: NRI, HNI, wholesale, trade, cards, MSME, agri loans,
          schemes, support, and compliance.
        </p>
      </div>

      <div className="pdf-vertical-grid">
        {verticals.map((item, index) => (
          <article key={item.key} className="pdf-vertical-card fade-up" style={{ animationDelay: `${index * 0.06}s` }}>
            <small className="pdf-segment-tag">{item.label}</small>
            <h3>{item.title}</h3>
            <ul>
              {item.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <Link to={item.route}>Explore</Link>
          </article>
        ))}
      </div>

      <div className="pdf-metric-grid">
        {metrics.map((item) => (
          <article key={item.label} className="pdf-metric-card fade-up">
            <strong>{item.value}</strong>
            <p>{item.label}</p>
          </article>
        ))}
      </div>

      <p className="pdf-note fade-up">
        Compliance note: DICGC registration and policy links are retained via footer and service links.
      </p>
    </section>
  );
};

export default PdfHighlights;
