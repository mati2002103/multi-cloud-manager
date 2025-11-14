import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import CreateGcpAlertModal from "../components/CreateGCPContainerAlertModal"; 

const ContainerGCPMonitor = () => {
  const { containerName } = useParams();
  const navigate = useNavigate();

  const [containerInfo, setContainerInfo] = useState(null); 
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("cloudMonitoring");

  const [metricsList, setMetricsList] = useState([]);
  const [metricsListLoading, setMetricsListLoading] = useState(false);
  const [metricsListError, setMetricsListError] = useState(null);
  
  const [selectedMetric, setSelectedMetric] = useState("");
  const [metricData, setMetricData] = useState([]);
  const [metricDataLoading, setMetricDataLoading] = useState(false);
  const [metricDataError, setMetricDataError] = useState(null);

  const [lqlQuery, setLqlQuery] = useState("");
  const [lqlResults, setLqlResults] = useState([]);
  const [lqlLoading, setLqlLoading] = useState(false);
  const [lqlError, setLqlError] = useState(null);

  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState(null);
  const [showCreateAlertModal, setShowCreateAlertModal] = useState(false);

  const fetchContainerDetailsByName = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/gcp/container/by-name/${containerName}/details`, { credentials: "include" });
      if (!res.ok) {
         const errData = await res.json();
         throw new Error(errData.error || `Nie znaleziono kontenera o nazwie ${containerName}`);
      }
      const data = await res.json();
      setContainerInfo(data); 
      
      
      setLqlQuery(`resource.type="cloud_run_revision"\nresource.labels.service_name="${containerName}"`);
    } catch (err) {
      console.error("Błąd pobierania danych kontenera:", err);
      setContainerInfo({ error: err.message });
    } finally {
      setLoading(false);
    }
  }, [containerName]);

  const fetchAvailableMetrics = useCallback(async () => {
    if (!containerInfo?.projectId || !containerInfo?.region) return; 
    
    setMetricsListLoading(true);
    setMetricsListError(null);
    try {
      const res = await fetch(`/api/gcp/container/${containerInfo.projectId}/${containerInfo.region}/${containerName}/available-metrics`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd pobierania listy metryk");
      setMetricsList(data.metrics || []);
      if (data.metrics?.length > 0) {
        setSelectedMetric(data.metrics[0].type);
      }
    } catch (err) {
      setMetricsListError(err.message);
    } finally {
      setMetricsListLoading(false);
    }
  }, [containerInfo, containerName]);
  
  const fetchMetricData = useCallback(async (metricType) => {
    if (!metricType || !containerInfo?.projectId || !containerInfo?.region) return;
    
    setMetricDataLoading(true);
    setMetricDataError(null);
    setMetricData([]);
    try {
      const res = await fetch(`/api/gcp/container/${containerInfo.projectId}/${containerInfo.region}/${containerName}/metrics`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            metricType: metricType, 
            timespanMinutes: 60 
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd pobierania danych metryki");
      setMetricData(data.data || []); 
    } catch (err) {
      setMetricDataError(err.message);
    } finally {
      setMetricDataLoading(false);
    }
  }, [containerInfo, containerName]);

  useEffect(() => {
    fetchContainerDetailsByName();
  }, [fetchContainerDetailsByName]);

  useEffect(() => {
    if (containerInfo?.projectId && containerInfo?.region) {
      fetchAvailableMetrics();
    }
  }, [containerInfo, fetchAvailableMetrics]);

  useEffect(() => {
    if (selectedMetric && containerInfo?.projectId) {
      fetchMetricData(selectedMetric);
    }
  }, [selectedMetric, fetchMetricData, containerInfo?.projectId]);

  const handleLqlQuerySubmit = async () => {
    if (!containerInfo?.projectId) {
      setLqlError("Nie udało się zidentyfikować projektu.");
      return;
    }
    setLqlLoading(true);
    setLqlError(null);
    setLqlResults([]);
    try {
      const res = await fetch(`/api/gcp/container/${containerInfo.projectId}/${containerName}/logs/query`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lqlQuery: lqlQuery }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd zapytania LQL");
      
      if (data.rows && data.rows.length > 0) {
        const headers = data.columns;
        const formattedResults = data.rows.map(row => {
            let obj = {};
            headers.forEach((header, index) => {
                obj[header] = row[index];
            });
            return obj;
        });
        setLqlResults(formattedResults);
      } else {
        setLqlError("Zapytanie nie zwróciło żadnych danych.");
      }
    } catch (err) {
      setLqlError(err.message);
    } finally {
      setLqlLoading(false);
    }
  };
  
  const fetchAlerts = useCallback(async () => {
    if (!containerInfo?.projectId) return;
    setAlertsLoading(true);
    setAlertsError(null);
    try {
      const res = await fetch(`/api/gcp/container/${containerInfo.projectId}/${containerName}/alerts`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd pobierania alertów");
      setAlerts(data.value || []);
    } catch (err) {
      setAlertsError(err.message);
    } finally {
      setAlertsLoading(false);
    }
  }, [containerInfo, containerName]);

  useEffect(() => {
    if (activeTab === 'alerts' && containerInfo?.projectId) {
      fetchAlerts();
    }
  }, [activeTab, fetchAlerts, containerInfo?.projectId]);

  const handleDeleteAlert = async (alertName) => {
    if (!containerInfo?.projectId) return;
    if (!window.confirm(`Czy na pewno chcesz usunąć alert '${alertName}'?`)) return;
    
    setAlertsLoading(true);
    setAlertsError(null);
    try {
      const res = await fetch(`/api/gcp/container/${containerInfo.projectId}/alerts/${alertName}`, {
        method: "DELETE",
        credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd usuwania alertu");
      alert(data.message || "Alert usunięty");
      fetchAlerts(); 
    } catch (err) {
      setAlertsError(err.message);
      alert("❌ " + err.message);
    } finally {
      setAlertsLoading(false);
    }
  };

  const renderChart = () => (
    <div style={{ marginBottom: "40px" }}>
      <h3>{selectedMetric}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={metricData}>
          <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="timestamp" /><YAxis />
          <Tooltip /><Legend />
          <Line type="monotone" dataKey="average" name="Średnia" stroke="#34A853" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
  
  const renderLqlTable = () => {
    if (lqlResults.length === 0) {
      return null;
    }
    const headers = Object.keys(lqlResults[0]);
    return (
      <table style={logTableStyle}>
        <thead>
          <tr>
            {headers.map(key => <th key={key} style={logThStyle}>{key}</th>)}
          </tr>
        </thead>
        <tbody>
          {lqlResults.map((row, idx) => (
            <tr key={idx}>
              {headers.map(header => <td key={`${idx}-${header}`} style={logTdStyle}>{String(row[header])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div style={{ padding: "20px", maxWidth: "980px", margin: "0 auto" }}>
      <button onClick={() => navigate("/containers")} style={btnStyle}>
        ← Powrót
      </button>

      <h1>Monitoring Kontenera (GCP): {containerName}</h1>

      {loading ? ( <p>⏳ Wyszukiwanie i ładowanie danych kontenera: {containerName}...</p> )
       : containerInfo?.error ? ( <p style={{ color: "red" }}>❌ Błąd krytyczny: {containerInfo.error}</p> )
       : (
        <>
          <ul style={{ fontSize: "16px", lineHeight: "1.6", listStyle: 'none', paddingLeft: 0 }}>
            <li><strong>Project ID:</strong> {containerInfo?.projectId || "—"}</li>
            <li><strong>Region:</strong> {containerInfo?.region || "—"}</li>
            <li><strong>Nazwa Usługi:</strong> {containerName || "—"}</li>
            <li><strong>Resource ID:</strong> {containerInfo?.resourceName || "—"}</li>
          </ul>

          <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
            <button onClick={() => setActiveTab("cloudMonitoring")} style={{...tabButtonStyle, ...(activeTab === 'cloudMonitoring' ? activeTabStyle : inactiveTabStyle)}}>
              📊 Cloud Monitoring
            </button>
            <button onClick={() => setActiveTab("cloudLogging")} style={{...tabButtonStyle, ...(activeTab === 'cloudLogging' ? activeTabStyle : inactiveTabStyle)}}>
              📁 Cloud Logging
            </button>
            <button onClick={() => setActiveTab("alerts")} style={{...tabButtonStyle, ...(activeTab === 'alerts' ? activeTabStyle : inactiveTabStyle)}}>
              🚨 Alerty
            </button>
          </div>

          {activeTab === "cloudMonitoring" && (
            <>
              {metricsListLoading ? ( <p>⏳ Ładowanie listy metryk...</p> )
               : metricsListError ? ( <p style={{ color: "red" }}>❌ {metricsListError}</p> )
               : metricsList.length > 0 ? (
                <>
                  <div style={{ marginBottom: "20px" }}>
                    <label style={{ fontWeight: 600, marginRight: '10px' }}>Wybierz metrykę:</label>
                    <select value={selectedMetric} onChange={(e) => setSelectedMetric(e.target.value)} style={wsSelectStyle}>
                      {metricsList.map((metric) => (
                        <option key={metric.type} value={metric.type}>
                          {metric.displayName || metric.type} ({metric.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  {metricDataLoading ? ( <p>⏳ Ładowanie danych metryki...</p> )
                   : metricDataError ? ( <p style={{ color: "red" }}>❌ {metricDataError}</p> )
                   : metricData.length > 0 ? (
                     renderChart()
                   ) : ( <p>Brak danych dla wybranej metryki w ostatniej godzinie.</p> )
                  }
                </>
               ) : ( <p>Brak dostępnych metryk dla tego kontenera.</p> )
              }
            </>
          )}
          
          {activeTab === "cloudLogging" && (
            <div style={{ marginTop: "10px" }}>
              <h3>📁 Cloud Logging (LQL)</h3>
              <p style={{fontSize: '14px', color: '#666', margin: '5px 0'}}>
                Wykonaj własne zapytanie LQL w ramach projektu {containerInfo.projectId}.
              </p>
              <textarea
                value={lqlQuery}
                onChange={(e) => setLqlQuery(e.target.value)}
                style={{...createWsInputStyle, width: '100%', height: '100px', fontFamily: 'monospace'}}
                placeholder={`resource.type="cloud_run_revision"...`}
              />
              <button onClick={handleLqlQuerySubmit} disabled={lqlLoading || !containerInfo.projectId} style={fetchLogButtonStyle}>
                {lqlLoading ? 'Wykonywanie...' : '🔍 Wykonaj zapytanie LQL'}
              </button>

              {lqlLoading ? ( <p>⏳ Ładowanie wyników...</p> )
                 : lqlError ? ( <p style={{ color: "red", marginTop: '10px' }}>❌ {lqlError}</p> )
                 : lqlResults.length > 0 ? (
                   <div style={{marginTop: '15px', overflowX: 'auto'}}>
                     {renderLqlTable()}
                   </div>
                 ) : (
                   !lqlError && <p style={{color: '#777', marginTop: '10px'}}>Kliknij "Wykonaj zapytanie", aby zobaczyć wyniki.</p>
                 )}
            </div>
          )}

          {activeTab === "alerts" && (
            <div style={{ marginTop: "10px" }}>
              <h3>🚨 Alerty dla {containerName}</h3>
              <button 
                onClick={() => setShowCreateAlertModal(true)} 
                style={buttonStyle}
              >
                ➕ Utwórz nową regułę alertu
              </button>
              
               <CreateGcpAlertModal
                isOpen={showCreateAlertModal}
                onClose={() => setShowCreateAlertModal(false)}
                onCreated={fetchAlerts}
                containerInfo={containerInfo} 
              /> 
              
              <div style={{ marginTop: "20px" }}>
                <h4>Istniejące reguły alertów dla tego kontenera</h4>
                <button onClick={fetchAlerts} style={refreshDcrButtonStyle} disabled={alertsLoading}>
                  {alertsLoading ? 'Odświeżanie...' : '🔄 Odśwież listę alertów'}
                </button>
                {alertsLoading ? ( <p>⏳ Ładowanie alertów...</p> )
                 : alertsError ? ( <p style={{ color: "red" }}>❌ {alertsError}</p> )
                 : alerts.length === 0 ? ( <p>Brak alertów skonfigurowanych dla tego kontenera.</p> )
                 : (
                  <table style={logTableStyle}>
                    <thead>
                      <tr>
                        <th style={logThStyle}>Nazwa Alertu</th>
                        <th style={logThStyle}>Opis</th>
                        <th style={logThStyle}>Włączony</th>
                        <th style={logThStyle}>Akcje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.map((alert) => (
                        <tr key={alert.name}>
                          <td style={logTdStyle}>{alert.displayName}</td>
                          <td style={logTdStyle}>{alert.description}</td>
                          <td style={logTdStyle}>{alert.enabled ? '✅ Tak' : '❌ Nie'}</td>
                          <td style={logTdStyle}>
                            <button
                              onClick={() => handleDeleteAlert(alert.name)}
                              style={{...exportButtonStyle, background: '#DB4437'}}
                            >
                              🗑️ Usuń
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                 )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const btnStyle = { marginBottom: "20px", padding: "8px 16px", fontSize: "16px", background: "#4285F4", color: "white", border: "none", borderRadius: "6px", cursor: "pointer"};
const tabButtonStyle = { padding: "8px 16px", border: "none", borderRadius: "6px", cursor: "pointer"};
const activeTabStyle = { background: "#4285F4", color: "white" };
const inactiveTabStyle = { background: "#eee", color: "#333"};
const metricButtonStyle = { padding: "6px 12px", border: "none", borderRadius: "4px", cursor: "pointer" };
const activeMetricStyle = { background: "#4285F4", color: "white" };
const inactiveMetricStyle = { background: "#eee", color: "#333" };
const installButtonStyle = { marginLeft: "10px", padding: "6px 12px", background: "#4285F4", color: "white", border: "none", borderRadius: "4px", cursor: "pointer"};
const wsSelectStyle = { padding: "6px", borderRadius: "4px" };
const refreshDcrButtonStyle = { marginTop: "10px", padding: "6px 12px", background: "#4285F4", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", marginRight: '10px'};
const exportButtonStyle = { padding: "6px 12px", background: "#34A853", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", marginLeft: "5px"};
const fetchLogButtonStyle = { padding: "6px 12px", background: "#4285F4", color: "white", border: "none", borderRadius: "4px", cursor: "pointer"};
const logTableStyle = { borderCollapse: "collapse", width: "100%", marginTop: '10px' };
const logThStyle = { border: "1px solid #ccc", padding: "6px", background: "#eee", textAlign: 'left'};
const logTdStyle = { border: "1px solid #ccc", padding: "6px", verticalAlign: 'top'};
const createWsInputStyle = { width: "100%", padding: "8px", marginTop: "6px", borderRadius: "4px", boxSizing: 'border-box'};
const buttonStyle = {
  padding: '10px', background: '#4285F4', color: 'white', border: 'none',
  borderRadius: '8px', cursor: 'pointer', marginRight: '10px', marginBottom: '10px'
};

const createWsButtonStyle = { marginLeft: "8px", padding: "6px 10px", background: "#34A853", color: "white", border: "none", borderRadius: "6px", cursor: "pointer"};
const createWsFormStyle = { marginTop: "12px", padding: "12px", border: "1px solid #eee", borderRadius: "8px"};
const createWsGridStyle = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px"};
const createWsLabelStyle = { fontSize: 13 };
const createWsBtnContainerStyle = { marginTop: "12px", display: "flex", gap: "8px"};
const createWsSubmitStyle = { padding: "8px 12px", background: "#4285F4", color: "white", border: "none", borderRadius: "6px", cursor: "pointer"};
const createWsCancelStyle = { padding: "8px 12px", background: "#E2E8F0", color: "#111", border: "none", borderRadius: "6px", cursor: "pointer"};

export default ContainerGCPMonitor;