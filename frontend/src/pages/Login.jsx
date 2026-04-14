import { useContext, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import AuthField from "../components/auth/AuthField";
import AuthInput from "../components/auth/AuthInput";
import AuthPasswordInput from "../components/auth/AuthPasswordInput";

const Login = () => {
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    localStorage.setItem("serviceconnect_hasVisited", "true");
    window.dispatchEvent(new CustomEvent("serviceconnect:nav-update"));
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const loggedInUser = await login({ email, password });
      const role = String(loggedInUser?.role || "user").toLowerCase();

      if (role === "admin") navigate("/admin", { replace: true });
      else if (role === "provider") navigate("/provider", { replace: true });
      else navigate("/user", { replace: true });
    } catch (err) {
      const code = err?.code || "";
      const message = err?.message || "";

      if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setError("Invalid email or password.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many attempts. Try again later.");
      } else {
        setError(message || "Login failed. Please check your email and password.");
      }
    }
  };

  return (
    <div className="auth-combined-page login-main-page">
      <div className="auth-combined-card">
        <div className="auth-combined-tabs">
          <button type="button" className="auth-tab auth-tab-active">
            Login
          </button>
          <button
            type="button"
            className="auth-tab"
            onClick={() => navigate("/register", { replace: true })}
          >
            Register
          </button>
        </div>

        <h2 className="auth-heading">Welcome back</h2>
        <p className="auth-subheading">Sign in to your account</p>

        <form onSubmit={handleLogin} className="auth-form">
          <AuthField id="login-email" label="Email">
            <AuthInput
              id="login-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              rightIcon={(
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path
                    d="M3 6h18v12H3z M3 7l9 6 9-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            />
          </AuthField>

          <AuthField id="login-password" label="Password">
            <AuthPasswordInput
              id="login-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              ariaLabel="Show password"
            />
          </AuthField>

          <button type="submit" className="auth-btn auth-btn--primary">Login</button>
          <Link to="/forgot-password" className="auth-link">Forgot password?</Link>
        </form>

        <div className="auth-footer login-main-footer">
          <p className="auth-footer__text">Don&apos;t have an account?</p>
          <button
            type="button"
            className="auth-footer__link"
            onClick={() => navigate("/register", { replace: true })}
          >
            Create account
          </button>
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}
      </div>
    </div>
  );
};

export default Login;
