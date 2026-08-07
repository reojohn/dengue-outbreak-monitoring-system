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
import {
  compareCanonicalBarangayPriority,
  computeDecisionSupport,
  getCanonicalCombinedRiskScore,
  riskStyles,
} from '../utils/analytics'
import DecisionActionTracker from '../components/DecisionActionTracker'
import FieldUpdateReviewPanel from '../components/FieldUpdateReviewPanel'
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
  return getCanonicalCombinedRiskScore(row)
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


function normalizeSavedRisk(value) {
  const normalized = String(value || '').trim().toLowerCase()

  if (normalized === 'high') return 'High'
  if (normalized === 'moderate') return 'Moderate'
  if (normalized === 'low') return 'Low'

  return 'Low'
}

function buildSavedForecastRows(backendForecastResult = null) {
  const backendRows = Array.isArray(backendForecastResult?.forecast_results)
    ? backendForecastResult.forecast_results
    : []

  return backendRows.map((row) => {
    const forecast = Number(
      row?.forecast_next_4_periods ??
        row?.forecasted_cases ??
        row?.predicted_cases ??
        row?.forecast ??
        0
    )

    const risk = normalizeSavedRisk(row?.risk_level ?? row?.risk)
    const combinedRiskScore = getCanonicalCombinedRiskScore(row)
    const trendDirection = row?.trend_direction || row?.trend || 'Stable'

    const rowData = {
      ...row,
      barangay: row?.barangay || 'Unspecified barangay',
      risk,
      score: combinedRiskScore,
      riskScore: combinedRiskScore,
      combinedRiskScore,
      combined_risk_score: combinedRiskScore,
      multiSourceRiskScore: combinedRiskScore,
      multi_source_risk_score: combinedRiskScore,
      forecast,
      forecastedCases: forecast,
      predictedCases: forecast,
      currentCases: Number(row?.forecast_next_period || 0),
      previousCases: Number(row?.previous_average_cases || 0),
      totalCases: Number(row?.historical_total_cases || 0),
      trend: trendDirection,
      trendLabel: trendDirection,
      trendDirection,
      population: Number(row?.population || 0),
      density: Number(row?.density || 0),
      averageRainfall: Number(row?.average_rainfall || 0),
      averageTemperature: Number(row?.average_temperature || 0),
      averageHumidity: Number(row?.average_humidity || 0),
      environmentalSuitability: row?.environmental_suitability || '',
      rainfallPressure: row?.rainfall_pressure || '',
      temperatureSuitability: row?.temperature_suitability || '',
      humiditySuitability: row?.humidity_suitability || '',
      populationExposure: row?.population_exposure || '',
      densityLevel: row?.density_level || '',
      riskComponents: row?.risk_components || {},
      priorityRank: Number(row?.priority_rank || 0),
      priority_rank: Number(row?.priority_rank || 0),
    }

    const decisionSupport = computeDecisionSupport(rowData)

    return {
      ...rowData,
      responsePriority: decisionSupport.priority,
      decisionScore: decisionSupport.score,
      decisionSupport: {
        ...decisionSupport,
        summary:
          row?.recommendation ||
          decisionSupport.summary,
        multiSourceRiskScore: combinedRiskScore,
        riskScore: combinedRiskScore,
      },
    }
  })
}

function sortSupervisorRows(rows = []) {
  return [...rows]
    .sort(compareCanonicalBarangayPriority)
    .map((row, index) => ({
      ...row,
      priorityRank: index + 1,
      priority_rank: index + 1,
      canonicalPriorityRank: index + 1,
    }))
}

function getTopPriority(rows) {
  return rows[0] || null
}

function getRiskTone(risk) {
  if (risk === 'High') {
    return {
      label: 'Priority response',
      status: 'Immediate intervention required',
      icon: ShieldAlert,
      gradient: 'from-rose-500 via-red-500 to-orange-400',
      line: 'from-rose-600 via-orange-400 to-amber-300',
      surface:
        'border-rose-300/70 bg-gradient-to-br from-rose-50/95 via-white to-orange-50/75 dark:border-rose-400/25 dark:from-rose-500/[0.12] dark:via-slate-950 dark:to-orange-500/5',
      heroSurface: 'from-[#16070e] via-[#250a13] to-[#3b121b]',
      heroCard: 'from-[#14060c]/95 via-[#220a12]/92 to-[#3a111a]/78',
      text: 'text-rose-600 dark:text-rose-300',
      chip:
        'border-rose-300/70 bg-rose-50 text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/[0.12] dark:text-rose-100',
      glow: 'bg-rose-500/[0.20]',
      ring: '#f43f5e',
    }
  }

  if (risk === 'Moderate') {
    return {
      label: 'Watch closely',
      status: 'Preventive monitoring advised',
      icon: AlertTriangle,
      gradient: 'from-amber-400 via-orange-400 to-yellow-300',
      line: 'from-amber-600 via-orange-400 to-yellow-300',
      surface:
        'border-amber-300/70 bg-gradient-to-br from-amber-50/95 via-white to-yellow-50/75 dark:border-amber-400/25 dark:from-amber-500/[0.12] dark:via-slate-950 dark:to-yellow-500/5',
      heroSurface: 'from-[#170e06] via-[#281507] to-[#3d2608]',
      heroCard: 'from-[#140b05]/95 via-[#231305]/92 to-[#3d2608]/78',
      text: 'text-amber-600 dark:text-amber-300',
      chip:
        'border-amber-300/70 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/[0.12] dark:text-amber-100',
      glow: 'bg-amber-500/[0.20]',
      ring: '#f59e0b',
    }
  }

  return {
    label: 'Stable monitoring',
    status: 'Routine surveillance',
    icon: CheckCircle2,
    gradient: 'from-emerald-400 via-teal-400 to-cyan-300',
    line: 'from-emerald-600 via-teal-400 to-cyan-300',
    surface:
      'border-emerald-300/70 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/75 dark:border-emerald-400/25 dark:from-emerald-500/[0.12] dark:via-slate-950 dark:to-teal-500/5',
    heroSurface: 'from-[#06150f] via-[#082018] to-[#0b3529]',
    heroCard: 'from-[#05130f]/95 via-[#08211a]/92 to-[#0c372b]/78',
    text: 'text-emerald-600 dark:text-emerald-300',
    chip:
      'border-emerald-300/70 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/[0.12] dark:text-emerald-100',
    glow: 'bg-emerald-500/[0.20]',
    ring: '#10b981',
  }
}

function getVisualTheme(tone = 'blue') {
  const themes = {
    blue: {
      surface:
        'border-blue-200/70 bg-gradient-to-br from-blue-50/95 via-white to-cyan-50/75 dark:border-blue-400/20 dark:from-blue-500/10 dark:via-slate-950 dark:to-cyan-500/5',
      icon:
        'border-blue-200 bg-white text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200',
      line: 'from-blue-600 via-cyan-400 to-sky-300',
      glow: 'bg-blue-400/20',
      meter: 'from-blue-600 via-sky-400 to-cyan-300',
    },
    rose: {
      surface:
        'border-rose-200/70 bg-gradient-to-br from-rose-50/95 via-white to-orange-50/75 dark:border-rose-400/20 dark:from-rose-500/10 dark:via-slate-950 dark:to-orange-500/5',
      icon:
        'border-rose-200 bg-white text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200',
      line: 'from-rose-600 via-orange-400 to-amber-300',
      glow: 'bg-rose-400/20',
      meter: 'from-rose-600 via-orange-400 to-amber-300',
    },
    amber: {
      surface:
        'border-amber-200/70 bg-gradient-to-br from-amber-50/95 via-white to-orange-50/75 dark:border-amber-400/20 dark:from-amber-500/10 dark:via-slate-950 dark:to-orange-500/5',
      icon:
        'border-amber-200 bg-white text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200',
      line: 'from-amber-600 via-orange-400 to-yellow-300',
      glow: 'bg-amber-400/20',
      meter: 'from-amber-600 via-orange-400 to-yellow-300',
    },
    emerald: {
      surface:
        'border-emerald-200/70 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/75 dark:border-emerald-400/20 dark:from-emerald-500/10 dark:via-slate-950 dark:to-teal-500/5',
      icon:
        'border-emerald-200 bg-white text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200',
      line: 'from-emerald-600 via-teal-400 to-cyan-300',
      glow: 'bg-emerald-400/20',
      meter: 'from-emerald-600 via-teal-400 to-cyan-300',
    },
    indigo: {
      surface:
        'border-indigo-200/70 bg-gradient-to-br from-indigo-50/95 via-white to-blue-50/75 dark:border-indigo-400/20 dark:from-indigo-500/10 dark:via-slate-950 dark:to-blue-500/5',
      icon:
        'border-indigo-200 bg-white text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-200',
      line: 'from-indigo-600 via-blue-400 to-cyan-300',
      glow: 'bg-indigo-400/20',
      meter: 'from-indigo-600 via-blue-400 to-cyan-300',
    },
    slate: {
      surface:
        'border-slate-200/80 bg-gradient-to-br from-slate-50/95 via-white to-blue-50/60 dark:border-slate-700 dark:from-slate-900 dark:via-slate-950 dark:to-blue-950/20',
      icon:
        'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
      line: 'from-slate-600 via-blue-400 to-transparent',
      glow: 'bg-slate-400/15',
      meter: 'from-slate-600 via-blue-400 to-cyan-300',
    },
  }

  return themes[tone] || themes.blue
}

function SectionBadge({ icon: Icon = Sparkles, children, tone = 'blue' }) {
  const theme = getVisualTheme(tone)

  return (
    <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.17em] shadow-sm ${theme.icon}`}>
      <Icon className="h-3.5 w-3.5" />
      {children}
    </div>
  )
}

function PremiumPanel({ children, tone = 'blue', className = '' }) {
  const theme = getVisualTheme(tone)

  return (
    <section className={`group relative overflow-hidden rounded-[34px] border p-6 shadow-[0_22px_68px_rgba(15,23,42,0.08)] ring-1 ring-white/80 backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_30px_82px_rgba(15,23,42,0.13)] dark:ring-white/5 ${theme.surface} ${className}`}>
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${theme.line}`} />
      <div className={`pointer-events-none absolute -right-24 -top-24 h-60 w-60 rounded-full blur-3xl transition-transform duration-500 group-hover:scale-110 ${theme.glow}`} />
      <div className="pointer-events-none absolute inset-0 opacity-[0.022] [background-image:linear-gradient(rgba(15,23,42,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.5)_1px,transparent_1px)] [background-size:34px_34px] dark:opacity-[0.035] dark:[background-image:linear-gradient(rgba(255,255,255,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.5)_1px,transparent_1px)]" />
      <div className="relative z-[1]">{children}</div>
    </section>
  )
}

function StatCard({ icon: Icon, label, value, helper, tone = 'blue', percent = 72 }) {
  const theme = getVisualTheme(tone)

  return (
    <article className={`group relative min-h-[190px] overflow-hidden rounded-[30px] border p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] ring-1 ring-white/75 transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_28px_68px_rgba(15,23,42,0.15)] dark:ring-white/5 ${theme.surface}`}>
      <div className={`pointer-events-none absolute -right-12 -top-14 h-36 w-36 rounded-full blur-3xl transition-transform duration-500 group-hover:scale-125 ${theme.glow}`} />
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${theme.line}`} />
      <div className="pointer-events-none absolute right-5 top-5 h-20 w-20 rounded-full border border-white/70 opacity-60 dark:border-white/5" />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border shadow-[0_12px_28px_rgba(15,23,42,0.08)] ${theme.icon}`}>
            <Icon className="h-5 w-5" strokeWidth={2.25} />
          </div>

          <span className="rounded-full border border-white/80 bg-white/75 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-slate-500 shadow-sm dark:border-white/5 dark:bg-white/5 dark:text-slate-400">
            Live
          </span>
        </div>

        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-1 text-3xl font-black tracking-[-0.05em] text-slate-950 dark:text-white">{value}</p>

        <div className="mt-auto pt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/80 shadow-inner dark:bg-slate-800">
            <div className={`h-full rounded-full bg-gradient-to-r ${theme.meter}`} style={{ width: `${Math.max(6, Math.min(100, percent))}%` }} />
          </div>
          <p className="mt-3 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-400">{helper}</p>
        </div>
      </div>
    </article>
  )
}

function ActionLink({ to, icon: Icon, title, helper, tone = 'blue' }) {
  const theme = getVisualTheme(tone)

  return (
    <Link to={to} className={`group relative overflow-hidden rounded-[28px] border p-5 shadow-[0_16px_42px_rgba(15,23,42,0.08)] ring-1 ring-white/70 transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(15,23,42,0.14)] dark:ring-white/5 ${theme.surface}`}>
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${theme.line}`} />
      <div className={`pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl transition-transform duration-500 group-hover:scale-125 ${theme.glow}`} />

      <div className={`flex h-12 w-12 items-center justify-center rounded-[18px] border shadow-sm ${theme.icon}`}>
        <Icon className="h-5 w-5" />
      </div>

      <h3 className="mt-4 text-lg font-black tracking-tight text-brand-text dark:text-white">{title}</h3>
      <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted dark:text-slate-400">{helper}</p>

      <span className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/75 text-slate-500 shadow-sm transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
        <ArrowUpRight className="h-4 w-4" />
      </span>
    </Link>
  )
}

function SupervisorPageStyles() {
  return (
    <style>{`
      .supervisor-table-scroll {
        scrollbar-width: thin;
        scrollbar-color: rgba(56, 189, 248, 0.85) rgba(15, 23, 42, 0.08);
      }

      .supervisor-table-scroll::-webkit-scrollbar {
        width: 10px;
        height: 10px;
      }

      .supervisor-table-scroll::-webkit-scrollbar-track {
        border-radius: 999px;
        background: rgba(226, 232, 240, 0.65);
      }

      .supervisor-table-scroll::-webkit-scrollbar-thumb {
        border: 2px solid rgba(241, 245, 249, 0.85);
        border-radius: 999px;
        background: linear-gradient(180deg, #67e8f9, #2563eb);
        box-shadow: 0 0 18px rgba(14, 165, 233, 0.30);
      }

      html.dark .supervisor-table-scroll::-webkit-scrollbar-track {
        background: rgba(15, 23, 42, 0.75);
      }

      html.dark .supervisor-table-scroll::-webkit-scrollbar-thumb {
        border-color: rgba(15, 23, 42, 0.9);
      }

      @media (max-width: 639px) {
        .supervisor-mobile-compact,
        .supervisor-mobile-compact * {
          min-width: 0;
        }

        .supervisor-mobile-compact {
          width: 100%;
          max-width: 100vw;
          overflow-x: hidden;
        }

        .supervisor-mobile-compact > * + * {
          margin-top: 0.9rem !important;
        }

        .supervisor-hero-panel {
          border-radius: 22px !important;
        }

        .supervisor-hero-panel > .relative.grid {
          min-height: auto !important;
          grid-template-columns: minmax(0, 1fr) !important;
          gap: 0.85rem !important;
          padding: 0.9rem !important;
        }

        .supervisor-hero-panel h1 {
          margin-top: 0.8rem !important;
          font-size: 1.55rem !important;
          line-height: 1.08 !important;
        }

        .supervisor-hero-panel p {
          font-size: 0.76rem !important;
          line-height: 1.4 !important;
        }

        .supervisor-hero-metrics {
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          gap: 0.45rem !important;
        }

        .supervisor-hero-metrics > div {
          border-radius: 15px !important;
          padding: 0.55rem !important;
        }

        .supervisor-hero-metrics p:first-child {
          font-size: 0.62rem !important;
          letter-spacing: 0.08em !important;
        }

        .supervisor-hero-metrics p:nth-child(2) {
          font-size: 1rem !important;
        }

        .supervisor-stat-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 0.65rem !important;
        }

        .supervisor-stat-grid > article {
          min-height: 150px !important;
          border-radius: 20px !important;
          padding: 0.75rem !important;
        }

        .supervisor-ai-panel,
        .supervisor-ranking-panel,
        .supervisor-priority-panel,
        .supervisor-reminder-panel {
          border-radius: 22px !important;
          padding: 0.9rem !important;
        }

        .supervisor-ai-panel .ai-visual {
          height: 4.7rem !important;
          width: 4.7rem !important;
          border-radius: 18px !important;
        }

        .supervisor-table-scroll {
          max-height: 380px !important;
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch;
        }

        .supervisor-table-scroll table {
          min-width: 720px !important;
          font-size: 0.75rem !important;
        }

        .supervisor-table-scroll th,
        .supervisor-table-scroll td {
          padding: 0.6rem 0.65rem !important;
        }

        .supervisor-action-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          gap: 0.55rem !important;
        }

        .supervisor-action-grid > a {
          min-height: 126px !important;
          border-radius: 18px !important;
          padding: 0.75rem !important;
        }

        .supervisor-action-grid p {
          display: none !important;
        }

        .supervisor-action-grid h3 {
          font-size: 0.76rem !important;
          line-height: 1.25 !important;
        }
      }
    `}</style>
  )
}

export default function SupervisorPage() {
  const {
    riskRows = [],
    dashboardStats = {},
    sourceStatus = {},
    backendForecastResult,
  } = useData()

  const savedForecastRows = useMemo(() => {
    return buildSavedForecastRows(backendForecastResult)
  }, [backendForecastResult])

  const displayRows = savedForecastRows.length > 0
    ? savedForecastRows
    : riskRows

  const sortedRows = useMemo(() => {
    return sortSupervisorRows(displayRows)
  }, [displayRows])

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
  const topScore = Math.max(0, Math.min(100, Math.round(getRowScore(topPriority || {}))))
  const totalProjectedCases = sortedRows.reduce((sum, row) => sum + Number(getRowCases(row) || 0), 0)
  const analysisReady = modelName !== 'No forecast method selected yet'
  const topThree = sortedRows.slice(0, 3)

  return (
    <div className="supervisor-mobile-compact relative isolate space-y-7 overflow-hidden rounded-[36px] bg-[radial-gradient(circle_at_8%_2%,rgba(14,165,233,0.08),transparent_28%),radial-gradient(circle_at_92%_8%,rgba(99,102,241,0.07),transparent_24%),linear-gradient(180deg,rgba(248,250,252,0.72),rgba(248,250,252,0))] pb-7 dark:bg-[radial-gradient(circle_at_8%_2%,rgba(14,165,233,0.08),transparent_28%),radial-gradient(circle_at_92%_8%,rgba(99,102,241,0.06),transparent_24%),linear-gradient(180deg,rgba(15,23,42,0.35),rgba(15,23,42,0))]">
      <section className="supervisor-hero-panel relative isolate overflow-hidden rounded-[38px] border border-white/10 bg-[#061321] shadow-[0_34px_94px_rgba(2,6,23,0.32)] ring-1 ring-white/10 sm:rounded-[40px]">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <div className="absolute inset-0 bg-[linear-gradient(112deg,#020617_0%,#061321_48%,#0b1f34_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_74%_24%,rgba(56,189,248,0.16),transparent_27%),radial-gradient(circle_at_94%_92%,rgba(59,130,246,0.13),transparent_28%)]" />
          <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:42px_42px]" />
          <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="absolute -bottom-32 left-10 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/50 to-transparent" />
        </div>

        <div className="relative z-10 grid min-h-[520px] gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(330px,0.62fr)] lg:items-center lg:p-10 xl:min-h-[550px] xl:p-12">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100 shadow-lg backdrop-blur-xl">
                <Radar className="h-3.5 w-3.5" />
                Supervisor command center
              </span>

              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-slate-200 backdrop-blur-xl">
                <span className={`h-2 w-2 rounded-full ${analysisReady ? 'bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.9)]' : 'bg-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.9)]'}`} />
                {analysisReady ? 'Analysis online' : 'Awaiting forecast'}
              </span>
            </div>

            <h1 className="mt-6 max-w-3xl text-[2.15rem] font-black leading-[1.04] tracking-[-0.045em] text-white drop-shadow-[0_5px_24px_rgba(2,6,23,0.65)] sm:text-[3rem] xl:text-[3.55rem]">
              City-wide dengue oversight for faster coordinated decisions.
            </h1>

            <p className="mt-5 max-w-2xl text-sm font-medium leading-7 text-slate-200/90 sm:text-[15px] sm:leading-8">
              Review barangay risk levels, forecast readiness, response assignments, and resource priorities from one coordinated supervisor workspace.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="#response-action-center"
                style={{
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                }}
                className="relative z-20 inline-flex items-center justify-center gap-2 rounded-2xl border border-white px-5 py-3 text-sm font-black shadow-[0_14px_34px_rgba(255,255,255,0.18)] transition duration-200 hover:-translate-y-0.5 hover:brightness-95"
              >
                Review response actions
                <ClipboardCheck className="h-4 w-4 text-slate-700" />
              </Link>

              <Link to="/map" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/[0.15] bg-white/[0.08] px-5 py-3 text-sm font-black text-white shadow-lg backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:bg-white/[0.14]">
                Open hotspot map
                <MapPinned className="h-4 w-4" />
              </Link>
            </div>

            <div className="supervisor-hero-metrics mt-7 grid max-w-2xl gap-3 sm:grid-cols-4">
              {[
                { label: 'Barangays', value: formatNumber(totalBarangays), icon: Users },
                { label: 'Average score', value: `${averageScore}/100`, icon: Activity },
                { label: 'Ready sources', value: `${readySources}/4`, icon: Database },
                { label: 'Projected cases', value: formatNumber(totalProjectedCases || dashboardStats?.fourWeekForecast || 0), icon: TrendingUp },
              ].map((item) => {
                const Icon = item.icon

                return (
                  <div key={item.label} className="group/hero-metric relative overflow-hidden rounded-[22px] border border-white/[0.15] bg-gradient-to-br from-white/[0.12] via-slate-950/[0.35] to-cyan-400/[0.07] p-4 shadow-[0_16px_36px_rgba(2,6,23,0.30)] ring-1 ring-white/5 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-300/30">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Icon className="h-3.5 w-3.5" />
                      <span className="text-[9px] font-black uppercase tracking-[0.15em]">{item.label}</span>
                    </div>
                    <p className="mt-2 text-xl font-black tracking-[-0.04em] text-white">{item.value}</p>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="w-full self-end justify-self-end lg:max-w-[410px]">
            <div className={`group/top-priority relative overflow-hidden rounded-[32px] border border-white/15 bg-gradient-to-br ${topTone.heroCard} p-5 text-white shadow-[0_30px_78px_rgba(2,6,23,0.54)] ring-1 ring-white/10 backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:border-white/25 sm:p-6`}>
              <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${topTone.gradient}`} />
              <div className={`pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full ${topTone.glow} blur-3xl`} />

              <div className="relative flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/70">Current top priority</p>
                  <h2 className="mt-2 truncate text-3xl font-black tracking-[-0.04em]">{topPriority?.barangay || 'No barangay ranked'}</h2>
                  <p className={`mt-1 text-sm font-black ${topTone.text}`}>{topPriority?.risk || 'Pending'} risk</p>
                </div>

                <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full p-[8px] shadow-[0_0_42px_rgba(56,189,248,0.18)]" style={{ background: `conic-gradient(${topTone.ring} ${topScore * 3.6}deg, rgba(255,255,255,0.10) 0deg)` }}>
                  <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-white/10 bg-[#071525]">
                    <span className="text-2xl font-black leading-none">{topScore}</span>
                    <span className="mt-1 text-[8px] font-black uppercase tracking-[0.14em] text-cyan-100/70">of 100</span>
                  </div>
                </div>
              </div>

              <p className="relative mt-4 text-sm font-semibold leading-6 text-slate-300">
                {topTone.label}. Review this barangay first when preparing intervention priorities and field coordination.
              </p>

              <div className="relative mt-5 grid grid-cols-2 gap-2.5">
                <div className="rounded-[18px] border border-white/[0.15] bg-white/[0.07] p-3 shadow-inner">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Projected cases</p>
                  <p className="mt-1 text-lg font-black text-white">{formatNumber(getRowCases(topPriority || {}))}</p>
                </div>
                <div className="rounded-[18px] border border-white/[0.15] bg-white/[0.07] p-3 shadow-inner">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Response mode</p>
                  <p className="mt-1 text-sm font-black leading-6 text-white">{topTone.status}</p>
                </div>
              </div>

              <div className="relative mt-5 overflow-hidden rounded-full bg-white/10">
                <div className={`h-2.5 rounded-full bg-gradient-to-r ${topTone.gradient}`} style={{ width: `${Math.max(5, topScore)}%` }} />
              </div>

              <Link to="/forecast" className="relative mt-5 flex w-full items-center justify-between rounded-[18px] border border-cyan-300/[0.15] bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-50 transition hover:bg-cyan-300/[0.15]">
                Open full forecast review
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <PremiumPanel tone="indigo" className="supervisor-ai-panel p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="ai-visual relative h-28 w-28 shrink-0 overflow-hidden rounded-[28px] border border-indigo-300/30 bg-black shadow-[0_24px_56px_rgba(15,23,42,0.28)] ring-1 ring-white/70 dark:ring-white/10">
              <img src={aiGif} alt="AI model" className="h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/15" />
            </div>

            <div className="min-w-0">
              <SectionBadge icon={Sparkles} tone="emerald">Forecast intelligence online</SectionBadge>
              <p className="mt-4 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Selected model</p>
              <h2 className="mt-1 break-words text-2xl font-black tracking-tight text-brand-text dark:text-white">{modelName}</h2>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-brand-muted dark:text-slate-300">
                This method was selected from the latest model evaluation and is being used for the current city-wide barangay forecast.
              </p>
            </div>
          </div>

          <div className="grid w-full gap-3 sm:grid-cols-3 lg:w-auto lg:min-w-[430px]">
            {[
              { label: 'Forecast status', value: analysisReady ? 'Ready' : 'Pending', icon: CheckCircle2 },
              { label: 'Review mode', value: 'City-wide', icon: Building2 },
              { label: 'Priority rows', value: formatNumber(Math.min(sortedRows.length, 10)), icon: Target },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="rounded-[24px] border border-white/80 bg-white/80 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/5">
                  <Icon className="h-4 w-4 text-indigo-500 dark:text-indigo-300" />
                  <p className="mt-3 text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{item.label}</p>
                  <p className="mt-1 text-lg font-black text-brand-text dark:text-white">{item.value}</p>
                </div>
              )
            })}
          </div>
        </div>
      </PremiumPanel>

      <section className="supervisor-stat-grid grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ShieldAlert} label="High risk" value={formatNumber(highRows.length)} helper="Barangays requiring priority response." tone="rose" percent={(highRows.length / Math.max(totalBarangays, 1)) * 100} />
        <StatCard icon={AlertTriangle} label="Moderate risk" value={formatNumber(moderateRows.length)} helper="Barangays that need close preventive monitoring." tone="amber" percent={(moderateRows.length / Math.max(totalBarangays, 1)) * 100} />
        <StatCard icon={CheckCircle2} label="Low risk" value={formatNumber(lowRows.length)} helper="Barangays under routine surveillance." tone="emerald" percent={(lowRows.length / Math.max(totalBarangays, 1)) * 100} />
        <StatCard icon={Database} label="Ready sources" value={`${readySources}/4`} helper="Uploaded files available for supervisor review." tone="blue" percent={(readySources / 4) * 100} />
      </section>

      <section id="response-action-center" className="scroll-mt-24">
        <PremiumPanel tone="blue" className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <SectionBadge icon={ClipboardCheck} tone="blue">Response coordination workspace</SectionBadge>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-white">Assign and monitor response actions</h2>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-brand-muted dark:text-slate-400">
                Create actions for priority barangays, assign responsible staff, set due dates, update progress, and record follow-up remarks.
              </p>
            </div>

            <span className="w-fit rounded-full border border-blue-200 bg-white/85 px-3.5 py-2 text-xs font-black text-blue-700 shadow-sm dark:border-blue-400/20 dark:bg-white/5 dark:text-blue-300">
              {formatNumber(Math.min(sortedRows.length, 10))} priority suggestions
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {topThree.length ? topThree.map((row, index) => {
              const riskTone = getRiskTone(row.risk)
              return (
                <div key={`${row.barangay}-${index}`} className={`relative overflow-hidden rounded-[24px] border p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)] ${riskTone.surface}`}>
                  <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${riskTone.line}`} />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Priority #{index + 1}</p>
                      <p className="mt-1 truncate text-base font-black text-brand-text dark:text-white">{row.barangay}</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${riskTone.chip}`}>{row.risk}</span>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <p className="text-2xl font-black tracking-[-0.04em] text-slate-950 dark:text-white">{Math.round(getRowScore(row))}<span className="text-xs text-slate-400">/100</span></p>
                    <p className="text-xs font-black text-slate-500 dark:text-slate-400">{formatNumber(getRowCases(row))} cases</p>
                  </div>
                </div>
              )
            }) : (
              <div className="rounded-[22px] border border-dashed border-slate-300 p-5 text-sm font-semibold text-brand-muted dark:border-slate-700 dark:text-slate-400 sm:col-span-3">No priority barangays are available yet.</div>
            )}
          </div>

          <div className="mt-5 rounded-[28px] border border-white/80 bg-white/75 p-3 shadow-inner dark:border-white/10 dark:bg-slate-950/60 sm:p-4">
            <DecisionActionTracker priorityRows={sortedRows.slice(0, 10)} />
          </div>
        </PremiumPanel>
      </section>

      <FieldUpdateReviewPanel />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <PremiumPanel tone="blue" className="supervisor-ranking-panel p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <SectionBadge icon={BarChart3} tone="blue">City-wide risk ranking</SectionBadge>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-white">Barangay priority ranking</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted dark:text-slate-400">Sorted by saved priority rank, risk level, risk score, and projected cases.</p>
            </div>

            <span className="w-fit rounded-full border border-blue-200 bg-white/85 px-3.5 py-2 text-xs font-black text-blue-700 shadow-sm dark:border-blue-400/20 dark:bg-white/5 dark:text-blue-300">{formatNumber(totalBarangays)} barangays</span>
          </div>

          <div className="mt-5 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/80 shadow-inner dark:border-slate-700 dark:bg-slate-950/70">
            <div className="supervisor-table-scroll max-h-[560px] overflow-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50/95 text-[10px] uppercase tracking-[0.14em] text-brand-muted shadow-sm backdrop-blur dark:bg-slate-950/95 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3.5">Rank</th>
                    <th className="px-4 py-3.5">Barangay</th>
                    <th className="px-4 py-3.5">Risk</th>
                    <th className="px-4 py-3.5">Risk score</th>
                    <th className="px-4 py-3.5">Cases</th>
                    <th className="px-4 py-3.5">Response</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sortedRows.map((row, index) => {
                    const badgeStyle = riskStyles[row.risk] || riskStyles.Low
                    const score = Math.round(getRowScore(row))
                    const cases = getRowCases(row)
                    const riskTone = getRiskTone(row.risk)

                    return (
                      <tr key={`${row.barangay}-${index}`} className="group/row transition hover:bg-slate-50/90 dark:hover:bg-slate-800/60">
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex h-9 w-9 items-center justify-center rounded-[14px] bg-gradient-to-br ${riskTone.gradient} text-xs font-black text-white shadow-[0_8px_20px_rgba(15,23,42,0.14)]`}>{index + 1}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-black text-brand-text dark:text-white">{row.barangay}</p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">Priority rank {Number(row?.priorityRank ?? row?.priority_rank ?? index + 1)}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`rounded-full border px-3 py-1 text-xs font-black ${badgeStyle.badge}`}>{row.risk}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="min-w-[170px]">
                            <div className="flex items-center justify-between text-xs font-black text-brand-text dark:text-white"><span>{score}/100</span></div>
                            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100 shadow-inner dark:bg-slate-800">
                              <div className={`h-full rounded-full bg-gradient-to-r ${riskTone.gradient}`} style={{ width: `${Math.max(4, Math.min(100, score))}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-black text-brand-text dark:text-white">{formatNumber(cases)}</td>
                        <td className="px-4 py-3.5">
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-brand-muted shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                            {row.risk === 'High' ? 'Immediate' : row.risk === 'Moderate' ? 'Monitor' : 'Routine'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}

                  {sortedRows.length === 0 && (
                    <tr><td colSpan="6" className="px-4 py-12 text-center text-sm font-semibold text-brand-muted dark:text-slate-400">No priority barangay list is available yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </PremiumPanel>

        <div className="space-y-5">
          <PremiumPanel tone="emerald" className="supervisor-priority-panel p-5 sm:p-6">
            <SectionBadge icon={ClipboardCheck} tone="emerald">Planning priorities</SectionBadge>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-white">Supervisor decision guide</h2>

            <div className="mt-5 space-y-3">
              {[
                { number: '01', title: 'Immediate response', text: 'Prioritize high-risk barangays for cleanup, vector control, field validation, and public advisories.', tone: 'rose' },
                { number: '02', title: 'Preventive monitoring', text: 'Review moderate-risk barangays for early warning, inspections, and possible escalation.', tone: 'amber' },
                { number: '03', title: 'Evidence-based allocation', text: 'Use forecast results, reports, and map context before assigning staff, supplies, and schedules.', tone: 'blue' },
              ].map((item) => {
                const theme = getVisualTheme(item.tone)
                return (
                  <div key={item.number} className={`relative overflow-hidden rounded-[24px] border p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)] ${theme.surface}`}>
                    <div className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${theme.line}`} />
                    <div className="flex items-start gap-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] border text-xs font-black ${theme.icon}`}>{item.number}</span>
                      <div>
                        <p className="text-sm font-black text-brand-text dark:text-white">{item.title}</p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-brand-muted dark:text-slate-400">{item.text}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </PremiumPanel>

          <div className="supervisor-action-grid grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <ActionLink to="/map" icon={MapPinned} title="Open hotspot map" helper="Review hotspot distribution and neighboring risk context." tone="blue" />
            <ActionLink to="/forecast" icon={TrendingUp} title="Review forecast" helper="Inspect the selected model results and barangay projections." tone="emerald" />
            <ActionLink to="/reports" icon={FileText} title="Open reports" helper="Use saved summaries as supporting evidence for planning." tone="indigo" />
          </div>

          <PremiumPanel tone="slate" className="supervisor-reminder-panel p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-blue-200 bg-white text-blue-700 shadow-sm dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-black text-brand-text dark:text-white">Supervisor reminder</h3>
                <p className="mt-2 text-sm font-semibold leading-7 text-brand-muted dark:text-slate-400">Check forecast results against CHO and barangay field reports before assigning supplies or posting public advisories.</p>
              </div>
            </div>
          </PremiumPanel>
        </div>
      </section>

      <SupervisorPageStyles />
    </div>
  )
}
