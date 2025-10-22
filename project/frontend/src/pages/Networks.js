import React, { useEffect, useState } from "react";
import CreateVnetModal from "../components/CreateVnetModal";
import CreateSubnetModal from "../components/CreateSubnetModal";
import CreateGCPVPCModal from "../components/CreateGCPVPCModal";
import CreateGCPSubnetModal from "../components/CreateGCPSubnetModal";

const VirtualNetworks = () => {
  const [vnets, setVnets] = useState([]);
  const [loadingAzure, setLoadingAzure] = useState(true);
  const [errorAzure, setErrorAzure] = useState(null);
  const [showVnetModal, setShowVnetModal] = useState(false);
  const [showSubnetModal, setShowSubnetModal] = useState(false);
  const [selectedVnet, setSelectedVnet] = useState(null);

  const [gcpVpcs, setGcpVpcs] = useState([]);
  const [loadingGcp, setLoadingGcp] = useState(true);
  const [errorGcp, setErrorGcp] = useState(null);
  const [showGCPVPCModal, setShowGCPVPCModal] = useState(false);
  const [showGCPSubnetModal, setShowGCPSubnetModal] = useState(false);
  const [selectedGcpVpc, setSelectedGcpVpc] = useState(null);
  const [expandedGcpSubnets, setExpandedGcpSubnets] = useState({});

  const fetchAzureVnets = async () => {
    setLoadingAzure(true);
    setErrorAzure(null);
    try {
      const res = await fetch("/api/vnets", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `Błąd HTTP: ${res.status}` }));
        throw new Error(data.error || `Błąd HTTP: ${res.status}`);
      }
      const data = await res.json();
      setVnets(data.value || []);
    } catch (err) {
      console.error("Błąd pobierania VNetów Azure:", err);
      setErrorAzure(err.message);
    } finally {
      setLoadingAzure(false);
    }
  };

  const fetchGcpVpcs = async () => {
    setLoadingGcp(true);
    setErrorGcp(null);
    try {
      const res = await fetch("/api/gcp/list_gcp_vpcs", { credentials: "include" });
       if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `Błąd HTTP: ${res.status}` }));
        throw new Error(data.error || `Błąd HTTP: ${res.status}`);
      }
      const data = await res.json();
      setGcpVpcs(data.value || []);
    } catch (err) {
      console.error("Błąd pobierania VPC GCP:", err);
      setErrorGcp(err.message);
    } finally {
      setLoadingGcp(false);
    }
  };

  useEffect(() => {
    fetchAzureVnets();
    fetchGcpVpcs();
  }, []);

  const toggleGcpSubnets = (vpcId) => {
    setExpandedGcpSubnets(prev => ({
      ...prev,
      [vpcId]: !prev[vpcId]
    }));
  };

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>🌐 Sieci Wirtualne (Multi-Cloud)</h1>
      <p>Lista VNetów (Azure) i sieci VPC (GCP) w Twoich środowiskach.</p>

      <button
        onClick={() => {
          fetchAzureVnets();
          fetchGcpVpcs();
        }}
        style={buttonStyle}
      >
        🔄 Odśwież wszystko
      </button>

      <div style={{ marginTop: '30px', marginBottom: '40px' }}>
        <h2>Azure Virtual Networks (VNet)</h2>
        <button
          onClick={() => setShowVnetModal(true)}
          style={buttonStyle}
        >
          ➕ Dodaj VNet (Azure)
        </button>
        <CreateVnetModal
          isOpen={showVnetModal}
          onClose={() => setShowVnetModal(false)}
          onCreated={fetchAzureVnets}
        />
        <CreateSubnetModal
          isOpen={showSubnetModal}
          onClose={() => setShowSubnetModal(false)}
          onCreated={fetchAzureVnets}
          vnet={selectedVnet}
        />
        {loadingAzure ? (
          <p>⏳ Ładowanie VNetów Azure...</p>
        ) : errorAzure ? (
          <p style={{ color: "red" }}>❌ Błąd Azure: {errorAzure}</p>
        ) : vnets.length === 0 ? (
          <p>Brak dostępnych sieci wirtualnych w Azure.</p>
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
                <tr key={`azure-${idx}`}>
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
                      style={subnetButtonStyle}
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

      <div>
        <h2>Google Cloud VPC Networks</h2>
        <button onClick={() => setShowGCPVPCModal(true)} style={buttonStyle}>
          ➕ Dodaj VPC (GCP)
        </button>
        <CreateGCPVPCModal
          isOpen={showGCPVPCModal}
          onClose={() => setShowGCPVPCModal(false)}
          onCreated={fetchGcpVpcs}
        />
        <CreateGCPSubnetModal
           isOpen={showGCPSubnetModal}
           onClose={() => setShowGCPSubnetModal(false)}
           onCreated={fetchGcpVpcs}
           vpc={selectedGcpVpc}
         />

        {loadingGcp ? (
          <p>⏳ Ładowanie VPC GCP...</p>
        ) : errorGcp ? (
          <p style={{ color: "red" }}>❌ Błąd GCP: {errorGcp}</p>
        ) : gcpVpcs.length === 0 ? (
          <p>Brak dostępnych sieci VPC w GCP.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={headerStyle}>
                <th>Nazwa VPC</th>
                <th>Projekt</th>
                <th>Tryb Subnetów</th>
                <th>Tryb Routingu</th>
                <th>Subnety</th>
                <th>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {gcpVpcs.map((vpc, idx) => {
                const isExpanded = !!expandedGcpSubnets[vpc.id];
                
                return (
                  <tr key={`gcp-${idx}`}>
                    <td style={cellStyle}>{vpc.name}</td>
                    <td style={cellStyle}>{vpc.projectId}</td>
                    <td style={cellStyle}>{vpc.subnetMode ? 'Auto' : 'Custom'}</td>
                    <td style={cellStyle}>{vpc.routingMode}</td>
                    <td style={cellStyle}>
                      {vpc.subnets && vpc.subnets.length > 0 ? (
                        <>
                          <span style={{ marginRight: '10px' }}>
                             {vpc.subnets.length} {vpc.subnets.length === 1 ? 'subnet' : 'subnetów'}
                          </span>
                          <button onClick={() => toggleGcpSubnets(vpc.id)} style={toggleButtonStyle}>
                            {isExpanded ? 'Ukryj ▲' : 'Pokaż ▼'}
                          </button>
                          {isExpanded && (
                            <ul style={subnetListStyle}>
                              {vpc.subnets.map((subnet, sIdx) => (
                                <li key={sIdx}>
                                  {subnet.name} ({subnet.region}): {subnet.ipCidrRange}
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={cellStyle}>
                       <button
                          onClick={() => {
                          setSelectedGcpVpc(vpc);
                          setShowGCPSubnetModal(true);
                          }}
                          style={subnetButtonStyle}
                       >
                          ➕ Dodaj Subnet
                       </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const tableStyle = {
  width: "100%", borderCollapse: "collapse", border: "1px solid #ddd",
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)", marginTop: "20px",
};
const headerStyle = {
  backgroundColor: "#f5f5f5", textAlign: "left", padding: "10px",
  borderBottom: "1px solid #ddd",
};
const cellStyle = {
  padding: "8px", borderBottom: "1px solid #ddd", fontFamily: "monospace",
  verticalAlign: 'top'
};
const buttonStyle = {
  padding: '10px', background: '#0078D4', color: 'white', border: 'none',
  borderRadius: '8px', cursor: 'pointer', marginRight: '10px', marginBottom: '10px'
};
const subnetButtonStyle = {
  marginTop: "5px", padding: "5px 10px", background: "#5bc0de", color: "white",
  border: "none", borderRadius: "5px", fontSize: '12px', cursor: 'pointer'
};
const toggleButtonStyle = {
  background: 'none', border: 'none', color: '#0078D4', cursor: 'pointer',
  fontSize: '12px', padding: '0'
};
const subnetListStyle = {
  margin: '5px 0 0 0', padding: '0 0 0 15px', listStyle: 'disc', fontSize: '12px'
};

export default VirtualNetworks;