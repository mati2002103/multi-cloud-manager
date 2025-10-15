import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CreateStorageAccountModal from "../components/CreateStorageAccountModal";
import CreateBucketGCPModal from "../components/CreateBucketGCPModal";


const Storage = () => {
  const [azureAccounts, setAzureAccounts] = useState([]);
  const [gcpProjects, setGcpProjects] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showGCPModal, setShowGCPModal] = useState(false);
  const navigate = useNavigate();

  const fetchAllStorageResources = async () => {
    setLoading(true);
    setError(null);
    try {
      const [azureRes, gcpRes] = await Promise.allSettled([
        fetch("/api/list_storage_accounts", { credentials: "include" }),
        fetch("/api/projects/list_buckets", { credentials: "include" }),
      ]);

      let errors = [];

      if (azureRes.status === "fulfilled" && azureRes.value.ok) {
        const data = await azureRes.value.json();
        setAzureAccounts(data.value || []);
      } else {
        errors.push("Nie udało się pobrać danych z Azure.");
        setAzureAccounts([]);
      }

      if (gcpRes.status === "fulfilled" && gcpRes.value.ok) {
        const data = await gcpRes.value.json();
        setGcpProjects(data.value || []);
      } else {
        errors.push("Nie udało się pobrać danych z GCP.");
        setGcpProjects([]); 
      }
      
      if (errors.length > 0) setError(errors.join(' '));
      if (errors.length === 2) setError("Nie udało się pobrać danych z żadnej chmury.");

    } catch (err) {
      console.error("Błąd krytyczny podczas pobierania zasobów:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllStorageResources();
  }, []);

  const handleDeleteAzure = async (account) => {
    if (!window.confirm(`Czy na pewno chcesz usunąć Storage Account "${account.name}"?`)) return;

    try {
      const res = await fetch("/api/delete_storage_account", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionId: account.subscriptionId,
          resourceGroup: account.resourceGroup,
          accountName: account.name
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd usuwania Storage Account");
      fetchAllStorageResources();
    } catch (err) {
      alert(`❌ ${err.message}`);
    }
  };
   const handleDeleteGCP = async (bucket) => {
    if (!window.confirm(`Czy na pewno chcesz spróbować usunąć bucket "${bucket.name}"?`)) return;

    try {
      const res = await fetch("/api/projects/delete_bucket", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucketName: bucket.name,
          projectId: bucket.projectId, 
          force: false
        }),
      });

      const data = await res.json();

      if (res.ok) {
        alert(`✅ ${data.message}`);
        fetchAllStorageResources();
        return; 
      }
      
      if (res.status === 409) {
        const forceConfirm = window.confirm(
          `❌ Bucket "${bucket.name}" nie jest pusty.\n\nCzy chcesz go usunąć wraz z całą zawartością? Ta operacja jest NIEODWRACALNA.`
        );

        if (forceConfirm) {
          const forceRes = await fetch("/api/projects/delete_bucket", {
            method: "DELETE",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bucketName: bucket.name,
              projectId: bucket.projectId,
              force: true 
            }),
          });
          
          const forceData = await forceRes.json();
          if (!forceRes.ok) throw new Error(forceData.error || "Błąd podczas usuwania z zawartością.");
          
          alert(`✅ ${forceData.message}`);
          fetchAllStorageResources();
        }
      } else {
        
        throw new Error(data.error || "Wystąpił nieoczekiwany błąd.");
      }
    } catch (err) {
      alert(`❌ ${err.message}`);
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>📦 Zasoby Storage (Multi-Cloud)</h1>
      <p>Lista wszystkich kont Storage (Azure) i bucketów (GCP) w Twoim środowisku.</p>
        <button onClick={fetchAllStorageResources} style={buttonStyle}>
        🔄 Odśwież wszystko
      </button>

    
    

      {loading ? (
        <p>⏳ Ładowanie danych z wszystkich chmur...</p>
      ) : error ? (
        <p style={{ color: "red" }}>❌ Błąd: {error}</p>
      ) : (
        <>
          {/* SEKCJA DLA AZURE */}
          <div style={{ marginTop: '30px' }}>
            <h2>
              Azure Storage Accounts
            </h2>
              <button onClick={() => setShowModal(true)} style={buttonStyle}>
        ➕ Utwórz Storage Account (Azure)
      </button>

      <CreateStorageAccountModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onCreated={fetchAllStorageResources}
      />
            {azureAccounts.length === 0 ? (
              <p>Brak dostępnych Storage Accounts w Azure.</p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr style={{ backgroundColor: "#f5f5f5" }}>
                    <th style={thStyle}>Nazwa</th>
                    <th style={thStyle}>Grupa zasobów</th>
                    <th style={thStyle}>Lokalizacja</th>
                    <th style={thStyle}>SKU</th>
                    <th style={thStyle}>Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {azureAccounts.map((acc, idx) => (
                    <tr key={idx}>
                      <td style={tdStyle}>{acc.name}</td>
                      <td style={tdStyle}>{acc.resourceGroup}</td>
                      <td style={tdStyle}>{acc.location}</td>
                      <td style={tdStyle}>{acc.sku}</td>
                      <td style={tdStyle}>
                        <button onClick={() => handleDeleteAzure(acc)} title="Usuń">🗑️</button>
                        <button
                          onClick={() => {
                            sessionStorage.setItem("selectedStorageAccount", JSON.stringify(acc));
                            navigate(`/storage/${acc.name}`, { state: acc });
                          }}
                          title="Szczegóły" style={{ marginLeft: "5px" }}>
                          📂
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <CreateBucketGCPModal
            isOpen={showGCPModal}
            onClose={() => setShowGCPModal(false)}
            onCreated={fetchAllStorageResources}
          />
          {/* SEKCJA DLA GCP */}
          <div style={{ marginTop: '40px' }}>
            <h2>
              Google Cloud Storage Buckets
            </h2>
            <button onClick={() => setShowGCPModal(true)} style={buttonStyle}>
              ➕ Utwórz Bucket (GCP)
            </button>
            {gcpProjects.length === 0 ? (
              <p>Brak dostępnych bucketów w GCP.</p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr style={{ backgroundColor: "#f5f5f5" }}>
                    <th style={thStyle}>Nazwa Bucketa</th>
                    <th style={thStyle}>Projekt</th>
                    <th style={thStyle}>Lokalizacja</th>
                    <th style={thStyle}>Klasa Storage</th>
                    <th style={thStyle}>Akcje</th>

                  </tr>
                </thead>
                <tbody>
                  {gcpProjects.flatMap(project =>
                    project.buckets.map(bucket => (
                      <tr key={`${project.projectId}-${bucket.name}`}>
                        <td style={tdStyle}>{bucket.name}</td>
                        <td style={tdStyle}>{project.displayName} ({project.projectId})</td>
                        <td style={tdStyle}>{bucket.location}</td>
                        <td style={tdStyle}>{bucket.storageClass}</td>                        
                        <button onClick={() => handleDeleteGCP(bucket)} title="Usuń">🗑️</button>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const buttonStyle = {
  padding: "10px",
  background: "#0078D4",
  color: "white",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  marginBottom: "20px",
  marginRight: "10px"
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  border: "1px solid #ddd",
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
};

const thStyle = {
  textAlign: "left",
  padding: "10px",
  borderBottom: "1px solid #ddd",
};

const tdStyle = {
  padding: "8px",
  borderBottom: "1px solid #ddd",
  fontFamily: "monospace",
};

export default Storage;