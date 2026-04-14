import { useState, useEffect, useRef, useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

const getInitials = (name) => {
  const n = String(name || "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
  return n.slice(0, 2).toUpperCase();
};

const getSettingsPath = (role) => {
  const r = String(role || "").toLowerCase();
  if (r === "provider") return "/provider?view=settings";
  if (r === "user") return "/user?view=profile";
  if (r === "admin") return "";
  return "/";
};

const getServicesPath = (role) => {
  const r = String(role || "").toLowerCase();
  if (r === "provider") return "/provider?view=manage";
  if (r === "admin") return "/admin?view=services";
  if (r === "user") return "/services";
  return "/services";
};

const getDashboardPath = (role) => {
  const r = String(role || "").toLowerCase();
  if (r === "provider") return "/provider?view=dashboard";
  if (r === "user") return "/user";
  if (r === "admin") return "/admin?view=overview";
  return "/";
};

const getLogoutPath = (role) => {
  const r = String(role || "").toLowerCase();
  if (r === "admin") return "/admin-login";
  return "/login";
};

export default function TopbarUserMenu({ variant = "default", className = "" }) {
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  const role = user ? String(user.role || "").toLowerCase() : "";
  const profilePhoto = user?.profilePhoto;
  const name = user?.name || user?.email || "User";
  const initials = getInitials(name);
  const settingsPath = getSettingsPath(role);
  const servicesPath = getServicesPath(role);
  const dashboardPath = getDashboardPath(role);
  const logoutPath = getLogoutPath(role);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate(logoutPath, { replace: true });
  };

  const isProtected = variant === "protected";

  if (!user) return null;

  return (
    <div className={`topbar-user-menu ${isProtected ? "topbar-user-menu-protected" : ""} ${className}`} ref={menuRef}>
      <button
        type="button"
        className="topbar-user-menu-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Account menu"
      >
        <span className="topbar-user-menu-avatar">
          {profilePhoto ? (
            <img src={profilePhoto} alt="" />
          ) : (
            <span className="topbar-user-menu-initials">{initials}</span>
          )}
        </span>
        <span className="topbar-user-menu-chevron" aria-hidden>▼</span>
      </button>

      {open && (
        <div className="topbar-user-menu-dropdown" role="menu">
          <div className="topbar-user-menu-head">
            <span className="topbar-user-menu-name">{name}</span>
            <span className="topbar-user-menu-role">{role || "User"}</span>
          </div>
          {dashboardPath && (
            <Link
              to={dashboardPath}
              className="topbar-user-menu-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              Dashboard
            </Link>
          )}
          {servicesPath && (
            <Link
              to={servicesPath}
              className="topbar-user-menu-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              Services
            </Link>
          )}
          {settingsPath && (
            <Link
              to={settingsPath}
              className="topbar-user-menu-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              Settings
            </Link>
          )}
          <button
            type="button"
            className="topbar-user-menu-item topbar-user-menu-item-logout"
            role="menuitem"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
