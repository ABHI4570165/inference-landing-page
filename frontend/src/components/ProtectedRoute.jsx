import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ADMIN_LOGIN } from '../utils/routes'

export default function ProtectedRoute({ children }) {
  const { isAuth } = useAuth()
  return isAuth ? children : <Navigate to={ADMIN_LOGIN} replace />
}
