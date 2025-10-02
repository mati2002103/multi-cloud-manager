import React, { useEffect, useState } from "react";

const Subscriptions = () => {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/subscriptions")
      .then((res) => res.json())
      .then((data) => {
        if (data.value) {
          setSubs(data.value);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Błąd pobierania subskrypcji:", err);
        setLoading(false);
      });
  }, []);

  if (loading) return <p>Ładowanie subskrypcji...</p>;

  return (
    <div style={{ padding: "20px" }}>
      <h1>Subskrypcje</h1>
      {subs.length === 0 ? (
        <p>Brak dostępnych subskrypcji</p>
      ) : (
        <ul>
          {subs.map((sub) => (
            <li key={sub.subscriptionId}>
              <strong>{sub.displayName}</strong> (ID: {sub.subscriptionId})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Subscriptions;
