const quickActions = [
  { title: "Update PAN", detail: "Complete KYC update online in under 2 minutes." },
  { title: "Add Nominee", detail: "Secure your account by registering a family nominee." },
  { title: "Open Fixed Deposit", detail: "Start FD online with attractive interest rates." },
  { title: "Track Credit Card", detail: "Check card application status in real time." },
];

const Hero = () => {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        backgroundImage:
          "linear-gradient(110deg, rgba(0,48,135,0.85) 0%, rgba(0,48,135,0.55) 42%, rgba(0,48,135,0.8) 100%), url('https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1600&q=80')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="section-container py-16 sm:py-20 lg:py-24">
        <div className="max-w-3xl animate-fade-up text-white">
          <p className="inline-flex rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-accent">
            Digital-first private banking
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
            Banking Solutions Tailor-Made For You
          </h1>
          <p className="mt-4 max-w-2xl text-base text-blue-50 sm:text-lg">
            Secure. Smart. Seamless digital banking. Manage accounts, investments, cards and loans from one trusted
            platform designed for Indian customers.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button className="rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-slate-900 shadow-soft-lg transition hover:-translate-y-1">
              Open Account
            </button>
            <button className="rounded-xl border border-white/70 bg-transparent px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
              Apply Loan
            </button>
          </div>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((item, index) => (
            <article
              key={item.title}
              className="animate-fade-up rounded-xl border border-white/30 bg-white/95 p-4 shadow-soft-lg transition hover:-translate-y-1"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <h3 className="text-base font-semibold text-primary">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{item.detail}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Hero;
