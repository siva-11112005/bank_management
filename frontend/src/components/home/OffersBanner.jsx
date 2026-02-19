import React from "react";
import { Link } from "react-router-dom";

const OffersBanner = () => {
  return (
    <section className="home-shell">
      <div className="offers-banner fade-up">
        <div>
          <p className="offers-kicker">Seasonal Banking Offers</p>
          <h2>Exclusive deals, cashback and discounts</h2>
        </div>
        <Link to="/services/offers" className="offers-cta-link">
          Explore Offers
        </Link>
      </div>
    </section>
  );
};

export default OffersBanner;
