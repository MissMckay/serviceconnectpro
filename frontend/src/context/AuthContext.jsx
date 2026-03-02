import { createContext, useState, useEffect } from "react";
import { loginUser, registerUser } from "../services/authServices";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    if (storedUser) setUser(storedUser);
  }, []);

  const login = async (formData) => {
    const data = await loginUser(formData);
    localStorage.setItem("user", JSON.stringify(data));
    setUser(data);
  };

  const register = async (formData) => {
    return await registerUser(formData);
  };

  const logout = () => {
    localStorage.removeItem("user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
