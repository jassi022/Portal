import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Project from './pages/Project';
import { ToastProvider } from './ui';
import './styles.css';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="center">Loading…</p>;
  return user ? children : <Navigate to="/login" replace />;
}
createRoot(document.getElementById('root')).render(
  <BrowserRouter><AuthProvider><ToastProvider><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/" element={<Protected><Dashboard /></Protected>} />
    <Route path="/projects/:id" element={<Protected><Project /></Protected>} />
    <Route path="*" element={<Navigate to="/" />} />
  </Routes></ToastProvider></AuthProvider></BrowserRouter>
);