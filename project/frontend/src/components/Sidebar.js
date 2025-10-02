import React from "react";
import { Link, useLocation } from "react-router-dom";

const Sidebar = ({ onLogout }) => {
  const location = useLocation();

  const menuItems = [
    { name: "Dashboard", path: "/dashboard" },
    { name: "Maszyny Wirtualne", path: "/virtual-machines" },
    { name: "Kontenery", path: "/containers" },
    { name: "Subskrypcje", path: "/subscriptions" },
    { name: "Użytkownicy", path: "/Accounts" },
  ];

  return (
    <div style={styles.sidebar}>
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
      <button style={styles.logoutBtn} onClick={onLogout}>
        Wyloguj
      </button>
    </div>
  );
};

const styles = {

  sidebar: {
    width: "220px",
    height: "100vh",
    backgroundColor: "#1a202c",
    color: "#fff",
    padding: "5px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  logo: { textAlign: "center", marginBottom: "20px" },
  menu: { listStyle: "none", padding: 0 },
  menuItem: {
    marginBottom: "10px",
    padding: "10px",
    borderRadius: "5px",
  },
  link: { color: "#fff", textDecoration: "none" },
  logoutBtn: {
    marginTop: "auto",
    padding: "10px",
    backgroundColor: "#e53e3e",
    border: "none",
    color: "#fff",
    cursor: "pointer",
    borderRadius: "5px",
    marginBottom: "20px"
  },
};

export default Sidebar;