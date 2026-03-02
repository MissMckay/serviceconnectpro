import { useState, useContext } from "react";
import { AuthContext } from "../context/AuthContext";

const Auth = () => {
  const { login, register } = useContext(AuthContext);

  const [loginData, setLoginData] = useState({
    email: "",
    password: ""
  });

  const [registerData, setRegisterData] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    role: "user"
  });

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await login(loginData);
      alert("Welcome back 🇱🇷");
    } catch (err) {
      alert("Invalid email or password");
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (registerData.password !== registerData.confirmPassword) {
      return alert("Passwords do not match");
    }

    try {
      await register(registerData);
      alert("Registration successful 🇱🇷");
    } catch (err) {
      alert("Registration failed");
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-container">

      {/* LOGIN */}
      <div className="auth-card">
        <h2>Login</h2>
        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Email"
            onChange={(e) =>
              setLoginData({ ...loginData, email: e.target.value })
            }
          />

          <input
            type="password"
            placeholder="Password"
            onChange={(e) =>
              setLoginData({ ...loginData, password: e.target.value })
            }
          />

          <button className="btn-red">Login</button>
        </form>
      </div>

      {/* REGISTER */}
      <div className="auth-card">
        <h2>Register</h2>
        <form onSubmit={handleRegister}>
          <input
            type="text"
            placeholder="Full Name"
            onChange={(e) =>
              setRegisterData({ ...registerData, fullName: e.target.value })
            }
          />

          <input
            type="email"
            placeholder="Email"
            onChange={(e) =>
              setRegisterData({ ...registerData, email: e.target.value })
            }
          />

          <input
            type="text"
            placeholder="Phone Number"
            onChange={(e) =>
              setRegisterData({ ...registerData, phone: e.target.value })
            }
          />

          <input
            type="password"
            placeholder="Password"
            onChange={(e) =>
              setRegisterData({ ...registerData, password: e.target.value })
            }
          />

          <input
            type="password"
            placeholder="Confirm Password"
            onChange={(e) =>
              setRegisterData({
                ...registerData,
                confirmPassword: e.target.value
              })
            }
          />

          <div className="role-select">
            <label>
              <input
                type="radio"
                value="user"
                checked={registerData.role === "user"}
                onChange={(e) =>
                  setRegisterData({ ...registerData, role: e.target.value })
                }
              />
              User
            </label>

            <label>
              <input
                type="radio"
                value="provider"
                onChange={(e) =>
                  setRegisterData({ ...registerData, role: e.target.value })
                }
              />
              Service Provider
            </label>
          </div>

          <button className="btn-blue">Sign Up</button>
        </form>
      </div>
    </div>
    </div>
  );
};

export default Auth;
