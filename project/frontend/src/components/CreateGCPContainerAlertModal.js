import React, { useState, useEffect } from "react";

const CreateGCPContainerAlertModal = ({ isOpen, onClose, onCreated, containerInfo }) => {
  const [alertName, setAlertName] = useState("");
  const [metricName, setMetricName] = useState("run.googleapis.com/request_count");
  const [threshold, setThreshold] = useState(0.8); 
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && containerInfo) {
      setError(null);
      setAlertName(`gcp-container-${containerInfo.serviceName || 'service'}`);
      setMetricName("run.googleapis.com/request_count");
      setThreshold(0.8);
    }
  }, [isOpen, containerInfo]);

  const handleSubmit = async () => {
    if (!containerInfo?.projectId || !containerInfo?.region || !containerInfo?.serviceName) {
      setError("Brakujące podstawowe informacje o kontenerze (Project ID, Region, Service Name).");
      return;
    }
  
    
    setLoading(true);
    setError(null);
    try {
      const payload = {
        alertName: alertName,
        metricType: metricName,
        threshold: threshold,
      };

     
      const res = await fetch(`/api/gcp/container/${containerInfo.projectId}/${containerInfo.region}/${containerInfo.serviceName}/create-alert`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd tworzenia alertu");
      
      alert(data.message || "Alert pomyślnie utworzony.");
      onCreated(); // Odświeża listę alertów
      onClose(); // Zamyka modal
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
        <h2>🚨 Utwórz nowy alert (GCP) dla {containerInfo?.serviceName || 'Kontener'}</h2>
        <p style={styles.smallText}>
            Uwaga: Ta funkcja utworzy regułę alertu. Aby otrzymywać powiadomienia (np. e-mail), musisz ręcznie skonfigurować "Notification Channels" w konsoli Google Cloud.
        </p>

        <label>Nazwa reguły alertu:</label>
        <input
          type="text"
          value={alertName}
          onChange={e => setAlertName(e.target.value)}
          placeholder="np. gcp-container-high-cpu"
          style={styles.input}
        />

        <label>Sygnał (Metryka):</label>
        <select value={metricName} onChange={e => setMetricName(e.target.value)} style={styles.input}>
          <option value="run.googleapis.com/request_count">Liczba żądań (Suma)</option>
          <option value="run.googleapis.com/request_latencies">Opóźnienia żądań (P95)</option>
          <option value="run.googleapis.com/container/instance_count">Liczba instancji (Suma)</option>
        </select>

        <label>Próg:</label>
        <input
          type="number"
          step="1"
          value={threshold}
          onChange={e => setThreshold(Number(e.target.value))}
          style={styles.input}
        />

        {error && <p style={styles.errorText}>❌ {error}</p>}

        <div style={styles.buttonContainer}>
          <button onClick={handleSubmit} disabled={loading || !alertName} style={styles.createButton}>
            {loading ? "Tworzenie..." : "Utwórz Alert"}
          </button>
          <button onClick={onClose} style={styles.cancelButton}>Anuluj</button>
        </div>
      </div>
    </div>
  );
};


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
      color: '#666',
      marginTop: '-5px'
  },
  errorText: {
      color: "red",
      marginTop: '10px'
  },
  buttonContainer: {
      marginTop: "20px",
      display: 'flex',
      justifyContent: 'flex-end'
  },
  createButton: {
    padding: '8px 12px', background: '#4285F4', color: 'white', 
    border: 'none', borderRadius: '6px', cursor: 'pointer'
  },
  cancelButton: {
    padding: '8px 12px', background: '#E2E8F0', color: '#111', 
    border: 'none', borderRadius: '6px', cursor: 'pointer', marginLeft: '10px'
  }
};

export default CreateGCPContainerAlertModal;