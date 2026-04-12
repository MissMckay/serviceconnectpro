import { useState, useContext } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import AuthField from "../components/auth/AuthField";
import AuthInput from "../components/auth/AuthInput";
import AuthPasswordInput from "../components/auth/AuthPasswordInput";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const user = await login({ email: email.trim(), password });
      const role = String(user?.role || "").toLowerCase();
      if (role !== "admin") {
        sessionStorage.removeItem("token");
        sessionStorage.removeItem("user");
        sessionStorage.removeItem("role");
        setError("Only administrators can sign in here. Use the regular Login for other accounts.");
        setSubmitting(false);
        return;
      }
      navigate("/admin", { replace: true });
    } catch (err) {
      setError(err?.message || "Login failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-admin-page">
      <div className="auth-admin-layout">
        <div className="auth-admin-hero">
          <div className="auth-admin-hero__badge" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Administrator
          </div>
          <h1 className="auth-admin-hero__title">ServiceConnect Admin</h1>
          <p className="auth-admin-hero__text">Sign in to manage users, services, and bookings from one secure dashboard.</p>
          <div className="auth-admin-hero__visual" aria-hidden="true">
            <div className="auth-admin-hero__shape auth-admin-hero__shape--1" />
            <div className="auth-admin-hero__shape auth-admin-hero__shape--2" />
            <div className="auth-admin-hero__shape auth-admin-hero__shape--3" />
          </div>
        </div>
        <div className="auth-admin-form-panel">
          <div className="auth-admin-card">
            <h2 className="auth-heading">Sign in</h2>
            <p className="auth-subheading">Enter your admin email and password to continue.</p>
            <form className="auth-form" onSubmit={handleSubmit}>
              <AuthField id="admin-login-email" label="Email">
                <AuthInput
                  id="admin-login-email"
                  type="email"
                  placeholder="admin@yourdomain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </AuthField>
              <AuthField id="admin-login-password" label="Password">
                <AuthPasswordInput
                  id="admin-login-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  ariaLabel="Show password"
                />
              </AuthField>
              <button type="submit" className="auth-btn auth-btn--primary" disabled={submitting}>
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
            <div className="auth-footer">
              <p className="auth-footer__text">Need an admin account?</p>
              <Link to="/register-admin" className="auth-footer__link">Register as admin</Link>
            </div>
            {error && <p className="auth-error" role="alert">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
