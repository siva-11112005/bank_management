import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { isStrictAdminUser } from "../../utils/adminIdentity";

const WorkspaceActions = () => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return null;
  }

  const actions = [
    {
      title: "My Profile",
      description: "Manage profile controls and open dashboard access from profile section.",
      to: "/profile",
    },
    {
      title: "Payment Center",
      description: "Create orders, verify payments, and view full payment history.",
      to: "/payments",
    },
    {
      title: "Loan Desk",
      description: "Apply for loans, track status, and pay EMI from one workflow.",
      to: "/loans",
    },
    {
      title: "Card Center",
      description: "Apply card, block or unblock card, reissue card, and update usage limits.",
      to: "/cards",
    },
    {
      title: "Service Explorer",
      description: "Access all PDF-mapped banking features from one searchable catalog.",
      to: "/services",
    },
    {
      title: "Transaction PIN Security",
      description: "Set or update your encrypted 4-digit transfer PIN in secure mode.",
      to: "/security/transaction-pin",
    },
    {
      title: "Profile & KYC",
      description: "Maintain personal details and contact information securely.",
      to: "/kyc",
    },
  ];

  if (isStrictAdminUser(user)) {
    actions.unshift({
      title: "Admin Command Center",
      description: "Manage users, accounts, approvals, loans, payments, and analytics tabs.",
      to: "/admin",
    });
  }

  return (
    <section className="home-shell workspace-section">
      <div className="workspace-head fade-up">
        <span className="workspace-pill">After Login</span>
        <h2 className="section-title">All Banking Features Stay Available</h2>
        <p>Your post-login workspace keeps the same UI tone while unlocking full feature access.</p>
      </div>
      <div className="workspace-grid">
        {actions.map((action, index) => (
          <article key={action.title} className="workspace-card fade-up" style={{ animationDelay: `${index * 0.06}s` }}>
            <h3>{action.title}</h3>
            <p>{action.description}</p>
            <Link to={action.to}>Open</Link>
          </article>
        ))}
      </div>
    </section>
  );
};

export default WorkspaceActions;
