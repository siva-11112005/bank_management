import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";

const formatInr = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);

const clampNumber = (value, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
};

const EmiCalculator = () => {
  const [amount, setAmount] = useState(1200000);
  const [rate, setRate] = useState(9.5);
  const [years, setYears] = useState(5);

  const { emi, totalInterest, totalPayable } = useMemo(() => {
    const p = Math.max(0, Number(amount) || 0);
    const annualRate = Math.max(0, Number(rate) || 0);
    const yearCount = Math.max(0, Number(years) || 0);
    const n = yearCount * 12;

    if (p <= 0 || n <= 0) {
      return { emi: 0, totalInterest: 0, totalPayable: 0 };
    }

    const r = annualRate / 12 / 100;
    const monthlyEmi = r === 0 ? p / n : (p * r * (1 + r) ** n) / ((1 + r) ** n - 1);
    if (!Number.isFinite(monthlyEmi)) {
      return { emi: 0, totalInterest: 0, totalPayable: 0 };
    }

    const payable = monthlyEmi * n;
    return {
      emi: monthlyEmi,
      totalInterest: payable - p,
      totalPayable: payable,
    };
  }, [amount, rate, years]);

  return (
    <section className="home-shell">
      <div className="emi-wrap fade-up">
        <h2 className="section-title">Loan EMI Calculator</h2>
        <div className="emi-grid">
          <div className="emi-inputs">
            <label>
              Loan Amount: <strong>{formatInr(amount)}</strong>
            </label>
            <input
              type="range"
              min={50000}
              max={5000000}
              step={1000}
              value={amount}
              onChange={(event) => setAmount(clampNumber(event.target.value, 50000, 5000000))}
            />

            <div className="emi-inline-inputs">
              <label>
                Loan Amount (Rs)
                <input
                  type="number"
                  value={amount}
                  min={50000}
                  max={5000000}
                  step={1000}
                  onChange={(event) => setAmount(clampNumber(event.target.value, 50000, 5000000))}
                />
              </label>
              <label>
                Interest Rate (%)
                <input
                  type="number"
                  value={rate}
                  min={0}
                  max={36}
                  step={0.1}
                  onChange={(event) => setRate(clampNumber(event.target.value, 0, 36))}
                />
              </label>
              <label>
                Tenure (Years)
                <input
                  type="number"
                  value={years}
                  min={1}
                  max={30}
                  step={1}
                  onChange={(event) => setYears(clampNumber(event.target.value, 1, 30))}
                />
              </label>
            </div>
          </div>

          <div className="emi-results">
            <article>
              <p>Monthly EMI</p>
              <strong>{formatInr(emi)}</strong>
            </article>
            <article>
              <p>Total Interest</p>
              <strong>{formatInr(totalInterest)}</strong>
            </article>
            <article>
              <p>Total Payable</p>
              <strong>{formatInr(totalPayable)}</strong>
            </article>
          </div>
        </div>
        <div className="emi-actions">
          <Link to="/login" className="home-btn-solid">
            Apply Now
          </Link>
          <Link to="/services/loans/emi-calculator" className="home-btn-outline-blue">
            Know More
          </Link>
        </div>
      </div>
    </section>
  );
};

export default EmiCalculator;
