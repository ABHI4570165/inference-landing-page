import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('admin_token'))
  const [admin, setAdmin] = useState(() => {
    const t = localStorage.getItem('admin_token')
    if (!t) return null
    try {
      const payload = JSON.parse(atob(t.split('.')[1]))
      return { email: payload.email }
    } catch { return null }
  })

  const login = (token, email) => {
    localStorage.setItem('admin_token', token)
    setToken(token)
    setAdmin({ email })
  }

  const logout = () => {
    localStorage.removeItem('admin_token')
    // Active workspace selection belongs to this session — clear it too so
    // the next login starts back at the Global Home workspace picker.
    localStorage.removeItem('active_workspace_id')
    localStorage.removeItem('active_workspace_meta')
    setToken(null)
    setAdmin(null)
  }

  return (
    <AuthContext.Provider value={{ token, admin, login, logout, isAuth: !!token }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
