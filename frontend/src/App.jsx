import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import ApplicationForm from './pages/ApplicationForm'
import InstagramApplicationForm from './pages/InstagramApplicationForm'
import MissedTestApplicationForm from './pages/MissedTestApplicationForm'
import ThankYou from './pages/ThankYou'
import InstagramThankYou from './pages/InstagramThankYou'
import MissedTestThankYou from './pages/MissedTestThankYou'
import NotFound from './pages/NotFound'
import AdminLogin from './pages/AdminLogin'
import AdminDashboard from './pages/AdminDashboard'
import AdminColleges from './pages/AdminColleges'
import AdminAttendance from './pages/AdminAttendance'
import AdminAttendanceHistory from './pages/AdminAttendanceHistory'
import AdminCounselling from './pages/AdminCounselling'
import AdminCounsellingResponses from './pages/AdminCounsellingResponses'
import AdminCounsellingDetail from './pages/AdminCounsellingDetail'
import AdminCounsellingQuestions from './pages/AdminCounsellingQuestions'
import CounsellingForm from './pages/CounsellingForm'
import Reception from './pages/Reception'
import AdminReception from './pages/AdminReception'
import {
  OFFICIAL_FORM_PATH, OFFICIAL_THANKYOU_PATH,
  INSTAGRAM_FORM_PATH, INSTAGRAM_THANKYOU_PATH,
  MISSED_TEST_FORM_PATH, MISSED_TEST_THANKYOU_PATH,
  COUNSELLING_FORM_PATH,
  RECEPTION_PATH,
  getLastFormSource
} from './utils/routes'
import {
  ADMIN_BASE, ADMIN_LOGIN, ADMIN_DASHBOARD, ADMIN_COLLEGES,
  ADMIN_ATTENDANCE, ADMIN_ATTENDANCE_HISTORY, ADMIN_COUNSELLING,
  ADMIN_COUNSELLING_RESPONSES, ADMIN_COUNSELLING_DETAIL, ADMIN_COUNSELLING_QUESTIONS, ADMIN_RECEPTION
} from './utils/routes'

// "/" and unknown URLs never open a form directly. Visitors are sent back to
// the form they last opened (official stays official, Instagram stays
// Instagram); brand-new visitors see a neutral not-found page.
function RootRedirect() {
  const last = getLastFormSource()
  if (last === 'instagram')   return <Navigate to={INSTAGRAM_FORM_PATH} replace />
  if (last === 'official')    return <Navigate to={OFFICIAL_FORM_PATH} replace />
  if (last === 'missed_test') return <Navigate to={MISSED_TEST_FORM_PATH} replace />
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

        {/* ── Missed Test form — for students who could not attend the test ── */}
        <Route path={MISSED_TEST_FORM_PATH} element={<MissedTestApplicationForm />} />
        <Route path={MISSED_TEST_THANKYOU_PATH} element={<MissedTestThankYou />} />

        {/* ── Counselling assessment — opened via QR, no login (attendance-gated) ── */}
        <Route path={COUNSELLING_FORM_PATH} element={<CounsellingForm />} />
        <Route path={RECEPTION_PATH} element={<Reception />} />

        {/* ── Admin — every route behind authentication ── */}
        <Route path={ADMIN_LOGIN} element={<AdminLogin />} />
        <Route path={ADMIN_DASHBOARD} element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
        <Route path={ADMIN_COLLEGES} element={<ProtectedRoute><AdminColleges /></ProtectedRoute>} />
        <Route path={ADMIN_ATTENDANCE} element={<ProtectedRoute><AdminAttendance /></ProtectedRoute>} />
        <Route path={ADMIN_ATTENDANCE_HISTORY} element={<ProtectedRoute><AdminAttendanceHistory /></ProtectedRoute>} />
        <Route path={ADMIN_COUNSELLING} element={<ProtectedRoute><AdminCounselling /></ProtectedRoute>} />
        <Route path={ADMIN_COUNSELLING_RESPONSES} element={<ProtectedRoute><AdminCounsellingResponses /></ProtectedRoute>} />
        <Route path={ADMIN_COUNSELLING_DETAIL} element={<ProtectedRoute><AdminCounsellingDetail /></ProtectedRoute>} />
        <Route path={ADMIN_COUNSELLING_QUESTIONS} element={<ProtectedRoute><AdminCounsellingQuestions /></ProtectedRoute>} />
        <Route path={ADMIN_RECEPTION} element={<ProtectedRoute><AdminReception /></ProtectedRoute>} />
        {/* Any other admin URL → login */}
        <Route path={ADMIN_BASE + '/*'} element={<Navigate to={ADMIN_LOGIN} replace />} />
        <Route path={ADMIN_BASE} element={<Navigate to={ADMIN_LOGIN} replace />} />

        {/* "/" and everything else → back to the visitor's own form */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </AuthProvider>
  )
}
