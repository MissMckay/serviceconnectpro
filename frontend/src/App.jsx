import { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import "./design-system.css";
import "./App.css";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardLayout from "./components/DashboardLayout";
import {
  loadAdminDashboardPage,
  loadAdminLoginPage,
  loadAuthPage,
  loadBookingPage,
  loadForgotPasswordPage,
  loadLoginPage,
  loadMessagesLayout,
  loadProviderDashboardPage,
  loadRegisterAdminPage,
  loadReviewPage,
  loadServiceDetailsPage,
  loadServiceListingPage,
  loadUserBookingsPage,
  loadUserDashboardPage,
} from "./utils/routePreload";

const AuthPage = lazy(loadAuthPage);
const Login = lazy(loadLoginPage);
const ForgotPassword = lazy(loadForgotPasswordPage);
const RegisterAdmin = lazy(loadRegisterAdminPage);
const AdminLoginPage = lazy(loadAdminLoginPage);
const ServiceListing = lazy(loadServiceListingPage);
const ServiceDetails = lazy(loadServiceDetailsPage);
const BookingPage = lazy(loadBookingPage);
const ReviewPage = lazy(loadReviewPage);
const ProviderDashboard = lazy(loadProviderDashboardPage);
const AdminDashboard = lazy(loadAdminDashboardPage);
const UserDashboard = lazy(loadUserDashboardPage);
const UserBookings = lazy(loadUserBookingsPage);
const MessagesLayout = lazy(loadMessagesLayout);

const RouteFallback = () => (
  <div className="route-loading-shell" role="status" aria-live="polite">
    <div className="route-loading-card">
      <div className="route-loading-spinner" />
      <p>Loading content...</p>
    </div>
  </div>
);

const withSuspense = (element) => (
  <Suspense fallback={<RouteFallback />}>
    {element}
  </Suspense>
);

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
        <Route path="/" element={withSuspense(<ServiceListing />)} />
        <Route path="/login" element={withSuspense(<Login />)} />
        <Route path="/register" element={withSuspense(<AuthPage />)} />
        <Route path="/register-admin" element={withSuspense(<RegisterAdmin />)} />
        <Route path="/admin-login" element={withSuspense(<AdminLoginPage />)} />
        <Route path="/admin/login" element={withSuspense(<AdminLoginPage />)} />
        <Route path="/forgot-password" element={withSuspense(<ForgotPassword />)} />
        <Route path="/services" element={withSuspense(<ServiceListing />)} />
        <Route path="/services/:id" element={withSuspense(<ServiceDetails />)} />

        {/* Protected Routes (Any Logged-in User) */}
        <Route
          path="/book/:id"
          element={
            <ProtectedRoute allowedRole="user">
              <DashboardLayout role="user">
                <Suspense fallback={<RouteFallback />}>
                  <BookingPage />
                </Suspense>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/review/:id"
          element={
            <ProtectedRoute allowedRole="user">
              <DashboardLayout role="user">
                <Suspense fallback={<RouteFallback />}>
                  <ReviewPage />
                </Suspense>
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
                <Suspense fallback={<RouteFallback />}>
                  <ProviderDashboard />
                </Suspense>
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
                <Suspense fallback={<RouteFallback />}>
                  <AdminDashboard />
                </Suspense>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />

          <Route
              path="/user"
              element={
                  <ProtectedRoute allowedRole="user">
                      <DashboardLayout role="user">
                        <Suspense fallback={<RouteFallback />}>
                          <UserDashboard/>
                        </Suspense>
                      </DashboardLayout>
                  </ProtectedRoute>
              }
          />

          <Route
              path="/my-bookings"
              element={
                  <ProtectedRoute allowedRole="user">
                      <DashboardLayout role="user">
                        <Suspense fallback={<RouteFallback />}>
                          <UserBookings />
                        </Suspense>
                      </DashboardLayout>
                  </ProtectedRoute>
              }
          />
          <Route
            path="/messages"
            element={
              <ProtectedRoute allowedRole={["user", "provider"]}>
                <Suspense fallback={<RouteFallback />}>
                  <MessagesLayout />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route path="/auth" element={withSuspense(<AuthPage />)} />
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
