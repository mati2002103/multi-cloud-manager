import React, { useState, useEffect } from "react";


const CreateStorageAccountModal = ({ isOpen, onClose, onCreated }) => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [subscriptionId, setSubscriptionId] = useState("");
  const [rgName, setRgName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [location, setLocation] = useState("westeurope");
  const [sku, setSku] = useState("Standard_LRS");
  const [kind, setKind] = useState("StorageV2");
  const [accessTier, setAccessTier] = useState("Hot");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const locations = ["westeurope", "northeurope", "eastus", "westus", "centralus"];
  const skuOptions = ["Standard_LRS", "Standard_GRS", "Standard_ZRS"];
  const kindOptions = ["StorageV2", "BlobStorage", "FileStorage"];
  const tierOptions = ["Hot", "Cool", "Archive"];

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
      const res = await fetch("/api/create_storage_account", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionId,
          rgName,
          accountName,
          location,
          sku,
          kind,
          accessTier
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd tworzenia Storage Account");
      onCreated();
      onClose();
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
        <h2>➕ Utwórz Storage Account</h2>

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
        <input value={rgName} onChange={e => setRgName(e.target.value)} placeholder="np. my-rg" />

        <label>Nazwa konta:</label>
        <input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="np. mystorage123" />

        <label>Lokalizacja:</label>
        <select value={location} onChange={e => setLocation(e.target.value)}>
          {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
        </select>

        <label>SKU:</label>
        <select value={sku} onChange={e => setSku(e.target.value)}>
          {skuOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <label>Kind:</label>
        <select value={kind} onChange={e => setKind(e.target.value)}>
          {kindOptions.map(k => <option key={k} value={k}>{k}</option>)}
        </select>

        <label>Access Tier:</label>
        <select value={accessTier} onChange={e => setAccessTier(e.target.value)}>
          {tierOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {error && <p style={{ color: "red" }}>❌ {error}</p>}

        <div style={{ marginTop: "20px" }}>
          <button onClick={handleSubmit} disabled={loading || !subscriptionId || !rgName || !accountName}>
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

export default CreateStorageAccountModal;
