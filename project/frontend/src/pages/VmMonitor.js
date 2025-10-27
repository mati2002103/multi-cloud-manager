import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import CreateDCRAssociationModal from "../components/CreateDCRAssociationModal";

const VMMonitor = () => {
  const { vmId } = useParams();
  const navigate = useNavigate();

  const [vmInfo, setVmInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [activeTab, setActiveTab] = useState("azureMonitor");
  const [agentStatus, setAgentStatus] = useState("⏳");

  const [dcrList, setDcrList] = useState([]);
  const [dcrLoading, setDcrLoading] = useState(false);
  const [dcrError, setDcrError] = useState(null);

  const [workspaces, setWorkspaces] = useState([]);
  const [wsLoading, setWsLoading] = useState(false);
  const [wsError, setWsError] = useState(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(""); // ZMIANA: Będzie przechowywać GUID
  const [showCreateWs, setShowCreateWs] = useState(false);
  const [creatingWs, setCreatingWs] = useState(false);
  const [createWsForm, setCreateWsForm] = useState({
    subscriptionId: "", rgName: "", workspaceName: "",
    location: "westeurope", sku: "PerGB2018", retentionInDays: 30,
  });
  const [showCreateDCRModal, setShowCreateDCRModal] = useState(false);
  const [dcrCreating, setDcrCreating] = useState(false);
  const [dcrMessage, setDcrMessage] = useState(null);

  const fetchDcrList = async (currentWorkspaceId) => {
    // ZMIANA: currentWorkspaceId to teraz GUID. Musimy znaleźć pełne ID zasobu.
    const currentWorkspace = workspaces.find(ws => ws.workspaceGuid === currentWorkspaceId);
    if (!vmId || !currentWorkspace) {
        setDcrList([]);
        return;
    }
    
    setDcrLoading(true);
    setDcrError(null);
    try {
      const res = await fetch(
        `/api/${vmId}/dcr_list?workspaceId=${encodeURIComponent(currentWorkspace.id)}`, // Wysyłamy pełne ID
        { credentials: "include" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd pobierania skojarzonych DCR");
      setDcrList(data.value || []);
    } catch (err) {
      setDcrError(err.message);
      setDcrList([]);
    } finally {
      setDcrLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetch(`/api/vm/${vmId}/metrics`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setVmInfo(data);
        if (data.metrics?.length > 0) setSelectedMetric(data.metrics[0].name);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Błąd pobierania danych VM:", err);
        setVmInfo({ error: err.message });
        setLoading(false);
      });
  }, [vmId]);

  useEffect(() => {
    fetch(`/api/vm/${vmId}/agent-status`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.hasAMA_Linux || data.hasAMA_Windows) setAgentStatus("✅ AMA");
        else if (data.hasMMA) setAgentStatus("⚠️ MMA");
        else setAgentStatus("❌ Brak");
      })
      .catch(() => setAgentStatus("⏳"));
  }, [vmId]);

  useEffect(() => {
    if (vmInfo?.subscriptionId) {
      fetchWorkspaces(vmInfo.subscriptionId);
       if (vmInfo?.resourceGroup) {
         setCreateWsForm((f) => ({ ...f, subscriptionId: vmInfo.subscriptionId, rgName: vmInfo.resourceGroup }));
       }
    }
  }, [vmInfo?.subscriptionId, vmInfo?.resourceGroup]);

  useEffect(() => {
    if (vmId && selectedWorkspaceId) {
      fetchDcrList(selectedWorkspaceId);
    } else {
      setDcrList([]);
    }
  }, [vmId, selectedWorkspaceId, workspaces]); // Dodano workspaces

  const fetchWorkspaces = async (subscriptionId) => {
    setWsLoading(true);
    setWsError(null);
    try {
      const res = await fetch(
        `/api/log_analytics?subscriptionId=${subscriptionId}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd pobierania workspace'ów");
      const fetchedWorkspaces = data.value || [];
      setWorkspaces(fetchedWorkspaces);
      if (!selectedWorkspaceId && fetchedWorkspaces.length > 0) {
        setSelectedWorkspaceId(fetchedWorkspaces[0].workspaceGuid); // ZMIANA: Użyj GUID
      } else if (fetchedWorkspaces.length === 0) {
        setSelectedWorkspaceId("");
      }
    } catch (err) {
      console.error("fetchWorkspaces:", err);
      setWsError(err.message);
    } finally {
      setWsLoading(false);
    }
  };

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
      await fetchWorkspaces(createWsForm.subscriptionId);
      if (data.workspace?.workspaceGuid) { // ZMIANA: Użyj GUID
        setSelectedWorkspaceId(data.workspace.workspaceGuid);
      }
      setShowCreateWs(false);
      alert(data.message || "Workspace utworzony");
    } catch (err) {
      alert("❌ " + err.message);
    } finally {
      setCreatingWs(false);
    }
  };

  const installAMA = async () => {
    if (!window.confirm(`Zainstalować AMA na VM "${vmId}"?`)) return;
    try {
      const res = await fetch(`/api/vm/${vmId}/ensure-ama`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd instalacji AMA");
      alert(data.message); setAgentStatus("✅ AMA");
    } catch (err) {
      alert("❌ " + err.message);
    }
  };

const handleExportLogs = (type) => {
    const currentWorkspace = workspaces.find(ws => ws.workspaceGuid === selectedWorkspaceId);
    if (!currentWorkspace) {
      alert("Nie można znaleźć GUID dla wybranego Workspace. Odśwież listę workspace'ów.");
      return;
    }
    if (!vmId){
      alert("Brakuje ID maszyny wirtualnej.");
      return;
    }

    const backendUrl = "http://localhost:5000";
    
    const downloadUrl = `${backendUrl}/api/vm/${vmId}/logs/export?type=${type}&workspaceGuid=${encodeURIComponent(currentWorkspace.workspaceGuid)}`;
    
    console.log("Attempting to download from ABSOLUTE URL:", downloadUrl);

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', `${vmId}_${type}_logs.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
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

  const selectedMetricData = vmInfo?.metrics?.find((m) => m.name === selectedMetric);

  return (
    <div style={{ padding: "20px", maxWidth: "980px", margin: "0 auto" }}>
      <button onClick={() => navigate("/virtual-machines")} style={btnStyle}>
        ← Powrót
      </button>

      <h1>Monitoring VM: {vmId}</h1>
      <ul style={{ fontSize: "16px", lineHeight: "1.6", listStyle: 'none', paddingLeft: 0 }}>
        <li><strong>Subscription ID:</strong> {vmInfo?.subscriptionId || "—"}</li>
        <li><strong>Resource Group:</strong> {vmInfo?.resourceGroup || "—"}</li>
        <li><strong>Resource ID:</strong> {vmInfo?.resourceId || "—"}</li>
        <li><strong>Lokalizacja:</strong> {vmInfo?.location || "—"}</li>
        <li>
          <strong>Status agenta:</strong> {agentStatus}
          {agentStatus === "❌ Brak" && <button onClick={installAMA} style={installButtonStyle}>🔧 Zainstaluj AMA</button>}
        </li>
      </ul>

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button onClick={() => setActiveTab("azureMonitor")} style={{...tabButtonStyle, ...(activeTab === 'azureMonitor' ? activeTabStyle : inactiveTabStyle)}}>
          📊 Azure Monitor Metrics
        </button>
        <button onClick={() => setActiveTab("logAnalytics")} style={{...tabButtonStyle, ...(activeTab === 'logAnalytics' ? activeTabStyle : inactiveTabStyle)}}>
          📁 Log Analytics + KQL
        </button>
      </div>

      {loading ? ( <p>⏳ Ładowanie danych...</p> )
       : vmInfo?.error ? ( <p style={{ color: "red" }}>❌ {vmInfo.error}</p> )
       : (
        <>
          {activeTab === "azureMonitor" && (
            <>
              {vmInfo.metrics?.length > 0 ? (
                <>
                  <div style={{ marginBottom: "20px", display: "flex", flexWrap: "wrap", gap: "10px" }}>
                    {vmInfo.metrics.map((metric) => (
                      <button key={metric.name} onClick={() => setSelectedMetric(metric.name)}
                        style={{...metricButtonStyle, ...(selectedMetric === metric.name ? activeMetricStyle : inactiveMetricStyle)}}>
                        {metric.name}
                      </button>
                    ))}
                  </div>
                  {selectedMetricData ? renderChart(selectedMetricData) : <p>Brak danych dla wybranej metryki.</p>}
                </>
              ) : ( <p>Brak dostępnych metryk.</p> )}
            </>
          )}

          {activeTab === "logAnalytics" && (
            <div style={{ marginTop: "10px" }}>
              <h3>📁 Log Analytics + KQL</h3>
              <div style={{ margin: "12px 0", display: "flex", gap: "8px", alignItems: "center", flexWrap: 'wrap' }}>
                <label style={{ fontWeight: 600 }}>Workspace:</label>
                {wsLoading ? ( <span>⏳ Ładowanie...</span> )
                 : wsError ? ( <span style={{ color: "red" }}>❌ {wsError}</span> )
                 : workspaces.length === 0 ? ( <span>Brak workspace'ów</span> )
                 : (
                  <select value={selectedWorkspaceId} onChange={(e) => setSelectedWorkspaceId(e.target.value)} style={wsSelectStyle}>
                    <option value="">-- Wybierz Workspace --</option>
                    {workspaces.map((ws) => ( <option key={ws.id} value={ws.workspaceGuid}>{ws.name} — {ws.location} ({ws.resourceGroup})</option> ))}
                  </select>
                 )}
                <button onClick={() => setShowCreateWs((s) => !s)} style={createWsButtonStyle}>
                  {showCreateWs ? "✖ Anuluj" : "➕ Nowy workspace"}
                </button>
              </div>

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

              <div style={{ marginTop: "18px" }}>
                <h4>🔗 Reguły DCR dla tej VM wysyłające do: {workspaces.find(ws => ws.workspaceGuid === selectedWorkspaceId)?.name || 'N/A'}</h4>
                 <button onClick={() => fetchDcrList(selectedWorkspaceId)} style={refreshDcrButtonStyle} disabled={!selectedWorkspaceId || dcrLoading}>
                  🔄 Odśwież listę DCR
                </button>
                 <button onClick={() => setShowCreateDCRModal(true)} disabled={!selectedWorkspaceId || !vmInfo?.resourceId || !vmInfo?.location} style={createDcrButtonStyle}>
                  ➕ Utwórz i przypisz DCR do tej VM
                </button>
                <CreateDCRAssociationModal
                  isOpen={showCreateDCRModal}
                  onClose={() => setShowCreateDCRModal(false)}
                  onCreated={() => fetchDcrList(selectedWorkspaceId)}
                  vmInfo={{ vmName: vmId, subscriptionId: vmInfo?.subscriptionId, resourceGroup: vmInfo?.resourceGroup,
                    resourceId: vmInfo?.resourceId, location: vmInfo?.location }}
                />
                {dcrMessage && <p style={{ color: dcrError ? "red" : "#2D3748", marginTop: '5px' }}>{dcrMessage}</p>}

                {dcrLoading ? ( <p>⏳ Ładowanie DCR...</p> )
                 : dcrError ? ( <p style={{ color: "red" }}>❌ {dcrError}</p> )
                 : !selectedWorkspaceId ? (<p style={{color: '#777'}}>Wybierz Workspace, aby zobaczyć powiązane DCR.</p>)
                 : dcrList.length === 0 ? ( <p>Brak DCR skojarzonych z tą VM dla wybranego Workspace.</p> )
                 : (
                  <ul style={{ paddingLeft: "20px", marginTop: '10px' }}>
                    {dcrList.map((assoc) => (
                      <li key={assoc.associationName}>
                        <strong>{assoc.dcrName}</strong>
                        {assoc.description && <span style={{ color: "#666" }}> ({assoc.description})</span>}
                        <small style={{display:'block', color: '#888'}}>ID reguły: {assoc.dcrId}</small>
                      </li>
                    ))}
                  </ul>
                 )}
              </div>

              <div style={{ marginTop: "30px" }}>
                <h4>📄 Eksportuj logi z workspace: {workspaces.find(ws => ws.workspaceGuid === selectedWorkspaceId)?.name || 'N/A'}</h4>
                <div style={logQueryStyle}>
                  <label>Wybierz typ logów do eksportu:</label>
                  <button onClick={() => handleExportLogs('perf')} disabled={!selectedWorkspaceId} style={exportButtonStyle}>
                    Pobierz Perf (CSV)
                  </button>
                  <button onClick={() => handleExportLogs('heartbeat')} disabled={!selectedWorkspaceId} style={exportButtonStyle}>
                    Pobierz Heartbeat (CSV)
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Styles
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
const createDcrButtonStyle = { marginLeft: "12px", padding: "6px 10px", background: "#2D3748", color: "white", border: "none", borderRadius: "6px", cursor: "pointer"};
const refreshDcrButtonStyle = { marginTop: "10px", padding: "6px 12px", background: "#0078D4", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", marginRight: '10px'};
const logQueryStyle = { display: "flex", gap: "10px", alignItems: "center", marginBottom: "10px", flexWrap: 'wrap'};
const exportButtonStyle = { padding: "6px 12px", background: "#38A169", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", marginLeft: "5px"};
const logTableStyle = { borderCollapse: "collapse", width: "100%", marginTop: '10px' };
const logThStyle = { border: "1px solid #ccc", padding: "6px", background: "#eee"};
const logTdStyle = { border: "1px solid #ccc", padding: "6px"};
const createWsFormStyle = { marginTop: "12px", padding: "12px", border: "1px solid #eee", borderRadius: "8px"};
const createWsGridStyle = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px"};
const createWsInputStyle = { width: "100%", padding: "8px", marginTop: "6px", borderRadius: "4px"};
const createWsLabelStyle = { fontSize: 13 };
const createWsBtnContainerStyle = { marginTop: "12px", display: "flex", gap: "8px"};
const createWsSubmitStyle = { padding: "8px 12px", background: "#0078D4", color: "white", border: "none", borderRadius: "6px", cursor: "pointer"};
const createWsCancelStyle = { padding: "8px 12px", background: "#E2E8F0", color: "#111", border: "none", borderRadius: "6px", cursor: "pointer"};

export default VMMonitor;