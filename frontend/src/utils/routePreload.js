export const loadAuthPage = () => import("../pages/AuthPage");
export const loadLoginPage = () => import("../pages/Login");
export const loadForgotPasswordPage = () => import("../pages/ForgotPassword");
export const loadResetPasswordPage = () => import("../pages/ResetPassword");
export const loadRegisterAdminPage = () => import("../pages/RegisterAdmin");
export const loadAdminLoginPage = () => import("../pages/AdminLoginPage");
export const loadServiceListingPage = () => import("../pages/ServiceListing");
export const loadServiceDetailsPage = () => import("../pages/ServiceDetails");
export const loadBookingPage = () => import("../pages/BookingPage");
export const loadReviewPage = () => import("../pages/ReviewPage");
export const loadProviderDashboardPage = () => import("../pages/ProviderDashboard");
export const loadAdminDashboardPage = () => import("../pages/AdminDashboard");
export const loadUserDashboardPage = () => import("../pages/UserDashboard");
export const loadUserBookingsPage = () => import("../pages/UserBookings");
export const loadMessagesLayout = () => import("../components/MessagesLayout");

export const preloadServiceDetailsRoute = (serviceId) =>
  loadServiceDetailsPage().catch(() => null);

export const preloadServiceListingRoute = () =>
  loadServiceListingPage().catch(() => null);

export const preloadBookingRoute = (serviceId) =>
  loadBookingPage().catch(() => null);

export const preloadCommonRoutes = () =>
  Promise.allSettled([
    loadServiceListingPage().catch(() => null),
    loadServiceDetailsPage().catch(() => null),
    loadBookingPage().catch(() => null),
    loadUserDashboardPage().catch(() => null),
    loadUserBookingsPage().catch(() => null),
    loadMessagesLayout().catch(() => null),
  ]);
