import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import CreateEC2AlertModal from "../components/CreateEC2AlertModal";

const VMEC2Monitor = () => {
  const { instanceId } = useParams();
  const navigate = useNavigate();

  const [vmInfo, setVmInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("cloudWatchMetrics");

  const [metricsList, setMetricsList] = useState([]);
  const [metricsListLoading, setMetricsListLoading] = useState(false);
  const [metricsListError, setMetricsListError] = useState(null);
  const [selectedMetric, setSelectedMetric] = useState("");
  const [metricData, setMetricData] = useState([]);
  const [metricDataLoading, setMetricDataLoading] = useState(false);
  const [metricDataError, setMetricDataError] = useState(null);

  const [logGroups, setLogGroups] = useState([]);
  const [logGroupsLoading, setLogGroupsLoading] = useState(false);
  const [selectedLogGroup, setSelectedLogGroup] = useState("");
  const [logFilterPattern, setLogFilterPattern] = useState("");
  const [logResults, setLogResults] = useState([]);
  const [logResultsColumns, setLogResultsColumns] = useState([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState(null);
  const [logQueried, setLogQueried] = useState(false);
  const [agentStatus, setAgentStatus] = useState("⏳ sprawdzanie");
  const [agentDetails, setAgentDetails] = useState("");
  const [ssmConnected, setSsmConnected] = useState(null);
  const [installingAgent, setInstallingAgent] = useState(false);
  const [attachingSsmProfile, setAttachingSsmProfile] = useState(false);

  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState(null);
  const [showCreateAlertModal, setShowCreateAlertModal] = useState(false);

  const fetchVmDetails = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/aws/ec2/${instanceId}/details`, { credentials: "include" });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `Nie znaleziono instancji ${instanceId}`);
      }
      const data = await res.json();
      setVmInfo(data);
    } catch (err) {
      console.error("Błąd pobierania danych EC2:", err);
      setVmInfo({ error: err.message });
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  const fetchAgentStatus = useCallback(async () => {
    const region = vmInfo?.region;
    if (!instanceId || !region) return;
    try {
      const res = await fetch(
        `/api/aws/ec2/${encodeURIComponent(instanceId)}/agent-status?region=${encodeURIComponent(region)}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd pobierania statusu agenta");
      setAgentStatus(data.status || "Nieznany");
      setAgentDetails(data.details || "");
      setSsmConnected(typeof data.ssmConnected === "boolean" ? data.ssmConnected : null);
    } catch (err) {
      setAgentStatus("❌ błąd statusu agenta");
      setAgentDetails(err.message || "");
      setSsmConnected(null);
    }
  }, [instanceId, vmInfo?.region]);

  const fetchAvailableMetrics = useCallback(async () => {
    if (!instanceId) return;
    setMetricsListLoading(true);
    setMetricsListError(null);
    try {
      const res = await fetch(`/api/aws/ec2/${instanceId}/available-metrics`, { credentials: "include" });
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
  }, [instanceId]);

  const fetchMetricData = useCallback(async (metricType) => {
    if (!metricType || !instanceId) return;
    setMetricDataLoading(true);
    setMetricDataError(null);
    setMetricData([]);
    try {
      const res = await fetch(`/api/aws/ec2/${instanceId}/metrics`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metricType, timespanMinutes: 60, region: vmInfo?.region }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd pobierania danych metryki");
      setMetricData(data.data || []);
    } catch (err) {
      setMetricDataError(err.message);
    } finally {
      setMetricDataLoading(false);
    }
  }, [instanceId, vmInfo?.region]);

  const fetchLogGroups = useCallback(async () => {
    setLogGroupsLoading(true);
    try {
      const region = vmInfo?.region || "us-east-1";
      const res = await fetch(
        `/api/aws/logs/log-groups?region=${encodeURIComponent(region)}&instanceId=${encodeURIComponent(instanceId)}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd pobierania log groups");
      setLogGroups(data.value || []);
      if (data.value?.length > 0 && !selectedLogGroup) {
        setSelectedLogGroup(data.value[0].logGroupName);
      }
    } catch (err) {
      setLogError(err.message);
    } finally {
      setLogGroupsLoading(false);
    }
  }, [selectedLogGroup, vmInfo?.region]);

  useEffect(() => {
    fetchVmDetails();
  }, [fetchVmDetails]);

  useEffect(() => {
    if (instanceId) {
      fetchAvailableMetrics();
    }
  }, [instanceId, fetchAvailableMetrics]);

  useEffect(() => {
    fetchAgentStatus();
  }, [fetchAgentStatus]);

  useEffect(() => {
    if (selectedMetric && instanceId) {
      fetchMetricData(selectedMetric);
    }
  }, [selectedMetric, instanceId, fetchMetricData]);

  useEffect(() => {
    if (activeTab === "cloudWatchLogs") {
      fetchLogGroups();
    }
  }, [activeTab, fetchLogGroups]);

  const fetchAlerts = useCallback(async () => {
    if (!instanceId || !vmInfo?.region) return;
    setAlertsLoading(true);
    setAlertsError(null);
    try {
      const region = encodeURIComponent(vmInfo.region);
      const res = await fetch(`/api/aws/ec2/${encodeURIComponent(instanceId)}/alerts?region=${region}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd pobierania alertów");
      setAlerts(data.value || []);
    } catch (err) {
      setAlertsError(err.message);
    } finally {
      setAlertsLoading(false);
    }
  }, [instanceId, vmInfo?.region]);

  useEffect(() => {
    if (activeTab === "alerts") fetchAlerts();
  }, [activeTab, fetchAlerts]);

  const handleLogQuery = async () => {
    if (!instanceId || !selectedLogGroup) {
      setLogError("Wybierz grupę logów.");
      return;
    }
    setLogLoading(true);
    setLogError(null);
    setLogResults([]);
    setLogQueried(true);
    try {
      const res = await fetch(`/api/aws/ec2/${instanceId}/logs/query`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logGroupName: selectedLogGroup,
          filterPattern: logFilterPattern || undefined,
          startTimeMinutes: 60,
          region: vmInfo?.region,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd zapytania logów");
      setLogResultsColumns(data.columns || []);
      setLogResults(data.rows || []);
    } catch (err) {
      setLogError(err.message);
    } finally {
      setLogLoading(false);
    }
  };

  const renderChart = () => (
    <div style={{ marginBottom: "40px" }}>
      <h3>Metryka: {metricsList.find((m) => m.type === selectedMetric)?.displayName || selectedMetric}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={metricData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timestamp" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="average" name="Średnia" stroke="#FF9900" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  const renderLogTable = () => {
    if (logResults.length === 0) return null;
    return (
      <table style={logTableStyle}>
        <thead>
          <tr>
            {logResultsColumns.map((col) => (
              <th key={col} style={logThStyle}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {logResults.map((row, idx) => (
            <tr key={idx}>
              {logResultsColumns.map((col, cidx) => (
                <td key={cidx} style={logTdStyle}>
                  {String(row[cidx] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div style={{ padding: "20px", maxWidth: "980px", margin: "0 auto" }}>
      <button onClick={() => navigate("/virtual-machines")} style={btnStyle}>
        ← Powrót
      </button>

      <h1>Monitoring EC2 (AWS): {vmInfo?.name || instanceId}</h1>

      {loading ? (
        <p>⏳ Ładowanie danych instancji...</p>
      ) : vmInfo?.error ? (
        <p style={{ color: "red" }}>❌ {vmInfo.error}</p>
      ) : (
        <>
          <ul style={{ fontSize: "16px", lineHeight: "1.6", listStyle: "none", paddingLeft: 0 }}>
            <li><strong>Instance ID:</strong> {vmInfo?.instanceId ?? "—"}</li>
            <li><strong>Nazwa:</strong> {vmInfo?.name ?? "—"}</li>
            <li><strong>Status:</strong> {vmInfo?.state ?? "—"}</li>
            <li><strong>Typ:</strong> {vmInfo?.instanceType ?? "—"}</li>
            <li><strong>Region:</strong> {vmInfo?.region ?? "—"}</li>
            <li><strong>Strefa:</strong> {vmInfo?.availabilityZone ?? "—"}</li>
            <li><strong>IP (prywatny):</strong> {vmInfo?.privateIpAddress ?? "—"}</li>
            <li><strong>IP (publiczny):</strong> {vmInfo?.publicIpAddress ?? "—"}</li>
            <li><strong>Profil IAM:</strong> {vmInfo?.iamInstanceProfileArn ?? "— (brak)"}</li>
            <li><strong>CloudWatch Agent:</strong> {agentStatus}</li>
          </ul>
          <div style={{ marginBottom: "14px", display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
            {ssmConnected === false && !vmInfo?.iamInstanceProfileArn ? (
              <button
                onClick={async () => {
                  if (!vmInfo?.region) return;
                  setAttachingSsmProfile(true);
                  try {
                    const res = await fetch(
                      `/api/aws/ec2/${encodeURIComponent(instanceId)}/attach-ssm-profile`,
                      {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ region: vmInfo.region }),
                      }
                    );
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Nie udało się dołączyć profilu SSM");
                    alert(data.message + (data.hint ? `\n\n${data.hint}` : ""));
                    setTimeout(() => {
                      fetchVmDetails();
                      fetchAgentStatus();
                    }, 2000);
                  } catch (err) {
                    alert(`❌ ${err.message}`);
                  } finally {
                    setAttachingSsmProfile(false);
                  }
                }}
                style={{ ...fetchLogButtonStyle, background: "#2B6CB0" }}
                disabled={attachingSsmProfile || !vmInfo?.region}
              >
                {attachingSsmProfile ? "Dołączanie profilu..." : "🔐 Dołącz profil IAM (SSM + CloudWatch)"}
              </button>
            ) : null}
            <button
              onClick={async () => {
                if (!vmInfo?.region) return;
                setInstallingAgent(true);
                try {
                  const res = await fetch(
                    `/api/aws/ec2/${encodeURIComponent(instanceId)}/install-agent`,
                    {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        region: vmInfo.region,
                        logGroupName: `/ec2/${instanceId}`,
                      }),
                    }
                  );
                  const data = await res.json();
                  if (!res.ok) throw new Error((data.hint ? `${data.error}\n\n${data.hint}` : data.error) || "Błąd instalacji agenta");
                  alert(`${data.message} (commandId: ${data.commandId})`);
                  setTimeout(() => fetchAgentStatus(), 4000);
                } catch (err) {
                  alert(`❌ ${err.message}`);
                } finally {
                  setInstallingAgent(false);
                }
              }}
              style={fetchLogButtonStyle}
              disabled={installingAgent || !vmInfo?.region}
            >
              {installingAgent ? "Instalowanie..." : "🛠 Zainstaluj/Skonfiguruj CloudWatch Agent"}
            </button>
            <button onClick={fetchAgentStatus} style={{ ...fetchLogButtonStyle, background: "#4A5568" }}>
              🔄 Odśwież status agenta
            </button>
          </div>
          {agentDetails ? (
            <p style={{ marginTop: "-6px", color: "#555", whiteSpace: "pre-wrap" }}>{agentDetails}</p>
          ) : null}

          <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
            <button
              onClick={() => setActiveTab("cloudWatchMetrics")}
              style={{
                ...tabButtonStyle,
                ...(activeTab === "cloudWatchMetrics" ? activeTabStyle : inactiveTabStyle),
              }}
            >
              📊 CloudWatch Metrics
            </button>
            <button
              onClick={() => setActiveTab("cloudWatchLogs")}
              style={{
                ...tabButtonStyle,
                ...(activeTab === "cloudWatchLogs" ? activeTabStyle : inactiveTabStyle),
              }}
            >
              📁 CloudWatch Logs
            </button>
            <button
              onClick={() => setActiveTab("alerts")}
              style={{
                ...tabButtonStyle,
                ...(activeTab === "alerts" ? activeTabStyle : inactiveTabStyle),
              }}
            >
              🚨 Alerty
            </button>
          </div>

          {activeTab === "cloudWatchMetrics" && (
            <>
              {metricsListLoading ? (
                <p>⏳ Ładowanie listy metryk...</p>
              ) : metricsListError ? (
                <p style={{ color: "red" }}>❌ {metricsListError}</p>
              ) : metricsList.length > 0 ? (
                <>
                  <div style={{ marginBottom: "20px" }}>
                    <label style={{ fontWeight: 600, marginRight: "10px" }}>Wybierz metrykę:</label>
                    <select
                      value={selectedMetric}
                      onChange={(e) => setSelectedMetric(e.target.value)}
                      style={selectStyle}
                    >
                      {metricsList.map((metric) => (
                        <option key={metric.type} value={metric.type}>
                          {metric.displayName || metric.type} ({metric.unit})
                        </option>
                      ))}
                    </select>
                  </div>
                  {metricDataLoading ? (
                    <p>⏳ Ładowanie danych metryki...</p>
                  ) : metricDataError ? (
                    <p style={{ color: "red" }}>❌ {metricDataError}</p>
                  ) : metricData.length > 0 ? (
                    renderChart()
                  ) : (
                    <p>Brak danych dla wybranej metryki w ostatniej godzinie.</p>
                  )}
                </>
              ) : (
                <p>Brak dostępnych metryk dla tej instancji.</p>
              )}
            </>
          )}

          {activeTab === "cloudWatchLogs" && (
            <div style={{ marginTop: "10px" }}>
              <h3>📁 CloudWatch Logs</h3>
              <p style={{ fontSize: "14px", color: "#666", margin: "5px 0" }}>
                Wybierz grupę logów i opcjonalnie wzorzec filtrowania (np. zawierający {instanceId}).
              </p>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ fontWeight: 600, marginRight: "8px" }}>Log group:</label>
                <select
                  value={selectedLogGroup}
                  onChange={(e) => setSelectedLogGroup(e.target.value)}
                  style={selectStyle}
                  disabled={logGroupsLoading}
                >
                  {logGroups.length === 0 && <option value="">— Wybierz —</option>}
                  {logGroups.map((g) => (
                    <option key={g.logGroupName} value={g.logGroupName}>
                      {g.logGroupName}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ fontWeight: 600, marginRight: "8px" }}>Filter pattern (opcjonalnie):</label>
                <input
                  type="text"
                  value={logFilterPattern}
                  onChange={(e) => setLogFilterPattern(e.target.value)}
                  placeholder='np. "ERROR" lub ""'
                  style={{ width: "100%", maxWidth: "400px", padding: "8px", borderRadius: "4px", boxSizing: "border-box" }}
                />
              </div>
              <button onClick={handleLogQuery} disabled={logLoading || !selectedLogGroup} style={fetchLogButtonStyle}>
                {logLoading ? "Wykonywanie..." : "🔍 Pobierz logi"}
              </button>
              {logError && <p style={{ color: "red", marginTop: "10px" }}>❌ {logError}</p>}
              {logResults.length > 0 && (
                <div style={{ marginTop: "15px", overflowX: "auto" }}>{renderLogTable()}</div>
              )}
              {logQueried && !logLoading && !logError && logResults.length === 0 && (
                <p style={{ marginTop: "10px", color: "#555" }}>
                  Brak wyników logów dla bieżących filtrów. Sprawdź inny wzorzec lub upewnij się, że agent wysyła logi do CloudWatch.
                </p>
              )}
            </div>
          )}

          {activeTab === "alerts" && (
            <div style={{ marginTop: "10px" }}>
              <h3>🚨 Alerty dla: {instanceId}</h3>

              <button onClick={() => setShowCreateAlertModal(true)} style={fetchLogButtonStyle}>
                ➕ Utwórz nowy alert
              </button>

              <CreateEC2AlertModal
                isOpen={showCreateAlertModal}
                onClose={() => setShowCreateAlertModal(false)}
                onCreated={fetchAlerts}
                instanceId={instanceId}
                metricsList={metricsList}
                region={vmInfo?.region}
              />

              <div style={{ marginTop: "20px" }}>
                <button onClick={fetchAlerts} disabled={alertsLoading} style={fetchLogButtonStyle}>
                  {alertsLoading ? "Odświeżanie..." : "🔄 Odśwież listę alertów"}
                </button>

                {alertsError && <p style={{ color: "red", marginTop: "10px" }}>❌ {alertsError}</p>}

                {alertsLoading ? (
                  <p style={{ marginTop: "10px" }}>⏳ Ładowanie alertów...</p>
                ) : alerts.length === 0 ? (
                  <p style={{ marginTop: "10px", color: "#666" }}>Brak alertów skonfigurowanych dla tej instancji.</p>
                ) : (
                  <table style={logTableStyle}>
                    <thead>
                      <tr>
                        <th style={logThStyle}>Nazwa</th>
                        <th style={logThStyle}>Metryka</th>
                        <th style={logThStyle}>Próg/Opis</th>
                        <th style={logThStyle}>Stan</th>
                        <th style={logThStyle}>Akcje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.map((a) => (
                        <tr key={a.name}>
                          <td style={logTdStyle}>{a.displayName || a.name}</td>
                          <td style={logTdStyle}>{a.metricType || "—"}</td>
                          <td style={logTdStyle}>{a.description || "—"}</td>
                          <td style={logTdStyle}>{a.state || "—"}</td>
                          <td style={logTdStyle}>
                            <button
                              style={{ ...fetchLogButtonStyle, background: "#DB4437" }}
                              onClick={async () => {
                                if (!window.confirm(`Czy na pewno usunąć alarm: ${a.name}?`)) return;
                                try {
                                  const region = encodeURIComponent(vmInfo.region);
                                  const res = await fetch(
                                    `/api/aws/ec2/${encodeURIComponent(instanceId)}/alerts/${encodeURIComponent(a.name)}?region=${region}`,
                                    { method: "DELETE", credentials: "include" }
                                  );
                                  const data = await res.json();
                                  if (!res.ok) throw new Error(data.error || "Błąd usuwania alertu");
                                  alert(data.message || "Alarm usunięty");
                                  fetchAlerts();
                                } catch (err) {
                                  alert("❌ " + err.message);
                                }
                              }}
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

const btnStyle = {
  marginBottom: "20px",
  padding: "8px 16px",
  fontSize: "16px",
  background: "#FF9900",
  color: "#232f3e",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
};
const tabButtonStyle = { padding: "8px 16px", border: "none", borderRadius: "6px", cursor: "pointer" };
const activeTabStyle = { background: "#FF9900", color: "#232f3e" };
const inactiveTabStyle = { background: "#eee", color: "#333" };
const selectStyle = { padding: "6px", borderRadius: "4px", minWidth: "200px" };
const fetchLogButtonStyle = {
  padding: "6px 12px",
  background: "#FF9900",
  color: "#232f3e",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
};
const logTableStyle = { borderCollapse: "collapse", width: "100%", marginTop: "10px" };
const logThStyle = { border: "1px solid #ccc", padding: "6px", background: "#eee", textAlign: "left" };
const logTdStyle = { border: "1px solid #ccc", padding: "6px", verticalAlign: "top" };

export default VMEC2Monitor;
