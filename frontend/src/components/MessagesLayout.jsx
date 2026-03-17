import DashboardLayout from "./DashboardLayout";
import MessagesPage from "../pages/MessagesPage";

export default function MessagesLayout() {
  const role = sessionStorage.getItem("role") || "user";
  return (
    <DashboardLayout role={role}>
      <MessagesPage />
    </DashboardLayout>
  );
}
