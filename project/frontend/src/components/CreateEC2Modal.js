import React, { useEffect, useState } from "react";

const REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
];

const CreateEC2Modal = ({ isOpen, onClose, onCreated }) => {
  const [instanceName, setInstanceName] = useState("");
  const [instanceType, setInstanceType] = useState("t2.micro");
  const [amiOptions, setAmiOptions] = useState([]);
  const [amiLoading, setAmiLoading] = useState(false);
  const [amiError, setAmiError] = useState(null);
  const [imageId, setImageId] = useState("");
  const [customAmi, setCustomAmi] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const effectiveAmi = (imageId || customAmi.trim()).trim();

  useEffect(() => {
    if (!isOpen) return;
    setAmiLoading(true);
    setAmiError(null);
    fetch(`/api/aws/ec2/amis?region=${encodeURIComponent(region)}`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Błąd pobierania listy AMI");
        const opts = (data.value || []).map((x) => ({ value: x.imageId, label: `${x.label} (${x.imageId})` }));
        setAmiOptions(opts);
        if (opts.length > 0) {
          setImageId(opts[0].value);
        } else {
          setImageId("");
        }
      })
      .catch((err) => {
        setAmiError(err.message);
        setAmiOptions([]);
        setImageId("");
      })
      .finally(() => setAmiLoading(false));
  }, [isOpen, region]);

  const handleSubmit = async () => {
    if (!effectiveAmi) {
      setError("Wybierz obraz AMI lub wpisz własny identyfikator AMI.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/aws/ec2/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceName: instanceName.trim(),
          instanceType,
          imageId: effectiveAmi,
          region,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd tworzenia instancji EC2");
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
        <h2>🖥️ Utwórz instancję EC2 (AWS)</h2>

        <label>Nazwa instancji (tag Name):</label>
        <input
          type="text"
          value={instanceName}
          onChange={(e) => setInstanceName(e.target.value)}
          placeholder="np. my-ec2-vm"
        />

        <label>Region:</label>
        <select value={region} onChange={(e) => setRegion(e.target.value)}>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <label>Typ instancji:</label>
        <input
          type="text"
          value={instanceType}
          onChange={(e) => setInstanceType(e.target.value)}
          placeholder="np. t3.micro, t2.micro, t3.small..."
        />

        <label>Obraz (AMI):</label>
        <select value={imageId} onChange={(e) => setImageId(e.target.value)} disabled={amiLoading}>
          {amiLoading ? (
            <option value="">⏳ Ładowanie...</option>
          ) : (
            <>
              {amiOptions.length === 0 && <option value="">— Brak listy AMI —</option>}
              {amiOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
              <option value="">— Własny AMI (wpisz poniżej) —</option>
            </>
          )}
        </select>
        {amiError && <p style={{ color: "red" }}>❌ {amiError}</p>}
        {imageId === "" && (
          <input
            type="text"
            value={customAmi}
            onChange={(e) => setCustomAmi(e.target.value)}
            placeholder="np. ami-0123456789abcdef0"
            style={{ marginTop: "6px" }}
          />
        )}

        {error && <p style={{ color: "red" }}>❌ {error}</p>}

        <div style={{ marginTop: "20px" }}>
          <button
            onClick={handleSubmit}
            disabled={loading || !instanceName.trim() || !effectiveAmi}
          >
            {loading ? "Tworzenie..." : "Utwórz instancję EC2"}
          </button>
          <button onClick={onClose} style={{ marginLeft: "10px" }}>
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
};

export default CreateEC2Modal;
