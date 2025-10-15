import React, { useState, useEffect } from "react";

const CreateBucketGCPModal = ({ isOpen, onClose, onCreated }) => {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [bucketName, setBucketName] = useState("");
  const [location, setLocation] = useState("europe-west1");
  const [storageClass, setStorageClass] = useState("STANDARD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const locations = [
    "europe-west1", "europe-west3", "europe-west4", "us-central1", "us-east1", "asia-east1"
  ];

  const storageClasses = [
    { value: "STANDARD", label: "Standard (Hot) - Częsty dostęp" },
    { value: "NEARLINE", label: "Nearline (Cold) - Dostęp ~1/miesiąc" },
    { value: "COLDLINE", label: "Coldline (Cold) - Dostęp ~1/kwartał" },
    { value: "ARCHIVE",  label: "Archive - Długoterminowe archiwum" },
  ];

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setProjectId("");
      setBucketName("");
      return;
    }
    fetch("/api/account/google/projects", { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setProjects(data.value || []);
      })
      .catch(() => setError("Nie udało się pobrać projektów GCP"));
  }, [isOpen]);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/projects/create_bucket", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, bucketName, location, storageClass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd tworzenia bucketa");
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
        <h2>📦 Utwórz nowy Bucket (GCP)</h2>

        <label>Projekt:</label>
        <select value={projectId} onChange={e => setProjectId(e.target.value)}>
          <option value="">-- wybierz projekt --</option>
          {projects.map(proj => (
            <option key={proj.projectId} value={proj.projectId}>
              {proj.displayName} ({proj.projectId})
            </option>
          ))}
        </select>

        <label>Nazwa bucketa:</label>
        <input
          type="text"
          value={bucketName}
          onChange={e => setBucketName(e.target.value.toLowerCase().replace(/[^a-z0-9-._]/g, ''))}
          placeholder="unikalna-globalnie-nazwa"
        />
        <small style={{display: 'block', marginBottom: '15px', color: '#666'}}>
            Tylko małe litery, cyfry, myślniki. Musi być unikalna globalnie.
        </small>

        <label>Lokalizacja:</label>
        <select value={location} onChange={e => setLocation(e.target.value)}>
          {locations.map(loc => (
            <option key={loc} value={loc}>{loc}</option>
          ))}
        </select>

        <label>Klasa Storage:</label>
        <select value={storageClass} onChange={e => setStorageClass(e.target.value)}>
          {storageClasses.map(sc => (
            <option key={sc.value} value={sc.value}>{sc.label}</option>
          ))}
        </select>

        {error && <p style={{ color: "red" }}>❌ {error}</p>}

        <div style={{ marginTop: "20px" }}>
          <button onClick={handleSubmit} disabled={loading || !projectId || !bucketName}>
            {loading ? "Tworzenie..." : "Utwórz"}
          </button>
          <button onClick={onClose} style={{ marginLeft: "10px" }}>Anuluj</button>
        </div>
      </div>
    </div>
  );
};

// Style skopiowane z Twojego komponentu dla spójności
const styles = {
  overlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center"
  },
  modal: {
    background: "white", padding: "30px", borderRadius: "8px", width: "400px", boxShadow: "0 0 10px rgba(0,0,0,0.3)"
  }
};

export default CreateBucketGCPModal;