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
import CreateECSAlertModal from "../components/CreateECSAlertModal";

const ContainerAWSMonitor = () => {
  const { region, clusterName, serviceName } = useParams();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("cloudWatchMetrics");

  const [loading, setLoading] = useState(false);

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
  const [logResultsColumns, setLogResultsColumns] = useState([]);
  const [logResultsRows, setLogResultsRows] = useState([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState(null);

  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState(null);
  const [showCreateAlertModal, setShowCreateAlertModal] = useState(false);

  const fetchAvailableMetrics = useCallback(async () => {
    setMetricsListLoading(true);
    setMetricsListError(null);
    try {
      const res = await fetch("/api/aws/ecs/available-metrics", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd pobierania metryk");
      setMetricsList(data.metrics || []);
      if (data.metrics?.length > 0) setSelectedMetric(data.metrics[0].type);
    } catch (err) {
      setMetricsListError(err.message);
    } finally {
      setMetricsListLoading(false);
    }
  }, []);

  const fetchMetricData = useCallback(async (metricType) => {
    if (!metricType) return;
    if (!region || !clusterName || !serviceName) return;
    setMetricDataLoading(true);
    setMetricDataError(null);
    setMetricData([]);
    try {
      const res = await fetch("/api/aws/ecs/metrics", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region,
          clusterName,
          serviceName,
          metricType,
          timespanMinutes: 60,
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
  }, [region, clusterName, serviceName]);

  const fetchEcsLogGroups = useCallback(async () => {
    if (!region || !serviceName) return;
    setLogGroupsLoading(true);
    setLogError(null);
    try {
      const res = await fetch(
        `/api/aws/ecs/log-groups?region=${encodeURIComponent(region)}&serviceName=${encodeURIComponent(serviceName)}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd pobierania log groupów");
      setLogGroups(data.value || []);
      const preferred = `/ecs/${serviceName}`;
      const match = (data.value || []).find((g) => g.logGroupName === preferred);
      const first = match?.logGroupName || data.value?.[0]?.logGroupName || "";
      setSelectedLogGroup(first);
    } catch (err) {
      setLogError(err.message);
    } finally {
      setLogGroupsLoading(false);
    }
  }, [region, serviceName]);

  const fetchAlerts = useCallback(async () => {
    if (!region || !clusterName || !serviceName) return;
    setAlertsLoading(true);
    setAlertsError(null);
    try {
      const res = await fetch(
        `/api/aws/ecs/alerts?region=${encodeURIComponent(region)}&clusterName=${encodeURIComponent(clusterName)}&serviceName=${encodeURIComponent(serviceName)}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd pobierania alertów");
      setAlerts(data.value || []);
    } catch (err) {
      setAlertsError(err.message);
    } finally {
      setAlertsLoading(false);
    }
  }, [region, clusterName, serviceName]);

  const handleLogsQuery = async () => {
    if (!region || !selectedLogGroup) return;
    setLogLoading(true);
    setLogError(null);
    setLogResultsColumns([]);
    setLogResultsRows([]);
    try {
      const res = await fetch("/api/aws/ecs/logs/query", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region,
          logGroupName: selectedLogGroup,
          filterPattern: logFilterPattern || undefined,
          startTimeMinutes: 60,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd zapytania logów");
      setLogResultsColumns(data.columns || []);
      // backend returns rows as arrays aligned with columns
      setLogResultsRows(data.rows || []);
    } catch (err) {
      setLogError(err.message);
    } finally {
      setLogLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailableMetrics();
  }, [fetchAvailableMetrics]);

  useEffect(() => {
    if (selectedMetric) fetchMetricData(selectedMetric);
  }, [selectedMetric, fetchMetricData]);

  useEffect(() => {
    if (activeTab === "cloudWatchLogs") fetchEcsLogGroups();
  }, [activeTab, fetchEcsLogGroups]);

  useEffect(() => {
    if (activeTab === "alerts") fetchAlerts();
  }, [activeTab, fetchAlerts]);

  const renderChart = () => (
    <div style={{ marginBottom: "40px" }}>
      <h3>
        {metricsList.find((m) => m.type === selectedMetric)?.displayName || selectedMetric}
      </h3>
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
    if (!logResultsRows.length) return null;
    return (
      <table style={logTableStyle}>
        <thead>
          <tr>
            {logResultsColumns.map((c) => (
              <th key={c} style={logThStyle}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {logResultsRows.map((row, idx) => (
            <tr key={idx}>
              {row.map((cell, cIdx) => (
                <td key={`${idx}-${cIdx}`} style={logTdStyle}>
                  {String(cell ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const logTable = renderLogTable();

  return (
    <div style={{ padding: "20px", maxWidth: "980px", margin: "0 auto" }}>
      <button onClick={() => navigate("/containers")} style={btnStyle}>
        ← Powrót
      </button>

      <h1>Monitoring ECS (AWS): {serviceName}</h1>

      <ul style={{ fontSize: "15px", lineHeight: "1.6", listStyle: "none", paddingLeft: 0 }}>
        <li><strong>Region:</strong> {region}</li>
        <li><strong>Cluster:</strong> {clusterName}</li>
        <li><strong>Service:</strong> {serviceName}</li>
      </ul>

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button
          onClick={() => setActiveTab("cloudWatchMetrics")}
          style={{ ...tabButtonStyle, ...(activeTab === "cloudWatchMetrics" ? activeTabStyle : inactiveTabStyle) }}
        >
          📊 CloudWatch Metrics
        </button>
        <button
          onClick={() => setActiveTab("cloudWatchLogs")}
          style={{ ...tabButtonStyle, ...(activeTab === "cloudWatchLogs" ? activeTabStyle : inactiveTabStyle) }}
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
          ) : (
            <>
              <div style={{ marginBottom: "20px" }}>
                <label style={{ fontWeight: 600, marginRight: "10px" }}>Wybierz metrykę:</label>
                <select value={selectedMetric} onChange={(e) => setSelectedMetric(e.target.value)} style={wsSelectStyle}>
                  {metricsList.map((metric) => (
                    <option key={metric.type} value={metric.type}>
                      {metric.displayName} ({metric.unit})
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
                <p>Brak danych dla wybranej metryki.</p>
              )}
            </>
          )}
        </>
      )}

      {activeTab === "cloudWatchLogs" && (
        <div style={{ marginTop: "10px" }}>
          <h3>📁 CloudWatch Logs (ECS)</h3>

          <div style={{ marginBottom: "12px" }}>
            <label style={{ fontWeight: 600, marginRight: "8px" }}>Log group:</label>
            <select
              value={selectedLogGroup}
              onChange={(e) => setSelectedLogGroup(e.target.value)}
              style={wsSelectStyle}
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
            <label style={{ fontWeight: 600, marginRight: "8px" }}>Filter pattern:</label>
            <input
              value={logFilterPattern}
              onChange={(e) => setLogFilterPattern(e.target.value)}
              placeholder='np. "ERROR"'
              style={{ width: "100%", maxWidth: "420px", padding: "8px", borderRadius: "4px", boxSizing: "border-box" }}
            />
          </div>

          <button onClick={handleLogsQuery} disabled={logLoading || !selectedLogGroup} style={fetchLogButtonStyle}>
            {logLoading ? "Wykonywanie..." : "🔍 Pobierz logi"}
          </button>

          {logError && <p style={{ color: "red", marginTop: "10px" }}>❌ {logError}</p>}

          {logTable && <div style={{ marginTop: "15px", overflowX: "auto" }}>{logTable}</div>}
        </div>
      )}

      {activeTab === "alerts" && (
        <div style={{ marginTop: "10px" }}>
          <h3>🚨 Alerty dla ECS: {serviceName}</h3>

          <button onClick={() => setShowCreateAlertModal(true)} style={fetchLogButtonStyle}>
            ➕ Utwórz nowy alert
          </button>

          <CreateECSAlertModal
            isOpen={showCreateAlertModal}
            onClose={() => setShowCreateAlertModal(false)}
            onCreated={fetchAlerts}
            region={region}
            clusterName={clusterName}
            serviceName={serviceName}
            metricsList={metricsList}
          />

          <div style={{ marginTop: "20px" }}>
            <button onClick={fetchAlerts} disabled={alertsLoading} style={fetchLogButtonStyle}>
              {alertsLoading ? "Odświeżanie..." : "🔄 Odśwież listę alertów"}
            </button>

            {alertsError && <p style={{ color: "red", marginTop: "10px" }}>❌ {alertsError}</p>}

            {alertsLoading ? (
              <p style={{ marginTop: "10px" }}>⏳ Ładowanie alertów...</p>
            ) : alerts.length === 0 ? (
              <p style={{ marginTop: "10px", color: "#666" }}>Brak alertów skonfigurowanych dla tej usługi.</p>
            ) : (
              <table style={logTableStyle}>
                <thead>
                  <tr>
                    <th style={logThStyle}>Nazwa</th>
                    <th style={logThStyle}>Metryka</th>
                    <th style={logThStyle}>Opis</th>
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
                              const res = await fetch(
                                `/api/aws/ecs/alerts/${encodeURIComponent(a.name)}?region=${encodeURIComponent(region)}`,
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
const wsSelectStyle = { padding: "6px", borderRadius: "4px" };

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

export default ContainerAWSMonitor;

