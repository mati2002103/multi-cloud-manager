import React, { useEffect, useState } from "react";

const Containers = () => {
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchContainers = async () => {
    try {
      const res = await fetch("/api/list_containers", {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(`Błąd HTTP: ${res.status}`);
      }

      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setContainers(data.value || []);
    } catch (err) {
      console.error("Błąd pobierania kontenerów:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContainers();
  }, []);

  return (
    <div style={{ padding: "20px", maxWidth: "900px", margin: "0 auto" }}>
      <h1>Kontenery (Azure Container Instances)</h1>
      <p>Lista wszystkich wdrożonych kontenerów w Twoim koncie Azure.</p>

      {loading ? (
        <p>⏳ Ładowanie danych...</p>
      ) : error ? (
        <p style={{ color: "red" }}>❌ Błąd: {error}</p>
      ) : containers.length === 0 ? (
        <p>Brak dostępnych kontenerów.</p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            border: "1px solid #ddd",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          }}
        >
          <thead>
            <tr style={{ backgroundColor: "#f5f5f5" }}>
              <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>
                Nazwa kontenera
              </th>
              <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>
                Resource Group
              </th>
              <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>
                Lokalizacja
              </th>
              <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>
                Status
              </th>
              <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>
                Obraz
              </th>
            </tr>
          </thead>
          <tbody>
            {containers.map((container, idx) => (
              <tr key={idx}>
                <td style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>
                  {container.name}
                </td>
                <td style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>
                  {container.resourceGroup}
                </td>
                <td style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>
                  {container.location}
                </td>
                <td style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>
                  {container.status}
                </td>
                <td style={{ padding: "8px", borderBottom: "1px solid #ddd", fontFamily: "monospace" }}>
                  {container.image}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default Containers;
