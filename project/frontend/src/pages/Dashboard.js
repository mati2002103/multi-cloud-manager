import React, { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const Card = ({ title, value, subtitle }) => {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 10,
        padding: 16,
        boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ color: "#4a5568", fontSize: 13 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{value}</div>
      {subtitle ? (
        <div style={{ color: "#718096", fontSize: 12 }}>{subtitle}</div>
      ) : null}
    </div>
  );
};

const Dashboard = () => {
  const [counts, setCounts] = useState({
    azureVMs: 0,
    gcpVMs: 0,
    awsEC2: 0,
    azureContainers: 0,
    gcpContainers: 0,
    awsEcs: 0,
    azureNetworks: 0,
    gcpVpcs: 0,
    awsVpcs: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const totalVMs = useMemo(
    () => counts.azureVMs + counts.gcpVMs + counts.awsEC2,
    [counts]
  );
  const totalContainers = useMemo(
    () => counts.azureContainers + counts.gcpContainers + counts.awsEcs,
    [counts]
  );
  const totalNetworks = useMemo(
    () => counts.azureNetworks + counts.gcpVpcs + counts.awsVpcs,
    [counts]
  );

  const fetchListValue = async (url) => {
    const res = await fetch(url, { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Błąd HTTP: ${res.status}`);
    return data.value || [];
  };

  useEffect(() => {
    setLoading(true);
    setError(null);

    let pending = 9;
    const finishOne = () => {
      pending -= 1;
      if (pending <= 0) setLoading(false);
    };

    const fetchAndSetCount = async (url, field) => {
      try {
        const list = await fetchListValue(url);
        const len = Array.isArray(list) ? list.length : 0;
        setCounts((prev) => ({ ...prev, [field]: len }));
      } catch (e) {
        // Keep UI usable; show only the first error.
        setError((prev) => prev || (e?.message || "Błąd ładowania dashboardu."));
      } finally {
        finishOne();
      }
    };

    fetchAndSetCount("/api/virtual_machines", "azureVMs");
    fetchAndSetCount("/api/gcp/list_vms", "gcpVMs");
    fetchAndSetCount("/api/aws/ec2/list", "awsEC2");
    fetchAndSetCount("/api/list_containers", "azureContainers");
    fetchAndSetCount("/api/gcp/list_containers", "gcpContainers");
    fetchAndSetCount("/api/aws/ecs/services", "awsEcs");
    fetchAndSetCount("/api/vnets", "azureNetworks");
    fetchAndSetCount("/api/gcp/list_gcp_vpcs", "gcpVpcs");
    fetchAndSetCount("/api/aws/vpcs", "awsVpcs");
  }, []);

  const vmChartData = useMemo(
    () => [
      { provider: "Azure", value: counts.azureVMs },
      { provider: "GCP", value: counts.gcpVMs },
      { provider: "AWS", value: counts.awsEC2 },
    ],
    [counts]
  );

  const containerChartData = useMemo(
    () => [
      { provider: "Azure", value: counts.azureContainers },
      { provider: "GCP", value: counts.gcpContainers },
      { provider: "AWS", value: counts.awsEcs },
    ],
    [counts]
  );

  const networkChartData = useMemo(
    () => [
      { provider: "Azure", value: counts.azureNetworks },
      { provider: "GCP", value: counts.gcpVpcs },
      { provider: "AWS", value: counts.awsVpcs },
    ],
    [counts]
  );

  return (
    <div style={{ padding: "20px", maxWidth: 1200, margin: "0 auto" }}>
      <h1>📊 Dashboard</h1>
      <p style={{ color: "#4a5568" }}>
        Najważniejsze zasoby w Twoich chmurach (Azure / GCP / AWS).
      </p>

      {loading ? <p>⏳ Ładowanie danych...</p> : null}
      {error ? <p style={{ color: "red" }}>❌ {error}</p> : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginTop: 18,
        }}
      >
        <Card
          title="VMs (razem)"
          value={totalVMs}
          subtitle={`Azure: ${counts.azureVMs} • GCP: ${counts.gcpVMs} • AWS: ${counts.awsEC2}`}
        />
        <Card
          title="Kontenery / usługi"
          value={totalContainers}
          subtitle={`Azure: ${counts.azureContainers} • GCP: ${counts.gcpContainers} • AWS: ${counts.awsEcs}`}
        />
        <Card
          title="Sieci (VNet/VPC)"
          value={totalNetworks}
          subtitle={`Azure: ${counts.azureNetworks} • GCP: ${counts.gcpVpcs} • AWS: ${counts.awsVpcs}`}
        />
      </div>

      <div style={{ marginTop: 26 }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>VMs per dostawca</h2>
        <div
          style={{
            width: "100%",
            height: 260,
            background: "white",
            borderRadius: 10,
            padding: 12,
            boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
          }}
        >
          <ResponsiveContainer>
            <BarChart data={vmChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="provider" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#2b6cb0" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ marginTop: 26 }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Kontenery per dostawca</h2>
        <div
          style={{
            width: "100%",
            height: 260,
            background: "white",
            borderRadius: 10,
            padding: 12,
            boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
          }}
        >
          <ResponsiveContainer>
            <BarChart data={containerChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="provider" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#319795" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ marginTop: 26 }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Sieci per dostawca</h2>
        <div
          style={{
            width: "100%",
            height: 260,
            background: "white",
            borderRadius: 10,
            padding: 12,
            boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
          }}
        >
          <ResponsiveContainer>
            <BarChart data={networkChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="provider" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#805ad5" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
