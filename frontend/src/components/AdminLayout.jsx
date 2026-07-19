import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ADMIN_LOGIN, ADMIN_DASHBOARD, ADMIN_ATTENDANCE, ADMIN_ATTENDANCE_HISTORY, ADMIN_COUNSELLING, ADMIN_COLLEGES, ADMIN_RECEPTION } from '../utils/routes'

export default function AdminLayout({ children }) {
  const { admin, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  function handleLogout() {
    logout()
    navigate(ADMIN_LOGIN)
  }

  const navItems = [
    { path: ADMIN_DASHBOARD, label: 'Applications', icon: '📋' },
    { path: ADMIN_ATTENDANCE, label: 'Attendance', icon: '✅' },
    { path: ADMIN_ATTENDANCE_HISTORY, label: 'History', icon: '🗓️' },
    { path: ADMIN_RECEPTION, label: 'Reception', icon: '📸' },
    { path: ADMIN_COUNSELLING, label: 'Counselling', icon: '🧭', prefix: true },
    { path: ADMIN_COLLEGES, label: 'Colleges', icon: '🏛️' }
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Nav */}
      <header className="bg-brand-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <img src="/mandi-logo.png" alt="M H Foundation" className="w-8 h-8 object-contain bg-white rounded-full p-0.5" />
              <span className="font-heading font-bold text-sm hidden sm:block">Admin Panel</span>
            </div>
            <nav className="flex gap-1 flex-wrap">
              {navItems.map(item => {
                const active = item.prefix
                  ? location.pathname.startsWith(item.path)
                  : location.pathname === item.path
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${active ? 'bg-white/20 text-white' : 'text-brand-200 hover:text-white hover:bg-white/10'}`}
                  >
                    <span className="mr-1">{item.icon}</span>{item.label}
                  </Link>
                )
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-brand-200 text-xs hidden sm:block">{admin?.email}</span>
            <button onClick={handleLogout} className="bg-white/10 hover:bg-white/20 text-white text-sm px-3 py-1.5 rounded-lg transition">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  )
}
