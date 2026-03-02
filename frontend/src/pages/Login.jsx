import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../services/api";

const decodeJwtPayload = (token) => {
  if (!token || typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(payload);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
};

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const res = await API.post("/auth/login", {
        email,
        password,
      });

      const token = res.data.token;
      if (!token) {
        throw new Error("Login response missing token");
      }

      const decoded = decodeJwtPayload(token);
      const role =
        res.data.user?.role ||
        decoded?.role ||
        decoded?.user?.role ||
        "user";
      const normalizedRole = String(role).toLowerCase();

      localStorage.setItem("token", token);
      localStorage.setItem("role", normalizedRole);
      if (res.data.user) {
        localStorage.setItem("user", JSON.stringify(res.data.user));
      }

      alert("Login Successful!");

      const defaultRoute = "/user";
      if (normalizedRole === "admin") {
        navigate("/admin", { replace: true });
      } else if (normalizedRole === "provider") {
        navigate("/provider", { replace: true });
      } else {
        navigate(defaultRoute, { replace: true });
      }
    } catch (err) {
      console.log("Login error:", err.response?.data || err.message || err);
      setError(err.response?.data?.message || "Login failed. Please check your email and password.");
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h2 className="login-title">Login</h2>

        <form onSubmit={handleLogin} className="login-form">
          <label htmlFor="login-email" className="login-label">Email</label>
          <div className="input-with-icon">
            <input
              id="login-email"
              type="email"
              placeholder="Enter your email"
              value={email}
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

          <label htmlFor="login-password" className="login-label">Password</label>
          <div className="input-with-icon">
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="input-icon-button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg viewBox="0 0 24 24" width="18" height="18">
                  <path
                    d="M3 3l18 18M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-4.4M9.9 5.1A10.7 10.7 0 0 1 12 5c5 0 9 4 10 7-0.4 1.2-1.2 2.5-2.3 3.6M6.2 6.2C4.2 7.6 2.8 9.6 2 12c1 3 5 7 10 7 1.6 0 3-.4 4.3-1"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18">
                  <path
                    d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </div>

          <button type="submit" className="login-submit-btn">Login</button>
        </form>

        <Link to="/forgot-password" className="forgot-link">Forgot Password?</Link>
        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
};

export default Login;
