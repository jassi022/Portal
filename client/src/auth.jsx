import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';
const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api('/auth/me').then((d) => setUser(d.user)).catch(() => {}).finally(() => setLoading(false)); }, []);
  const login = async (email, password) => setUser((await api('/auth/login', { method: 'POST', body: { email, password } })).user);
  const register = async (name, email, password) => setUser((await api('/auth/register', { method: 'POST', body: { name, email, password } })).user);
  const logout = async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); };
  return <Ctx.Provider value={{ user, loading, login, register, logout }}>{children}</Ctx.Provider>;
}
