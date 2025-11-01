import React, { useState, useEffect } from "react";

const CreateGCPVMModal = ({ isOpen, onClose, onCreated }) => {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [zone, setZone] = useState("europe-central2-a"); 
  const [vmName, setVmName] = useState("");
  const [machineType, setMachineType] = useState("e2-medium");
  const [sourceImage, setSourceImage] = useState("projects/debian-cloud/global/images/family/debian-12");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const machineTypes = ["e2-micro", "e2-small", "e2-medium", "n1-standard-1", "n1-standard-2"];
  const images = [
    { value: "projects/debian-cloud/global/images/family/debian-12", label: "Debian 12" },
    { value: "projects/ubuntu-os-cloud/global/images/family/ubuntu-2204-lts", label: "Ubuntu 22.04 LTS" },
  ];
  const zones = ["europe-central2-a", "europe-central2-b", "europe-west1-b", "us-central1-a"]; 

  useEffect(() => {
    if (!isOpen) {
        setError(null);
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
      const res = await fetch("/api/gcp/create_gcp_vms", { 
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          zone,
          vmName,
          machineType,
          sourceImage
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd tworzenia VM w GCP");
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
        <h2>🖥️ Utwórz Instancję VM (GCP)</h2>

        <label>Projekt GCP:</label>
        <select value={projectId} onChange={e => setProjectId(e.target.value)}>
          <option value="">-- wybierz projekt --</option>
          {projects.map(proj => (
            <option key={proj.projectId} value={proj.projectId}>
              {proj.displayName} ({proj.projectId})
            </option>
          ))}
        </select>

        <label>Nazwa Instancji:</label>
        <input
          type="text"
          value={vmName}
          onChange={e => setVmName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          placeholder="np. moja-vm-1"
        />
         <small style={{display: 'block', marginBottom: '15px', color: '#666'}}>
            Tylko małe litery, cyfry, myślniki.
        </small>

        <label>Strefa:</label>
         <select value={zone} onChange={e => setZone(e.target.value)}>
           {zones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>

        <label>Typ Maszyny:</label>
        <select value={machineType} onChange={e => setMachineType(e.target.value)}>
          {machineTypes.map(mt => (
            <option key={mt} value={mt}>{mt}</option>
          ))}
        </select>

         <label>Obraz Systemu:</label>
        <select value={sourceImage} onChange={e => setSourceImage(e.target.value)}>
          {images.map(img => (
            <option key={img.value} value={img.value}>{img.label}</option>
          ))}
        </select>

        {error && <p style={{ color: "red" }}>❌ {error}</p>}

        <div style={{ marginTop: "20px" }}>
          <button onClick={handleSubmit} disabled={loading || !projectId || !vmName || !zone}>
            {loading ? "Tworzenie..." : "Utwórz Instancję"}
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
    backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000
  },
  modal: {
    background: "white", padding: "30px", borderRadius: "8px", width: "450px", boxShadow: "0 0 15px rgba(0,0,0,0.3)"
  }
};

export default CreateGCPVMModal;