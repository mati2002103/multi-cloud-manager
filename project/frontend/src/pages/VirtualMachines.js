import React, { useEffect, useState } from "react";
import CreateResourceGroupModal from "../components/CreateResourceGroupModal";
import CreateVMModal from "../components/CreateVMModal";
import CreateGCPVMModal from "../components/CreateGCPVMModal";
import CreateEC2Modal from "../components/CreateEC2Modal";
import { useNavigate } from "react-router-dom";

const VirtualMachines = () => {
  const [resourceGroups, setResourceGroups] = useState([]);
  const [virtualMachines, setVirtualMachines] = useState([]);
  const [loadingRG, setLoadingRG] = useState(true);
  const [loadingVM, setLoadingVM] = useState(true);
  const [errorRG, setErrorRG] = useState(null);
  const [errorVM, setErrorVM] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedRG, setSelectedRG] = useState(null);
  const [rgResources, setRgResources] = useState([]);
  const [showRGDetails, setShowRGDetails] = useState(false);
  const [showVMModal, setShowVMModal] = useState(false);

  const [gcpVms, setGcpVms] = useState([]);
  const [loadingGcpVm, setLoadingGcpVm] = useState(true);
  const [errorGcpVm, setErrorGcpVm] = useState(null);
  const [showGCPVMModal, setShowGCPVMModal] = useState(false);

  const [ec2Instances, setEc2Instances] = useState([]);
  const [loadingEc2, setLoadingEc2] = useState(true);
  const [errorEc2, setErrorEc2] = useState(null);
  const [showEC2Modal, setShowEC2Modal] = useState(false);

  const navigate = useNavigate();

  const fetchResourceGroups = async () => {
    try {
      const res = await fetch("/api/resource_groups", {
        credentials: "include",
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResourceGroups(data.value || []);
    } catch (err) {
      console.error("Błąd pobierania resource groups:", err);
      setErrorRG(err.message);
    } finally {
      setLoadingRG(false);
    }
  };

  const fetchRGContents = async (subscriptionId, rgName) => {
    try {
      const res = await fetch(
        `/api/resource_group_contents?subscriptionId=${subscriptionId}&rgName=${rgName}`,
        {
          credentials: "include",
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRgResources(data.value || []);
      setSelectedRG(rgName);
      setShowRGDetails(true);
    } catch (err) {
      alert("❌ Błąd pobierania zasobów: " + err.message);
    }
  };

  const deleteRG = async (subscriptionId, rgName) => {
    if (
      !window.confirm(`Czy na pewno chcesz usunąć grupę zasobów "${rgName}"?`)
    )
      return;
    try {
      const res = await fetch("/api/resource_group_delete", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId, rgName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd usuwania RG");
      alert(data.message);
      fetchResourceGroups();
    } catch (err) {
      alert("❌ " + err.message);
    }
  };

  const fetchVirtualMachines = async () => {
    try {
      const res = await fetch("/api/virtual_machines", {
        credentials: "include",
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setVirtualMachines(data.value || []);
    } catch (err) {
      console.error("Błąd pobierania VM:", err);
      setErrorVM(err.message);
    } finally {
      setLoadingVM(false);
    }
  };

  const fetchGcpVms = async () => {
    setLoadingGcpVm(true);
    setErrorGcpVm(null);
    try {
      const res = await fetch("/api/gcp/list_vms", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `Błąd HTTP: ${res.status}` }));
        throw new Error(data.error || `Błąd HTTP: ${res.status}`);
      }
      const data = await res.json();
      setGcpVms(data.value || []);
    } catch (err) {
      console.error("Błąd pobierania VM z GCP:", err);
      setErrorGcpVm(err.message);
    } finally {
      setLoadingGcpVm(false);
    }
  };

  const fetchEc2Instances = async () => {
    setLoadingEc2(true);
    setErrorEc2(null);
    try {
      const res = await fetch("/api/aws/ec2/list", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `Błąd HTTP: ${res.status}` }));
        throw new Error(data.error || `Błąd HTTP: ${res.status}`);
      }
      const data = await res.json();
      setEc2Instances(data.value || []);
    } catch (err) {
      console.error("Błąd pobierania EC2:", err);
      setErrorEc2(err.message);
    } finally {
      setLoadingEc2(false);
    }
  };

  const awsEc2PostAction = async (instance, action) => {
    try {
      const res = await fetch(`/api/aws/ec2/${instance.instanceId}/${action}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region: instance.region }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch (e) {
        // eslint-disable-next-line no-unused-vars
        const txt = await res.text().catch(() => "");
        data = txt ? { error: txt } : {};
      }
      if (!res.ok) {
        const details = data.details ? `\n${data.details}` : "";
        throw new Error((data.error || `Błąd akcji EC2: ${action}`) + details);
      }
      await fetchEc2Instances();
    } catch (err) {
      alert(`❌ ${err.message}`);
    }
  };

  const awsEc2Rename = async (instance) => {
    const newName = window.prompt("Nowa nazwa instancji (tag Name):", instance.name || "");
    if (!newName || !newName.trim()) return;
    try {
      const res = await fetch(`/api/aws/ec2/${instance.instanceId}/rename`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region: instance.region, newName: newName.trim() }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch (e) {
        const txt = await res.text().catch(() => "");
        data = txt ? { error: txt } : {};
      }
      if (!res.ok) {
        const details = data.details ? `\n${data.details}` : "";
        throw new Error((data.error || "Błąd zmiany nazwy") + details);
      }
      await fetchEc2Instances();
    } catch (err) {
      alert(`❌ ${err.message}`);
    }
  };

  const awsEc2Terminate = async (instance) => {
    if (!window.confirm(`Czy na pewno chcesz usunąć instancję EC2 "${instance.name}" (${instance.instanceId})?`)) {
      return;
    }
    try {
      const res = await fetch(
        `/api/aws/ec2/${instance.instanceId}/terminate?region=${encodeURIComponent(instance.region)}`,
        { method: "DELETE", credentials: "include" }
      );
      let data = {};
      try {
        data = await res.json();
      } catch (e) {
        const txt = await res.text().catch(() => "");
        data = txt ? { error: txt } : {};
      }
      if (!res.ok) {
        const details = data.details ? `\n${data.details}` : "";
        throw new Error((data.error || "Błąd usuwania instancji EC2") + details);
      }
      await fetchEc2Instances();
    } catch (err) {
      alert(`❌ ${err.message}`);
    }
  };

  useEffect(() => {
    fetchResourceGroups();
    fetchVirtualMachines();
    fetchGcpVms();
    fetchEc2Instances();
  }, []);

  const deleteVM = async (subscriptionId, rgName, vmName) => {
    if (
      !window.confirm(
        `Czy na pewno chcesz usunąć maszynę wirtualną "${vmName}"?`
      )
    )
      return;
    try {
      const res = await fetch("/api/vmsDelete", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId, rgName, vmName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd usuwania VM");
      alert(data.message);
      fetchVirtualMachines();
    } catch (err) {
      alert("❌ " + err.message);
    }
  };

  const handleDeleteGcpVm = async (vm) => {
    if (!window.confirm(`Czy na pewno chcesz usunąć maszynę wirtualną "${vm.name}" w projekcie "${vm.projectId}"?`)) return;
    try {
      const res = await fetch("/api/gcp/delete_gcp_vm", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: vm.projectId,
          zone: vm.location,
          vmName: vm.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd usuwania maszyny wirtualnej");
      alert(`✅ ${data.message}`);
      setTimeout(() => { fetchGcpVms(); }, 3000);
    } catch (err) {
      alert(`❌ ${err.message}`);
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>🖥️ Zasoby Compute (Multi-Cloud)</h1>
      <p>Lista grup zasobów i maszyn wirtualnych w Twoich środowiskach Azure, GCP i AWS.</p>

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button
          onClick={() => {
            setLoadingRG(true); setLoadingVM(true); setLoadingGcpVm(true); setLoadingEc2(true);
            fetchResourceGroups(); fetchVirtualMachines(); fetchGcpVms(); fetchEc2Instances();
          }}
          style={buttonStyle}
        >
          🔄 Odśwież wszystko
        </button>
      </div>

      <div style={{ marginBottom: '40px' }}>
        <h2>Azure Resource Groups</h2>
        <button onClick={() => setShowModal(true)} style={buttonStyle}>
          ➕ Dodaj RG (Azure)
        </button>
        <CreateResourceGroupModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onCreated={fetchResourceGroups}
        />
        {loadingRG ? ( <p>⏳ Ładowanie grup zasobów...</p> )
         : errorRG ? ( <p style={{ color: "red" }}>❌ Błąd: {errorRG}</p> )
         : resourceGroups.length === 0 ? ( <p>Brak dostępnych grup zasobów.</p> )
         : (
          <table style={tableStyle}>
            <thead>
              <tr style={headerStyle}>
                <th>Subscription ID</th>
                <th>Resource Group</th>
                <th>Location</th>
                <th>Check Inside</th>
                <th>Delete</th>
              </tr>
            </thead>
            <tbody>
              {resourceGroups.map((rg, idx) => (
                <tr key={idx}>
                  <td style={cellStyle}>{rg.subscriptionId}</td>
                  <td style={cellStyle}>{rg.resourceGroup}</td>
                  <td style={cellStyle}>{rg.location}</td>
                  <td style={cellStyle}>
                    <button onClick={() => fetchRGContents(rg.subscriptionId, rg.resourceGroup)}>
                      🔎
                    </button>
                  </td>
                  <td style={cellStyle}>
                    <button onClick={() => deleteRG(rg.subscriptionId, rg.resourceGroup)}>
                      ❌
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
         )}
        {showRGDetails && (
          <div style={{ marginTop: "30px" }}>
            <h3>📦 Zasoby w grupie: {selectedRG}</h3>
            {rgResources.length === 0 ? (
              <p>Brak zasobów w tej grupie.</p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr style={headerStyle}>
                    <th>Nazwa</th><th>Typ</th><th>Lokalizacja</th>
                  </tr>
                </thead>
                <tbody>
                  {rgResources.map((res, idx) => (
                    <tr key={idx}>
                      <td style={cellStyle}>{res.name}</td>
                      <td style={cellStyle}>{res.type}</td>
                      <td style={cellStyle}>{res.location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <button onClick={() => setShowRGDetails(false)} style={{ marginTop: "10px" }}>
              Zamknij
            </button>
          </div>
        )}
      </div>
      
      <div style={{ marginBottom: '40px' }}>
        <h2>Azure Virtual Machines</h2>
        <button onClick={() => setShowVMModal(true)} style={buttonStyle}>
          🖥️ Utwórz VM (Azure)
        </button>
        <CreateVMModal
          isOpen={showVMModal}
          onClose={() => setShowVMModal(false)}
          onCreated={fetchVirtualMachines}
          subscriptionId={resourceGroups[0]?.subscriptionId}
        />
        {loadingVM ? ( <p>⏳ Ładowanie VM z Azure...</p> )
         : errorVM ? ( <p style={{ color: "red" }}>❌ Błąd Azure: {errorVM}</p> )
         : virtualMachines.length === 0 ? ( <p>Brak dostępnych maszyn wirtualnych w Azure.</p> )
         : (
          <table style={tableStyle}>
            <thead>
              <tr style={headerStyle}>
                <th>Subscription ID</th>
                <th>Resource Group</th>
                <th>VM Name</th>
                <th>Location</th>
                <th>Monitor</th>
                <th>Modify</th>
                <th>Delete</th>
              </tr>
            </thead>
            <tbody>
              {virtualMachines.map((vm, idx) => (
                <tr key={idx}>
                  <td style={cellStyle}>{vm.subscriptionId}</td>
                  <td style={cellStyle}>{vm.resourceGroup}</td>
                  <td style={cellStyle}>{vm.name}</td>
                  <td style={cellStyle}>{vm.location}</td>
                  <td style={cellStyle}>
                    <span style={{ cursor: "pointer" }} onClick={() => navigate(`/vm/${vm.name}/monitoring`)}>
                      📈
                    </span>
                  </td>
                  <td style={cellStyle}>🛠</td>
                  <td style={cellStyle}>
                    <button onClick={() => deleteVM(vm.subscriptionId, vm.resourceGroup, vm.name)}>
                      ❌
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
         )}
      </div>

      <div>
        <h2>Google Cloud (GCP) Virtual Machines</h2>
        <button onClick={() => setShowGCPVMModal(true)} style={buttonStyle}>
          ➕ Utwórz Instancję (GCP)
        </button>
        <CreateGCPVMModal
          isOpen={showGCPVMModal}
          onClose={() => setShowGCPVMModal(false)}
          onCreated={fetchGcpVms}
        />
        {loadingGcpVm ? (
          <p>⏳ Ładowanie VM z GCP...</p>
        ) : errorGcpVm ? (
          <p style={{ color: "red" }}>❌ Błąd GCP: {errorGcpVm}</p>
        ) : gcpVms.length === 0 ? (
          <p>Brak dostępnych maszyn wirtualnych w GCP.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={headerStyle}>
                <th>Nazwa</th>
                <th>Projekt</th>
                <th>Lokalizacja (Strefa)</th>
                <th>Status</th>
                <th>Typ maszyny</th>
                 <th>Monitor</th>
                <th>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {gcpVms.map((vm, idx) => (
                <tr key={idx}>
                  <td style={cellStyle}>{vm.name}</td>
                  <td style={cellStyle}>{vm.projectId}</td>
                  <td style={cellStyle}>{vm.location}</td>
                  <td style={cellStyle}>{vm.status}</td>
                  <td style={cellStyle}>{vm.machineType}</td>
                  <td style={cellStyle}>
                    <span style={{ cursor: "pointer" }} onClick={() => navigate(`/vm/gcp/${vm.name}/monitoring`)}>
                      📈
                    </span>
                  </td>

                  <td style={cellStyle}>
                    <button onClick={() => handleDeleteGcpVm(vm)} title="Usuń maszynę wirtualną">
                      ❌
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginBottom: "40px" }}>
        <h2>AWS EC2 Instances</h2>
        <button onClick={() => setShowEC2Modal(true)} style={buttonStyle}>
          ➕ Utwórz instancję EC2
        </button>
        <CreateEC2Modal
          isOpen={showEC2Modal}
          onClose={() => setShowEC2Modal(false)}
          onCreated={fetchEc2Instances}
        />
        {loadingEc2 ? (
          <p>⏳ Ładowanie instancji EC2...</p>
        ) : errorEc2 ? (
          <p style={{ color: "red" }}>❌ Błąd AWS: {errorEc2}</p>
        ) : ec2Instances.length === 0 ? (
          <p>Brak dostępnych instancji EC2 (lub brak połączonego konta AWS).</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={headerStyle}>
                <th>Nazwa / Instance ID</th>
                <th>Region</th>
                <th>Strefa</th>
                <th>Status</th>
                <th>Typ</th>
                <th>Monitor</th>
                <th>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {ec2Instances.map((inst, idx) => (
                <tr key={idx}>
                  <td style={cellStyle}>{inst.name}</td>
                  <td style={cellStyle}>{inst.region}</td>
                  <td style={cellStyle}>{inst.availabilityZone}</td>
                  <td style={cellStyle}>{inst.state}</td>
                  <td style={cellStyle}>{inst.instanceType}</td>
                  <td style={cellStyle}>
                    <span
                      style={{ cursor: "pointer" }}
                      onClick={() => navigate(`/vm/aws/${inst.instanceId}/monitoring`)}
                    >
                      📈
                    </span>
                  </td>
                  <td style={cellStyle}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {(() => {
                        const state = (inst.state || "").toLowerCase();
                        const canStart = state === "stopped";
                        const canStop = state === "running";
                        if (canStart) {
                          return (
                            <button
                              onClick={() => awsEc2PostAction(inst, "start")}
                              title="Start instancji"
                            >
                              ⏵ Start
                            </button>
                          );
                        }
                        if (canStop) {
                          return (
                            <button
                              onClick={() => awsEc2PostAction(inst, "stop")}
                              title="Stop instancji"
                            >
                              ⏸ Stop
                            </button>
                          );
                        }
                        return <span style={{ color: "#666" }}>—</span>;
                      })()}
                      <button onClick={() => awsEc2Rename(inst)} title="Zmień tag Name">
                        ✏️ Rename
                      </button>
                      <button onClick={() => awsEc2Terminate(inst)} title="Usuń instancję">
                        ❌ Usuń
                      </button>
                    </div>
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
  width: "100%",
  borderCollapse: "collapse",
  border: "1px solid #ddd",
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
  marginTop: "20px",
};

const headerStyle = {
  backgroundColor: "#f5f5f5",
  textAlign: "left",
  padding: "10px",
  borderBottom: "1px solid #ddd",
};

const cellStyle = {
  padding: "8px",
  borderBottom: "1px solid #ddd",
  fontFamily: "monospace",
};

const buttonStyle = {
  padding: '10px',
  background: '#0078D4',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  marginRight: '10px',
  marginBottom: '10px'
};

export default VirtualMachines;