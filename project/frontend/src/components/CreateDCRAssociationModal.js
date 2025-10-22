import React, { useState, useEffect } from "react";

const CreateDCRAssociationModal = ({ isOpen, onClose, onCreated, vmInfo }) => {
  const [workspaces, setWorkspaces] = useState([]);
  const [wsLoading, setWsLoading] = useState(false);
  const [wsError, setWsError] = useState(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [dcrName, setDcrName] = useState("");
  const [collectPerformance, setCollectPerformance] = useState(true);
  const [collectSystemLogs, setCollectSystemLogs] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !vmInfo?.subscriptionId || !vmInfo?.resourceGroup) {
      setWorkspaces([]);
      return;
    }
    setError(null);
    setWsLoading(true);
    setWsError(null);
    fetch(`/api/log_analytics?subscriptionId=${vmInfo.subscriptionId}&rgName=${vmInfo.resourceGroup}`, { credentials: "include" })
      .then(res => res.ok ? res.json() : res.json().then(err => { throw new Error(err.error) }))
      .then(data => {
        setWorkspaces(data.value || []);
        if (data.value && data.value.length > 0) {
          setSelectedWorkspaceId(data.value[0].id);
        } else {
           setSelectedWorkspaceId("");
        }
      })
      .catch(err => setWsError(`Nie udało się pobrać workspace'ów: ${err.message}`))
      .finally(() => setWsLoading(false));

    setDcrName(`dcr-${vmInfo.vmName || 'vm'}-basic`);
  }, [isOpen, vmInfo]);


  const handleSubmit = async () => {
    if (!vmInfo?.subscriptionId || !vmInfo?.resourceGroup || !vmInfo?.resourceId || !vmInfo?.location) {
        setError("Brakujące podstawowe informacje o VM (Subskrypcja, RG, ID, Lokalizacja).");
        return;
    }
     if (!selectedWorkspaceId) {
        setError("Musisz wybrać Log Analytics Workspace.");
        return;
     }
     if (!dcrName) {
         setError("Musisz podać nazwę dla nowej reguły DCR.");
         return;
     }
     if (!/^[a-zA-Z0-9_.-]+$/.test(dcrName)) {
        setError("Nazwa DCR może zawierać litery, cyfry, podkreślenia, kropki i myślniki.");
        return;
     }
     if (!collectPerformance && !collectSystemLogs) {
         setError("Musisz wybrać co najmniej jedno źródło danych do zbierania.");
         return;
     }

    setLoading(true);
    setError(null);
    try {
      const payload = {
        subscriptionId: vmInfo.subscriptionId,
        resourceGroup: vmInfo.resourceGroup,
        dcrName: dcrName,
        location: vmInfo.location,
        workspaceId: selectedWorkspaceId,
        vmResourceId: vmInfo.resourceId,
        collectPerformance: collectPerformance,
        collectSystemLogs: collectSystemLogs,
      };

      const res = await fetch("/api/create_dcr_and_associate_for_vm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd tworzenia i przypisywania DCR");

      alert(data.message || "DCR utworzony i przypisany pomyślnie.");
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
        <h2>➕ Utwórz i Przypisz Regułę Zbierania Danych (DCR)</h2>
        <p>
            Dla VM: <strong>{vmInfo?.vmName || 'N/A'}</strong>
        </p>

        <label>Nazwa nowej reguły DCR:</label>
        <input
          type="text"
          value={dcrName}
          onChange={e => setDcrName(e.target.value)}
          placeholder="np. dcr-mojavm-basic"
          style={styles.input}
        />
         <small style={styles.smallText}>
            Unikalna nazwa DCR w grupie zasobów {vmInfo?.resourceGroup || 'VM'}.
        </small>

        <label>Wyślij dane do Workspace:</label>
        {wsLoading ? ( <p>Ładowanie...</p> )
         : wsError ? ( <p style={styles.errorText}>❌ {wsError}</p> )
         : (
            <select value={selectedWorkspaceId} onChange={e => setSelectedWorkspaceId(e.target.value)} style={styles.input}>
              <option value="">-- wybierz Log Analytics Workspace --</option>
              {workspaces.map(ws => (
                <option key={ws.id} value={ws.id}>
                  {ws.name} ({ws.location})
                </option>
              ))}
            </select>
          )}

        <label>Zbierane dane:</label>
        <div style={{ marginBottom: '15px' }}>
            <label style={{ marginRight: '15px', fontWeight: 'normal' }}>
                <input
                    type="checkbox"
                    checked={collectPerformance}
                    onChange={e => setCollectPerformance(e.target.checked)}
                />
                Liczniki wydajności (CPU, Pamięć)
            </label>
            <label style={{ fontWeight: 'normal' }}>
                <input
                    type="checkbox"
                    checked={collectSystemLogs}
                    onChange={e => setCollectSystemLogs(e.target.checked)}
                />
                Logi systemowe (Event Log / Syslog)
            </label>
        </div>

        {error && <p style={styles.errorText}>❌ {error}</p>}

        <div style={styles.buttonContainer}>
          <button onClick={handleSubmit} disabled={loading || wsLoading || !selectedWorkspaceId || !dcrName}>
            {loading ? "Tworzenie..." : "Utwórz i Przypisz"}
          </button>
          <button onClick={onClose} style={{ marginLeft: "10px" }}>Anuluj</button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)", display: "flex",
    justifyContent: "center", alignItems: "center", zIndex: 1000
  },
  modal: {
    background: "white", padding: "30px", borderRadius: "8px",
    width: "450px", boxShadow: "0 0 15px rgba(0,0,0,0.3)",
    display: "flex", flexDirection: "column", gap: "5px"
  },
  input: {
      padding: '8px',
      marginBottom: '10px',
      border: '1px solid #ccc',
      borderRadius: '4px',
      width: '100%'
  },
  smallText: {
      display: 'block',
      marginBottom: '15px',
      fontSize: '12px',
      color: '#666'
  },
  errorText: {
      color: "red",
      marginTop: '10px'
  },
  buttonContainer: {
      marginTop: "20px",
      display: 'flex',
      justifyContent: 'flex-end'
  }
};

export default CreateDCRAssociationModal;