import { useContext, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

const ResetPassword = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { completePasswordReset } = useContext(AuthContext);
  const token = useMemo(() => new URLSearchParams(location.search).get("token") || "", [location.search]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!token) {
      setError("This reset link is invalid. Please request a new one.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await completePasswordReset({ token, password });
      setSuccess(result?.message || "Password reset successful.");
      setPassword("");
      setConfirmPassword("");
      window.setTimeout(() => navigate("/login", { replace: true }), 1200);
    } catch (err) {
      setError(err?.message || "Unable to reset password right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="forgot-page">
      <div className="forgot-card">
        <h2 className="forgot-title">Reset Password</h2>
        <form className="forgot-form" onSubmit={handleSubmit}>
          <label htmlFor="reset-password" className="login-label">New Password</label>
          <div className="input-with-icon">
            <input
              id="reset-password"
              type="password"
              value={password}
              placeholder="Enter new password"
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
            />
          </div>

          <label htmlFor="reset-password-confirm" className="login-label">Confirm Password</label>
          <div className="input-with-icon">
            <input
              id="reset-password-confirm"
              type="password"
              value={confirmPassword}
              placeholder="Confirm new password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={6}
            />
          </div>

          <button type="submit" className="login-submit-btn" disabled={isSubmitting}>
            {isSubmitting ? "Resetting..." : "Reset Password"}
          </button>
        </form>

        <p className="register-login-link">
          Back to <Link to="/login">Login</Link>
        </p>
        {success && <p className="forgot-success">{success}</p>}
        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
};

export default ResetPassword;
