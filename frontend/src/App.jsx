import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import "./App.css";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardLayout from "./components/DashboardLayout";

import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ServiceListing from "./pages/ServiceListing";
import ServiceDetails from "./pages/ServiceDetails";
import BookingPage from "./pages/BookingPage";
import ReviewPage from "./pages/ReviewPage";
import ProviderDashboard from "./pages/ProviderDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import UserDashboard from "./pages/UserDashboard";
import UserBookings from "./pages/UserBookings";
import Auth from "./pages/Auth";
const AppRoutes = () => {
  const location = useLocation();
  const hideNavbar =
    /^\/book\/[^/]+$/.test(location.pathname) ||
    /^\/review\/[^/]+$/.test(location.pathname) ||
    location.pathname === "/provider" ||
    location.pathname === "/admin" ||
    location.pathname === "/user" ||
    location.pathname === "/my-bookings";

  return (
    <>
      {!hideNavbar && <Navbar />}
      <Routes>

        {/* Public Routes */}
        <Route path="/" element={<ServiceListing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
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
          <Route path="/auth" element={<Auth />} />
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
