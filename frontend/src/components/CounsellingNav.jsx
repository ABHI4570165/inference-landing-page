import { Link, useLocation } from 'react-router-dom'

// Sub-navigation for the admin Counselling area
export default function CounsellingNav() {
  const { pathname } = useLocation()
  const tabs = [
    { path: '/admin/counselling', label: 'Dashboard' },
    { path: '/admin/counselling/responses', label: 'Responses' },
    { path: '/admin/counselling/questions', label: 'Questions' }
  ]
  return (
    <div className="flex gap-1.5 mb-5 flex-wrap">
      {tabs.map(t => {
        const active = t.path === '/admin/counselling'
          ? pathname === t.path
          : pathname.startsWith(t.path)
        return (
          <Link
            key={t.path} to={t.path}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${
              active
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
