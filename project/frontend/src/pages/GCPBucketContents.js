import React, { useEffect, useState } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";

const GCPBucketContents = () => {
  const { bucketName } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [bucketInfo, setBucketInfo] = useState(location.state || null);
  const [blobs, setBlobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!bucketInfo) {
      const stored = sessionStorage.getItem("selectedGCPBucket");
      if (stored) {
        setBucketInfo(JSON.parse(stored));
      }
    }
  }, []);

  const fetchBlobs = async () => {
    if (!bucketInfo) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/<bucket_name>/list_bucket_blobs?projectId=${bucketInfo.projectId}&bucketName=${bucketName}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd pobierania plików");
      setBlobs(data.value || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    if (bucketInfo) {
      fetchBlobs();
    }
  }, [bucketInfo]);

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
      <h2>📄 Pliki w buckecie: {bucketName}</h2>
      <p><strong>Projekt:</strong> {bucketInfo.projectId}</p>

      <button onClick={() => navigate(-1)} style={btn}>⬅️ Wróć</button>
      <button onClick={fetchBlobs} style={btn}>🔄 Odśwież</button>

      {error && <p style={{ color: "red" }}>❌ {error}</p>}
      
      {loading ? (
        <p>⏳ Ładowanie plików...</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Nazwa pliku (Blob)</th>
              <th style={thStyle}>Rozmiar</th>
              <th style={thStyle}>Ostatnia modyfikacja</th>
              <th style={thStyle}>Akcje</th>
            </tr>
          </thead>
          <tbody>
            {blobs.length === 0 ? (
              <tr>
                <td colSpan="4" style={{ textAlign: "center", padding: "20px" }}>
                  Ten bucket jest pusty.
                </td>
              </tr>
            ) : (
              blobs.map((blob, i) => (
                <tr key={i}>
                  <td style={tdStyle}>{blob.name}</td>
                  <td style={tdStyle}>{(blob.size / 1024).toFixed(2)} KB</td>
                  <td style={tdStyle}>{blob.updated ? new Date(blob.updated).toLocaleString() : '—'}</td>
                  <td style={tdStyle}>
                    <button disabled title="Wkrótce">⬇️</button>
                    <button disabled title="Wkrótce" style={{ marginLeft: "5px" }}>🗑️</button>
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
  background: "#0078D4",
  color: "white",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  marginBottom: "10px",
  marginRight: "10px"
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: "20px",
  border: "1px solid #ddd",
  boxShadow: "0 2px 6px rgba(0,0,0,0.05)"
};

const thStyle = {
  textAlign: "left",
  padding: "8px",
  backgroundColor: "#f0f0f0",
  borderBottom: "1px solid #ddd"
};

const tdStyle = {
  padding: "8px",
  borderBottom: "1px solid #eee",
  fontFamily: "monospace"
};

export default GCPBucketContents;