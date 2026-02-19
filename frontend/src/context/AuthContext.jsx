import React, { createContext, useContext, useState, useEffect } from "react";
import { getProfile, logout as logoutAPI } from "../services/api";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem("token");
      if (token) {
        try {
          const response = await getProfile();
          if (response.data.success) {
            setUser(response.data.user);
            setIsAuthenticated(true);
          }
        } catch (error) {
          localStorage.removeItem("token");
          setIsAuthenticated(false);
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const login = (token, userData) => {
    localStorage.setItem("token", token);
    setUser(userData);
    setIsAuthenticated(true);
  };

  const updateCurrentUser = (userData) => {
    setUser(userData || null);
    setIsAuthenticated(Boolean(userData));
  };

  const logout = async () => {
    try {
      await logoutAPI();
    } catch (error) {
      console.error("Logout error:", error);
    }
    localStorage.removeItem("token");
    updateCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAuthenticated, login, logout, updateCurrentUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
