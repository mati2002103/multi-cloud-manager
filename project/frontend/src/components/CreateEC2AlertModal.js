import React, { useEffect, useState } from "react";

const CreateEC2AlertModal = ({ isOpen, onClose, onCreated, instanceId, metricsList, region }) => {
  const [alertName, setAlertName] = useState("");
  const [metricType, setMetricType] = useState("");
  const [threshold, setThreshold] = useState(90);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    const firstMetric = metricsList?.[0]?.type || "";
    setMetricType(firstMetric);
    const baseName = `ec2-${instanceId}-${firstMetric || "metric"}-gt-${threshold}`;
    setAlertName(baseName);
    setError(null);
  }, [isOpen, instanceId, metricsList]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!instanceId) {
      setError("Brak instanceId.");
      return;
    }
    if (!metricType) {
      setError("Wybierz metrykę.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/aws/ec2/${encodeURIComponent(instanceId)}/create-alert`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alertName,
          metricType,
          threshold: Number(threshold),
          region: region || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd tworzenia alertu");
      alert(data.message || "Alert utworzony.");
      onCreated?.();
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
        <h2>🚨 Utwórz alert (EC2): {instanceId}</h2>

        <label>Nazwa alertu:</label>
        <input
          type="text"
          value={alertName}
          onChange={(e) => setAlertName(e.target.value)}
          style={styles.input}
          placeholder="np. ec2-i-123...-CPUUtilization-gt-80"
        />

        <label>Metryka (metricType):</label>
        <select value={metricType} onChange={(e) => setMetricType(e.target.value)} style={styles.input}>
          {(metricsList || []).map((m) => (
            <option key={m.type} value={m.type}>
              {m.displayName || m.type} ({m.unit})
            </option>
          ))}
        </select>

        <label>Próg (threshold):</label>
        <input
          type="number"
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          style={styles.input}
        />

        {error && <p style={styles.errorText}>❌ {error}</p>}

        <div style={styles.buttonContainer}>
          <button onClick={handleSubmit} disabled={loading || !alertName || !metricType} style={styles.primaryButton}>
            {loading ? "Tworzenie..." : "Utwórz Alert"}
          </button>
          <button onClick={onClose} style={styles.cancelButton}>
            Anuluj
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modal: {
    background: "white",
    padding: "30px",
    borderRadius: "8px",
    width: "470px",
    boxShadow: "0 0 15px rgba(0,0,0,0.3)",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  input: {
    padding: "8px",
    border: "1px solid #ccc",
    borderRadius: "4px",
    width: "100%",
    boxSizing: "border-box",
  },
  errorText: { color: "red", marginTop: "6px", fontWeight: "600" },
  buttonContainer: { marginTop: "15px", display: "flex", justifyContent: "flex-end", gap: "10px" },
  primaryButton: { padding: "10px 14px", background: "#FF9900", color: "#232f3e", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 },
  cancelButton: { padding: "10px 14px", background: "#E2E8F0", color: "#111", border: "none", borderRadius: "6px", cursor: "pointer" },
};

export default CreateEC2AlertModal;

