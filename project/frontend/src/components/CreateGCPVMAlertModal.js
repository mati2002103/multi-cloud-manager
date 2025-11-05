import React, { useState, useEffect } from "react";

const CreateGCPVMAlertModal = ({ isOpen, onClose, onCreated, vmInfo }) => {
  const [alertName, setAlertName] = useState("");
  const [metricName, setMetricName] = useState("compute.googleapis.com/instance/cpu/utilization");
  const [threshold, setThreshold] = useState(0.8); // Próg dla GCP (np. 0.8 dla 80%)
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Resetuj formularz, gdy modal jest otwierany
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setAlertName(`gcp-vm-${vmInfo?.vmName || 'vm'}-high-cpu`); // Domyślna nazwa
      setMetricName("compute.googleapis.com/instance/cpu/utilization");
      setThreshold(0.8);
    }
  }, [isOpen, vmInfo?.vmName]);

  const handleSubmit = async () => {
    if (!vmInfo?.projectId || !vmInfo?.instanceId) {
      setError("Brakujące podstawowe informacje o VM (Project ID, Instance ID).");
      return;
    }
    if (threshold <= 0 || threshold >= 1) {
      setError("Próg dla metryk procentowych (np. CPU) musi być wartością dziesiętną między 0.0 a 1.0 (np. 0.8 dla 80%).");
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

      const res = await fetch(`/api/gcp/vm/${vmInfo.projectId}/${vmInfo.instanceId}/create-alert`, {
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
        <h2>🚨 Utwórz nowy alert (GCP) dla {vmInfo?.vmName || 'VM'}</h2>
        <p style={styles.smallText}>
            Uwaga: Ta funkcja utworzy regułę alertu. Aby otrzymywać powiadomienia (np. e-mail), musisz ręcznie skonfigurować "Notification Channels" w konsoli Google Cloud.
        </p>

        <label>Nazwa reguły alertu:</label>
        <input
          type="text"
          value={alertName}
          onChange={e => setAlertName(e.target.value)}
          placeholder="np. gcp-vm-high-cpu"
          style={styles.input}
        />

        <label>Sygnał (Metryka):</label>
        <select value={metricName} onChange={e => setMetricName(e.target.value)} style={styles.input}>
          <option value="compute.googleapis.com/instance/cpu/utilization">Użycie CPU (%)</option>
          <option value="agent.googleapis.com/memory/percent_used">Użycie pamięci (Agent) (%)</option>
          <option value="agent.googleapis.com/disk/percent_used">Użycie dysku (Agent) (%)</option>
          {/* Można dodać więcej metryk, ale te procentowe są najłatwiejsze do ustawienia progu */}
        </select>

        <label>Próg (Wartość 0.0 - 1.0):</label>
        <input
          type="number"
          step="0.1"
          min="0"
          max="1"
          value={threshold}
          onChange={e => setThreshold(Number(e.target.value))}
          style={styles.input}
        />
         <small style={styles.smallText}>
            Wpisz np. <b>0.8</b> dla 80% lub <b>0.5</b> dla 50%.
        </small>

        {error && <p style={styles.errorText}>❌ {error}</p>}

        <div style={styles.buttonContainer}>
          <button onClick={handleSubmit} disabled={loading || !alertName}>
            {loading ? "Tworzenie..." : "Utwórz Alert"}
          </button>
          <button onClick={onClose} style={{ marginLeft: "10px", background: '#E2E8F0', color: '#111' }}>Anuluj</button>
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
  }
};

export default CreateGCPVMAlertModal;