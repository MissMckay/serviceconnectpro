import { Link, useLocation, useNavigate } from "react-router-dom";

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem("token");
  const role = String(localStorage.getItem("role") || "").toLowerCase();
  const showServicesLink = !token || role !== "user";

  if (location.pathname.startsWith("/review/")) {
    return null;
  }

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  return (
    <nav className="app-navbar">
      <Link to="/" className="brand-link">ServiceConnect</Link>

      <div className="app-navbar-right">
        {showServicesLink && <Link to="/services" className="nav-link-btn">Services</Link>}

        {!token && (
          <>
            <Link to="/login" className="nav-link-btn">Login</Link>
            <Link to="/register" className="nav-link-btn">Register</Link>
          </>
        )}

        {token && role === "provider" && (
          <Link to="/provider" className="nav-link-btn">Provider Dashboard</Link>
        )}

        {token && role === "admin" && (
          <Link to="/admin" className="nav-link-btn">Admin Dashboard</Link>
        )}

        {token && <button onClick={handleLogout}>Logout</button>}
      </div>
    </nav>
  );
};

export default Navbar;
