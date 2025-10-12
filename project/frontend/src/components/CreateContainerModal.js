import React, { useState, useEffect } from "react";

const CreateContainerModal = ({ isOpen, onClose, onCreated }) => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [subscriptionId, setSubscriptionId] = useState("");
  const [rgName, setRgName] = useState("");
  const [cnName, setCnName] = useState("");
  const [location, setLocation] = useState("westeurope");
  const [image, setImage] = useState("mcr.microsoft.com/azuredocs/aci-helloworld:latest");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const locations = [
    "westeurope", "northeurope", "eastus", "westus", "centralus", "uksouth", "francecentral"
  ];

  const images = [
    {
      value: "mcr.microsoft.com/azuredocs/aci-helloworld:latest",
      label: "Hello World (Linux) — 1 CPU / 1.5 GiB"
    },
    {
      value: "mcr.microsoft.com/oss/nginx/nginx:1.9.15-alpine",
      label: "NGINX (Linux) — 1 CPU / 1.5 GiB"
    },
    {
      value: "mcr.microsoft.com/windows/servercore:ltsc2022",
      label: "Windows Server Core — 2 CPU / 2.5 GiB"
    }
  ];

  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/subscriptions", { credentials: "include" })
      .then(res => res.json())
      .then(data => setSubscriptions(data.value || []))
      .catch(() => setError("Nie udało się pobrać subskrypcji"));
  }, [isOpen]);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/create_container", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId, rgName, cnName, location, image }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd tworzenia kontenera");
      onCreated(); // odświeżenie listy kontenerów
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
        <h2>🐳 Utwórz nowy kontener</h2>

        <label>Subskrypcja:</label>
        <select value={subscriptionId} onChange={e => setSubscriptionId(e.target.value)}>
          <option value="">-- wybierz --</option>
          {subscriptions.map(sub => (
            <option key={sub.subscriptionId} value={sub.subscriptionId}>
              {sub.displayName} ({sub.subscriptionId})
            </option>
          ))}
        </select>

        <label>Grupa zasobów:</label>
        <input
          type="text"
          value={rgName}
          onChange={e => setRgName(e.target.value)}
          placeholder="np. my-rg-prod"
        />

        <label>Nazwa kontenera:</label>
        <input
          type="text"
          value={cnName}
          onChange={e => setCnName(e.target.value)}
          placeholder="np. my-nginx"
        />

        <label>Lokalizacja:</label>
        <select value={location} onChange={e => setLocation(e.target.value)}>
          {locations.map(loc => (
            <option key={loc} value={loc}>{loc}</option>
          ))}
        </select>

        <label>Obraz kontenera:</label>
        <select value={image} onChange={e => setImage(e.target.value)}>
          {images.map(img => (
            <option key={img.value} value={img.value}>{img.label}</option>
          ))}
        </select>

        {error && <p style={{ color: "red" }}>❌ {error}</p>}

        <div style={{ marginTop: "20px" }}>
          <button onClick={handleSubmit} disabled={loading || !subscriptionId || !rgName || !cnName}>
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

export default CreateContainerModal;
