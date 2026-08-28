import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import Logo from "./components/Logo";
import Dashboard from "./pages/Dashboard";
import RuleEditor from "./pages/RuleEditor";
import Rules from "./pages/Rules";
import Settings from "./pages/Settings";

const DashboardIcon = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
    <rect x="11" y="2.5" width="6.5" height="9.5" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
    <rect x="2.5" y="11.5" width="6.5" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
    <rect x="11" y="14.5" width="6.5" height="3" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

const RulesIcon = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <path d="M3 5.5h14M3 10h10M3 14.5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="17" cy="14.5" r="1.6" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

const SettingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="M10 2.8v1.6M10 15.6v1.6M17.2 10h-1.6M4.4 10H2.8M15.1 4.9l-1.1 1.1M6 14l-1.1 1.1M15.1 15.1 14 14M6 6 4.9 4.9"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

export default function App() {
  const location = useLocation();

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <Logo />
        </div>
        <div className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            <DashboardIcon />
            Dashboard
          </NavLink>
          <NavLink to="/rules" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            <RulesIcon />
            Sync Rules
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            <SettingsIcon />
            Settings
          </NavLink>
        </div>
      </nav>
      <main>
        <div key={location.pathname} className="page-enter">
          <Routes location={location}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/rules" element={<Rules />} />
            <Route path="/rules/new" element={<RuleEditor />} />
            <Route path="/rules/:id" element={<RuleEditor />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
