import React from "react";
import "./Loader.css";

const Loader = () => {
  return (
    <div className="loader-container">
      <div className="loader-content">
        <div className="spinner"></div>
        <p className="loader-text">Loading...</p>
        <p className="loader-subtext">Initializing your banking experience</p>
      </div>
    </div>
  );
};

export default Loader;
