import React, { useEffect, useState } from "react";

const Accounts = () => {
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    fetch("/api/accounts")
      .then((res) => res.json())
      .then((data) => setAccounts(data))
      .catch((err) => console.error("Błąd pobierania kont:", err));
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h1>Konta</h1>
      {accounts.length === 0 ? (
        <p>Brak zalogowanych kont</p>
      ) : (
        <ul>
          {accounts.map((acc, idx) => (
            <li key={idx}>
              <strong>{acc.name}</strong> ({acc.preferred_username})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Accounts;
