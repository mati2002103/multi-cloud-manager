import React, { useEffect, useMemo, useState } from "react";

const REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
];

const CreateAWSContainerModal = ({ isOpen, onClose, onCreated }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [region, setRegion] = useState("us-east-1");
  const [clusterName, setClusterName] = useState("multi-cloud-manager-ecs");
  const [serviceName, setServiceName] = useState("");
  const [containerImage, setContainerImage] = useState("public.ecr.aws/amazonlinux/amazonlinux:latest");
  const [containerPort, setContainerPort] = useState(80);
  const [desiredCount, setDesiredCount] = useState(1);
  const [taskCpu, setTaskCpu] = useState("256");
  const [taskMemory, setTaskMemory] = useState("512");
  const [executionRoleArn, setExecutionRoleArn] = useState("");
  const [taskRoleArn, setTaskRoleArn] = useState("");
  const [assignPublicIp, setAssignPublicIp] = useState(true);

  const [awsVpcs, setAwsVpcs] = useState([]);
  const [vpcId, setVpcId] = useState("");
  const [selectedSubnetIds, setSelectedSubnetIds] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setLoading(false);
    setAwsVpcs([]);
    setVpcId("");
    setSelectedSubnetIds([]);

    fetch("/api/aws/vpcs", { credentials: "include" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Błąd HTTP: ${res.status}`);
        return data.value || [];
      })
      .then((vpcs) => setAwsVpcs(vpcs))
      .catch((err) => setError(err.message));
  }, [isOpen]);

  const vpcsInRegion = useMemo(() => {
    return awsVpcs.filter((v) => v.region === region);
  }, [awsVpcs, region]);

  useEffect(() => {
    // Keep vpcId in sync with region selection
    const exists = vpcsInRegion.some((v) => v.vpcId === vpcId);
    if (!exists) {
      setVpcId(vpcsInRegion[0]?.vpcId || "");
      setSelectedSubnetIds([]);
    }
  }, [region, vpcsInRegion, vpcId]);

  const subnetsForVpc = useMemo(() => {
    const v = vpcsInRegion.find((x) => x.vpcId === vpcId);
    return v?.subnets || [];
  }, [vpcsInRegion, vpcId]);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!serviceName.trim()) throw new Error("serviceName jest wymagane.");

      const res = await fetch("/api/aws/ecs/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region,
          clusterName,
          serviceName: serviceName.trim(),
          containerImage: containerImage.trim(),
          containerPort: Number(containerPort),
          desiredCount: Number(desiredCount),
          taskCpu: taskCpu.trim(),
          taskMemory: taskMemory.trim(),
          vpcId,
          subnetIds: selectedSubnetIds,
          executionRoleArn: executionRoleArn.trim(),
          taskRoleArn: taskRoleArn.trim() || undefined,
          assignPublicIp,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd tworzenia usługi ECS");

      onCreated();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2>📦 Utwórz usługę ECS (AWS)</h2>

        <label>Region:</label>
        <select value={region} onChange={(e) => setRegion(e.target.value)} style={styles.input}>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <label>Cluster name:</label>
        <input value={clusterName} onChange={(e) => setClusterName(e.target.value)} style={styles.input} />

        <label>Nazwa usługi (serviceName):</label>
        <input
          value={serviceName}
          onChange={(e) => setServiceName(e.target.value)}
          placeholder="np. my-ecs-service"
          style={styles.input}
        />

        <label>Obraz kontenera (containerImage):</label>
        <input
          value={containerImage}
          onChange={(e) => setContainerImage(e.target.value)}
          placeholder="np. public.ecr.aws/nginx/nginx:latest"
          style={styles.input}
        />

        <label>Container port:</label>
        <input
          type="number"
          value={containerPort}
          onChange={(e) => setContainerPort(e.target.value)}
          style={{ ...styles.input, width: 140 }}
        />

        <label>Desired count:</label>
        <input
          type="number"
          value={desiredCount}
          onChange={(e) => setDesiredCount(e.target.value)}
          style={{ ...styles.input, width: 140 }}
        />

        <label>Task CPU:</label>
        <input value={taskCpu} onChange={(e) => setTaskCpu(e.target.value)} style={styles.input} />

        <label>Task Memory:</label>
        <input value={taskMemory} onChange={(e) => setTaskMemory(e.target.value)} style={styles.input} />

        <label>Execution role ARN:</label>
        <input
          value={executionRoleArn}
          onChange={(e) => setExecutionRoleArn(e.target.value)}
          placeholder="arn:aws:iam::123456789012:role/ecsTaskExecutionRole"
          style={styles.input}
        />
        <p style={{ margin: "0 0 6px 0", color: "#666", fontSize: 12 }}>
          Jeśli zostawisz puste, backend utworzy rolę task execution automatycznie.
        </p>

        <label>Task role ARN (opcjonalnie):</label>
        <input
          value={taskRoleArn}
          onChange={(e) => setTaskRoleArn(e.target.value)}
          placeholder=""
          style={styles.input}
        />

        <label>VPC:</label>
        <select value={vpcId} onChange={(e) => setVpcId(e.target.value)} style={styles.input}>
          <option value="">-- wybierz --</option>
          {vpcsInRegion.map((v) => (
            <option key={v.vpcId} value={v.vpcId}>
              {v.name} ({v.vpcId})
            </option>
          ))}
        </select>

        <label>Subnety (multi-select):</label>
        <select
          multiple
          value={selectedSubnetIds}
          onChange={(e) => {
            const values = Array.from(e.target.selectedOptions).map((o) => o.value);
            setSelectedSubnetIds(values);
          }}
          style={{ ...styles.input, minHeight: 90 }}
        >
          {subnetsForVpc.length === 0 ? <option value="">— brak subnetów —</option> : null}
          {subnetsForVpc.map((sn) => (
            <option key={sn.subnetId} value={sn.subnetId}>
              {sn.name} ({sn.subnetId}){" "}
              {sn.ipCidrRange ? `- ${sn.ipCidrRange}` : ""}{" "}
              {sn.mapPublicIpOnLaunch ? "(public)" : "(private)"}
            </option>
          ))}
        </select>

        <label>
          <input type="checkbox" checked={assignPublicIp} onChange={(e) => setAssignPublicIp(e.target.checked)} />{" "}
          Assign public IP
        </label>

        {error && <p style={{ color: "red" }}>❌ {error}</p>}

        <div style={styles.buttonContainer}>
          <button onClick={handleSubmit} disabled={loading || !serviceName.trim()} style={styles.primaryButton}>
            {loading ? "Tworzenie..." : "Utwórz usługę ECS"}
          </button>
          <button onClick={onClose} style={styles.secondaryButton}>
            Anuluj
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modal: {
    background: "white",
    padding: "30px",
    borderRadius: "8px",
    width: "520px",
    boxShadow: "0 0 15px rgba(0,0,0,0.3)",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    maxHeight: "90vh",
    overflowY: "auto",
  },
  input: {
    padding: "8px",
    border: "1px solid #ccc",
    borderRadius: "4px",
    width: "100%",
    boxSizing: "border-box",
  },
  buttonContainer: {
    marginTop: "10px",
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
  },
  primaryButton: {
    padding: "10px 14px",
    background: "#FF9900",
    color: "#232f3e",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: "600",
  },
  secondaryButton: {
    padding: "10px 14px",
    background: "#E2E8F0",
    color: "#111",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
};

export default CreateAWSContainerModal;

