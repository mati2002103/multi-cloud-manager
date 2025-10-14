import React, { useEffect, useState } from "react";

const Subscriptions = () => {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [proj, setProj] = useState([]);

   useEffect(() => {
        const fetchAllData = async () => {
            try {
                const [subsRes, projRes] = await Promise.all([
                    fetch("/api/subscriptions"),
                    fetch("/api/account/google/projects") // POPRAWIONY URL
                ]);

                const subsData = await subsRes.json();
                const projData = await projRes.json();

                setSubs(subsData.value || []);
                setProj(projData.value || []);

            } catch (error) {
                console.error("Błąd podczas pobierania danych chmurowych:", error);
                setSubs([]);
                setProj([]);
            } finally {
                setLoading(false);
            }
        };

        fetchAllData();
    }, []);

  if (loading) return <p>Ładowanie subskrypcji...</p>;

  return (
    <>
     <div style={{ padding: "20px" }}>
      <h1>Subskrypcje(Azure)</h1>
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
      <div style={{ padding: "20px" }}>
      <h1>Projekty(GCP)</h1>
      {proj.length === 0 ? (
        <p>Brak dostępnych Projektów</p>
      ) : (
        <ul>
          {proj.map((proj) => (
            <li key={proj.projectId}>
              <strong>{proj.displayName}</strong> (ID: {proj.projectId})
            </li>
          ))}
        </ul>
      )}
    </div>
    </>
  );
};

export default Subscriptions;
