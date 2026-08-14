import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  ADMIN_LOGIN, ADMIN_HOME, ADMIN_WORKSPACE_DASHBOARD, ADMIN_DASHBOARD, ADMIN_ATTENDANCE,
  ADMIN_ATTENDANCE_HISTORY, ADMIN_COUNSELLING, ADMIN_COLLEGES, ADMIN_RECEPTION, ADMIN_FORMS
} from '../utils/routes'
import { Logo } from './PublicShell'
import {
  IconGrid, IconClipboard, IconCheckSquare, IconHistory, IconCamera, IconCompass,
  IconBuilding, IconDocument, IconSwitch, IconLogout, IconMenu, IconClose, IconChevronRight
} from './Icons'

// The workspace-scoped shell. Every module below Global Home renders inside
// this: a persistent sidebar on desktop, a slide-over drawer on mobile.
// `title` / `subtitle` / `actions` are optional — pages that don't pass them
// simply render their own heading in the content area, so nothing that used
// the previous version of this component breaks.

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { path: ADMIN_WORKSPACE_DASHBOARD, label: 'Dashboard',    icon: IconGrid },
      { path: ADMIN_DASHBOARD,           label: 'Applications', icon: IconClipboard }
    ]
  },
  {
    label: 'Operations',
    items: [
      { path: ADMIN_ATTENDANCE,         label: 'Attendance',  icon: IconCheckSquare },
      { path: ADMIN_ATTENDANCE_HISTORY, label: 'History',     icon: IconHistory },
      { path: ADMIN_RECEPTION,          label: 'Reception',   icon: IconCamera },
      { path: ADMIN_COUNSELLING,        label: 'Counselling', icon: IconCompass, prefix: true }
    ]
  },
  {
    label: 'Configuration',
    items: [
      { path: ADMIN_COLLEGES, label: 'Colleges', icon: IconBuilding },
      { path: ADMIN_FORMS,    label: 'Forms',    icon: IconDocument, prefix: true }
    ]
  }
]

function initialsOf(name) {
  return (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'W'
}

function isActive(item, pathname) {
  // History lives under the Attendance path, so Attendance must match exactly
  return item.prefix ? pathname.startsWith(item.path) : pathname === item.path
}

function SidebarContent({ workspace, admin, pathname, onNavigate, onSwitch, onLogout }) {
  const adminName = admin?.email ? admin.email.split('@')[0] : 'Admin'

  return (
    <div className="flex flex-col h-full bg-brand-900 text-white">
      {/* Brand */}
      <div className="px-5 py-[18px] flex items-center gap-2.5 border-b border-white/10">
        <Logo alt="" className="w-8 h-8 rounded-full p-0.5 object-contain flex-shrink-0" />
        <div className="min-w-0">
          <p className="font-heading font-bold text-[15px] leading-tight">Recruitment</p>
          <p className="text-[11px] text-brand-300 leading-tight">Management Platform</p>
        </div>
      </div>

      {/* Workspace selector */}
      {workspace && (
        <div className="p-3 border-b border-white/10">
          <button
            onClick={onSwitch}
            title="Switch workspace"
            className="w-full group bg-white/[0.07] hover:bg-white/[0.13] border border-white/10 rounded-xl
                       px-3 py-2.5 flex items-center gap-3 text-left transition-all duration-200"
          >
            <div className="w-9 h-9 rounded-lg bg-brand-500 flex items-center justify-center
                            font-heading font-bold text-[11px] flex-shrink-0">
              {initialsOf(workspace.companyName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold truncate leading-tight" title={workspace.companyName}>
                {workspace.companyName}
              </p>
              <p className="text-[11px] text-brand-300 truncate leading-tight mt-0.5" title={workspace.recruitmentDriveName}>
                {workspace.recruitmentDriveName}
              </p>
            </div>
            <IconSwitch className="text-brand-300 group-hover:text-white transition-colors flex-shrink-0" />
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scroll-slim px-3 py-4 space-y-5">
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-400/80">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(item => {
                const active = isActive(item, pathname)
                const Icon = item.icon
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={onNavigate}
                    className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium
                                transition-all duration-200 ${active
                                  ? 'bg-white/[0.14] text-white'
                                  : 'text-brand-200 hover:text-white hover:bg-white/[0.07]'}`}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-brand-300" />
                    )}
                    <Icon size={17} className={active ? 'text-white' : 'text-brand-300'} />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Account */}
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-2.5 px-2 py-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-brand-600 ring-1 ring-white/20 flex items-center justify-center
                          font-bold text-[11px] flex-shrink-0">
            {initialsOf(adminName)}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold truncate capitalize leading-tight">{adminName}</p>
            <p className="text-[11px] text-brand-300 truncate leading-tight">{admin?.email}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium
                     text-brand-200 hover:text-white hover:bg-white/[0.07] transition-all duration-200"
        >
          <IconLogout /> Logout
        </button>
      </div>
    </div>
  )
}

export default function AdminLayout({ children, title, subtitle, actions, breadcrumb }) {
  const { admin, logout } = useAuth()
  const { workspace } = useWorkspace()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Never leave the drawer hanging open across a route change
  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = e => { if (e.key === 'Escape') setDrawerOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  function handleLogout() {
    logout()
    navigate(ADMIN_LOGIN)
  }

  const sidebar = (
    <SidebarContent
      workspace={workspace}
      admin={admin}
      pathname={location.pathname}
      onNavigate={() => setDrawerOpen(false)}
      onSwitch={() => navigate(ADMIN_HOME)}
      onLogout={handleLogout}
    />
  )

  return (
    // Two-column grid on desktop, single column on mobile. The sidebar is a
    // real grid item with its own track — it cannot overlap the content.
    <div className="app-shell">
      {/* Desktop sidebar — occupies column 1 */}
      <aside className="app-sidebar">
        <div className="app-sidebar-inner">{sidebar}</div>
      </aside>

      {/* Mobile drawer — overlays only below the lg breakpoint, where the
          sidebar column does not exist */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-ink-900/50 animate-fade-in" onClick={() => setDrawerOpen(false)} />
          <aside className="relative w-[272px] max-w-[82vw] h-full animate-slide-in shadow-panel">
            {sidebar}
          </aside>
        </div>
      )}

      {/* Content — occupies column 2 */}
      <div className="app-main">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-30 bg-brand-900 text-white px-4 py-3 flex items-center gap-3">
          <button onClick={() => setDrawerOpen(true)} aria-label="Open navigation"
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 transition">
            {drawerOpen ? <IconClose /> : <IconMenu />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{workspace?.companyName || 'Admin Panel'}</p>
            {workspace && <p className="text-[11px] text-brand-300 truncate">{workspace.recruitmentDriveName}</p>}
          </div>
        </header>

        {/* Page header */}
        {(title || actions) && (
          <div className="bg-white border-b border-surface-200">
            <div className="app-content !py-5 flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                {breadcrumb && (
                  <nav className="flex items-center gap-1.5 text-[12px] text-ink-400 mb-1.5">
                    {breadcrumb.map((crumb, i) => (
                      <span key={i} className="flex items-center gap-1.5">
                        {i > 0 && <IconChevronRight size={13} className="text-surface-300" />}
                        {crumb.to
                          ? <Link to={crumb.to} className="hover:text-brand-700 transition-colors">{crumb.label}</Link>
                          : <span className="text-ink-600 font-medium">{crumb.label}</span>}
                      </span>
                    ))}
                  </nav>
                )}
                <h1 className="font-heading text-[26px] leading-tight font-bold text-ink-900 truncate">{title}</h1>
                {subtitle && <p className="text-[13.5px] text-ink-500 mt-1">{subtitle}</p>}
              </div>
              {actions && <div className="flex items-center gap-2.5 flex-wrap">{actions}</div>}
            </div>
          </div>
        )}

        <main className="app-content flex-1 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}
