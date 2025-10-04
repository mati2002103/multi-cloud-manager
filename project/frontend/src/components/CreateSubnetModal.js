import React, { useState } from "react";

const CreateSubnetModal = ({ isOpen, onClose, onCreated, vnet }) => {
  const [subnetName, setSubnetName] = useState("");
  const [addressPrefix, setAddressPrefix] = useState("10.0.1.0/24");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !vnet) return null;

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/subnetCreate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionId: vnet.subscriptionId,
          rgName: vnet.resourceGroup,
          vnetName: vnet.network,
          subnetName,
          addressPrefix,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd tworzenia podsieci");
      onCreated(); // odświeżenie listy VNetów
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
        <h2>➕ Dodaj podsieć do {vnet.network}</h2>

        <label>Nazwa podsieci:</label>
        <input
          type="text"
          value={subnetName}
          onChange={e => setSubnetName(e.target.value)}
          placeholder="np. subnet-app"
        />

        <label>Zakres adresów (CIDR):</label>
        <input
          type="text"
          value={addressPrefix}
          onChange={e => setAddressPrefix(e.target.value)}
          placeholder="np. 10.0.1.0/24"
        />

        {error && <p style={{ color: "red" }}>❌ {error}</p>}

        <div style={{ marginTop: "20px" }}>
          <button onClick={handleSubmit} disabled={loading || !subnetName}>
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
    backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center"
  },
  modal: {
    background: "white", padding: "30px", borderRadius: "8px", width: "400px", boxShadow: "0 0 10px rgba(0,0,0,0.3)"
  }
};

export default CreateSubnetModal;
