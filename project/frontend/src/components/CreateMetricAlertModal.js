import React, { useState } from "react";

const CreateMetricAlertModal = ({ isOpen, onClose, onCreated, vmInfo }) => {
  const [alertName, setAlertName] = useState("");
  const [metricName, setMetricName] = useState("Percentage CPU");
  const [threshold, setThreshold] = useState(90);
  const [notifyEmail, setNotifyEmail] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!vmInfo?.subscriptionId || !vmInfo?.resourceGroup || !vmInfo?.location || !vmInfo?.resourceId) {
      setError("Brakujące informacje o VM (Sub, RG, Lokalizacja, ID).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = {
        subscriptionId: vmInfo.subscriptionId,
        resourceGroup: vmInfo.resourceGroup, 
        location: vmInfo.location,
        vmResourceId: vmInfo.resourceId,
        alertName: alertName,
        metricName: metricName,
        threshold: threshold,
        notifyEmail: notifyEmail,
      };

      const res = await fetch("/api/vm/create-alert", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd tworzenia alertu");
      
      alert(data.message || "Alert pomyślnie utworzony.");
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
        <h2>🚨 Utwórz nowy alert metryki dla {vmInfo?.vm || 'VM'}</h2>

        <label>Nazwa alertu:</label>
        <input
          type="text"
          value={alertName}
          onChange={e => setAlertName(e.target.value)}
          placeholder="np. Wysokie CPU na VM"
          style={styles.input}
        />

        <label>Sygnał (Metryka):</label>
        <select value={metricName} onChange={e => setMetricName(e.target.value)} style={styles.input}>
          <option value="Percentage CPU">Percentage CPU</option>
          <option value="Available Memory Bytes">Available Memory Bytes</option>
          {/* Dodaj inne metryki z vmInfo.metrics jeśli chcesz */}
        </select>

        <label>Próg (Threshold):</label>
        <input
          type="number"
          value={threshold}
          onChange={e => setThreshold(Number(e.target.value))}
          style={styles.input}
        />
         <small style={styles.smallText}>
            Dla "Percentage CPU" wpisz np. 90. Dla "Available Memory Bytes" wpisz np. 500000000 (dla 500MB).
        </small>

        <label>Powiadom e-mail:</label>
        <input
          type="email"
          value={notifyEmail}
          onChange={e => setNotifyEmail(e.target.value)}
          placeholder="admin@example.com"
          style={styles.input}
        />

        {error && <p style={styles.errorText}>❌ {error}</p>}

        <div style={styles.buttonContainer}>
          <button onClick={handleSubmit} disabled={loading || !alertName || !notifyEmail}>
            {loading ? "Tworzenie..." : "Utwórz Alert"}
          </button>
          <button onClick={onClose} style={{ marginLeft: "10px" }}>Anuluj</button>
        </div>
      </div>
    </div>
  );
};

// Style
const styles = {
  overlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)", display: "flex",
    justifyContent: "center", alignItems: "center", zIndex: 1000
  },
  modal: {
    background: "white", padding: "30px", borderRadius: "8px",
    width: "450px", boxShadow: "0 0 15px rgba(0,0,0,0.3)",
    display: "flex", flexDirection: "column", gap: "5px"
  },
  input: {
      padding: '8px',
      marginBottom: '10px',
      border: '1px solid #ccc',
      borderRadius: '4px',
      width: '100%',
      boxSizing: 'border-box'
  },
  smallText: {
      display: 'block',
      marginBottom: '15px',
      fontSize: '12px',
      color: '#666'
  },
  errorText: {
      color: "red",
      marginTop: '10px'
  },
  buttonContainer: {
      marginTop: "20px",
      display: 'flex',
      justifyContent: 'flex-end'
  }
};

export default CreateMetricAlertModal;