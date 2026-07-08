import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  MapPinned,
  ShieldAlert,
  TrendingUp,
  Users,
  Activity,
  Database,
  Layers,
  Target,
  ArrowUpRight,
  Sparkles,
  Building2,
  Radar,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { riskStyles } from '../utils/analytics'
import aiGif from '../assets/ai.gif'

function formatNumber(value) {
  return new Intl.NumberFormat('en-PH').format(Number(value || 0))
}

function formatModelName(value) {
  if (!value) return 'No forecast method selected yet'

  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getModelName(result) {
  return formatModelName(
    result?.selected_model_name ||
      result?.selected_model ||
      result?.model_name ||
      result?.best_model ||
      result?.forecast_run?.model_name ||
      result?.metadata?.selected_model ||
      result?.metadata?.model_name ||
      ''
  )
}

function getRowScore(row) {
  const rawScore =
    row?.score ??
    row?.riskScore ??
    row?.risk_score ??
    row?.riskPercent ??
    row?.risk_percentage ??
    row?.priorityScore ??
    row?.priority_score

  const score = Number(rawScore)

  if (Number.isFinite(score) && score > 0) {
    return score <= 1 ? score * 100 : score
  }

  if (row?.risk === 'High') return 90
  if (row?.risk === 'Moderate') return 60
  if (row?.risk === 'Low') return 30

  return 0
}

function getRowCases(row) {
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

function getTopPriority(rows) {
  return rows.find((row) => row.risk === 'High') || rows[0] || null
}

function getRiskTone(risk) {
  if (risk === 'High') {
    return {
      label: 'Priority Response',
      icon: ShieldAlert,
      gradient: 'from-rose-500 via-red-500 to-orange-400',
      soft: 'from-rose-50 via-white to-orange-50 dark:from-rose-500/10 dark:via-slate-950 dark:to-orange-500/10',
      text: 'text-rose-600 dark:text-rose-300',
      border: 'border-rose-200 dark:border-rose-500/25',
      chip: 'border-rose-300/50 bg-rose-500/10 text-rose-700 dark:text-rose-200',
    }
  }

  if (risk === 'Moderate') {
    return {
      label: 'Watch Closely',
      icon: AlertTriangle,
      gradient: 'from-amber-400 via-orange-400 to-yellow-300',
      soft: 'from-amber-50 via-white to-yellow-50 dark:from-amber-500/10 dark:via-slate-950 dark:to-yellow-500/10',
      text: 'text-amber-600 dark:text-amber-300',
      border: 'border-amber-200 dark:border-amber-500/25',
      chip: 'border-amber-300/50 bg-amber-500/10 text-amber-700 dark:text-amber-200',
    }
  }

  return {
    label: 'Stable Monitoring',
    icon: CheckCircle2,
    gradient: 'from-emerald-400 via-teal-400 to-cyan-300',
    soft: 'from-emerald-50 via-white to-cyan-50 dark:from-emerald-500/10 dark:via-slate-950 dark:to-cyan-500/10',
    text: 'text-emerald-600 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-500/25',
    chip: 'border-emerald-300/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
  }
}

function StatCard({ icon: Icon, label, value, helper, tone = 'blue' }) {
  const tones = {
    rose: 'from-rose-500/12 via-white to-orange-500/10 text-rose-500 dark:via-slate-900',
    amber: 'from-amber-500/12 via-white to-yellow-500/10 text-amber-500 dark:via-slate-900',
    emerald: 'from-emerald-500/12 via-white to-cyan-500/10 text-emerald-500 dark:via-slate-900',
    blue: 'from-blue-500/12 via-white to-cyan-500/10 text-blue-500 dark:via-slate-900',
  }

  return (
    <div className="group relative overflow-hidden rounded-[30px] border border-white/80 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_26px_60px_rgba(15,23,42,0.14)] dark:border-slate-800 dark:bg-slate-900">
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tones[tone] || tones.blue} opacity-100`} />
      <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-white/50 blur-2xl dark:bg-sky-500/10" />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-[20px] bg-white shadow-sm ring-1 ring-slate-200/70 ${tones[tone] || tones.blue} dark:bg-slate-950 dark:ring-slate-700`}>
            <Icon className="h-5 w-5" />
          </div>

          <span className="rounded-full border border-white/70 bg-white/70 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-brand-muted shadow-sm dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-400">
            Live
          </span>
        </div>

        <p className="mt-4 text-sm font-black text-brand-muted dark:text-slate-400">
          {label}
        </p>

        <p className="mt-1 text-3xl font-black tracking-tight text-brand-text dark:text-white">
          {value}
        </p>

        <p className="mt-2 text-xs font-bold leading-5 text-brand-muted dark:text-slate-400">
          {helper}
        </p>
      </div>


      <style>{`
        @media (max-width: 639px) {
          .supervisor-mobile-compact {
            --sv-card-radius: 20px;
            --sv-card-pad: 0.85rem;
          }

          .supervisor-mobile-compact > * + * {
            margin-top: 0.9rem !important;
          }

          .supervisor-hero-panel,
          .supervisor-ai-panel,
          .supervisor-ranking-panel,
          .supervisor-priority-panel,
          .supervisor-reminder-panel {
            border-radius: 22px !important;
            padding: 0.9rem !important;
          }

          .supervisor-hero-panel h1 {
            margin-top: 0.75rem !important;
            font-size: 1.55rem !important;
            line-height: 1.12 !important;
          }

          .supervisor-hero-panel p,
          .supervisor-ai-panel p,
          .supervisor-ranking-panel p,
          .supervisor-priority-panel p,
          .supervisor-reminder-panel p {
            line-height: 1.45 !important;
          }

          .supervisor-hero-metrics {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 0.5rem !important;
          }

          .supervisor-hero-metrics > div {
            border-radius: 16px !important;
            padding: 0.65rem !important;
            min-width: 0 !important;
          }

          .supervisor-hero-metrics p:first-child,
          .supervisor-ai-fields p:first-child,
          .supervisor-stat-grid p:first-of-type {
            font-size: 0.56rem !important;
            letter-spacing: 0.09em !important;
          }

          .supervisor-hero-metrics p:nth-child(2) {
            font-size: 1.15rem !important;
            line-height: 1.15 !important;
          }

          .supervisor-hero-metrics p:last-child {
            display: none !important;
          }

          .supervisor-hero-panel .rounded-[32px] {
            border-radius: 20px !important;
            padding: 0.85rem !important;
          }

          .supervisor-hero-panel .rounded-[32px] h2 {
            font-size: 1.15rem !important;
            line-height: 1.2 !important;
          }

          .supervisor-hero-panel .rounded-[32px] .h-14.w-14 {
            height: 2.5rem !important;
            width: 2.5rem !important;
            border-radius: 16px !important;
          }

          .supervisor-ai-panel .h-24.w-24,
          .supervisor-ai-panel .sm\:h-28.sm\:w-28 {
            height: 4.5rem !important;
            width: 4.5rem !important;
            border-radius: 18px !important;
          }

          .supervisor-ai-panel h2 {
            font-size: 1.25rem !important;
            line-height: 1.2 !important;
          }

          .supervisor-ai-fields {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.55rem !important;
          }

          .supervisor-ai-fields > div {
            border-radius: 16px !important;
            padding: 0.65rem !important;
          }

          .supervisor-ai-fields p:last-child {
            font-size: 0.92rem !important;
          }

          .supervisor-stat-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.65rem !important;
          }

          .supervisor-stat-grid > div {
            border-radius: 20px !important;
            padding: 0.75rem !important;
            min-height: 132px !important;
          }

          .supervisor-stat-grid .h-12.w-12 {
            height: 2.35rem !important;
            width: 2.35rem !important;
            border-radius: 14px !important;
          }

          .supervisor-stat-grid p:nth-of-type(2) {
            font-size: 1.55rem !important;
            line-height: 1.1 !important;
          }

          .supervisor-stat-grid p:nth-of-type(3) {
            margin-top: 0.35rem !important;
            font-size: 0.68rem !important;
            line-height: 1.35 !important;
          }

          .supervisor-ranking-panel h2,
          .supervisor-priority-panel h2 {
            font-size: 1.15rem !important;
            line-height: 1.2 !important;
          }

          .supervisor-ranking-panel .h-12.w-12,
          .supervisor-priority-panel .h-12.w-12 {
            height: 2.4rem !important;
            width: 2.4rem !important;
            border-radius: 14px !important;
          }

          .supervisor-table-scroll {
            max-height: 360px !important;
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch;
          }

          .supervisor-table-scroll table {
            min-width: 660px !important;
            font-size: 0.75rem !important;
          }

          .supervisor-table-scroll th,
          .supervisor-table-scroll td {
            padding: 0.55rem 0.65rem !important;
          }

          .supervisor-priority-panel .space-y-3 > p {
            border-radius: 16px !important;
            padding: 0.75rem !important;
            font-size: 0.78rem !important;
            line-height: 1.45 !important;
          }

          .supervisor-action-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 0.55rem !important;
          }

          .supervisor-action-grid > a {
            border-radius: 18px !important;
            padding: 0.75rem !important;
            min-height: 126px !important;
          }

          .supervisor-action-grid svg.mb-3 {
            margin-bottom: 0.45rem !important;
            height: 1.2rem !important;
            width: 1.2rem !important;
          }

          .supervisor-action-grid p {
            display: none !important;
          }

          .supervisor-action-grid div {
            font-size: 0.72rem !important;
            line-height: 1.25 !important;
            align-items: flex-start !important;
          }

          .supervisor-reminder-panel {
            padding: 0.85rem !important;
          }

          .supervisor-reminder-panel h3 {
            font-size: 1rem !important;
          }

          .supervisor-reminder-panel p {
            margin-top: 0.5rem !important;
            font-size: 0.78rem !important;
          }
        }
      `}</style>
    </div>
  )
}

export default function SupervisorPage() {
  const {
    riskRows = [],
    dashboardStats = {},
    sourceStatus = {},
    backendForecastResult,
  } = useData()

  const sortedRows = useMemo(() => {
    return [...riskRows].sort((a, b) => getRowScore(b) - getRowScore(a))
  }, [riskRows])

  const highRows = sortedRows.filter((row) => row.risk === 'High')
  const moderateRows = sortedRows.filter((row) => row.risk === 'Moderate')
  const lowRows = sortedRows.filter((row) => row.risk === 'Low')
  const topPriority = getTopPriority(sortedRows)
  const topTone = getRiskTone(topPriority?.risk || 'Low')
  const TopToneIcon = topTone.icon

  const readySources = Object.values(sourceStatus || {}).filter((source) => {
    return Number(source?.recordCount || source?.validCount || 0) > 0
  }).length

  const modelName = getModelName(backendForecastResult)
  const totalBarangays = sortedRows.length
  const averageScore = totalBarangays
    ? Math.round(sortedRows.reduce((sum, row) => sum + getRowScore(row), 0) / totalBarangays)
    : 0

  return (
    <div className="supervisor-mobile-compact space-y-6">
      <section className="supervisor-hero-panel relative overflow-hidden rounded-[38px] border border-white/80 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-6 text-white shadow-[0_28px_80px_rgba(15,23,42,0.26)] ring-1 ring-white/10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-10 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />

        <div className="relative grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
              <Radar className="h-3.5 w-3.5" />
              Supervisor Command Review
            </div>

            <h1 className="mt-5 max-w-4xl text-3xl font-black tracking-tight sm:text-4xl">
              City-Wide Dengue Situation Review
            </h1>

            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
              Supervisor workspace for reviewing barangay risk levels, checking forecast readiness,
              identifying high-priority areas, and supporting resource allocation decisions.
            </p>

            <div className="supervisor-hero-metrics mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[24px] border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/50">Barangays</p>
                <p className="mt-1 text-2xl font-black">{formatNumber(totalBarangays)}</p>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/50">Avg. Score</p>
                <p className="mt-1 text-2xl font-black">{averageScore}/100</p>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/50">Data Sources</p>
                <p className="mt-1 text-2xl font-black">{readySources}/4</p>
              </div>
            </div>
          </div>

          <div className={`relative overflow-hidden rounded-[32px] border ${topTone.border} bg-gradient-to-br ${topTone.soft} p-5 text-brand-text shadow-[0_22px_60px_rgba(15,23,42,0.20)] dark:text-white`}>
            <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-white/40 blur-3xl dark:bg-cyan-400/10" />

            <div className="relative flex items-start gap-4">
              <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br ${topTone.gradient} text-white shadow-[0_18px_36px_rgba(15,23,42,0.22)]`}>
                <TopToneIcon className="h-6 w-6" />
              </div>

              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-muted dark:text-slate-400">
                  Top Priority Barangay
                </p>

                <h2 className="mt-2 text-2xl font-black">
                  {topPriority?.barangay || 'No barangay ranked yet'}
                </h2>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-black ${topTone.chip}`}>
                    {topPriority?.risk || 'Pending'} Risk
                  </span>

                  <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-black text-brand-text dark:border-slate-700 dark:bg-slate-950/70 dark:text-white">
                    Score {Math.round(getRowScore(topPriority || {}))}/100
                  </span>
                </div>

                <p className="mt-4 text-sm font-bold leading-6 text-brand-muted dark:text-slate-300">
                  {topTone.label}. Review this barangay first when preparing intervention priorities and field coordination.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="supervisor-ai-panel relative overflow-hidden rounded-[34px] border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] dark:border-blue-500/20 dark:from-blue-500/10 dark:via-slate-950 dark:to-indigo-500/10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-indigo-400/10 blur-3xl" />

        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[26px] border border-white/80 bg-black shadow-[0_18px_40px_rgba(15,23,42,0.24)] ring-1 ring-slate-200/70 sm:h-28 sm:w-28 dark:border-slate-700 dark:ring-white/10">
              <img src={aiGif} alt="AI model" className="h-full w-full object-cover" />
            </div>

            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/40 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                <Sparkles className="h-3.5 w-3.5" />
                Best forecast method selected
              </div>

              <p className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-brand-muted dark:text-slate-400">
                Model Used
              </p>

              <h2 className="mt-1 text-2xl font-black text-brand-text dark:text-white">
                {modelName}
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-brand-muted dark:text-slate-300">
                Version v1. This method was selected because it gave the most reliable result using the latest uploaded files.
              </p>
            </div>
          </div>

          <div className="supervisor-ai-fields grid w-full gap-3 sm:grid-cols-2 lg:w-auto">
            <div className="rounded-[24px] border border-white/80 bg-white/70 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand-muted dark:text-slate-400">
                Forecast Status
              </p>
              <p className="mt-1 text-lg font-black text-brand-text dark:text-white">
                {modelName === 'No forecast method selected yet' ? 'Pending' : 'Ready'}
              </p>
            </div>

            <div className="rounded-[24px] border border-white/80 bg-white/70 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand-muted dark:text-slate-400">
                Review Mode
              </p>
              <p className="mt-1 text-lg font-black text-brand-text dark:text-white">
                City-wide
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="supervisor-stat-grid grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={ShieldAlert}
          label="High Risk"
          value={formatNumber(dashboardStats.highRiskCount || highRows.length)}
          helper="Barangays requiring priority response."
          tone="rose"
        />

        <StatCard
          icon={AlertTriangle}
          label="Moderate Risk"
          value={formatNumber(dashboardStats.moderateRiskCount || moderateRows.length)}
          helper="Barangays that need close monitoring."
          tone="amber"
        />

        <StatCard
          icon={CheckCircle2}
          label="Low Risk"
          value={formatNumber(dashboardStats.lowRiskCount || lowRows.length)}
          helper="Barangays under routine surveillance."
          tone="emerald"
        />

        <StatCard
          icon={Database}
          label="Ready Sources"
          value={`${readySources}/4`}
          helper="Uploaded files available for review."
          tone="blue"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="supervisor-ranking-panel relative overflow-hidden rounded-[34px] border border-white/80 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900">
          <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-blue-200/30 blur-3xl dark:bg-blue-500/10" />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-blue-50 text-blue-600 ring-1 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/20">
                <BarChart3 className="h-5 w-5" />
              </div>

              <div>
                <h2 className="text-xl font-black text-brand-text dark:text-white">
                  Barangay Risk Ranking
                </h2>
                <p className="text-sm font-bold text-brand-muted dark:text-slate-400">
                  Scroll to review all priority barangays.
                </p>
              </div>
            </div>

            <span className="w-fit rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
              {formatNumber(totalBarangays)} barangays
            </span>
          </div>

          <div className="relative mt-5 overflow-hidden rounded-[26px] border border-slate-200 dark:border-slate-700">
            <div className="supervisor-table-scroll max-h-[520px] overflow-auto">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-[0.14em] text-brand-muted shadow-sm dark:bg-slate-950 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Rank</th>
                    <th className="px-4 py-3">Barangay</th>
                    <th className="px-4 py-3">Risk</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Cases</th>
                    <th className="px-4 py-3">Priority</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sortedRows.map((row, index) => {
                    const style = riskStyles[row.risk] || riskStyles.Low
                    const score = Math.round(getRowScore(row))
                    const cases = getRowCases(row)
                    const width = `${Math.min(100, Math.max(0, score))}%`

                    return (
                      <tr
                        key={`${row.barangay}-${index}`}
                        className="transition hover:bg-slate-50/90 dark:hover:bg-slate-800/60"
                      >
                        <td className="px-4 py-3">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-brand-text dark:bg-slate-800 dark:text-white">
                            {index + 1}
                          </span>
                        </td>

                        <td className="px-4 py-3 font-black text-brand-text dark:text-white">
                          {row.barangay}
                        </td>

                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-3 py-1 text-xs font-black ${style.badge}`}>
                            {row.risk}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <div className="min-w-[150px]">
                            <div className="flex items-center justify-between text-xs font-black">
                              <span>{score}/100</span>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                              <div
                                className={`h-full rounded-full ${
                                  row.risk === 'High'
                                    ? 'bg-gradient-to-r from-rose-500 to-orange-400'
                                    : row.risk === 'Moderate'
                                      ? 'bg-gradient-to-r from-amber-400 to-yellow-300'
                                      : 'bg-gradient-to-r from-emerald-400 to-cyan-300'
                                }`}
                                style={{ width }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 font-bold">
                          {formatNumber(cases)}
                        </td>

                        <td className="px-4 py-3">
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-brand-muted dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                            {row.risk === 'High' ? 'Immediate' : row.risk === 'Moderate' ? 'Monitor' : 'Routine'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}

                  {sortedRows.length === 0 && (
                    <tr>
                      <td colSpan="6" className="px-4 py-10 text-center text-sm font-bold text-brand-muted dark:text-slate-400">
                        No priority barangay list is available yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <style>{`
            .supervisor-table-scroll {
              scrollbar-width: thin;
              scrollbar-color: rgba(56, 189, 248, 0.9) rgba(15, 23, 42, 0.10);
            }

            .supervisor-table-scroll::-webkit-scrollbar {
              width: 10px;
              height: 10px;
            }

            .supervisor-table-scroll::-webkit-scrollbar-track {
              background: linear-gradient(180deg, rgba(226,232,240,0.78), rgba(241,245,249,0.42));
              border-radius: 999px;
            }

            .supervisor-table-scroll::-webkit-scrollbar-thumb {
              background: linear-gradient(180deg, #7dd3fc, #2563eb);
              border-radius: 999px;
              border: 2px solid rgba(241, 245, 249, 0.85);
              box-shadow: 0 0 18px rgba(14,165,233,0.35);
            }

            .supervisor-table-scroll::-webkit-scrollbar-thumb:hover {
              background: linear-gradient(180deg, #bae6fd, #3b82f6);
            }

            html.dark .supervisor-table-scroll::-webkit-scrollbar-track {
              background: rgba(15,23,42,0.72);
            }

            html.dark .supervisor-table-scroll::-webkit-scrollbar-thumb {
              border-color: rgba(15,23,42,0.9);
            }
          `}</style>
        </div>

        <div className="space-y-5">
          <div className="supervisor-priority-panel relative overflow-hidden rounded-[34px] border border-white/80 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900">
            <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-emerald-200/40 blur-3xl dark:bg-emerald-500/10" />

            <div className="relative flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20">
                <ClipboardCheck className="h-5 w-5" />
              </div>

              <h2 className="text-xl font-black text-brand-text dark:text-white">
                Planning Priorities
              </h2>
            </div>

            <div className="relative mt-5 space-y-3 text-sm font-bold leading-6">
              <p className="rounded-[22px] border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-4 text-rose-700 shadow-sm dark:border-rose-500/20 dark:from-rose-500/10 dark:to-slate-950 dark:text-rose-200">
                Prioritize high-risk barangays for cleanup, vector control, and public advisories.
              </p>

              <p className="rounded-[22px] border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-4 text-amber-700 shadow-sm dark:border-amber-500/20 dark:from-amber-500/10 dark:to-slate-950 dark:text-amber-200">
                Review moderate-risk barangays for early warning and weekly inspection.
              </p>

              <p className="rounded-[22px] border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4 text-blue-700 shadow-sm dark:border-blue-500/20 dark:from-blue-500/10 dark:to-slate-950 dark:text-blue-200">
                Use reports and maps as supporting evidence for resource allocation.
              </p>
            </div>
          </div>

          <div className="supervisor-action-grid grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <Link
              to="/map"
              className="group relative overflow-hidden rounded-[26px] border border-slate-200 bg-white p-5 font-black shadow-[0_14px_34px_rgba(15,23,42,0.07)] transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_22px_50px_rgba(37,99,235,0.16)] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500/30"
            >
              <MapPinned className="mb-3 h-6 w-6 text-blue-500" />
              <div className="flex items-center justify-between gap-3">
                Open Map
                <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
              <p className="mt-2 text-sm font-bold leading-6 text-brand-muted dark:text-slate-400">
                Review hotspot distribution.
              </p>
            </Link>

            <Link
              to="/forecast"
              className="group relative overflow-hidden rounded-[26px] border border-slate-200 bg-white p-5 font-black shadow-[0_14px_34px_rgba(15,23,42,0.07)] transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-[0_22px_50px_rgba(16,185,129,0.16)] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-500/30"
            >
              <TrendingUp className="mb-3 h-6 w-6 text-emerald-500" />
              <div className="flex items-center justify-between gap-3">
                Review Forecast
                <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
              <p className="mt-2 text-sm font-bold leading-6 text-brand-muted dark:text-slate-400">
                Review the selected forecast results.
              </p>
            </Link>

            <Link
              to="/reports"
              className="group relative overflow-hidden rounded-[26px] border border-slate-200 bg-white p-5 font-black shadow-[0_14px_34px_rgba(15,23,42,0.07)] transition hover:-translate-y-1 hover:border-indigo-200 hover:shadow-[0_22px_50px_rgba(99,102,241,0.16)] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/30"
            >
              <FileText className="mb-3 h-6 w-6 text-indigo-500" />
              <div className="flex items-center justify-between gap-3">
                Open Reports
                <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
              <p className="mt-2 text-sm font-bold leading-6 text-brand-muted dark:text-slate-400">
                Use summaries for planning.
              </p>
            </Link>
          </div>

          <div className="supervisor-reminder-panel rounded-[34px] border border-white/80 bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:from-slate-900 dark:via-slate-950 dark:to-blue-950/30">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-blue-500" />
              <h3 className="text-lg font-black text-brand-text dark:text-white">
                Supervisor Reminder
              </h3>
            </div>

            <p className="mt-3 text-sm font-bold leading-7 text-brand-muted dark:text-slate-400">
              Check the forecast against CHO field reports before assigning supplies or posting public advisories.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
