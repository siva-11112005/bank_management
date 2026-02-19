import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { isStrictAdminUser } from "../../utils/adminIdentity";
import serviceCatalog from "../../data/serviceCatalog";
import { getUnreadNotificationCount } from "../../services/api";
import "../../pages/Home.css";

const navItems = [
  {
    title: "Accounts",
    category: "accounts",
    links: [
      { label: "Savings Account", slug: "savings-account" },
      { label: "Salary Account", slug: "salary-account" },
      { label: "Current Account", slug: "current-account" },
      { label: "NRI Accounts", slug: "nri-accounts" },
    ],
  },
  {
    title: "Deposits",
    category: "deposits",
    links: [
      { label: "Fixed Deposit", slug: "fixed-deposit" },
      { label: "Recurring Deposit", slug: "recurring-deposit" },
      { label: "Tax Saver FD", slug: "tax-saver-fd" },
      { label: "NRE Deposits", slug: "nre-deposits" },
    ],
  },
  {
    title: "Cards",
    category: "cards",
    links: [
      { label: "Credit Cards", slug: "credit-cards" },
      { label: "Debit Cards", slug: "debit-cards" },
      { label: "Forex Cards", slug: "forex-cards" },
      { label: "Prepaid Cards", slug: "prepaid-cards" },
    ],
  },
  {
    title: "Loans",
    category: "loans",
    links: [
      { label: "Personal Loan", slug: "personal-loan" },
      { label: "Home Loan", slug: "home-loan" },
      { label: "Car Loan", slug: "car-loan" },
      { label: "Business Loan", slug: "business-loan" },
    ],
  },
  {
    title: "Insurance",
    category: "insurance",
    links: [
      { label: "Life Insurance", slug: "life-insurance" },
      { label: "Health Insurance", slug: "health-insurance" },
      { label: "Travel Insurance", slug: "travel-insurance" },
      { label: "Motor Insurance", slug: "motor-insurance" },
    ],
  },
  {
    title: "Investments",
    category: "investments",
    links: [
      { label: "Mutual Funds", slug: "mutual-funds" },
      { label: "Demat Account", slug: "demat-account" },
      { label: "SIP Plans", slug: "sip-plans" },
      { label: "Bonds", slug: "bonds" },
    ],
  },
  {
    title: "Wholesale",
    category: "wholesale",
    links: [
      { label: "CBX Internet Banking", slug: "cbx-internet-banking" },
      { label: "Corporates Banking", slug: "corporates-banking" },
      { label: "Government Banking", slug: "government-banking" },
      { label: "Investment Banking", slug: "investment-banking" },
    ],
  },
  {
    title: "Agri",
    category: "agri",
    links: [
      { label: "Kisan Dhan Vikas E-Kendra", slug: "kisan-dhan-vikas-e-kendra" },
      { label: "Tractor Loan EMI Calculator", slug: "tractor-loan-emi-calculator" },
      { label: "Agri and Allied Financing", slug: "agri-and-allied-financing" },
      { label: "Rural Banking", slug: "rural-banking" },
    ],
  },
  {
    title: "MSME",
    category: "msme",
    links: [
      { label: "MSME Banking Solutions", slug: "msme-banking-solutions" },
      { label: "Business Cards", slug: "business-cards" },
      { label: "Working Capital", slug: "working-capital" },
      { label: "One Place for Business Banking", slug: "one-place-business-banking" },
    ],
  },
  {
    title: "Gov Schemes",
    category: "government-schemes",
    links: [
      { label: "PM FME", slug: "pm-fme" },
      { label: "CGTMSE", slug: "cgtmse" },
      { label: "Startup Credit Guarantee", slug: "startup-credit-guarantee" },
      { label: "PMEGP", slug: "pmegp" },
    ],
  },
  {
    title: "Trade",
    category: "trade-services",
    links: [
      { label: "Export Trade Services", slug: "export-trade-services" },
      { label: "Import Trade Services", slug: "import-trade-services" },
      { label: "Buyers Credit", slug: "buyers-credit" },
      { label: "Bill Discounting", slug: "bill-discounting" },
    ],
  },
  {
    title: "Security",
    category: "security",
    links: [
      { label: "Fraud Awareness", slug: "fraud-awareness" },
      { label: "Safe Banking Guidelines", slug: "safe-banking-guidelines" },
      { label: "Report Fraud", slug: "report-fraud" },
      { label: "EVA Digital Assistant", slug: "eva-digital-assistant" },
    ],
  },
  {
    title: "Calculators",
    category: "calculators",
    links: [
      { label: "EMI Calculator", slug: "emi-calculator" },
      { label: "FD Calculator", slug: "fd-calculator" },
      { label: "RD Calculator", slug: "rd-calculator" },
      { label: "SIP Calculator", slug: "sip-calculator" },
    ],
  },
  {
    title: "Offers",
    category: "offers",
    links: [
      { label: "Shopping Offers", slug: "shopping-offers" },
      { label: "Travel Offers", slug: "travel-offers" },
      { label: "Dining Offers", slug: "dining-offers" },
      { label: "Fuel Offers", slug: "fuel-offers" },
    ],
  },
  {
    title: "Support",
    category: "support",
    links: [
      { label: "Contact Us", slug: "contact-us" },
      { label: "Service Requests", slug: "service-requests" },
      { label: "Branch Locator", slug: "branch-locator" },
      { label: "Grievance Redressal", slug: "grievance-redressal" },
    ],
  },
  {
    title: "About",
    category: "about",
    links: [
      { label: "Who We Are", slug: "who-we-are" },
      { label: "Leadership", slug: "leadership" },
      { label: "Careers", slug: "careers" },
      { label: "Investor Relations", slug: "investor-relations" },
    ],
  },
  {
    title: "Regulatory",
    category: "regulatory",
    links: [
      { label: "Disclosures", slug: "disclosures" },
      { label: "Security Guidelines", slug: "security-guidelines" },
      { label: "Privacy Policy", slug: "privacy-policy" },
      { label: "Terms and Conditions", slug: "terms-and-conditions" },
    ],
  },
];

const recommendedSearch = [
  { key: "rec-loans", label: "Personal Loan", context: "Loan Services", to: "/services/loans/personal-loan" },
  { key: "rec-home-loan", label: "Home Loan", context: "Loan Services", to: "/services/loans/home-loan" },
  { key: "rec-emi", label: "EMI Calculator", context: "Financial Calculators", to: "/services/calculators/emi-calculator" },
  { key: "rec-trade", label: "Export Trade Services", context: "Global Trade Services", to: "/services/trade-services/export-trade-services" },
];

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <circle cx="11" cy="11" r="7"></circle>
    <path d="M20 20L16.7 16.7"></path>
  </svg>
);

const BellIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M15 17H5l1.3-1.4a2 2 0 0 0 .5-1.4V10a5.2 5.2 0 0 1 10.4 0v4.2a2 2 0 0 0 .5 1.4L19 17h-4z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
);

const HomeNavbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);
  const [canScrollMenuLeft, setCanScrollMenuLeft] = useState(false);
  const [canScrollMenuRight, setCanScrollMenuRight] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const profileMenuRef = useRef(null);
  const searchBoxRef = useRef(null);
  const desktopMenuRef = useRef(null);
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuth();

  const { matchedSearchSuggestions, searchSuggestions } = useMemo(() => {
    const query = String(searchQuery || "").trim().toLowerCase();
    if (!query) {
      return { matchedSearchSuggestions: [], searchSuggestions: recommendedSearch };
    }

    const suggestions = [];
    const seen = new Set();

    Object.entries(serviceCatalog).forEach(([categoryKey, category]) => {
      const categoryText = `${category.title} ${category.description} ${categoryKey}`.toLowerCase();
      if (categoryText.includes(query)) {
        const to = `/services/${categoryKey}`;
        if (!seen.has(to)) {
          seen.add(to);
          const startsWithCategory = category.title.toLowerCase().startsWith(query);
          suggestions.push({
            key: `cat-${categoryKey}`,
            label: category.title,
            context: "Category",
            to,
            score: startsWithCategory ? 30 : 15,
          });
        }
      }

      category.items.forEach((item) => {
        const itemText = `${item.name} ${item.detail} ${item.slug}`.toLowerCase();
        if (itemText.includes(query)) {
          const to = `/services/${categoryKey}/${item.slug}`;
          if (!seen.has(to)) {
            seen.add(to);
            const itemName = item.name.toLowerCase();
            const startsWithItem = itemName.startsWith(query);
            const exactItem = itemName === query;
            suggestions.push({
              key: `item-${categoryKey}-${item.slug}`,
              label: item.name,
              context: category.title,
              to,
              score: exactItem ? 50 : startsWithItem ? 40 : 20,
            });
          }
        }
      });
    });

    suggestions.sort((a, b) => b.score - a.score);
    const rankedMatches = suggestions.slice(0, 4).map(({ score, ...entry }) => entry);
    const ranked = [...rankedMatches];

    if (ranked.length < 4) {
      recommendedSearch.forEach((entry) => {
        if (ranked.length >= 4) return;
        if (!ranked.find((item) => item.to === entry.to)) {
          ranked.push(entry);
        }
      });
    }

    return { matchedSearchSuggestions: rankedMatches, searchSuggestions: ranked };
  }, [searchQuery]);

  const trimmedSearchQuery = String(searchQuery || "").trim();
  const hasTypedSearchQuery = Boolean(trimmedSearchQuery);

  const searchDropdownItems = useMemo(() => {
    const items = searchSuggestions.map((item) => ({ ...item, mode: "service" }));
    if (hasTypedSearchQuery) {
      items.push({
        key: "search-all-results",
        label: `See all results for "${trimmedSearchQuery}"`,
        context: "Open full service search page",
        mode: "all-results",
      });
    }
    return items;
  }, [searchSuggestions, hasTypedSearchQuery, trimmedSearchQuery]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setProfileMenuOpen(false);
      }
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target)) {
        setSearchPanelOpen(false);
        setActiveSearchIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const syncMenuScroll = () => {
      const menu = desktopMenuRef.current;
      if (!menu) return;
      const maxLeft = Math.max(0, menu.scrollWidth - menu.clientWidth);
      setCanScrollMenuLeft(menu.scrollLeft > 2);
      setCanScrollMenuRight(maxLeft - menu.scrollLeft > 2);
    };

    syncMenuScroll();
    window.addEventListener("resize", syncMenuScroll);
    const menu = desktopMenuRef.current;
    if (menu) {
      menu.addEventListener("scroll", syncMenuScroll, { passive: true });
    }

    return () => {
      window.removeEventListener("resize", syncMenuScroll);
      if (menu) {
        menu.removeEventListener("scroll", syncMenuScroll);
      }
    };
  }, [searchQuery, mobileOpen, isAuthenticated]);

  useEffect(() => {
    if (activeSearchIndex >= searchDropdownItems.length) {
      setActiveSearchIndex(searchDropdownItems.length ? 0 : -1);
    }
  }, [activeSearchIndex, searchDropdownItems]);

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadNotifications(0);
      return;
    }

    let mounted = true;
    const fetchUnreadCount = async () => {
      try {
        const response = await getUnreadNotificationCount();
        if (mounted) {
          setUnreadNotifications(Number(response?.data?.unreadCount) || 0);
        }
      } catch (_) {}
    };

    fetchUnreadCount();
    const intervalId = window.setInterval(fetchUnreadCount, 30000);
    window.addEventListener("focus", fetchUnreadCount);
    window.addEventListener("notifications:updated", fetchUnreadCount);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", fetchUnreadCount);
      window.removeEventListener("notifications:updated", fetchUnreadCount);
    };
  }, [isAuthenticated]);

  const closeMenu = () => {
    setMobileOpen(false);
    setProfileMenuOpen(false);
    setSearchPanelOpen(false);
    setActiveSearchIndex(-1);
  };

  const handleLogout = async () => {
    await logout();
    closeMenu();
    navigate("/");
  };

  const openSearchResults = () => {
    const query = searchQuery.trim();
    closeMenu();
    if (!query) {
      navigate("/services");
      return;
    }
    navigate(`/services?q=${encodeURIComponent(query)}`);
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    openSearchResults();
  };

  const handleSearchSuggestionClick = (to) => {
    closeMenu();
    navigate(to);
  };

  const handleSearchOptionSelect = (item) => {
    if (!item) return;
    if (item.mode === "all-results") {
      openSearchResults();
      return;
    }
    if (item.to) {
      handleSearchSuggestionClick(item.to);
    }
  };

  const handleSearchKeyDown = (event) => {
    if (!searchDropdownItems.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSearchPanelOpen(true);
      setActiveSearchIndex((current) => (current + 1) % searchDropdownItems.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSearchPanelOpen(true);
      setActiveSearchIndex((current) => {
        if (current <= 0) return searchDropdownItems.length - 1;
        return current - 1;
      });
      return;
    }

    if (event.key === "Escape") {
      setSearchPanelOpen(false);
      setActiveSearchIndex(-1);
      return;
    }

    if (event.key === "Enter" && searchPanelOpen && activeSearchIndex >= 0) {
      event.preventDefault();
      const selected = searchDropdownItems[activeSearchIndex];
      handleSearchOptionSelect(selected);
    }
  };

  const handleDesktopMenuScroll = (direction) => {
    const menu = desktopMenuRef.current;
    if (!menu) return;
    menu.scrollBy({ left: direction * 240, behavior: "smooth" });
  };

  const canAccessAdmin = isStrictAdminUser(user);

  return (
    <header className="home-navbar">
      <div className="home-shell">
        <div className="home-navbar-inner">
          <Link to="/" className="home-brand">
            <span className="home-brand-mark">BI</span>
            <span className="home-brand-text">
              <strong>BankIndia</strong>
              <small>Banking that moves with you</small>
            </span>
          </Link>

          <div className="home-menu-wrap">
            <button
              type="button"
              className="home-menu-scroll-btn"
              onClick={() => handleDesktopMenuScroll(-1)}
              disabled={!canScrollMenuLeft}
              aria-label="Scroll categories left"
            >
              &#8249;
            </button>
            <ul className="home-menu home-menu-desktop" ref={desktopMenuRef}>
              {navItems.map((item) => (
                <li key={item.title} className="home-menu-item">
                  <Link to={`/services/${item.category}`} className="home-menu-trigger home-menu-link">
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="home-menu-scroll-btn"
              onClick={() => handleDesktopMenuScroll(1)}
              disabled={!canScrollMenuRight}
              aria-label="Scroll categories right"
            >
              &#8250;
            </button>
          </div>

          <div className="home-search-box home-search-box-desktop" ref={searchBoxRef}>
            <form className="home-search-form home-search-form-desktop" onSubmit={handleSearchSubmit}>
              <input
                type="text"
                className="home-search-input"
                placeholder="Search services"
                value={searchQuery}
                onFocus={() => {
                  setSearchPanelOpen(true);
                  setActiveSearchIndex(-1);
                }}
                onKeyDown={handleSearchKeyDown}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSearchPanelOpen(true);
                  setActiveSearchIndex(-1);
                }}
              />
              <button type="submit" className="home-search-btn" aria-label="Search services">
                <SearchIcon />
              </button>
            </form>
            {searchPanelOpen && (
              <div className="home-search-dropdown">
                {searchDropdownItems.length ? (
                  <>
                    {hasTypedSearchQuery && matchedSearchSuggestions.length > 0 ? (
                      <p className="home-search-group-title">Matching Services</p>
                    ) : null}
                    {!hasTypedSearchQuery ? <p className="home-search-group-title">Recommended</p> : null}
                    {hasTypedSearchQuery && matchedSearchSuggestions.length === 0 ? (
                      <p className="home-search-empty">No exact matches. View full search results.</p>
                    ) : null}
                    {searchDropdownItems.map((item, index) => (
                    <button
                      key={item.key}
                      type="button"
                      className={`home-search-suggestion ${item.mode === "all-results" ? "home-search-all-results" : ""} ${
                        activeSearchIndex === index ? "active" : ""
                      }`}
                      onClick={() => handleSearchOptionSelect(item)}
                      onMouseEnter={() => setActiveSearchIndex(index)}
                    >
                      <strong>{item.label}</strong>
                      <span>{item.context}</span>
                    </button>
                    ))}
                  </>
                ) : (
                  <p className="home-search-empty">No matching services found.</p>
                )}
              </div>
            )}
          </div>

          <div className="home-actions">
            {isAuthenticated ? (
              <>
                <Link to="/transactions" className="home-btn home-btn-outline">
                  Transactions
                </Link>
                <Link to="/payments" className="home-btn home-btn-outline">
                  Payments
                </Link>
                <Link to="/notifications" className="home-notification-btn" aria-label="Notifications">
                  <BellIcon />
                  {unreadNotifications > 0 ? (
                    <span className="home-notification-badge">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>
                  ) : null}
                </Link>
                <div className="home-profile-menu" ref={profileMenuRef}>
                  <button
                    type="button"
                    className="home-user-chip home-profile-trigger"
                    onClick={() => setProfileMenuOpen((value) => !value)}
                  >
                    Hi, {user?.firstName || "User"}
                  </button>
                  {profileMenuOpen && (
                    <div className="home-profile-dropdown">
                      <Link to="/dashboard" onClick={closeMenu}>
                        Dashboard
                      </Link>
                      {canAccessAdmin ? (
                        <Link to="/admin" onClick={closeMenu}>
                          Admin
                        </Link>
                      ) : null}
                      <Link to="/profile" onClick={closeMenu}>
                        My Profile
                      </Link>
                      <Link to="/cards" onClick={closeMenu}>
                        Cards
                      </Link>
                      <Link to="/kyc" onClick={closeMenu}>
                        KYC Center
                      </Link>
                      <Link to="/notifications" onClick={closeMenu}>
                        Notifications {unreadNotifications > 0 ? `(${unreadNotifications})` : ""}
                      </Link>
                      <Link to="/security/transaction-pin" onClick={closeMenu}>
                        Security Settings
                      </Link>
                      <button type="button" className="home-profile-logout" onClick={handleLogout}>
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link to="/login" className="home-btn home-btn-primary">
                  Login
                </Link>
                <Link to="/register" className="home-btn home-btn-outline">
                  Open Account
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            className="home-mobile-toggle"
            onClick={() => setMobileOpen((value) => !value)}
            aria-label="Toggle menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>

        {mobileOpen && (
          <div className="home-mobile-panel">
            <div className="home-mobile-actions">
              {isAuthenticated ? (
                <>
                  <Link to="/transactions" className="home-btn home-btn-outline" onClick={closeMenu}>
                    Transactions
                  </Link>
                  <Link to="/profile" className="home-btn home-btn-outline" onClick={closeMenu}>
                    Profile
                  </Link>
                  {canAccessAdmin ? (
                    <Link to="/admin" className="home-btn home-btn-outline" onClick={closeMenu}>
                      Admin
                    </Link>
                  ) : null}
                  <Link to="/security/transaction-pin" className="home-btn home-btn-outline" onClick={closeMenu}>
                    Security
                  </Link>
                  <Link to="/loans" className="home-btn home-btn-outline" onClick={closeMenu}>
                    Loans
                  </Link>
                  <Link to="/payments" className="home-btn home-btn-outline" onClick={closeMenu}>
                    Payments
                  </Link>
                  <Link to="/cards" className="home-btn home-btn-outline" onClick={closeMenu}>
                    Cards
                  </Link>
                  <Link to="/kyc" className="home-btn home-btn-outline" onClick={closeMenu}>
                    KYC
                  </Link>
                  <Link to="/notifications" className="home-btn home-btn-outline" onClick={closeMenu}>
                    Notifications {unreadNotifications > 0 ? `(${unreadNotifications})` : ""}
                  </Link>
                  <button type="button" className="home-btn home-btn-danger" onClick={handleLogout}>
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className="home-btn home-btn-primary" onClick={closeMenu}>
                    Login
                  </Link>
                  <Link to="/register" className="home-btn home-btn-outline" onClick={closeMenu}>
                    Open Account
                  </Link>
                </>
              )}
              <form className="home-mobile-search-form" onSubmit={handleSearchSubmit}>
                <input
                  type="text"
                  className="home-search-input"
                  placeholder="Search services"
                  value={searchQuery}
                  onFocus={() => {
                    setSearchPanelOpen(true);
                    setActiveSearchIndex(-1);
                  }}
                  onKeyDown={handleSearchKeyDown}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setSearchPanelOpen(true);
                    setActiveSearchIndex(-1);
                  }}
                />
                <button type="submit" className="home-search-btn" aria-label="Search services">
                  <SearchIcon />
                </button>
              </form>
              {searchPanelOpen && (
                <div className="home-mobile-search-dropdown">
                  {searchDropdownItems.length ? (
                    <>
                      {hasTypedSearchQuery && matchedSearchSuggestions.length > 0 ? (
                        <p className="home-search-group-title">Matching Services</p>
                      ) : null}
                      {!hasTypedSearchQuery ? <p className="home-search-group-title">Recommended</p> : null}
                      {hasTypedSearchQuery && matchedSearchSuggestions.length === 0 ? (
                        <p className="home-search-empty">No exact matches. View full search results.</p>
                      ) : null}
                      {searchDropdownItems.map((item, index) => (
                      <button
                        key={`mobile-${item.key}`}
                        type="button"
                        className={`home-search-suggestion ${item.mode === "all-results" ? "home-search-all-results" : ""} ${
                          activeSearchIndex === index ? "active" : ""
                        }`}
                        onClick={() => handleSearchOptionSelect(item)}
                        onMouseEnter={() => setActiveSearchIndex(index)}
                      >
                        <strong>{item.label}</strong>
                        <span>{item.context}</span>
                      </button>
                      ))}
                    </>
                  ) : (
                    <p className="home-search-empty">No matching services found.</p>
                  )}
                </div>
              )}
              <Link to="/services" className="home-btn home-btn-outline" onClick={() => setMobileOpen(false)}>
                Search Services
              </Link>
            </div>
            <div className="home-mobile-grid">
              {navItems.map((item) => (
                <details key={item.title} className="home-mobile-card">
                  <summary>{item.title}</summary>
                  <div className="home-mobile-links">
                    {item.links.map((link) => (
                      <Link key={link.slug} to={`/services/${item.category}/${link.slug}`} onClick={closeMenu}>
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default HomeNavbar;
