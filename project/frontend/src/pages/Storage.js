import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CreateStorageAccountModal from "../components/CreateStorageAccountModal";

const Storage = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  const fetchStorageAccounts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/list_storage_accounts", {
        credentials: "include",
      });

      if (!res.ok) throw new Error(`Błąd HTTP: ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setAccounts(data.value || []);
    } catch (err) {
      console.error("Błąd pobierania Storage Accounts:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStorageAccounts();
  }, []);

  const handleDelete = async (account) => {
    if (!window.confirm(`Czy na pewno chcesz usunąć Storage Account "${account.name}"?`)) return;

    try {
      const res = await fetch("/api/delete_storage_account", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionId: account.subscriptionId,
          resourceGroup: account.resourceGroup,
          accountName: account.name
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd usuwania Storage Account");

      fetchStorageAccounts();
    } catch (err) {
      alert(`❌ ${err.message}`);
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "1000px", margin: "0 auto" }}>
      <h1>📦 Storage Accounts (Azure)</h1>
      <p>Lista wszystkich kont Storage w Twoim środowisku Azure.</p>

      <button
        onClick={fetchStorageAccounts}
        style={buttonStyle}
      >
        🔄 Odśwież
      </button>
      <button
        onClick={() => setShowModal(true)}
        style={buttonStyle}
      >
        ➕ Utwórz Storage Account
      </button>

      <CreateStorageAccountModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onCreated={fetchStorageAccounts}
      />

      {loading ? (
        <p>⏳ Ładowanie danych...</p>
      ) : error ? (
        <p style={{ color: "red" }}>❌ Błąd: {error}</p>
      ) : accounts.length === 0 ? (
        <p>Brak dostępnych Storage Accounts.</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr style={{ backgroundColor: "#f5f5f5" }}>
              <th style={thStyle}>Nazwa</th>
              <th style={thStyle}>Resource Group</th>
              <th style={thStyle}>Lokalizacja</th>
              <th style={thStyle}>SKU</th>
              <th style={thStyle}>Access Tier</th>
              <th style={thStyle}>Typ Storage</th>
              <th style={thStyle}>HTTPS Only</th>
              <th style={thStyle}>Subskrypcja</th>
              <th style={thStyle}>Akcje</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((acc, idx) => (
              <tr key={idx}>
                <td style={tdStyle}>{acc.name}</td>
                <td style={tdStyle}>{acc.resourceGroup}</td>
                <td style={tdStyle}>{acc.location}</td>
                <td style={tdStyle}>{acc.sku}</td>
                <td style={tdStyle}>{acc.accessTier || "—"}</td>
                <td style={tdStyle}>{acc.storageType?.value || acc.storageType || "—"}</td>
                <td style={tdStyle}>{acc.httpsOnly ? "✅" : "❌"}</td>
                <td style={tdStyle}>{acc.subscriptionId}</td>
                <td style={tdStyle}>
                  <button onClick={() => handleDelete(acc)}>🗑</button>
                  <button
                    onClick={() => navigate(`/storage/${acc.name}`, { state: acc })}
                    style={{ marginLeft: "5px" }}
                  >
                    📂 Szczegóły
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

const buttonStyle = {
  padding: "10px",
  background: "#0078D4",
  color: "white",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  marginBottom: "20px",
  marginRight: "10px"
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  border: "1px solid #ddd",
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
};

const thStyle = {
  textAlign: "left",
  padding: "10px",
  borderBottom: "1px solid #ddd",
};

const tdStyle = {
  padding: "8px",
  borderBottom: "1px solid #ddd",
  fontFamily: "monospace",
};

export default Storage;
