import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { ADMIN_LOGIN, ADMIN_HOME, ADMIN_WORKSPACE_DASHBOARD } from '../utils/routes'
import { IconHome, IconBuilding, IconSwitch, IconLogout, IconArrowRight } from './Icons'

function initialsOf(name) {
  return (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?'
}

// Sidebar for the Global Home (Level 1) page — the workspace picker. Shares the
// visual language of the workspace-scoped shell in AdminLayout, but its nav is
// deliberately minimal: nothing here is workspace-scoped yet.
export default function GlobalSidebar() {
  const { admin, logout } = useAuth()
  const { workspace, clearWorkspace } = useWorkspace()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate(ADMIN_LOGIN)
  }

  const adminName = admin?.email ? admin.email.split('@')[0] : 'Admin'

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar-inner flex flex-col">
      {/* Brand */}
      <div className="px-5 py-[18px] flex items-center gap-2.5 border-b border-white/10">
        <img src="/mandi-logo.png" alt="" className="w-8 h-8 rounded-lg bg-white p-0.5 object-contain flex-shrink-0" />
        <div className="min-w-0">
          <p className="font-heading font-bold text-[15px] leading-tight">Recruitment</p>
          <p className="text-[11px] text-brand-300 leading-tight">Management Platform</p>
        </div>
      </div>

      {/* Active workspace */}
      <div className="p-3 border-b border-white/10">
        {workspace ? (
          <>
            <p className="px-1 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-400/80">
              Current Workspace
            </p>
            <Link
              to={ADMIN_WORKSPACE_DASHBOARD}
              className="group block bg-white/[0.07] hover:bg-white/[0.13] border border-white/10 rounded-xl
                         px-3 py-2.5 transition-all duration-200 mb-2"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-500 flex items-center justify-center
                                font-heading font-bold text-[11px] flex-shrink-0">
                  {initialsOf(workspace.companyName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold truncate leading-tight">{workspace.companyName}</p>
                  <p className="text-[11px] text-brand-300 truncate leading-tight mt-0.5">{workspace.recruitmentDriveName}</p>
                </div>
                <IconArrowRight className="text-brand-300 group-hover:text-white transition-colors flex-shrink-0" />
              </div>
            </Link>
            <button
              onClick={clearWorkspace}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium
                         text-brand-200 hover:text-white hover:bg-white/[0.07] transition-all duration-200"
            >
              <IconSwitch /> Clear selection
            </button>
          </>
        ) : (
          <p className="text-[12px] text-brand-300 px-1 py-1 leading-relaxed">
            No workspace selected — open one from the list.
          </p>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scroll-slim p-3">
        <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-400/80">Global</p>
        <div className="space-y-0.5">
          <Link to={ADMIN_HOME}
            className="relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium bg-white/[0.14] text-white">
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-brand-300" />
            <IconHome size={17} /> Home
          </Link>
          <Link to={ADMIN_HOME}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium
                       text-brand-200 hover:text-white hover:bg-white/[0.07] transition-all duration-200">
            <IconBuilding size={17} className="text-brand-300" /> Workspaces
          </Link>
        </div>
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
        <button onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium
                     text-brand-200 hover:text-white hover:bg-white/[0.07] transition-all duration-200">
          <IconLogout /> Logout
        </button>
      </div>
      </div>
    </aside>
  )
}
