import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const ConnectAws = () => {
  const navigate = useNavigate();
  const [roleArn, setRoleArn] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [config, setConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    // Pobierz konfigurację (Account ID i External ID) z backendu
    fetch("/api/account/aws/config", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("Nie można pobrać konfiguracji serwera.");
        return res.json();
      })
      .then((data) => {
        setConfig(data);
        setConfigLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setConfigLoading(false);
      });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Wyślij ARN do tego samego endpointu weryfikacyjnego co poprzednio
      const res = await fetch("/api/account/aws/add", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleArn: roleArn }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Wystąpił błąd");
      
      alert(data.message || "Konto AWS dodane!");
      navigate('/accounts'); // Przekieruj z powrotem do listy kont
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
      <button onClick={() => navigate("/accounts")} style={styles.button}>
        ← Wróć do Kont
      </button>
      
      <h1>Połącz swoje konto AWS</h1>
      <p>Aby bezpiecznie połączyć swoje konto AWS, musisz utworzyć Rolę IAM (Cross-Account Role), która ufa naszej aplikacji.</p>

      <div style={styles.instructions}>
        <h3>Instrukcje krok po kroku</h3>
        {configLoading ? (
          <p>⏳ Ładowanie instrukcji...</p>
        ) : config ? (
          <ol>
            <li>Zaloguj się na swoje konto AWS i przejdź do usługi <b>IAM</b>.</li>
            <li>Idź do <b>Roles</b> (Role) i kliknij <b>"Create role"</b> (Utwórz rolę).</li>
            <li>Wybierz "Trusted entity type": <b>"AWS account"</b></li>
            <li>Wybierz <b>"Another AWS account"</b> i wklej ten <b>Account ID:</b>
              <pre style={styles.pre}>{config.awsAccountId}</pre>
            </li>
            <li>Zaznacz <b>"Require external ID"</b> i wklej ten <b>External ID:</b>
              <pre style={styles.pre}>{config.externalId}</pre>
            </li>
            <li>Kliknij "Next". Na stronie "Add permissions" dołącz polityki (np. `AmazonEC2ReadOnlyAccess`, `AmazonS3ReadOnlyAccess`, `CloudWatchReadOnlyAccess`).</li>
            <li>Nazwij rolę (np. `MultiCloudManagerRole`) i zakończ tworzenie.</li>
            <li>Skopiuj <b>ARN Roli</b> i wklej go poniżej.</li>
          </ol>
        ) : (
          <p style={styles.errorText}>❌ Nie udało się załadować instrukcji. Sprawdź backend.</p>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <h3>Krok końcowy: Wklej ARN Roli</h3>
        <label><b>ARN Roli IAM:</b></label>
        <input
          type="text"
          value={roleArn}
          onChange={(e) => setRoleArn(e.target.value)}
          placeholder="arn:aws:iam::123456789012:role/TwojaRola"
          required
          style={styles.input}
          disabled={!config || loading}
        />
        {error && <p style={styles.errorText}>❌ {error}</p>}
        <div style={styles.buttonContainer}>
          <button type="submit" disabled={loading || !config} style={styles.button}>
            {loading ? "Weryfikowanie..." : "Połącz i Zweryfikuj Konto AWS"}
          </button>
        </div>
      </form>
    </div>
  );
};

// Style
const styles = {
  button: {
    padding: '10px 15px', background: '#0078D4', color: 'white', border: 'none',
    borderRadius: '5px', cursor: 'pointer', fontSize: '16px', marginBottom: '20px'
  },
  instructions: {
    background: '#f9f9f9', padding: '20px', borderRadius: '8px', 
    border: '1px solid #eee', marginBottom: '25px', lineHeight: '1.6'
  },
  pre: {
    background: '#eee', padding: '5px', borderRadius: '4px', 
    fontFamily: 'monospace', display: 'inline-block', margin: '0 5px'
  },
  input: {
    width: '100%', padding: '10px', marginTop: '5px', marginBottom: '15px',
    borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box',
    fontSize: '16px'
  },
  buttonContainer: { display: 'flex', gap: '10px' },
  errorText: { color: 'red', fontWeight: 'bold' }
};

export default ConnectAws;