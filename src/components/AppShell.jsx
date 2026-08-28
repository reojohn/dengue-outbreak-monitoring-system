import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Bell,
  BellOff,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  CalendarDays,
  CheckCheck,
  ClipboardCheck,
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
  UsersRound,
  Settings,
  Type,
  Eye,
  MousePointer2,
  RotateCcw,
  Minus,
  Plus,
} from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { getAuthSession, getRoleHome } from '../utils/auth'
import { useData } from '../context/DataContext'
import {
  getBackendNotifications,
  getNotificationPreferences,
  getNotificationReads,
  markNotificationRead as saveNotificationRead,
  markNotificationsRead as saveNotificationsRead,
  updateNotificationPreferences,
  logoutUser,
} from '../services/api'
import { compareCanonicalBarangayPriority, getCanonicalCombinedRiskScore } from '../utils/analytics'
import dengueLogo from '../assets/logodengue2.png'
import LogoutTransition from './LogoutTransition'

const navItems = [
  { to: '/dashboard', label: 'Situation Overview', icon: LayoutDashboard, roles: ['cho', 'supervisor', 'admin', 'viewer'] },
  { to: '/upload', label: 'Data Upload', icon: Upload, roles: ['cho', 'admin'] },
  { to: '/forecast', label: 'Risk Forecast', icon: BarChart3, roles: ['cho', 'supervisor', 'admin'] },
  { to: '/map', label: 'Hotspot Map', icon: Map, roles: ['cho', 'supervisor', 'bhw', 'admin', 'viewer'] },
  { to: '/bhw', label: 'Barangay Workspace', icon: ClipboardCheck, roles: ['bhw', 'cho', 'admin'] },
  { to: '/supervisor', label: 'Response Coordination', icon: ShieldAlert, roles: ['supervisor', 'cho', 'admin'] },
  { to: '/users', label: 'User Accounts', icon: UsersRound, roles: ['cho', 'admin'] },
  { to: '/reports', label: 'Reports', icon: FileText, roles: ['cho', 'supervisor', 'bhw', 'admin', 'viewer'] },
]

const TEXT_SCALE_MIN = 90
const TEXT_SCALE_MAX = 160
const TEXT_SCALE_STEP = 5
const NOTIFICATION_POLL_INTERVAL_MS = 5 * 60 * 1000

function padTwoDigits(value) {
  return String(value).padStart(2, '0')
}

function getValidYear(value) {
  const year = Number(value)

  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    return null
  }

  return year
}

function getValidMonth(value) {
  const month = Number(value)

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return null
  }

  return month
}

function getValidWeek(value) {
  const week = Number(value)

  if (!Number.isInteger(week) || week < 1 || week > 53) {
    return null
  }

  return week
}

function buildMonthPeriod(year, month) {
  return {
    label: `${year}-${padTwoDigits(month)}`,
    sortValue: Date.UTC(year, month - 1, 1),
  }
}

function buildWeekPeriod(year, week) {
  const januaryFourth = new Date(Date.UTC(year, 0, 4))
  const dayOfWeek = januaryFourth.getUTCDay() || 7
  const firstIsoWeekMonday = new Date(januaryFourth)

  firstIsoWeekMonday.setUTCDate(januaryFourth.getUTCDate() - dayOfWeek + 1)

  const weekDate = new Date(firstIsoWeekMonday)
  weekDate.setUTCDate(firstIsoWeekMonday.getUTCDate() + (week - 1) * 7)

  return {
    label: `${year}-W${padTwoDigits(week)}`,
    sortValue: weekDate.getTime(),
  }
}

function parseDatePeriod(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return buildMonthPeriod(value.getUTCFullYear(), value.getUTCMonth() + 1)
  }

  const rawValue = String(value).trim()

  if (!rawValue) return null

  const yearMonthMatch = rawValue.match(/^(\d{4})[-/]?(\d{1,2})(?:[-/]\d{1,2})?$/)

  if (yearMonthMatch) {
    const year = getValidYear(yearMonthMatch[1])
    const month = getValidMonth(yearMonthMatch[2])

    if (year && month) {
      return buildMonthPeriod(year, month)
    }
  }

  const isoWeekMatch = rawValue.match(/^(\d{4})[-/ ]?W?(\d{1,2})$/i)

  if (isoWeekMatch && /w/i.test(rawValue)) {
    const year = getValidYear(isoWeekMatch[1])
    const week = getValidWeek(isoWeekMatch[2])

    if (year && week) {
      return buildWeekPeriod(year, week)
    }
  }

  const parsedDate = new Date(rawValue)

  if (!Number.isNaN(parsedDate.getTime())) {
    return buildMonthPeriod(
      parsedDate.getUTCFullYear(),
      parsedDate.getUTCMonth() + 1
    )
  }

  return null
}

function getRecordPeriodInfo(record = {}) {
  const directDateFields = [
    record.reportingDate,
    record.reporting_date,
    record.date,
    record.report_date,
    record.case_date,
    record.month_date,
  ]

  for (const value of directDateFields) {
    const parsedPeriod = parseDatePeriod(value)

    if (parsedPeriod) {
      return parsedPeriod
    }
  }

  const year =
    getValidYear(record.year) ||
    getValidYear(record.reporting_year) ||
    getValidYear(record.report_year)

  const month =
    getValidMonth(record.month) ||
    getValidMonth(record.reporting_month) ||
    getValidMonth(record.report_month)

  if (year && month) {
    return buildMonthPeriod(year, month)
  }

  const week =
    getValidWeek(record.week) ||
    getValidWeek(record.epi_week) ||
    getValidWeek(record.reporting_week)

  if (year && week) {
    return buildWeekPeriod(year, week)
  }

  const fallbackPeriodFields = [
    record.period,
    record.reporting_period,
    record.year_month,
    record.month_year,
  ]

  for (const value of fallbackPeriodFields) {
    const parsedPeriod = parseDatePeriod(value)

    if (parsedPeriod) {
      return parsedPeriod
    }
  }

  return null
}

function getYearFromPeriodValue(value) {
  const period = parseDatePeriod(value)

  if (!period) return null

  const date = new Date(period.sortValue)
  const year = date.getUTCFullYear()

  return getValidYear(year)
}

function getReportingYearRange(records = []) {
  let firstYear = null
  let lastYear = null

  records.forEach((record) => {
    const period = getRecordPeriodInfo(record)

    if (!period) return

    const year = getValidYear(new Date(period.sortValue).getUTCFullYear())

    if (!year) return

    if (firstYear === null || year < firstYear) firstYear = year
    if (lastYear === null || year > lastYear) lastYear = year
  })

  return { firstYear, lastYear }
}

function formatYearRange(firstYear, lastYear) {
  if (firstYear && lastYear) {
    return firstYear === lastYear ? String(firstYear) : `${firstYear}-${lastYear}`
  }

  if (firstYear) return String(firstYear)
  if (lastYear) return String(lastYear)

  return 'No data range'
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

function getInitialTextScale() {
  const savedScale = Number(localStorage.getItem('dengue-text-scale') || 105)

  if (
    Number.isFinite(savedScale) &&
    savedScale >= TEXT_SCALE_MIN &&
    savedScale <= TEXT_SCALE_MAX
  ) {
    return savedScale
  }

  return 105
}

function getInitialDisplaySetting(key, fallback = false) {
  const savedValue = localStorage.getItem(key)

  if (savedValue === 'true') return true
  if (savedValue === 'false') return false

  return fallback
}

function getTextScaleLabel(value) {
  if (value <= 95) return 'Small'
  if (value >= 155) return 'Maximum'
  if (value >= 145) return 'Very large'
  if (value >= 130) return 'Extra large'
  if (value >= 115) return 'Large'

  return 'Default'
}


function normalizeNotificationSeverity(value = '') {
  const severity = String(value || '').toLowerCase()

  if (['danger', 'critical', 'error', 'high'].includes(severity)) return 'danger'
  if (['warning', 'warn', 'moderate'].includes(severity)) return 'warning'
  if (['success', 'ok', 'low'].includes(severity)) return 'success'
  if (['activity', 'event'].includes(severity)) return 'activity'

  return 'info'
}

function normalizeBackendNotification(item = {}, index = 0) {
  const severity = normalizeNotificationSeverity(item.severity || item.type)
  const id = item.id || `backend-notification-${index}-${item.title || 'alert'}`

  return {
    id,
    title: item.title || 'System notification',
    message: item.message || 'A system alert was generated.',
    type: severity,
    severity,
    category: item.category || 'backend',
    source: item.source || 'backend',
    timestamp: item.timestamp || item.created_at || item.generated_at || '',
    to: item.to || '/dashboard',
    hash: item.hash || 'dashboard-summary',
    meta: item.meta || {},
  }
}

function formatNotificationTime(timestamp = '') {
  if (!timestamp) return 'Just now'

  const date = new Date(timestamp)

  if (Number.isNaN(date.getTime())) return 'Just now'

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getNotificationDot(type) {
  if (type === 'danger') return 'bg-rose-500'
  if (type === 'warning') return 'bg-amber-500'
  if (type === 'success') return 'bg-emerald-500'
  if (type === 'activity') return 'bg-blue-500'
  return 'bg-slate-400'
}

function getNotificationTone(type) {
  if (type === 'danger') {
    return {
      label: 'Priority alert',
      icon: ShieldAlert,
      dot: 'bg-rose-400 shadow-[0_0_22px_rgba(251,113,133,0.90)]',
      iconWrap: 'from-rose-500 via-red-500 to-orange-400 text-white shadow-[0_18px_36px_rgba(244,63,94,0.32)]',
      border: 'border-rose-200/80 dark:border-rose-400/25',
      glow: 'bg-rose-400/30 dark:bg-rose-500/20',
      accent: 'from-rose-400 via-orange-300 to-amber-300',
      chip: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-200',
    }
  }

  if (type === 'warning') {
    return {
      label: 'Monitoring notice',
      icon: AlertTriangle,
      dot: 'bg-amber-300 shadow-[0_0_22px_rgba(252,211,77,0.90)]',
      iconWrap: 'from-amber-400 via-orange-400 to-yellow-300 text-slate-950 shadow-[0_18px_36px_rgba(245,158,11,0.28)]',
      border: 'border-amber-200/80 dark:border-amber-400/25',
      glow: 'bg-amber-300/30 dark:bg-amber-500/20',
      accent: 'from-amber-300 via-orange-300 to-yellow-200',
      chip: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-200',
    }
  }

  if (type === 'success') {
    return {
      label: 'System update',
      icon: CheckCircle2,
      dot: 'bg-emerald-300 shadow-[0_0_22px_rgba(110,231,183,0.90)]',
      iconWrap: 'from-emerald-400 via-teal-400 to-cyan-300 text-slate-950 shadow-[0_18px_36px_rgba(16,185,129,0.24)]',
      border: 'border-emerald-200/80 dark:border-emerald-400/25',
      glow: 'bg-emerald-300/30 dark:bg-emerald-500/20',
      accent: 'from-emerald-300 via-teal-300 to-cyan-200',
      chip: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-200',
    }
  }

  if (type === 'activity') {
    return {
      label: 'Activity update',
      icon: Activity,
      dot: 'bg-blue-300 shadow-[0_0_22px_rgba(147,197,253,0.90)]',
      iconWrap: 'from-blue-500 via-sky-400 to-cyan-300 text-white shadow-[0_18px_36px_rgba(59,130,246,0.28)]',
      border: 'border-blue-200/80 dark:border-blue-400/25',
      glow: 'bg-blue-300/30 dark:bg-blue-500/20',
      accent: 'from-blue-300 via-sky-300 to-cyan-200',
      chip: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/25 dark:bg-blue-500/10 dark:text-blue-200',
    }
  }

  return {
    label: 'Notification',
    icon: Info,
    dot: 'bg-slate-300 shadow-[0_0_22px_rgba(203,213,225,0.80)]',
    iconWrap: 'from-slate-600 via-slate-500 to-slate-400 text-white shadow-[0_18px_36px_rgba(15,23,42,0.22)]',
    border: 'border-slate-200/80 dark:border-slate-600/50',
    glow: 'bg-slate-300/30 dark:bg-slate-500/20',
    accent: 'from-slate-300 via-slate-200 to-white',
    chip: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200',
  }
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

function SettingsToggle({ enabled, onToggle, icon: Icon, title, description }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`dengue-settings-toggle group flex w-full items-center justify-between gap-4 overflow-hidden rounded-[24px] border p-3.5 text-left transition hover:-translate-y-0.5 ${
        enabled
          ? 'border-sky-300/40 bg-gradient-to-br from-sky-50 via-white to-cyan-50 text-brand-blue shadow-[0_16px_34px_rgba(14,165,233,0.12)] dark:border-sky-400/30 dark:from-sky-500/15 dark:via-slate-950 dark:to-cyan-500/10 dark:text-sky-200'
          : 'border-slate-200 bg-white/90 text-brand-text hover:border-brand-blue/25 hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-100 dark:hover:border-blue-500/30'
      }`}
    >
      <span className="dengue-settings-toggle-main flex min-w-0 items-center gap-3">
        <span
          className={`dengue-settings-toggle-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border transition ${
            enabled
              ? 'border-sky-200 bg-white text-brand-blue shadow-sm dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-200'
              : 'border-slate-200 bg-slate-50 text-brand-muted group-hover:text-brand-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:group-hover:text-blue-300'
          }`}
        >
          <Icon className="h-5 w-5" />
        </span>

        <span className="dengue-settings-toggle-copy min-w-0">
          <span className="block text-sm font-black">{title}</span>
          <span className="mt-0.5 block text-xs leading-5 text-brand-muted dark:text-slate-400">
            {description}
          </span>
        </span>
      </span>

      <span
        className={`dengue-settings-toggle-switch relative h-8 w-[58px] shrink-0 rounded-full border transition ${
          enabled
            ? 'border-sky-300 bg-gradient-to-r from-sky-500 to-cyan-300 shadow-[0_0_22px_rgba(14,165,233,0.42)]'
            : 'border-slate-300 bg-slate-200 dark:border-slate-600 dark:bg-slate-800'
        }`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-[0_5px_12px_rgba(15,23,42,0.25)] transition ${
            enabled ? 'left-[28px]' : 'left-1'
          }`}
        />
      </span>
    </button>
  )
}

function DisplaySettingsPanel({
  panelRef,
  mobile = false,
  textScale,
  setTextScale,
  comfortableControls,
  setComfortableControls,
  highContrast,
  setHighContrast,
  reduceMotion,
  setReduceMotion,
  notificationsEnabled,
  setNotificationsEnabled,
  onReset,
  onClose,
}) {
  const textLabel = getTextScaleLabel(textScale)
  const textScaleProgress = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        ((textScale - TEXT_SCALE_MIN) / (TEXT_SCALE_MAX - TEXT_SCALE_MIN)) * 100
      )
    )
  )
  const canDecreaseText = textScale > TEXT_SCALE_MIN
  const canIncreaseText = textScale < TEXT_SCALE_MAX
  const settingsBodyRef = useRef(null)

  useEffect(() => {
    if (!mobile || !settingsBodyRef.current) return undefined

    const body = settingsBodyRef.current
    body.scrollTop = 0

    const frame = window.requestAnimationFrame(() => {
      body.scrollTop = 0
    })

    return () => window.cancelAnimationFrame(frame)
  }, [mobile])

  function handleTextScaleChange(value) {
    const nextValue = Math.round(Number(value))

    if (!Number.isFinite(nextValue)) return

    setTextScale(Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, nextValue)))
  }

  function decreaseTextScale() {
    setTextScale((current) => {
      const nextValue = Math.round(Number(current || 100) - TEXT_SCALE_STEP)

      return Math.max(TEXT_SCALE_MIN, nextValue)
    })
  }

  function increaseTextScale() {
    setTextScale((current) => {
      const nextValue = Math.round(Number(current || 100) + TEXT_SCALE_STEP)

      return Math.min(TEXT_SCALE_MAX, nextValue)
    })
  }

  return (
    <div
      ref={panelRef}
      data-dengue-floating-panel="true"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      className={`dengue-premium-panel ${mobile ? 'dengue-mobile-floating-panel dengue-mobile-settings-panel fixed left-3 right-3 top-0 z-[9999] w-auto max-w-none' : 'fixed right-6 top-[92px] z-[9999] max-h-[calc(100dvh-7.25rem)] w-[calc(100vw-3rem)] max-w-[470px] xl:right-8'} overflow-hidden rounded-[28px] border border-white/80 bg-white/95 shadow-[0_34px_90px_rgba(15,23,42,0.26)] ring-1 ring-slate-200/70 backdrop-blur-2xl dark:border-slate-700/80 dark:bg-slate-950/95 dark:ring-white/10 sm:rounded-[34px]`}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-sky-300/30 blur-3xl dark:bg-sky-500/[0.15]" />
      <div className="pointer-events-none absolute -bottom-16 left-6 h-44 w-44 rounded-full bg-emerald-300/20 blur-3xl dark:bg-emerald-500/10" />
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/70 to-transparent" />

      <div className="dengue-settings-panel-header relative border-b border-slate-100/90 bg-gradient-to-br from-white via-sky-50/90 to-slate-50 px-5 py-4 dark:border-slate-800 dark:from-slate-950 dark:via-blue-950/40 dark:to-slate-950">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="dengue-settings-header-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-brand-blue to-sky-500 text-white shadow-[0_16px_32px_rgba(37,95,143,0.26)] ring-1 ring-white/30">
              <Settings className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <p className="dengue-settings-header-title text-base font-black tracking-tight text-brand-text dark:text-slate-100">
                Display settings
              </p>

              <p className="dengue-settings-header-copy mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                Accessibility controls for readability, comfort, and reduced visual strain.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="dengue-settings-close flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-brand-muted shadow-sm transition hover:-translate-y-0.5 hover:border-rose-200 hover:text-rose-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-rose-500/30 dark:hover:text-rose-300"
            aria-label="Close display settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={settingsBodyRef}
        className={mobile ? "dengue-settings-panel-body dengue-premium-scrollbar relative overflow-y-auto p-3" : "dengue-settings-panel-body dengue-premium-scrollbar relative max-h-[72vh] overflow-y-auto p-4"}
      >
        <div className="dengue-settings-text-card overflow-hidden rounded-[28px] border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-4 shadow-[0_18px_42px_rgba(14,165,233,0.10)] dark:border-sky-500/20 dark:from-sky-500/10 dark:via-slate-950 dark:to-cyan-500/10">
          <div className="dengue-settings-text-head flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="dengue-settings-text-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-sky-200 bg-white text-brand-blue shadow-sm dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200">
                <Type className="h-5 w-5" />
              </div>

              <div className="dengue-settings-text-copy">
                <p className="text-base font-black text-brand-text dark:text-slate-100">
                  Text size
                </p>

                <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                  Enlarges the system text across all pages. Small fixed labels are boosted at higher sizes.
                </p>
              </div>
            </div>

            <span className="dengue-settings-text-badge shrink-0 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-black text-brand-blue shadow-sm dark:border-sky-500/20 dark:bg-slate-900 dark:text-sky-200">
              {textLabel} · {textScale}%
            </span>
          </div>

          <div className="dengue-settings-slider-card mt-5 rounded-[24px] border border-white/80 bg-white/80 p-4 shadow-inner dark:border-slate-700 dark:bg-slate-950/60">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={decreaseTextScale}
                disabled={!canDecreaseText}
                className="group flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-brand-muted shadow-[0_10px_22px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-sky-300 hover:text-brand-blue hover:shadow-[0_14px_30px_rgba(14,165,233,0.18)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-sky-500/40 dark:hover:text-sky-200"
                aria-label="Decrease text size"
                title="Decrease text size"
              >
                <Minus className="h-4 w-4 transition group-active:scale-90" />
              </button>

              <div className="relative flex-1 px-1">
                <input
                  type="range"
                  min={TEXT_SCALE_MIN}
                  max={TEXT_SCALE_MAX}
                  step="1"
                  value={textScale}
                  onChange={(event) => handleTextScaleChange(event.target.value)}
                  className="dengue-text-slider h-5 w-full cursor-pointer appearance-none rounded-full"
                  style={{
                    background: `linear-gradient(to right, #0ea5e9 0%, #22d3ee ${textScaleProgress}%, rgba(148,163,184,0.28) ${textScaleProgress}%, rgba(148,163,184,0.28) 100%)`,
                  }}
                  aria-label="Text size"
                  aria-valuemin={TEXT_SCALE_MIN}
                  aria-valuemax={TEXT_SCALE_MAX}
                  aria-valuenow={textScale}
                  aria-valuetext={`${textScale}% text size`}
                />

                <div className="pointer-events-none absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-white/50 dark:bg-white/10" />
              </div>

              <button
                type="button"
                onClick={increaseTextScale}
                disabled={!canIncreaseText}
                className="group flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-brand-blue shadow-[0_10px_24px_rgba(14,165,233,0.14)] transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-white hover:shadow-[0_14px_32px_rgba(14,165,233,0.24)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200 dark:hover:border-sky-400/50 dark:hover:bg-slate-900"
                aria-label="Increase text size"
                title="Increase text size"
              >
                <Plus className="h-4 w-4 transition group-active:scale-90" />
              </button>
            </div>

            <div className="dengue-settings-scale-labels mt-3 grid grid-cols-4 gap-2 text-center text-[11px] font-black uppercase tracking-[0.12em] text-brand-muted dark:text-slate-500">
              <span>Small</span>
              <span>Default</span>
              <span>Large</span>
              <span>Max</span>
            </div>
          </div>
        </div>

        <div className="dengue-settings-toggle-list mt-3 grid gap-3">
          <SettingsToggle
            enabled={comfortableControls}
            onToggle={() => setComfortableControls((current) => !current)}
            icon={MousePointer2}
            title="Comfortable controls"
            description="Increases minimum clickable size for easier tapping and clicking."
          />

          <SettingsToggle
            enabled={highContrast}
            onToggle={() => setHighContrast((current) => !current)}
            icon={Eye}
            title="High contrast"
            description="Makes muted text, borders, and cards easier to distinguish."
          />

          <SettingsToggle
            enabled={reduceMotion}
            onToggle={() => setReduceMotion((current) => !current)}
            icon={Activity}
            title="Reduce motion"
            description="Minimizes transitions and hover movement for a steadier interface."
          />

          <SettingsToggle
            enabled={notificationsEnabled}
            onToggle={() => setNotificationsEnabled((current) => !current)}
            icon={notificationsEnabled ? Bell : BellOff}
            title="System notifications"
            description={
              notificationsEnabled
                ? 'Checks for new alerts every five minutes. This preference is synced to the signed-in account.'
                : 'Notification polling, unread badges, and pop-up reminders are paused for the signed-in account.'
            }
          />
        </div>

        <button
          type="button"
          onClick={onReset}
          className="dengue-settings-reset mt-4 flex w-full items-center justify-center gap-2 rounded-[24px] border border-slate-200 bg-white/90 px-4 py-3 text-sm font-black text-brand-muted shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue/30 hover:text-brand-blue hover:shadow-[0_14px_30px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-300 dark:hover:text-blue-300"
        >
          <RotateCcw className="h-4 w-4" />
          Reset display settings
        </button>
      </div>
    </div>
  )
}

function NotificationsPanel({
  panelRef,
  mobile = false,
  notifications,
  notificationsEnabled,
  readNotificationIds,
  markAllNotificationsAsRead,
  handleNotificationClick,
  onClose,
}) {
  return (
    <div
      ref={panelRef}
      data-dengue-floating-panel="true"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      className={`dengue-premium-panel ${mobile ? 'dengue-mobile-floating-panel dengue-mobile-notifications-panel fixed left-3 right-3 top-0 z-[9999] w-auto max-w-none' : 'absolute right-0 top-14 z-[9999] w-[calc(100vw-2rem)] max-w-[460px] sm:w-[460px]'} overflow-hidden rounded-[28px] border border-white/80 bg-white/95 shadow-[0_34px_90px_rgba(15,23,42,0.26)] ring-1 ring-slate-200/70 backdrop-blur-2xl dark:border-slate-700/80 dark:bg-slate-950/95 dark:ring-white/10 sm:rounded-[34px]`}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-blue-300/30 blur-3xl dark:bg-blue-500/[0.15]" />
      <div className="pointer-events-none absolute -bottom-16 left-6 h-44 w-44 rounded-full bg-rose-300/[0.15] blur-3xl dark:bg-rose-500/10" />
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/70 to-transparent" />

      <div className="relative border-b border-slate-100/90 bg-gradient-to-br from-white via-blue-50/90 to-slate-50 px-5 py-4 dark:border-slate-800 dark:from-slate-950 dark:via-blue-950/40 dark:to-slate-950">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-brand-blue to-sky-500 text-white shadow-[0_16px_32px_rgba(37,95,143,0.26)] ring-1 ring-white/30">
              <Bell className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <p className="text-base font-black tracking-tight text-brand-text dark:text-slate-100">
                Dengue alerts and reminders
              </p>

              <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                High-risk barangays, hotspot warnings, uploaded data status, and recent system activity.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-brand-muted shadow-sm transition hover:-translate-y-0.5 hover:border-rose-200 hover:text-rose-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-rose-500/30 dark:hover:text-rose-300"
            aria-label="Close notifications"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {notificationsEnabled && notifications.length > 0 && (
          <button
            type="button"
            onClick={markAllNotificationsAsRead}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-brand-muted shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue/30 hover:text-brand-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-blue-300"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </button>
        )}
      </div>

      <div className={mobile ? "dengue-premium-scrollbar relative max-h-[calc(100dvh-18rem)] overflow-y-auto p-3" : "dengue-premium-scrollbar relative max-h-[430px] overflow-y-auto p-3.5"}>
        {!notificationsEnabled ? (
          <div className="rounded-[24px] border border-slate-200 bg-slate-50/90 p-5 text-center dark:border-slate-700 dark:bg-slate-900/80">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[20px] border border-slate-200 bg-white text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              <BellOff className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-black text-brand-text dark:text-slate-100">
              Notifications are turned off
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-brand-muted dark:text-slate-400">
              Open Display settings to turn notification polling, badges, and pop-up reminders back on.
            </p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/80 p-5 text-center dark:border-emerald-500/20 dark:bg-emerald-500/10">
            <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-600 dark:text-emerald-300" />
            <p className="mt-2 text-sm font-black text-emerald-800 dark:text-emerald-200">No active alerts</p>
          </div>
        ) : notifications.map((item, index) => {
          const isRead = readNotificationIds.includes(item.id)

          return (
            <button
              key={`${item.id}-${index}`}
              type="button"
              onClick={() => handleNotificationClick(item)}
              className={`mb-2.5 w-full overflow-hidden rounded-[24px] border p-3.5 text-left transition last:mb-0 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(15,23,42,0.10)] dark:hover:border-blue-500/30 ${
                isRead
                  ? 'border-slate-200 bg-white/80 opacity-75 dark:border-slate-800 dark:bg-slate-950/80'
                  : 'border-blue-100 bg-gradient-to-br from-blue-50 via-white to-sky-50 shadow-sm dark:border-blue-500/20 dark:from-blue-500/10 dark:via-slate-950 dark:to-sky-500/10'
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1.5 h-3 w-3 shrink-0 rounded-full shadow-[0_0_12px_rgba(59,130,246,0.35)] ${getNotificationDot(item.type)}`}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-black text-brand-text dark:text-slate-100">
                      {item.title}
                    </p>

                    {!isRead && (
                      <span className="shrink-0 rounded-full bg-rose-500 px-2.5 py-1 text-[10px] font-black text-white shadow-[0_8px_18px_rgba(244,63,94,0.25)]">
                        New
                      </span>
                    )}
                  </div>

                  <p className="mt-1.5 text-sm leading-6 text-brand-muted dark:text-slate-400">
                    {item.message}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-brand-muted dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {formatNotificationTime(item.timestamp)}
                    </span>
                    <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                      {String(item.source || '').includes('backend') || String(item.source || '').includes('database') ? 'System alert' : item.source === 'activity-log' ? 'Recent activity' : 'App reminder'}
                    </span>
                  </div>

                  <p className="mt-2 text-xs font-black uppercase tracking-[0.12em] text-brand-blue dark:text-blue-300">
                    Open details
                  </p>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}


function NotificationToast({ notification, visible, onClose, onOpen }) {
  if (!notification) return null

  const tone = getNotificationTone(notification.type)
  const ToastIcon = tone.icon

  return (
    <div
      className={`dengue-notification-toast-shell fixed right-4 top-4 z-[10000] w-[calc(100vw-2rem)] max-w-[420px] transition-all duration-500 sm:right-6 sm:top-6 ${
        visible
          ? 'translate-y-0 opacity-100 blur-0'
          : '-translate-y-6 opacity-0 blur-sm pointer-events-none'
      }`}
      role="status"
      aria-live="polite"
    >
      <div
  className="dengue-notification-toast group relative overflow-hidden rounded-[30px] border border-slate-700/80 bg-slate-950 p-4 shadow-[0_28px_80px_rgba(0,0,0,0.55)] ring-1 ring-white/10"
>
        <div className={`pointer-events-none absolute -right-14 -top-14 h-36 w-36 rounded-full ${tone.glow} blur-3xl`} />
        <div className="pointer-events-none absolute -bottom-16 left-6 h-36 w-36 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className={`pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent ${tone.accent} to-transparent`} />

        <div className="relative flex items-start gap-3">
          <div className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br ${tone.iconWrap}`}>
            <span className="absolute inset-0 rounded-[22px] bg-white/10" />
            <ToastIcon className="relative h-6 w-6" />
          </div>

          <button
            type="button"
            onClick={onOpen}
            className="min-w-0 flex-1 text-left outline-none"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${tone.chip}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                {tone.label}
              </span>

              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                Just now
              </span>
            </div>

            <p className="mt-2 line-clamp-2 text-sm font-black leading-5 text-white">
              {notification.title}
            </p>

            <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-slate-300">
              {notification.message}
            </p>

            <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-cyan-300">
              Open details
            </p>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-400 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-300"
            aria-label="Dismiss notification popup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative mt-4 h-1 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800">
          <div
            key={notification.id}
            className={`h-full rounded-full bg-gradient-to-r ${tone.accent} dengue-toast-progress`}
          />
        </div>
      </div>
    </div>
  )
}

function SidebarNavItem({ to, label, Icon, onClick, desktopAccent = false }) {
  return (
    <NavLink
      key={to}
      to={to}
      onClick={onClick}
      className="dengue-sidebar-link block outline-none"
    >
      {({ isActive }) => (
        <div className="group/navitem dengue-nav-item relative rounded-[22px] p-[2px] transition duration-300">
          <div
            className={`dengue-nav-item-inner relative flex items-center gap-3 overflow-hidden rounded-[20px] px-4 py-3 text-sm font-black transition duration-300 ${
              isActive
                ? 'bg-[#f8fafc] text-[#0f172a] shadow-[0_10px_26px_rgba(2,6,23,0.18)]'
                : 'text-white/75 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span
              className={`dengue-nav-icon relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border transition duration-300 ${
                isActive
                  ? 'border-[#bae6fd] bg-[#e0f2fe] text-[#0369a1]'
                  : 'border-white/10 bg-white/10 text-white/80 group-hover/navitem:border-white/20 group-hover/navitem:bg-white/15 group-hover/navitem:text-white'
              }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.35 : 2} />
            </span>

            <span
              className={`dengue-nav-label relative z-10 min-w-0 flex-1 truncate ${
                isActive ? 'text-[#0f172a]' : ''
              }`}
            >
              {label}
            </span>

            {isActive && desktopAccent ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 h-8 w-2 -translate-y-1/2 rounded-full bg-gradient-to-b from-cyan-300 via-sky-400 to-cyan-500 shadow-[0_0_16px_rgba(34,211,238,0.78)]"
              />
            ) : null}

          </div>
        </div>
      )}
    </NavLink>
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
    backendForecastResult = null,
    backendIntegrationStatus = null,
    backendIntegrationResult = null,
    addActivityLog,
    resetLocalWorkspaceSession,
  } = useData()

  const [loggingOut, setLoggingOut] = useState(false)
  const [theme, setTheme] = useState(getInitialTheme)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(() =>
    getInitialDisplaySetting('dengue-notifications-enabled', true)
  )
  const [notificationPreferenceLoaded, setNotificationPreferenceLoaded] = useState(false)
  const [notificationPreferenceSaving, setNotificationPreferenceSaving] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [isCompactViewport, setIsCompactViewport] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 1279px)').matches
      : false
  )
  const [readNotificationIds, setReadNotificationIds] = useState(getInitialReadNotifications)
  const [backendNotifications, setBackendNotifications] = useState([])
  const [backendNotificationError, setBackendNotificationError] = useState('')
  const [toastNotification, setToastNotification] = useState(null)
  const [toastVisible, setToastVisible] = useState(false)
  const logoutStartedRef = useRef(false)
  const logoutFinalizedRef = useRef(false)
  const logoutTimerRef = useRef(null)
  const settingsButtonRef = useRef(null)
  const mobileSettingsButtonRef = useRef(null)
  const settingsPanelRef = useRef(null)
  const notificationsButtonRef = useRef(null)
  const mobileNotificationsButtonRef = useRef(null)
  const notificationsPanelRef = useRef(null)
  const lastToastIdRef = useRef('')
  const toastTimerRef = useRef(null)
  const [textScale, setTextScale] = useState(getInitialTextScale)
  const [comfortableControls, setComfortableControls] = useState(() =>
    getInitialDisplaySetting('dengue-comfortable-controls', true)
  )
  const [highContrast, setHighContrast] = useState(() =>
    getInitialDisplaySetting('dengue-high-contrast')
  )
  const [reduceMotion, setReduceMotion] = useState(() =>
    getInitialDisplaySetting('dengue-reduce-motion')
  )

  const isDark = theme === 'dark'

  const session = getAuthSession()
  const currentRole = session?.role || 'viewer'
  const filteredNavItems = navItems.filter((item) => {
    return !item.roles?.length || item.roles.includes(currentRole)
  })
  const roleLabel = session?.label || 'Prototype User'
  const workspaceLabel = currentRole === 'bhw'
    ? `${session?.assignedBarangay || 'Assigned Barangay'} BHW workspace`
    : currentRole === 'supervisor'
      ? 'CHO supervisor review workspace'
      : 'Butuan City CHO monitoring workspace'

  const currentNavItem = navItems.find((item) => item.to === location.pathname)
  const title = currentNavItem?.label || 'Dashboard'
  const CurrentPageIcon = currentNavItem?.icon || LayoutDashboard

  const hasDengueData =
    dengueRecords.length > 0 || Number(sourceStatus?.dengue?.validCount || 0) > 0

  const hasBoundaryData = Number(sourceStatus?.boundary?.validCount || 0) > 0

  const dataRange = useMemo(() => {
    const dengueStatus = sourceStatus?.dengue || {}
    const coverageStart = dengueStatus.coverageStart || dengueStatus.coverage_start || ''
    const coverageEnd = dengueStatus.coverageEnd || dengueStatus.coverage_end || ''
    const coverageStartYear = getYearFromPeriodValue(coverageStart)
    const coverageEndYear = getYearFromPeriodValue(coverageEnd)

    // Prefer the tiny persisted upload metadata. DataContext already restores
    // these two coverage values after login, so this stays dynamic without
    // downloading the dengue preview again or adding any extra Supabase egress.
    if (coverageStartYear || coverageEndYear) {
      return formatYearRange(coverageStartYear, coverageEndYear)
    }

    const loadedRange = getReportingYearRange(dengueRecords)

    if (loadedRange.firstYear || loadedRange.lastYear) {
      return formatYearRange(loadedRange.firstYear, loadedRange.lastYear)
    }

    // Last-resort fallback for older saved workspaces that do not yet contain
    // upload coverage metadata. The saved forecast only exposes the latest
    // historical period, so show that year rather than an incorrect range.
    const savedForecastRows = Array.isArray(backendForecastResult?.forecast_results)
      ? backendForecastResult.forecast_results
      : []
    const forecastYears = savedForecastRows
      .map((row) => getYearFromPeriodValue(row?.latest_period || row?.latestPeriod || ''))
      .filter(Boolean)

    if (forecastYears.length > 0) {
      const latestForecastYear = Math.max(...forecastYears)
      return String(latestForecastYear)
    }

    return 'No data range'
  }, [dengueRecords, sourceStatus, backendForecastResult])

  useEffect(() => {
    let active = true
    const cachedPreference = getInitialDisplaySetting(
      'dengue-notifications-enabled',
      true
    )

    async function loadNotificationPreference() {
      try {
        const result = await getNotificationPreferences()

        if (!active) return

        if (result?.has_saved_preference) {
          setNotificationsEnabled(result.notifications_enabled !== false)
        } else {
          setNotificationsEnabled(cachedPreference)

          // Migrate the existing browser choice to the signed-in account once.
          updateNotificationPreferences(cachedPreference).catch(() => {})
        }
      } catch {
        if (active) {
          setNotificationsEnabled(cachedPreference)
        }
      } finally {
        if (active) {
          setNotificationPreferenceLoaded(true)
        }
      }
    }

    loadNotificationPreference()

    return () => {
      active = false
    }
  }, [session?.userId])

  useEffect(() => {
    if (loggingOut || !notificationPreferenceLoaded || !notificationsEnabled) {
      setBackendNotifications([])
      setBackendNotificationError('')
      return undefined
    }

    let active = true
    let refreshTimer = null

    async function loadBackendNotifications() {
      try {
        const result = await getBackendNotifications()
        const items = Array.isArray(result?.notifications)
          ? result.notifications.map((item, index) => normalizeBackendNotification(item, index))
          : []

        if (!active) return

        setBackendNotifications(items)
        setBackendNotificationError('')
      } catch (error) {
        if (!active) return

        setBackendNotificationError(
          error?.message || 'Notification alerts are temporarily unavailable. Please check if the server is running.'
        )
      }
    }

    loadBackendNotifications()
    refreshTimer = window.setInterval(
      loadBackendNotifications,
      NOTIFICATION_POLL_INTERVAL_MS
    )

    return () => {
      active = false

      if (refreshTimer) {
        window.clearInterval(refreshTimer)
      }
    }
  }, [
    notificationPreferenceLoaded,
    notificationsEnabled,
    dengueRecords.length,
    riskRows.length,
    sourceStatus?.dengue?.validCount,
    sourceStatus?.weather?.validCount,
    sourceStatus?.population?.validCount,
    sourceStatus?.boundary?.validCount,
    activityLogs.length,
    backendForecastResult?.forecast_run_id,
    backendForecastResult?.updated_at,
    backendIntegrationStatus?.loaded_source_count,
    backendIntegrationResult?.integration_run_id,
    loggingOut,
  ])

  const systemStatus = hasDengueData
    ? {
        label: 'Data ready',
        badge: 'Ready',
        chip: 'bg-emerald-50 text-brand-green dark:bg-emerald-500/10 dark:text-emerald-300',
        badgeStyle: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/[0.15] dark:text-emerald-300',
      }
    : {
        label: 'Waiting for data',
        badge: 'Pending',
        chip: 'bg-amber-50 text-brand-orange dark:bg-amber-500/10 dark:text-amber-300',
        badgeStyle: 'bg-amber-100 text-amber-700 dark:bg-amber-500/[0.15] dark:text-amber-300',
      }

  const notifications = useMemo(() => {
    if (!notificationsEnabled) return []

    const items = []

    backendNotifications.forEach((item) => {
      items.push(item)
    })

    if (backendNotificationError) {
      items.push({
        id: `backend-notification-service-unavailable-${backendNotificationError}`,
        title: 'Notification alerts unavailable',
        message: 'The system could not load the latest alert list. Please check if the server is running.',
        type: 'warning',
        severity: 'warning',
        source: 'frontend-fallback',
        timestamp: new Date().toISOString(),
        to: '/upload',
        hash: 'data-upload',
      })
    }

    const rankedRiskRows = [...riskRows].sort(compareCanonicalBarangayPriority)
    const highRiskRows = rankedRiskRows.filter((row) => row.risk === 'High')
    const moderateRiskRows = rankedRiskRows.filter((row) => row.risk === 'Moderate')
    const lowRiskRows = rankedRiskRows.filter((row) => row.risk === 'Low')
    const topBarangay = rankedRiskRows[0]

    if (!backendNotifications.length && !hasDengueData) {
      items.push({
        id: 'dengue-dataset-pending',
        title: 'Dengue records needed',
        message: 'Upload and check the dengue records before barangay risk levels can be shown.',
        type: 'warning',
        severity: 'warning',
        source: 'frontend-fallback',
        timestamp: new Date().toISOString(),
        to: '/upload',
        hash: 'data-upload',
      })
    }

    if (!backendNotifications.length && hasDengueData && riskRows.length === 0) {
      items.push({
        id: 'risk-scoring-pending',
        title: 'Risk results not ready',
        message: 'Dengue records are loaded, but the barangay risk ranking is not ready yet.',
        type: 'warning',
        severity: 'warning',
        source: 'frontend-fallback',
        timestamp: new Date().toISOString(),
        to: '/forecast',
        hash: 'forecast-model',
      })
    }

    if (!backendNotifications.length && highRiskRows.length > 0) {
      const names = highRiskRows
        .slice(0, 3)
        .map((row) => row.barangay)
        .join(', ')

      items.push({
        id: `high-risk-${highRiskRows.length}-${names}`,
        title: `${highRiskRows.length} high-risk barangay${highRiskRows.length === 1 ? '' : 's'}`,
        message: `${names}${highRiskRows.length > 3 ? ', and others' : ''} require priority monitoring and early response planning.`,
        type: 'danger',
        severity: 'danger',
        source: 'frontend-fallback',
        timestamp: new Date().toISOString(),
        to: '/forecast',
        hash: 'top-barangays',
      })
    }

    if (!backendNotifications.length && moderateRiskRows.length > 0) {
      const names = moderateRiskRows
        .slice(0, 3)
        .map((row) => row.barangay)
        .join(', ')

      items.push({
        id: `moderate-risk-${moderateRiskRows.length}-${names}`,
        title: `${moderateRiskRows.length} moderate-risk barangay${moderateRiskRows.length === 1 ? '' : 's'}`,
        message: `${names}${moderateRiskRows.length > 3 ? ', and others' : ''} should be monitored for possible escalation.`,
        type: 'warning',
        severity: 'warning',
        source: 'frontend-fallback',
        timestamp: new Date().toISOString(),
        to: '/forecast',
        hash: 'risk-summary',
      })
    }

    if (!backendNotifications.length && topBarangay) {
      items.push({
        id: `top-priority-${topBarangay.barangay}-${topBarangay.risk}-${topBarangay.forecast}`,
        title: `Top priority: ${topBarangay.barangay}`,
        message: `${topBarangay.forecast || 0} forecast cases, ${getCanonicalCombinedRiskScore(topBarangay)}/100 combined priority score, classified as ${topBarangay.risk} risk.`,
        type: topBarangay.risk === 'High' ? 'danger' : topBarangay.risk === 'Moderate' ? 'warning' : 'success',
        severity: topBarangay.risk === 'High' ? 'danger' : topBarangay.risk === 'Moderate' ? 'warning' : 'success',
        source: 'frontend-fallback',
        timestamp: new Date().toISOString(),
        to: '/forecast',
        hash: 'top-barangays',
      })
    }

    if (
      !backendNotifications.length &&
      hasDengueData &&
      riskRows.length > 0 &&
      highRiskRows.length === 0 &&
      moderateRiskRows.length === 0 &&
      lowRiskRows.length > 0
    ) {
      items.push({
        id: 'barangay-risk-status-stable',
        title: 'Barangay risk status is stable',
        message: 'All currently ranked barangays are low risk based on the available records.',
        type: 'success',
        severity: 'success',
        source: 'frontend-fallback',
        timestamp: new Date().toISOString(),
        to: '/dashboard',
        hash: 'dashboard-summary',
      })
    }

    if (!backendNotifications.length && !hasBoundaryData) {
      items.push({
        id: 'boundary-layer-pending',
        title: 'Map file needed',
        message: 'Upload the barangay map file before using the final map view.',
        type: 'warning',
        severity: 'warning',
        source: 'frontend-fallback',
        timestamp: new Date().toISOString(),
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
          severity: 'activity',
          source: 'activity-log',
          timestamp: log.timestamp || new Date().toISOString(),
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
        severity: 'success',
        source: 'frontend-fallback',
        timestamp: new Date().toISOString(),
        to: '/dashboard',
        hash: 'dashboard-summary',
      })
    }

    const seen = new Set()

    return items.filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
  }, [
    notificationsEnabled,
    backendNotifications,
    backendNotificationError,
    hasDengueData,
    hasBoundaryData,
    riskRows,
    activityLogs,
  ])

  const unreadNotifications = useMemo(() => {
    return notifications.filter((item) => !readNotificationIds.includes(item.id))
  }, [notifications, readNotificationIds])

  useEffect(() => {
    if (!notificationsEnabled) return undefined

    const nextToast = unreadNotifications.find((item) => item.id !== 'no-active-alerts')

    if (!nextToast || lastToastIdRef.current === nextToast.id) {
      return
    }

    lastToastIdRef.current = nextToast.id
    setToastNotification(nextToast)
    setToastVisible(false)

    const showTimer = window.setTimeout(() => {
      setToastVisible(true)
    }, 180)

    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current)
    }

    toastTimerRef.current = window.setTimeout(() => {
      setToastVisible(false)
    }, 5000)

    return () => {
      window.clearTimeout(showTimer)
    }
  }, [notificationsEnabled, unreadNotifications])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    function handleOutsidePointerDown(event) {
      const target = event.target

      if (!(target instanceof Element)) return

      const clickedInsideFloatingPanel = Boolean(
        target.closest('[data-dengue-floating-panel="true"]')
      )

      if (clickedInsideFloatingPanel) return

      if (
        settingsOpen &&
        !settingsButtonRef.current?.contains(target) &&
        !mobileSettingsButtonRef.current?.contains(target)
      ) {
        setSettingsOpen(false)
      }

      if (
        notificationsOpen &&
        !notificationsButtonRef.current?.contains(target) &&
        !mobileNotificationsButtonRef.current?.contains(target)
      ) {
        setNotificationsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handleOutsidePointerDown, true)

    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown, true)
    }
  }, [settingsOpen, notificationsOpen])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('dengue-theme-mode', theme)
  }, [theme, isDark])

  useEffect(() => {
    localStorage.setItem(
      'dengue-notifications-enabled',
      String(notificationsEnabled)
    )

    if (!notificationsEnabled) {
      setNotificationsOpen(false)
      setToastVisible(false)
      setToastNotification(null)
      lastToastIdRef.current = ''

      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current)
        toastTimerRef.current = null
      }
    }
  }, [notificationsEnabled])

  useEffect(() => {
    const root = document.documentElement

    const layoutMaxWidth =
      textScale >= 145
        ? '2600px'
        : textScale >= 135
          ? '2380px'
          : textScale >= 125
            ? '2160px'
            : textScale >= 115
              ? '1960px'
              : textScale >= 105
                ? '1720px'
                : '1540px'
    root.style.fontSize = ''
    root.style.setProperty('--dengue-layout-max-width', layoutMaxWidth)
    root.style.setProperty('--dengue-sidebar-width', '292px')
    root.style.setProperty('--dengue-content-scale', String(textScale / 100))
    root.classList.toggle('dengue-wide-layout', textScale > 100)
    root.classList.toggle('dengue-readable-labels', textScale >= 125)
    root.classList.toggle('dengue-max-readable', textScale >= 140)
    root.classList.toggle('dengue-comfortable-controls', comfortableControls)
    root.classList.toggle('dengue-high-contrast', highContrast)
    root.classList.toggle('dengue-reduce-motion', reduceMotion)

    localStorage.setItem('dengue-text-scale', String(textScale))
    localStorage.setItem('dengue-comfortable-controls', String(comfortableControls))
    localStorage.setItem('dengue-high-contrast', String(highContrast))
    localStorage.setItem('dengue-reduce-motion', String(reduceMotion))

    let settingsStyle = document.getElementById('dengue-display-settings-style')

    if (!settingsStyle) {
      settingsStyle = document.createElement('style')
      settingsStyle.id = 'dengue-display-settings-style'
      document.head.appendChild(settingsStyle)
    }

    settingsStyle.textContent = `

      .dengue-scaled-content {
        --dengue-scale: var(--dengue-content-scale, 1);
      }

      /* Phase 5 readability baseline: health workers should not need to raise the text slider just to read labels. */
      /* Readability floor. The #root selector intentionally outranks page-level
         compact mobile CSS so helper text stays readable on every page. */
      #root .dengue-scaled-content [class*="text-[7px]"],
      #root .dengue-scaled-content [class*="text-[8px]"],
      #root .dengue-scaled-content [class*="text-[9px]"] {
        font-size: clamp(0.8125rem, calc(0.8125rem * var(--dengue-scale)), 1.08rem) !important;
        line-height: clamp(1.12rem, calc(1.12rem * var(--dengue-scale)), 1.6rem) !important;
      }

      #root .dengue-scaled-content [class*="text-[10px]"],
      #root .dengue-scaled-content [class*="text-[11px]"] {
        font-size: clamp(0.875rem, calc(0.875rem * var(--dengue-scale)), 1.18rem) !important;
        line-height: clamp(1.22rem, calc(1.22rem * var(--dengue-scale)), 1.72rem) !important;
      }

      #root .dengue-scaled-content [class*="text-[12px]"],
      #root .dengue-scaled-content .text-xs {
        font-size: clamp(0.875rem, calc(0.875rem * var(--dengue-scale)), 1.22rem) !important;
        line-height: clamp(1.25rem, calc(1.25rem * var(--dengue-scale)), 1.8rem) !important;
      }

      #root .dengue-scaled-content .text-sm {
        font-size: clamp(0.96875rem, calc(0.96875rem * var(--dengue-scale)), 1.38rem) !important;
        line-height: clamp(1.4rem, calc(1.4rem * var(--dengue-scale)), 2.05rem) !important;
      }

      .dengue-scaled-content h1.font-black,
      .dengue-scaled-content h2.font-black,
      .dengue-scaled-content h3.font-black,
      .dengue-scaled-content .dengue-hero-title {
        font-weight: 700 !important;
      }

      .dengue-scaled-content .font-black.uppercase {
        font-weight: 700 !important;
      }

      .dengue-scaled-content .dengue-hero-title {
        letter-spacing: -0.035em !important;
        line-height: 1.08 !important;
      }

      .dengue-scaled-content .dengue-hero-copy {
        font-size: clamp(0.9375rem, calc(0.9375rem * var(--dengue-scale)), 1.3rem) !important;
        line-height: clamp(1.55rem, calc(1.6rem * var(--dengue-scale)), 2.05rem) !important;
      }

      #root .dengue-scaled-content [data-information-type] {
        font-size: clamp(0.8125rem, calc(0.8125rem * var(--dengue-scale)), 1.05rem) !important;
        line-height: 1.15rem !important;
      }

      .dengue-scaled-content .text-base {
        font-size: clamp(1rem, calc(1rem * var(--dengue-scale)), 1.55rem) !important;
        line-height: clamp(1.5rem, calc(1.5rem * var(--dengue-scale)), 2.25rem) !important;
      }

      .dengue-scaled-content .text-lg {
        font-size: clamp(1.125rem, calc(1.125rem * var(--dengue-scale)), 1.75rem) !important;
        line-height: clamp(1.65rem, calc(1.65rem * var(--dengue-scale)), 2.45rem) !important;
      }

      .dengue-scaled-content .text-xl {
        font-size: clamp(1.25rem, calc(1.25rem * var(--dengue-scale)), 1.95rem) !important;
        line-height: clamp(1.75rem, calc(1.75rem * var(--dengue-scale)), 2.65rem) !important;
      }

      .dengue-scaled-content .text-2xl {
        font-size: clamp(1.5rem, calc(1.5rem * var(--dengue-scale)), 2.35rem) !important;
        line-height: clamp(2rem, calc(2rem * var(--dengue-scale)), 3rem) !important;
      }

      .dengue-scaled-content .text-3xl {
        font-size: clamp(1.875rem, calc(1.875rem * var(--dengue-scale)), 2.9rem) !important;
        line-height: clamp(2.25rem, calc(2.25rem * var(--dengue-scale)), 3.45rem) !important;
      }

      .dengue-scaled-content .text-4xl {
        font-size: clamp(2.25rem, calc(2.25rem * var(--dengue-scale)), 3.45rem) !important;
        line-height: clamp(2.65rem, calc(2.65rem * var(--dengue-scale)), 4rem) !important;
      }

      .dengue-scaled-content .text-5xl {
        font-size: clamp(3rem, calc(3rem * var(--dengue-scale)), 4.45rem) !important;
        line-height: clamp(1, calc(1.05 * var(--dengue-scale)), 1.18) !important;
      }

      .dengue-premium-panel {
        animation: dengue-panel-enter 180ms ease-out;
      }

      .dengue-premium-panel[data-dengue-floating-panel="true"] {
        transform: translateZ(0);
        isolation: isolate;
        contain: layout paint;
      }

      @keyframes dengue-panel-enter {
        from {
          opacity: 0;
          transform: translateY(-8px) scale(0.98);
        }

        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      .dengue-notification-toast {
        animation: dengue-toast-enter 520ms cubic-bezier(0.16, 1, 0.3, 1);
      }

      .dengue-notification-toast::after {
        content: '';
        pointer-events: none;
        position: absolute;
        inset: 1px;
        border-radius: 29px;
        background: linear-gradient(135deg, rgba(255,255,255,0.34), transparent 34%, rgba(125,211,252,0.10));
        opacity: 0.85;
      }

      .dengue-toast-progress {
        animation: dengue-toast-progress 4.8s linear forwards;
        transform-origin: left;
      }

      @keyframes dengue-toast-enter {
        0% {
          opacity: 0;
          transform: translate3d(24px, -18px, 0) scale(0.94);
          filter: blur(10px);
        }

        60% {
          opacity: 1;
          transform: translate3d(-4px, 0, 0) scale(1.01);
          filter: blur(0);
        }

        100% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
          filter: blur(0);
        }
      }

      @keyframes dengue-toast-progress {
        from {
          transform: scaleX(1);
        }

        to {
          transform: scaleX(0);
        }
      }

      .dengue-premium-scrollbar {
        scrollbar-width: thin;
        scrollbar-color: rgba(125, 211, 252, 0.72) rgba(15, 23, 42, 0.22);
      }

      .dengue-premium-scrollbar::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }

      .dengue-premium-scrollbar::-webkit-scrollbar-track {
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.18);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
      }

      .dengue-premium-scrollbar::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: linear-gradient(180deg, rgba(125, 211, 252, 0.95), rgba(14, 165, 233, 0.72));
        border: 2px solid rgba(15, 23, 42, 0.28);
        box-shadow: 0 0 14px rgba(56, 189, 248, 0.55);
      }

      .dengue-premium-scrollbar::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(180deg, rgba(186, 230, 253, 1), rgba(14, 165, 233, 0.92));
      }

      .dengue-text-slider {
        border: 1px solid rgba(148, 163, 184, 0.34);
        box-shadow:
          inset 0 1px 2px rgba(15, 23, 42, 0.12),
          0 10px 22px rgba(14, 165, 233, 0.10);
        transition:
          background 220ms ease,
          box-shadow 220ms ease,
          border-color 220ms ease;
      }

      .dengue-text-slider:hover {
        border-color: rgba(14, 165, 233, 0.44);
        box-shadow:
          inset 0 1px 2px rgba(15, 23, 42, 0.12),
          0 14px 30px rgba(14, 165, 233, 0.16);
      }

      .dengue-text-slider::-webkit-slider-runnable-track {
        height: 20px;
        border-radius: 999px;
        background: transparent;
      }

      .dengue-text-slider::-webkit-slider-thumb {
        appearance: none;
        width: 34px;
        height: 34px;
        margin-top: -7px;
        border-radius: 999px;
        background:
          radial-gradient(circle at 35% 30%, #ffffff 0%, #ffffff 38%, #e0f2fe 100%);
        border: 5px solid #0ea5e9;
        box-shadow:
          0 0 0 5px rgba(14, 165, 233, 0.14),
          0 10px 22px rgba(15, 23, 42, 0.26),
          0 0 20px rgba(34, 211, 238, 0.58);
        transition:
          transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
          box-shadow 220ms ease,
          border-color 220ms ease;
      }

      .dengue-text-slider:hover::-webkit-slider-thumb {
        transform: scale(1.08);
        border-color: #0284c7;
        box-shadow:
          0 0 0 8px rgba(14, 165, 233, 0.18),
          0 12px 26px rgba(15, 23, 42, 0.30),
          0 0 28px rgba(34, 211, 238, 0.82);
      }

      .dengue-text-slider:active::-webkit-slider-thumb {
        transform: scale(1.15);
        cursor: grabbing;
      }

      .dengue-text-slider::-moz-range-track {
        height: 20px;
        border-radius: 999px;
        background: transparent;
      }

      .dengue-text-slider::-moz-range-thumb {
        width: 26px;
        height: 26px;
        border-radius: 999px;
        background:
          radial-gradient(circle at 35% 30%, #ffffff 0%, #ffffff 38%, #e0f2fe 100%);
        border: 5px solid #0ea5e9;
        box-shadow:
          0 0 0 5px rgba(14, 165, 233, 0.14),
          0 10px 22px rgba(15, 23, 42, 0.26),
          0 0 20px rgba(34, 211, 238, 0.58);
        transition:
          transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
          box-shadow 220ms ease,
          border-color 220ms ease;
      }

      .dengue-text-slider:hover::-moz-range-thumb {
        transform: scale(1.08);
        border-color: #0284c7;
        box-shadow:
          0 0 0 8px rgba(14, 165, 233, 0.18),
          0 12px 26px rgba(15, 23, 42, 0.30),
          0 0 28px rgba(34, 211, 238, 0.82);
      }

      .dengue-text-slider:active::-moz-range-thumb {
        transform: scale(1.15);
        cursor: grabbing;
      }

      html.dark .dengue-text-slider {
        border-color: rgba(125, 211, 252, 0.34);
        box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.08), 0 0 24px rgba(14, 165, 233, 0.12);
      }

      html.dengue-comfortable-controls .dengue-scaled-content button,
      html.dengue-comfortable-controls .dengue-scaled-content a[role='button'],
      html.dengue-comfortable-controls .dengue-scaled-content input,
      html.dengue-comfortable-controls .dengue-scaled-content select,
      html.dengue-comfortable-controls .dengue-scaled-content textarea {
        min-height: 44px;
      }

      html.dengue-comfortable-controls .dengue-scaled-content input[type='range'],
      html.dengue-comfortable-controls .dengue-scaled-content input[type='checkbox'],
      html.dengue-comfortable-controls .dengue-scaled-content input[type='radio'] {
        min-height: auto;
      }

      html.dengue-high-contrast .dengue-scaled-content {
        filter: contrast(1.04);
      }

      html.dengue-high-contrast .dengue-scaled-content .text-brand-muted {
        color: #334155 !important;
      }

      html.dark.dengue-high-contrast .dengue-scaled-content .text-brand-muted,
      html.dark.dengue-high-contrast .dengue-scaled-content [class*='text-slate-400'],
      html.dark.dengue-high-contrast .dengue-scaled-content [class*='text-slate-500'],
      html.dark.dengue-high-contrast .dengue-scaled-content [class*='text-white/60'],
      html.dark.dengue-high-contrast .dengue-scaled-content [class*='text-white/50'] {
        color: #e2e8f0 !important;
      }

      html.dengue-high-contrast .dengue-scaled-content [class*='border-slate-200'],
      html.dengue-high-contrast .dengue-scaled-content [class*='border-white/10'],
      html.dengue-high-contrast .dengue-scaled-content [class*='border-white/20'] {
        border-color: rgba(100, 116, 139, 0.58) !important;
      }

      html.dark.dengue-high-contrast .dengue-scaled-content [class*='border-slate-800'],
      html.dark.dengue-high-contrast .dengue-scaled-content [class*='border-slate-700'] {
        border-color: rgba(148, 163, 184, 0.48) !important;
      }


      /* Phone typography baseline: the desktop readability floor above is too
         large for dense 2-column mobile cards. Keep scaling support, but use
         a smaller floor on phones so page-level compact layouts can breathe. */
      @media (max-width: 639px) {
        #root .dengue-scaled-content [class*="text-[7px]"],
        #root .dengue-scaled-content [class*="text-[8px]"],
        #root .dengue-scaled-content [class*="text-[9px]"] {
          font-size: clamp(0.64rem, calc(0.64rem * var(--dengue-scale)), 0.84rem) !important;
          line-height: clamp(0.88rem, calc(0.88rem * var(--dengue-scale)), 1.18rem) !important;
        }

        #root .dengue-scaled-content [class*="text-[10px]"],
        #root .dengue-scaled-content [class*="text-[11px]"] {
          font-size: clamp(0.7rem, calc(0.7rem * var(--dengue-scale)), 0.92rem) !important;
          line-height: clamp(0.96rem, calc(0.96rem * var(--dengue-scale)), 1.28rem) !important;
        }

        #root .dengue-scaled-content [class*="text-[12px]"],
        #root .dengue-scaled-content .text-xs {
          font-size: clamp(0.74rem, calc(0.74rem * var(--dengue-scale)), 0.98rem) !important;
          line-height: clamp(1.02rem, calc(1.02rem * var(--dengue-scale)), 1.36rem) !important;
        }

        #root .dengue-scaled-content .text-sm {
          font-size: clamp(0.8rem, calc(0.8rem * var(--dengue-scale)), 1.06rem) !important;
          line-height: clamp(1.12rem, calc(1.12rem * var(--dengue-scale)), 1.5rem) !important;
        }

        #root .dengue-scaled-content .text-base {
          font-size: clamp(0.88rem, calc(0.88rem * var(--dengue-scale)), 1.16rem) !important;
          line-height: clamp(1.24rem, calc(1.24rem * var(--dengue-scale)), 1.62rem) !important;
        }

        #root .dengue-scaled-content .text-lg {
          font-size: clamp(0.98rem, calc(0.98rem * var(--dengue-scale)), 1.28rem) !important;
          line-height: clamp(1.28rem, calc(1.28rem * var(--dengue-scale)), 1.72rem) !important;
        }

        #root .dengue-scaled-content .text-xl {
          font-size: clamp(1.08rem, calc(1.08rem * var(--dengue-scale)), 1.42rem) !important;
          line-height: clamp(1.4rem, calc(1.4rem * var(--dengue-scale)), 1.86rem) !important;
        }

        #root .dengue-scaled-content .text-2xl {
          font-size: clamp(1.22rem, calc(1.22rem * var(--dengue-scale)), 1.62rem) !important;
          line-height: clamp(1.52rem, calc(1.52rem * var(--dengue-scale)), 2rem) !important;
        }

        #root .dengue-scaled-content [data-information-type] {
          font-size: clamp(0.62rem, calc(0.62rem * var(--dengue-scale)), 0.82rem) !important;
          line-height: 1.05 !important;
          letter-spacing: 0.04em !important;
          padding: 0.24rem 0.45rem !important;
          white-space: nowrap !important;
        }
      }

      html.dengue-reduce-motion *,
      html.dengue-reduce-motion *::before,
      html.dengue-reduce-motion *::after {
        scroll-behavior: auto !important;
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.001ms !important;
      }
    `
  }, [textScale, comfortableControls, highContrast, reduceMotion])

  useEffect(() => {
    getNotificationReads()
      .then((result) => {
        const ids = Array.isArray(result?.read_notification_ids)
          ? result.read_notification_ids
          : []

        setReadNotificationIds((current) => Array.from(new Set([...current, ...ids])).slice(-150))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    localStorage.setItem(
      'dengue-read-notifications',
      JSON.stringify(readNotificationIds.slice(-150))
    )
  }, [readNotificationIds])

  useEffect(() => {
    setNotificationsOpen(false)
    setSettingsOpen(false)
    setMobileNavOpen(false)
    setToastVisible(false)
  }, [location.pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const mediaQuery = window.matchMedia('(max-width: 1279px)')

    const handleViewportChange = (event) => {
      setIsCompactViewport(event.matches)
    }

    setIsCompactViewport(mediaQuery.matches)
    mediaQuery.addEventListener?.('change', handleViewportChange)

    return () => {
      mediaQuery.removeEventListener?.('change', handleViewportChange)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const shouldLockPageScroll =
      loggingOut || mobileNavOpen || (isCompactViewport && (settingsOpen || notificationsOpen))

    if (!shouldLockPageScroll) return undefined

    const previousOverflow = document.body.style.overflow
    const previousOverscrollBehavior = document.body.style.overscrollBehavior

    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.overscrollBehavior = previousOverscrollBehavior
    }
  }, [loggingOut, mobileNavOpen, settingsOpen, notificationsOpen, isCompactViewport])

  function handleThemeToggle() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  function handleResetDisplaySettings() {
    setTextScale(100)
    setComfortableControls(false)
    setHighContrast(false)
    setReduceMotion(false)
  }

  async function handleNotificationsEnabledChange(nextValueOrUpdater) {
    if (notificationPreferenceSaving) return

    const previousValue = notificationsEnabled
    const nextValue =
      typeof nextValueOrUpdater === 'function'
        ? Boolean(nextValueOrUpdater(previousValue))
        : Boolean(nextValueOrUpdater)

    if (nextValue === previousValue) return

    setNotificationsEnabled(nextValue)
    setNotificationPreferenceSaving(true)

    try {
      const result = await updateNotificationPreferences(nextValue)
      const savedValue = result?.notifications_enabled !== false

      setNotificationsEnabled(savedValue)
    } catch {
      // Keep the browser and Supabase values consistent if saving fails.
      setNotificationsEnabled(previousValue)
    } finally {
      setNotificationPreferenceSaving(false)
    }
  }

  function markNotificationAsRead(notificationId) {
    saveNotificationRead(notificationId).catch(() => {})

    setReadNotificationIds((current) => {
      if (current.includes(notificationId)) {
        return current
      }

      return [...current, notificationId].slice(-150)
    })
  }

  function markAllNotificationsAsRead() {
    const notificationIds = notifications.map((item) => item.id).filter(Boolean)
    saveNotificationsRead(notificationIds).catch(() => {})

    setReadNotificationIds((current) => {
      const merged = new Set(current)

      notificationIds.forEach((notificationId) => {
        merged.add(notificationId)
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

  function handleToastClose() {
    setToastVisible(false)
  }

  function handleToastOpen() {
    if (!toastNotification) return

    setToastVisible(false)
    handleNotificationClick(toastNotification)
  }

  function finalizeLogout() {
    if (logoutFinalizedRef.current) return

    logoutFinalizedRef.current = true

    if (logoutTimerRef.current) {
      window.clearTimeout(logoutTimerRef.current)
      logoutTimerRef.current = null
    }

    localStorage.removeItem('dengue-auth-session')

    // Match the FortressAuth logout flow: terminate the authenticated session,
    // then clear browser-only workspace state before returning to secure access.
    // Persisted uploads, forecasts, and database records are not deleted.
    resetLocalWorkspaceSession?.()

    navigate('/login', { replace: true })
  }

  function handleLogout() {
    if (logoutStartedRef.current || loggingOut) return

    logoutStartedRef.current = true
    setLoggingOut(true)
    setMobileNavOpen(false)
    setNotificationsOpen(false)
    setSettingsOpen(false)
    setToastVisible(false)

    addActivityLog?.(
      'User signed out',
      'The current user signed out of the dengue monitoring prototype.'
    )

    // Start revoking the server-side session immediately, while the secure
    // transition paints. As in FortressAuth, network/database latency never
    // prevents the browser from completing logout. The Authorization header is
    // captured by logoutUser before local session storage is cleared.
    try {
      const savedSession = JSON.parse(localStorage.getItem('dengue-auth-session') || '{}')
      if (savedSession?.session_id) {
        logoutUser().catch(() => {})
      }
    } catch {
      // Continue logout even if the saved session cannot be parsed.
    }

    // FortressAuth shows a short session-termination transition before
    // returning to its login gateway. Keep the same tactile beat here.
    logoutTimerRef.current = window.setTimeout(() => {
      finalizeLogout()
    }, 1150)
  }
  function handleOpenActionCommandCenter() {
  setMobileNavOpen(false)

  const targetPath = currentRole === 'bhw'
    ? '/bhw'
    : currentRole === 'supervisor'
      ? '/supervisor#response-action-center'
      : '/forecast#decision-action-tracking'
  const targetId = currentRole === 'supervisor'
    ? 'response-action-center'
    : 'decision-action-tracking'

  navigate(targetPath)

  window.setTimeout(() => {
    const targetElement = document.getElementById(targetId)

    if (targetElement) {
      targetElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }
  }, 180)
}

  return (
    <div className="dengue-app-shell relative min-h-screen overflow-x-clip bg-[radial-gradient(circle_at_8%_0%,rgba(56,189,248,0.08),transparent_30%),radial-gradient(circle_at_92%_10%,rgba(16,185,129,0.055),transparent_26%),linear-gradient(180deg,#dbe5ea_0%,#e5ecef_42%,#dce5e9_100%)] px-3 pb-3 pt-[5.35rem] text-brand-text transition-colors duration-300 dark:bg-[radial-gradient(circle_at_8%_0%,rgba(14,165,233,0.12),transparent_28%),radial-gradient(circle_at_92%_10%,rgba(16,185,129,0.07),transparent_24%),linear-gradient(180deg,#020617_0%,#07111f_48%,#020617_100%)] dark:text-slate-100 sm:px-5 sm:pb-5 sm:pt-[5.6rem] xl:px-6 xl:py-5">
      <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(15,23,42,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.5)_1px,transparent_1px)] [background-size:44px_44px] dark:opacity-[0.055] dark:[background-image:linear-gradient(rgba(255,255,255,0.35)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.35)_1px,transparent_1px)]" />
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-cyan-200/25 blur-3xl dark:bg-cyan-500/10" />
      <div className="pointer-events-none absolute -right-32 top-40 h-96 w-96 rounded-full bg-emerald-200/20 blur-3xl dark:bg-emerald-500/10" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-sky-100/[0.28] blur-3xl dark:bg-sky-500/5" />

      {loggingOut && (
        <LogoutTransition onReturnNow={finalizeLogout} />
      )}

      <NotificationToast
        notification={toastNotification}
        visible={toastVisible}
        onClose={handleToastClose}
        onOpen={handleToastOpen}
      />

      <div
        className={`dengue-mobile-topbar fixed left-3 right-3 z-[8500] overflow-visible rounded-[22px] border border-white/20 bg-[#071525]/95 px-2.5 py-2 shadow-[0_20px_50px_rgba(2,6,23,0.38)] ring-1 ring-cyan-300/10 backdrop-blur-2xl transition-all duration-200 sm:left-5 sm:right-5 xl:hidden ${
          mobileNavOpen ? 'pointer-events-none invisible opacity-0' : 'visible opacity-100'
        }`}
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
          WebkitTransform: 'translateZ(0)',
          transform: 'translateZ(0)',
        }}
      >
        <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />

        <div className="relative flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="dengue-mobile-icon-button flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] text-white shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-cyan-100"
            aria-label="Open navigation menu"
          >
            <Menu size={20} />
          </button>

          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-black leading-5 text-white">
              {title}
            </p>

            <p className="truncate text-[11px] font-bold leading-4 text-cyan-100/60">
              Butuan City · {systemStatus.badge} · {dataRange}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <div className="relative z-[370]">
              <button
                ref={mobileSettingsButtonRef}
                type="button"
                onClick={() => {
                  setSettingsOpen((current) => !current)
                  setNotificationsOpen(false)
                }}
                className={`dengue-mobile-icon-button flex h-10 w-10 items-center justify-center rounded-2xl border shadow-sm transition hover:-translate-y-0.5 ${
                  settingsOpen
                    ? 'border-cyan-300/40 bg-cyan-300/[0.15] text-cyan-100'
                    : 'border-white/10 bg-white/[0.07] text-white/70 hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-cyan-100'
                }`}
                aria-label="Display settings"
                title="Display settings"
              >
                <Settings size={17} />
              </button>
            </div>

            <div className="relative z-[360]">
              <button
                ref={mobileNotificationsButtonRef}
                type="button"
                onClick={() => {
                  setNotificationsOpen((current) => !current)
                  setSettingsOpen(false)
                }}
                className="dengue-mobile-icon-button relative flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] text-white/70 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-cyan-100"
                aria-label={notificationsEnabled ? 'Notifications' : 'Notifications are turned off'}
              >
                {notificationsEnabled ? <Bell size={17} /> : <BellOff size={17} />}

                {notificationsEnabled && unreadNotifications.length > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white ring-2 ring-white dark:ring-slate-950">
                    {unreadNotifications.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {settingsOpen && isCompactViewport && (
        <div className="fixed inset-0 z-[9000] xl:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close display settings"
            className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm"
            onPointerDown={(event) => {
              event.stopPropagation()
              setSettingsOpen(false)
            }}
            onClick={(event) => event.stopPropagation()}
          />

          <DisplaySettingsPanel
            panelRef={settingsPanelRef}
            mobile
            textScale={textScale}
            setTextScale={setTextScale}
            comfortableControls={comfortableControls}
            setComfortableControls={setComfortableControls}
            highContrast={highContrast}
            setHighContrast={setHighContrast}
            reduceMotion={reduceMotion}
            setReduceMotion={setReduceMotion}
            notificationsEnabled={notificationsEnabled}
            setNotificationsEnabled={handleNotificationsEnabledChange}
            onReset={handleResetDisplaySettings}
            onClose={() => setSettingsOpen(false)}
          />
        </div>
      )}

      {notificationsOpen && isCompactViewport && (
        <div className="fixed inset-0 z-[9000] xl:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close notifications"
            className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm"
            onPointerDown={(event) => {
              event.stopPropagation()
              setNotificationsOpen(false)
            }}
            onClick={(event) => event.stopPropagation()}
          />

          <NotificationsPanel
            panelRef={notificationsPanelRef}
            mobile
            notifications={notifications}
            notificationsEnabled={notificationsEnabled}
            readNotificationIds={readNotificationIds}
            markAllNotificationsAsRead={markAllNotificationsAsRead}
            handleNotificationClick={handleNotificationClick}
            onClose={() => setNotificationsOpen(false)}
          />
        </div>
      )}

      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          className="dengue-mobile-nav-overlay fixed inset-0 z-[8600] bg-slate-950/60 backdrop-blur-md xl:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`dengue-mobile-drawer fixed left-0 top-0 z-[10020] flex h-full w-[88%] max-w-[340px] transform flex-col overflow-hidden border-r border-white/10 bg-[radial-gradient(circle_at_20%_0%,rgba(56,189,248,0.22),transparent_30%),linear-gradient(180deg,#061426_0%,#0a2744_52%,#0b3556_100%)] px-5 py-6 text-white shadow-[0_30px_100px_rgba(2,6,23,0.62)] transition-transform duration-300 xl:hidden ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-0 h-60 w-60 rounded-full bg-emerald-400/[0.15] blur-3xl" />

        <div className="dengue-mobile-drawer-header relative mb-8 flex shrink-0 items-center justify-between gap-3">
          <div className="dengue-mobile-drawer-brand flex min-w-0 items-center gap-3">
            <img
              src={dengueLogo}
              alt="Dengue Intelligence"
              className="dengue-mobile-drawer-logo h-[72px] w-[72px] shrink-0 object-contain drop-shadow-[0_10px_18px_rgba(2,6,23,0.30)]"
            />

            <div className="dengue-mobile-drawer-brand-copy min-w-0">
              <p className="dengue-mobile-drawer-title truncate text-lg font-black">Butuan City</p>

              <p className="dengue-mobile-drawer-role truncate text-sm font-medium text-white/60">
                {roleLabel}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="dengue-mobile-drawer-close flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white transition hover:bg-white/20"
            aria-label="Close navigation menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="dengue-mobile-drawer-nav relative min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain pr-1">
          {filteredNavItems.map(({ to, label, icon: Icon }) => (
            <SidebarNavItem
              key={to}
              to={to}
              label={label}
              Icon={Icon}
              onClick={() => setMobileNavOpen(false)}
            />
          ))}
        </nav>

        <div className="dengue-mobile-drawer-footer relative mt-auto shrink-0 space-y-3 pt-8">
          <ThemeModeSwitch isDark={isDark} onToggle={handleThemeToggle} />

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="dengue-mobile-logout flex w-full items-center justify-center gap-2 rounded-[20px] border border-white/20 bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-70"
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

          <button
            type="button"
            onClick={handleOpenActionCommandCenter}
            className="dengue-mobile-quick-action group relative w-full overflow-hidden rounded-[22px] border border-white/20 bg-white/10 p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur transition hover:bg-white/20"
          >
            <div className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-sky-300/20 blur-2xl" />

            <div className="relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5">
              <div className="dengue-mobile-quick-action-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] border border-white/20 bg-white/10 text-white">
                <ClipboardCheck className="h-5 w-5" />
              </div>

              <div className="min-w-0">
                <p className="dengue-mobile-quick-action-label text-[9px] font-black uppercase tracking-[0.16em] text-white/50">
                  Quick action
                </p>
                <p className="dengue-mobile-quick-action-title mt-0.5 truncate text-sm font-black leading-5 text-white">
                  Response action
                </p>
              </div>

              <span className="dengue-mobile-quick-action-open shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white/70">
                Open
              </span>
            </div>
          </button>
        </div>
      </aside>

      <div className="dengue-layout-shell relative mx-auto flex w-full min-h-[calc(100dvh-5.5rem)] items-start gap-5 sm:min-h-[calc(100dvh-6rem)] xl:min-h-[calc(100dvh-2.5rem)]">
        <aside className="dengue-desktop-sidebar sticky top-5 z-[60] hidden h-[calc(100dvh-2.5rem)] shrink-0 self-start flex-col overflow-hidden rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_22%_0%,rgba(56,189,248,0.24),transparent_27%),linear-gradient(180deg,#061426_0%,#0a2744_52%,#0b3556_100%)] px-5 py-6 text-white shadow-[0_28px_86px_rgba(2,6,23,0.42)] ring-1 ring-cyan-300/10 transition-colors duration-300 xl:flex">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-0 h-64 w-64 rounded-full bg-emerald-400/[0.15] blur-3xl" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,0.45)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.45)_1px,transparent_1px)] [background-size:36px_36px]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

          <div className="relative mb-5 overflow-hidden rounded-[28px] border border-white/20 bg-white/[0.08] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_18px_38px_rgba(2,6,23,0.18)] backdrop-blur-xl">
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-cyan-300/[0.15] blur-2xl" />
            <div className="relative flex items-center gap-3">
              <img
                src={dengueLogo}
                alt="Dengue Intelligence"
                className="h-[82px] w-[82px] shrink-0 object-contain drop-shadow-[0_12px_22px_rgba(2,6,23,0.32)]"
              />

              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/60">Dengue intelligence</p>
                <p className="mt-1 truncate text-lg font-black">Butuan City</p>
                <p className="truncate text-xs font-semibold text-white/60">{roleLabel}</p>
              </div>
            </div>
          </div>

          <div className="relative mb-4 overflow-hidden rounded-[26px] border border-white/20 bg-slate-950/20 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_14px_34px_rgba(2,6,23,0.16)] backdrop-blur-xl">
            <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-cyan-300/[0.15] blur-2xl" />
            <div className="relative flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/40">Workspace status</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${hasDengueData ? 'bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.9)]' : 'bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,0.9)]'}`} />
                  <span className="text-sm font-black text-white">{systemStatus.badge}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-2 text-right">
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40">Area</p>
                <p className="mt-1 text-xs font-black text-cyan-100">Butuan City</p>
              </div>
            </div>
          </div>

          <nav className="relative min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 dengue-premium-scrollbar">
            <p className="px-3 pb-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/40">
              Navigation
            </p>

            {filteredNavItems.map(({ to, label, icon: Icon }) => (
              <SidebarNavItem key={to} to={to} label={label} Icon={Icon} desktopAccent />
            ))}
          </nav>

          <div className="relative mt-auto shrink-0 space-y-3 pt-5">
            <ThemeModeSwitch isDark={isDark} onToggle={handleThemeToggle} />



            <button
  type="button"
  onClick={handleOpenActionCommandCenter}
  className="group relative w-full overflow-hidden rounded-[24px] border border-white/20 bg-white/10 p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur transition hover:bg-white/20"
>
  <div className="relative grid grid-cols-[auto_1fr_auto] items-center gap-3">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white">
      <ClipboardCheck className="h-5 w-5" />
    </div>

    <div className="min-w-0">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/40">
        Quick action
      </p>

      <p className="truncate text-sm font-black text-white">
        Response action
      </p>
    </div>

    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/70">
      Open
    </span>
  </div>
</button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="relative min-h-full overflow-visible rounded-[36px] border border-slate-300/80 bg-[rgba(234,239,242,0.92)] p-3 shadow-[0_24px_70px_rgba(15,23,42,0.10)] ring-1 ring-slate-300/55 backdrop-blur-2xl transition-colors duration-300 dark:border-slate-800/90 dark:bg-slate-900/[0.78] dark:ring-white/5 sm:p-5 lg:p-6">
            <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
            <header className="dengue-page-header relative z-[200] mb-6 overflow-visible rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_82%_0%,rgba(56,189,248,0.14),transparent_28%),linear-gradient(135deg,#050d19_0%,#07192b_55%,#0b2943_100%)] px-4 py-4 text-white shadow-[0_22px_58px_rgba(2,6,23,0.34)] ring-1 ring-cyan-300/10 backdrop-blur-2xl transition-colors duration-300 sm:px-5 sm:py-5">
              <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
                <div className="absolute -right-20 -top-20 h-52 w-52 rounded-full bg-cyan-400/10 blur-3xl" />
                <div className="absolute -bottom-20 left-1/3 h-44 w-44 rounded-full bg-emerald-400/10 blur-3xl" />
                <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.45)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.45)_1px,transparent_1px)] [background-size:34px_34px]" />
                <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
              </div>

              <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 items-start gap-3.5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-cyan-300/20 bg-cyan-300/10 text-cyan-100 shadow-[0_12px_28px_rgba(14,165,233,0.16)]">
                    <CurrentPageIcon size={22} strokeWidth={2.25} />
                  </div>

                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">
                        Butuan City
                      </span>

                      <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${systemStatus.badgeStyle}`}>
                        {systemStatus.label}
                      </span>
                    </div>

                    <h1 className="text-2xl font-black tracking-[-0.035em] text-white sm:text-[1.7rem]">
                      {title}
                    </h1>

                    <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-300">
                      {workspaceLabel}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <ThemeModeSwitch isDark={isDark} onToggle={handleThemeToggle} compact />

                  <div className="relative z-[310]">
                    <button
                      ref={settingsButtonRef}
                      type="button"
                      onClick={() => {
                        setSettingsOpen((current) => !current)
                        setNotificationsOpen(false)
                      }}
                      className={`relative flex h-11 w-11 items-center justify-center rounded-2xl border shadow-sm transition hover:-translate-y-0.5 ${
                        settingsOpen
                          ? 'border-cyan-300/40 bg-cyan-300/[0.15] text-cyan-100'
                          : 'border-white/10 bg-white/[0.07] text-white/70 hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-cyan-100'
                      }`}
                      aria-label="Display settings"
                      title="Display settings"
                    >
                      <Settings size={18} />
                    </button>

                    {settingsOpen && !isCompactViewport && typeof document !== 'undefined' && createPortal(
                      <DisplaySettingsPanel
                        panelRef={settingsPanelRef}
                        textScale={textScale}
                        setTextScale={setTextScale}
                        comfortableControls={comfortableControls}
                        setComfortableControls={setComfortableControls}
                        highContrast={highContrast}
                        setHighContrast={setHighContrast}
                        reduceMotion={reduceMotion}
                        setReduceMotion={setReduceMotion}
                        notificationsEnabled={notificationsEnabled}
                        setNotificationsEnabled={handleNotificationsEnabledChange}
                        onReset={handleResetDisplaySettings}
                        onClose={() => setSettingsOpen(false)}
                      />,
                      document.body
                    )}
                  </div>

                  <div className="relative z-[300]">
                    <button
                      ref={notificationsButtonRef}
                      type="button"
                      onClick={() => {
                        setNotificationsOpen((current) => !current)
                        setSettingsOpen(false)
                      }}
                      className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] text-white/70 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-cyan-100"
                      aria-label={notificationsEnabled ? 'Notifications' : 'Notifications are turned off'}
                    >
                      {notificationsEnabled ? <Bell size={18} /> : <BellOff size={18} />}

                      {notificationsEnabled && unreadNotifications.length > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-black text-white ring-2 ring-[#071525]">
                          {unreadNotifications.length}
                        </span>
                      )}
                    </button>

                    {notificationsOpen && (
                      <NotificationsPanel
                        panelRef={notificationsPanelRef}
                        notifications={notifications}
                        notificationsEnabled={notificationsEnabled}
                        readNotificationIds={readNotificationIds}
                        markAllNotificationsAsRead={markAllNotificationsAsRead}
                        handleNotificationClick={handleNotificationClick}
                        onClose={() => setNotificationsOpen(false)}
                      />
                    )}
                  </div>

                  <div
                    role="status"
                    className="flex min-h-11 items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-2 text-slate-200 shadow-sm"
                    aria-label={`Dataset range: ${dataRange}`}
                    title={`Dataset range: ${dataRange}`}
                  >
                    <CalendarDays size={16} className="shrink-0 text-cyan-200" />

                    <span className="min-w-0 leading-tight">
                      <span className="block text-[9px] font-black uppercase tracking-[0.14em] text-white/45">
                        Data range
                      </span>

                      <span className="mt-0.5 block truncate text-sm font-black text-slate-100">
                        {dataRange}
                      </span>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="flex min-h-11 items-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm font-black text-rose-200 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-300/30 hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-70"
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

            <div
              className="dengue-scaled-content"
              style={{ '--dengue-content-scale': textScale / 100 }}
            >
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
