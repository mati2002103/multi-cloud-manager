import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import VirtualMachines from "./pages/VirtualMachines";
import Containers from "./pages/Containers";
import Subscriptions from "./pages/Subscriptions";
import Accounts from "./pages/Accounts";
import Networks from "./pages/Networks";
import VMMonitor from "./pages/VmMonitor";
import VMGCPMonitor from "./pages/VMGCPMonitor";
import VMEC2Monitor from "./pages/VMEC2Monitor";

import ContainerMonitor from "./pages/ContainerMonitor";
import GCPContainerMonitor from "./pages/ContainerGCPMonitor";
import ContainerAWSMonitor from "./pages/ContainerAWSMonitor";

import StorageBlobContainers from "./pages/StorageBlobContainers";
import Storage from "./pages/Storage";
import GCPBucketContents from "./pages/GCPBucketContents";
import AWSS3BucketContents from "./pages/AWSS3BucketContents";

import ConnectAws from "./pages/ConnectAWS";
import Home from "./pages/Home";

function LoggedOutRoutes() {
  const location = useLocation();
  if (location.pathname === "/connect/aws") return <ConnectAws />;
  return <Navigate to="/" replace />;
}

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
        <Route path="/" element={<Home user={user} />} />
        <Route path="/connect/aws" element={<ConnectAws />} />

        {user.logged_in ? (
          <Route
            path="/*"
            element={
                <div style={{ display: "flex", minHeight: "100vh" }}>
                  <Sidebar onLogout={handleLogout} />
                <main className="app-main">
                  <Routes>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/virtual-machines" element={<VirtualMachines />} />
                    <Route path="/containers" element={<Containers />} />
                    <Route path="/networks" element={<Networks />} />
                    <Route path="/subscriptions" element={<Subscriptions />} />
                    <Route path="/accounts" element={<Accounts />} />
                    <Route path="/container/:containerId/monitoring" element={<ContainerMonitor />} />
                    <Route path="/vm/:vmId/monitoring" element={<VMMonitor />} />
                    <Route path="/vm/gcp/:vmName/monitoring" element={<VMGCPMonitor />} />
                    <Route path="/vm/aws/:instanceId/monitoring" element={<VMEC2Monitor />} />
                    <Route path="/container/gcp/:containerName/monitoring" element={<GCPContainerMonitor />} />
                    <Route path="/container/aws/:region/:clusterName/:serviceName/monitoring" element={<ContainerAWSMonitor />} />
                    <Route path="/storage" element={<Storage />} />
                    <Route path="/storage/:name" element={<StorageBlobContainers />} />
                    <Route path="/storage/gcp/:bucketName" element={<GCPBucketContents />} />
                    <Route path="/storage/aws/:bucketName" element={<AWSS3BucketContents />} />
                    <Route path="*" element={<Navigate to="/dashboard" />} />
                  </Routes>
                </main>
              </div> 
            }
          />
        ) : (
          <Route path="*" element={<LoggedOutRoutes />} />
        )}
      </Routes>
    </Router>
  );
}

export default App;
