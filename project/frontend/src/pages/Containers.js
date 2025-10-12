import React, { useEffect, useState } from "react";
import CreateContainerModal from "../components/CreateContainerModal";

const Containers = () => {
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const fetchContainers = async () => {
    setLoading(true);
    setError(null);
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
  const handleDelete = async (container) => {
  if (!window.confirm(`Czy na pewno chcesz usunąć kontener "${container.name}"?`)) return;

  try {
    const res = await fetch("/api/delete_container", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscriptionId: container.subscriptionId,
        resourceGroup: container.resourceGroup,
        containerName: container.name
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Błąd usuwania kontenera");

    fetchContainers(); 
  } catch (err) {
    alert(`❌ ${err.message}`);
  }
};
  const handleRestart = async (container) => {
  if (!window.confirm(`Czy chcesz zrestartować kontener: "${container.name}"?`)) return;

  try {
    const res = await fetch("/api/restart_container", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscriptionId: container.subscriptionId,
        resourceGroup: container.resourceGroup,
        containerName: container.name
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Błąd restartowania kontenera");

    fetchContainers(); 
  } catch (err) {
    alert(`❌ ${err.message}`);
  }
};


  useEffect(() => {
    fetchContainers();
  }, []);

  return (
    <div style={{ padding: "20px", maxWidth: "900px", margin: "0 auto" }}>
      <h1>Kontenery (Azure Container Instances)</h1>
      <p>Lista wszystkich wdrożonych kontenerów w Twoim koncie Azure.</p>

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button
          onClick={() => setShowModal(true)}
          style={{
            padding: "10px",
            background: "#0078D4",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer"
          }}
        >
          ➕ Utwórz kontener
        </button>

        <button
          onClick={fetchContainers}
          style={{
            padding: "10px",
            background: "#E0E0E0",
            color: "#333",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer"
          }}
        >
          🔄 Odśwież
        </button>
      </div>

      <CreateContainerModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onCreated={fetchContainers}
      />

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
              <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>
                Monitor
              </th>
              <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>
                Restart
              </th>
              <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>
                Delete
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
                 <td style={{ padding: "8px", borderBottom: "1px solid #ddd", fontFamily: "monospace" }}>
                 🖥️
                </td>
                 <td style={{ padding: "8px", borderBottom: "1px solid #ddd", fontFamily: "monospace" }}>
                 
                  <button
                    onClick={() => handleRestart(container)}>
                    🔁
                  </button>
                </td>
                 <td style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>
                  <button
                    onClick={() => handleDelete(container)}>
                    🗑
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

export default Containers;
