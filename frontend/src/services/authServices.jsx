import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const API = `${API_BASE_URL}/auth`;

export const loginUser = async (formData) => {
  const { data } = await axios.post(`${API}/login`, formData);
  return data;
};

export const registerUser = async (formData) => {
  const { data } = await axios.post(`${API}/register`, formData);
  return data;
};
