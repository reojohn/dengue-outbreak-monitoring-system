import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Droplets,
  FileText,
  Home,
  MapPinned,
  Megaphone,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { getAuthSession } from '../utils/auth'
import { riskStyles } from '../utils/analytics'

function formatNumber(value) {
  return new Intl.NumberFormat('en-PH').format(Number(value || 0))
}

function normalizeName(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function getCases(row) {
  return (
    row?.predictedCases ??
    row?.predicted_cases ??
    row?.forecast ??
    row?.forecastCases ??
    row?.forecast_cases ??
    row?.cases ??
    row?.totalCases ??
    row?.total_cases ??
    0
  )
}

function getScore(row) {
  const score = Number(row?.score ?? row?.riskScore ?? row?.risk_score)

  if (Number.isFinite(score) && score > 0) {
    return Math.round(score <= 1 ? score * 100 : score)
  }

  if (row?.risk === 'High') return 90
  if (row?.risk === 'Moderate') return 60
  if (row?.risk === 'Low') return 30

  return 0
}

function getAction(risk) {
  if (risk === 'High') {
    return 'Immediate barangay response is recommended. Prioritize cleanup drives, larval source reduction, household advisories, and close coordination with the City Health Office.'
  }

  if (risk === 'Moderate') {
    return 'Continue weekly monitoring, inspect possible breeding sites, prepare community reminders, and monitor the barangay for possible escalation.'
  }

  if (risk === 'Low') {
    return 'Maintain routine surveillance, sanitation reminders, household awareness, and regular reporting of possible dengue symptoms.'
  }

  return 'Run the CHO forecast process first so this barangay can receive updated monitoring recommendations.'
}

function getRiskTone(risk) {
  if (risk === 'High') {
    return {
      gradient: 'from-rose-500 via-red-500 to-orange-400',
      soft: 'from-rose-50 via-white to-orange-50 dark:from-rose-500/10 dark:via-slate-950 dark:to-orange-500/10',
      text: 'text-rose-600 dark:text-rose-300',
      border: 'border-rose-200 dark:border-rose-500/25',
      chip: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200',
      glow: 'bg-rose-400/30 dark:bg-rose-500/15',
      status: 'Priority response required',
    }
  }

  if (risk === 'Moderate') {
    return {
      gradient: 'from-amber-400 via-orange-400 to-yellow-300',
      soft: 'from-amber-50 via-white to-yellow-50 dark:from-amber-500/10 dark:via-slate-950 dark:to-yellow-500/10',
      text: 'text-amber-600 dark:text-amber-300',
      border: 'border-amber-200 dark:border-amber-500/25',
      chip: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200',
      glow: 'bg-amber-300/30 dark:bg-amber-500/15',
      status: 'Active monitoring advised',
    }
  }

  if (risk === 'Low') {
    return {
      gradient: 'from-emerald-400 via-teal-400 to-cyan-300',
      soft: 'from-emerald-50 via-white to-cyan-50 dark:from-emerald-500/10 dark:via-slate-950 dark:to-cyan-500/10',
      text: 'text-emerald-600 dark:text-emerald-300',
      border: 'border-emerald-200 dark:border-emerald-500/25',
      chip: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200',
      glow: 'bg-emerald-300/30 dark:bg-emerald-500/15',
      status: 'Routine surveillance',
    }
  }

  return {
    gradient: 'from-slate-500 via-slate-600 to-slate-700',
    soft: 'from-slate-50 via-white to-blue-50 dark:from-slate-800 dark:via-slate-950 dark:to-blue-950/40',
    text: 'text-slate-600 dark:text-slate-300',
    border: 'border-slate-200 dark:border-slate-700',
    chip: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
    glow: 'bg-slate-300/30 dark:bg-slate-500/15',
    status: 'Waiting for forecast',
  }
}

function MetricCard({ icon: Icon, label, value, helper, tone = 'text-blue-500' }) {
  return (
    <div className="group relative overflow-hidden rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/60 backdrop-blur-xl transition hover:-translate-y-1 hover:shadow-[0_24px_58px_rgba(15,23,42,0.12)] dark:border-slate-800 dark:bg-slate-900/90 dark:ring-white/5">
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-sky-300/20 blur-3xl transition group-hover:bg-sky-300/30 dark:bg-sky-500/10" />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-brand-muted dark:text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-brand-text dark:text-white">{value}</p>
          <p className="mt-1 text-xs font-bold leading-5 text-brand-muted dark:text-slate-500">{helper}</p>
        </div>

        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] border border-slate-200 bg-slate-50 shadow-inner dark:border-slate-700 dark:bg-slate-950">
          <Icon className={`h-5 w-5 ${tone}`} />
        </div>
      </div>

      <style>{`
        @media (max-width: 639px) {
          .bhw-mobile-compact,
          .bhw-mobile-compact * {
            min-width: 0;
          }

          .bhw-mobile-compact {
            width: 100%;
            max-width: 100vw;
            overflow-x: hidden;
            padding-bottom: 1.25rem !important;
          }

          .bhw-mobile-compact.space-y-6 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 0.82rem !important;
          }

          .bhw-mobile-compact section,
          .bhw-mobile-compact .rounded-\[34px\],
          .bhw-mobile-compact .rounded-\[38px\],
          .bhw-mobile-compact .rounded-\[30px\] {
            max-width: 100% !important;
            overflow: hidden !important;
            border-radius: 20px !important;
          }

          .bhw-mobile-compact > section:first-of-type {
            padding: 0.85rem !important;
            border-radius: 22px !important;
          }

          .bhw-mobile-compact > section:first-of-type > .absolute,
          .bhw-mobile-compact .pointer-events-none.absolute {
            opacity: 0.65 !important;
          }

          .bhw-mobile-compact > section:first-of-type .relative.grid {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 0.75rem !important;
          }

          .bhw-mobile-compact .inline-flex.items-center.gap-2.rounded-full,
          .bhw-mobile-compact .rounded-full.border {
            padding: 0.32rem 0.55rem !important;
            font-size: 0.55rem !important;
            line-height: 1.05 !important;
            letter-spacing: 0.075em !important;
          }

          .bhw-mobile-compact h1 {
            margin-top: 0.75rem !important;
            font-size: 1.45rem !important;
            line-height: 1.05 !important;
            letter-spacing: -0.045em !important;
          }

          .bhw-mobile-compact h2,
          .bhw-mobile-compact .text-xl.font-black,
          .bhw-mobile-compact .text-lg.font-black {
            font-size: 0.98rem !important;
            line-height: 1.12 !important;
            letter-spacing: -0.025em !important;
          }

          .bhw-mobile-compact h3 {
            font-size: 0.95rem !important;
            line-height: 1.12 !important;
          }

          .bhw-mobile-compact p {
            font-size: 0.72rem !important;
            line-height: 1.28 !important;
          }

          .bhw-mobile-compact .text-sm { font-size: 0.7rem !important; line-height: 1.28 !important; }
          .bhw-mobile-compact .text-xs { font-size: 0.58rem !important; line-height: 1.18 !important; }
          .bhw-mobile-compact .text-2xl { font-size: 1.08rem !important; line-height: 1.05 !important; }
          .bhw-mobile-compact .text-3xl { font-size: 1.25rem !important; line-height: 1.05 !important; }
          .bhw-mobile-compact .text-4xl { font-size: 1.65rem !important; line-height: 1.05 !important; }

          .bhw-mobile-compact h1 + p,
          .bhw-mobile-compact section:first-of-type p.leading-7 {
            margin-top: 0.5rem !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
          }

          .bhw-mobile-grid-3 {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 0.45rem !important;
          }

          .bhw-mobile-grid-4 {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.5rem !important;
          }

          .bhw-mobile-grid-3 > *,
          .bhw-mobile-grid-4 > * {
            min-width: 0 !important;
            max-width: 100% !important;
            overflow: hidden !important;
          }

          .bhw-mobile-grid-3 > div,
          .bhw-mobile-grid-4 > div,
          .bhw-mobile-grid-3 > a,
          .bhw-mobile-grid-4 > a {
            border-radius: 15px !important;
            padding: 0.52rem !important;
            min-height: 72px !important;
          }

          .bhw-mobile-grid-3 p:first-child,
          .bhw-mobile-grid-4 p:first-child {
            font-size: 0.48rem !important;
            line-height: 1.08 !important;
            letter-spacing: 0.055em !important;
          }

          .bhw-mobile-grid-3 p:nth-child(2),
          .bhw-mobile-grid-4 p:nth-child(2),
          .bhw-mobile-grid-4 .text-3xl {
            margin-top: 0.3rem !important;
            font-size: 0.98rem !important;
            line-height: 1.05 !important;
          }

          .bhw-mobile-grid-3 p:last-child,
          .bhw-mobile-grid-4 p:last-child {
            font-size: 0.55rem !important;
            line-height: 1.16 !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
          }

          .bhw-mobile-compact > section:first-of-type .relative.overflow-hidden.rounded-\[34px\] {
            display: grid !important;
            grid-template-columns: auto minmax(0, 1fr) !important;
            align-items: center !important;
            gap: 0.75rem !important;
            text-align: left !important;
            padding: 0.72rem !important;
            border-radius: 18px !important;
          }

          .bhw-mobile-compact > section:first-of-type .relative.mx-auto.flex.h-24.w-24 {
            margin: 0 !important;
            height: 3.4rem !important;
            width: 3.4rem !important;
          }

          .bhw-mobile-compact > section:first-of-type .relative.mx-auto.flex.h-24.w-24 svg {
            height: 1.55rem !important;
            width: 1.55rem !important;
          }

          .bhw-mobile-compact > section:first-of-type .relative.overflow-hidden.rounded-\[34px\] .mt-4,
          .bhw-mobile-compact > section:first-of-type .relative.overflow-hidden.rounded-\[34px\] .mt-2,
          .bhw-mobile-compact > section:first-of-type .relative.overflow-hidden.rounded-\[34px\] .mt-1 {
            margin-top: 0.28rem !important;
          }

          .bhw-mobile-compact > section:first-of-type .relative.overflow-hidden.rounded-\[34px\] .overflow-hidden.rounded-full {
            grid-column: 1 / -1 !important;
            height: 0.45rem !important;
            margin-top: 0.2rem !important;
          }

          .bhw-mobile-compact .group.relative.overflow-hidden.rounded-\[30px\] {
            border-radius: 16px !important;
            padding: 0.6rem !important;
            min-height: 96px !important;
          }

          .bhw-mobile-compact .group.relative.overflow-hidden.rounded-\[30px\] .relative.flex {
            gap: 0.5rem !important;
          }

          .bhw-mobile-compact .group.relative.overflow-hidden.rounded-\[30px\] .h-12.w-12 {
            height: 2rem !important;
            width: 2rem !important;
            border-radius: 12px !important;
          }

          .bhw-mobile-compact .group.relative.overflow-hidden.rounded-\[30px\] svg {
            height: 0.95rem !important;
            width: 0.95rem !important;
          }

          .bhw-mobile-compact section.grid.gap-5,
          .bhw-mobile-compact section.grid.gap-4,
          .bhw-mobile-compact .grid.gap-5,
          .bhw-mobile-compact .grid.gap-4 {
            gap: 0.75rem !important;
          }

          .bhw-mobile-compact .relative.overflow-hidden.rounded-\[34px\],
          .bhw-mobile-compact .rounded-\[34px\].border {
            padding: 0.75rem !important;
            border-radius: 20px !important;
          }

          .bhw-mobile-compact .flex.h-12.w-12,
          .bhw-mobile-compact .flex.h-10.w-10 {
            height: 2rem !important;
            width: 2rem !important;
            border-radius: 12px !important;
          }

          .bhw-mobile-compact .flex.h-12.w-12 svg,
          .bhw-mobile-compact .flex.h-10.w-10 svg,
          .bhw-mobile-compact svg.h-7.w-7,
          .bhw-mobile-compact svg.h-5.w-5 {
            height: 0.95rem !important;
            width: 0.95rem !important;
          }

          .bhw-mobile-compact .relative.mt-5.rounded-\[28px\] {
            margin-top: 0.65rem !important;
            border-radius: 16px !important;
            padding: 0.65rem !important;
          }

          .bhw-mobile-compact .relative.mt-5.space-y-3 > :not([hidden]) ~ :not([hidden]),
          .bhw-mobile-compact .mt-5.space-y-3 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 0.45rem !important;
          }

          .bhw-mobile-compact .relative.mt-5.space-y-3 .rounded-\[24px\],
          .bhw-mobile-compact .mt-5.space-y-3 .rounded-\[22px\] {
            border-radius: 15px !important;
            padding: 0.55rem !important;
          }

          .bhw-mobile-compact .relative.mt-5.space-y-3 .rounded-\[24px\] .mt-3 {
            margin-top: 0.45rem !important;
          }

          .bhw-mobile-compact .rounded-\[24px\],
          .bhw-mobile-compact .rounded-\[22px\] {
            border-radius: 15px !important;
          }

          .bhw-mobile-compact .mt-6 { margin-top: 0.8rem !important; }
          .bhw-mobile-compact .mt-5 { margin-top: 0.68rem !important; }
          .bhw-mobile-compact .mt-4 { margin-top: 0.55rem !important; }
          .bhw-mobile-compact .mt-3 { margin-top: 0.45rem !important; }
          .bhw-mobile-compact .mb-4 { margin-bottom: 0.55rem !important; }
          .bhw-mobile-compact .mb-3 { margin-bottom: 0.45rem !important; }

          .bhw-mobile-compact .p-6,
          .bhw-mobile-compact .p-5,
          .bhw-mobile-compact .p-4 {
            padding: 0.65rem !important;
          }

          .bhw-mobile-compact .px-4.py-3,
          .bhw-mobile-compact .px-4.py-3\.5 {
            padding: 0.55rem 0.65rem !important;
          }

          .bhw-mobile-compact a.group.relative.overflow-hidden {
            min-height: 92px !important;
          }

          .bhw-mobile-compact a.group.relative.overflow-hidden h3,
          .bhw-mobile-compact .bhw-mobile-grid-3 h3 {
            font-size: 0.78rem !important;
            line-height: 1.1 !important;
          }

          .bhw-mobile-compact a.group.relative.overflow-hidden p,
          .bhw-mobile-compact .bhw-mobile-grid-3 p {
            font-size: 0.58rem !important;
            line-height: 1.16 !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
          }

          .bhw-mobile-compact a.group.relative.overflow-hidden .absolute.right-5.top-5 {
            right: 0.55rem !important;
            top: 0.55rem !important;
          }

          .bhw-mobile-compact .truncate,
          .bhw-mobile-compact p,
          .bhw-mobile-compact span,
          .bhw-mobile-compact h1,
          .bhw-mobile-compact h2,
          .bhw-mobile-compact h3 {
            overflow-wrap: anywhere !important;
          }
        }
      `}</style>

    </div>
  )
}

export default function BHWPage() {
  const {
    riskRows = [],
    weeklyTotals = [],
    dashboardStats = {},
    backendForecastResult,
  } = useData()

  const session = getAuthSession()
  const assignedBarangay = session?.assignedBarangay || 'Baan KM 3'

  const barangayRisk = useMemo(() => {
    const assigned = normalizeName(assignedBarangay)

    return (
      riskRows.find((row) => normalizeName(row.barangay) === assigned) ||
      riskRows.find((row) => normalizeName(row.barangay).includes('baan')) ||
      riskRows[0] ||
      null
    )
  }, [assignedBarangay, riskRows])

  const barangayName = barangayRisk?.barangay || assignedBarangay
  const risk = barangayRisk?.risk || 'Pending'
  const style = riskStyles[risk] || riskStyles.Low
  const tone = getRiskTone(risk)
  const score = getScore(barangayRisk)
  const predictedCases = getCases(barangayRisk)
  const scorePercent = Math.min(100, Math.max(0, score))

  const forecastRows =
    backendForecastResult?.forecast_rows ||
    backendForecastResult?.predictions ||
    backendForecastResult?.forecastRows ||
    []

  const localForecasts = forecastRows
    .filter((row) => normalizeName(row.barangay) === normalizeName(barangayName))
    .slice(0, 6)

  const fallbackForecasts = localForecasts.length
    ? localForecasts
    : predictedCases
      ? [
          { period: 'Week 1', predicted_cases: Math.round(predictedCases * 0.85) },
          { period: 'Week 2', predicted_cases: Math.round(predictedCases) },
          { period: 'Week 3', predicted_cases: Math.round(predictedCases * 1.08) },
          { period: 'Week 4', predicted_cases: Math.round(predictedCases * 0.95) },
        ]
      : []

  const maxForecast = Math.max(
    1,
    ...fallbackForecasts.map((row) => Number(row.predicted_cases || row.predictedCases || row.cases || 0))
  )

  const checklist = [
    { label: 'Inspect stagnant water areas', icon: Droplets, done: risk !== 'Pending' },
    { label: 'Coordinate cleanup drive', icon: Home, done: risk === 'High' || risk === 'Moderate' },
    { label: 'Issue community reminders', icon: Megaphone, done: risk === 'High' || risk === 'Moderate' },
    { label: 'Record field observations', icon: ClipboardCheck, done: false },
    { label: 'Submit monitoring summary', icon: FileText, done: false },
  ]

  return (
    <div className="bhw-mobile-compact space-y-6">
      <section className={`relative overflow-hidden rounded-[38px] border ${tone.border} bg-gradient-to-br ${tone.soft} p-5 shadow-[0_24px_70px_rgba(15,23,42,0.10)] ring-1 ring-white/70 dark:ring-white/5 sm:p-6 lg:p-7`}>
        <div className={`pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full ${tone.glow} blur-3xl`} />
        <div className="pointer-events-none absolute -bottom-24 left-8 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-500/10" />
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent dark:via-cyan-300/30" />

        <div className="relative grid gap-6 lg:grid-cols-[1.35fr_0.65fr] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/70 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-emerald-700 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                <Sparkles className="h-3.5 w-3.5" />
                BHW Field Dashboard
              </span>

              <span className={`rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] ${tone.chip}`}>
                {tone.status}
              </span>
            </div>

            <h1 className="mt-5 text-3xl font-black tracking-tight text-brand-text dark:text-white sm:text-4xl">
              {barangayName} Dengue Monitoring
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-7 text-brand-muted dark:text-slate-300">
              Mobile-first barangay workspace for checking dengue risk, forecast status, hotspot indicators,
              field tasks, community advisories, and reports for CHO coordination.
            </p>

            <div className="bhw-mobile-grid-3 mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[24px] border border-white/80 bg-white/70 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400">Predicted</p>
                <p className="mt-1 text-2xl font-black text-brand-text dark:text-white">{formatNumber(predictedCases)}</p>
                <p className="text-xs font-bold text-brand-muted dark:text-slate-500">cases</p>
              </div>

              <div className="rounded-[24px] border border-white/80 bg-white/70 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400">Risk Score</p>
                <p className="mt-1 text-2xl font-black text-brand-text dark:text-white">{score}/100</p>
                <p className="text-xs font-bold text-brand-muted dark:text-slate-500">barangay level</p>
              </div>

              <div className="rounded-[24px] border border-white/80 bg-white/70 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400">City Hotspots</p>
                <p className="mt-1 text-2xl font-black text-brand-text dark:text-white">{formatNumber(dashboardStats.highRiskCount || 0)}</p>
                <p className="text-xs font-bold text-brand-muted dark:text-slate-500">high-risk areas</p>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[34px] border border-white/80 bg-white/80 p-5 text-center shadow-[0_24px_60px_rgba(15,23,42,0.14)] dark:border-slate-700 dark:bg-slate-900/80">
            <div className={`pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full ${tone.glow} blur-2xl`} />

            <div className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-slate-200 bg-slate-50 shadow-inner dark:border-slate-700 dark:bg-slate-950">
              <div className={`absolute inset-2 rounded-full bg-gradient-to-br ${tone.gradient} opacity-15`} />
              <ShieldAlert className={`relative h-10 w-10 ${tone.text}`} />
            </div>

            <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-brand-muted dark:text-slate-400">Current Risk</p>
            <p className={`mt-1 text-4xl font-black ${tone.text}`}>{risk}</p>

            <div className="mt-4 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className={`h-3 rounded-full bg-gradient-to-r ${tone.gradient} shadow-[0_0_20px_rgba(14,165,233,0.25)]`}
                style={{ width: `${scorePercent}%` }}
              />
            </div>

            <p className="mt-2 text-sm font-black text-brand-text dark:text-slate-100">{score}/100</p>
            <p className="mt-1 text-xs font-bold text-brand-muted dark:text-slate-500">{tone.status}</p>
          </div>
        </div>
      </section>

      <section className="bhw-mobile-grid-4 grid gap-4 md:grid-cols-4">
        <MetricCard icon={ShieldAlert} label="Expected Cases" value={formatNumber(predictedCases)} helper="Latest barangay forecast" tone="text-rose-500" />
        <MetricCard icon={Activity} label="Risk Score" value={`${score}/100`} helper="Priority monitoring index" tone="text-blue-500" />
        <MetricCard icon={TrendingUp} label="Trend Records" value={formatNumber(weeklyTotals.length)} helper="Available weekly points" tone="text-amber-500" />
        <MetricCard icon={MapPinned} label="City Hotspots" value={formatNumber(dashboardStats.highRiskCount || 0)} helper="High-risk barangays city-wide" tone="text-sky-500" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="relative overflow-hidden rounded-[34px] border border-white/80 bg-white/90 p-6 shadow-[0_22px_58px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/60 dark:border-slate-800 dark:bg-slate-900/90 dark:ring-white/5">
          <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-emerald-300/20 blur-3xl dark:bg-emerald-500/10" />

          <div className="relative flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-muted dark:text-slate-400">Recommended Today</p>
              <h2 className="text-xl font-black text-brand-text dark:text-white">Barangay Response Action</h2>
            </div>
          </div>

          <div className={`relative mt-5 rounded-[28px] border p-5 ${style.card}`}>
            <p className="text-sm font-bold leading-7">{getAction(risk)}</p>
          </div>

          <div className="bhw-mobile-grid-3 relative mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Inspect water storage and canals', icon: Droplets, tone: 'text-sky-500' },
              { label: 'Coordinate cleanup drive', icon: Home, tone: 'text-emerald-500' },
              { label: 'Issue household reminders', icon: Megaphone, tone: 'text-amber-500' },
            ].map((item) => {
              const Icon = item.icon

              return (
                <div key={item.label} className="group rounded-[24px] border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-1 hover:bg-white hover:shadow-[0_14px_34px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-900">
                  <Icon className={`mb-3 h-5 w-5 ${item.tone}`} />
                  <p className="text-sm font-black leading-5 text-brand-text dark:text-slate-100">{item.label}</p>
                </div>
              )
            })}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[34px] border border-white/80 bg-white/90 p-6 shadow-[0_22px_58px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/60 dark:border-slate-800 dark:bg-slate-900/90 dark:ring-white/5">
          <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-blue-300/20 blur-3xl dark:bg-blue-500/10" />

          <div className="relative flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-muted dark:text-slate-400">Next Four Weeks</p>
              <h2 className="text-xl font-black text-brand-text dark:text-white">Local Forecast Timeline</h2>
            </div>
          </div>

          <div className="relative mt-5 space-y-3">
            {fallbackForecasts.length ? (
              fallbackForecasts.map((row, index) => {
                const cases = Number(row.predicted_cases || row.predictedCases || row.cases || 0)
                const width = Math.min(100, Math.max(8, Math.round((cases / maxForecast) * 100)))

                return (
                  <div key={`${row.period || row.date || index}`} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-black text-brand-text dark:text-slate-100">{row.period || row.date || `Forecast ${index + 1}`}</span>
                      <span className="font-black text-brand-text dark:text-slate-100">{formatNumber(cases)} cases</span>
                    </div>
                    <div className="mt-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                      <div className="h-2.5 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-300 p-5 text-sm font-bold leading-6 text-brand-muted dark:border-slate-700 dark:text-slate-400">
                No barangay forecast is available yet. Ask the CHO account to run the dengue forecast first.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[34px] border border-white/80 bg-white/90 p-6 shadow-[0_22px_58px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/60 dark:border-slate-800 dark:bg-slate-900/90 dark:ring-white/5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-muted dark:text-slate-400">Field Checklist</p>
              <h2 className="text-xl font-black text-brand-text dark:text-white">Today's Monitoring Tasks</h2>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {checklist.map((item) => {
              const Icon = item.icon

              return (
                <div key={item.label} className="flex items-center gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${item.done ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                    {item.done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <p className="text-sm font-black text-brand-text dark:text-slate-100">{item.label}</p>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bhw-mobile-grid-3 grid gap-5 lg:grid-cols-3 xl:grid-cols-3">
          <Link to="/map" className="group relative overflow-hidden rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_24px_58px_rgba(15,23,42,0.12)] dark:border-slate-800 dark:bg-slate-900">
            <MapPinned className="mb-4 h-7 w-7 text-sky-500" />
            <h3 className="text-lg font-black text-brand-text dark:text-white">Hotspot Map</h3>
            <p className="mt-2 text-sm leading-6 text-brand-muted dark:text-slate-400">Check barangay location and nearby risk areas.</p>
            <ArrowUpRight className="absolute right-5 top-5 h-5 w-5 text-slate-400 transition group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:text-sky-500" />
          </Link>

          <Link to="/reports" className="group relative overflow-hidden rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_24px_58px_rgba(15,23,42,0.12)] dark:border-slate-800 dark:bg-slate-900">
            <FileText className="mb-4 h-7 w-7 text-blue-500" />
            <h3 className="text-lg font-black text-brand-text dark:text-white">Reports</h3>
            <p className="mt-2 text-sm leading-6 text-brand-muted dark:text-slate-400">Review generated summaries for barangay planning.</p>
            <ArrowUpRight className="absolute right-5 top-5 h-5 w-5 text-slate-400 transition group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:text-blue-500" />
          </Link>

          <div className="relative overflow-hidden rounded-[30px] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] dark:border-amber-500/20 dark:from-amber-500/10 dark:via-slate-950 dark:to-orange-500/10">
            <AlertTriangle className="mb-4 h-7 w-7 text-amber-500" />
            <h3 className="text-lg font-black text-brand-text dark:text-white">Field Reminder</h3>
            <p className="mt-2 text-sm leading-6 text-brand-muted dark:text-slate-400">Validate local conditions through inspection, community reports, and CHO coordination.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
