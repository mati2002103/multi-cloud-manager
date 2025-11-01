import React, { useState, useEffect } from "react";

const CreateGCPSubnetModal = ({ isOpen, onClose, onCreated, vpc }) => {
  const [subnetName, setSubnetName] = useState("");
  const [region, setRegion] = useState("");
  const [ipCidrRange, setIpCidrRange] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const regions = [
    "europe-west1", "europe-central2", "europe-west3", "europe-west4", "us-central1", "us-east1"
  ];

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSubnetName("");
      setIpCidrRange("");
      setRegion("europe-central2");
    }
  }, [isOpen]);


  const handleSubmit = async () => {
    if (!vpc || !vpc.projectId || !vpc.name) {
        console.error("handleSubmit - Błąd: Otrzymano niekompletny obiekt vpc:", vpc); 
        setError("Brakujące lub niekompletne informacje o nadrzędnej sieci VPC. Spróbuj ponownie.");
        return; 
    }

   
    const currentVpc = vpc; 

    setLoading(true);
    setError(null);
    try {
      if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(ipCidrRange)) {
          throw new Error("Niepoprawny format zakresu IP CIDR (np. 10.1.0.0/24).");
      }
       if (!/^[a-z]([-a-z0-9]*[a-z0-9])?$/.test(subnetName)) {
         throw new Error("Nazwa subnetu musi zaczynać się małą literą, może zawierać małe litery, cyfry i myślniki.");
       }


      const res = await fetch("/api/gcp/create_gcp_subnet", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: currentVpc.projectId,
          vpcName: currentVpc.name,
          region,
          subnetName,
          ipCidrRange,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd tworzenia subnetu");
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
        <h2>➕ Utwórz nowy Subnet (GCP)</h2>
        <p>
            Sieć VPC: <strong>{vpc?.name || 'N/A'}</strong> w projekcie: <strong>{vpc?.projectId || 'N/A'}</strong>
        </p>

        <label>Nazwa Subnetu:</label>
        <input
          type="text"
          value={subnetName}
          onChange={e => setSubnetName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          placeholder="np. subnet-prod-web"
          style={styles.input}
        />
        <small style={styles.smallText}>
            Małe litery, cyfry, myślniki. Musi zaczynać się literą.
        </small>

        <label>Region:</label>
        <select value={region} onChange={e => setRegion(e.target.value)} style={styles.input}>
          <option value="">-- wybierz region --</option>
          {regions.map(reg => (
            <option key={reg} value={reg}>{reg}</option>
          ))}
        </select>

        <label>Zakres IP (CIDR):</label>
        <input
          type="text"
          value={ipCidrRange}
          onChange={e => setIpCidrRange(e.target.value)}
          placeholder="np. 10.1.2.0/24"
          style={styles.input}
        />

        {error && <p style={styles.errorText}>❌ {error}</p>}

        <div style={styles.buttonContainer}>
          <button onClick={handleSubmit} disabled={loading || !vpc?.projectId || !vpc?.name || !subnetName || !region || !ipCidrRange}>
            {loading ? "Tworzenie..." : "Utwórz Subnet"}
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

export default CreateGCPSubnetModal;