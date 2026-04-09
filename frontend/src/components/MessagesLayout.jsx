import { useContext } from "react";
import DashboardLayout from "./DashboardLayout";
import MessagesPage from "../pages/MessagesPage";
import { AuthContext } from "../context/AuthContext";

export default function MessagesLayout() {
  const { user } = useContext(AuthContext);
  const role = String(user?.role || "").toLowerCase() || "user";
  return (
    <DashboardLayout role={role}>
      <MessagesPage />
    </DashboardLayout>
  );
}
