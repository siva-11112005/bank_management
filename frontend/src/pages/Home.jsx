import React from "react";
import HomeNavbar from "../components/home/HomeNavbar";
import Hero from "../components/home/Hero";
import WorkspaceActions from "../components/home/WorkspaceActions";
import HelpSection from "../components/home/HelpSection";
import PdfHighlights from "../components/home/PdfHighlights";
import OffersBanner from "../components/home/OffersBanner";
import EmiCalculator from "../components/home/EmiCalculator";
import FraudSection from "../components/home/FraudSection";
import ImpactStats from "../components/home/ImpactStats";
import AppPromo from "../components/home/AppPromo";
import Footer from "../components/home/Footer";
import "./Home.css";

const Home = () => {
  return (
    <div className="home-page">
      <HomeNavbar />
      <main>
        <Hero />
        <WorkspaceActions />
        <HelpSection />
        <PdfHighlights />
        <OffersBanner />
        <EmiCalculator />
        <FraudSection />
        <ImpactStats />
        <AppPromo />
      </main>
      <Footer />
    </div>
  );
};

export default Home;
