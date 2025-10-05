import React, { useState } from "react";

const CreateVMModal = ({ isOpen, onClose, onCreated, subscriptionId }) => {
  const [rgName, setRgName] = useState("");
  const [location, setLocation] = useState("westeurope");
  const [vmName, setVmName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !subscriptionId) return null;

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/create_vm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionId,
          rgName,
          location,
          vmName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd tworzenia VM");
      onCreated(); // odświeżenie listy VM
      onClose();   // zamknięcie modala
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2>🖥️ Utwórz maszynę wirtualną</h2>

        <label>Nazwa VM:</label>
        <input
          type="text"
          value={vmName}
          onChange={e => setVmName(e.target.value)}
          placeholder="np. my-vm"
        />

        <label>Grupa zasobów:</label>
        <input
          type="text"
          value={rgName}
          onChange={e => setRgName(e.target.value)}
          placeholder="np. my-rg"
        />

        <label>Lokalizacja:</label>
        <input
          type="text"
          value={location}
          onChange={e => setLocation(e.target.value)}
          placeholder="np. westeurope"
        />

        {error && <p style={{ color: "red" }}>❌ {error}</p>}

        <div style={{ marginTop: "20px" }}>
          <button onClick={handleSubmit} disabled={loading || !vmName || !rgName}>
            {loading ? "Tworzenie..." : "Utwórz VM"}
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
    backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center"
  },
  modal: {
    background: "white", padding: "30px", borderRadius: "8px", width: "400px", boxShadow: "0 0 10px rgba(0,0,0,0.3)"
  }
};

export default CreateVMModal;
