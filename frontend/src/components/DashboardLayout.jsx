import { useContext } from "react";
import { Link, useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { canProviderCreateServices } from "../utils/providerAccess";
import TopbarUserMenu from "./TopbarUserMenu";

const navItemsByRole = {
  user: [
    { to: "/user", label: "Services" },
    { to: "/my-bookings", label: "My Bookings" },
    { to: "/messages", label: "Messages" }
  ],
  provider: [
    { to: "/provider?view=dashboard", label: "My Dashboard" },
    { to: "/provider?view=add", label: "Add Service" },
    { to: "/provider?view=manage", label: "Manage My Services" },
    { to: "/provider?view=bookings", label: "Booking Requests" },
    { to: "/messages", label: "Messages" },
    { to: "/provider?view=settings", label: "Settings" }
  ],
  admin: [
    { to: "/admin?view=overview", label: "Overview" },
    { to: "/admin?view=users", label: "Manage Users" },
    { to: "/admin?view=services", label: "Services" },
    { to: "/admin?view=reports", label: "View Reports" },
    { to: "/admin?view=create-admin", label: "Create admin" }
  ]
};

const DashboardLayout = ({ role, children }) => {
  const location = useLocation();
  const { user: contextUser } = useContext(AuthContext);
  const safeRole = String(role || "").toLowerCase();
  const storedUser = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  })();
  const providerUser = contextUser || storedUser;
  const navItems =
    safeRole === "provider" && !canProviderCreateServices(providerUser)
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
      if (to === "/messages") return currentPath === "/messages";
    }

    if (safeRole === "provider") {
      if (to === "/messages") return currentPath === "/messages";
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

  const dashboardTitle =
    safeRole === "admin"
      ? null
      : safeRole === "user"
        ? "User Dashboard"
        : null;

  return (
    <div className={`protected-layout role-${safeRole || "guest"}`}>
      <header className="protected-topbar">
        <Link to={safeRole === "user" ? "/user" : `/${safeRole}`} className="protected-brand-link">
          ServiceConnect
        </Link>

        {dashboardTitle && (
          <span className="provider-topbar-title">{dashboardTitle}</span>
        )}

        <div className="protected-topbar-right">
          <Link to="/services" className="protected-topbar-services-link">
            Services
          </Link>
          <TopbarUserMenu variant="protected" />
        </div>
      </header>

      <div className="protected-body">
        {showSidebar && (
          <aside className="protected-sidebar" aria-label="Sidebar navigation">
            <div className="protected-sidebar-title">
              {safeRole === "provider" ? "Menu" : "Dashboard Menu"}
            </div>
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
