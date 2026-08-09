export const ROLE_HOME = {
  cho: '/dashboard',
  bhw: '/bhw',
  supervisor: '/supervisor',
  admin: '/dashboard',
  viewer: '/dashboard',
}

export function getAuthSession() {
  try {
    const session = JSON.parse(localStorage.getItem('dengue-auth-session') || '{}')

    if (!session || !session.isAuthenticated || !session.accessToken) {
      return null
    }

    if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem('dengue-auth-session')
      return null
    }

    return session
  } catch {
    return null
  }
}

export function getUserRole() {
  return getAuthSession()?.role || ''
}

export function getRoleHome(role = '') {
  return ROLE_HOME[role] || '/dashboard'
}

export function canAccessRole(allowedRoles = []) {
  const session = getAuthSession()
  if (!session) return false
  if (!allowedRoles.length) return true
  return allowedRoles.includes(session.role)
}
