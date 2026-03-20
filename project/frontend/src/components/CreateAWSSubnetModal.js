import React, { useState } from "react";

const REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
];

const CreateAWSSubnetModal = ({ isOpen, onClose, onCreated, vpc }) => {
  const [subnetName, setSubnetName] = useState("");
  const [cidrBlock, setCidrBlock] = useState("10.0.1.0/24");
  const [availabilityZone, setAvailabilityZone] = useState("");
  const [mapPublicIpOnLaunch, setMapPublicIpOnLaunch] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !vpc) return null;

  const region = vpc.region || "us-east-1";

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!subnetName.trim()) throw new Error("Nazwa subnetu jest wymagana.");
      if (!cidrBlock.trim()) throw new Error("CIDR bloku subnetu jest wymagany.");

      const res = await fetch(`/api/aws/vpc/${encodeURIComponent(vpc.vpcId)}/subnet/create`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region,
          subnetName: subnetName.trim(),
          cidrBlock: cidrBlock.trim(),
          availabilityZone: availabilityZone.trim() || undefined,
          mapPublicIpOnLaunch,
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

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2>➕ Dodaj subnet do {vpc.name}</h2>

        <p style={{ marginTop: 0, color: "#444" }}>
          VPC: <strong>{vpc.vpcId}</strong> • Region: <strong>{region}</strong>
        </p>

        <label>Nazwa subnetu:</label>
        <input
          type="text"
          value={subnetName}
          onChange={(e) => setSubnetName(e.target.value)}
          placeholder="np. subnet-app"
          style={styles.input}
        />

        <label>CIDR bloku subnetu:</label>
        <input
          type="text"
          value={cidrBlock}
          onChange={(e) => setCidrBlock(e.target.value)}
          placeholder="np. 10.0.1.0/24"
          style={styles.input}
        />

        <label>Availability zone (opcjonalnie):</label>
        <input
          type="text"
          value={availabilityZone}
          onChange={(e) => setAvailabilityZone(e.target.value)}
          placeholder="np. us-east-1a"
          style={styles.input}
        />

        <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="checkbox"
            checked={mapPublicIpOnLaunch}
            onChange={(e) => setMapPublicIpOnLaunch(e.target.checked)}
          />
          Map public IP on launch (dla instancji/Fargate awsvpc)
        </label>

        {error && <p style={{ color: "red" }}>❌ {error}</p>}

        <div style={styles.buttonContainer}>
          <button
            onClick={handleSubmit}
            disabled={loading || !subnetName.trim() || !cidrBlock.trim()}
            style={styles.primaryButton}
          >
            {loading ? "Tworzenie..." : "Utwórz"}
          </button>
          <button onClick={onClose} style={styles.secondaryButton}>
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
    width: "450px",
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
  buttonContainer: {
    marginTop: "10px",
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
  },
  primaryButton: {
    padding: "10px 14px",
    background: "#0078D4",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "10px 14px",
    background: "#E2E8F0",
    color: "#111",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
};

export default CreateAWSSubnetModal;

