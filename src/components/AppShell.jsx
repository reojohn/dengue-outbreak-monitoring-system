import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell,
  Activity,
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
  Settings,
  Type,
  Eye,
  MousePointer2,
  RotateCcw,
  Minus,
  Plus,
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

const TEXT_SCALE_MIN = 90
const TEXT_SCALE_MAX = 160
const TEXT_SCALE_STEP = 5

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

function getInitialTextScale() {
  const savedScale = Number(localStorage.getItem('dengue-text-scale') || 100)

  if (
    Number.isFinite(savedScale) &&
    savedScale >= TEXT_SCALE_MIN &&
    savedScale <= TEXT_SCALE_MAX
  ) {
    return savedScale
  }

  return 100
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

function SettingsToggle({ enabled, onToggle, icon: Icon, title, description }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`group flex w-full items-center justify-between gap-4 overflow-hidden rounded-[24px] border p-3.5 text-left transition hover:-translate-y-0.5 ${
        enabled
          ? 'border-sky-300/40 bg-gradient-to-br from-sky-50 via-white to-cyan-50 text-brand-blue shadow-[0_16px_34px_rgba(14,165,233,0.12)] dark:border-sky-400/30 dark:from-sky-500/15 dark:via-slate-950 dark:to-cyan-500/10 dark:text-sky-200'
          : 'border-slate-200 bg-white/90 text-brand-text hover:border-brand-blue/25 hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-100 dark:hover:border-blue-500/30'
      }`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border transition ${
            enabled
              ? 'border-sky-200 bg-white text-brand-blue shadow-sm dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-200'
              : 'border-slate-200 bg-slate-50 text-brand-muted group-hover:text-brand-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:group-hover:text-blue-300'
          }`}
        >
          <Icon className="h-5 w-5" />
        </span>

        <span className="min-w-0">
          <span className="block text-sm font-black">{title}</span>
          <span className="mt-0.5 block text-xs leading-5 text-brand-muted dark:text-slate-400">
            {description}
          </span>
        </span>
      </span>

      <span
        className={`relative h-8 w-[58px] shrink-0 rounded-full border transition ${
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
  textScale,
  setTextScale,
  comfortableControls,
  setComfortableControls,
  highContrast,
  setHighContrast,
  reduceMotion,
  setReduceMotion,
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
      className="dengue-premium-panel absolute right-0 top-14 z-[9999] w-[calc(100vw-2rem)] max-w-[470px] overflow-hidden rounded-[34px] border border-white/80 bg-white/95 shadow-[0_34px_90px_rgba(15,23,42,0.26)] ring-1 ring-slate-200/70 backdrop-blur-2xl dark:border-slate-700/80 dark:bg-slate-950/95 dark:ring-white/10"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-sky-300/30 blur-3xl dark:bg-sky-500/15" />
      <div className="pointer-events-none absolute -bottom-16 left-6 h-44 w-44 rounded-full bg-emerald-300/20 blur-3xl dark:bg-emerald-500/10" />
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/70 to-transparent" />

      <div className="relative border-b border-slate-100/90 bg-gradient-to-br from-white via-sky-50/90 to-slate-50 px-5 py-4 dark:border-slate-800 dark:from-slate-950 dark:via-blue-950/40 dark:to-slate-950">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-brand-blue to-sky-500 text-white shadow-[0_16px_32px_rgba(37,95,143,0.26)] ring-1 ring-white/30">
              <Settings className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <p className="text-base font-black tracking-tight text-brand-text dark:text-slate-100">
                Display settings
              </p>

              <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                Accessibility controls for readability, comfort, and reduced visual strain.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-brand-muted shadow-sm transition hover:-translate-y-0.5 hover:border-rose-200 hover:text-rose-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-rose-500/30 dark:hover:text-rose-300"
            aria-label="Close display settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="dengue-premium-scrollbar relative max-h-[72vh] overflow-y-auto p-4">
        <div className="overflow-hidden rounded-[28px] border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-4 shadow-[0_18px_42px_rgba(14,165,233,0.10)] dark:border-sky-500/20 dark:from-sky-500/10 dark:via-slate-950 dark:to-cyan-500/10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-sky-200 bg-white text-brand-blue shadow-sm dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200">
                <Type className="h-5 w-5" />
              </div>

              <div>
                <p className="text-base font-black text-brand-text dark:text-slate-100">
                  Text size
                </p>

                <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                  Enlarges the system text across all pages. Small fixed labels are boosted at higher sizes.
                </p>
              </div>
            </div>

            <span className="shrink-0 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-black text-brand-blue shadow-sm dark:border-sky-500/20 dark:bg-slate-900 dark:text-sky-200">
              {textLabel} · {textScale}%
            </span>
          </div>

          <div className="mt-5 rounded-[24px] border border-white/80 bg-white/80 p-4 shadow-inner dark:border-slate-700 dark:bg-slate-950/60">
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

            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[11px] font-black uppercase tracking-[0.12em] text-brand-muted dark:text-slate-500">
              <span>Small</span>
              <span>Default</span>
              <span>Large</span>
              <span>Max</span>
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3">
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
        </div>

        <button
          type="button"
          onClick={onReset}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-[24px] border border-slate-200 bg-white/90 px-4 py-3 text-sm font-black text-brand-muted shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue/30 hover:text-brand-blue hover:shadow-[0_14px_30px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-300 dark:hover:text-blue-300"
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
  notifications,
  readNotificationIds,
  markAllNotificationsAsRead,
  handleNotificationClick,
  onClose,
}) {
  return (
    <div
      ref={panelRef}
      className="dengue-premium-panel absolute right-0 top-14 z-[9999] w-[calc(100vw-2rem)] max-w-[460px] overflow-hidden rounded-[34px] border border-white/80 bg-white/95 shadow-[0_34px_90px_rgba(15,23,42,0.26)] ring-1 ring-slate-200/70 backdrop-blur-2xl dark:border-slate-700/80 dark:bg-slate-950/95 dark:ring-white/10 sm:w-[460px]"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-blue-300/30 blur-3xl dark:bg-blue-500/15" />
      <div className="pointer-events-none absolute -bottom-16 left-6 h-44 w-44 rounded-full bg-rose-300/15 blur-3xl dark:bg-rose-500/10" />
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/70 to-transparent" />

      <div className="relative border-b border-slate-100/90 bg-gradient-to-br from-white via-blue-50/90 to-slate-50 px-5 py-4 dark:border-slate-800 dark:from-slate-950 dark:via-blue-950/40 dark:to-slate-950">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-brand-blue to-sky-500 text-white shadow-[0_16px_32px_rgba(37,95,143,0.26)] ring-1 ring-white/30">
              <Bell className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <p className="text-base font-black tracking-tight text-brand-text dark:text-slate-100">
                Dengue notifications
              </p>

              <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                Barangay risk status, dataset readiness, and activity updates.
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

        {notifications.length > 0 && (
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

      <div className="dengue-premium-scrollbar relative max-h-[430px] overflow-y-auto p-3.5">
        {notifications.map((item, index) => {
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

                  <p className="mt-2 text-xs font-black uppercase tracking-[0.12em] text-brand-blue dark:text-blue-300">
                    Open related page
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

function ActiveNavCornerFrame() {
  const cornerBase =
    'pointer-events-none absolute h-6 w-6 border-white/95 opacity-100 drop-shadow-[0_0_8px_rgba(255,255,255,0.82)]'

  return (
    <>
      <span
        className={`${cornerBase} left-0 top-0 rounded-tl-[18px] border-l-[3px] border-t-[3px]`}
      />
      <span
        className={`${cornerBase} right-0 top-0 rounded-tr-[18px] border-r-[3px] border-t-[3px]`}
      />
      <span
        className={`${cornerBase} bottom-0 left-0 rounded-bl-[18px] border-b-[3px] border-l-[3px]`}
      />
      <span
        className={`${cornerBase} bottom-0 right-0 rounded-br-[18px] border-b-[3px] border-r-[3px]`}
      />
    </>
  )
}

function SidebarNavItem({ to, label, Icon, onClick }) {
  return (
    <NavLink key={to} to={to} onClick={onClick} className="block outline-none">
      {({ isActive }) => (
        <div
          className={`group/navitem relative p-[6px] transition duration-300 ${
            isActive ? 'scale-[1.01]' : 'hover:scale-[1.01]'
          }`}
        >
          {isActive && <ActiveNavCornerFrame />}

          <div
            style={
              isActive
                ? {
                    backgroundColor: '#ffffff',
                    color: '#0f2742',
                    boxShadow:
                      'inset 0 1px 0 rgba(255,255,255,0.95), 0 18px 34px rgba(15,23,42,0.18)',
                  }
                : undefined
            }
            className={`relative z-10 flex items-center gap-3 overflow-hidden rounded-[22px] px-4 py-3 text-sm font-bold transition duration-300 focus-within:ring-2 focus-within:ring-white/50 ${
              isActive
                ? '!bg-white !text-[#0f2742] dark:!bg-white dark:!text-[#0f2742]'
                : 'text-white/75 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span
              style={
                isActive
                  ? {
                      backgroundColor: '#f1f5f9',
                      color: '#255f8f',
                      boxShadow: 'inset 0 1px 2px rgba(15,23,42,0.06)',
                    }
                  : undefined
              }
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-current transition duration-300 ${
                isActive
                  ? '!bg-slate-100 !text-[#255f8f] dark:!bg-slate-100 dark:!text-[#255f8f]'
                  : 'bg-white/10 group-hover/navitem:bg-white/15'
              }`}
            >
              <Icon size={18} />
            </span>

            <span className="relative z-10">{label}</span>
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
    addActivityLog,
  } = useData()

  const [loggingOut, setLoggingOut] = useState(false)
  const [theme, setTheme] = useState(getInitialTheme)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [readNotificationIds, setReadNotificationIds] = useState(getInitialReadNotifications)
  const settingsButtonRef = useRef(null)
  const settingsPanelRef = useRef(null)
  const notificationsButtonRef = useRef(null)
  const notificationsPanelRef = useRef(null)
  const [textScale, setTextScale] = useState(getInitialTextScale)
  const [comfortableControls, setComfortableControls] = useState(() =>
    getInitialDisplaySetting('dengue-comfortable-controls')
  )
  const [highContrast, setHighContrast] = useState(() =>
    getInitialDisplaySetting('dengue-high-contrast')
  )
  const [reduceMotion, setReduceMotion] = useState(() =>
    getInitialDisplaySetting('dengue-reduce-motion')
  )

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
    function handleOutsidePointerDown(event) {
      const target = event.target

      if (
        settingsOpen &&
        !settingsPanelRef.current?.contains(target) &&
        !settingsButtonRef.current?.contains(target)
      ) {
        setSettingsOpen(false)
      }

      if (
        notificationsOpen &&
        !notificationsPanelRef.current?.contains(target) &&
        !notificationsButtonRef.current?.contains(target)
      ) {
        setNotificationsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsidePointerDown)
    document.addEventListener('touchstart', handleOutsidePointerDown)

    return () => {
      document.removeEventListener('mousedown', handleOutsidePointerDown)
      document.removeEventListener('touchstart', handleOutsidePointerDown)
    }
  }, [settingsOpen, notificationsOpen])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('dengue-theme-mode', theme)
  }, [theme, isDark])

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
      .dengue-layout-shell {
        max-width: var(--dengue-layout-max-width, 1540px);
      }

      html.dengue-wide-layout .dengue-layout-shell {
        width: 100%;
      }

      .dengue-desktop-sidebar {
        width: var(--dengue-sidebar-width, 292px);
      }

      .dengue-scaled-content {
        --dengue-scale: var(--dengue-content-scale, 1);
      }

      .dengue-scaled-content [class*="text-[9px]"] {
        font-size: clamp(0.56rem, calc(0.5625rem * var(--dengue-scale)), 1rem) !important;
        line-height: clamp(0.9rem, calc(0.95rem * var(--dengue-scale)), 1.55rem) !important;
      }

      .dengue-scaled-content [class*="text-[10px]"] {
        font-size: clamp(0.62rem, calc(0.625rem * var(--dengue-scale)), 1.08rem) !important;
        line-height: clamp(0.95rem, calc(1rem * var(--dengue-scale)), 1.62rem) !important;
      }

      .dengue-scaled-content [class*="text-[11px]"] {
        font-size: clamp(0.68rem, calc(0.6875rem * var(--dengue-scale)), 1.16rem) !important;
        line-height: clamp(1rem, calc(1.05rem * var(--dengue-scale)), 1.72rem) !important;
      }

      .dengue-scaled-content .text-xs {
        font-size: clamp(0.75rem, calc(0.75rem * var(--dengue-scale)), 1.2rem) !important;
        line-height: clamp(1rem, calc(1rem * var(--dengue-scale)), 1.7rem) !important;
      }

      .dengue-scaled-content .text-sm {
        font-size: clamp(0.875rem, calc(0.875rem * var(--dengue-scale)), 1.35rem) !important;
        line-height: clamp(1.25rem, calc(1.25rem * var(--dengue-scale)), 1.95rem) !important;
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
    localStorage.setItem(
      'dengue-read-notifications',
      JSON.stringify(readNotificationIds.slice(-150))
    )
  }, [readNotificationIds])

  useEffect(() => {
    setNotificationsOpen(false)
    setSettingsOpen(false)
    setMobileNavOpen(false)
  }, [location.pathname])

  function handleThemeToggle() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  function handleResetDisplaySettings() {
    setTextScale(100)
    setComfortableControls(false)
    setHighContrast(false)
    setReduceMotion(false)
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
        className={`fixed left-0 top-0 z-[100] flex h-full w-[86%] max-w-[340px] transform flex-col overflow-y-auto bg-gradient-to-b dengue-premium-scrollbar from-[#0b1733] via-brand-navy to-[#1e4770] px-5 py-6 text-white shadow-[0_28px_90px_rgba(15,23,42,0.42)] transition-transform duration-300 dark:border-r dark:border-slate-800 dark:from-[#0b1733] dark:via-brand-navy dark:to-[#1e4770] lg:hidden ${
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

        <nav className="dengue-premium-scrollbar relative space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <SidebarNavItem
              key={to}
              to={to}
              label={label}
              Icon={Icon}
              onClick={() => setMobileNavOpen(false)}
            />
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

      <div className="dengue-layout-shell relative mx-auto flex w-full min-h-[calc(100vh-1.5rem)] items-start gap-5 sm:min-h-[calc(100vh-2.5rem)]">
        <aside className="dengue-desktop-sidebar sticky top-5 z-[60] hidden h-[calc(100vh-2.5rem)] shrink-0 flex-col overflow-hidden rounded-[34px] border border-white/10 bg-gradient-to-b from-[#0b1733] via-brand-navy to-[#1e4770] px-5 py-6 text-white shadow-[0_24px_70px_rgba(15,23,42,0.28)] ring-1 ring-white/10 transition-colors duration-300 dark:border-slate-800 dark:from-[#0b1733] dark:via-brand-navy dark:to-[#1e4770] lg:flex">
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

          <nav className="dengue-premium-scrollbar relative space-y-1 overflow-y-auto pr-2">
            <p className="px-3 pb-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/40">
              Navigation
            </p>

            {navItems.map(({ to, label, icon: Icon }) => (
              <SidebarNavItem key={to} to={to} label={label} Icon={Icon} />
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

                  <div className="relative z-[310]">
                    <button
                      ref={settingsButtonRef}
                      type="button"
                      onClick={() => {
                        setSettingsOpen((current) => !current)
                        setNotificationsOpen(false)
                      }}
                      className={`relative rounded-2xl border p-3 shadow-sm transition hover:-translate-y-0.5 ${
                        settingsOpen
                          ? 'border-brand-blue/30 bg-blue-50 text-brand-blue dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300'
                          : 'border-slate-200 bg-white text-brand-muted hover:border-brand-blue/30 hover:text-brand-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                      }`}
                      aria-label="Display settings"
                      title="Display settings"
                    >
                      <Settings size={18} />
                    </button>

                    {settingsOpen && (
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
                        onReset={handleResetDisplaySettings}
                        onClose={() => setSettingsOpen(false)}
                      />
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
                      <NotificationsPanel
                        panelRef={notificationsPanelRef}
                        notifications={notifications}
                        readNotificationIds={readNotificationIds}
                        markAllNotificationsAsRead={markAllNotificationsAsRead}
                        handleNotificationClick={handleNotificationClick}
                        onClose={() => setNotificationsOpen(false)}
                      />
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
