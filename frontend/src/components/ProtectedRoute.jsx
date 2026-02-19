import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Loader from "./Loader";
import { isStrictAdminUser } from "../utils/adminIdentity";

const ProtectedRoute = ({ children, requiredRole = null }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <Loader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (requiredRole === "ADMIN" && !isStrictAdminUser(user)) {
    return <Navigate to="/dashboard" />;
  }

  if (requiredRole && requiredRole !== "ADMIN" && user?.role !== requiredRole) {
    return <Navigate to="/dashboard" />;
  }

  return children;
};

export default ProtectedRoute;
