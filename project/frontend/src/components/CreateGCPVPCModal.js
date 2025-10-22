import React, { useState, useEffect } from "react";

const CreateGCPVPCModal = ({ isOpen, onClose, onCreated }) => {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [vpcName, setVpcName] = useState("");
  const [description, setDescription] = useState("");
  const [routingMode, setRoutingMode] = useState("REGIONAL");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) {
        setError(null);
        setProjectId("");
        setVpcName("");
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
       if (!/^[a-z0-9-]+$/.test(vpcName)) {
         throw new Error("Nazwa VPC może zawierać tylko małe litery, cyfry i myślniki.");
       }

      const res = await fetch("/api/gcp/create_gcp_vpc", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          vpcName,
          description, 
          routingMode 
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd tworzenia sieci VPC");
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
        <h2>🌐 Utwórz nową sieć VPC (GCP)</h2>

        <label>Projekt GCP:</label>
        <select value={projectId} onChange={e => setProjectId(e.target.value)} style={styles.input}>
          <option value="">-- wybierz projekt --</option>
          {projects.map(proj => (
            <option key={proj.projectId} value={proj.projectId}>
              {proj.displayName} ({proj.projectId})
            </option>
          ))}
        </select>

        <label>Nazwa Sieci VPC:</label>
        <input
          type="text"
          value={vpcName}
          onChange={e => setVpcName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          placeholder="np. moja-siec-prod"
          style={styles.input}
        />
        <small style={styles.smallText}>
            Tylko małe litery, cyfry, myślniki.
        </small>

        
        <label>Opis (opcjonalnie):</label>
        <input type="text" value={description} onChange={e => setDescription(e.target.value)} style={styles.input}/>

        <label>Tryb Routingu (opcjonalnie):</label>
        <select value={routingMode} onChange={e => setRoutingMode(e.target.value)} style={styles.input}>
            <option value="REGIONAL">Regional</option>
            <option value="GLOBAL">Global</option>
        </select>
        

        {error && <p style={styles.errorText}>❌ {error}</p>}

        <div style={styles.buttonContainer}>
          <button onClick={handleSubmit} disabled={loading || !projectId || !vpcName}>
            {loading ? "Tworzenie..." : "Utwórz VPC"}
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

export default CreateGCPVPCModal;