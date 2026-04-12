import { useContext } from "react";
import { useLocation } from "react-router-dom";
import DashboardLayout from "./DashboardLayout";
import MessagesPage from "../pages/MessagesPage";
import { AuthContext } from "../context/AuthContext";

export default function MessagesLayout() {
  const { user, authReady } = useContext(AuthContext);
  const location = useLocation();
  const stateRole = String(location.state?.fromRole || "").toLowerCase();
  const userRole = String(user?.role || "").toLowerCase();
  const role = stateRole || userRole;

  if (!authReady || !role) {
    return <div style={{ padding: "2rem", textAlign: "center" }}>Loading messages...</div>;
  }

  return (
    <DashboardLayout role={role}>
      <MessagesPage />
    </DashboardLayout>
  );
}
