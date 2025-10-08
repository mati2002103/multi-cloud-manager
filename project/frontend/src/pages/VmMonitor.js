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
  ResponsiveContainer
} from "recharts";

const VMMonitor = () => {
  const { vmId } = useParams();
  const navigate = useNavigate();
  const [vmInfo, setVmInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState(null);

  useEffect(() => {
    fetch(`/api/vm/${vmId}/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Server error: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setVmInfo(data);
        if (data.metrics?.length > 0) {
          setSelectedMetric(data.metrics[0].name); // domyślnie pierwsza metryka
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Błąd pobierania danych VM:", err);
        setVmInfo({ error: err.message });
        setLoading(false);
      });
  }, [vmId]);

  const renderChart = (metric) => (
    <div key={metric.name} style={{ marginBottom: "40px" }}>
      <h3>{metric.name} ({metric.unit})</h3>
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

  const selectedMetricData = vmInfo?.metrics?.find(m => m.name === selectedMetric);

  return (
    <div style={{ padding: "20px", maxWidth: "900px", margin: "0 auto" }}>
      <button
        onClick={() => navigate("/virtual-machines")}
        style={{
          marginBottom: "20px",
          padding: "8px 16px",
          fontSize: "16px",
          background: "#0078D4",
          color: "white",
          border: "none",
          borderRadius: "6px"
        }}
      >
        ← Powrót
      </button>

      <h1>Monitoring VM: {vmId}</h1>

      {loading ? (
        <p>⏳ Ładowanie danych...</p>
      ) : vmInfo?.error ? (
        <p style={{ color: "red" }}>❌ {vmInfo.error}</p>
      ) : (
        <>
          <ul style={{ fontSize: "16px", lineHeight: "1.6" }}>
            <li><strong>Subscription ID:</strong> {vmInfo.subscriptionId}</li>
            <li><strong>Resource Group:</strong> {vmInfo.resourceGroup}</li>
            <li><strong>Resource ID:</strong> {vmInfo.resourceId}</li>
          </ul>

          {vmInfo.metrics?.length > 0 ? (
            <>
              <div style={{ marginBottom: "20px", display: "flex", flexWrap: "wrap", gap: "10px" }}>
                {vmInfo.metrics.map((metric) => (
                  <button
                    key={metric.name}
                    onClick={() => setSelectedMetric(metric.name)}
                    style={{
                      padding: "6px 12px",
                      background: selectedMetric === metric.name ? "#0078D4" : "#eee",
                      color: selectedMetric === metric.name ? "white" : "#333",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer"
                    }}
                  >
                    {metric.name}
                  </button>
                ))}
              </div>

              {selectedMetricData ? renderChart(selectedMetricData) : <p>Brak danych dla wybranej metryki.</p>}
            </>
          ) : (
            <p>Brak dostępnych metryk.</p>
          )}
        </>
      )}
    </div>
  );
};

export default VMMonitor;
