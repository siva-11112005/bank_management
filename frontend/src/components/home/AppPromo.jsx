import React from "react";
import { Link } from "react-router-dom";

const AppPromo = () => {
  return (
    <section className="app-promo-section">
      <div className="home-shell app-promo-grid">
        <div className="app-phone-mock fade-up" aria-hidden="true">
          <div className="app-phone-notch"></div>
          <div className="app-phone-screen"></div>
        </div>
        <div className="app-promo-copy fade-up" style={{ animationDelay: "0.1s" }}>
          <h2>Experience New-Age Banking</h2>
          <p>
            Manage UPI, bill payments, card controls, and investments from one secure app. Seamless netbanking and
            mobile banking for every day transactions.
          </p>
          <div className="app-promo-actions">
            <Link to="/services/about/who-we-are">Download App</Link>
            <Link to="/login">NetBanking</Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AppPromo;
