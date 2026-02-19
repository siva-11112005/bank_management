import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { isStrictAdminUser } from "../utils/adminIdentity";
import "./Navbar.css";

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const canAccessAdmin = isStrictAdminUser(user);

  const closeMenu = () => setMobileMenuOpen(false);

  const handleLogout = async () => {
    await logout();
    closeMenu();
    navigate("/login");
  };

  const toggleMenu = () => setMobileMenuOpen((value) => !value);

  return (
    <nav className="navbar">
      <div className="nav-container">
        <div className="nav-logo">
          <Link to="/" onClick={closeMenu}>
            <span className="logo-mark" aria-hidden="true">
              <span className="logo-mark-blue"></span>
              <span className="logo-mark-red"></span>
            </span>
            <span className="logo-copy">
              <strong>BankIndia</strong>
              <small>Digital Banking</small>
            </span>
          </Link>
        </div>

        <ul className={`nav-menu ${mobileMenuOpen ? "active" : ""}`}>
          {user ? (
            <>
              <li className="nav-item">
                <span className="user-greeting">Welcome, {user.firstName}</span>
              </li>
              {canAccessAdmin && (
                <li className="nav-item">
                  <span className="admin-identity-chip">Verified Admin</span>
                </li>
              )}
              <li className="nav-item">
                <Link to="/dashboard" className="nav-link" onClick={closeMenu}>
                  Dashboard
                </Link>
              </li>
              <li className="nav-item">
                <Link to="/transactions" className="nav-link" onClick={closeMenu}>
                  Transactions
                </Link>
              </li>
              <li className="nav-item">
                <Link to="/loans" className="nav-link" onClick={closeMenu}>
                  Loans
                </Link>
              </li>
              <li className="nav-item">
                <Link to="/profile" className="nav-link" onClick={closeMenu}>
                  Profile
                </Link>
              </li>
              <li className="nav-item">
                <Link to="/services" className="nav-link" onClick={closeMenu}>
                  Services
                </Link>
              </li>
              {canAccessAdmin && (
                <li className="nav-item">
                  <Link to="/admin" className="nav-link admin-link" onClick={closeMenu}>
                    Admin Panel
                  </Link>
                </li>
              )}
              <li className="nav-item">
                <button onClick={handleLogout} className="logout-btn">
                  Logout
                </button>
              </li>
            </>
          ) : (
            <>
              <li className="nav-item">
                <Link to="/login" className="nav-link" onClick={closeMenu}>
                  Login
                </Link>
              </li>
              <li className="nav-item">
                <Link to="/register" className="nav-link cta-link" onClick={closeMenu}>
                  Register
                </Link>
              </li>
            </>
          )}
        </ul>

        <div
          className={`hamburger ${mobileMenuOpen ? "active" : ""}`}
          onClick={toggleMenu}
          role="button"
          tabIndex={0}
          aria-label="Toggle navigation menu"
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              toggleMenu();
            }
          }}
        >
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
