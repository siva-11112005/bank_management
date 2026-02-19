const stats = [
  { value: "80L+", label: "Current Accounts" },
  { value: "9L Cr+", label: "Loans Disbursed" },
  { value: "20 Lakh+", label: "Business Credit Cards Issued" },
  { value: "9K+", label: "Branch Presence" },
];

const ImpactStats = () => {
  return (
    <section className="section-container py-14">
      <div className="mb-8 animate-fade-up text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-secondary">Banking impact</p>
        <h2 className="mt-2 text-3xl font-bold text-primary">Impact Across Banking Segments</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <article
            key={stat.label}
            className="animate-fade-up rounded-xl border border-slate-200 bg-white p-5 text-center shadow-soft-lg transition hover:-translate-y-1"
            style={{ animationDelay: `${index * 120}ms` }}
          >
            <p className="text-3xl font-bold text-primary">{stat.value}</p>
            <p className="mt-2 text-sm font-medium text-slate-600">{stat.label}</p>
          </article>
        ))}
      </div>
    </section>
  );
};

export default ImpactStats;
