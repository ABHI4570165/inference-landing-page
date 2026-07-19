import axios from 'axios'
import { ADMIN_BASE, ADMIN_LOGIN } from './routes'

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api'
})

// Attach the admin token — unless the request already carries its own
// Authorization header (e.g. the public counselling form's session token)
API.interceptors.request.use(config => {
  const token = localStorage.getItem('admin_token')
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Expired / invalid / missing token on an admin page → clear the session and
// send the user back to the login screen. Public form pages are unaffected.
API.interceptors.response.use(
  res => res,
  err => {
    const status = err.response?.status
    const onAdminPage = window.location.pathname.startsWith(ADMIN_BASE)
    const onLoginPage = window.location.pathname === ADMIN_LOGIN
    if ((status === 401 || status === 403) && onAdminPage && !onLoginPage) {
      localStorage.removeItem('admin_token')
      window.location.replace(ADMIN_LOGIN)
    }
    return Promise.reject(err)
  }
)

export default API
