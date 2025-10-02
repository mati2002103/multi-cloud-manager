import React, { useEffect, useState } from "react";

const Accounts = () => {
  const [accounts, setAccounts] = useState([]);

  const refresh = () => {
    fetch("/api/accounts")
      .then((res) => res.json())
      .then((data) => setAccounts(data))
      .catch((err) => console.error("Błąd pobierania kont:", err));
  };

  useEffect(() => {
    refresh();
  }, []);

  const addAzureAccount = () => {
  // Otwórz “twarde” wylogowanie w nowym oknie (czyści sesję AAD)
  window.open("/api/aad-signout", "_self"); // lub "_blank" jeśli preferujesz nową kartę
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>Konta</h1>

      <div style={{ marginBottom: 12 }}>
        <button onClick={addAzureAccount}>Dodaj konto (Azure)</button>
      </div>

      {accounts.length === 0 ? (
        <p>Brak zalogowanych kont</p>
      ) : (
        <ul>
          {accounts.map((acc, idx) => (
            <li key={idx}>
              <strong>{acc.displayName || acc.name || acc.preferred_username}</strong>{" "}
              {acc.provider ? ` [${acc.provider}]` : ""}{" "}
              {acc.tenantId ? `(tenant: ${acc.tenantId})` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Accounts;
