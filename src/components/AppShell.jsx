import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  CalendarDays,
  CheckCheck,
  ChevronDown,
  LayoutDashboard,
  Map,
  Upload,
  BarChart3,
  FileText,
  LogOut,
  Loader2,
  Moon,
  Sun,
  Menu,
  X,
} from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useData } from '../context/DataContext'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/upload', label: 'Upload', icon: Upload },
  { to: '/forecast', label: 'Forecast', icon: BarChart3 },
  { to: '/map', label: 'Map', icon: Map },
  { to: '/reports', label: 'Reports', icon: FileText },
]

function getRecordPeriod(record) {
  return (
    record?.reportingDate ||
    record?.reporting_date ||
    record?.date ||
    record?.week ||
    record?.epi_week ||
    ''
  )
}

function getInitialTheme() {
  const savedTheme = localStorage.getItem('dengue-theme-mode')

  if (savedTheme === 'dark' || savedTheme === 'light') {
    return savedTheme
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches

  return prefersDark ? 'dark' : 'light'
}

function getInitialReadNotifications() {
  try {
    const saved = JSON.parse(localStorage.getItem('dengue-read-notifications') || '[]')

    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

function getNotificationDot(type) {
  if (type === 'danger') return 'bg-rose-500'
  if (type === 'warning') return 'bg-amber-500'
  if (type === 'success') return 'bg-emerald-500'
  if (type === 'activity') return 'bg-blue-500'
  return 'bg-slate-400'
}

function getActivityNotificationTarget(log = {}) {
  const action = String(log.action || '').toLowerCase()
  const details = String(log.details || '').toLowerCase()

  if (action.includes('upload') || details.includes('upload')) {
    return {
      to: '/upload',
      hash: 'data-upload',
    }
  }

  if (
    action.includes('forecast') ||
    details.includes('forecast') ||
    action.includes('risk')
  ) {
    return {
      to: '/forecast',
      hash: 'top-barangays',
    }
  }

  if (
    action.includes('map') ||
    details.includes('map') ||
    action.includes('barangay selected') ||
    details.includes('barangay selected')
  ) {
    return {
      to: '/map',
      hash: 'hotspot-map',
    }
  }

  if (
    action.includes('report') ||
    details.includes('report') ||
    action.includes('export')
  ) {
    return {
      to: '/reports',
      hash: 'priority-barangays',
    }
  }

  return {
    to: '/dashboard',
    hash: 'dashboard-summary',
  }
}

export default function AppShell({ children }) {
  const location = useLocation()
  const navigate = useNavigate()

  const {
    dengueRecords = [],
    riskRows = [],
    sourceStatus = {},
    activityLogs = [],
    addActivityLog,
  } = useData()

  const [loggingOut, setLoggingOut] = useState(false)
  const [theme, setTheme] = useState(getInitialTheme)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [readNotificationIds, setReadNotificationIds] = useState(getInitialReadNotifications)

  const isDark = theme === 'dark'

  const title =
    navItems.find((item) => item.to === location.pathname)?.label || 'Dashboard'

  const hasDengueData =
    dengueRecords.length > 0 || Number(sourceStatus?.dengue?.validCount || 0) > 0

  const hasBoundaryData = Number(sourceStatus?.boundary?.validCount || 0) > 0

  const latestPeriod = useMemo(() => {
    if (!dengueRecords.length) return 'No period'

    const lastRecord = dengueRecords[dengueRecords.length - 1]
    return getRecordPeriod(lastRecord) || 'Current period'
  }, [dengueRecords])

  const systemStatus = hasDengueData
    ? {
        label: 'Dataset loaded',
        badge: 'Ready',
        chip: 'bg-emerald-50 text-brand-green dark:bg-emerald-500/10 dark:text-emerald-300',
        badgeStyle: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
      }
    : {
        label: 'Waiting for dataset',
        badge: 'Pending',
        chip: 'bg-amber-50 text-brand-orange dark:bg-amber-500/10 dark:text-amber-300',
        badgeStyle: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
      }

  const notifications = useMemo(() => {
    const items = []

    const highRiskRows = riskRows.filter((row) => row.risk === 'High')
    const moderateRiskRows = riskRows.filter((row) => row.risk === 'Moderate')
    const lowRiskRows = riskRows.filter((row) => row.risk === 'Low')
    const topBarangay = riskRows[0]

    if (!hasDengueData) {
      items.push({
        id: 'dengue-dataset-pending',
        title: 'Dengue dataset pending',
        message: 'Upload and validate historical dengue records before barangay risk statuses can be generated.',
        type: 'warning',
        to: '/upload',
        hash: 'data-upload',
      })
    }

    if (hasDengueData && riskRows.length === 0) {
      items.push({
        id: 'risk-scoring-pending',
        title: 'Risk scoring pending',
        message: 'Dengue records are loaded, but no barangay risk ranking has been computed yet.',
        type: 'warning',
        to: '/forecast',
        hash: 'forecast-model',
      })
    }

    if (highRiskRows.length > 0) {
      const names = highRiskRows
        .slice(0, 3)
        .map((row) => row.barangay)
        .join(', ')

      items.push({
        id: `high-risk-${highRiskRows.length}-${names}`,
        title: `${highRiskRows.length} high-risk barangay${highRiskRows.length === 1 ? '' : 's'}`,
        message: `${names}${highRiskRows.length > 3 ? ', and others' : ''} require priority monitoring and early response planning.`,
        type: 'danger',
        to: '/forecast',
        hash: 'top-barangays',
      })
    }

    if (moderateRiskRows.length > 0) {
      const names = moderateRiskRows
        .slice(0, 3)
        .map((row) => row.barangay)
        .join(', ')

      items.push({
        id: `moderate-risk-${moderateRiskRows.length}-${names}`,
        title: `${moderateRiskRows.length} moderate-risk barangay${moderateRiskRows.length === 1 ? '' : 's'}`,
        message: `${names}${moderateRiskRows.length > 3 ? ', and others' : ''} should be monitored for possible escalation.`,
        type: 'warning',
        to: '/forecast',
        hash: 'risk-summary',
      })
    }

    if (topBarangay) {
      items.push({
        id: `top-priority-${topBarangay.barangay}-${topBarangay.risk}-${topBarangay.forecast}`,
        title: `Top priority: ${topBarangay.barangay}`,
        message: `${topBarangay.forecast || 0} projected cases, ${topBarangay.totalCases || 0} historical cases, classified as ${topBarangay.risk} risk.`,
        type: topBarangay.risk === 'High' ? 'danger' : topBarangay.risk === 'Moderate' ? 'warning' : 'success',
        to: '/forecast',
        hash: 'top-barangays',
      })
    }

    if (
      hasDengueData &&
      riskRows.length > 0 &&
      highRiskRows.length === 0 &&
      moderateRiskRows.length === 0 &&
      lowRiskRows.length > 0
    ) {
      items.push({
        id: 'barangay-risk-status-stable',
        title: 'Barangay risk status stable',
        message: 'All currently ranked barangays are classified as low risk under the available records.',
        type: 'success',
        to: '/dashboard',
        hash: 'dashboard-summary',
      })
    }

    if (!hasBoundaryData) {
      items.push({
        id: 'boundary-layer-pending',
        title: 'Boundary layer pending',
        message: 'Upload a barangay boundary GeoJSON file before using the final GIS map layer.',
        type: 'warning',
        to: '/upload',
        hash: 'boundary-upload',
      })
    }

    if (activityLogs.length > 0) {
      activityLogs.slice(0, 2).forEach((log, index) => {
        const target = getActivityNotificationTarget(log)

        items.push({
          id: `activity-${log.id || index}-${log.action}`,
          title: log.action,
          message: log.details,
          type: 'activity',
          ...target,
        })
      })
    }

    if (!items.length) {
      items.push({
        id: 'no-active-alerts',
        title: 'No active alerts',
        message: 'There are no dengue risk alerts or pending dataset requirements at this time.',
        type: 'success',
        to: '/dashboard',
        hash: 'dashboard-summary',
      })
    }

    return items
  }, [hasDengueData, hasBoundaryData, riskRows, activityLogs])

  const unreadNotifications = useMemo(() => {
    return notifications.filter((item) => !readNotificationIds.includes(item.id))
  }, [notifications, readNotificationIds])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('dengue-theme-mode', theme)
  }, [theme, isDark])

  useEffect(() => {
    localStorage.setItem(
      'dengue-read-notifications',
      JSON.stringify(readNotificationIds.slice(-150))
    )
  }, [readNotificationIds])

  useEffect(() => {
    setNotificationsOpen(false)
    setMobileNavOpen(false)
  }, [location.pathname])

  function handleThemeToggle() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  function markNotificationAsRead(notificationId) {
    setReadNotificationIds((current) => {
      if (current.includes(notificationId)) {
        return current
      }

      return [...current, notificationId].slice(-150)
    })
  }

  function markAllNotificationsAsRead() {
    setReadNotificationIds((current) => {
      const merged = new Set(current)

      notifications.forEach((item) => {
        merged.add(item.id)
      })

      return Array.from(merged).slice(-150)
    })
  }

  function handleNotificationClick(item) {
    markNotificationAsRead(item.id)
    setNotificationsOpen(false)

    const targetPath = item.hash ? `${item.to}#${item.hash}` : item.to

    navigate(targetPath)

    window.setTimeout(() => {
      if (!item.hash) return

      const targetElement = document.getElementById(item.hash)

      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      }
    }, 180)
  }

  function handleLogout() {
    if (loggingOut) return

    setLoggingOut(true)

    addActivityLog?.(
      'User signed out',
      'The current user signed out of the CHO prototype.'
    )

    setTimeout(() => {
      localStorage.removeItem('dengue-auth-session')
      navigate('/', { replace: true })
    }, 800)
  }

  return (
    <div className="relative min-h-screen bg-brand-bg px-3 py-3 text-brand-text transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100 sm:px-5 sm:py-5 lg:px-6">
      {loggingOut && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
          <div className="rounded-[28px] border border-white/70 bg-white px-8 py-7 text-center shadow-[0_24px_60px_rgba(15,23,42,0.25)] dark:border-slate-700 dark:bg-slate-900">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-brand-blue dark:bg-blue-500/10 dark:text-blue-300">
              <Loader2 className="animate-spin" size={28} />
            </div>

            <h3 className="mt-4 text-lg font-bold text-brand-text dark:text-slate-100">
              Logging out
            </h3>

            <p className="mt-1 text-sm text-brand-muted dark:text-slate-400">
              Please wait while your session is being closed.
            </p>
          </div>
        </div>
      )}

      <div className="sticky top-3 z-[80] mb-3 rounded-[24px] border border-brand-line bg-white/95 px-4 py-3 shadow-soft backdrop-blur transition-colors duration-300 dark:border-slate-800 dark:bg-slate-900/95 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-navy text-base font-bold text-white shadow-sm dark:bg-blue-500/15 dark:text-blue-200">
              D
            </div>

            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-brand-text dark:text-slate-100">
                Butuan City
              </p>

              <p className="truncate text-xs text-brand-muted dark:text-slate-400">
                {title}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-brand-line bg-white text-brand-text shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            aria-label="Open navigation menu"
          >
            <Menu size={21} />
          </button>
        </div>
      </div>

      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-[90] bg-slate-950/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-[100] flex h-full w-[84%] max-w-[320px] transform flex-col overflow-y-auto bg-brand-navy px-5 py-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.35)] transition-transform duration-300 dark:border-r dark:border-slate-800 dark:bg-slate-950 lg:hidden ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-8 flex shrink-0 items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-lg font-bold text-brand-navy shadow-sm dark:bg-blue-500/15 dark:text-blue-200">
              D
            </div>

            <div>
              <p className="text-lg font-semibold">Butuan City</p>

              <p className="text-sm text-slate-300 dark:text-slate-400">
                CHO Prototype
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white transition hover:bg-white/15 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
            aria-label="Close navigation menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="space-y-2">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileNavOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                  isActive
                    ? 'bg-white/15 text-white shadow-soft dark:bg-blue-500/20 dark:text-blue-100'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto shrink-0 space-y-3 pt-8">
          <button
            type="button"
            onClick={handleThemeToggle}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            {isDark ? (
              <>
                <Sun size={17} />
                Light mode
              </>
            ) : (
              <>
                <Moon size={17} />
                Dark mode
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            {loggingOut ? (
              <>
                <Loader2 className="animate-spin" size={17} />
                Logging out...
              </>
            ) : (
              <>
                <LogOut size={17} />
                Logout
              </>
            )}
          </button>

          <div className="rounded-3xl border border-white/10 bg-white/10 p-4 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 dark:text-slate-500">
              System status
            </p>

            <p className="mt-3 text-sm text-slate-100 dark:text-slate-300">
              {systemStatus.label}
            </p>

            <span
              className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${systemStatus.badgeStyle}`}
            >
              {systemStatus.badge}
            </span>
          </div>
        </div>
      </aside>

      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1500px] items-start gap-5 sm:min-h-[calc(100vh-2.5rem)]">
        <aside className="sticky top-5 hidden h-[calc(100vh-2.5rem)] w-[270px] shrink-0 flex-col overflow-hidden rounded-[28px] bg-brand-navy px-5 py-6 text-white shadow-soft transition-colors duration-300 dark:border dark:border-slate-800 dark:bg-slate-950 lg:flex">
          <div className="mb-8 flex shrink-0 items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-lg font-bold text-brand-navy shadow-sm dark:bg-blue-500/15 dark:text-blue-200">
              D
            </div>

            <div>
              <p className="text-lg font-semibold">Butuan City</p>

              <p className="text-sm text-slate-300 dark:text-slate-400">
                CHO Prototype
              </p>
            </div>
          </div>

          <nav className="space-y-2 overflow-y-auto pr-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    isActive
                      ? 'bg-white/15 text-white shadow-soft dark:bg-blue-500/20 dark:text-blue-100'
                      : 'text-slate-200 hover:bg-white/10 hover:text-white dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto shrink-0 space-y-3">
            <button
              type="button"
              onClick={handleThemeToggle}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              {isDark ? (
                <>
                  <Sun size={17} />
                  Light mode
                </>
              ) : (
                <>
                  <Moon size={17} />
                  Dark mode
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              {loggingOut ? (
                <>
                  <Loader2 className="animate-spin" size={17} />
                  Logging out...
                </>
              ) : (
                <>
                  <LogOut size={17} />
                  Logout
                </>
              )}
            </button>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 dark:text-slate-500">
                System status
              </p>

              <p className="mt-3 text-sm text-slate-100 dark:text-slate-300">
                {systemStatus.label}
              </p>

              <span
                className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${systemStatus.badgeStyle}`}
              >
                {systemStatus.badge}
              </span>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="panel min-h-full p-3 transition-colors duration-300 dark:border-slate-800 dark:bg-slate-900/80 sm:p-5 lg:p-6">
            <header className="mb-6 flex flex-col gap-4 rounded-[24px] border border-brand-line bg-slate-50/80 px-4 py-4 transition-colors duration-300 dark:border-slate-800 dark:bg-slate-950/70 sm:px-5 sm:py-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-brand-text dark:text-slate-100">
                  {title}
                </h1>

                <p className="text-sm text-brand-muted dark:text-slate-400">
                  Barangay-Level Dengue Outbreak Prevention System
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="chip bg-blue-50 text-brand-blue dark:bg-blue-500/10 dark:text-blue-300">
                  Butuan City
                </span>

                <span className={`chip ${systemStatus.chip}`}>
                  {systemStatus.label}
                </span>

                <button
                  type="button"
                  onClick={handleThemeToggle}
                  className="flex items-center gap-2 rounded-2xl border border-brand-line bg-white px-3 py-2 text-sm font-semibold text-brand-muted shadow-sm transition hover:text-brand-text dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  {isDark ? <Sun size={16} /> : <Moon size={16} />}
                  {isDark ? 'Light' : 'Dark'}
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setNotificationsOpen((current) => !current)}
                    className="relative rounded-2xl border border-brand-line bg-white p-3 text-brand-muted shadow-sm transition hover:text-brand-text dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    aria-label="Notifications"
                  >
                    <Bell size={18} />

                    {unreadNotifications.length > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                        {unreadNotifications.length}
                      </span>
                    )}
                  </button>

                  {notificationsOpen && (
                    <div className="absolute right-0 top-14 z-[999] w-[calc(100vw-2rem)] max-w-[390px] overflow-hidden rounded-[24px] border border-brand-line bg-white shadow-[0_18px_45px_rgba(15,23,42,0.16)] dark:border-slate-700 dark:bg-slate-900 sm:w-[390px]">
                      <div className="border-b border-brand-line px-4 py-3 dark:border-slate-700">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-brand-text dark:text-slate-100">
                              Dengue Notifications
                            </p>

                            <p className="text-xs text-brand-muted dark:text-slate-400">
                              Barangay risk status, dataset readiness, and activity updates
                            </p>
                          </div>

                          {notifications.length > 0 && (
                            <button
                              type="button"
                              onClick={markAllNotificationsAsRead}
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-brand-muted transition hover:border-brand-blue/30 hover:text-brand-blue dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-blue-300"
                            >
                              <CheckCheck className="h-3.5 w-3.5" />
                              Mark all read
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="max-h-[360px] overflow-y-auto p-3">
                        {notifications.map((item, index) => {
                          const isRead = readNotificationIds.includes(item.id)

                          return (
                            <button
                              key={`${item.id}-${index}`}
                              type="button"
                              onClick={() => handleNotificationClick(item)}
                              className={`mb-2 w-full rounded-[18px] border p-3 text-left transition last:mb-0 hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-sm dark:hover:border-blue-500/30 ${
                                isRead
                                  ? 'border-slate-100 bg-slate-50 opacity-70 dark:border-slate-700 dark:bg-slate-950'
                                  : 'border-blue-100 bg-blue-50/70 dark:border-blue-500/20 dark:bg-blue-500/10'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <span
                                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${getNotificationDot(item.type)}`}
                                />

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-semibold text-brand-text dark:text-slate-100">
                                      {item.title}
                                    </p>

                                    {!isRead && (
                                      <span className="shrink-0 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
                                        New
                                      </span>
                                    )}
                                  </div>

                                  <p className="mt-1 text-xs leading-5 text-brand-muted dark:text-slate-400">
                                    {item.message}
                                  </p>

                                  <p className="mt-2 text-[11px] font-bold text-brand-blue dark:text-blue-300">
                                    Open related page
                                  </p>
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="flex items-center gap-2 rounded-2xl border border-brand-line bg-white px-3 py-2 text-sm font-medium shadow-sm transition hover:border-brand-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <CalendarDays size={16} />
                  {latestPeriod}
                  <ChevronDown size={14} />
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="flex items-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-semibold text-brand-red shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/15"
                >
                  {loggingOut ? (
                    <>
                      <Loader2 className="animate-spin" size={16} />
                      Logging out...
                    </>
                  ) : (
                    <>
                      <LogOut size={16} />
                      Logout
                    </>
                  )}
                </button>
              </div>
            </header>

            {children}
          </div>
        </main>
      </div>
    </div>
  )
}