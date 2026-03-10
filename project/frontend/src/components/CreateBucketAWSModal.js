import React, { useState } from "react";

const CreateBucketAWSModal = ({ isOpen, onClose, onCreated }) => {
  const [bucketName, setBucketName] = useState("");
  const [region, setRegion] = useState("eu-west-1");
  const [versioning, setVersioning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const regions = [
    "us-east-1",
    "us-east-2",
    "us-west-1",
    "us-west-2",
    "eu-west-1",
    "eu-west-2",
    "eu-west-3",
    "eu-central-1",
    "eu-north-1",
    "ap-southeast-1",
    "ap-southeast-2",
    "ap-northeast-1",
  ];

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/aws/create_bucket", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucketName, region, versioning }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd tworzenia bucketa");
      alert(`✅ ${data.message}`);
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetAndClose = () => {
    setError(null);
    setBucketName("");
    setRegion("eu-west-1");
    setVersioning(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2>🪣 Utwórz nowy Bucket S3 (AWS)</h2>

        <label>Nazwa bucketa:</label>
        <input
          type="text"
          value={bucketName}
          onChange={(e) =>
            setBucketName(
              e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, "")
            )
          }
          placeholder="unikalna-globalnie-nazwa"
        />
        <small
          style={{ display: "block", marginBottom: "15px", color: "#666" }}
        >
          Tylko małe litery, cyfry, myślniki i kropki. Musi być unikalna
          globalnie.
        </small>

        <label>Region:</label>
        <select value={region} onChange={(e) => setRegion(e.target.value)}>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <div style={{ margin: "15px 0" }}>
          <label>
            <input
              type="checkbox"
              checked={versioning}
              onChange={(e) => setVersioning(e.target.checked)}
              style={{ marginRight: "8px" }}
            />
            Włącz wersjonowanie (Versioning)
          </label>
        </div>

        {error && <p style={{ color: "red" }}>❌ {error}</p>}

        <div style={{ marginTop: "20px" }}>
          <button
            onClick={handleSubmit}
            disabled={loading || !bucketName}
          >
            {loading ? "Tworzenie..." : "Utwórz"}
          </button>
          <button onClick={resetAndClose} style={{ marginLeft: "10px" }}>
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
  },
  modal: {
    background: "white",
    padding: "30px",
    borderRadius: "8px",
    width: "400px",
    boxShadow: "0 0 10px rgba(0,0,0,0.3)",
  },
};

export default CreateBucketAWSModal;
