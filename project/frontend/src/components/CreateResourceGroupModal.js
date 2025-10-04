import React, { useState, useEffect } from "react";

const CreateResourceGroupModal = ({ isOpen, onClose, onCreated }) => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [subscriptionId, setSubscriptionId] = useState("");
  const [rgName, setRgName] = useState("");
  const [location, setLocation] = useState("westeurope");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const locations = [
    "westeurope", "northeurope", "eastus", "westus", "centralus", "uksouth", "francecentral"
  ];

  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/subscriptions", { credentials: "include" })
      .then(res => res.json())
      .then(data => setSubscriptions(data.value || []))
      .catch(err => setError("Nie udało się pobrać subskrypcji"));
  }, [isOpen]);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/create_rg", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId, rgName, location }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd tworzenia RG");
      onCreated(); // np. odświeżenie listy RG
      onClose();   // zamknięcie modala
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2>➕ Utwórz nową grupę zasobów</h2>

        <label>Subskrypcja:</label>
        <select value={subscriptionId} onChange={e => setSubscriptionId(e.target.value)}>
          <option value="">-- wybierz --</option>
          {subscriptions.map(sub => (
            <option key={sub.subscriptionId} value={sub.subscriptionId}>
              {sub.displayName} ({sub.subscriptionId})
            </option>
          ))}
        </select>

        <label>Nazwa grupy zasobów:</label>
        <input
          type="text"
          value={rgName}
          onChange={e => setRgName(e.target.value)}
          placeholder="np. my-rg-prod"
        />

        <label>Lokalizacja:</label>
        <select value={location} onChange={e => setLocation(e.target.value)}>
          {locations.map(loc => (
            <option key={loc} value={loc}>{loc}</option>
          ))}
        </select>

        {error && <p style={{ color: "red" }}>❌ {error}</p>}

        <div style={{ marginTop: "20px" }}>
          <button onClick={handleSubmit} disabled={loading || !subscriptionId || !rgName}>
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

export default CreateResourceGroupModal;
