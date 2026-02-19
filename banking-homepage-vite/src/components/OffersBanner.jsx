const OffersBanner = () => {
  return (
    <section className="section-container">
      <div className="animate-fade-up rounded-xl bg-gradient-to-r from-primary via-blue-800 to-secondary p-6 text-white shadow-soft-lg sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-100">Rewards and privileges</p>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Exclusive deals, cashback and discounts</h2>
            <p className="mt-2 max-w-2xl text-sm text-blue-100 sm:text-base">
              Get curated travel, dining and shopping benefits on selected debit and credit card spends.
            </p>
          </div>
          <button className="w-fit rounded-xl bg-white px-5 py-3 text-sm font-semibold text-primary transition hover:-translate-y-1">
            Explore Offers
          </button>
        </div>
      </div>
    </section>
  );
};

export default OffersBanner;
