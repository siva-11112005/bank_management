const services = [
  {
    title: "Account Services",
    description: "Open savings accounts, update KYC, order cheque books and manage beneficiaries online.",
  },
  {
    title: "Loan Services",
    description: "Apply for home, personal, vehicle or business loans with quick in-principle approvals.",
  },
  {
    title: "Card Services",
    description: "Track credit card applications, block cards instantly and manage rewards in one place.",
  },
  {
    title: "Deposit Services",
    description: "Book fixed and recurring deposits with flexible tenure and assured returns.",
  },
];

const HelpSection = () => {
  return (
    <section className="bg-accent py-14">
      <div className="section-container">
        <div className="mb-8 text-center animate-fade-up">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Service hub</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">How Can We Help You?</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {services.map((service, index) => (
            <article
              key={service.title}
              className="animate-fade-up rounded-xl bg-white p-5 shadow-soft-lg transition hover:-translate-y-1"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 7h16M4 12h16M4 17h10"></path>
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-primary">{service.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{service.description}</p>
              <a href="#" className="mt-4 inline-flex text-sm font-semibold text-primary hover:text-secondary">
                View More
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HelpSection;
