import React, { useEffect, useState } from "react";
import CreateResourceGroupModal from "../components/CreateResourceGroupModal";

const VirtualMachines = () => {
  const [resourceGroups, setResourceGroups] = useState([]);
  const [virtualMachines, setVirtualMachines] = useState([]);
  const [loadingRG, setLoadingRG] = useState(true);
  const [loadingVM, setLoadingVM] = useState(true);
  const [errorRG, setErrorRG] = useState(null);
  const [errorVM, setErrorVM] = useState(null);
  const [showModal, setShowModal] = useState(false);

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

      <button
        onClick={() => setShowModal(true)}
        style={{
          padding: "10px",
          flex: 1,
          background: "#0078D4",
          color: "white",
          border: "none",
          borderRadius: "8px",
          marginBottom: "20px",
        }}
      >
        ➕ Dodaj RG
      </button>

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
            </tr>
          </thead>
          <tbody>
            {resourceGroups.map((rg, idx) => (
              <tr key={idx}>
                <td style={cellStyle}>{rg.subscriptionId}</td>
                <td style={cellStyle}>{rg.resourceGroup}</td>
                <td style={cellStyle}>{rg.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Tabela VM */}
      <h2 style={{ marginTop: "40px" }}>Maszyny wirtualne (Virtual Machines)</h2>
      {loadingVM ? (
        <p>⏳ Ładowanie VM...</p>
      ) : errorVM ? (
        <p style={{ color: "red" }}>❌ Błąd: {errorVM}</p>
      ) : virtualMachines.length === 0 ? (
        <p>Brak dostępnych maszyn wirtualnych.</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr style={headerStyle}>
              <th>Subscription ID</th>
              <th>Resource Group</th>
              <th>VM Name</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            {virtualMachines.map((vm, idx) => (
              <tr key={idx}>
                <td style={cellStyle}>{vm.subscriptionId}</td>
                <td style={cellStyle}>{vm.resourceGroup}</td>
                <td style={cellStyle}>{vm.name}</td>
                <td style={cellStyle}>{vm.location}</td>
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
