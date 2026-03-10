import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";

const AWSS3BucketContents = () => {
  const { bucketName } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [bucketInfo, setBucketInfo] = useState(location.state || null);
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!bucketInfo) {
      const stored = sessionStorage.getItem("selectedAWSBucket");
      if (stored) setBucketInfo(JSON.parse(stored));
    }
  }, [bucketInfo]);

  const fetchObjects = useCallback(async () => {
    if (!bucketInfo) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/aws/bucket/objects?bucketName=${bucketName}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd pobierania obiektów");
      setObjects(data.value || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [bucketInfo, bucketName]);

  useEffect(() => {
    if (bucketInfo) fetchObjects();
  }, [bucketInfo, fetchObjects]);

  const handleUpload = async (event) => {
    event.preventDefault();
    const file = event.target.file.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("bucketName", bucketName);

    try {
      const res = await fetch(`/api/aws/bucket/objects`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd wysyłania pliku");
      alert(`✅ ${data.message}`);
      fetchObjects();
    } catch (err) {
      alert(`❌ ${err.message}`);
    }
  };

  const handleDownload = async (objectKey) => {
    try {
      const res = await fetch(
        `/api/aws/bucket/objects/download?bucketName=${bucketName}&objectKey=${encodeURIComponent(objectKey)}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Błąd pobierania pliku");
      }
      const blobData = await res.blob();
      const url = window.URL.createObjectURL(blobData);
      const a = document.createElement("a");
      a.href = url;
      a.download = objectKey.split("/").pop() || objectKey;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(`❌ ${err.message}`);
    }
  };

  const handleDelete = async (objectKey) => {
    if (!window.confirm(`Czy na pewno chcesz usunąć obiekt "${objectKey}"?`)) return;
    try {
      const res = await fetch(`/api/aws/bucket/objects`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucketName: bucketName,
          objectKey: objectKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd usuwania obiektu");
      alert(`✅ ${data.message}`);
      fetchObjects();
    } catch (err) {
      alert(`❌ ${err.message}`);
    }
  };

  if (!bucketInfo) {
    return (
      <div style={{ padding: "20px" }}>
        <h2>❌ Brak danych o buckecie</h2>
        <p>Wróć do listy zasobów Storage i wybierz ponownie bucket.</p>
        <button onClick={() => navigate("/storage")} style={btn}>⬅️ Wróć</button>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px" }}>
      <h2>📄 Obiekty w buckecie S3: {bucketName}</h2>
      <p><strong>Region:</strong> {bucketInfo.region}</p>

      <button onClick={() => navigate(-1)} style={btn}>⬅️ Wróć</button>
      <button onClick={fetchObjects} style={btn}>🔄 Odśwież</button>

      <form onSubmit={handleUpload} style={{ margin: "20px 0", padding: "10px", border: "1px dashed #ccc", borderRadius: "8px" }}>
        <input type="file" name="file" required />
        <button type="submit" style={{ ...btn, marginBottom: 0 }}>📤 Wyślij plik</button>
      </form>

      {error && <p style={{ color: "red" }}>❌ {error}</p>}

      {loading ? (
        <p>⏳ Ładowanie obiektów...</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Nazwa obiektu (Key)</th>
              <th style={thStyle}>Rozmiar</th>
              <th style={thStyle}>Ostatnia modyfikacja</th>
              <th style={thStyle}>Klasa Storage</th>
              <th style={thStyle}>Akcje</th>
            </tr>
          </thead>
          <tbody>
            {objects.length === 0 ? (
              <tr><td colSpan="5" style={{ textAlign: "center", padding: "20px" }}>Ten bucket jest pusty.</td></tr>
            ) : (
              objects.map((obj, i) => (
                <tr key={i}>
                  <td style={tdStyle}>{obj.name}</td>
                  <td style={tdStyle}>{(obj.size / 1024).toFixed(2)} KB</td>
                  <td style={tdStyle}>{obj.lastModified ? new Date(obj.lastModified).toLocaleString() : "—"}</td>
                  <td style={tdStyle}>{obj.storageClass}</td>
                  <td style={tdStyle}>
                    <button onClick={() => handleDownload(obj.name)} title="Pobierz">⬇️</button>
                    <button onClick={() => handleDelete(obj.name)} title="Usuń" style={{ marginLeft: "5px" }}>🗑️</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
};

const btn = {
  padding: "10px",
  background: "#FF9900",
  color: "white",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  marginBottom: "10px",
  marginRight: "10px",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: "20px",
  border: "1px solid #ddd",
  boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
};

const thStyle = {
  textAlign: "left",
  padding: "8px",
  backgroundColor: "#f0f0f0",
  borderBottom: "1px solid #ddd",
};

const tdStyle = {
  padding: "8px",
  borderBottom: "1px solid #eee",
  fontFamily: "monospace",
};

export default AWSS3BucketContents;
