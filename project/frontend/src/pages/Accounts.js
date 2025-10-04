import React, { useEffect, useState } from "react";

const Accounts = () => {
  const [accounts, setAccounts] = useState([]);

  const refresh = () => {
    fetch("/api/accounts")
      .then((res) => res.json())
      .then((data) => setAccounts(data))
      .catch((err) => console.error("Błąd pobierania kont:", err));
  };

  useEffect(() => {
    refresh();
  }, []);

  const addAzureAccount = () => {
    window.location.href = "/api/login"; // logowanie Azure
  };

  const addAwsAccount = () => {
    alert("Logowanie AWS będzie dostępne później 🚀");
  };

  const addGcpAccount = () => {
    alert("Logowanie GCP będzie dostępne później 🚀");
  };

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h1>Konta w Multi-Cloud Manager</h1>

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button onClick={addAzureAccount} style={{ padding: "10px", flex: 1, background: "#0078D4", color: "white", border: "none", borderRadius: "8px" }}>
          Dodaj konto Azure
        </button>
        <button onClick={addAwsAccount} style={{ padding: "10px", flex: 1, background: "#FF9900", color: "black", border: "none", borderRadius: "8px" }}>
          Dodaj konto AWS
        </button>
        <button onClick={addGcpAccount} style={{ padding: "10px", flex: 1, background: "#4285F4", color: "white", border: "none", borderRadius: "8px" }}>
          Dodaj konto GCP
        </button>
      </div>

      {accounts.length === 0 ? (
        <p>Brak zalogowanych kont</p>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {accounts.map((acc, idx) => (
            <div key={idx} style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "12px", boxShadow: "0 2px 5px rgba(0,0,0,0.1)" }}>
              <h3>{acc.displayName}</h3>
              <p>Provider: <strong>{acc.provider}</strong></p>
              {acc.tenantId && <p>Tenant: {acc.tenantId}</p>}
              {acc.subscriptions && acc.subscriptions.length > 0 ? (
                <ul>
                  {acc.subscriptions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              ) : (
                <p>Brak subskrypcji</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Accounts;
