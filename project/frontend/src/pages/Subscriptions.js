import React, { useEffect, useState } from 'react';

const ProviderIcon = ({ provider }) => {
  let emoji = "☁️";
  if (provider === 'azure') emoji = "🔵";
  if (provider === 'gcp') emoji = "🔶";
  if (provider === 'aws') emoji = "🟠";
  
  return <span style={{ fontSize: '24px', marginRight: '10px' }} role="img" aria-label={`${provider} logo`}>{emoji}</span>;
};

const Subscriptions = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Krok 1: Pobierz wszystkie połączone konta
        const accountsRes = await fetch("/api/accounts", { credentials: "include" });
        if (!accountsRes.ok) {
          const errData = await accountsRes.json();
          throw new Error(errData.error || "Błąd sieci przy pobieraniu kont");
        }
        let accountsData = await accountsRes.json();

        // Krok 2: Dla każdego konta GCP, pobierz jego projekty
        const gcpAccounts = accountsData.filter(acc => acc.provider === 'gcp');
        
        // Utwórz tablicę promisów pobierających projekty
        const projectPromises = gcpAccounts.map(gcpAccount => 
          fetch("/api/account/google/projects", { credentials: "include" })
            .then(res => res.json())
            .then(data => {
              // Zaktualizuj obiekt konta GCP o jego projekty lub błąd
              if (data.value) {
                gcpAccount.projects = data.value;
              } else {
                gcpAccount.error = data.error || "Nie można pobrać projektów";
                gcpAccount.projects = [];
              }
              return gcpAccount;
            })
            .catch(err => {
              gcpAccount.error = err.message;
              gcpAccount.projects = [];
              return gcpAccount;
            })
        );
        
        // Poczekaj na zakończenie wszystkich zapytań o projekty
        await Promise.all(projectPromises);

        setAccounts(accountsData);

      } catch (err) {
        console.error("Błąd podczas pobierania danych o kontach:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, []); 

  const renderAccountDetails = (acc) => {
    if (acc.provider === "gcp") {
      return (
        <>
          <p style={styles.detailItem}>Email: <strong>{acc.email}</strong></p>
          {acc.error && <p style={styles.errorText}>Błąd: {acc.error}</p>}
          
          {acc.projects && acc.projects.length > 0 ? (
            <div>
                <p style={styles.detailItem}>Projekty:</p>
                <ul style={styles.list}>
                    {acc.projects.map((p, i) => (
                        <li key={i}><strong>{p.displayName}</strong> ({p.projectId})</li>
                    ))}
                </ul>
            </div>
          ) : (
            !acc.error && <p style={styles.detailItem}>Brak projektów.</p>
          )}
        </>
      );
    } 
    
    if (acc.provider === "azure") {
      return (
        <>
          {acc.tenantId && <p style={styles.detailItem}>Tenant: <strong>{acc.tenantId}</strong></p>}
          {acc.subscriptions && acc.subscriptions.length > 0 ? (
            <div>
              <p style={styles.detailItem}>Subskrypcje:</p>
              <ul style={styles.list}>
                {acc.subscriptions.map((s, i) => (
                  <li key={i}>{s}</li> 
                ))}
              </ul>
            </div>
          ) : (
            <p style={styles.detailItem}>Brak subskrypcji</p>
          )}
        </>
      );
    }
    
    if (acc.provider === "aws") {
      return (
        <>
          <p style={styles.detailItem}>Account ID: <strong>{acc.accountId}</strong></p>
          <p style={styles.detailItem}>Używana rola (ARN): <strong style={styles.arn}>{acc.roleArn}</strong></p>
        </>
      );
    }
    
    return (
        <p style={styles.detailItem}>Provider: <strong>{acc.provider}</strong> (Szczegóły nie zdefiniowane)</p>
    );
  };

  const getProviderName = (provider) => {
    if (provider === 'azure') return 'Azure';
    if (provider === 'gcp') return 'Google Cloud';
    if (provider === 'aws') return 'Amazon Web Services';
    return provider;
  }

  if (loading) return <div style={styles.container}><p>Ładowanie połączonych kont i zasobów...</p></div>;

  return (
    <div style={styles.container}>
      <h1>Połączone Konta i Zasoby</h1>
      <p>Przegląd wszystkich połączonych kont oraz ich głównych zasobów (Subskrypcji / Projektów).</p>

      {error && <p style={styles.errorText}>❌ {error}</p>}

      {accounts.length === 0 ? (
        <p>Nie masz jeszcze połączonych żadnych kont. Przejdź do strony "Konta", aby je dodać.</p>
      ) : (
        <div style={styles.grid}>
          {accounts.map((acc, index) => (
            <div key={index} style={{...styles.card, ...styles[acc.provider]}}>
              <div style={styles.cardHeader}>
                <ProviderIcon provider={acc.provider} />
                <h2 style={styles.cardTitle}>{acc.displayName || acc.email}</h2>
                <span style={{...styles.providerTag, ...styles[acc.provider]?.providerTag}}>
                  {getProviderName(acc.provider)}
                </span>
              </div>
              <div style={styles.cardBody}>
                {renderAccountDetails(acc)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    padding: "20px"
  },
  errorText: {
    color: 'red',
    fontWeight: 'bold',
    background: '#fff0f0',
    border: '1px solid red',
    padding: '10px',
    borderRadius: '5px'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: '20px',
    marginTop: '20px'
  },
  card: {
    border: '1px solid #ddd',
    borderRadius: '8px',
    backgroundColor: 'white',
    boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
    overflow: 'hidden'
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '15px 20px',
    borderBottom: '1px solid #eee'
  },
  cardTitle: {
    margin: 0,
    fontSize: '1.2rem',
    flexGrow: 1
  },
  providerTag: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 'bold',
    color: 'white'
  },
  cardBody: {
    padding: '15px 20px'
  },
  detailItem: {
    margin: '5px 0',
    fontSize: '14px',
    wordBreak: 'break-word'
  },
  list: {
    paddingLeft: '20px',
    margin: '5px 0'
  },
  arn: {
    fontSize: '12px',
    color: '#555',
    fontFamily: 'monospace'
  },
  azure: {
    borderTop: '4px solid #0078D4',
    providerTag: { backgroundColor: '#0078D4' }
  },
  gcp: {
    borderTop: '4px solid #35ea68ff',
    providerTag: { backgroundColor: '#34A853' }
  },
  aws: {
    borderTop: '4px solid #FF9900',
    providerTag: { backgroundColor: '#232F3E' }
  }
};

export default Subscriptions;