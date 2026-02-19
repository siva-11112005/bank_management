const FraudSection = () => {
  return (
    <section className="bg-blue-50 py-14">
      <div className="section-container">
        <div className="animate-fade-up rounded-xl border border-blue-100 bg-white p-6 shadow-soft-lg sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-secondary">Cyber safety</p>
            <h2 className="mt-2 text-3xl font-bold text-primary">Let's Make India Fraud-Free</h2>
            <p className="mt-3 max-w-3xl text-sm text-slate-600 sm:text-base">
              Never share OTP, PIN, CVV or internet banking credentials. Use verified channels, report suspicious
              links, and activate transaction alerts for every account.
            </p>
          </div>
          <button className="mt-5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-1 sm:mt-0">
            Know More
          </button>
        </div>
      </div>
    </section>
  );
};

export default FraudSection;
