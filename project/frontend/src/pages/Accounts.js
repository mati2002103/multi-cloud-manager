import React, { useEffect, useState } from "react";
import { useNavigate } from 'react-router-dom';
const Accounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const refresh = async () => {
    setLoading(true);
    let allAccounts = [];

    try {
      const resBase = await fetch("/api/accounts");
      let baseAccounts = resBase.ok ? await resBase.json() : [];

      const resGCP = await fetch("/api/account/gcp"); 
      const gcpData = resGCP.ok ? await resGCP.json() : { value: [] };
      let gcpAccounts = gcpData.value || []; 

      const nonGCPBaseAccounts = baseAccounts.filter(acc => acc.provider !== 'gcp');

      allAccounts = [...nonGCPBaseAccounts, ...gcpAccounts];

    } catch (err) {
      console.error("Błąd pobierania kont:", err);
    }
    
    setAccounts(allAccounts);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const addAzureAccount = () => {
    window.location.href = "http://localhost:5000/api/login/azure";
  };

  const addAwsAccount = () => {
    navigate('/connect/aws');
  };

  const addGcpAccount = () => {
    window.location.href = 'http://localhost:5000/api/login/google';
  };

  const renderAccountDetails = (acc) => {
    if (acc.provider === "gcp") {
      return (
        <>
          <p>Provider: <strong>GCP (Google Cloud)</strong></p>
          <p>Email: <strong>{acc.email}</strong></p>
          {acc.error && <p style={{color: 'red'}}>Błąd: {acc.error}</p>}
          
          {acc.projects && acc.projects.length > 0 ? (
            <div>
                <p>Projekty:</p>
                <ul>
                    {acc.projects.map((p, i) => (
                        <li key={i}>**{p.displayName}** ({p.projectId})</li>
                    ))}
                </ul>
            </div>
          ) : (
            <p>Brak projektów lub token wygasł</p>
          )}
        </>
      );
    } 
    
    if (acc.provider === "azure") {
      return (
        <>
          <p>Provider: <strong>Azure</strong></p>
          {acc.tenantId && <p>Tenant: {acc.tenantId}</p>}
          {acc.subscriptions && acc.subscriptions.length > 0 ? (
            <div>
              <p>Subskrypcje:</p>
              <ul>
                {acc.subscriptions.map((s, i) => (
                  <li key={i}>{s}</li> 
                ))}
              </ul>
            </div>
          ) : (
            <p>Brak subskrypcji</p>
          )}
        </>
      );
    }
    if (acc.provider === "aws") {
      return (
        <>
          <p>Provider: <strong>AWS (Amazon Web Services)</strong></p>
          {acc.accountId && <p>Account ID: <strong>{acc.accountId}</strong></p>}
          {acc.roleArn && <p>Używana rola (ARN): <strong>{acc.roleArn}</strong></p>}
        </>
      );
    }
    
    return (
        <p>Provider: <strong>{acc.provider}</strong> (Szczegóły nie zdefiniowane)</p>
    );
  };

  if (loading) {
      return (
          <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
              <h1>Ładowanie kont... 🔄</h1>
          </div>
      );
  }

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
        <button onClick={addGcpAccount} style={{ padding: "10px", flex: 1, background: "#19cc0fff", color: "white", border: "none", borderRadius: "8px" }}>
          Dodaj konto GCP
        </button>
      </div>

      {accounts.length === 0 ? (
        <p>Brak zalogowanych kont</p>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {accounts.map((acc, idx) => (
            <div 
              key={idx} 
              style={{ 
                border: "1px solid #ddd", 
                borderRadius: "8px", 
                padding: "12px", 
                boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
                background: acc.provider === "gcp" ? "#e6f4f1" : "white" 
              }}
            >
              <h2>{acc.displayName || acc.email || acc.provider.toUpperCase()}</h2>
              {renderAccountDetails(acc)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Accounts;