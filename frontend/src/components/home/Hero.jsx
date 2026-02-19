import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { isStrictAdminUser } from "../../utils/adminIdentity";

const Hero = () => {
  const { isAuthenticated, user } = useAuth();
  const canAccessAdmin = isStrictAdminUser(user);
  const destination = canAccessAdmin ? "/admin" : "/profile";
  const primaryAction = isAuthenticated
    ? { label: canAccessAdmin ? "Open Admin Console" : "Open My Profile", route: destination }
    : { label: "Open Account", route: "/register" };
  const secondaryAction = isAuthenticated
    ? { label: "Explore Services", route: "/services" }
    : { label: "Apply Loan", route: "/login" };

  const quickCards = isAuthenticated
    ? [
        { title: "My Profile", desc: "Access profile controls and dashboard entry from one place.", route: "/profile" },
        { title: "Loan Services", desc: "Apply for loans and manage monthly EMI payments.", route: "/loans" },
        { title: "Payment Center", desc: "Create orders, verify payments, and review payment history.", route: "/payments" },
        { title: "Profile & Security", desc: "Maintain contact details and account access controls.", route: "/profile" },
      ]
    : [
        { title: "Update PAN", desc: "Complete PAN and KYC update in minutes.", route: "/services/accounts/update-pan" },
        { title: "Add Nominee", desc: "Secure your account with nominee details.", route: "/services/accounts/add-nominee" },
        { title: "Open Fixed Deposit", desc: "Book FD online with competitive interest.", route: "/services/deposits/open-fixed-deposit" },
        { title: "Track Credit Card", desc: "Track your card application instantly.", route: "/services/cards/track-credit-card" },
      ];

  return (
    <section className="hero-section">
      <div className="hero-overlay"></div>
      <div className="home-shell hero-content">
        <div className="hero-copy fade-up">
          <p className="hero-kicker">India's Trusted Digital Bank</p>
          <h1>{isAuthenticated ? `Welcome back, ${user?.firstName || "Customer"}` : "Banking Solutions Tailor-Made For You"}</h1>
          <p>
            {isAuthenticated
              ? "Continue with transfers, loan management, and account operations without switching interfaces."
              : "Secure. Smart. Seamless digital banking."}
          </p>
          <div className="hero-cta">
            <Link to={primaryAction.route} className="hero-btn hero-btn-primary">
              {primaryAction.label}
            </Link>
            <Link to={secondaryAction.route} className="hero-btn hero-btn-secondary">
              {secondaryAction.label}
            </Link>
          </div>
        </div>
        <div className="hero-quick-grid">
          {quickCards.map((card, index) => (
            <article key={card.title} className="hero-quick-card fade-up" style={{ animationDelay: `${0.1 + index * 0.08}s` }}>
              <h3>{card.title}</h3>
              <p>{card.desc}</p>
              <Link to={card.route}>Open</Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Hero;
