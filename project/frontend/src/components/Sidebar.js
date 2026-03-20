import React from "react";
import { Link, useLocation } from "react-router-dom";

const Sidebar = ({ onLogout }) => {
  const location = useLocation();

  const menuItems = [
    { name: "Dashboard", path: "/dashboard" },
    { name: "Maszyny Wirtualne", path: "/virtual-machines" },
    { name: "Kontenery", path: "/containers" },
    { name: "Storage", path: "/storage" },
    { name: "Sieci", path: "/networks" },
    { name: "Subskrypcje", path: "/subscriptions" },
    { name: "Użytkownicy", path: "/accounts" },
  ];

  return (
    <aside style={styles.sidebar}>
      {/* Sekcja górna */}
      <div style={styles.topSection}>
        <h2 style={styles.logo}>Cloud Manager</h2>
        <ul style={styles.menu}>
          {menuItems.map((item) => (
            <li
              key={item.name}
              style={{
                ...styles.menuItem,
                backgroundColor:
                  location.pathname === item.path ? "#2d3748" : "transparent",
              }}
            >
              <Link to={item.path} style={styles.link}>
                {item.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Sekcja dolna */}
      <button style={styles.logoutBtn} onClick={onLogout}>
        Wyloguj
      </button>
    </aside>
  );
};

const styles = {
  sidebar: {
    width: "220px",
    backgroundColor: "#1a202c",
    color: "#fff",
    padding: "16px 10px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between", 
    height: "100vh",
  },

  topSection: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
  },

  logo: {
    textAlign: "center",
    margin: "0 auto 20px auto",
    fontSize: "18px",
    fontWeight: "bold",
  },

  menu: { listStyle: "none", padding: 0, margin: 0 },

  menuItem: {
    marginBottom: "10px",
    padding: "10px",
    borderRadius: "5px",
    width: "100%",
  },

  link: { color: "#fff", textDecoration: "none", display: "block" },

  logoutBtn: {
    padding: "10px",
    backgroundColor: "#e53e3e",
    border: "none",
    color: "#fff",
    cursor: "pointer",
    borderRadius: "5px",
    marginTop: "20px",
  },
};

export default Sidebar;
