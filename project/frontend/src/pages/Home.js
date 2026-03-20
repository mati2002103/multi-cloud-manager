import React from "react";
import { useNavigate } from "react-router-dom";

const Home = () => {
  const navigate = useNavigate();

  const handleLoginAzure = () => {
    window.location.href = "http://localhost:5000/api/login/azure";
  };

  const addGcpAccount = () => {
    window.location.href = "http://localhost:5000/api/login/google";
  };

  const addAwsAccount = () => {
    navigate("/connect/aws", { state: { fromHome: true } });
  };

  const buttonBase = {
    padding: "14px 28px",
    fontSize: "1rem",
    fontWeight: "600",
    borderRadius: "10px",
    border: "none",
    cursor: "pointer",
    transition: "all 0.2s ease",
    minWidth: "220px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #1e3a5f 0%, #2563eb 50%, #1e40af 100%)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        color: "#fff",
        textAlign: "center",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        padding: "24px",
        boxSizing: "border-box",
      }}
    >
      <h1 style={{ fontSize: "2.5rem", fontWeight: "bold", margin: "0 0 8px" }}>
        Multi-Cloud Manager
      </h1>
      <p style={{ fontSize: "1.1rem", margin: "0 0 40px", opacity: 0.95 }}>
        Zarządzaj maszynami wirtualnymi i kontenerami w jednym miejscu
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "16px",
          justifyContent: "center",
          alignItems: "center",
          maxWidth: "720px",
        }}
      >
        <button
          onClick={handleLoginAzure}
          style={{
            ...buttonBase,
            backgroundColor: "#fff",
            color: "#1e3a8a",
          }}
          onMouseOver={(e) => {
            e.target.style.backgroundColor = "#f0f4ff";
            e.target.style.transform = "translateY(-1px)";
            e.target.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
          }}
          onMouseOut={(e) => {
            e.target.style.backgroundColor = "#fff";
            e.target.style.transform = "translateY(0)";
            e.target.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
          }}
        >
          Zaloguj się przez Microsoft
        </button>

        <button
          onClick={addAwsAccount}
          style={{
            ...buttonBase,
            backgroundColor: "#FF9900",
            color: "#232f3e",
          }}
          onMouseOver={(e) => {
            e.target.style.backgroundColor = "#ffad33";
            e.target.style.transform = "translateY(-1px)";
            e.target.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
          }}
          onMouseOut={(e) => {
            e.target.style.backgroundColor = "#FF9900";
            e.target.style.transform = "translateY(0)";
            e.target.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
          }}
        >
          Zaloguj się do AWS
        </button>

        <button
          onClick={addGcpAccount}
          style={{
            ...buttonBase,
            backgroundColor: "#0ebc05",
            color: "#fff",
          }}
          onMouseOver={(e) => {
            e.target.style.backgroundColor = "#0fd612";
            e.target.style.transform = "translateY(-1px)";
            e.target.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
          }}
          onMouseOut={(e) => {
            e.target.style.backgroundColor = "#0ebc05";
            e.target.style.transform = "translateY(0)";
            e.target.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
          }}
        >
          Zaloguj się do GCP
        </button>
      </div>
    </div>
  );
};

export default Home;
