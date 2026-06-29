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

function ThemeModeSwitch({ isDark, onToggle, compact = false }) {
  const modeLabel = isDark ? 'Dark' : 'Light'
  const actionLabel = isDark ? 'Switch to light mode' : 'Switch to dark mode'
  const ModeIcon = isDark ? Moon : Sun

  const switchSize = compact ? 'h-11 w-[118px]' : 'h-12 w-full'
  const knobSize = compact ? 'w-[76px]' : 'w-[98px]'
  const knobPosition = isDark ? 'right-1' : 'left-1'

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={actionLabel}
      title={actionLabel}
      className={`group relative inline-flex shrink-0 items-center overflow-hidden rounded-full border border-white/20 bg-[#111827] text-white transition duration-300 hover:-translate-y-0.5 ${switchSize}`}
      style={{
        boxShadow:
          'inset 0 2px 5px rgba(255,255,255,0.12), inset 0 -10px 18px rgba(0,0,0,0.58), 0 14px 30px rgba(15,23,42,0.24)',
      }}
    >
      <span
        className={`absolute inset-y-1 rounded-full transition-all duration-300 ${
          isDark
            ? 'right-1 w-[58%] bg-gradient-to-r from-sky-500 to-cyan-300 shadow-[0_0_24px_rgba(14,165,233,0.78)]'
            : 'left-1 w-[58%] bg-gradient-to-r from-orange-500 to-amber-300 shadow-[0_0_24px_rgba(249,115,22,0.78)]'
        }`}
      />

      <span
        className={`absolute top-1/2 z-[3] h-2.5 w-2.5 -translate-y-1/2 rounded-full transition-all duration-300 ${
          isDark
            ? 'left-4 bg-sky-300 shadow-[0_0_12px_rgba(125,211,252,0.95)]'
            : 'right-4 bg-orange-300 shadow-[0_0_12px_rgba(251,146,60,0.95)]'
        }`}
      />

      <span
        className={`absolute z-10 flex h-9 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 via-slate-900 to-black px-3 text-[10px] font-black uppercase tracking-[0.12em] text-white ring-1 ring-white/10 transition-all duration-300 ${knobPosition} ${knobSize}`}
        style={{
          boxShadow:
            'inset 0 1px 2px rgba(255,255,255,0.16), inset 0 -8px 14px rgba(0,0,0,0.65), 0 8px 18px rgba(0,0,0,0.45)',
        }}
      >
        <ModeIcon className="mr-1.5 h-3.5 w-3.5" />
        {modeLabel}
      </span>
    </button>
  )
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
    <div className="relative min-h-screen bg-slate-100 px-3 py-3 text-brand-text transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100 sm:px-5 sm:py-5 lg:px-6">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-blue-200/60 blur-3xl dark:bg-blue-500/10" />
      <div className="pointer-events-none absolute -right-32 top-40 h-96 w-96 rounded-full bg-emerald-200/50 blur-3xl dark:bg-emerald-500/10" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-sky-100/70 blur-3xl dark:bg-sky-500/5" />

      {loggingOut && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-md">
          <div className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white px-8 py-7 text-center shadow-[0_28px_80px_rgba(15,23,42,0.30)] dark:border-slate-700 dark:bg-slate-900">
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-blue-100 blur-2xl dark:bg-blue-500/10" />

            <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-blue-50 text-brand-blue shadow-sm ring-1 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/20">
              <Loader2 className="animate-spin" size={30} />
            </div>

            <h3 className="relative mt-4 text-lg font-black text-brand-text dark:text-slate-100">
              Logging out
            </h3>

            <p className="relative mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
              Please wait while your session is being closed.
            </p>
          </div>
        </div>
      )}

      <div className="sticky top-3 z-[80] mb-3 overflow-hidden rounded-[26px] border border-white/80 bg-white/90 px-4 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.10)] ring-1 ring-slate-200/60 backdrop-blur-xl transition-colors duration-300 dark:border-slate-800 dark:bg-slate-900/90 dark:ring-white/5 lg:hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/60 to-transparent" />

        <div className="relative flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br from-brand-navy to-brand-blue text-base font-black text-white shadow-[0_12px_28px_rgba(37,95,143,0.22)]">
              D
            </div>

            <div className="min-w-0">
              <p className="truncate text-sm font-black text-brand-text dark:text-slate-100">
                Butuan City
              </p>

              <p className="truncate text-xs font-semibold text-brand-muted dark:text-slate-400">
                {title}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-brand-text shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue/30 hover:text-brand-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
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
          className="fixed inset-0 z-[90] bg-slate-950/60 backdrop-blur-md lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-[100] flex h-full w-[86%] max-w-[340px] transform flex-col overflow-y-auto bg-gradient-to-b from-[#0b1733] via-brand-navy to-[#1e4770] px-5 py-6 text-white shadow-[0_28px_90px_rgba(15,23,42,0.42)] transition-transform duration-300 dark:border-r dark:border-slate-800 dark:from-[#0b1733] dark:via-brand-navy dark:to-[#1e4770] lg:hidden ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-0 h-60 w-60 rounded-full bg-emerald-400/15 blur-3xl" />

        <div className="relative mb-8 flex shrink-0 items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[22px] bg-white text-lg font-black text-brand-navy shadow-sm">
              D
            </div>

            <div>
              <p className="text-lg font-black">Butuan City</p>

              <p className="text-sm font-medium text-white/60">
                CHO Prototype
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white transition hover:bg-white/15"
            aria-label="Close navigation menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="relative space-y-2">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileNavOpen(false)}
              style={({ isActive }) =>
                isActive
                  ? {
                      backgroundColor: '#ffffff',
                      color: '#0f2742',
                      boxShadow: 'none',
                    }
                  : undefined
              }
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-[20px] px-4 py-3 text-sm font-bold transition ${
                  isActive
                    ? ''
                    : 'text-white/75 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    style={
                      isActive
                        ? {
                            backgroundColor: '#f1f5f9',
                            color: '#255f8f',
                          }
                        : undefined
                    }
                    className={`flex h-9 w-9 items-center justify-center rounded-2xl text-current transition ${
                      isActive ? '' : 'bg-white/10 group-hover:bg-white/15'
                    }`}
                  >
                    <Icon size={18} />
                  </span>

                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="relative mt-auto shrink-0 space-y-3 pt-8">
          <ThemeModeSwitch isDark={isDark} onToggle={handleThemeToggle} />

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full items-center justify-center gap-2 rounded-[20px] border border-white/15 bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-70"
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

          <div className="rounded-[28px] border border-white/10 bg-white/10 p-4 shadow-inner backdrop-blur">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/50">
              System status
            </p>

            <p className="mt-3 text-sm font-semibold text-white/90">
              {systemStatus.label}
            </p>

            <span
              className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-black ${systemStatus.badgeStyle}`}
            >
              {systemStatus.badge}
            </span>
          </div>
        </div>
      </aside>

      <div className="relative mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1540px] items-start gap-5 sm:min-h-[calc(100vh-2.5rem)]">
        <aside className="sticky top-5 z-[60] hidden h-[calc(100vh-2.5rem)] w-[292px] shrink-0 flex-col overflow-hidden rounded-[34px] border border-white/10 bg-gradient-to-b from-[#0b1733] via-brand-navy to-[#1e4770] px-5 py-6 text-white shadow-[0_24px_70px_rgba(15,23,42,0.28)] ring-1 ring-white/10 transition-colors duration-300 dark:border-slate-800 dark:from-[#0b1733] dark:via-brand-navy dark:to-[#1e4770] lg:flex">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-0 h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

          <div className="relative mb-8 flex shrink-0 items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-[24px] bg-white text-lg font-black text-brand-navy shadow-[0_14px_34px_rgba(255,255,255,0.14)]">
              D
            </div>

            <div>
              <p className="text-lg font-black">Butuan City</p>

              <p className="text-sm font-medium text-white/60">
                CHO Prototype
              </p>
            </div>
          </div>

          <div className="relative mb-5 overflow-hidden rounded-[28px] border border-white/20 bg-white/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_14px_34px_rgba(15,23,42,0.12)] backdrop-blur">
  <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-blue-300/20 blur-2xl" />
  <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

  <div className="relative flex items-start gap-3">
    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white shadow-inner">
      <LayoutDashboard className="h-5 w-5" />
    </div>

    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/50">
        Workspace
      </p>

      <p className="mt-2 text-sm font-black leading-5 text-white">
        Dengue Outbreak Prevention
      </p>

      <p className="mt-1 text-xs leading-5 text-white/60">
        Butuan City CHO monitoring workspace
      </p>
    </div>
  </div>

  <div className="relative mt-4 grid grid-cols-2 gap-2">
    <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40">
        Status
      </p>

      <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${systemStatus.badgeStyle}`}>
        {systemStatus.badge}
      </span>
    </div>

    <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40">
        Area
      </p>

      <span className="mt-1 inline-flex rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-black text-white/75">
        Butuan
      </span>
    </div>
  </div>
</div>

          <nav className="relative space-y-2 overflow-y-auto pr-1">
            <p className="px-3 pb-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/40">
              Navigation
            </p>

            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                style={({ isActive }) =>
                  isActive
                    ? {
                        backgroundColor: '#ffffff',
                        color: '#0f2742',
                        boxShadow: 'none',
                      }
                    : undefined
                }
                className={({ isActive }) =>
                  `group relative flex items-center gap-3 rounded-[22px] px-4 py-3 text-sm font-bold transition ${
                    isActive
                      ? ''
                      : 'text-white/75 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      style={
                        isActive
                          ? {
                              backgroundColor: '#f1f5f9',
                              color: '#255f8f',
                            }
                          : undefined
                      }
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-current transition ${
                        isActive ? '' : 'bg-white/10 group-hover:bg-white/15'
                      }`}
                    >
                      <Icon size={18} />
                    </span>

                    <span>{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="relative mt-auto shrink-0 space-y-3 pt-6">
            <ThemeModeSwitch isDark={isDark} onToggle={handleThemeToggle} />

            

            <div className="relative overflow-hidden rounded-[28px] border border-white/20 bg-white/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_14px_34px_rgba(15,23,42,0.12)] backdrop-blur">
  <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-300/20 blur-2xl" />
  <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

  <div className="relative flex items-start justify-between gap-3">
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/50">
        System status
      </p>

      <p className="mt-2 text-sm font-black leading-5 text-white">
        {systemStatus.label}
      </p>

      <p className="mt-1 text-xs leading-5 text-white/60">
        Dataset and workspace readiness
      </p>
    </div>

    <span className="mt-1 flex h-3 w-3 shrink-0 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.85)]" />
  </div>

  <div className="relative mt-4 rounded-2xl border border-white/10 bg-black/10 p-3">
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/45">
        Readiness
      </span>

      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${systemStatus.badgeStyle}`}>
        {systemStatus.badge}
      </span>
    </div>

    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
      <div
        className={`h-full rounded-full ${
          hasDengueData
            ? 'w-full bg-gradient-to-r from-emerald-300 to-teal-300'
            : 'w-1/2 bg-gradient-to-r from-amber-300 to-orange-300'
        }`}
      />
    </div>
  </div>
</div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="min-h-full rounded-[34px] border border-white/80 bg-white/85 p-3 shadow-[0_24px_70px_rgba(15,23,42,0.10)] ring-1 ring-slate-200/70 backdrop-blur-xl transition-colors duration-300 dark:border-slate-800 dark:bg-slate-900/80 dark:ring-white/5 sm:p-5 lg:p-6">
            <header className="relative z-[200] mb-6 overflow-visible rounded-[28px] border border-slate-200/80 bg-white/95 px-4 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.10)] ring-1 ring-white/70 backdrop-blur-xl transition-colors duration-300 dark:border-slate-800 dark:bg-slate-950/95 dark:ring-white/5 sm:px-5 sm:py-5">
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-brand-blue/40 to-transparent" />

              <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                      Butuan City
                    </span>

                    <span className={`rounded-full px-3 py-1 text-[11px] font-black ${systemStatus.chip}`}>
                      {systemStatus.label}
                    </span>
                  </div>

                  <h1 className="text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
                    {title}
                  </h1>

                  <p className="text-sm leading-6 text-brand-muted dark:text-slate-400">
                    Barangay-Level Dengue Outbreak Prevention System
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <ThemeModeSwitch isDark={isDark} onToggle={handleThemeToggle} compact />

                  <div className="relative z-[300]">
                    <button
                      type="button"
                      onClick={() => setNotificationsOpen((current) => !current)}
                      className="relative rounded-2xl border border-slate-200 bg-white p-3 text-brand-muted shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue/30 hover:text-brand-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                      aria-label="Notifications"
                    >
                      <Bell size={18} />

                      {unreadNotifications.length > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-black text-white ring-2 ring-white dark:ring-slate-950">
                          {unreadNotifications.length}
                        </span>
                      )}
                    </button>

                    {notificationsOpen && (
                      <div className="absolute right-0 top-14 z-[9999] w-[calc(100vw-2rem)] max-w-[410px] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.20)] ring-1 ring-white/70 backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900 dark:ring-white/5 sm:w-[410px]">
                        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-3 dark:border-slate-800 dark:from-slate-950 dark:to-slate-900">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-black text-brand-text dark:text-slate-100">
                                Dengue Notifications
                              </p>

                              <p className="text-xs leading-5 text-brand-muted dark:text-slate-400">
                                Barangay risk status, dataset readiness, and activity updates
                              </p>
                            </div>

                            {notifications.length > 0 && (
                              <button
                                type="button"
                                onClick={markAllNotificationsAsRead}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black text-brand-muted transition hover:border-brand-blue/30 hover:text-brand-blue dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-blue-300"
                              >
                                <CheckCheck className="h-3.5 w-3.5" />
                                Mark all read
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="max-h-[390px] overflow-y-auto p-3">
                          {notifications.map((item, index) => {
                            const isRead = readNotificationIds.includes(item.id)

                            return (
                              <button
                                key={`${item.id}-${index}`}
                                type="button"
                                onClick={() => handleNotificationClick(item)}
                                className={`mb-2 w-full rounded-[20px] border p-3 text-left transition last:mb-0 hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-sm dark:hover:border-blue-500/30 ${
                                  isRead
                                    ? 'border-slate-200 bg-slate-50 opacity-70 dark:border-slate-700 dark:bg-slate-950'
                                    : 'border-blue-100 bg-blue-50/80 dark:border-blue-500/20 dark:bg-blue-500/10'
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <span
                                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${getNotificationDot(item.type)}`}
                                  />

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="text-sm font-black text-brand-text dark:text-slate-100">
                                        {item.title}
                                      </p>

                                      {!isRead && (
                                        <span className="shrink-0 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white">
                                          New
                                        </span>
                                      )}
                                    </div>

                                    <p className="mt-1 text-xs leading-5 text-brand-muted dark:text-slate-400">
                                      {item.message}
                                    </p>

                                    <p className="mt-2 text-[11px] font-black text-brand-blue dark:text-blue-300">
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
                    className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-brand-muted shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue/30 hover:text-brand-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <CalendarDays size={16} />
                    {latestPeriod}
                    <ChevronDown size={14} />
                  </button>

                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="flex items-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-black text-brand-red shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/15"
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
              </div>
            </header>

            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
