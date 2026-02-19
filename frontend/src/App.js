import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Loader from "./components/Loader";
import HomeNavbar from "./components/home/HomeNavbar";
import { isStrictAdminUser } from "./utils/adminIdentity";

// Pages
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import Transactions from "./pages/Transactions";
import TransactionAuthorize from "./pages/TransactionAuthorize";
import Loans from "./pages/Loans";
import Payments from "./pages/Payments";
import TransactionSecurity from "./pages/TransactionSecurity";
import AdminPanel from "./pages/AdminPanel";
import Home from "./pages/Home";
import ServiceExplorer from "./pages/ServiceExplorer";
import SupportCenter from "./pages/SupportCenter";
import Notifications from "./pages/Notifications";
import Cards from "./pages/Cards";
import KycCenter from "./pages/KycCenter";

import "./App.css";

const AppContent = () => {
  const { loading, isAuthenticated, user } = useAuth();
  const location = useLocation();

  const hideNavbarPaths = ["/", "/login", "/register", "/forgot-password"];
  const showNavbar = !hideNavbarPaths.includes(location.pathname) && !location.pathname.startsWith("/services");
  const authenticatedLandingPath = isStrictAdminUser(user) ? "/admin" : "/dashboard";

  if (loading) {
    return <Loader />;
  }

  return (
    <div className="app-main">
      {showNavbar && <HomeNavbar />}
      <Routes>
        {/* Public Home */}
        <Route path="/" element={<Home />} />

        {/* Public Routes */}
        <Route path="/login" element={isAuthenticated ? <Navigate to={authenticatedLandingPath} replace /> : <Login />} />
        <Route path="/register" element={isAuthenticated ? <Navigate to={authenticatedLandingPath} replace /> : <Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/services" element={<ServiceExplorer />} />
        <Route path="/services/:category" element={<ServiceExplorer />} />
        <Route path="/services/:category/:product" element={<ServiceExplorer />} />

        {/* Protected User Routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/transactions"
          element={
            <ProtectedRoute>
              <Transactions />
            </ProtectedRoute>
          }
        />
        <Route
          path="/transactions/quick-transfer"
          element={
            <ProtectedRoute>
              <Transactions />
            </ProtectedRoute>
          }
        />
        <Route
          path="/transactions/authorize"
          element={
            <ProtectedRoute>
              <TransactionAuthorize />
            </ProtectedRoute>
          }
        />
        <Route
          path="/loans"
          element={
            <ProtectedRoute>
              <Loans />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payments"
          element={
            <ProtectedRoute>
              <Payments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/security/transaction-pin"
          element={
            <ProtectedRoute>
              <TransactionSecurity />
            </ProtectedRoute>
          }
        />
        <Route
          path="/support"
          element={
            <ProtectedRoute>
              <SupportCenter />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards"
          element={
            <ProtectedRoute>
              <Cards />
            </ProtectedRoute>
          }
        />
        <Route
          path="/kyc"
          element={
            <ProtectedRoute>
              <KycCenter />
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <Notifications />
            </ProtectedRoute>
          }
        />

        {/* Protected Admin Routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRole="ADMIN">
              <AdminPanel />
            </ProtectedRoute>
          }
        />

        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;
