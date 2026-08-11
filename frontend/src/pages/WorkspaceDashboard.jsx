import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import API from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import AdminLayout from '../components/AdminLayout'
import Spinner from '../components/Spinner'
import { Donut, TrendLine, HBarList } from '../components/Charts'
import { ADMIN_HOME, ADMIN_DASHBOARD, ADMIN_FORMS, ADMIN_ATTENDANCE, ADMIN_RECEPTION, ADMIN_COUNSELLING } from '../utils/routes'
import {
  IconClipboard, IconCalendar, IconCheckCircle, IconCamera, IconDocument,
  IconArrowRight, IconCompass
} from '../components/Icons'

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function StatCard({ label, value, sub, icon, tone, to, loading }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-medium text-ink-500">{label}</p>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${tone}`}>{icon}</div>
      </div>
      {loading
        ? <div className="skeleton h-8 w-20 mt-3 rounded-md" />
        : <p className="font-heading text-[28px] leading-none font-bold text-ink-900 mt-3 tabular-nums">
            {(value ?? 0).toLocaleString('en-IN')}
          </p>}
      {sub && <p className="text-[12px] text-ink-400 mt-2">{sub}</p>}
    </>
  )
  return to
    ? <Link to={to} className="card !p-5 card-hover block">{body}</Link>
    : <div className="card !p-5">{body}</div>
}

// Level-2 dashboard for whichever workspace is active. Every number comes from
// GET /api/admin/dashboard/summary, scoped server-side to that one workspace.
export default function WorkspaceDashboard() {
  const { admin } = useAuth()
  const { workspace } = useWorkspace()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!workspace) { navigate(ADMIN_HOME, { replace: true }); return }
    setLoading(true)
    API.get('/api/admin/dashboard/summary')
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.message || 'Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [workspace?._id])

  if (!workspace) return null

  const name = admin?.email ? admin.email.split('@')[0] : 'there'
  const attendance = data?.attendanceToday || { present: 0, absent: 0 }

  return (
    <AdminLayout>
      {/* Greeting banner */}
      <div className="relative overflow-hidden rounded-2xl bg-brand-900 text-white px-6 sm:px-8 py-7 mb-6 animate-fade-up">
        <div className="absolute -right-16 -top-20 w-64 h-64 rounded-full bg-brand-700/40 pointer-events-none" />
        <div className="absolute -right-4 top-16 w-40 h-40 rounded-full bg-brand-600/25 pointer-events-none" />
        <div className="relative">
          <h1 className="font-heading text-[26px] sm:text-[30px] leading-tight font-bold">
            {greeting()}, <span className="capitalize">{name}</span> 👋
          </h1>
          <p className="text-brand-100 text-[15px] font-medium mt-2.5">{workspace.companyName}</p>
          <p className="text-brand-300 text-[13.5px]">{workspace.recruitmentDriveName}</p>
          <p className="text-brand-200/80 text-[13px] mt-3 max-w-xl">
            {workspace.description
              || 'Everything below — applications, attendance, reception and counselling — is scoped to this recruitment drive only.'}
          </p>
        </div>
      </div>

      {error ? (
        <div className="card text-center py-16 text-red-600">{error}</div>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-4 stagger">
            <StatCard label="Total Applications" value={data?.totalStudents} loading={loading}
              sub="Across every form" to={ADMIN_DASHBOARD}
              icon={<IconClipboard size={17} className="text-brand-700" />} tone="bg-brand-50" />
            <StatCard label="Today's Applications" value={data?.todaysApplications} loading={loading}
              sub="Received today" to={ADMIN_DASHBOARD}
              icon={<IconCalendar size={17} className="text-blue-600" />} tone="bg-blue-50" />
            <StatCard label="Counselling Completed" value={data?.counsellingCompleted} loading={loading}
              sub={`${data?.counsellingInProgress ?? 0} in progress`} to={ADMIN_COUNSELLING}
              icon={<IconCompass size={17} className="text-indigo-600" />} tone="bg-indigo-50" />
            <StatCard label="Reception Check-ins" value={data?.receptionToday} loading={loading}
              sub="Today" to={ADMIN_RECEPTION}
              icon={<IconCamera size={17} className="text-rose-600" />} tone="bg-rose-50" />
            <StatCard label="Active Forms" value={data?.activeForms} loading={loading}
              sub={`${data?.formResponses ?? 0} form responses`} to={ADMIN_FORMS}
              icon={<IconDocument size={17} className="text-purple-600" />} tone="bg-purple-50" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <StatCard label="Present Today" value={attendance.present} loading={loading}
              sub={`${attendance.absent} marked absent`} to={ADMIN_ATTENDANCE}
              icon={<IconCheckCircle size={17} className="text-brand-700" />} tone="bg-brand-50" />
            <StatCard label="Pending AI Reports" value={data?.pendingReports} loading={loading}
              sub="Counselling reports queued"
              icon={<IconDocument size={17} className="text-amber-600" />} tone="bg-amber-50" />
            <StatCard label="Total Form Responses" value={data?.formResponses} loading={loading}
              sub="Custom forms only" to={ADMIN_FORMS}
              icon={<IconClipboard size={17} className="text-teal-600" />} tone="bg-teal-50" />
          </div>

          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="skeleton h-72 rounded-xl" />
              <div className="skeleton h-72 rounded-xl" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <p className="text-[13.5px] font-bold text-ink-800">Today's Attendance</p>
                      <p className="text-[12px] text-ink-400 mt-0.5">Present vs absent for {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                    </div>
                  </div>
                  <div className="p-5">
                    <Donut data={[
                      { label: 'Present', value: attendance.present },
                      { label: 'Absent', value: attendance.absent }
                    ]} />
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <p className="text-[13.5px] font-bold text-ink-800">Attendance Trend</p>
                      <p className="text-[12px] text-ink-400 mt-0.5">Present count over the last 14 days</p>
                    </div>
                  </div>
                  <div className="p-5"><TrendLine data={data.attendanceTrend} /></div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <div>
                    <p className="text-[13.5px] font-bold text-ink-800">Top Colleges</p>
                    <p className="text-[12px] text-ink-400 mt-0.5">Where most applications come from</p>
                  </div>
                  <Link to={ADMIN_DASHBOARD} className="btn-ghost !text-brand-700">
                    View applications <IconArrowRight />
                  </Link>
                </div>
                <div className="p-5">
                  {data.topColleges.length === 0
                    ? <p className="text-[13.5px] text-ink-400 text-center py-6">No applications yet.</p>
                    : <HBarList data={data.topColleges.map(c => ({ label: c.college, value: c.count }))} />}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </AdminLayout>
  )
}
