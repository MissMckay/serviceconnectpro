import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ children, allowedRole }) => {
  const token = localStorage.getItem("token");
  const role = String(localStorage.getItem("role") || "").toLowerCase();
  const normalizedAllowedRole = allowedRole
    ? String(allowedRole).toLowerCase()
    : null;

  if (!token) {
    return <Navigate to="/login" />;
  }

  if (normalizedAllowedRole && role !== normalizedAllowedRole) {
    return <Navigate to="/" />;
  }

  return children;
};

export default ProtectedRoute;
