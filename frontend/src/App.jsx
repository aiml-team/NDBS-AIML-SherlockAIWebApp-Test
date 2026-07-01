import { Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import CreateProspect from './pages/CreateProspect.jsx';
import ViewProspect from './pages/ViewProspect.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import AdminUsersPage from './pages/AdminUsersPage.jsx';
import AdminUserDetailPage from './pages/AdminUserDetailPage.jsx';
import AdminFeedbackPage from './pages/AdminFeedbackPage.jsx';
import RequireAuth, { RedirectIfAuthed } from './components/auth/RequireAuth.jsx';
import RequireAdmin from './components/auth/RequireAdmin.jsx';

export default function App() {
  return (
    <Routes>
      {/* Public auth routes */}
      <Route path="/login"           element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
      <Route path="/signup"          element={<RedirectIfAuthed><Signup /></RedirectIfAuthed>} />
      <Route path="/forgot-password" element={<RedirectIfAuthed><ForgotPassword /></RedirectIfAuthed>} />

      {/* Protected app routes */}
      <Route path="/"                       element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/create-prospect"        element={<RequireAuth><CreateProspect /></RequireAuth>} />
      <Route path="/view-prospect/:name"    element={<RequireAuth><ViewProspect /></RequireAuth>} />

      {/* Admin routes */}
      <Route path="/admin"                  element={<Navigate to="/admin/users" replace />} />
      <Route path="/admin/users"            element={<RequireAdmin><AdminUsersPage /></RequireAdmin>} />
      <Route path="/admin/users/:id"        element={<RequireAdmin><AdminUserDetailPage /></RequireAdmin>} />
      <Route path="/admin/feedback"         element={<RequireAdmin><AdminFeedbackPage /></RequireAdmin>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
