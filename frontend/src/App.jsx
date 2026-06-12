import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import ApplicationForm from './pages/ApplicationForm'
import InstagramApplicationForm from './pages/InstagramApplicationForm'
import ThankYou from './pages/ThankYou'
import InstagramThankYou from './pages/InstagramThankYou'
import NotFound from './pages/NotFound'
import AdminLogin from './pages/AdminLogin'
import AdminDashboard from './pages/AdminDashboard'
import AdminColleges from './pages/AdminColleges'
import {
  OFFICIAL_FORM_PATH, OFFICIAL_THANKYOU_PATH,
  INSTAGRAM_FORM_PATH, INSTAGRAM_THANKYOU_PATH,
  getLastFormSource
} from './utils/routes'

// "/" and unknown URLs never open a form directly. Visitors are sent back to
// the form they last opened (official stays official, Instagram stays
// Instagram); brand-new visitors see a neutral not-found page.
function RootRedirect() {
  const last = getLastFormSource()
  if (last === 'instagram') return <Navigate to={INSTAGRAM_FORM_PATH} replace />
  if (last === 'official')  return <Navigate to={OFFICIAL_FORM_PATH} replace />
  return <NotFound />
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* ── Official College form — unguessable route, isolated from Instagram ── */}
        <Route path={OFFICIAL_FORM_PATH} element={<ApplicationForm />} />
        <Route path={OFFICIAL_THANKYOU_PATH} element={<ThankYou />} />

        {/* ── Instagram form — unguessable route, isolated from official ── */}
        <Route path={INSTAGRAM_FORM_PATH} element={<InstagramApplicationForm />} />
        <Route path={INSTAGRAM_THANKYOU_PATH} element={<InstagramThankYou />} />

        {/* ── Admin — every route behind authentication ── */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/colleges" element={<ProtectedRoute><AdminColleges /></ProtectedRoute>} />
        {/* Any other /admin/* URL (e.g. /admin, /admin/users) → login */}
        <Route path="/admin/*" element={<Navigate to="/admin/login" replace />} />
        <Route path="/admin" element={<Navigate to="/admin/login" replace />} />

        {/* "/" and everything else → back to the visitor's own form */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </AuthProvider>
  )
}
