import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import VirtualMachines from "./pages/VirtualMachines";
import Containers from "./pages/Containers";
import Subscriptions from "./pages/Subscriptions";
import Accounts from "./pages/Accounts";
import Networks from "./pages/Networks";
import VMMonitor from "./pages/VmMonitor";
import StorageBlobContainers from "./pages/StorageBlobContainers";
import Storage from "./pages/Storage";

import Home from "./pages/Home"; // 🔥 Landing Page

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch("/api/user")
      .then((res) => res.json())
      .then((data) => setUser(data))
      .catch((err) => console.error(err));
  }, []);

  if (!user) return <p>Ładowanie...</p>;

  const handleLogout = () => {
    fetch("/api/logout").then(() => window.location.reload());
  };

  return (
    <Router>
      <Routes>
        {/* Landing Page bez Sidebara */}
        <Route path="/" element={<Home user={user} />} />

        {/* Chronione trasy z Sidebar */}
        {user.logged_in ? (
          <Route
            path="/*"
            element={
              <div style={{ display: "flex" }}>
                <Sidebar onLogout={handleLogout} />
                <div style={{ flex: 1, backgroundColor: "#f7fafc" }}>
                  <Routes>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/virtual-machines" element={<VirtualMachines />} />
                    <Route path="/containers" element={<Containers />} />
                    <Route path="/networks" element={<Networks />} />
                    <Route path="/subscriptions" element={<Subscriptions />} />
                    <Route path="/accounts" element={<Accounts />} />
                    <Route path="/vm/:vmId/monitoring" element={<VMMonitor />} />
                    <Route path="/Storage" element={<Storage />} />
                    <Route path="/storage/:name" element={<StorageBlobContainers />} />
                    <Route path="*" element={<Navigate to="/dashboard" />} />
                  </Routes>
                </div>
              </div>
            }
          />
        ) : (
          <Route path="/*" element={<Navigate to="/" />} />
        )}
      </Routes>
    </Router>
  );
}

export default App;
