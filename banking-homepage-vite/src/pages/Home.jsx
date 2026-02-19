import Navbar from "../components/Navbar";
import Hero from "../components/Hero";
import HelpSection from "../components/HelpSection";
import OffersBanner from "../components/OffersBanner";
import EmiCalculator from "../components/EmiCalculator";
import FraudSection from "../components/FraudSection";
import ImpactStats from "../components/ImpactStats";
import AppPromo from "../components/AppPromo";
import Footer from "../components/Footer";

const Home = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="space-y-14 pb-14">
        <Hero />
        <HelpSection />
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
