import { useState, useEffect, useContext } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import AuthField from "../components/auth/AuthField";
import AuthInput from "../components/auth/AuthInput";
import AuthPasswordInput from "../components/auth/AuthPasswordInput";

const AuthPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { login, register: doRegister } = useContext(AuthContext);
  const isRegister = location.pathname === "/register";

  const [view, setView] = useState(isRegister ? "register" : "login");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [registerForm, setRegisterForm] = useState({
    name: "",
    email: "",
    phone: "",
    providerAddress: "",
    password: "",
    confirmPassword: "",
    role: "user"
  });
  const [registerError, setRegisterError] = useState("");

  useEffect(() => {
    setView(isRegister ? "register" : "login");
  }, [isRegister]);

  useEffect(() => {
    localStorage.setItem("serviceconnect_hasVisited", "true");
    window.dispatchEvent(new CustomEvent("serviceconnect:nav-update"));
  }, []);

  const switchToLogin = () => {
    setView("login");
    setLoginError("");
    navigate("/login", { replace: true });
  };

  const switchToRegister = () => {
    setView("register");
    setRegisterError("");
    navigate("/register", { replace: true });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError("");
    try {
      const loggedInUser = await login({ email: loginEmail, password: loginPassword });
      const role = String(loggedInUser?.role || "user").toLowerCase();
      if (role === "admin") navigate("/admin", { replace: true });
      else if (role === "provider") navigate("/provider", { replace: true });
      else navigate("/user", { replace: true });
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "";
      if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setLoginError("Invalid email or password.");
      } else if (code === "auth/too-many-requests") {
        setLoginError("Too many attempts. Try again later.");
      } else {
        setLoginError(msg || "Login failed. Please check your email and password.");
      }
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setRegisterError("");
    if (registerForm.password !== registerForm.confirmPassword) {
      setRegisterError("Passwords do not match.");
      return;
    }
    if (registerForm.role === "provider" && !registerForm.providerAddress.trim()) {
      setRegisterError("Provider address is required for service providers.");
      return;
    }
    try {
      const newUser = await doRegister({
        name: registerForm.name,
        email: registerForm.email,
        phone: registerForm.phone,
        password: registerForm.password,
        role: registerForm.role,
        providerAddress:
          registerForm.role === "provider" ? registerForm.providerAddress : "Not provided"
      });
      alert("Registered Successfully");
      const role = String(newUser?.role || registerForm.role || "user").toLowerCase();
      if (role === "admin") navigate("/admin", { replace: true });
      else if (role === "provider") navigate("/provider", { replace: true });
      else navigate("/user", { replace: true });
    } catch (err) {
      const code = err?.code || "";
      if (code === "auth/email-already-in-use") {
        setRegisterError("This email is already registered. Sign in instead.");
      } else if (code === "auth/weak-password") {
        setRegisterError("Password should be at least 6 characters.");
      } else {
        setRegisterError(err?.message || "Registration failed. Please try again.");
      }
    }
  };

  return (
    <div className="auth-combined-page">
      <div className="auth-combined-card">
        <div className="auth-combined-tabs">
          <button
            type="button"
            className={`auth-tab ${view === "login" ? "auth-tab-active" : ""}`}
            onClick={switchToLogin}
          >
            Login
          </button>
          <button
            type="button"
            className={`auth-tab ${view === "register" ? "auth-tab-active" : ""}`}
            onClick={switchToRegister}
          >
            Register
          </button>
        </div>

        {view === "login" && (
          <>
            <h2 className="auth-heading">Welcome back</h2>
            <p className="auth-subheading">Sign in to your account</p>
            <form onSubmit={handleLogin} className="auth-form">
              <AuthField id="auth-login-email" label="Email">
                <AuthInput
                  id="auth-login-email"
                  type="email"
                  placeholder="you@example.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  autoComplete="email"
                  rightIcon={
                    <svg viewBox="0 0 24 24" width="20" height="20">
                      <path d="M3 6h18v12H3z M3 7l9 6 9-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  }
                />
              </AuthField>
              <AuthField id="auth-login-password" label="Password">
                <AuthPasswordInput
                  id="auth-login-password"
                  placeholder="Enter your password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  ariaLabel="Show password"
                />
              </AuthField>
              <button type="submit" className="auth-btn auth-btn--primary">Sign in</button>
              <Link to="/forgot-password" className="auth-link">Forgot password?</Link>
            </form>
            <div className="auth-footer">
              <p className="auth-footer__text">Don&apos;t have an account?</p>
              <button type="button" className="auth-footer__link" onClick={switchToRegister}>Create account</button>
            </div>
            {loginError && <p className="auth-error" role="alert">{loginError}</p>}
          </>
        )}

        {view === "register" && (
          <>
            <h2 className="auth-heading">Create account</h2>
            <p className="auth-subheading">Join ServiceConnect in a few steps</p>
            <form className="auth-form" onSubmit={handleRegister}>
              <AuthField id="auth-reg-name" label="Full name">
                <AuthInput
                  id="auth-reg-name"
                  type="text"
                  placeholder="John Doe"
                  value={registerForm.name}
                  onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                  required
                  autoComplete="name"
                />
              </AuthField>
              <AuthField id="auth-reg-email" label="Email">
                <AuthInput
                  id="auth-reg-email"
                  type="email"
                  placeholder="you@example.com"
                  value={registerForm.email}
                  onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                  required
                  autoComplete="email"
                />
              </AuthField>
              <AuthField id="auth-reg-phone" label="Phone number">
                <AuthInput
                  id="auth-reg-phone"
                  type="tel"
                  placeholder="+231 00 000 0000"
                  value={registerForm.phone}
                  onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })}
                  required
                  autoComplete="tel"
                />
              </AuthField>

              <AuthField label="I am a">
                <div className="auth-role-select">
                  <label className={`auth-role-option ${registerForm.role === "user" ? "auth-role-option--active" : ""}`}>
                    <input
                      type="radio"
                      name="auth-role"
                      value="user"
                      checked={registerForm.role === "user"}
                      onChange={(e) => setRegisterForm({ ...registerForm, role: e.target.value })}
                    />
                    <span>User</span>
                  </label>
                  <label className={`auth-role-option ${registerForm.role === "provider" ? "auth-role-option--active" : ""}`}>
                    <input
                      type="radio"
                      name="auth-role"
                      value="provider"
                      checked={registerForm.role === "provider"}
                      onChange={(e) => setRegisterForm({ ...registerForm, role: e.target.value })}
                    />
                    <span>Service Provider</span>
                  </label>
                </div>
              </AuthField>

              {registerForm.role === "provider" && (
                <AuthField id="auth-reg-address" label="Service location / address">
                  <AuthInput
                    id="auth-reg-address"
                    type="text"
                    placeholder="Your business or service area"
                    value={registerForm.providerAddress}
                    onChange={(e) => setRegisterForm({ ...registerForm, providerAddress: e.target.value })}
                    required
                  />
                </AuthField>
              )}

              <AuthField id="auth-reg-password" label="Password">
                <AuthPasswordInput
                  id="auth-reg-password"
                  placeholder="Create a password (min 6 characters)"
                  value={registerForm.password}
                  onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                  required
                  autoComplete="new-password"
                  ariaLabel="Show password"
                />
              </AuthField>
              <AuthField id="auth-reg-confirm" label="Confirm password">
                <AuthPasswordInput
                  id="auth-reg-confirm"
                  placeholder="Confirm your password"
                  value={registerForm.confirmPassword}
                  onChange={(e) => setRegisterForm({ ...registerForm, confirmPassword: e.target.value })}
                  required
                  autoComplete="new-password"
                  ariaLabel="Show confirm password"
                />
              </AuthField>

              <button type="submit" className="auth-btn auth-btn--primary">Create account</button>
            </form>
            <div className="auth-footer">
              <p className="auth-footer__text">Already have an account?</p>
              <button type="button" className="auth-footer__link" onClick={switchToLogin}>Sign in</button>
            </div>
            {registerError && <p className="auth-error" role="alert">{registerError}</p>}
          </>
        )}
      </div>
    </div>
  );
};

export default AuthPage;
