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
