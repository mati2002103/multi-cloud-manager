import React, { useState } from "react";

const CreateBlobStorageModal = ({ isOpen, onClose, account, endpoint, onCreated }) => {
  const [containerName, setContainerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !account) return null;

  const handleSubmit = async () => {
    if (!containerName.trim()) {
      setError("Nazwa kontenera nie może być pusta");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountName: account.name,
          accountKey: account.Keys,
          containerName: containerName.trim()
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Błąd tworzenia kontenera");

      setContainerName("");
      onClose();
      if (onCreated) onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2>📁 Utwórz kontener blob</h2>
        <p>Dla konta: <strong>{account.name}</strong></p>

        <label>Nazwa kontenera:</label>
        <input
          type="text"
          value={containerName}
          onChange={e => setContainerName(e.target.value)}
          placeholder="np. logs-container"
          style={styles.input}
        />

        {error && <p style={{ color: "red" }}>❌ {error}</p>}

        <div style={styles.actions}>
          <button onClick={handleSubmit} disabled={loading}>
            {loading ? "Tworzenie..." : "Utwórz"}
          </button>
          <button onClick={onClose} style={{ marginLeft: "10px" }}>Anuluj</button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000
  },
  modal: {
    background: "white", padding: "30px", borderRadius: "8px", width: "400px", boxShadow: "0 0 10px rgba(0,0,0,0.3)"
  },
  input: {
    width: "100%", padding: "8px", marginTop: "8px", marginBottom: "12px", borderRadius: "4px", border: "1px solid #ccc"
  },
  actions: {
    marginTop: "20px", display: "flex", justifyContent: "flex-end"
  }
};

export default CreateBlobStorageModal;
