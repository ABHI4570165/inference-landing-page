import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function AdminLayout({ children }) {
  const { admin, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  function handleLogout() {
    logout()
    navigate('/admin/login')
  }

  const navItems = [
    { path: '/admin/dashboard', label: 'Applications', icon: '📋' },
    { path: '/admin/attendance', label: 'Attendance', icon: '✅' },
    { path: '/admin/attendance/history', label: 'History', icon: '🗓️' },
    { path: '/admin/counselling', label: 'Counselling', icon: '🧭', prefix: true },
    { path: '/admin/colleges', label: 'Colleges', icon: '🏛️' }
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Nav */}
      <header className="bg-brand-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center">
                <span className="text-white font-bold text-sm">M</span>
              </div>
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
