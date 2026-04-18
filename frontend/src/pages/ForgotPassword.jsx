import { useState, useContext } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

const ForgotPassword = () => {
  const { resetPassword } = useContext(AuthContext);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [resetUrl, setResetUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setResetUrl("");
    setIsSubmitting(true);

    try {
      const result = await resetPassword(email.trim());
      setSuccess(result?.message || "If this email exists, a password reset link has been sent.");
      setResetUrl(result?.resetUrl || "");
    } catch (err) {
      setError(
        err?.message ||
        "Unable to send reset email right now. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="forgot-page">
      <div className="forgot-card">
        <h2 className="forgot-title">Forgot Password</h2>
        <form className="forgot-form" onSubmit={handleSubmit}>
          <label htmlFor="forgot-email" className="login-label">Email</label>
          <div className="input-with-icon">
            <input
              id="forgot-email"
              type="email"
              value={email}
              placeholder="Enter your account email"
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <span className="input-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path
                  d="M3 6h18v12H3z M3 7l9 6 9-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </div>

          <button type="submit" className="login-submit-btn" disabled={isSubmitting}>
            {isSubmitting ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        <p className="register-login-link">
          Back to <Link to="/login">Login</Link>
        </p>
        {success && <p className="forgot-success">{success}</p>}
        {resetUrl && (
          <p className="forgot-success">
            Reset link: <a href={resetUrl}>{resetUrl}</a>
          </p>
        )}
        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
};

export default ForgotPassword;
