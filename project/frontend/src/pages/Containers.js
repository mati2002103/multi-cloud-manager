import React, { useEffect, useState } from "react";
import CreateContainerModal from "../components/CreateContainerModal";
import CreateGCPContainerModal from "../components/CreateGCPContainerModal"; 
import CreateAWSContainerModal from "../components/CreateAWSContainerModal";
import { useNavigate } from "react-router-dom";

const Containers = () => {
  const [azureContainers, setAzureContainers] = useState([]);
  const [azureLoading, setAzureLoading] = useState(true);
  const [azureError, setAzureError] = useState(null);
  const [showAzureModal, setShowAzureModal] = useState(false);

  const [gcpServices, setGcpServices] = useState([]);
  const [gcpLoading, setGcpLoading] = useState(true);
  const [gcpError, setGcpError] = useState(null);
  const [showGCPModal, setShowGCPModal] = useState(false); 

  const [awsServices, setAwsServices] = useState([]);
  const [awsLoading, setAwsLoading] = useState(true);
  const [awsError, setAwsError] = useState(null);
  const [showAwsModal, setShowAwsModal] = useState(false);

  const navigate = useNavigate();
  
  const fetchAzureContainers = async () => {
    setAzureLoading(true);
    setAzureError(null);
    try {
      const res = await fetch("/api/list_containers", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `Błąd HTTP: ${res.status}` }));
        throw new Error(data.error || `Błąd HTTP: ${res.status}`);
      }
      const data = await res.json();
      setAzureContainers(data.value || []);
    } catch (err) {
      console.error("Błąd pobierania kontenerów Azure:", err);
      setAzureError(err.message);
    } finally {
      setAzureLoading(false);
    }
  };

  const fetchGcpContainers = async () => {
    setGcpLoading(true);
    setGcpError(null);
    try {
      const res = await fetch("/api/gcp/list_containers", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `Błąd HTTP: ${res.status}` }));
        throw new Error(data.error || `Błąd HTTP: ${res.status}`);
      }
      const data = await res.json();
      setGcpServices(data.value || []);
    } catch (err) {
      console.error("Błąd pobierania usług Cloud Run (GCP):", err);
      setGcpError(err.message);
    } finally {
      setGcpLoading(false);
    }
  };

  const fetchAwsServices = async () => {
    setAwsLoading(true);
    setAwsError(null);
    try {
      const res = await fetch("/api/aws/ecs/services", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `Błąd HTTP: ${res.status}` }));
        throw new Error(data.error || `Błąd HTTP: ${res.status}`);
      }
      const data = await res.json();
      setAwsServices(data.value || []);
    } catch (err) {
      console.error("Błąd pobierania usług ECS (AWS):", err);
      setAwsError(err.message);
    } finally {
      setAwsLoading(false);
    }
  };

  const handleDeleteGCP = async (service) => {
    if (!window.confirm(`Czy na pewno chcesz usunąć usługę Cloud Run "${service.name}" w regionie "${service.region}"?`)) return;
    try {
      const res = await fetch("/api/gcp/delete_container", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: service.projectId,
          region: service.region,
          serviceName: service.name
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd usuwania usługi Cloud Run");
      alert(`✅ ${data.message}`);
      setTimeout(() => { fetchGcpContainers(); }, 3000);
    } catch (err) {
      alert(`❌ ${err.message}`);
    }
  };

  useEffect(() => {
    fetchAzureContainers();
    fetchGcpContainers();
    fetchAwsServices();
  }, []);

  const handleDeleteAzure = async (container) => {
    if (!window.confirm(`Czy na pewno chcesz usunąć kontener "${container.name}"?`)) return;
    try {
      const res = await fetch("/api/delete_container", {
        method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: container.subscriptionId, resourceGroup: container.resourceGroup, containerName: container.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd usuwania kontenera");
      fetchAzureContainers();
    } catch (err) { alert(`❌ ${err.message}`); }
  };

  const handleRestartAzure = async (container) => {
    if (!window.confirm(`Czy chcesz zrestartować kontener: "${container.name}"?`)) return;
    try {
      const res = await fetch("/api/restart_container", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: container.subscriptionId, resourceGroup: container.resourceGroup, containerName: container.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd restartowania kontenera");
      fetchAzureContainers();
    } catch (err) { alert(`❌ ${err.message}`); }
  };

  const handleDeleteAws = async (svc) => {
    if (!window.confirm(`Czy na pewno chcesz usunąć usługę ECS "${svc.serviceName}"?`)) return;
    try {
      const res = await fetch("/api/aws/ecs/delete", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region: svc.region,
          clusterName: svc.clusterName,
          serviceName: svc.serviceName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd usuwania ECS service");
      alert(`✅ ${data.message}`);
      setTimeout(() => fetchAwsServices(), 3000);
    } catch (err) {
      alert(`❌ ${err.message}`);
    }
  };

  const handleRestartAws = async (svc) => {
    if (!window.confirm(`Czy chcesz zrestartować usługę ECS "${svc.serviceName}"?`)) return;
    try {
      const res = await fetch("/api/aws/ecs/restart", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region: svc.region,
          clusterName: svc.clusterName,
          serviceName: svc.serviceName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd restartowania ECS service");
      alert(`✅ ${data.message}`);
      fetchAwsServices();
    } catch (err) {
      alert(`❌ ${err.message}`);
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>📦 Kontenery (Multi-Cloud)</h1>
      <p>Lista wszystkich wdrożonych kontenerów w Azure Container Instances, Google Cloud Run i Amazon ECS.</p>

      <button onClick={() => { fetchAzureContainers(); fetchGcpContainers(); fetchAwsServices(); }} style={buttonStyle}>
        🔄 Odśwież wszystko
      </button>

      <div style={{ marginTop: '30px', marginBottom: '40px' }}>
        <h2>Azure Container Instances</h2>
        <button onClick={() => setShowAzureModal(true)} style={buttonStyle}>
          ➕ Utwórz kontener (Azure)
        </button>
        <CreateContainerModal
          isOpen={showAzureModal}
          onClose={() => setShowAzureModal(false)}
          onCreated={fetchAzureContainers}
        />
        {azureLoading ? (
          <p>⏳ Ładowanie danych z Azure...</p>
        ) : azureError ? (
          <p style={{ color: "red" }}>❌ Błąd Azure: {azureError}</p>
        ) : azureContainers.length === 0 ? (
          <p>Brak dostępnych kontenerów w Azure.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={headerStyle}>
                <th>Nazwa</th>
                <th>Resource Group</th>
                <th>Lokalizacja</th>
                <th>Status</th>
                <th>Obraz</th>
                <th>Monitor</th>
                <th>Restart</th>
                <th>Delete</th>
              </tr>
            </thead>
            <tbody>
              {azureContainers.map((container, idx) => (
                <tr key={`azure-${idx}`}>
                  <td style={cellStyle}>{container.name}</td>
                  <td style={cellStyle}>{container.resourceGroup}</td>
                  <td style={cellStyle}>{container.location}</td>
                  <td style={cellStyle}>{container.status}</td>
                  <td style={cellStyle}>{container.image}</td>
                  <td style={cellStyle}>
                    <span style={{ cursor: "pointer" }} onClick={() => navigate(`/container/${container.name}/monitoring`)}>
                      📈
                    </span>
                  </td>

                  <td style={cellStyle}>
                    <button onClick={() => handleRestartAzure(container)}>🔁</button>
                  </td>
                  <td style={cellStyle}>
                    <button onClick={() => handleDeleteAzure(container)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <h2>Google Cloud Run Services</h2>
       
        <button onClick={() => setShowGCPModal(true)} style={buttonStyle}>
          ➕ Utwórz usługę (GCP)
        </button>
       
        <CreateGCPContainerModal
          isOpen={showGCPModal}
          onClose={() => setShowGCPModal(false)}
          onCreated={fetchGcpContainers}
        />
        {gcpLoading ? (
          <p>⏳ Ładowanie danych z GCP...</p>
        ) : gcpError ? (
          <p style={{ color: "red" }}>❌ Błąd GCP: {gcpError}</p>
        ) : gcpServices.length === 0 ? (
          <p>Brak dostępnych usług Cloud Run w GCP.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={headerStyle}>
                <th>Nazwa Usługi</th>
                <th>Region</th>
                <th>URL Punktu Końcowego</th>
                <th>Utworzono</th>
                <th>Monitor</th>
                <th>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {gcpServices.map((service, idx) => (
                <tr key={`gcp-${idx}`}>
                  <td style={cellStyle}>{service.name}</td>
                  <td style={cellStyle}>{service.region}</td>
                  <td style={cellStyle}><a href={service.url} target="_blank" rel="noopener noreferrer">{service.url}</a></td>
                  <td style={cellStyle}>{service.created ? new Date(service.created).toLocaleString() : '—'}</td>
                   <td style={cellStyle}>
                    <span style={{ cursor: "pointer" }} onClick={() => navigate(`/container/gcp/${service.name}/monitoring`)}>
                      📈
                    </span>
                  </td>
                  <td style={cellStyle}>
                    <button onClick={() => handleDeleteGCP(service)} title="Usuń usługę">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <h2>Amazon ECS Services</h2>

        <button onClick={() => setShowAwsModal(true)} style={buttonStyle}>
          ➕ Utwórz usługę (ECS)
        </button>

        <CreateAWSContainerModal
          isOpen={showAwsModal}
          onClose={() => setShowAwsModal(false)}
          onCreated={fetchAwsServices}
        />

        {awsLoading ? (
          <p>⏳ Ładowanie usług ECS (AWS)...</p>
        ) : awsError ? (
          <p style={{ color: "red" }}>❌ Błąd AWS: {awsError}</p>
        ) : awsServices.length === 0 ? (
          <p>Brak dostępnych usług ECS w AWS.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={headerStyle}>
                <th>Nazwa usługi</th>
                <th>Cluster</th>
                <th>Region</th>
                <th>Status</th>
                <th>Desired</th>
                <th>Running</th>
                <th>Monitor</th>
                <th>Restart</th>
                <th>Delete</th>
              </tr>
            </thead>
            <tbody>
              {awsServices.map((svc, idx) => (
                <tr key={`aws-${idx}`}>
                  <td style={cellStyle}>{svc.serviceName}</td>
                  <td style={cellStyle}>{svc.clusterName}</td>
                  <td style={cellStyle}>{svc.region}</td>
                  <td style={cellStyle}>{svc.status}</td>
                  <td style={cellStyle}>{svc.desiredCount}</td>
                  <td style={cellStyle}>{svc.runningCount}</td>
                  <td style={cellStyle}>
                    <span
                      style={{ cursor: "pointer" }}
                      onClick={() => navigate(`/container/aws/${svc.region}/${svc.clusterName}/${svc.serviceName}/monitoring`)}
                    >
                      📈
                    </span>
                  </td>
                  <td style={cellStyle}>
                    <button onClick={() => handleRestartAws(svc)} title="Force new deployment">
                      🔁
                    </button>
                  </td>
                  <td style={cellStyle}>
                    <button onClick={() => handleDeleteAws(svc)} title="Usuń usługę">
                      🗑️
                    </button>
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

const tableStyle = {
  width: "100%", borderCollapse: "collapse", border: "1px solid #ddd",
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)", marginTop: "20px",
};
const headerStyle = {
  backgroundColor: "#f5f5f5", textAlign: "left", padding: "10px",
  borderBottom: "1px solid #ddd",
};
const cellStyle = {
  padding: "8px", borderBottom: "1px solid #ddd", fontFamily: "monospace",
};
const buttonStyle = {
  padding: '10px', background: '#0078D4', color: 'white', border: 'none',
  borderRadius: '8px', cursor: 'pointer', marginRight: '10px', marginBottom: '10px'
};

export default Containers;