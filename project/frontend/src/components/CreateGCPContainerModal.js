import React, { useState, useEffect } from "react";

const CreateGCPContainerModal = ({ isOpen, onClose, onCreated }) => {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [region, setRegion] = useState("europe-west1");
  const [serviceName, setServiceName] = useState("");
  const [imageUri, setImageUri] = useState("");
  const [containerPort, setContainerPort] = useState("8080");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const regions = [
    "europe-west1", "europe-central2", "europe-west3", "europe-west4", "us-central1", "us-east1"
  ];

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setProjectId("");
      setServiceName("");
      setImageUri("");
      setContainerPort("8080");
      return;
    }
    fetch("/api/account/google/projects", { credentials: "include" })
      .then(res => res.ok ? res.json() : res.json().then(err => { throw new Error(err.error) }))
      .then(data => {
        setProjects(data.value || []);
      })
      .catch((err) => setError(`Nie udało się pobrać projektów GCP: ${err.message}`));
  }, [isOpen]);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
       if (!/^[a-z0-9-]+$/.test(serviceName)) {
         throw new Error("Nazwa usługi może zawierać tylko małe litery, cyfry i myślniki.");
       }

      const res = await fetch("/api/gcp/create_container", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          region,
          serviceName,
          imageUri: imageUri || undefined,
          containerPort: containerPort || "8080"
         }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd tworzenia usługi Cloud Run");
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
        <h2>📦 Utwórz nową usługę Cloud Run (GCP)</h2>

        <label>Projekt GCP:</label>
        <select value={projectId} onChange={e => setProjectId(e.target.value)} style={styles.input}>
          <option value="">-- wybierz projekt --</option>
          {projects.map(proj => (
            <option key={proj.projectId} value={proj.projectId}>
              {proj.displayName} ({proj.projectId})
            </option>
          ))}
        </select>

        <label>Nazwa Usługi:</label>
        <input
          type="text"
          value={serviceName}
          onChange={e => setServiceName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          placeholder="np. moja-aplikacja-web"
          style={styles.input}
        />
         <small style={styles.smallText}>
            Tylko małe litery, cyfry, myślniki.
        </small>

        <label>Region:</label>
        <select value={region} onChange={e => setRegion(e.target.value)} style={styles.input}>
          {regions.map(reg => (
            <option key={reg} value={reg}>{reg}</option>
          ))}
        </select>

        <label>URL Obrazu Kontenera (opcjonalnie):</label>
        <input
          type="text"
          value={imageUri}
          onChange={e => setImageUri(e.target.value)}
          placeholder="domyślnie: us-docker.pkg.dev/cloudrun/container/hello"
          style={styles.input}
        />
         <small style={styles.smallText}>
            Zostaw puste, aby użyć domyślnego obrazu 'hello'.
        </small>

        <label>Port Kontenera (opcjonalnie):</label>
        <input
          type="number"
          value={containerPort}
          onChange={e => setContainerPort(e.target.value)}
          placeholder="domyślnie: 8080"
          style={{...styles.input, width: '100px'}}
        />

        {error && <p style={styles.errorText}>❌ {error}</p>}

        <div style={styles.buttonContainer}>
          <button onClick={handleSubmit} disabled={loading || !projectId || !serviceName || !region}>
            {loading ? "Tworzenie..." : "Utwórz Usługę"}
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
      width: '100%'
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

export default CreateGCPContainerModal;