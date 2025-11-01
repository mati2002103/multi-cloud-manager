import React from "react";

const Home = () => {
  const handleLogin = () => {
    window.location.href = "http://localhost:5000/api/login/azure"; 
  };

  return (
    <div
      style={{
        height: "100vh",
        background: "linear-gradient(135deg, #2563eb, #1e3a8a)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        color: "#fff",
        textAlign: "center",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "3rem", fontWeight: "bold" }}>
        Multi-Cloud Manager
      </h1>
      <p style={{ fontSize: "1.2rem", margin: "10px 0 30px" }}>
        Zarządzaj maszynami wirtualnymi i kontenerami w jednym miejscu
      </p>
      <button
        onClick={handleLogin}
        style={{
          backgroundColor: "#fff",
          color: "#1e3a8a",
          padding: "12px 24px",
          borderRadius: "8px",
          border: "none",
          cursor: "pointer",
          fontSize: "1rem",
          fontWeight: "bold",
          transition: "0.3s",
        }}
        onMouseOver={(e) => (e.target.style.backgroundColor = "#f3f4f6")}
        onMouseOut={(e) => (e.target.style.backgroundColor = "#fff")}
      >
        Zaloguj się przez Microsoft
      </button>
    </div>
  );
};

export default Home;
