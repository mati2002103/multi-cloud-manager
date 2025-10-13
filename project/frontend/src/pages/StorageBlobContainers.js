import React, { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import CreateBlobStorageModal from "../components/CreateBlobStorageModal";

const StorageBlobContainers = () => {
  const { name: storageAccountId } = useParams(); // używamy jako storage_account_id
  const { state: account } = useLocation();
  const [containers, setContainers] = useState([]);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const fetchContainers = async () => {
    try {
      const res = await fetch(`/api/${storageAccountId}/list_blob_containers`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountName: account.name,
          accountKey: account.Keys,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Błąd pobierania kontenerów");
      setContainers(data.value || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (containerName) => {
    if (!window.confirm(`Usunąć kontener "${containerName}"?`)) return;
    try {
      const res = await fetch(`/api/${storageAccountId}/delete_blob_container`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountName: account.name,
          accountKey: account.Keys,
          containerName
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd usuwania kontenera");
      fetchContainers();
    } catch (err) {
      alert(`❌ ${err.message}`);
    }
  };

  useEffect(() => {
    fetchContainers();
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h2>📁 Kontenery blob dla: {account.name}</h2>
      <p><strong>Resource Group:</strong> {account.resourceGroup}</p>
      <p><strong>Lokalizacja:</strong> {account.location}</p>

      <button onClick={() => setShowModal(true)} style={btn}>➕ Dodaj kontener</button>
      <CreateBlobStorageModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        account={account}
        endpoint={`/api/${storageAccountId}/create_blob_container`}
        onCreated={fetchContainers}
      />

      {error && <p style={{ color: "red" }}>❌ {error}</p>}
      <ul>
        {containers.map((c, i) => (
          <li key={i}>
            {c.name} — {new Date(c.last_modified).toLocaleString()}
            <button onClick={() => handleDelete(c.name)} style={{ marginLeft: "10px" }}>🗑</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

const btn = {
  padding: "10px",
  background: "#0078D4",
  color: "white",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  marginBottom: "10px"
};

export default StorageBlobContainers;
