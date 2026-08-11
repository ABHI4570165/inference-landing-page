import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { WorkspaceProvider } from './context/WorkspaceContext'
import ProtectedRoute from './components/ProtectedRoute'
import RequireWorkspace from './components/RequireWorkspace'
import ApplicationForm from './pages/ApplicationForm'
import InstagramApplicationForm from './pages/InstagramApplicationForm'
import MissedTestApplicationForm from './pages/MissedTestApplicationForm'
import ThankYou from './pages/ThankYou'
import InstagramThankYou from './pages/InstagramThankYou'
import MissedTestThankYou from './pages/MissedTestThankYou'
import NotFound from './pages/NotFound'
import AdminLogin from './pages/AdminLogin'
import AdminHome from './pages/AdminHome'
import WorkspaceDashboard from './pages/WorkspaceDashboard'
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
import AdminForms from './pages/AdminForms'
import AdminFormBuilder from './pages/AdminFormBuilder'
import AdminFormResponses from './pages/AdminFormResponses'
import PublicForm from './pages/PublicForm'
import {
  OFFICIAL_FORM_PATH, OFFICIAL_THANKYOU_PATH,
  INSTAGRAM_FORM_PATH, INSTAGRAM_THANKYOU_PATH,
  MISSED_TEST_FORM_PATH, MISSED_TEST_THANKYOU_PATH,
  COUNSELLING_FORM_PATH, COUNSELLING_FORM_PATH_TOKEN,
  RECEPTION_PATH, RECEPTION_PATH_TOKEN,
  FORM_PATH,
  getLastFormSource
} from './utils/routes'
import {
  ADMIN_BASE, ADMIN_LOGIN, ADMIN_HOME, ADMIN_WORKSPACE_DASHBOARD, ADMIN_DASHBOARD, ADMIN_COLLEGES,
  ADMIN_ATTENDANCE, ADMIN_ATTENDANCE_HISTORY, ADMIN_COUNSELLING,
  ADMIN_COUNSELLING_RESPONSES, ADMIN_COUNSELLING_DETAIL, ADMIN_COUNSELLING_QUESTIONS, ADMIN_RECEPTION,
  ADMIN_FORMS, ADMIN_FORM_EDIT, ADMIN_FORM_RESPONSES
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
      <WorkspaceProvider>
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

        {/* ── Counselling assessment — opened via QR, no login (attendance-gated) ──
             Bare path = original link (always the default-intake workspace);
             :token path = a specific workspace's own unique link. ── */}
        <Route path={COUNSELLING_FORM_PATH} element={<CounsellingForm />} />
        <Route path={COUNSELLING_FORM_PATH_TOKEN} element={<CounsellingForm />} />
        <Route path={RECEPTION_PATH} element={<Reception />} />
        <Route path={RECEPTION_PATH_TOKEN} element={<Reception />} />

        {/* ── Custom Forms — public submission page, one per form ── */}
        <Route path={FORM_PATH} element={<PublicForm />} />

        {/* ── Admin — every route behind authentication ── */}
        <Route path={ADMIN_LOGIN} element={<AdminLogin />} />
        {/* Level 1 — global landing: greeting + workspace cards + create workspace */}
        <Route path={ADMIN_HOME} element={<ProtectedRoute><AdminHome /></ProtectedRoute>} />
        {/* Level 2 — everything below requires an active workspace selection */}
        <Route path={ADMIN_WORKSPACE_DASHBOARD} element={<ProtectedRoute><RequireWorkspace><WorkspaceDashboard /></RequireWorkspace></ProtectedRoute>} />
        <Route path={ADMIN_DASHBOARD} element={<ProtectedRoute><RequireWorkspace><AdminDashboard /></RequireWorkspace></ProtectedRoute>} />
        <Route path={ADMIN_COLLEGES} element={<ProtectedRoute><RequireWorkspace><AdminColleges /></RequireWorkspace></ProtectedRoute>} />
        <Route path={ADMIN_ATTENDANCE} element={<ProtectedRoute><RequireWorkspace><AdminAttendance /></RequireWorkspace></ProtectedRoute>} />
        <Route path={ADMIN_ATTENDANCE_HISTORY} element={<ProtectedRoute><RequireWorkspace><AdminAttendanceHistory /></RequireWorkspace></ProtectedRoute>} />
        <Route path={ADMIN_COUNSELLING} element={<ProtectedRoute><RequireWorkspace><AdminCounselling /></RequireWorkspace></ProtectedRoute>} />
        <Route path={ADMIN_COUNSELLING_RESPONSES} element={<ProtectedRoute><RequireWorkspace><AdminCounsellingResponses /></RequireWorkspace></ProtectedRoute>} />
        <Route path={ADMIN_COUNSELLING_DETAIL} element={<ProtectedRoute><RequireWorkspace><AdminCounsellingDetail /></RequireWorkspace></ProtectedRoute>} />
        <Route path={ADMIN_COUNSELLING_QUESTIONS} element={<ProtectedRoute><RequireWorkspace><AdminCounsellingQuestions /></RequireWorkspace></ProtectedRoute>} />
        <Route path={ADMIN_RECEPTION} element={<ProtectedRoute><RequireWorkspace><AdminReception /></RequireWorkspace></ProtectedRoute>} />
        <Route path={ADMIN_FORMS} element={<ProtectedRoute><RequireWorkspace><AdminForms /></RequireWorkspace></ProtectedRoute>} />
        <Route path={ADMIN_FORM_EDIT} element={<ProtectedRoute><RequireWorkspace><AdminFormBuilder /></RequireWorkspace></ProtectedRoute>} />
        <Route path={ADMIN_FORM_RESPONSES} element={<ProtectedRoute><RequireWorkspace><AdminFormResponses /></RequireWorkspace></ProtectedRoute>} />
        {/* Any other admin URL → login */}
        <Route path={ADMIN_BASE + '/*'} element={<Navigate to={ADMIN_LOGIN} replace />} />
        <Route path={ADMIN_BASE} element={<Navigate to={ADMIN_LOGIN} replace />} />

        {/* "/" and everything else → back to the visitor's own form */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
      </WorkspaceProvider>
    </AuthProvider>
  )
}
