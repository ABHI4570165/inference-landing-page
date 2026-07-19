import { Link, useLocation } from 'react-router-dom'
import { ADMIN_COUNSELLING, ADMIN_COUNSELLING_RESPONSES, ADMIN_COUNSELLING_QUESTIONS } from '../utils/routes'

// Sub-navigation for the admin Counselling area
export default function CounsellingNav() {
  const { pathname } = useLocation()
  const tabs = [
    { path: ADMIN_COUNSELLING, label: 'Dashboard' },
    { path: ADMIN_COUNSELLING_RESPONSES, label: 'Responses' },
    { path: ADMIN_COUNSELLING_QUESTIONS, label: 'Questions' }
  ]
  return (
    <div className="flex gap-1.5 mb-5 flex-wrap">
      {tabs.map(t => {
        const active = t.path === ADMIN_COUNSELLING
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
