const footerColumns = [
  {
    title: "About Us",
    links: ["Who We Are", "Leadership", "Careers", "Newsroom"],
  },
  {
    title: "Products",
    links: ["Savings Accounts", "Credit Cards", "Loans", "Insurance"],
  },
  {
    title: "Calculators",
    links: ["EMI Calculator", "FD Calculator", "RD Calculator", "SIP Calculator"],
  },
  {
    title: "Customer Support",
    links: ["Contact Us", "Service Requests", "Branch Locator", "Report Fraud"],
  },
  {
    title: "Regulatory Links",
    links: ["RBI Awareness", "Deposit Insurance", "Investor Relations", "Disclosures"],
  },
];

const Footer = () => {
  return (
    <footer className="bg-slate-950 text-slate-200">
      <div className="section-container py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {footerColumns.map((column) => (
            <div key={column.title}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white">{column.title}</h3>
              <ul className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-sm text-slate-300 transition hover:text-secondary">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-slate-800">
        <div className="section-container flex flex-col gap-3 py-4 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; 2026 BankOne India Ltd.</p>
          <div className="flex flex-wrap items-center gap-4">
            <a href="#" className="hover:text-secondary">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-secondary">
              Terms
            </a>
            <a href="#" className="hover:text-secondary">
              Security
            </a>
            <a href="#" className="hover:text-secondary">
              Sitemap
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
