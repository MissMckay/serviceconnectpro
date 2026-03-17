import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import "./design-system.css";
import "./App.css";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardLayout from "./components/DashboardLayout";

import AuthPage from "./pages/AuthPage";
import ForgotPassword from "./pages/ForgotPassword";
import RegisterAdmin from "./pages/RegisterAdmin";
import AdminLoginPage from "./pages/AdminLoginPage";
import ServiceListing from "./pages/ServiceListing";
import ServiceDetails from "./pages/ServiceDetails";
import BookingPage from "./pages/BookingPage";
import ReviewPage from "./pages/ReviewPage";
import ProviderDashboard from "./pages/ProviderDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import UserDashboard from "./pages/UserDashboard";
import UserBookings from "./pages/UserBookings";
import MessagesLayout from "./components/MessagesLayout";
const AppRoutes = () => {
  const location = useLocation();
  const hideNavbar =
    /^\/book\/[^/]+$/.test(location.pathname) ||
    /^\/review\/[^/]+$/.test(location.pathname) ||
    location.pathname === "/provider" ||
    location.pathname === "/admin" ||
    location.pathname === "/admin-login" ||
    location.pathname === "/admin/login" ||
    location.pathname === "/register-admin" ||
    location.pathname === "/user" ||
    location.pathname === "/my-bookings" ||
    location.pathname === "/messages";

  return (
    <>
      {!hideNavbar && <Navbar />}
      <Routes>

        {/* Public Routes */}
        <Route path="/" element={<ServiceListing />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage />} />
        <Route path="/register-admin" element={<RegisterAdmin />} />
        <Route path="/admin-login" element={<AdminLoginPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/services" element={<ServiceListing />} />
        <Route path="/services/:id" element={<ServiceDetails />} />

        {/* Protected Routes (Any Logged-in User) */}
        <Route
          path="/book/:id"
          element={
            <ProtectedRoute allowedRole="user">
              <DashboardLayout role="user">
                <BookingPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/review/:id"
          element={
            <ProtectedRoute allowedRole="user">
              <DashboardLayout role="user">
                <ReviewPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />

        {/* Provider Only */}
        <Route
          path="/provider"
          element={
            <ProtectedRoute allowedRole="provider">
              <DashboardLayout role="provider">
                <ProviderDashboard />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />

        {/* Admin Only */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRole="admin">
              <DashboardLayout role="admin">
                <AdminDashboard />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />

          <Route
              path="/user"
              element={
                  <ProtectedRoute allowedRole="user">
                      <DashboardLayout role="user">
                        <UserDashboard/>
                      </DashboardLayout>
                  </ProtectedRoute>
              }
          />

          <Route
              path="/my-bookings"
              element={
                  <ProtectedRoute allowedRole="user">
                      <DashboardLayout role="user">
                        <UserBookings />
                      </DashboardLayout>
                  </ProtectedRoute>
              }
          />
          <Route
            path="/messages"
            element={
              <ProtectedRoute allowedRole={["user", "provider"]}>
                <MessagesLayout />
              </ProtectedRoute>
            }
          />
          <Route path="/auth" element={<AuthPage />} />
      </Routes>
    </>
  );
};

function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}

export default App;
