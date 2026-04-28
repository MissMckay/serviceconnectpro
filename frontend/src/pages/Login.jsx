import { useContext, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import AuthField from "../components/auth/AuthField";
import AuthInput from "../components/auth/AuthInput";
import AuthPasswordInput from "../components/auth/AuthPasswordInput";

const Login = () => {
  const navigate = useNavigate();
  const { login, requestLoginOtp, verifyLoginOtp } = useContext(AuthContext);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loginMode, setLoginMode] = useState("password");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [otpHint, setOtpHint] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);

  useEffect(() => {
    localStorage.setItem("serviceconnect_hasVisited", "true");
    window.dispatchEvent(new CustomEvent("serviceconnect:nav-update"));
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      const loggedInUser = await login({ identifier, password, rememberMe });
      const role = String(loggedInUser?.role || "user").toLowerCase();

      if (role === "admin") navigate("/admin", { replace: true });
      else if (role === "provider") navigate("/provider", { replace: true });
      else navigate("/user", { replace: true });
    } catch (err) {
      const code = err?.code || "";
      const message = err?.message || "";

      if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setError("Invalid phone number, email, or password.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many attempts. Try again later.");
      } else {
        setError(message || "Login failed. Please check your phone number, email, and password.");
      }
    }
  };

  const handleSendCode = async () => {
    setError("");
    setSuccess("");
    setOtpHint("");

    if (!identifier.trim()) {
      setError("Enter your phone number or email first.");
      return;
    }

    setOtpSending(true);
    try {
      const result = await requestLoginOtp({ identifier });
      setSuccess(result?.message || "A login code has been generated.");
      if (result?.otpCode) {
        setOtpHint(`Your code for now is: ${result.otpCode}`);
      }
    } catch (err) {
      setError(err?.message || "Unable to send login code right now.");
    } finally {
      setOtpSending(false);
    }
  };

  const handleOtpLogin = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!identifier.trim()) {
      setError("Enter your phone number or email.");
      return;
    }

    if (!otpCode.trim()) {
      setError("Enter the code you received.");
      return;
    }

    setOtpVerifying(true);
    try {
      const loggedInUser = await verifyLoginOtp({ identifier, otp: otpCode, rememberMe });
      const role = String(loggedInUser?.role || "user").toLowerCase();
      if (role === "admin") navigate("/admin", { replace: true });
      else if (role === "provider") navigate("/provider", { replace: true });
      else navigate("/user", { replace: true });
    } catch (err) {
      setError(err?.message || "Login code is invalid or expired.");
    } finally {
      setOtpVerifying(false);
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
        <p className="auth-subheading">Sign in with your phone number or email</p>

        <div className="auth-mode-toggle" role="tablist" aria-label="Login methods">
          <button
            type="button"
            className={`auth-mode-toggle__btn ${loginMode === "password" ? "auth-mode-toggle__btn--active" : ""}`}
            onClick={() => {
              setLoginMode("password");
              setError("");
              setSuccess("");
            }}
          >
            Password
          </button>
          <button
            type="button"
            className={`auth-mode-toggle__btn ${loginMode === "otp" ? "auth-mode-toggle__btn--active" : ""}`}
            onClick={() => {
              setLoginMode("otp");
              setError("");
              setSuccess("");
            }}
          >
            Use Code
          </button>
        </div>

        <form onSubmit={loginMode === "password" ? handleLogin : handleOtpLogin} className="auth-form">
          <AuthField id="login-identifier" label="Phone Number or Email">
            <AuthInput
              id="login-identifier"
              type="text"
              placeholder="+231770000000 or you@example.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              autoComplete="username"
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

          {loginMode === "password" ? (
            <>
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
              <label className="auth-remember-row">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Keep me signed in</span>
              </label>
              <button type="submit" className="auth-btn auth-btn--primary">Login</button>
              <button
                type="button"
                className="auth-btn auth-btn--secondary"
                onClick={() => {
                  setLoginMode("otp");
                  setError("");
                  setSuccess("");
                }}
              >
                Send Me a Code Instead
              </button>
              <Link to="/forgot-password" className="auth-link">Forgot password?</Link>
            </>
          ) : (
            <>
              <AuthField id="login-otp" label="Login Code">
                <AuthInput
                  id="login-otp"
                  type="text"
                  placeholder="Enter 6-digit code"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  required
                  autoComplete="one-time-code"
                />
              </AuthField>
              <label className="auth-remember-row">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Keep me signed in</span>
              </label>
              <button type="button" className="auth-btn auth-btn--secondary" onClick={handleSendCode} disabled={otpSending}>
                {otpSending ? "Sending code..." : "Send Code"}
              </button>
              <button type="submit" className="auth-btn auth-btn--primary" disabled={otpVerifying}>
                {otpVerifying ? "Logging in..." : "Login with Code"}
              </button>
              {otpHint && <p className="auth-success">{otpHint}</p>}
            </>
          )}
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

        {success && <p className="auth-success" role="status">{success}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
      </div>
    </div>
  );
};

export default Login;
