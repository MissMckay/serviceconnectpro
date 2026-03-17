import { useState, useContext } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import AuthField from "../components/auth/AuthField";
import AuthInput from "../components/auth/AuthInput";
import AuthPasswordInput from "../components/auth/AuthPasswordInput";

export default function RegisterAdmin() {
  const navigate = useNavigate();
  const { registerAdmin } = useContext(AuthContext);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");
    if (form.password !== form.confirmPassword) {
      setSubmitError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await registerAdmin({
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
      });
      setSuccess(true);
      setTimeout(() => navigate("/admin", { replace: true }), 1000);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Registration failed. Please try again.";
      setSubmitError(msg);
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
          <h1 className="auth-admin-hero__title">Create admin account</h1>
          <p className="auth-admin-hero__text">Register a new administrator to manage ServiceConnect. You’ll sign in after registration.</p>
          <div className="auth-admin-hero__visual" aria-hidden="true">
            <div className="auth-admin-hero__shape auth-admin-hero__shape--1" />
            <div className="auth-admin-hero__shape auth-admin-hero__shape--2" />
            <div className="auth-admin-hero__shape auth-admin-hero__shape--3" />
          </div>
        </div>
        <div className="auth-admin-form-panel">
          <div className="auth-admin-card">
            <h2 className="auth-heading">Register</h2>
            <p className="auth-subheading">Fill in your details to create an admin account.</p>
            {success && (
              <div className="auth-success" role="status" aria-live="polite">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Account created. Redirecting to sign in…
              </div>
            )}
            <form className="auth-form" onSubmit={handleSubmit} aria-hidden={success}>
              <AuthField id="admin-reg-name" label="Full name">
                <AuthInput
                  id="admin-reg-name"
                  type="text"
                  placeholder="Your full name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  autoComplete="name"
                />
              </AuthField>
              <AuthField id="admin-reg-email" label="Email">
                <AuthInput
                  id="admin-reg-email"
                  type="email"
                  placeholder="admin@yourdomain.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  autoComplete="email"
                />
              </AuthField>
              <AuthField id="admin-reg-phone" label="Phone">
                <AuthInput
                  id="admin-reg-phone"
                  type="tel"
                  placeholder="+231 00 000 0000"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  required
                  autoComplete="tel"
                />
              </AuthField>
              <AuthField id="admin-reg-password" label="Password">
                <AuthPasswordInput
                  id="admin-reg-password"
                  placeholder="Min 6 characters"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  autoComplete="new-password"
                  ariaLabel="Show password"
                />
              </AuthField>
              <AuthField id="admin-reg-confirm" label="Confirm password">
                <AuthPasswordInput
                  id="admin-reg-confirm"
                  placeholder="Confirm password"
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  required
                  autoComplete="new-password"
                  ariaLabel="Show confirm password"
                />
              </AuthField>
              <button type="submit" className="auth-btn auth-btn--primary" disabled={submitting}>
                {submitting ? "Creating…" : "Create account"}
              </button>
            </form>
            <div className="auth-footer">
              <p className="auth-footer__text">Already have an account?</p>
              <Link to="/admin-login" className="auth-footer__link">Sign in</Link>
            </div>
            {submitError && !success && <p className="auth-error" role="alert">{submitError}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
