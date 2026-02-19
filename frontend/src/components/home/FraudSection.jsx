import React from "react";
import { Link } from "react-router-dom";

const FraudSection = () => {
  return (
    <section className="fraud-section">
      <div className="home-shell fraud-inner fade-up">
        <div>
          <h2 className="section-title">Let's Make India Fraud-Free</h2>
          <p>
            Never share OTP, PIN or CVV with anyone. Use only official banking channels for login and transactions.
            Enable instant debit alerts for every account.
          </p>
        </div>
        <Link to="/services/security/fraud-awareness">Know More</Link>
      </div>
    </section>
  );
};

export default FraudSection;
