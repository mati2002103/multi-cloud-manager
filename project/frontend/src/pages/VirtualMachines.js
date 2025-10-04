import React, { useEffect, useState } from "react";

const VirtualMachines = () => {
  const [resourceGroups, setResourceGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Pobieranie listy grup zasobów z backendu Flask
  const fetchResourceGroups = async () => {
    try {
      const res = await fetch("/api/resource_groups", {
        credentials: "include", // 🔥 bardzo ważne — wysyła cookies Flask session
      });

      if (!res.ok) {
        throw new Error(`Błąd HTTP: ${res.status}`);
      }

      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setResourceGroups(data.value || []);
    } catch (err) {
      console.error("Błąd pobierania resource groups:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
   const addRG = () => {
    window.location.href = "/api/create_rg"; 
  };

  useEffect(() => {
    fetchResourceGroups();
  }, []);

  return (
    <div style={{ padding: "20px", maxWidth: "900px", margin: "0 auto" }}>
      <h1>Grupy zasobów (Resource Groups)</h1>
      <p>Lista wszystkich grup zasobów dostępnych w Twoim koncie Azure.</p>
        <button onClick={addRG} style={{ padding: "10px", flex: 1, background: "#0078D4", color: "white", border: "none", borderRadius: "8px" }}>
          Dodaj RG
        </button>
      {loading ? (
        <p>⏳ Ładowanie danych...</p>
      ) : error ? (
        <p style={{ color: "red" }}>❌ Błąd: {error}</p>
      ) : resourceGroups.length === 0 ? (
        <p>Brak dostępnych grup zasobów.</p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: "20px",
            border: "1px solid #ddd",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          }}
        >
          <thead>
            <tr style={{ backgroundColor: "#f5f5f5" }}>
              <th
                style={{
                  textAlign: "left",
                  padding: "10px",
                  borderBottom: "1px solid #ddd",
                }}
              >
                Subscription ID
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "10px",
                  borderBottom: "1px solid #ddd",
                }}
              >
                Resource Group
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "10px",
                  borderBottom: "1px solid #ddd",
                }}
              >
                Location
              </th>
            </tr>
          </thead>
          <tbody>
            {resourceGroups.map((rg, idx) => (
              <tr key={idx}>
                <td
                  style={{
                    padding: "8px",
                    borderBottom: "1px solid #ddd",
                    fontFamily: "monospace",
                  }}
                >
                  {rg.subscriptionId}
                </td>
                <td style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>
                  {rg.resourceGroup}
                </td>
                <td style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>
                  {rg.location}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default VirtualMachines;
