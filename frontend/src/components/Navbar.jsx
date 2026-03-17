import { useState, useEffect, useContext } from "react";
import { Link, useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import TopbarUserMenu from "./TopbarUserMenu";

const HAS_VISITED_KEY = "serviceconnect_hasVisited";

const Navbar = () => {
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [, setNavUpdate] = useState(0);
  const role = user ? String(user.role || "").toLowerCase() : "";
  const showServicesLink = !user || role !== "user";
  const hasVisitedBefore = localStorage.getItem(HAS_VISITED_KEY) === "true";

  useEffect(() => {
    const onNavUpdate = () => setNavUpdate((n) => n + 1);
    window.addEventListener("serviceconnect:nav-update", onNavUpdate);
    return () => window.removeEventListener("serviceconnect:nav-update", onNavUpdate);
  }, []);

  if (location.pathname.startsWith("/review/")) {
    return null;
  }

  return (
    <nav className="app-navbar">
      <Link to="/" className="brand-link">ServiceConnect</Link>

      <div className="app-navbar-right">
        {user && role === "user" && <Link to="/services" className="nav-link-btn">Services</Link>}
        {showServicesLink && role !== "user" && <Link to="/services" className="nav-link-btn">Services</Link>}

        {!user && (
          <>
            {hasVisitedBefore ? (
              <Link to="/login" className="nav-link-btn">Login</Link>
            ) : (
              <Link to="/register" className="nav-link-btn">Register</Link>
            )}
          </>
        )}

        {user && role === "provider" && (
          <Link to="/provider" className="nav-link-btn">Provider Dashboard</Link>
        )}

        {user && role === "admin" && (
          <Link to="/admin" className="nav-link-btn">Admin Dashboard</Link>
        )}

        {user && <TopbarUserMenu />}
      </div>
    </nav>
  );
};

export default Navbar;
