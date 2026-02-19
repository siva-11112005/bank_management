import React from "react";
import { Link } from "react-router-dom";

const cards = [
  {
    title: "Account Services",
    description: "Open savings account, update KYC, and manage account requests online.",
    route: "/services/accounts",
  },
  {
    title: "Loan Services",
    description: "Check eligibility and apply instantly for personal, home, and business loans.",
    route: "/services/loans",
  },
  {
    title: "Card Services",
    description: "Manage card limit, convert spends to EMI, and track reward points.",
    route: "/services/cards",
  },
  {
    title: "Deposit Services",
    description: "Create fixed deposits and recurring deposits with assured returns.",
    route: "/services/deposits",
  },
  {
    title: "Wholesale Banking",
    description: "Enterprise-grade banking for corporates, government, and institutions.",
    route: "/services/wholesale",
  },
  {
    title: "Agri Banking",
    description: "Access tractor, crop, and allied activity financing with rural support.",
    route: "/services/agri",
  },
  {
    title: "MSME Banking",
    description: "Business cards, working capital, and growth-focused MSME services.",
    route: "/services/msme",
  },
  {
    title: "Global Trade Services",
    description: "Export/import trade finance, bill discounting, and multi-currency support.",
    route: "/services/trade-services",
  },
  {
    title: "Government Schemes",
    description: "Discover PM FME, CGTMSE, startup guarantee, and PMEGP-linked support.",
    route: "/services/government-schemes",
  },
];

const HelpSection = () => {
  return (
    <section className="help-section">
      <div className="home-shell">
        <h2 className="section-title fade-up">How Can We Help You?</h2>
        <div className="help-grid">
          {cards.map((card, index) => (
            <article key={card.title} className="help-card fade-up" style={{ animationDelay: `${index * 0.08}s` }}>
              <div className="help-icon"></div>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
              <Link to={card.route}>View More</Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HelpSection;
