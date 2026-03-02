import { Link, useLocation, useNavigate } from "react-router-dom";
import { canProviderCreateServices } from "../utils/providerAccess";

const navItemsByRole = {
  user: [
    { to: "/user", label: "Services" },
    { to: "/my-bookings", label: "My Bookings" },
    { to: "/user?view=profile", label: "Profile" }
  ],
  provider: [
    { to: "/provider?view=dashboard", label: "My Dashboard" },
    { to: "/provider?view=add", label: "Add Service" },
    { to: "/provider?view=manage", label: "Manage My Services" },
    { to: "/provider?view=bookings", label: "Booking Requests" }
  ],
  admin: [
    { to: "/admin?view=overview", label: "Overview" },
    { to: "/admin?view=users", label: "Manage Users" },
    { to: "/admin?view=services", label: "Services" },
    { to: "/admin?view=reports", label: "View Reports" }
  ]
};

const DashboardLayout = ({ role, children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const safeRole = String(role || "").toLowerCase();
  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  })();
  const navItems =
    safeRole === "provider" && !canProviderCreateServices(storedUser)
      ? navItemsByRole.provider.filter((item) => item.to !== "/provider?view=add")
      : navItemsByRole[safeRole] || [];
  const showSidebar = safeRole === "user" || safeRole === "provider" || safeRole === "admin";

  const isNavItemActive = (to) => {
    const currentPath = location.pathname;
    const currentView = new URLSearchParams(location.search).get("view");

    if (safeRole === "user") {
      if (to === "/user") {
        return currentPath === "/user" && (!currentView || currentView === "services");
      }
      if (to === "/my-bookings") {
        return currentPath === "/my-bookings" || (currentPath === "/user" && currentView === "bookings");
      }
      if (to === "/user?view=profile") {
        return currentPath === "/user" && currentView === "profile";
      }
    }

    if (safeRole === "provider") {
      const [targetPath, targetQuery = ""] = to.split("?");
      const targetView = new URLSearchParams(targetQuery).get("view") || "dashboard";
      const activeView = currentView || "dashboard";
      return currentPath === targetPath && activeView === targetView;
    }

    if (safeRole === "admin") {
      const [targetPath, targetQuery = ""] = to.split("?");
      const targetView = new URLSearchParams(targetQuery).get("view") || "overview";
      const activeView = currentView || "overview";
      return currentPath === targetPath && activeView === targetView;
    }

    return currentPath === to;
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("user");
    navigate("/login");
  };

  return (
    <div className={`protected-layout role-${safeRole || "guest"}`}>
      <header className="protected-topbar">
        <Link to={safeRole === "user" ? "/user" : `/${safeRole}`} className="protected-brand-link">
          ServiceConnect
        </Link>

        {safeRole === "provider" ? (
          <div className="protected-topbar-links provider-topbar-right" aria-label="Provider topbar actions">
            <span className="provider-topbar-title">Service Provider Dashboard</span>
            <button type="button" className="protected-logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        ) : safeRole === "admin" ? (
          <div className="protected-topbar-links provider-topbar-right" aria-label="Admin topbar actions">
            <span className="provider-topbar-title">Admin Dashboard</span>
            <button type="button" className="protected-logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        ) : safeRole === "user" ? (
          <div className="protected-topbar-links" aria-label="User topbar actions">
            <span className="provider-topbar-title">
              User Dashboard
            </span>
            <button type="button" className="protected-logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        ) : (
          <nav className="protected-topbar-links" aria-label="Top navigation">
            {navItems.map((item) => (
              <Link
                key={`top-${item.to}`}
                to={item.to}
                className={`protected-nav-link${isNavItemActive(item.to) ? " active" : ""}`}
              >
                {item.label}
              </Link>
            ))}
            <button type="button" className="protected-logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </nav>
        )}
      </header>

      <div className="protected-body">
        {showSidebar && (
          <aside className="protected-sidebar" aria-label="Sidebar navigation">
            {safeRole !== "provider" && <div className="protected-sidebar-title">Dashboard Menu</div>}
            <nav className="protected-sidebar-nav">
              {navItems.map((item) => (
                <Link
                  key={`side-${item.to}`}
                  to={item.to}
                  className={`protected-sidebar-link${isNavItemActive(item.to) ? " active" : ""}`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
        )}

        <main className="protected-content">{children}</main>
      </div>
    </div>
  );
};

export default DashboardLayout;
