import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CreateStorageAccountModal from "../components/CreateStorageAccountModal";
import CreateBucketGCPModal from "../components/CreateBucketGCPModal";
import CreateBucketAWSModal from "../components/CreateBucketAWSModal";

const Storage = () => {
  const [azureAccounts, setAzureAccounts] = useState([]);
  const [azureLoading, setAzureLoading] = useState(true);
  const [azureError, setAzureError] = useState(null);

  const [gcpProjects, setGcpProjects] = useState([]);
  const [gcpLoading, setGcpLoading] = useState(true);
  const [gcpError, setGcpError] = useState(null);

  const [awsBuckets, setAwsBuckets] = useState([]);
  const [awsLoading, setAwsLoading] = useState(true);
  const [awsError, setAwsError] = useState(null);

  const [showAzureModal, setShowAzureModal] = useState(false);
  const [showGCPModal, setShowGCPModal] = useState(false);
  const [showAWSModal, setShowAWSModal] = useState(false);
  const navigate = useNavigate();

  const fetchAzureAccounts = async () => {
    setAzureLoading(true);
    setAzureError(null);
    try {
      const res = await fetch("/api/list_storage_accounts", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `Błąd HTTP: ${res.status}` }));
        throw new Error(data.error || `Błąd HTTP: ${res.status}`);
      }
      const data = await res.json();
      setAzureAccounts(data.value || []);
    } catch (err) {
      console.error("Błąd pobierania danych z Azure:", err);
      setAzureError(err.message);
    } finally {
      setAzureLoading(false);
    }
  };

  const fetchGCPBuckets = async () => {
    setGcpLoading(true);
    setGcpError(null);
    try {
      const res = await fetch("/api/projects/list_buckets", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `Błąd HTTP: ${res.status}` }));
        throw new Error(data.error || `Błąd HTTP: ${res.status}`);
      }
      const data = await res.json();
      setGcpProjects(data.value || []);
    } catch (err) {
      console.error("Błąd pobierania danych z GCP:", err);
      setGcpError(err.message);
    } finally {
      setGcpLoading(false);
    }
  };

  useEffect(() => {
    fetchAzureAccounts();
    fetchGCPBuckets();
    fetchAWSBuckets();
  }, []);

  const fetchAWSBuckets = async () => {
    setAwsLoading(true);
    setAwsError(null);
    try {
      const res = await fetch("/api/aws/list_buckets", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `Błąd HTTP: ${res.status}` }));
        throw new Error(data.error || `Błąd HTTP: ${res.status}`);
      }
      const data = await res.json();
      setAwsBuckets(data.value || []);
    } catch (err) {
      console.error("Błąd pobierania danych z AWS:", err);
      setAwsError(err.message);
    } finally {
      setAwsLoading(false);
    }
  };

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
      fetchAzureAccounts();
    } catch (err) {
      alert(`❌ ${err.message}`);
    }
  };

  const handleDeleteGCP = async (resource) => {
    const confirmMessage = `Aby usunąć bucket "${resource.name}" wraz z CAŁĄ ZAWARTOŚCIĄ, wpisz jego nazwę poniżej. Ta operacja jest NIEODWRACALNA.`;
    const userInput = window.prompt(confirmMessage);

    if (userInput !== resource.name) {
      if (userInput !== null) {
          alert("Nazwa bucketa nie zgadza się. Anulowano usuwanie.");
      }
      return;
    }

    try {
      const res = await fetch("/api/projects/delete_bucket", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucketName: resource.name,
          projectId: resource.projectId,
          force: true
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd usuwania bucketa");
      alert(`✅ ${data.message}`);
      fetchGCPBuckets();
    } catch (err) {
      alert(`❌ ${err.message}`);
    }
  };

  const handleDeleteAWS = async (bucket) => {
    const confirmMessage = `Aby usunąć bucket "${bucket.name}" wraz z CAŁĄ ZAWARTOŚCIĄ, wpisz jego nazwę poniżej. Ta operacja jest NIEODWRACALNA.`;
    const userInput = window.prompt(confirmMessage);

    if (userInput !== bucket.name) {
      if (userInput !== null) {
        alert("Nazwa bucketa nie zgadza się. Anulowano usuwanie.");
      }
      return;
    }

    try {
      const res = await fetch("/api/aws/delete_bucket", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucketName: bucket.name,
          force: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd usuwania bucketa");
      alert(`✅ ${data.message}`);
      fetchAWSBuckets();
    } catch (err) {
      alert(`❌ ${err.message}`);
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>📦 Zasoby Storage (Multi-Cloud)</h1>
      <p>Lista wszystkich kont Storage (Azure), bucketów (GCP) i bucketów S3 (AWS) w Twoim środowisku.</p>
      
      <button onClick={() => { fetchAzureAccounts(); fetchGCPBuckets(); fetchAWSBuckets(); }} style={buttonStyle}>
        🔄 Odśwież wszystko
      </button>

      <div style={{ marginTop: '30px', marginBottom: '40px' }}>
        <h2>Azure Storage Accounts</h2>
        <button onClick={() => setShowAzureModal(true)} style={buttonStyle}>
          ➕ Utwórz Storage Account (Azure)
        </button>
        <CreateStorageAccountModal
          isOpen={showAzureModal}
          onClose={() => setShowAzureModal(false)}
          onCreated={fetchAzureAccounts}
        />
        {azureLoading ? (
          <p>⏳ Ładowanie danych z Azure...</p>
        ) : azureError ? (
          <p style={{ color: "red" }}>❌ Błąd Azure: {azureError}</p>
        ) : azureAccounts.length === 0 ? (
          <p>Brak dostępnych Storage Accounts w Azure (lub nie jesteś zalogowany).</p>
        ) : (
          <table style={tableStyle}>
            {/* --- ZMIANY W NAGŁÓWKACH TABELI --- */}
            <thead>
              <tr style={{ backgroundColor: "#f5f5f5" }}>
                <th style={thStyle}>Nazwa</th>
                <th style={thStyle}>Grupa zasobów</th>
                <th style={thStyle}>Lokalizacja</th>
                <th style={thStyle}>Rodzaj konta</th>
                <th style={thStyle}>Użycie</th>
                <th style={thStyle}>Warstwa</th>
                <th style={thStyle}>Dostęp publiczny</th>
                <th style={thStyle}>SKU (Replikacja)</th>
                <th style={thStyle}>Akcje</th>
              </tr>
            </thead>
            {/* --- KONIEC ZMIAN W NAGŁÓWKACH --- */}
            
            <tbody>
              {/* --- ZMIANY W KOMÓRKACH TABELI --- */}
              {azureAccounts.map((acc, idx) => (
                <tr key={idx}>
                  <td style={tdStyle}>{acc.name}</td>
                  <td style={tdStyle}>{acc.resourceGroup}</td>
                  <td style={tdStyle}>{acc.location}</td>
                  <td style={tdStyle}>{acc.storageType}</td>
                  <td style={tdStyle}>{acc.usage}</td>
                  <td style={tdStyle}>{acc.accessTier || 'N/A'}</td>
                  <td style={
                    // Stylizuje komórkę na czerwono jeśli dostęp jest Włączony (niebezpieczne)
                    acc.publicAccess === "Włączony" 
                    ? { ...tdStyle, color: '#D9534F', fontWeight: 'bold'} 
                    : tdStyle
                  }>
                    {acc.publicAccess}
                  </td>
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
              {/* --- KONIEC ZMIAN W KOMÓRKACH --- */}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <h2>Google Cloud Storage Buckets</h2>
        <button onClick={() => setShowGCPModal(true)} style={buttonStyle}>
          ➕ Utwórz Bucket (GCP)
        </button>
        <CreateBucketGCPModal
          isOpen={showGCPModal}
          onClose={() => setShowGCPModal(false)}
          onCreated={fetchGCPBuckets}
        />
        {gcpLoading ? (
          <p>⏳ Ładowanie danych z GCP...</p>
        ) : gcpError ? (
          <p style={{ color: "red" }}>❌ Błąd GCP: {gcpError}</p>
        ) : gcpProjects.length === 0 ? (
          <p>Brak dostępnych bucketów w GCP (lub nie jesteś zalogowany).</p>
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
                project.buckets.map(bucket => {
                  const resourceInfo = { ...bucket, projectId: project.projectId, projectDisplayName: project.displayName };
                  return (
                    <tr key={`${project.projectId}-${bucket.name}`}>
                      <td style={tdStyle}>{bucket.name}</td>
                      <td style={tdStyle}>{project.displayName} ({project.projectId})</td>
                      <td style={tdStyle}>{bucket.location}</td>
                      <td style={tdStyle}>{bucket.storageClass}</td>
                      <td style={tdStyle}>
                        <button
                          onClick={() => {
                            sessionStorage.setItem("selectedGCPBucket", JSON.stringify(resourceInfo));
                            navigate(`/storage/gcp/${bucket.name}`, { state: resourceInfo });
                          }}
                          title="Pokaż pliki"
                        >
                          📂
                        </button>
                        <button onClick={() => handleDeleteGCP(resourceInfo)} title="Usuń" style={{ marginLeft: "5px" }}>🗑️</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: '30px', marginBottom: '40px' }}>
        <h2>Amazon S3 Buckets (AWS)</h2>
        <button onClick={() => setShowAWSModal(true)} style={buttonStyleAWS}>
          ➕ Utwórz Bucket S3 (AWS)
        </button>
        <CreateBucketAWSModal
          isOpen={showAWSModal}
          onClose={() => setShowAWSModal(false)}
          onCreated={fetchAWSBuckets}
        />
        {awsLoading ? (
          <p>⏳ Ładowanie danych z AWS...</p>
        ) : awsError ? (
          <p style={{ color: "red" }}>❌ Błąd AWS: {awsError}</p>
        ) : awsBuckets.length === 0 ? (
          <p>Brak dostępnych bucketów S3 w AWS (lub nie jesteś zalogowany).</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={{ backgroundColor: "#FFF3E0" }}>
                <th style={thStyle}>Nazwa Bucketa</th>
                <th style={thStyle}>Region</th>
                <th style={thStyle}>Utworzony</th>
                <th style={thStyle}>Obiekty</th>
                <th style={thStyle}>Rozmiar</th>
                <th style={thStyle}>Wersjonowanie</th>
                <th style={thStyle}>Szyfrowanie</th>
                <th style={thStyle}>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {awsBuckets.map((bucket, idx) => (
                <tr key={idx}>
                  <td style={tdStyle}>{bucket.name}</td>
                  <td style={tdStyle}>{bucket.region}</td>
                  <td style={tdStyle}>{bucket.creationDate ? new Date(bucket.creationDate).toLocaleDateString() : '—'}</td>
                  <td style={tdStyle}>{bucket.objectCount}</td>
                  <td style={tdStyle}>{bucket.totalSize}</td>
                  <td style={tdStyle}>{bucket.versioning}</td>
                  <td style={tdStyle}>{bucket.encryption}</td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => {
                        sessionStorage.setItem("selectedAWSBucket", JSON.stringify(bucket));
                        navigate(`/storage/aws/${bucket.name}`, { state: bucket });
                      }}
                      title="Pokaż obiekty"
                    >
                      📂
                    </button>
                    <button onClick={() => handleDeleteAWS(bucket)} title="Usuń" style={{ marginLeft: "5px" }}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const buttonStyleAWS = {
  padding: "10px",
  background: "#FF9900",
  color: "white",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  marginBottom: "20px",
  marginRight: "10px"
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