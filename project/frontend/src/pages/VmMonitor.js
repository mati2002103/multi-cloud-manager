import React, { useEffect, useState } from "react";
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
  const [logRows, setLogRows] = useState([]);
  const [logType, setLogType] = useState("heartbeat");

  // Log Analytics / workspace state
  const [workspaces, setWorkspaces] = useState([]);
  const [wsLoading, setWsLoading] = useState(false);
  const [wsError, setWsError] = useState(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [showCreateWs, setShowCreateWs] = useState(false);
  const [creatingWs, setCreatingWs] = useState(false);
  const [createWsForm, setCreateWsForm] = useState({
    subscriptionId: "",
    rgName: "",
    workspaceName: "",
    location: "westeurope",
    sku: "PerGB2018",
    retentionInDays: 30,
  });
  const [dcrCreating, setDcrCreating] = useState(false);
  const [dcrMessage, setDcrMessage] = useState(null);

  const fetchDcrList = async () => {
    if (!vmInfo?.subscriptionId || !vmInfo?.resourceGroup) return;
    setDcrLoading(true);
    setDcrError(null);
    try {
      const res = await fetch(
        `/api/dcr_list?subscriptionId=${vmInfo.subscriptionId}&rgName=${vmInfo.resourceGroup}`,
        {
          credentials: "include",
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd pobierania DCR");
      setDcrList(data.value || []);
    } catch (err) {
      setDcrError(err.message);
    } finally {
      setDcrLoading(false);
    }
  };

  // fetch VM metrics and basic info
  useEffect(() => {
    setLoading(true);
    fetch(`/api/vm/${vmId}/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setVmInfo(data);
        if (data.metrics?.length > 0) {
          setSelectedMetric(data.metrics[0].name);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Błąd pobierania danych VM:", err);
        setVmInfo({ error: err.message });
        setLoading(false);
      });
  }, [vmId]);

  // fetch agent status
  useEffect(() => {
    fetch(`/api/vm/${vmId}/agent-status`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.hasAMA_Linux || data.hasAMA_Windows) {
          setAgentStatus("✅ AMA");
        } else if (data.hasMMA) {
          setAgentStatus("⚠️ MMA");
        } else {
          setAgentStatus("❌ Brak");
        }
      })
      .catch(() => setAgentStatus("⏳"));
  }, [vmId]);

  // fetch workspaces for a subscription (if vmInfo has subscriptionId, auto-fetch)
  useEffect(() => {
    if (vmInfo?.subscriptionId) {
      fetchWorkspaces(vmInfo.subscriptionId);
      setCreateWsForm((f) => ({ ...f, subscriptionId: vmInfo.subscriptionId }));
    }
  }, [vmInfo?.subscriptionId]);

  //fetch dcr
  useEffect(() => {
    if (vmInfo?.subscriptionId && vmInfo?.resourceGroup) {
      fetchDcrList(vmInfo.subscriptionId, vmInfo.resourceGroup);
    }
  }, [vmInfo?.subscriptionId]);

  const fetchWorkspaces = async (subscriptionId) => {
    setWsLoading(true);
    setWsError(null);
    try {
      const res = await fetch(
        `/api/log_analytics?subscriptionId=${subscriptionId}&rgName=${vmInfo.resourceGroup}`,
        {
          credentials: "include",
        }
      );

      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Błąd pobierania workspace'ów");
      setWorkspaces(data.value || []);
      if (!selectedWorkspaceId && (data.value || []).length > 0) {
        setSelectedWorkspaceId(data.value[0].id);
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
        subscriptionId: createWsForm.subscriptionId,
        rgName: createWsForm.rgName,
        workspaceName: createWsForm.workspaceName,
        location: createWsForm.location,
        sku: createWsForm.sku,
        retentionInDays: createWsForm.retentionInDays,
      };
      const res = await fetch("/api/log_analytics", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd tworzenia workspace");
      // refresh list and select created workspace (response may return workspace.id)
      await fetchWorkspaces(createWsForm.subscriptionId);
      if (data.workspace?.id) setSelectedWorkspaceId(data.workspace.id);
      setShowCreateWs(false);
      alert(data.message || "Workspace utworzony");
    } catch (err) {
      alert("❌ " + err.message);
    } finally {
      setCreatingWs(false);
    }
  };
  const createDCRForVM = async () => {
    if (
      !selectedWorkspaceId ||
      !vmInfo?.subscriptionId ||
      !vmInfo?.resourceGroup ||
      !vmInfo?.resourceId
    ) {
      alert("Brakuje danych do utworzenia DCR");
      return;
    }

    if (!window.confirm("Utworzyć DCR i przypisać do tej VM?")) return;

    setDcrCreating(true);
    setDcrMessage(null);

    try {
      const payload = {
        subscriptionId: vmInfo.subscriptionId,
        resourceGroup: vmInfo.resourceGroup,
        workspaceId: selectedWorkspaceId,
        vmResourceId: vmInfo.resourceId,
      };

      const res = await fetch("/api/dcr_create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd tworzenia DCR");

      setDcrMessage(data.message || "DCR utworzony");
      alert(data.message || "DCR utworzony");

      // odśwież listę DCR
      fetchDcrList(vmInfo.subscriptionId, vmInfo.resourceGroup);
    } catch (err) {
      alert("❌ " + err.message);
      setDcrMessage("Błąd: " + err.message);
    } finally {
      setDcrCreating(false);
    }
  };

  const fetchLogsBasic = async () => {
    if (!selectedWorkspaceId) {
      alert("Brak workspaceId");
      return;
    }

    setLogRows([]);
    try {
      const res = await fetch(
        `/api/logs_basic?workspaceId=${encodeURIComponent(
          selectedWorkspaceId
        )}&queryType=${logType}`,
        { method: "GET", credentials: "include" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd pobierania logów");
      setLogRows(data.value || []);
    } catch (err) {
      alert("❌ " + err.message);
    }
  };

  const installAMA = async () => {
    if (!window.confirm(`Zainstalować AMA na VM "${vmId}"?`)) return;
    try {
      const res = await fetch(`/api/vm/${vmId}/ensure-ama`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd instalacji AMA");
      alert(data.message);
      setAgentStatus("✅ AMA");
    } catch (err) {
      alert("❌ " + err.message);
    }
  };

  const renderChart = (metric) => (
    <div key={metric.name} style={{ marginBottom: "40px" }}>
      <h3>
        {metric.name} ({metric.unit})
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={metric.data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timestamp" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="average"
            stroke="#0078D4"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  const selectedMetricData = vmInfo?.metrics?.find(
    (m) => m.name === selectedMetric
  );

  return (
    <div style={{ padding: "20px", maxWidth: "980px", margin: "0 auto" }}>
      <button
        onClick={() => navigate("/virtual-machines")}
        style={{
          marginBottom: "20px",
          padding: "8px 16px",
          fontSize: "16px",
          background: "#0078D4",
          color: "white",
          border: "none",
          borderRadius: "6px",
        }}
      >
        ← Powrót
      </button>

      <h1>Monitoring VM: {vmId}</h1>

      <ul style={{ fontSize: "16px", lineHeight: "1.6" }}>
        <li>
          <strong>Subscription ID:</strong> {vmInfo?.subscriptionId || "—"}
        </li>
        <li>
          <strong>Resource Group:</strong> {vmInfo?.resourceGroup || "—"}
        </li>
        <li>
          <strong>Resource ID:</strong> {vmInfo?.resourceId || "—"}
        </li>
        <li>
          <strong>Status agenta:</strong> {agentStatus}
          {agentStatus === "❌ Brak" && (
            <button
              onClick={installAMA}
              style={{
                marginLeft: "10px",
                padding: "6px 12px",
                background: "#0078D4",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              🔧 Zainstaluj AMA
            </button>
          )}
        </li>
      </ul>

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button
          onClick={() => setActiveTab("azureMonitor")}
          style={{
            padding: "8px 16px",
            background: activeTab === "azureMonitor" ? "#0078D4" : "#eee",
            color: activeTab === "azureMonitor" ? "white" : "#333",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          📊 Azure Monitor Metrics
        </button>
        <button
          onClick={() => setActiveTab("logAnalytics")}
          style={{
            padding: "8px 16px",
            background: activeTab === "logAnalytics" ? "#0078D4" : "#eee",
            color: activeTab === "logAnalytics" ? "white" : "#333",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          📁 Log Analytics + KQL
        </button>
      </div>

      {loading ? (
        <p>⏳ Ładowanie danych...</p>
      ) : vmInfo?.error ? (
        <p style={{ color: "red" }}>❌ {vmInfo.error}</p>
      ) : (
        <>
          {activeTab === "azureMonitor" && (
            <>
              {vmInfo.metrics?.length > 0 ? (
                <>
                  <div
                    style={{
                      marginBottom: "20px",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "10px",
                    }}
                  >
                    {vmInfo.metrics.map((metric) => (
                      <button
                        key={metric.name}
                        onClick={() => setSelectedMetric(metric.name)}
                        style={{
                          padding: "6px 12px",
                          background:
                            selectedMetric === metric.name ? "#0078D4" : "#eee",
                          color:
                            selectedMetric === metric.name ? "white" : "#333",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                        }}
                      >
                        {metric.name}
                      </button>
                    ))}
                  </div>

                  {selectedMetricData ? (
                    renderChart(selectedMetricData)
                  ) : (
                    <p>Brak danych dla wybranej metryki.</p>
                  )}
                </>
              ) : (
                <p>Brak dostępnych metryk.</p>
              )}
            </>
          )}

          {activeTab === "logAnalytics" && (
            <div style={{ marginTop: "10px" }}>
              <h3>📁 Log Analytics + KQL</h3>

              <div
                style={{
                  margin: "12px 0",
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                }}
              >
                <label style={{ fontWeight: 600 }}>Workspace:</label>
                {wsLoading ? (
                  <span>⏳ Ładowanie workspace'ów...</span>
                ) : wsError ? (
                  <span style={{ color: "red" }}>❌ {wsError}</span>
                ) : workspaces.length === 0 ? (
                  <span>Brak workspace'ów w subskrypcji</span>
                ) : (
                  <select
                    value={selectedWorkspaceId}
                    onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                    style={{ padding: "6px", borderRadius: "4px" }}
                  >
                    {workspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.name} — {ws.location}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  onClick={() => setShowCreateWs((s) => !s)}
                  style={{
                    marginLeft: "8px",
                    padding: "6px 10px",
                    background: "#6B46C1",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  {showCreateWs ? "✖ Anuluj" : "➕ Nowy workspace"}
                </button>

                <button
                  onClick={createDCRForVM}
                  disabled={dcrCreating}
                  style={{
                    marginLeft: "12px",
                    padding: "6px 10px",
                    background: "#2D3748",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  {dcrCreating ? "Tworzenie DCR..." : "Utwórz i przypisz DCR"}
                </button>
                {dcrMessage && (
                  <p style={{ marginTop: "10px", color: "#2D3748" }}>
                    {dcrMessage}
                  </p>
                )}
              </div>

              {dcrMessage && <p style={{ color: "#2D3748" }}>{dcrMessage}</p>}

              {showCreateWs && (
                <form
                  onSubmit={createWorkspace}
                  style={{
                    marginTop: "12px",
                    padding: "12px",
                    border: "1px solid #eee",
                    borderRadius: "8px",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "8px",
                    }}
                  >
                    <div>
                      <label style={{ fontSize: 13 }}>Subscription ID</label>
                      <input
                        value={createWsForm.subscriptionId}
                        onChange={(e) =>
                          setCreateWsForm((f) => ({
                            ...f,
                            subscriptionId: e.target.value,
                          }))
                        }
                        required
                        style={{
                          width: "100%",
                          padding: "8px",
                          marginTop: "6px",
                          borderRadius: "4px",
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 13 }}>Resource Group</label>
                      <input
                        value={createWsForm.rgName}
                        onChange={(e) =>
                          setCreateWsForm((f) => ({
                            ...f,
                            rgName: e.target.value,
                          }))
                        }
                        required
                        style={{
                          width: "100%",
                          padding: "8px",
                          marginTop: "6px",
                          borderRadius: "4px",
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 13 }}>Workspace Name</label>
                      <input
                        value={createWsForm.workspaceName}
                        onChange={(e) =>
                          setCreateWsForm((f) => ({
                            ...f,
                            workspaceName: e.target.value,
                          }))
                        }
                        required
                        style={{
                          width: "100%",
                          padding: "8px",
                          marginTop: "6px",
                          borderRadius: "4px",
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 13 }}>Location</label>
                      <input
                        value={createWsForm.location}
                        onChange={(e) =>
                          setCreateWsForm((f) => ({
                            ...f,
                            location: e.target.value,
                          }))
                        }
                        style={{
                          width: "100%",
                          padding: "8px",
                          marginTop: "6px",
                          borderRadius: "4px",
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 13 }}>SKU</label>
                      <input
                        value={createWsForm.sku}
                        onChange={(e) =>
                          setCreateWsForm((f) => ({
                            ...f,
                            sku: e.target.value,
                          }))
                        }
                        style={{
                          width: "100%",
                          padding: "8px",
                          marginTop: "6px",
                          borderRadius: "4px",
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 13 }}>Retention (days)</label>
                      <input
                        type="number"
                        value={createWsForm.retentionInDays}
                        onChange={(e) =>
                          setCreateWsForm((f) => ({
                            ...f,
                            retentionInDays: Number(e.target.value),
                          }))
                        }
                        style={{
                          width: "100%",
                          padding: "8px",
                          marginTop: "6px",
                          borderRadius: "4px",
                        }}
                      />
                    </div>
                  </div>

                  <div
                    style={{ marginTop: "12px", display: "flex", gap: "8px" }}
                  >
                    <button
                      type="submit"
                      disabled={creatingWs}
                      style={{
                        padding: "8px 12px",
                        background: "#0078D4",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                    >
                      {creatingWs ? "Tworzenie..." : "Utwórz workspace"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateWs(false)}
                      style={{
                        padding: "8px 12px",
                        background: "#E2E8F0",
                        color: "#111",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                    >
                      Anuluj
                    </button>
                  </div>
                </form>
              )}
              <button
                onClick={() =>
                  fetchDcrList(vmInfo.subscriptionId, vmInfo.resourceGroup)
                }
                style={{
                  marginTop: "10px",
                  padding: "6px 12px",
                  background: "#0078D4",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                🔄 Odśwież listę DCR
              </button>
              <div style={{ marginTop: "18px" }}>
                <h4>📦 Dostępne DCR w tej resource group</h4>
                {dcrLoading ? (
                  <p>⏳ Ładowanie DCR...</p>
                ) : dcrError ? (
                  <p style={{ color: "red" }}>❌ {dcrError}</p>
                ) : dcrList.length === 0 ? (
                  <p>Brak DCR w tej resource group.</p>
                ) : (
                  <ul style={{ paddingLeft: "20px" }}>
                    {dcrList.map((dcr) => (
                      <li key={dcr.id}>
                        <strong>{dcr.name}</strong> — {dcr.location}
                        {dcr.description && (
                          <span style={{ color: "#666" }}>
                            {" "}
                            ({dcr.description})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          <div style={{ marginTop: "30px" }}>
            <h4>📄 Pobierz logi z workspace</h4>
            <div
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "center",
                marginBottom: "10px",
              }}
            >
              <label>Typ zapytania:</label>
              <select
                value={logType}
                onChange={(e) => setLogType(e.target.value)}
                style={{ padding: "6px", borderRadius: "4px" }}
              >
                <option value="heartbeat">Heartbeat</option>
                <option value="perf">Perf (CPU)</option>
              </select>
              <button
                onClick={fetchLogsBasic}
                style={{
                  padding: "6px 12px",
                  background: "#0078D4",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                🔍 Pobierz logi
              </button>
            </div>

            {logRows.length > 0 ? (
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    {Object.keys(logRows[0]).map((key) => (
                      <th
                        key={key}
                        style={{
                          border: "1px solid #ccc",
                          padding: "6px",
                          background: "#eee",
                        }}
                      >
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logRows.map((row, idx) => (
                    <tr key={idx}>
                      {Object.values(row).map((val, i) => (
                        <td
                          key={i}
                          style={{ border: "1px solid #ccc", padding: "6px" }}
                        >
                          {String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>Brak danych do wyświetlenia.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default VMMonitor;
