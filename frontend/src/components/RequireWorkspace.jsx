import { Navigate } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import { ADMIN_HOME } from '../utils/routes'

// Guards every workspace-scoped module (Applications, Attendance, History,
// Reception, Counselling, Colleges, the workspace dashboard). Without an
// active workspace there is nothing valid to show — send the admin back to
// the Global Home to pick or create one first.
export default function RequireWorkspace({ children }) {
  const { hasWorkspace } = useWorkspace()
  return hasWorkspace ? children : <Navigate to={ADMIN_HOME} replace />
}
