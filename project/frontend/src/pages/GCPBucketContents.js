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
      if (stored) setBucketInfo(JSON.parse(stored));
    }
  }, []);

  const fetchBlobs = async () => {
    if (!bucketInfo) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/gcp/buckets/blobs?projectId=${bucketInfo.projectId}&bucketName=${bucketName}`, { credentials: "include" });
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
    if (bucketInfo) fetchBlobs();
  }, [bucketInfo]);

  const handleUpload = async (event) => {
    event.preventDefault();
    const file = event.target.file.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("bucketName", bucketName);
    formData.append("projectId", bucketInfo.projectId);

    try {
      const res = await fetch(`/api/gcp/buckets/blobs`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd wysyłania pliku");
      alert(`✅ ${data.message}`);
      fetchBlobs();
    } catch (err) {
      alert(`❌ ${err.message}`);
    }
  };

  const handleDownload = async (blobName) => {
    try {
      const res = await fetch(`/api/gcp/buckets/blobs/download?projectId=${bucketInfo.projectId}&bucketName=${bucketName}&blobName=${blobName}`, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Błąd pobierania pliku");
      }
      const blobData = await res.blob();
      const url = window.URL.createObjectURL(blobData);
      const a = document.createElement("a");
      a.href = url;
      a.download = blobName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(`❌ ${err.message}`);
    }
  };

  const handleDelete = async (blobName) => {
    if (!window.confirm(`Czy na pewno chcesz usunąć plik "${blobName}"?`)) return;
    try {
      const res = await fetch(`/api/gcp/buckets/blobs`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucketName: bucketName,
          projectId: bucketInfo.projectId,
          blobName: blobName
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd usuwania pliku");
      alert(`✅ ${data.message}`);
      fetchBlobs();
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
      <h2>📄 Pliki w buckecie: {bucketName}</h2>
      <p><strong>Projekt:</strong> {bucketInfo.projectId}</p>

      <button onClick={() => navigate(-1)} style={btn}>⬅️ Wróć</button>
      <button onClick={fetchBlobs} style={btn}>🔄 Odśwież</button>

      <form onSubmit={handleUpload} style={{ margin: "20px 0", padding: "10px", border: "1px dashed #ccc", borderRadius: "8px" }}>
        <input type="file" name="file" required />
        <button type="submit" style={{ ...btn, marginBottom: 0 }}>📤 Wyślij plik</button>
      </form>

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
              <tr><td colSpan="4" style={{ textAlign: "center", padding: "20px" }}>Ten bucket jest pusty.</td></tr>
            ) : (
              blobs.map((blob, i) => (
                <tr key={i}>
                  <td style={tdStyle}>{blob.name}</td>
                  <td style={tdStyle}>{(blob.size / 1024).toFixed(2)} KB</td>
                  <td style={tdStyle}>{blob.updated ? new Date(blob.updated).toLocaleString() : '—'}</td>
                  <td style={tdStyle}>
                    <button onClick={() => handleDownload(blob.name)} title="Pobierz">⬇️</button>
                    <button onClick={() => handleDelete(blob.name)} title="Usuń" style={{ marginLeft: "5px" }}>🗑️</button>
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