import { useContext } from "react";
import { Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

const ProtectedRoute = ({ children, allowedRole }) => {
  const { user, authReady } = useContext(AuthContext);
  const role = user?.role ? String(user.role).toLowerCase() : "";
  const allowed = Array.isArray(allowedRole)
    ? allowedRole.map((r) => String(r).toLowerCase())
    : allowedRole
      ? [String(allowedRole).toLowerCase()]
      : null;

  if (!authReady) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>Loading…</div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (allowed && allowed.length && !allowed.includes(role)) {
    return <Navigate to="/" />;
  }

  return children;
};

export default ProtectedRoute;
