import { useMemo, useState } from "react";

const formatINR = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

const EmiCalculator = () => {
  const [loanAmount, setLoanAmount] = useState(1200000);
  const [interestRate, setInterestRate] = useState(9.2);
  const [tenureYears, setTenureYears] = useState(5);

  const result = useMemo(() => {
    const principal = Number(loanAmount);
    const monthlyRate = Number(interestRate) / 12 / 100;
    const months = Number(tenureYears) * 12;

    const emi =
      monthlyRate === 0
        ? principal / months
        : (principal * monthlyRate * (1 + monthlyRate) ** months) / ((1 + monthlyRate) ** months - 1);

    const totalPayable = emi * months;
    const totalInterest = totalPayable - principal;

    return {
      emi,
      totalPayable,
      totalInterest,
    };
  }, [loanAmount, interestRate, tenureYears]);

  return (
    <section id="emi-calculator" className="section-container">
      <div className="mx-auto max-w-5xl animate-fade-up rounded-xl border border-slate-200 bg-white p-6 shadow-soft-lg sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-secondary">Loan planning tool</p>
        <h2 className="mt-2 text-3xl font-bold text-primary">Loan EMI Calculator</h2>
        <p className="mt-2 text-sm text-slate-600">
          Plan your loan repayment instantly with transparent EMI and total payable estimates.
        </p>

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm font-medium text-slate-700">
                <label htmlFor="loan-amount">Loan Amount</label>
                <span className="font-semibold text-primary">{formatINR(loanAmount)}</span>
              </div>
              <input
                id="loan-amount"
                type="range"
                min={50000}
                max={5000000}
                step={10000}
                value={loanAmount}
                onChange={(event) => setLoanAmount(Number(event.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-primary"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Interest Rate (% p.a.)</label>
                <input
                  type="number"
                  min={1}
                  max={25}
                  step={0.1}
                  value={interestRate}
                  onChange={(event) => setInterestRate(Number(event.target.value))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Tenure (Years)</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  step={1}
                  value={tenureYears}
                  onChange={(event) => setTenureYears(Number(event.target.value))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Monthly EMI</p>
              <p className="mt-2 text-2xl font-bold text-primary">{formatINR(result.emi)}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Interest</p>
              <p className="mt-2 text-2xl font-bold text-primary">{formatINR(result.totalInterest)}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Payable</p>
              <p className="mt-2 text-2xl font-bold text-primary">{formatINR(result.totalPayable)}</p>
            </article>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-1">
            Apply Now
          </button>
          <button className="rounded-xl border border-primary px-6 py-3 text-sm font-semibold text-primary transition hover:bg-primary/5">
            Know More
          </button>
        </div>
      </div>
    </section>
  );
};

export default EmiCalculator;
