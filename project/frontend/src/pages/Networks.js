import React, { useEffect, useState } from "react";
import CreateVnetModal from "../components/CreateVnetModal";
import CreateSubnetModal from "../components/CreateSubnetModal";


const VirtualNetworks = () => {
  const [vnets, setVnets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false); // 🔹 Dodaj stan modala

  const [showSubnetModal, setShowSubnetModal] = useState(false);
  const [selectedVnet, setSelectedVnet] = useState(null);

  const fetchVnets = async () => {
    try {
      const res = await fetch("/api/vnets", {
        credentials: "include",
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setVnets(data.value || []);
    } catch (err) {
      console.error("Błąd pobierania VNetów:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVnets();
  }, []);

  return (
    <div style={{ padding: "20px", maxWidth: "900px", margin: "0 auto" }}>
      <h1>Sieci wirtualne (Virtual Networks)</h1>
      <p>Lista wszystkich VNetów i ich podsieci w Twoim koncie Azure.</p>

      {/* 🔹 Przycisk do otwierania modala */}
      <button
        onClick={() => setShowModal(true)}
        style={{
          padding: "10px",
          background: "#0078D4",
          color: "white",
          border: "none",
          borderRadius: "8px",
          marginBottom: "20px",
        }}
      >
        ➕ Dodaj VNet
      </button>

      {/* 🔹 Modal do tworzenia VNetu */}
      <CreateVnetModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onCreated={fetchVnets}
      />
      <CreateSubnetModal
        isOpen={showSubnetModal}
        onClose={() => setShowSubnetModal(false)}
        onCreated={fetchVnets}
        vnet={selectedVnet}
      />


      {loading ? (
        <p>⏳ Ładowanie VNetów...</p>
      ) : error ? (
        <p style={{ color: "red" }}>❌ Błąd: {error}</p>
      ) : vnets.length === 0 ? (
        <p>Brak dostępnych sieci wirtualnych.</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr style={headerStyle}>
              <th>Subscription ID</th>
              <th>Resource Group</th>
              <th>VNet Name</th>
              <th>Subnets</th>
            </tr>
          </thead>
          <tbody>
            {vnets.map((vnet, idx) => (
        <tr key={idx}>
            <td style={cellStyle}>{vnet.subscriptionId}</td>
            <td style={cellStyle}>{vnet.resourceGroup}</td>
            <td style={cellStyle}>{vnet.network}</td>
            <td style={cellStyle}>
            {vnet.subnets && vnet.subnets.length > 0
                ? vnet.subnets.join(", ")
                : "—"}
            <br />
            <button
                onClick={() => {
                setSelectedVnet(vnet);
                setShowSubnetModal(true);
                }}
                style={{
                marginTop: "5px",
                padding: "5px 10px",
                background: "#0078D4",
                color: "white",
                border: "none",
                borderRadius: "5px",
                }}
            >
        ➕ Dodaj Subnet
      </button>
    </td>
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

export default VirtualNetworks;
