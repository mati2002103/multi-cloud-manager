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

const CreateAWSVPCModal = ({ isOpen, onClose, onCreated }) => {
  const [region, setRegion] = useState("us-east-1");
  const [vpcName, setVpcName] = useState("");
  const [cidrBlock, setCidrBlock] = useState("10.0.0.0/16");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!/^[a-zA-Z0-9-_]+$/.test(vpcName)) {
        throw new Error("Nazwa VPC może zawierać litery, cyfry, myślniki i podkreślenia.");
      }

      const res = await fetch("/api/aws/vpc/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region,
          vpcName: vpcName.trim(),
          cidrBlock: cidrBlock.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd tworzenia VPC");

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
        <h2>🌐 Utwórz VPC (AWS)</h2>

        <label>Region:</label>
        <select value={region} onChange={(e) => setRegion(e.target.value)} style={styles.input}>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <label>Nazwa VPC:</label>
        <input
          type="text"
          value={vpcName}
          onChange={(e) => setVpcName(e.target.value)}
          placeholder="np. my-vpc-prod"
          style={styles.input}
        />

        <label>CIDR bloku:</label>
        <input
          type="text"
          value={cidrBlock}
          onChange={(e) => setCidrBlock(e.target.value)}
          placeholder="np. 10.0.0.0/16"
          style={styles.input}
        />

        {error && <p style={{ color: "red" }}>❌ {error}</p>}

        <div style={styles.buttonContainer}>
          <button
            onClick={handleSubmit}
            disabled={loading || !region || !vpcName.trim() || !cidrBlock.trim()}
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
  },
  input: {
    padding: "8px",
    marginBottom: "12px",
    border: "1px solid #ccc",
    borderRadius: "4px",
    width: "100%",
    boxSizing: "border-box",
  },
  buttonContainer: {
    marginTop: "20px",
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

export default CreateAWSVPCModal;

