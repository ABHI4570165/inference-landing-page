import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import ApplicationForm from './pages/ApplicationForm'
import AdminLogin from './pages/AdminLogin'
import AdminDashboard from './pages/AdminDashboard'
import AdminColleges from './pages/AdminColleges'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<ApplicationForm />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/colleges" element={<ProtectedRoute><AdminColleges /></ProtectedRoute>} />
        <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
