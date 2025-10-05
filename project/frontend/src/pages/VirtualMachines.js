import React, { useEffect, useState } from "react";
import CreateResourceGroupModal from "../components/CreateResourceGroupModal";
import CreateVMModal from "../components/CreateVMModal";


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
    const res = await fetch(`/api/resource_group_contents?subscriptionId=${subscriptionId}&rgName=${rgName}`, {
      credentials: "include",
    });
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
  if (!window.confirm(`Czy na pewno chcesz usunąć grupę zasobów "${rgName}"?`)) return;
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

  useEffect(() => {
    fetchResourceGroups();
    fetchVirtualMachines();
  }, []);

  return (
    <div style={{ padding: "20px", maxWidth: "900px", margin: "0 auto" }}>
      <h1>Grupy zasobów (Resource Groups)</h1>
      <p>Lista wszystkich grup zasobów dostępnych w Twoim koncie Azure.</p>

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
  <button
    onClick={() => setShowModal(true)}
    style={{
      padding: "10px",
      background: "#0078D4",
      color: "white",
      border: "none",
      borderRadius: "8px",
    }}
  >
    ➕ Dodaj RG
  </button>

  <button
    onClick={() => {
      setLoadingRG(true);
      setLoadingVM(true);
      fetchResourceGroups();
      fetchVirtualMachines();
    }}
    style={{
      padding: "10px",
      background: "#38A169",
      color: "white",
      border: "none",
      borderRadius: "8px",
    }}
  >
    🔄 Odśwież
  </button>
</div>

      <CreateResourceGroupModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onCreated={() => {
          fetchResourceGroups();
          fetchVirtualMachines();
        }}
      />

      {/* Tabela grup zasobów */}
      {loadingRG ? (
        <p>⏳ Ładowanie grup zasobów...</p>
      ) : errorRG ? (
        <p style={{ color: "red" }}>❌ Błąd: {errorRG}</p>
      ) : resourceGroups.length === 0 ? (
        <p>Brak dostępnych grup zasobów.</p>
      ) : (
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
  <button onClick={() => fetchRGContents(rg.subscriptionId, rg.resourceGroup)}>🔎</button>
</td>
<td style={cellStyle}>
  <button onClick={() => deleteRG(rg.subscriptionId, rg.resourceGroup)}>❌</button>
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
            <th>Nazwa</th>
            <th>Typ</th>
            <th>Lokalizacja</th>
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

<button
  onClick={() => setShowVMModal(true)}
  style={{
    padding: "10px",
    background: "#6B46C1",
    color: "white",
    border: "none",
    borderRadius: "8px",
  }}
>
  🖥️ Utwórz VM
</button>
<CreateVMModal
  isOpen={showVMModal}
  onClose={() => setShowVMModal(false)}
  onCreated={fetchVirtualMachines}
  subscriptionId={resourceGroups[0]?.subscriptionId}
/>



      {/* Tabela VM */}
      <h2 style={{ marginTop: "40px" }}>Maszyny wirtualne (Virtual Machines)</h2>
      {loadingVM ? (
        <p>⏳ Ładowanie VM...</p>
      ) : errorVM ? (
        <p style={{ color: "red" }}>❌ Błąd: {errorVM}</p>
      ) : virtualMachines.length === 0 ? (
        <p>Brak dostępnych maszyn wirtualnych.</p>
      ) : 
      (
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
                <td style={cellStyle}>📈</td>
                <td style={cellStyle}>🛠</td>
                <td style={cellStyle}>❌</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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

export default VirtualMachines;
