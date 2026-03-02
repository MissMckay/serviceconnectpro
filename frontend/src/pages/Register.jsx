import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../services/api";

const Register = () => {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    providerAddress: "", // ✅ NEW
    password: "",
    confirmPassword: "",
    role: "user"
  });

  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    // ✅ Require provider address only if provider
    if (form.role === "provider" && !form.providerAddress.trim()) {
      setError("Provider address is required for service providers.");
      return;
    }

    try {
      await API.post("/auth/register", {
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        role: form.role,
        providerAddress:
          form.role === "provider"
            ? form.providerAddress
            : "Not provided"
      });

      alert("Registered Successfully");
      navigate("/login");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Registration failed. Please try again."
      );
    }
  };

  return (
    <div className="register-page">
      <div className="register-card">
        <h2 className="register-title">Register</h2>

        <form className="register-form" onSubmit={handleRegister}>
          {/* FULL NAME */}
          <label className="register-label">Full Name</label>
          <input
            type="text"
            placeholder="Enter your full name"
            value={form.name}
            onChange={(e) =>
              setForm({ ...form, name: e.target.value })
            }
            required
          />

          {/* EMAIL */}
          <label className="register-label">Email</label>
          <input
            type="email"
            placeholder="Enter your email"
            value={form.email}
            onChange={(e) =>
              setForm({ ...form, email: e.target.value })
            }
            required
          />

          {/* PHONE */}
          <label className="register-label">Phone Number</label>
          <input
            type="tel"
            placeholder="Enter your phone number"
            value={form.phone}
            onChange={(e) =>
              setForm({ ...form, phone: e.target.value })
            }
            required
          />

          {/* ROLE SELECT */}
          <div className="register-role-group">
            <span className="register-label">Role</span>

            <label className="register-role-option">
              <input
                type="radio"
                value="user"
                checked={form.role === "user"}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value })
                }
              />
              User
            </label>

            <label className="register-role-option">
              <input
                type="radio"
                value="provider"
                checked={form.role === "provider"}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value })
                }
              />
              Service Provider
            </label>
          </div>

          {/* ✅ PROVIDER ADDRESS (ONLY SHOW WHEN PROVIDER) */}
          {form.role === "provider" && (
            <>
              <label className="register-label">
                Provider Address
              </label>
              <input
                type="text"
                placeholder="Enter your service location / community"
                value={form.providerAddress}
                onChange={(e) =>
                  setForm({
                    ...form,
                    providerAddress: e.target.value
                  })
                }
                required
              />
            </>
          )}

          {/* PASSWORD */}
          <label className="register-label">Password</label>
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Enter password"
            value={form.password}
            onChange={(e) =>
              setForm({ ...form, password: e.target.value })
            }
            required
          />

          {/* CONFIRM PASSWORD */}
          <label className="register-label">
            Confirm Password
          </label>
          <input
            type={showConfirmPassword ? "text" : "password"}
            placeholder="Confirm password"
            value={form.confirmPassword}
            onChange={(e) =>
              setForm({
                ...form,
                confirmPassword: e.target.value
              })
            }
            required
          />

          <button
            type="button"
            onClick={() =>
              setShowPassword((prev) => !prev)
            }
          >
            Toggle Password Visibility
          </button>

          <button
            type="submit"
            className="register-submit-btn"
          >
            Sign Up
          </button>
        </form>

        <p className="register-login-link">
          Already have an account?{" "}
          <Link to="/login">Login</Link>
        </p>

        {error && (
          <p className="login-error">{error}</p>
        )}
      </div>
    </div>
  );
};

export default Register;