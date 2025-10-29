import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
// import CreateContainerAlertModal from "../components/CreateContainerAlertModal";

const ContainerMonitor = () => {
  const { containerId } = useParams();
  const navigate = useNavigate();

  const [containerInfo, setContainerInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [activeTab, setActiveTab] = useState("azureMonitor");

  const [linkedWorkspace, setLinkedWorkspace] = useState(null);
  const [wsLoading, setWsLoading] = useState(true);
  const [wsError, setWsError] = useState(null);

  const [kqlQuery, setKqlQuery] = useState(`ContainerInstanceLog_CL | where ContainerGroup_s == '${containerId}' | top 10 by TimeGenerated desc`);
  const [kqlResults, setKqlResults] = useState([]);
  const [kqlLoading, setKqlLoading] = useState(false);
  const [kqlError, setKqlError] = useState(null);
  
  const [workspaces, setWorkspaces] = useState([]); // Ten stan jest potrzebny tylko dla 'create workspace'
  const [showCreateWs, setShowCreateWs] = useState(false);
  const [creatingWs, setCreatingWs] = useState(false);
  const [createWsForm, setCreateWsForm] = useState({
    subscriptionId: "", rgName: "", workspaceName: "",
    location: "westeurope", sku: "PerGB2018", retentionInDays: 30,
  });

  const [showCreateAlertModal, setShowCreateAlertModal] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/container/${containerId}/metrics`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
    })
      .then((res) => res.ok ? res.json() : res.json().then(err => { throw new Error(err.error || "Błąd pobierania metryk") }))
      .then((data) => {
        setContainerInfo(data);
        if (data.metrics?.length > 0) setSelectedMetric(data.metrics[0].name);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Błąd pobierania danych kontenera:", err);
        setContainerInfo({ error: err.message });
        setLoading(false);
      });
  }, [containerId]);

  useEffect(() => {
    setWsLoading(true);
    setWsError(null);
    fetch(`/api/container/${containerId}/linked_workspace`, { credentials: "include" })
      .then((res) => res.ok ? res.json() : res.json().then(err => { throw new Error(err.error || "Błąd sprawdzania workspace") }))
      .then((data) => {
        setLinkedWorkspace(data.value);
      })
      .catch((err) => {
        console.error("Błąd pobierania powiązanego workspace:", err);
        setWsError(err.message);
      })
      .finally(() => setWsLoading(false));
  }, [containerId]);
  
  // Funkcja fetchWorkspaces jest potrzebna tylko dla modala "Nowy workspace"
  const fetchWorkspaces = useCallback(async (subscriptionId) => {
    if (!subscriptionId) return;
    setWsLoading(true);
    setWsError(null);
    try {
      const res = await fetch(
        `/api/log_analytics?subscriptionId=${subscriptionId}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd pobierania workspace'ów");
      setWorkspaces(data.value || []);
    } catch (err) {
      console.error("fetchWorkspaces:", err);
      setWsError(err.message);
    } finally {
      setWsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (containerInfo?.subscriptionId) {
      fetchWorkspaces(containerInfo.subscriptionId); // Pobierz wszystkie, aby modal 'Nowy' wiedział, co istnieje
       if (containerInfo?.resourceGroup) {
         setCreateWsForm((f) => ({ ...f, subscriptionId: containerInfo.subscriptionId, rgName: containerInfo.resourceGroup }));
       }
    }
  }, [containerInfo?.subscriptionId, containerInfo?.resourceGroup, fetchWorkspaces]);

  const createWorkspace = async (e) => {
    e.preventDefault();
    setCreatingWs(true);
    try {
      const payload = {
        subscriptionId: createWsForm.subscriptionId, rgName: createWsForm.rgName,
        workspaceName: createWsForm.workspaceName, location: createWsForm.location,
        sku: createWsForm.sku, retentionInDays: createWsForm.retentionInDays,
      };
      const res = await fetch("/api/log_analytics", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd tworzenia workspace");
      
      // Po utworzeniu, odśwież powiązany workspace
      fetch(`/api/container/${containerId}/linked_workspace`, { credentials: "include" })
        .then(res => res.json()).then(data => setLinkedWorkspace(data.value));
        
      setShowCreateWs(false);
      alert(data.message || "Workspace utworzony");
    } catch (err) {
      alert("❌ " + err.message);
    } finally {
      setCreatingWs(false);
    }
  };

  const handleExportLogs = (type) => {
    if (!linkedWorkspace) { alert("Kontener nie jest powiązany z Log Analytics Workspace."); return; }
    
    const backendUrl = "http://localhost:5000";
    const downloadUrl = `${backendUrl}/api/container/${containerId}/logs/export?type=${type}&workspaceGuid=${encodeURIComponent(linkedWorkspace.workspaceGuid)}`;
    
    console.log("Attempting to download from ABSOLUTE URL:", downloadUrl);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', `${containerId}_logs.csv`); // Uproszczona nazwa
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleKqlQuerySubmit = async () => {
    if (!linkedWorkspace) { setKqlError("Kontener nie jest powiązany z Log Analytics Workspace."); return; }
    if (!kqlQuery) { setKqlError("Zapytanie KQL nie może być puste."); return; }
    
    setKqlLoading(true);
    setKqlError(null);
    setKqlResults([]);

    try {
      const res = await fetch(`/api/container/${containerId}/logs/query`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceGuid: linkedWorkspace.workspaceGuid,
          kqlQuery: kqlQuery
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd zapytania KQL");
      setKqlResults(data.value || []);
      if (!data.value || data.value.length === 0) {
        setKqlError("Zapytanie nie zwróciło żadnych danych.");
      }
    } catch (err) {
      setKqlError(err.message);
    } finally {
      setKqlLoading(false);
    }
  };

  // ZMIANA: Dodano brakującą funkcję
  const renderKqlTable = () => {
    if (kqlResults.length === 0) {
      return null;
    }
    const headers = Object.keys(kqlResults[0]);
    return (
      <table style={logTableStyle}>
        <thead>
          <tr>
            {headers.map(key => <th key={key} style={logThStyle}>{key}</th>)}
          </tr>
        </thead>
        <tbody>
          {kqlResults.map((row, idx) => (
            <tr key={idx}>
              {headers.map(header => <td key={`${idx}-${header}`} style={logTdStyle}>{String(row[header])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  // ZMIANA: Dodano brakującą funkcję
  const renderChart = (metric) => (
    <div key={metric.name} style={{ marginBottom: "40px" }}>
      <h3>{metric.name} ({metric.unit})</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={metric.data}>
          <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="timestamp" /><YAxis />
          <Tooltip /><Legend />
          <Line type="monotone" dataKey="average" stroke="#0078D4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  const selectedMetricData = containerInfo?.metrics?.find((m) => m.name === selectedMetric);

  return (
    <div style={{ padding: "20px", maxWidth: "980px", margin: "0 auto" }}>
      <button onClick={() => navigate("/containers")} style={btnStyle}>
        ← Powrót do kontenerów
      </button>

      <h1>Monitoring Kontenera ACI: {containerId}</h1>
      <ul style={{ fontSize: "16px", lineHeight: "1.6", listStyle: 'none', paddingLeft: 0 }}>
        <li><strong>Subscription ID:</strong> {containerInfo?.subscriptionId || "—"}</li>
        <li><strong>Resource Group:</strong> {containerInfo?.resourceGroup || "—"}</li>
        <li><strong>Resource ID:</strong> {containerInfo?.resourceId || "—"}</li>
        <li><strong>Lokalizacja:</strong> {containerInfo?.location || "—"}</li>
      </ul>

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button onClick={() => setActiveTab("azureMonitor")} style={{...tabButtonStyle, ...(activeTab === 'azureMonitor' ? activeTabStyle : inactiveTabStyle)}}>
          📊 Azure Monitor Metrics
        </button>
        <button onClick={() => setActiveTab("logAnalytics")} style={{...tabButtonStyle, ...(activeTab === 'logAnalytics' ? activeTabStyle : inactiveTabStyle)}}>
          📁 Log Analytics + KQL
        </button>
        <button
          onClick={() => setActiveTab("alerts")}
          style={{...tabButtonStyle, ...(activeTab === 'alerts' ? activeTabStyle : inactiveTabStyle)}}
        >
          🚨 Alerty
        </button>
      </div>

      {loading ? ( <p>⏳ Ładowanie danych...</p> )
       : containerInfo?.error ? ( <p style={{ color: "red" }}>❌ {containerInfo.error}</p> )
       : (
        <>
          {activeTab === "azureMonitor" && (
            <>
              {containerInfo.metrics?.length > 0 ? (
                <>
                  <div style={{ marginBottom: "20px", display: "flex", flexWrap: "wrap", gap: "10px" }}>
                    {containerInfo.metrics.map((metric) => (
                      <button key={metric.name} onClick={() => setSelectedMetric(metric.name)}
                        style={{...metricButtonStyle, ...(selectedMetric === metric.name ? activeMetricStyle : inactiveMetricStyle)}}>
                        {metric.name}
                      </button>
                    ))}
                  </div>
                  {selectedMetricData ? renderChart(selectedMetricData) : <p>Brak danych dla wybranej metryki.</p>}
                </>
              ) : ( <p>Brak dostępnych metryk dla tego kontenera.</p> )}
            </>
          )}

          {activeTab === "logAnalytics" && (
            <div style={{ marginTop: "10px" }}>
              <h3>📁 Log Analytics + KQL</h3>
              
              <div style={{ margin: "12px 0", padding: "10px", border: "1px solid #eee", borderRadius: "4px" }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '5px' }}>Powiązany Log Analytics Workspace:</label>
                {wsLoading ? ( <span>⏳ Sprawdzanie...</span> )
                 : wsError ? ( <span style={{ color: "red" }}>❌ {wsError}</span> )
                 : linkedWorkspace ? (
                   <span>
                     <strong>{linkedWorkspace.name}</strong> ({linkedWorkspace.location})
                   </span>
                 ) : (
                   <span style={{ color: "#777" }}>
                     Kontener nie jest skonfigurowany do wysyłania logów do Log Analytics.
                   </span>
                 )}
              </div>

              {/* Pokaż opcję "Nowy workspace" tylko jeśli jest błąd lub lista jest pusta */}
              {(wsError || workspaces.length === 0) && !linkedWorkspace && (
                <button onClick={() => setShowCreateWs((s) => !s)} style={{...createWsButtonStyle, marginLeft: 0}}>
                  {showCreateWs ? "✖ Anuluj" : "➕ Nowy workspace"}
                </button>
              )}

              {showCreateWs && <form onSubmit={createWorkspace} style={createWsFormStyle}>
                 <div style={createWsGridStyle}>
                   <div><label style={createWsLabelStyle}>Subscription ID</label><input value={createWsForm.subscriptionId} onChange={(e) => setCreateWsForm(f => ({...f, subscriptionId: e.target.value}))} required style={createWsInputStyle} /></div>
                   <div><label style={createWsLabelStyle}>Resource Group</label><input value={createWsForm.rgName} onChange={(e) => setCreateWsForm(f => ({...f, rgName: e.target.value}))} required style={createWsInputStyle} /></div>
                   <div><label style={createWsLabelStyle}>Workspace Name</label><input value={createWsForm.workspaceName} onChange={(e) => setCreateWsForm(f => ({...f, workspaceName: e.target.value}))} required style={createWsInputStyle} /></div>
                   <div><label style={createWsLabelStyle}>Location</label><input value={createWsForm.location} onChange={(e) => setCreateWsForm(f => ({...f, location: e.target.value}))} style={createWsInputStyle} /></div>
                   <div><label style={createWsLabelStyle}>SKU</label><input value={createWsForm.sku} onChange={(e) => setCreateWsForm(f => ({...f, sku: e.target.value}))} style={createWsInputStyle} /></div>
                   <div><label style={createWsLabelStyle}>Retention (days)</label><input type="number" value={createWsForm.retentionInDays} onChange={(e) => setCreateWsForm(f => ({...f, retentionInDays: Number(e.target.value)}))} style={createWsInputStyle} /></div>
                 </div>
                 <div style={createWsBtnContainerStyle}>
                   <button type="submit" disabled={creatingWs} style={createWsSubmitStyle}>{creatingWs ? "Tworzenie..." : "Utwórz workspace"}</button>
                   <button type="button" onClick={() => setShowCreateWs(false)} style={createWsCancelStyle}>Anuluj</button>
                 </div>
               </form>}

              {linkedWorkspace && (
                <>
                  <div style={{ marginTop: "30px" }}>
                    <h4>📄 Eksportuj logi z workspace</h4>
                    <div style={logQueryStyle}>
                      <button onClick={() => handleExportLogs('logs')} style={exportButtonStyle}>
                        Pobierz Logi (CSV)
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: "30px" }}>
                    <h4>✍️ Niestandardowe zapytanie KQL</h4>
                    <p style={{fontSize: '14px', color: '#666', margin: '5px 0'}}>
                      Przykładowe zapytanie: `ContainerInstanceLog_CL | where ContainerGroup_s == '{containerId}' | take 100`
                    </p>
                    <textarea
                      value={kqlQuery}
                      onChange={(e) => setKqlQuery(e.target.value)}
                      style={{...createWsInputStyle, width: '100%', height: '100px', fontFamily: 'monospace'}}
                    />
                    <button onClick={handleKqlQuerySubmit} disabled={kqlLoading} style={fetchLogButtonStyle}>
                      {kqlLoading ? 'Wykonywanie...' : '🔍 Wykonaj zapytanie'}
                    </button>

                    {kqlLoading ? ( <p>⏳ Ładowanie wyników...</p> )
                     : kqlError ? ( <p style={{ color: "red", marginTop: '10px' }}>❌ {kqlError}</p> )
                     : kqlResults.length > 0 ? (
                       <div style={{marginTop: '15px', overflowX: 'auto'}}>
                         {renderKqlTable()}
                       </div>
                     ) : (
                       !kqlError && <p style={{color: '#777', marginTop: '10px'}}>Kliknij "Wykonaj zapytanie", aby zobaczyć wyniki.</p>
                     )}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "alerts" && (
            <div style={{ marginTop: "10px" }}>
              <h3>🚨 Alerty dla {containerId}</h3>
              <p>Funkcjonalność alertów dla kontenerów ACI do zaimplementowania.</p>
              <button 
                onClick={() => setShowCreateAlertModal(true)} 
                style={buttonStyle}
                disabled={!containerInfo?.resourceId}
              >
                ➕ Utwórz nową regułę alertu
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const btnStyle = { marginBottom: "20px", padding: "8px 16px", fontSize: "16px", background: "#0078D4", color: "white", border: "none", borderRadius: "6px", cursor: "pointer"};
const tabButtonStyle = { padding: "8px 16px", border: "none", borderRadius: "6px", cursor: "pointer"};
const activeTabStyle = { background: "#0078D4", color: "white" };
const inactiveTabStyle = { background: "#eee", color: "#333"};
const metricButtonStyle = { padding: "6px 12px", border: "none", borderRadius: "4px", cursor: "pointer" };
const activeMetricStyle = { background: "#0078D4", color: "white" };
const inactiveMetricStyle = { background: "#eee", color: "#333" };
const installButtonStyle = { marginLeft: "10px", padding: "6px 12px", background: "#0078D4", color: "white", border: "none", borderRadius: "4px", cursor: "pointer"};
const wsSelectStyle = { padding: "6px", borderRadius: "4px" };
const createWsButtonStyle = { marginLeft: "8px", padding: "6px 10px", background: "#6B46C1", color: "white", border: "none", borderRadius: "6px", cursor: "pointer"};
const logQueryStyle = { display: "flex", gap: "10px", alignItems: "center", marginBottom: "10px", flexWrap: 'wrap'};
const exportButtonStyle = { padding: "6px 12px", background: "#38A169", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", marginLeft: "5px"};
const fetchLogButtonStyle = { padding: "6px 12px", background: "#0078D4", color: "white", border: "none", borderRadius: "4px", cursor: "pointer"};
const logTableStyle = { borderCollapse: "collapse", width: "100%", marginTop: '10px' };
const logThStyle = { border: "1px solid #ccc", padding: "6px", background: "#eee", textAlign: 'left'};
const logTdStyle = { border: "1px solid #ccc", padding: "6px", verticalAlign: 'top'};
const createWsInputStyle = { width: "100%", padding: "8px", marginTop: "6px", borderRadius: "4px", boxSizing: 'border-box'};
const buttonStyle = {
  padding: '10px', background: '#0078D4', color: 'white', border: 'none',
  borderRadius: '8px', cursor: 'pointer', marginRight: '10px', marginBottom: '10px'
};
const createDcrButtonStyle = { marginLeft: "12px", padding: "6px 10px", background: "#2D3748", color: "white", border: "none", borderRadius: "6px", cursor: "pointer"};
const refreshDcrButtonStyle = { marginTop: "10px", padding: "6px 12px", background: "#0078D4", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", marginRight: '10px'};
const createWsFormStyle = { marginTop: "12px", padding: "12px", border: "1px solid #eee", borderRadius: "8px"};
const createWsGridStyle = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px"};
const createWsLabelStyle = { fontSize: 13 };
const createWsBtnContainerStyle = { marginTop: "12px", display: "flex", gap: "8px"};
const createWsSubmitStyle = { padding: "8px 12px", background: "#0078D4", color: "white", border: "none", borderRadius: "6px", cursor: "pointer"};
const createWsCancelStyle = { padding: "8px 12px", background: "#E2E8F0", color: "#111", border: "none", borderRadius: "6px", cursor: "pointer"};

export default ContainerMonitor;