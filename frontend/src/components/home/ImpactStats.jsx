import React from "react";

const stats = [
  { value: "80L+", label: "Current Accounts" },
  { value: "9L Cr+", label: "Loans Disbursed" },
  { value: "20 Lakh+", label: "Business Credit Cards Issued" },
  { value: "9K+", label: "Branch Presence" },
];

const ImpactStats = () => {
  return (
    <section className="home-shell impact-section">
      <h2 className="section-title fade-up">Impact Across Banking Segments</h2>
      <div className="impact-grid">
        {stats.map((stat, index) => (
          <article key={stat.label} className="impact-card fade-up" style={{ animationDelay: `${index * 0.08}s` }}>
            <strong>{stat.value}</strong>
            <p>{stat.label}</p>
          </article>
        ))}
      </div>
    </section>
  );
};

export default ImpactStats;
