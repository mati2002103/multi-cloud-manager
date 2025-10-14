import React, { useEffect, useState } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import CreateBlobStorageModal from "../components/CreateBlobStorageModal";

const StorageBlobContainers = () => {
  const { name: storageAccountId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [account, setAccount] = useState(location.state || null);
  const [containers, setContainers] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!account) {
      const stored = sessionStorage.getItem("selectedStorageAccount");
      if (stored) setAccount(JSON.parse(stored));
    }
  }, []);

  const fetchContainers = async () => {
    if (!account) return;
    try {
      const res = await fetch(`/api/${storageAccountId}/list_blob_containers`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountName: account.name,
          accountKey: account.Keys,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Błąd pobierania kontenerów");
      setContainers(data.value || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const fetchBlobs = async (containerName) => {
    try {
      const res = await fetch(`/api/${storageAccountId}/list_blobs`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountName: account.name,
          accountKey: account.Keys,
          containerName
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Błąd pobierania blobów");
      setExpanded(prev => ({ ...prev, [containerName]: data.value }));
    } catch (err) {
      alert(`❌ ${err.message}`);
    }
  };

  const handleDeleteContainer = async (containerName) => {
    if (!account) return;
    if (!window.confirm(`Usunąć kontener "${containerName}"?`)) return;
    try {
      const res = await fetch(`/api/${storageAccountId}/delete_blob_container`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountName: account.name,
          accountKey: account.Keys,
          containerName
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd usuwania kontenera");
      fetchContainers();
    } catch (err) {
      alert(`❌ ${err.message}`);
    }
  };

  const toggleExpand = (containerName) => {
    if (expanded[containerName]) {
      setExpanded(prev => {
        const copy = { ...prev };
        delete copy[containerName];
        return copy;
      });
    } else {
      fetchBlobs(containerName);
    }
  };

  useEffect(() => {
    if (account) fetchContainers();
  }, [account]);

  if (!account) {
    return (
      <div style={{ padding: "20px" }}>
        <h2>❌ Brak danych konta Storage</h2>
        <p>Wróć do listy kont i wybierz ponownie.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px" }}>
      <h2>📁 Kontenery blob dla: {account.name}</h2>
      <p><strong>Resource Group:</strong> {account.resourceGroup}</p>
      <p><strong>Lokalizacja:</strong> {account.location}</p>

      <button onClick={() => navigate(-1)} style={btn}>⬅️ Wróć</button>
      <button onClick={() => setShowModal(true)} style={btn}>➕ Dodaj kontener</button>

      <CreateBlobStorageModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        account={account}
        endpoint={`/api/${storageAccountId}/create_blob_container`}
        onCreated={fetchContainers}
      />

      {error && <p style={{ color: "red" }}>❌ {error}</p>}
      {containers.length === 0 ? (
        <p>Brak kontenerów blob.</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Kontener</th>
              <th style={thStyle}>Ostatnia modyfikacja</th>
              <th style={thStyle}>Akcje</th>
            </tr>
          </thead>
          <tbody>
            {containers.map((c, i) => (
              <React.Fragment key={i}>
                <tr>
                  <td style={tdStyle}><strong>{c.name}</strong></td>
                  <td style={tdStyle}>{new Date(c.last_modified).toLocaleString()}</td>
                  <td style={tdStyle}>
                    <button onClick={() => handleDeleteContainer(c.name)}>🗑</button>
                    <button onClick={() => toggleExpand(c.name)} style={{ marginLeft: "10px" }}>
                      {expanded[c.name] ? "🔽 Zamknij" : "🔼 Pokaż pliki"}
                    </button>
                  </td>
                </tr>
                {expanded[c.name] && (
                  <tr>
                    <td colSpan="3" style={{ padding: "10px", backgroundColor: "#f9f9f9" }}>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const file = e.target.file.files[0];
                          if (!file) return;

                          const formData = new FormData();
                          formData.append("file", file);
                          formData.append("accountName", account.name);
                          formData.append("accountKey", account.Keys);
                          formData.append("containerName", c.name);

                          const res = await fetch(`/api/${storageAccountId}/upload_blob`, {
                            method: "POST",
                            credentials: "include",
                            body: formData,
                          });

                          const data = await res.json();
                          if (!res.ok) return alert(`❌ ${data.error}`);
                          fetchBlobs(c.name);
                        }}
                        style={{ marginBottom: "10px" }}
                      >
                        <input type="file" name="file" />
                        <button type="submit" style={{ marginLeft: "10px" }}>📤 Wyślij</button>
                      </form>

                      {expanded[c.name].length === 0 ? (
                        <p>Brak plików w kontenerze.</p>
                      ) : (
                        <table style={innerTableStyle}>
                          <thead>
                            <tr>
                              <th style={thStyle}>Plik</th>
                              <th style={thStyle}>Rozmiar</th>
                              <th style={thStyle}>Modyfikacja</th>
                              <th style={thStyle}>Akcje</th>
                            </tr>
                          </thead>
                          <tbody>
                            {expanded[c.name].map((blob, j) => (
                              <tr key={j}>
                                <td style={tdStyle}>{blob.name}</td>
                                <td style={tdStyle}>{(blob.size / 1024).toFixed(2)} KB</td>
                                <td style={tdStyle}>{new Date(blob.last_modified).toLocaleString()}</td>
                                <td style={tdStyle}>
                                  <button
                                    onClick={async () => {
                                      const res = await fetch(`/api/${storageAccountId}/download_blob`, {
                                        method: "POST",
                                        credentials: "include",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          accountName: account.name,
                                          accountKey: account.Keys,
                                          containerName: c.name,
                                          blobName: blob.name
                                        }),
                                      });

                                      if (!res.ok) return alert("❌ Błąd pobierania");

                                      const blobData = await res.blob();
                                      const url = window.URL.createObjectURL(blobData);
                                      const a = document.createElement("a");
                                      a.href = url;
                                      a.download = blob.name;
                                      a.click();
                                      window.URL.revokeObjectURL(url);
                                    }}
                                  >
                                    ⬇️
                                  </button>

                                  <button
                                    style={{ marginLeft: "5px" }}
                                    onClick={async () => {
                                      if (!window.confirm(`Usunąć plik "${blob.name}"?`)) return;

                                      const res = await fetch(`/api/${storageAccountId}/delete_blob`, {
                                        method: "DELETE",
                                        credentials: "include",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          accountName: account.name,
                                          accountKey: account.Keys,
                                          containerName: c.name,
                                          blobName: blob.name
                                        }),
                                      });

                                      const data = await res.json();
                                      if (!res.ok) return alert(`❌ ${data.error}`);
                                      fetchBlobs(c.name);
                                    }}
                                  >
                                    🗑
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
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

const innerTableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: "10px",
  border: "1px solid #ccc"
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

export default StorageBlobContainers;
