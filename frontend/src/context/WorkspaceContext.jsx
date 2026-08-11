import { createContext, useContext, useState } from 'react'

const WorkspaceContext = createContext(null)

const WS_ID_KEY = 'active_workspace_id'
const WS_META_KEY = 'active_workspace_meta'

// The currently selected recruitment workspace. Persisted across page loads
// (and across navigating between modules) but NOT across logout — AuthContext
// clears these same keys on logout. api.js reads active_workspace_id directly
// from localStorage and attaches it as the X-Workspace-Id header on every
// request, so switching workspaces here is all a page needs to do; no
// individual page's API calls need to change.
export function WorkspaceProvider({ children }) {
  const [workspace, setWorkspaceState] = useState(() => {
    const raw = localStorage.getItem(WS_META_KEY)
    if (!raw) return null
    try { return JSON.parse(raw) } catch { return null }
  })

  function setWorkspace(ws) {
    if (!ws) {
      localStorage.removeItem(WS_ID_KEY)
      localStorage.removeItem(WS_META_KEY)
      setWorkspaceState(null)
      return
    }
    localStorage.setItem(WS_ID_KEY, ws._id)
    localStorage.setItem(WS_META_KEY, JSON.stringify(ws))
    setWorkspaceState(ws)
  }

  function clearWorkspace() {
    setWorkspace(null)
  }

  return (
    <WorkspaceContext.Provider value={{ workspace, setWorkspace, clearWorkspace, hasWorkspace: !!workspace }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export const useWorkspace = () => useContext(WorkspaceContext)
