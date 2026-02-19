import { useState } from "react";

const menuItems = [
  {
    label: "Accounts",
    note: "Savings, salary, current and premium banking solutions.",
    links: ["Savings Account", "Salary Account", "Current Account", "Rural Banking"],
  },
  {
    label: "Deposits",
    note: "Grow your money with secured deposit products.",
    links: ["Fixed Deposit", "Recurring Deposit", "Tax Saver Deposit", "NRE Deposits"],
  },
  {
    label: "Cards",
    note: "Credit and debit cards built for daily and premium spending.",
    links: ["Credit Cards", "Debit Cards", "Forex Cards", "Business Cards"],
  },
  {
    label: "Loans",
    note: "Fast and transparent financing for life and business goals.",
    links: ["Personal Loan", "Home Loan", "Car Loan", "Business Loan"],
  },
  {
    label: "Insurance",
    note: "Comprehensive life, health and motor protection plans.",
    links: ["Life Insurance", "Health Insurance", "Motor Insurance", "Travel Insurance"],
  },
  {
    label: "Investments",
    note: "Build long-term wealth with diversified investment products.",
    links: ["Mutual Funds", "Demat Account", "SIP Plans", "Government Bonds"],
  },
];

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="11" cy="11" r="7"></circle>
    <path d="M20 20L16.7 16.7"></path>
  </svg>
);

const MenuIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 7H20"></path>
    <path d="M4 12H20"></path>
    <path d="M4 17H20"></path>
  </svg>
);

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <nav className="section-container">
        <div className="flex h-20 items-center justify-between gap-4">
          <a href="#" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-sm font-bold text-white">
              BO
            </span>
            <div>
              <p className="text-base font-semibold text-primary">BankOne India</p>
              <p className="text-xs text-slate-500">Trusted Digital Banking</p>
            </div>
          </a>

          <ul className="hidden items-center gap-1 lg:flex">
            {menuItems.map((item) => (
              <li key={item.label} className="group relative">
                <button className="rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-primary">
                  {item.label}
                </button>
                <div className="pointer-events-none absolute left-1/2 top-full hidden w-[640px] -translate-x-1/2 pt-4 group-hover:block group-focus-within:block">
                  <div className="pointer-events-auto rounded-xl bg-white p-6 shadow-soft-lg ring-1 ring-slate-200">
                    <p className="text-xs font-semibold uppercase tracking-wide text-secondary">{item.label}</p>
                    <p className="mt-1 text-sm text-slate-600">{item.note}</p>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {item.links.map((link) => (
                        <a
                          key={link}
                          href="#"
                          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-secondary hover:text-primary"
                        >
                          {link}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden items-center gap-2 sm:flex">
            <button className="rounded-xl border border-primary px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary hover:text-white">
              Open Account
            </button>
            <button className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-900">
              Login
            </button>
            <button
              className="grid h-10 w-10 place-items-center rounded-xl border border-slate-300 text-slate-600 transition hover:border-primary hover:text-primary"
              aria-label="Search"
            >
              <SearchIcon />
            </button>
          </div>

          <button
            className="rounded-xl border border-slate-300 p-2 text-slate-700 lg:hidden"
            onClick={() => setMobileOpen((value) => !value)}
            aria-label="Toggle navigation"
          >
            <MenuIcon />
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="border-t border-slate-200 bg-white lg:hidden">
          <div className="section-container py-4">
            <div className="flex flex-wrap gap-2 pb-4">
              <button className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">Login</button>
              <button className="rounded-xl border border-primary px-4 py-2 text-sm font-semibold text-primary">
                Open Account
              </button>
              <button className="grid h-10 w-10 place-items-center rounded-xl border border-slate-300 text-slate-600">
                <SearchIcon />
              </button>
            </div>
            <div className="grid gap-3">
              {menuItems.map((item) => (
                <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-primary">{item.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.note}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {item.links.map((link) => (
                      <a key={link} href="#" className="text-xs font-medium text-slate-700 hover:text-primary">
                        {link}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
