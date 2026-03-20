import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const ConnectAws = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fromHome = location.state?.fromHome === true;

  const [roleArn, setRoleArn] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [config, setConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
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
      const res = await fetch("/api/account/aws/add", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleArn: roleArn }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Wystąpił błąd");

      alert(data.message || "Konto AWS dodane!");
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (fromHome) navigate("/");
    else navigate("/accounts");
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <button onClick={handleBack} style={styles.backButton}>
          ← {fromHome ? "Wróć na stronę główną" : "Wróć do Kont"}
        </button>

        <h1 style={styles.title}>Połącz swoje konto AWS</h1>
        <p style={styles.subtitle}>
          Aby bezpiecznie połączyć swoje konto AWS, utwórz Rolę IAM (Cross-Account Role), która ufa naszej aplikacji.
        </p>

        <div style={styles.instructions}>
          <h3 style={styles.instructionsTitle}>Instrukcje krok po kroku</h3>
          {configLoading ? (
            <p style={styles.loadingText}>Ładowanie instrukcji...</p>
          ) : config ? (
            <ol style={styles.ol}>
              <li>Zaloguj się na swoje konto AWS i przejdź do usługi <b>IAM</b>.</li>
              <li>Idź do <b>Roles</b> (Role) i kliknij <b>"Create role"</b> (Utwórz rolę).</li>
              <li>Wybierz "Trusted entity type": <b>"AWS account"</b></li>
              <li>Wybierz <b>"Another AWS account"</b> i wklej ten <b>Account ID:</b>
                <pre style={styles.pre}>{config.awsAccountId}</pre>
              </li>
              <li>Zaznacz <b>"Require external ID"</b> i wklej ten <b>External ID:</b>
                <pre style={styles.pre}>{config.externalId}</pre>
              </li>
              <li>Kliknij "Next". Na stronie "Add permissions" dołącz polityki (np. <code>AmazonEC2ReadOnlyAccess</code>, <code>AmazonS3ReadOnlyAccess</code>, <code>CloudWatchReadOnlyAccess</code>).</li>
              <li>Nazwij rolę (np. <code>MultiCloudManagerRole</code>) i zakończ tworzenie.</li>
              <li>Skopiuj <b>ARN Roli</b> i wklej go poniżej.</li>
            </ol>
          ) : (
            <p style={styles.errorText}>Nie udało się załadować instrukcji. Sprawdź backend.</p>
          )}
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <h3 style={styles.formTitle}>Krok końcowy: Wklej ARN Roli</h3>
          <label style={styles.label}><b>ARN Roli IAM:</b></label>
          <input
            type="text"
            value={roleArn}
            onChange={(e) => setRoleArn(e.target.value)}
            placeholder="arn:aws:iam::123456789012:role/TwojaRola"
            required
            style={styles.input}
            disabled={!config || loading}
          />
          {error && <p style={styles.errorText}>{error}</p>}
          <div style={styles.buttonContainer}>
            <button type="submit" disabled={loading || !config} style={styles.submitButton}>
              {loading ? "Weryfikowanie..." : "Połącz i Zweryfikuj Konto AWS"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f7fafc",
    padding: "24px",
    boxSizing: "border-box",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },
  card: {
    maxWidth: "720px",
    margin: "0 auto",
    backgroundColor: "#fff",
    borderRadius: "12px",
    padding: "32px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
  },
  backButton: {
    padding: "10px 16px",
    background: "#f0f0f0",
    color: "#333",
    border: "1px solid #ddd",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
    marginBottom: "24px",
  },
  title: {
    margin: "0 0 8px",
    fontSize: "1.75rem",
    color: "#232f3e",
  },
  subtitle: {
    margin: "0 0 24px",
    fontSize: "1rem",
    color: "#555",
    lineHeight: 1.5,
  },
  instructions: {
    background: "#f8f9fa",
    padding: "20px 24px",
    borderRadius: "10px",
    border: "1px solid #e9ecef",
    marginBottom: "28px",
    lineHeight: 1.65,
  },
  instructionsTitle: {
    margin: "0 0 12px",
    fontSize: "1.1rem",
    color: "#232f3e",
  },
  loadingText: {
    margin: 0,
    color: "#666",
  },
  ol: {
    margin: "0 0 0 20px",
    padding: 0,
    color: "#333",
  },
  pre: {
    background: "#e9ecef",
    padding: "6px 10px",
    borderRadius: "6px",
    fontFamily: "monospace",
    display: "inline-block",
    margin: "2px 6px 2px 0",
    fontSize: "14px",
  },
  form: {
    marginTop: "8px",
  },
  formTitle: {
    margin: "0 0 12px",
    fontSize: "1.1rem",
    color: "#232f3e",
  },
  label: {
    display: "block",
    marginBottom: "6px",
    fontSize: "14px",
    color: "#333",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    marginBottom: "16px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    boxSizing: "border-box",
    fontSize: "15px",
  },
  buttonContainer: {
    display: "flex",
    gap: "10px",
    marginTop: "8px",
  },
  submitButton: {
    padding: "12px 24px",
    background: "#FF9900",
    color: "#232f3e",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: "600",
  },
  errorText: {
    color: "#c00",
    fontWeight: "600",
    margin: "0 0 12px",
  },
};

export default ConnectAws;
