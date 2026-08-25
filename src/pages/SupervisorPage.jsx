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
import InformationTypeBadge from '../components/InformationTypeBadge'
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
          font-size: 0.8125rem !important;
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
          font-size: 0.8125rem !important;
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
          font-size: 0.8125rem !important;
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
          font-size: 0.8125rem !important;
          line-height: 1.25 !important;
        }
      }

      /* =========================================================
         FINAL RESPONSE COORDINATION RESPONSIVE STABILIZATION
         Keeps dense cards in 2x2 / 2+1 layouts only when text fits.
         ========================================================= */
      @media (max-width: 639px) {
        .supervisor-mobile-compact {
          width: 100% !important;
          max-width: 100% !important;
          overflow-x: hidden !important;
          border-radius: 22px !important;
          padding-bottom: 1rem !important;
        }

        /* HERO */
        .supervisor-hero-panel {
          min-height: 0 !important;
          border-radius: 24px !important;
        }

        .supervisor-hero-panel > .relative.z-10.grid {
          min-height: 0 !important;
          grid-template-columns: minmax(0, 1fr) !important;
          gap: 1rem !important;
          padding: 1rem !important;
        }

        .supervisor-hero-panel h1 {
          margin-top: 1rem !important;
          max-width: 100% !important;
          font-size: 1.9rem !important;
          line-height: 1.04 !important;
          letter-spacing: -0.045em !important;
        }

        .supervisor-hero-panel h1 + p {
          display: block !important;
          margin-top: 0.75rem !important;
          overflow: visible !important;
          -webkit-line-clamp: unset !important;
          font-size: 0.8125rem !important;
          line-height: 1.5 !important;
        }

        /* Hero actions remain 2-up on a normal phone. */
        .supervisor-mobile-compact .supervisor-hero-actions {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 0.55rem !important;
          margin-top: 1rem !important;
        }

        .supervisor-mobile-compact .supervisor-hero-actions > a {
          width: 100% !important;
          min-width: 0 !important;
          min-height: 48px !important;
          padding: 0.7rem 0.65rem !important;
          font-size: 0.8125rem !important;
          line-height: 1.2 !important;
          text-align: center !important;
          white-space: normal !important;
        }

        /* HERO METRICS = TRUE 2x2 */
        .supervisor-mobile-compact .supervisor-hero-metrics {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 0.55rem !important;
          margin-top: 1rem !important;
        }

        .supervisor-mobile-compact .supervisor-hero-metrics > div {
          min-width: 0 !important;
          min-height: 90px !important;
          border-radius: 17px !important;
          padding: 0.7rem !important;
        }

        .supervisor-mobile-compact .supervisor-hero-metrics span {
          font-size: 0.8125rem !important;
          line-height: 1.15 !important;
          letter-spacing: 0.055em !important;
          overflow-wrap: anywhere !important;
        }

        .supervisor-mobile-compact .supervisor-hero-metrics p {
          margin-top: 0.45rem !important;
          font-size: 1.15rem !important;
          line-height: 1.06 !important;
          overflow-wrap: anywhere !important;
        }

        /* Top priority hero card */
        .supervisor-mobile-compact .supervisor-top-priority-wrap > div {
          border-radius: 20px !important;
          padding: 0.85rem !important;
        }

        .supervisor-mobile-compact .supervisor-top-priority-wrap h2 {
          font-size: 1.3rem !important;
          line-height: 1.15 !important;
        }

        .supervisor-mobile-compact .supervisor-top-priority-wrap .h-24.w-24 {
          width: 4.75rem !important;
          height: 4.75rem !important;
        }

        .supervisor-mobile-compact .supervisor-top-priority-wrap .relative.mt-5.grid {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 0.5rem !important;
        }

        .supervisor-mobile-compact .supervisor-top-priority-wrap .relative.mt-5.grid > div {
          min-width: 0 !important;
          padding: 0.65rem !important;
        }

        .supervisor-mobile-compact .supervisor-top-priority-wrap a {
          min-height: 48px !important;
          margin-top: 0.8rem !important;
        }

        /* FORECAST INTELLIGENCE */
        .supervisor-mobile-compact .supervisor-ai-panel {
          border-radius: 20px !important;
          padding: 0.8rem !important;
        }

        .supervisor-mobile-compact .supervisor-ai-panel > .relative.z-\[1\] > .flex {
          gap: 0.8rem !important;
        }

        .supervisor-mobile-compact .supervisor-ai-panel .flex.items-center.gap-4 {
          align-items: flex-start !important;
          gap: 0.7rem !important;
        }

        .supervisor-mobile-compact .supervisor-ai-panel .ai-visual {
          width: 4.5rem !important;
          height: 4.5rem !important;
          border-radius: 17px !important;
        }

        .supervisor-mobile-compact .supervisor-ai-panel h2 {
          font-size: 1.15rem !important;
          line-height: 1.15 !important;
        }

        .supervisor-mobile-compact .supervisor-ai-panel h2 + p {
          font-size: 0.8125rem !important;
          line-height: 1.4 !important;
        }

        /* AI metrics = 2 + 1 */
        .supervisor-mobile-compact .supervisor-ai-metrics {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 0.5rem !important;
        }

        .supervisor-mobile-compact .supervisor-ai-metrics > div {
          min-width: 0 !important;
          min-height: 92px !important;
          border-radius: 16px !important;
          padding: 0.65rem !important;
        }

        .supervisor-mobile-compact .supervisor-ai-metrics > div:last-child:nth-child(odd) {
          grid-column: 1 / -1 !important;
        }

        .supervisor-mobile-compact .supervisor-ai-metrics p:first-of-type {
          font-size: 0.8125rem !important;
          line-height: 1.15 !important;
          letter-spacing: 0.05em !important;
        }

        .supervisor-mobile-compact .supervisor-ai-metrics p:last-of-type {
          margin-top: 0.3rem !important;
          font-size: 0.95rem !important;
          line-height: 1.1 !important;
          overflow-wrap: anywhere !important;
        }

        /* CITY-WIDE RISK CARDS = 2x2 */
        .supervisor-mobile-compact .supervisor-stat-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 0.6rem !important;
        }

        .supervisor-mobile-compact .supervisor-stat-grid > article {
          min-width: 0 !important;
          min-height: 150px !important;
          border-radius: 20px !important;
          padding: 0.8rem !important;
        }

        .supervisor-mobile-compact .supervisor-stat-grid > article .h-12.w-12 {
          width: 2.15rem !important;
          height: 2.15rem !important;
          border-radius: 13px !important;
        }

        .supervisor-mobile-compact .supervisor-stat-grid > article .text-3xl {
          font-size: 1.2rem !important;
        }

        .supervisor-mobile-compact .supervisor-stat-grid > article p:last-child {
          display: -webkit-box !important;
          -webkit-line-clamp: 2 !important;
          -webkit-box-orient: vertical !important;
          overflow: hidden !important;
          font-size: 0.8125rem !important;
          line-height: 1.3 !important;
        }

        /* RESPONSE COORDINATION PANEL */
        .supervisor-mobile-compact #response-action-center section {
          border-radius: 20px !important;
          padding: 0.8rem !important;
        }

        .supervisor-mobile-compact #response-action-center h2 {
          font-size: 1.25rem !important;
          line-height: 1.15 !important;
        }

        .supervisor-mobile-compact #response-action-center h2 + p {
          font-size: 0.8125rem !important;
          line-height: 1.45 !important;
        }

        .supervisor-mobile-compact #response-action-center > section > .relative.z-\[1\] > .flex:first-child > span:last-child {
          width: 100% !important;
          text-align: center !important;
          white-space: normal !important;
        }

        /* Priority suggestion cards = 2 + 1 */
        .supervisor-mobile-compact .supervisor-priority-suggestions {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 0.55rem !important;
        }

        .supervisor-mobile-compact .supervisor-priority-suggestions > div {
          min-width: 0 !important;
          min-height: 124px !important;
          border-radius: 17px !important;
          padding: 0.7rem !important;
        }

        .supervisor-mobile-compact .supervisor-priority-suggestions > div:last-child:nth-child(odd) {
          grid-column: 1 / -1 !important;
        }

        .supervisor-mobile-compact .supervisor-priority-suggestions .truncate {
          white-space: normal !important;
          overflow: visible !important;
          text-overflow: clip !important;
          font-size: 0.8125rem !important;
          line-height: 1.22 !important;
          overflow-wrap: anywhere !important;
        }

        .supervisor-mobile-compact .supervisor-priority-suggestions .rounded-full.border {
          max-width: 100% !important;
          padding: 0.3rem 0.45rem !important;
          font-size: 0.8125rem !important;
          line-height: 1.1 !important;
          white-space: nowrap !important;
        }

        .supervisor-mobile-compact .supervisor-priority-suggestions .text-2xl {
          font-size: 1.2rem !important;
        }

        .supervisor-mobile-compact #response-action-center .mt-5.rounded-\[28px\] {
          border-radius: 16px !important;
          padding: 0.6rem !important;
        }

        /* Field update review component wrapper */
        .supervisor-mobile-compact .supervisor-field-review-wrap {
          width: 100% !important;
          min-width: 0 !important;
          overflow: hidden !important;
        }

        /* RANKING */
        .supervisor-mobile-compact .supervisor-ranking-layout {
          grid-template-columns: minmax(0, 1fr) !important;
          gap: 0.75rem !important;
        }

        .supervisor-mobile-compact .supervisor-ranking-panel {
          border-radius: 20px !important;
          padding: 0.8rem !important;
        }

        .supervisor-mobile-compact .supervisor-ranking-panel h2 {
          font-size: 1.25rem !important;
          line-height: 1.15 !important;
        }

        .supervisor-mobile-compact .supervisor-ranking-panel h2 + p {
          font-size: 0.8125rem !important;
          line-height: 1.45 !important;
        }

        .supervisor-mobile-compact .supervisor-table-scroll {
          width: 100% !important;
          max-height: 430px !important;
          overflow-x: auto !important;
          overflow-y: auto !important;
          overscroll-behavior: contain !important;
          -webkit-overflow-scrolling: touch !important;
        }

        .supervisor-mobile-compact .supervisor-table-scroll table {
          min-width: 720px !important;
          font-size: 0.8125rem !important;
        }

        .supervisor-mobile-compact .supervisor-table-scroll th,
        .supervisor-mobile-compact .supervisor-table-scroll td {
          padding: 0.62rem 0.65rem !important;
        }

        /* Decision guide contains paragraphs, so one full-width card per row. */
        .supervisor-mobile-compact .supervisor-priority-panel {
          border-radius: 20px !important;
          padding: 0.8rem !important;
        }

        .supervisor-mobile-compact .supervisor-priority-panel h2 {
          font-size: 1.2rem !important;
          line-height: 1.15 !important;
        }

        .supervisor-mobile-compact .supervisor-decision-guide-list > div {
          min-height: 0 !important;
          border-radius: 16px !important;
          padding: 0.7rem !important;
        }

        .supervisor-mobile-compact .supervisor-decision-guide-list .h-10.w-10 {
          width: 2.1rem !important;
          height: 2.1rem !important;
          border-radius: 12px !important;
        }

        .supervisor-mobile-compact .supervisor-decision-guide-list p:first-child {
          font-size: 0.8125rem !important;
          line-height: 1.25 !important;
        }

        .supervisor-mobile-compact .supervisor-decision-guide-list p:last-child {
          display: block !important;
          overflow: visible !important;
          -webkit-line-clamp: unset !important;
          font-size: 0.8125rem !important;
          line-height: 1.4 !important;
        }

        /* QUICK LINKS = 2 + 1, with helper text kept visible */
        .supervisor-mobile-compact .supervisor-action-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 0.55rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-grid > a {
          min-width: 0 !important;
          min-height: 150px !important;
          border-radius: 18px !important;
          padding: 0.75rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-grid > a:last-child:nth-child(odd) {
          grid-column: 1 / -1 !important;
        }

        .supervisor-mobile-compact .supervisor-action-grid > a .h-12.w-12 {
          width: 2.2rem !important;
          height: 2.2rem !important;
          border-radius: 13px !important;
        }

        .supervisor-mobile-compact .supervisor-action-grid > a h3 {
          margin-top: 0.7rem !important;
          padding-right: 1.8rem !important;
          font-size: 0.8125rem !important;
          line-height: 1.25 !important;
          overflow-wrap: anywhere !important;
        }

        .supervisor-mobile-compact .supervisor-action-grid > a p {
          display: -webkit-box !important;
          margin-top: 0.4rem !important;
          -webkit-line-clamp: 2 !important;
          -webkit-box-orient: vertical !important;
          overflow: hidden !important;
          font-size: 0.8125rem !important;
          line-height: 1.35 !important;
        }

        .supervisor-mobile-compact .supervisor-action-grid > a .absolute.right-5.top-5 {
          right: 0.65rem !important;
          top: 0.65rem !important;
          width: 1.8rem !important;
          height: 1.8rem !important;
        }

        .supervisor-mobile-compact .supervisor-reminder-panel {
          border-radius: 20px !important;
          padding: 0.8rem !important;
        }

        .supervisor-mobile-compact .supervisor-reminder-panel h3 {
          font-size: 1rem !important;
        }

        .supervisor-mobile-compact .supervisor-reminder-panel p {
          font-size: 0.8125rem !important;
          line-height: 1.45 !important;
        }

        /* Restore readable mobile text globally on this page */
        .supervisor-mobile-compact .text-sm {
          font-size: 0.8125rem !important;
          line-height: 1.4 !important;
        }

        .supervisor-mobile-compact .text-xs {
          font-size: 0.8125rem !important;
          line-height: 1.35 !important;
        }

        .supervisor-mobile-compact .text-\[11px\] {
          font-size: 0.8125rem !important;
          line-height: 1.3 !important;
        }

        .supervisor-mobile-compact .text-\[10px\] {
          font-size: 0.8125rem !important;
          line-height: 1.22 !important;
        }
      }

      /* Very small phones: sacrifice density before text becomes unreadable. */
      @media (max-width: 374px) {
        .supervisor-mobile-compact .supervisor-hero-actions {
          grid-template-columns: minmax(0, 1fr) !important;
        }

        .supervisor-mobile-compact .supervisor-hero-metrics,
        .supervisor-mobile-compact .supervisor-stat-grid,
        .supervisor-mobile-compact .supervisor-ai-metrics,
        .supervisor-mobile-compact .supervisor-priority-suggestions,
        .supervisor-mobile-compact .supervisor-action-grid {
          grid-template-columns: minmax(0, 1fr) !important;
        }

        .supervisor-mobile-compact .supervisor-ai-metrics > div:last-child:nth-child(odd),
        .supervisor-mobile-compact .supervisor-priority-suggestions > div:last-child:nth-child(odd),
        .supervisor-mobile-compact .supervisor-action-grid > a:last-child:nth-child(odd) {
          grid-column: auto !important;
        }
      }

      /* Tablet portrait / small laptop */
      @media (min-width: 640px) and (max-width: 1023px) {
        .supervisor-hero-panel > .relative.z-10.grid {
          grid-template-columns: minmax(0, 1fr) !important;
        }

        .supervisor-mobile-compact .supervisor-ranking-layout {
          grid-template-columns: minmax(0, 1fr) !important;
        }

        .supervisor-mobile-compact .supervisor-action-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
        }
      }


      /* =========================================================
         ACTION COMMAND CENTER — MOBILE USABILITY REDESIGN
         The DecisionActionTracker is desktop-heavy by default.
         These scoped rules remove nested scrolling and turn it into
         a simple top-to-bottom mobile workflow.
         ========================================================= */
      @media (max-width: 639px) {
        .supervisor-mobile-compact .supervisor-action-command-mobile {
          width: 100% !important;
          min-width: 0 !important;
          overflow: visible !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking {
          width: 100% !important;
          min-width: 0 !important;
          overflow: visible !important;
          border-radius: 18px !important;
          box-shadow: none !important;
        }

        /* Command-center header */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.overflow-hidden.bg-gradient-to-br {
          overflow: visible !important;
          border-radius: 16px !important;
          padding: 0.8rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.overflow-hidden.bg-gradient-to-br > .relative.grid {
          grid-template-columns: minmax(0, 1fr) !important;
          gap: 0.7rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking h2 {
          margin-top: 0.65rem !important;
          font-size: 1.35rem !important;
          line-height: 1.12 !important;
          letter-spacing: -0.035em !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking h2 + p {
          margin-top: 0.5rem !important;
          font-size: 0.8125rem !important;
          line-height: 1.45 !important;
        }

        /* Completion rate becomes a compact horizontal card */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.overflow-hidden.bg-gradient-to-br .rounded-\[28px\].border.border-white\/15 {
          border-radius: 14px !important;
          padding: 0.7rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.overflow-hidden.bg-gradient-to-br .rounded-\[28px\].border.border-white\/15 .text-4xl {
          font-size: 1.55rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.overflow-hidden.bg-gradient-to-br .rounded-\[28px\].border.border-white\/15 .h-14.w-14 {
          width: 2.4rem !important;
          height: 2.4rem !important;
          border-radius: 13px !important;
        }

        /* Status filters = 2 x 2 large tap buttons */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.overflow-hidden.bg-gradient-to-br .relative.mt-6 {
          margin-top: 0.75rem !important;
          gap: 0.5rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.overflow-hidden.bg-gradient-to-br .relative.mt-6 > div:first-child {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          width: 100% !important;
          gap: 0.45rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.overflow-hidden.bg-gradient-to-br .relative.mt-6 > div:first-child > button {
          width: 100% !important;
          min-width: 0 !important;
          min-height: 44px !important;
          justify-content: space-between !important;
          border-radius: 13px !important;
          padding: 0.55rem 0.65rem !important;
          font-size: 0.8125rem !important;
          line-height: 1.15 !important;
          white-space: normal !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.overflow-hidden.bg-gradient-to-br .relative.mt-6 > button {
          width: 100% !important;
          min-height: 44px !important;
          border-radius: 13px !important;
          font-size: 0.8125rem !important;
        }

        /* Main tracker body */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 {
          padding: 0.65rem !important;
        }

        /* Five status cards = 2 + 2 + 1 */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3 {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 0.5rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3 > div {
          min-width: 0 !important;
          min-height: 100px !important;
          border-radius: 15px !important;
          padding: 0.65rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3 > div:last-child:nth-child(odd) {
          grid-column: 1 / -1 !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3 .text-3xl {
          font-size: 1.2rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3 .h-11.w-11 {
          width: 2rem !important;
          height: 2rem !important;
          border-radius: 11px !important;
        }

        /* The create-action + task-board desktop split becomes vertical */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking .grid.gap-5.xl\:grid-cols-\[minmax\(0\,0\.78fr\)_minmax\(0\,1\.22fr\)\],
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking .grid.gap-6.xl\:grid-cols-\[minmax\(0\,0\.78fr\)_minmax\(0\,1\.22fr\)\] {
          grid-template-columns: minmax(0, 1fr) !important;
          gap: 0.65rem !important;
        }

        /* Create response action form card */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form {
          width: 100% !important;
          min-width: 0 !important;
          overflow: visible !important;
          border-radius: 17px !important;
          padding: 0.75rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form h3 {
          font-size: 1.08rem !important;
          line-height: 1.15 !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form h3 + p {
          font-size: 0.8125rem !important;
          line-height: 1.4 !important;
        }

        /* Recommendation chooser */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form .relative.mt-5 {
          margin-top: 0.7rem !important;
        }

        /* ALL form grids become a single clear field per row */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form .grid.gap-4,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form .grid.gap-3 {
          grid-template-columns: minmax(0, 1fr) !important;
          gap: 0.6rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form input,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form textarea {
          width: 100% !important;
          min-width: 0 !important;
          border-radius: 14px !important;
          padding: 0.7rem 0.75rem !important;
          font-size: 0.8125rem !important;
          line-height: 1.4 !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form textarea {
          min-height: 104px !important;
        }

        /* Premium selects: no truncated helper text on phone */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form .relative.mt-2 > button {
          min-height: 52px !important;
          border-radius: 14px !important;
          padding: 0.6rem 0.7rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form .relative.mt-2 > button span.block {
          white-space: normal !important;
          overflow: visible !important;
          text-overflow: clip !important;
          line-height: 1.25 !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form .relative.mt-2 > button .h-10.w-10 {
          width: 2rem !important;
          height: 2rem !important;
          border-radius: 11px !important;
        }

        /* Dropdown menus remain inside phone viewport */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form .absolute.left-0.right-0.z-\[90\] {
          max-width: calc(100vw - 3rem) !important;
          border-radius: 16px !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form .absolute.left-0.right-0.z-\[90\] button {
          min-height: 48px !important;
          border-radius: 12px !important;
          padding: 0.55rem 0.65rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form .absolute.left-0.right-0.z-\[90\] span.block {
          white-space: normal !important;
          overflow: visible !important;
          text-overflow: clip !important;
        }

        /* Save action = obvious full-width primary button */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form button[type="submit"] {
          width: 100% !important;
          min-height: 50px !important;
          border-radius: 14px !important;
          justify-content: center !important;
          font-size: 0.8125rem !important;
        }

        /* Active response tracker header */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div {
          width: 100% !important;
          min-width: 0 !important;
          overflow: visible !important;
          border-radius: 17px !important;
          padding: 0.75rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div > .relative.flex {
          gap: 0.65rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div h3 {
          font-size: 1.08rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div h3 + p {
          font-size: 0.8125rem !important;
          line-height: 1.4 !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div > .relative.flex > div:last-child {
          width: 100% !important;
          text-align: center !important;
          border-radius: 13px !important;
          padding: 0.55rem !important;
        }

        /* CRITICAL FIX:
           remove the 720px minimum-height nested scroll board.
           Records now scroll naturally with the page. */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div .relative.mt-5.overflow-hidden.rounded-\[32px\] {
          overflow: visible !important;
          border-radius: 14px !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div .relative.mt-5.overflow-hidden.rounded-\[32px\] > .pointer-events-none {
          display: none !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div .max-h-\[1120px\].min-h-\[720px\] {
          max-height: none !important;
          min-height: 0 !important;
          overflow: visible !important;
          overscroll-behavior: auto !important;
          padding: 0.5rem !important;
          padding-bottom: 0.5rem !important;
          scrollbar-gutter: auto !important;
        }

        /* One action record = one clear full-width card */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article {
          width: 100% !important;
          min-width: 0 !important;
          overflow: visible !important;
          border-radius: 15px !important;
          padding: 0.7rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article > .flex:first-child {
          gap: 0.6rem !important;
        }

        /* Badges should wrap as whole labels, not split words */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article .flex.flex-wrap.items-center.gap-2 {
          gap: 0.35rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article .flex.flex-wrap.items-center.gap-2 > span {
          max-width: 100% !important;
          padding: 0.35rem 0.5rem !important;
          font-size: 0.8125rem !important;
          line-height: 1.15 !important;
          white-space: normal !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article p.text-base {
          font-size: 0.8125rem !important;
          line-height: 1.4 !important;
        }

        /* Remove button = visible but not competing with the title */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article > .flex:first-child > button {
          width: 100% !important;
          min-height: 42px !important;
          border-radius: 12px !important;
          font-size: 0.8125rem !important;
        }

        /* Edit fields inside each action record = one field per row */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article .mt-4.grid.gap-3 {
          grid-template-columns: minmax(0, 1fr) !important;
          gap: 0.55rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article input,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article textarea {
          width: 100% !important;
          min-width: 0 !important;
          border-radius: 13px !important;
          padding: 0.65rem 0.7rem !important;
          font-size: 0.8125rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article textarea {
          min-height: 96px !important;
        }

        /* Selects inside existing action cards */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article .relative.mt-2 > button {
          min-height: 50px !important;
          border-radius: 13px !important;
          padding: 0.6rem 0.7rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article .relative.mt-2 > button span.block {
          white-space: normal !important;
          overflow: visible !important;
          text-overflow: clip !important;
        }

        /* Owner/follow-up mini cards = 2 columns */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article .mt-4.flex.flex-col.gap-3.border-t > div {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          width: 100% !important;
          gap: 0.45rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article .mt-4.flex.flex-col.gap-3.border-t > div > div {
          min-width: 0 !important;
          border-radius: 12px !important;
          padding: 0.55rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article .mt-4.flex.flex-col.gap-3.border-t > div > div p:last-child {
          white-space: normal !important;
          overflow: visible !important;
          text-overflow: clip !important;
          overflow-wrap: anywhere !important;
        }

        /* Update record = full-width */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article .mt-4.flex.flex-col.gap-3.border-t > button {
          width: 100% !important;
          min-height: 46px !important;
          border-radius: 13px !important;
          font-size: 0.8125rem !important;
        }

        /* Readable labels/body text in the tracker */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking label {
          font-size: 0.8125rem !important;
          line-height: 1.2 !important;
          letter-spacing: 0.07em !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking .text-sm {
          font-size: 0.8125rem !important;
          line-height: 1.4 !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking .text-xs {
          font-size: 0.8125rem !important;
          line-height: 1.35 !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking .text-\[11px\] {
          font-size: 0.8125rem !important;
          line-height: 1.25 !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking .text-\[10px\] {
          font-size: 0.8125rem !important;
          line-height: 1.2 !important;
        }
      }

      @media (max-width: 374px) {
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.overflow-hidden.bg-gradient-to-br .relative.mt-6 > div:first-child,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article .mt-4.flex.flex-col.gap-3.border-t > div {
          grid-template-columns: minmax(0, 1fr) !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3 > div:last-child:nth-child(odd) {
          grid-column: auto !important;
        }
      }


      /* =========================================================
         ACTION COMMAND CENTER — WIDER / DENSER MOBILE LAYOUT
         Uses almost the full phone width while keeping form inputs
         large enough to tap comfortably.
         ========================================================= */
      @media (max-width: 639px) {
        /* Give the whole response section more usable horizontal room. */
        .supervisor-mobile-compact #response-action-center {
          width: 100% !important;
          overflow: visible !important;
        }

        .supervisor-mobile-compact #response-action-center > section {
          padding: 0.55rem !important;
          border-radius: 18px !important;
          overflow: visible !important;
        }

        /* Let the tracker extend into the panel's otherwise-unused padding,
           while still remaining safely inside the phone viewport. */
        .supervisor-mobile-compact .supervisor-action-command-mobile {
          width: calc(100% + 0.5rem) !important;
          max-width: calc(100% + 0.5rem) !important;
          margin-left: -0.25rem !important;
          margin-right: -0.25rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking {
          width: 100% !important;
          max-width: 100% !important;
          border-radius: 16px !important;
        }

        /* Compact command header. */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.overflow-hidden.bg-gradient-to-br {
          padding: 0.62rem !important;
          border-radius: 15px !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking h2 {
          margin-top: 0.45rem !important;
          font-size: 1.15rem !important;
          line-height: 1.1 !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking h2 + p {
          margin-top: 0.35rem !important;
          font-size: 0.8125rem !important;
          line-height: 1.35 !important;
        }

        /* Smaller completion summary. */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.overflow-hidden.bg-gradient-to-br .rounded-\[28px\].border.border-white\/15 {
          padding: 0.55rem !important;
          border-radius: 13px !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.overflow-hidden.bg-gradient-to-br .rounded-\[28px\].border.border-white\/15 .text-4xl {
          font-size: 1.35rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.overflow-hidden.bg-gradient-to-br .rounded-\[28px\].border.border-white\/15 .h-14.w-14 {
          width: 2.1rem !important;
          height: 2.1rem !important;
        }

        /* Status filters stay two columns so full labels still fit. */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.overflow-hidden.bg-gradient-to-br .relative.mt-6 {
          margin-top: 0.55rem !important;
          gap: 0.35rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.overflow-hidden.bg-gradient-to-br .relative.mt-6 > div:first-child {
          gap: 0.35rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.overflow-hidden.bg-gradient-to-br .relative.mt-6 > div:first-child > button {
          min-height: 39px !important;
          padding: 0.42rem 0.5rem !important;
          border-radius: 11px !important;
          font-size: 0.8125rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.overflow-hidden.bg-gradient-to-br .relative.mt-6 > button {
          min-height: 40px !important;
          padding: 0.45rem 0.55rem !important;
          font-size: 0.8125rem !important;
        }

        /* Main body uses less internal whitespace. */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 {
          padding: 0.45rem !important;
        }

        /* Five status counters become a dense 3 + 2 grid. */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3 {
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          gap: 0.35rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3 > div {
          min-width: 0 !important;
          min-height: 82px !important;
          padding: 0.5rem !important;
          border-radius: 13px !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3 > div:last-child:nth-child(odd) {
          grid-column: auto !important;
        }

        /* With five cards: card 4 and 5 share the second row cleanly. */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3 > div:nth-child(4) {
          grid-column: 1 / 2 !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3 > div:nth-child(5) {
          grid-column: 2 / 4 !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3 .h-11.w-11 {
          width: 1.75rem !important;
          height: 1.75rem !important;
          border-radius: 10px !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3 .text-3xl {
          font-size: 1.05rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3 p {
          font-size: 0.8125rem !important;
          line-height: 1.18 !important;
        }

        /* Keep the create form wide, but reduce card chrome/padding. */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div {
          padding: 0.58rem !important;
          border-radius: 14px !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form h3,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div h3 {
          font-size: 0.98rem !important;
          line-height: 1.12 !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form h3 + p,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div h3 + p {
          font-size: 0.8125rem !important;
          line-height: 1.35 !important;
        }

        /* Inputs still get proper tap height, just slightly denser. */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form input,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form textarea,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article input,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article textarea {
          padding: 0.58rem 0.65rem !important;
          border-radius: 12px !important;
          font-size: 0.8125rem !important;
          line-height: 1.35 !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form input,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form .relative.mt-2 > button,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article .relative.mt-2 > button {
          min-height: 45px !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form textarea,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article textarea {
          min-height: 86px !important;
        }

        /* Active response cards are visibly smaller but still readable. */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div .max-h-\[1120px\].min-h-\[720px\] {
          padding: 0.35rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article {
          padding: 0.58rem !important;
          border-radius: 13px !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article + article {
          margin-top: 0.45rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article .flex.flex-wrap.items-center.gap-2 > span {
          padding: 0.28rem 0.42rem !important;
          font-size: 0.8125rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article p.text-base {
          font-size: 0.8125rem !important;
          line-height: 1.35 !important;
        }

        /* Compact owner/follow-up info. */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article .mt-4.flex.flex-col.gap-3.border-t > div {
          gap: 0.35rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article .mt-4.flex.flex-col.gap-3.border-t > div > div {
          padding: 0.45rem !important;
          border-radius: 10px !important;
        }

        /* Action buttons slightly smaller, but not tiny. */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form button[type="submit"],
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article > .flex:first-child > button,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article .mt-4.flex.flex-col.gap-3.border-t > button {
          min-height: 42px !important;
          border-radius: 11px !important;
          font-size: 0.8125rem !important;
        }

        /* Tracker typography: compact, but not microscopic. */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking label {
          font-size: 0.8125rem !important;
          line-height: 1.15 !important;
          letter-spacing: 0.055em !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking .text-sm {
          font-size: 0.8125rem !important;
          line-height: 1.35 !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking .text-xs {
          font-size: 0.8125rem !important;
          line-height: 1.28 !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking .text-\[11px\] {
          font-size: 0.8125rem !important;
          line-height: 1.22 !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking .text-\[10px\] {
          font-size: 0.8125rem !important;
          line-height: 1.18 !important;
        }
      }

      /* On very small phones, revert the status counters to 2 columns. */
      @media (max-width: 374px) {
        .supervisor-mobile-compact .supervisor-action-command-mobile {
          width: calc(100% + 0.3rem) !important;
          max-width: calc(100% + 0.3rem) !important;
          margin-left: -0.15rem !important;
          margin-right: -0.15rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3 {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3 > div:nth-child(4),
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3 > div:nth-child(5) {
          grid-column: auto !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3 > div:last-child:nth-child(odd) {
          grid-column: 1 / -1 !important;
        }
      }


      /* =========================================================
         ACTION COMMAND CENTER — NEAR EDGE-TO-EDGE MOBILE WIDTH
         ========================================================= */
      @media (max-width: 639px) {
        /* Pull the entire Response Coordination workspace outward
           into the page gutters for substantially more usable width. */
        .supervisor-mobile-compact #response-action-center {
          width: calc(100% + 0.9rem) !important;
          max-width: calc(100% + 0.9rem) !important;
          margin-left: -0.45rem !important;
          margin-right: -0.45rem !important;
          overflow: visible !important;
        }

        .supervisor-mobile-compact #response-action-center > section {
          width: 100% !important;
          max-width: 100% !important;
          padding: 0.3rem !important;
          border-radius: 16px !important;
        }

        /* Keep the introductory heading aligned with the content while
           the tracker itself uses nearly every available pixel. */
        .supervisor-mobile-compact #response-action-center > section > .relative.z-\[1\] > .flex:first-child {
          padding: 0.35rem 0.3rem 0 !important;
        }

        .supervisor-mobile-compact #response-action-center > section > .relative.z-\[1\] > .supervisor-priority-suggestions {
          margin-left: 0.25rem !important;
          margin-right: 0.25rem !important;
        }

        /* Tracker becomes essentially full-width inside the widened panel. */
        .supervisor-mobile-compact .supervisor-action-command-mobile {
          width: calc(100% + 0.1rem) !important;
          max-width: calc(100% + 0.1rem) !important;
          margin-left: -0.05rem !important;
          margin-right: -0.05rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking {
          width: 100% !important;
          max-width: 100% !important;
          border-radius: 14px !important;
        }

        /* Trim decorative chrome before shrinking actual form controls. */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.overflow-hidden.bg-gradient-to-br {
          padding: 0.5rem !important;
          border-radius: 13px !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 {
          padding: 0.3rem !important;
        }

        /* Give dense status cards more horizontal space. */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3 {
          gap: 0.28rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3 > div {
          padding: 0.46rem !important;
          border-radius: 12px !important;
        }

        /* Create + active-response cards also use almost all tracker width. */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div {
          width: 100% !important;
          max-width: 100% !important;
          padding: 0.48rem !important;
          border-radius: 12px !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div .max-h-\[1120px\].min-h-\[720px\] {
          padding: 0.22rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article {
          padding: 0.5rem !important;
          border-radius: 12px !important;
        }

        /* Preserve comfortable touch areas even though the overall board is denser. */
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form input,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form .relative.mt-2 > button,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article input,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article .relative.mt-2 > button {
          min-height: 44px !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form button[type="submit"],
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article > .flex:first-child > button,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article .mt-4.flex.flex-col.gap-3.border-t > button {
          min-height: 42px !important;
        }
      }

      /* Very narrow phones still get extra width, but not enough to touch
         the physical viewport edges. */
      @media (max-width: 374px) {
        .supervisor-mobile-compact #response-action-center {
          width: calc(100% + 0.6rem) !important;
          max-width: calc(100% + 0.6rem) !important;
          margin-left: -0.3rem !important;
          margin-right: -0.3rem !important;
        }

        .supervisor-mobile-compact #response-action-center > section {
          padding: 0.25rem !important;
        }
      }


      /* =========================================================
         ACTION COMMAND CENTER — TRUE FULL-WIDTH MOBILE BREAKOUT
         Fixes the real cause of the thin appearance:
         root clipping + multiple nested padded containers.
         ========================================================= */
      @media (max-width: 639px) {
        .supervisor-mobile-compact {
          overflow-x: visible !important;
          max-width: none !important;
        }

        .supervisor-mobile-compact #response-action-center {
          position: relative !important;
          width: calc(100vw - 0.5rem) !important;
          max-width: calc(100vw - 0.5rem) !important;
          margin-left: calc(50% - 50vw + 0.25rem) !important;
          margin-right: 0 !important;
          overflow: visible !important;
        }

        .supervisor-mobile-compact #response-action-center > section {
          width: 100% !important;
          max-width: 100% !important;
          overflow: visible !important;
          padding: 0.2rem !important;
          border-radius: 15px !important;
        }

        .supervisor-mobile-compact #response-action-center > section > .relative.z-\[1\] {
          width: 100% !important;
          min-width: 0 !important;
        }

        .supervisor-mobile-compact #response-action-center > section > .relative.z-\[1\] > .flex:first-child {
          padding: 0.45rem 0.45rem 0 !important;
          gap: 0.5rem !important;
        }

        .supervisor-mobile-compact #response-action-center h2 {
          font-size: 1.15rem !important;
          line-height: 1.12 !important;
        }

        .supervisor-mobile-compact #response-action-center h2 + p {
          max-width: none !important;
          font-size: 0.8125rem !important;
          line-height: 1.38 !important;
        }

        .supervisor-mobile-compact #response-action-center .supervisor-priority-suggestions {
          margin-left: 0.3rem !important;
          margin-right: 0.3rem !important;
          gap: 0.38rem !important;
        }

        .supervisor-mobile-compact #response-action-center > section > .relative.z-\[1\] > .mt-5.rounded-\[28px\] {
          width: calc(100% + 0.05rem) !important;
          max-width: calc(100% + 0.05rem) !important;
          margin-top: 0.55rem !important;
          margin-left: -0.025rem !important;
          margin-right: -0.025rem !important;
          padding: 0.12rem !important;
          border-radius: 12px !important;
          overflow: visible !important;
          background: rgba(255, 255, 255, 0.5) !important;
        }

        html.dark .supervisor-mobile-compact #response-action-center > section > .relative.z-\[1\] > .mt-5.rounded-\[28px\] {
          background: rgba(2, 6, 23, 0.34) !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          margin: 0 !important;
          border-radius: 11px !important;
          overflow: visible !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.overflow-hidden.bg-gradient-to-br {
          width: 100% !important;
          padding: 0.42rem !important;
          border-radius: 11px !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 {
          width: 100% !important;
          padding: 0.2rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div {
          width: 100% !important;
          max-width: 100% !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
          padding: 0.42rem !important;
          border-radius: 11px !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div .relative.mt-5.overflow-hidden.rounded-\[32px\] {
          margin-top: 0.45rem !important;
          border-radius: 10px !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div .max-h-\[1120px\].min-h-\[720px\] {
          padding: 0.14rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article {
          width: 100% !important;
          max-width: 100% !important;
          padding: 0.46rem !important;
          border-radius: 11px !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3 {
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          gap: 0.3rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3 > div {
          min-width: 0 !important;
          min-height: 78px !important;
          padding: 0.42rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form input,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form .relative.mt-2 > button,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article input,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article .relative.mt-2 > button {
          min-height: 44px !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form button[type="submit"],
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article > .flex:first-child > button,
        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form + div article .mt-4.flex.flex-col.gap-3.border-t > button {
          min-height: 42px !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking form .absolute.left-0.right-0.z-\[90\] {
          width: 100% !important;
          max-width: calc(100vw - 1.5rem) !important;
        }
      }

      @media (max-width: 374px) {
        .supervisor-mobile-compact #response-action-center {
          width: calc(100vw - 0.375rem) !important;
          max-width: calc(100vw - 0.375rem) !important;
          margin-left: calc(50% - 50vw + 0.1875rem) !important;
        }

        .supervisor-mobile-compact #response-action-center > section {
          padding: 0.15rem !important;
        }

        .supervisor-mobile-compact .supervisor-action-command-mobile #decision-action-tracking > .relative.p-5 > .grid.gap-3 {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }
      }


      /* =========================================================
         CREATE RESPONSE ACTION — FULL-WIDTH MOBILE FIX
         Targets the ACTUAL internal DecisionActionTracker structure:
         .mt-6.grid.gap-6.xl:grid-cols-[minmax(360px,0.84fr)_...]
         ========================================================= */
      @media (max-width: 639px) {
        /* The internal create-action / active-tracker workspace.
           Previous selectors missed this exact wrapper. */
        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid {
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) !important;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          gap: 0.45rem !important;
          margin-top: 0.45rem !important;
          padding: 0 !important;
        }

        /* CREATE RESPONSE ACTION CARD:
           use essentially all of the tracker's available width. */
        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form {
          grid-column: 1 / -1 !important;
          width: calc(100% + 0.18rem) !important;
          max-width: calc(100% + 0.18rem) !important;
          min-width: 0 !important;
          justify-self: stretch !important;
          margin-left: -0.09rem !important;
          margin-right: -0.09rem !important;
          padding: 0.42rem !important;
          border-radius: 11px !important;
          overflow: visible !important;
        }

        /* Header inside Create response action */
        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form
        > .relative
        > .flex.items-start.gap-3 {
          gap: 0.5rem !important;
        }

        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form
        > .relative
        > .flex.items-start.gap-3
        > .h-12.w-12 {
          width: 2.15rem !important;
          height: 2.15rem !important;
          border-radius: 11px !important;
        }

        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form h3 {
          font-size: 1rem !important;
          line-height: 1.15 !important;
        }

        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form h3 + p {
          font-size: 0.8125rem !important;
          line-height: 1.35 !important;
        }

        /* Suggested priority / forecast recommendation card was another
           padded layer making the form look narrower than it really was. */
        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form
        > .relative
        > .mt-5.rounded-\[24px\] {
          width: 100% !important;
          max-width: 100% !important;
          margin-top: 0.5rem !important;
          padding: 0.48rem !important;
          border-radius: 11px !important;
        }

        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form
        > .relative
        > .mt-5.rounded-\[24px\]
        > .flex:first-child {
          gap: 0.45rem !important;
        }

        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form
        > .relative
        > .mt-5.rounded-\[24px\]
        > .flex:first-child
        > span {
          max-width: 44% !important;
          padding: 0.28rem 0.4rem !important;
          font-size: 0.8125rem !important;
          line-height: 1.12 !important;
          white-space: normal !important;
          text-align: center !important;
        }

        /* Recommendation selector itself uses full card width. */
        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form
        > .relative
        > .mt-5.rounded-\[24px\]
        .relative.mt-3 {
          width: 100% !important;
        }

        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form
        > .relative
        > .mt-5.rounded-\[24px\]
        .relative.mt-3
        > button {
          width: 100% !important;
          min-width: 0 !important;
          min-height: 45px !important;
          padding: 0.5rem 0.55rem !important;
          border-radius: 11px !important;
        }

        /* All form field groups take full width.
           Use the width gained from removing layers rather than tiny fields. */
        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form
        .grid {
          width: 100% !important;
          max-width: 100% !important;
          grid-template-columns: minmax(0, 1fr) !important;
          gap: 0.48rem !important;
        }

        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form
        .grid
        > * {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
        }

        /* Inputs / selects / textareas fully fill every field group. */
        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form input,
        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form textarea,
        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form .relative.mt-2,
        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form .relative.mt-2
        > button {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
        }

        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form input,
        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form .relative.mt-2
        > button {
          min-height: 45px !important;
          padding: 0.52rem 0.58rem !important;
          border-radius: 11px !important;
        }

        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form textarea {
          min-height: 84px !important;
          padding: 0.55rem 0.58rem !important;
          border-radius: 11px !important;
        }

        /* Drop-down menus match the new field width. */
        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form
        .relative.mt-2
        > .absolute {
          left: 0 !important;
          right: 0 !important;
          width: 100% !important;
          max-width: calc(100vw - 1rem) !important;
          border-radius: 12px !important;
        }

        /* Save Action Record fills the widened form. */
        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form button[type="submit"] {
          width: 100% !important;
          min-width: 0 !important;
          min-height: 44px !important;
          margin-top: 0.5rem !important;
          padding: 0.55rem 0.65rem !important;
          border-radius: 11px !important;
          font-size: 0.8125rem !important;
        }

        /* Active Response Tracker, the second child in the same internal grid,
           also stays full width so both halves align perfectly. */
        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form
        + div {
          grid-column: 1 / -1 !important;
          width: calc(100% + 0.18rem) !important;
          max-width: calc(100% + 0.18rem) !important;
          min-width: 0 !important;
          justify-self: stretch !important;
          margin-left: -0.09rem !important;
          margin-right: -0.09rem !important;
        }
      }

      @media (max-width: 374px) {
        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form,
        .supervisor-mobile-compact
        .supervisor-action-command-mobile
        #decision-action-tracking
        > .relative.p-5
        > .mt-6.grid
        > form
        + div {
          width: 100% !important;
          max-width: 100% !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
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
              <InformationTypeBadge type="decision" className="border-amber-300/20 bg-amber-300/10 text-amber-100 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100" />
            </div>

            <h1 className="dengue-hero-title mt-6 max-w-3xl text-[2.15rem] font-bold leading-[1.08] tracking-[-0.035em] text-white drop-shadow-[0_5px_24px_rgba(2,6,23,0.65)] sm:text-[3rem] xl:text-[3.55rem]">
              City-wide dengue oversight for faster coordinated decisions.
            </h1>

            <p className="dengue-hero-copy mt-5 max-w-2xl text-sm font-medium leading-7 text-slate-200/90 sm:text-[15px] sm:leading-8">
              Review barangay risk levels, forecast readiness, response assignments, and resource priorities from one coordinated supervisor workspace.
            </p>

            <div className="supervisor-hero-actions mt-7 flex flex-wrap gap-3">
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
                { label: 'Forecast cases', value: formatNumber(totalProjectedCases || dashboardStats?.fourWeekForecast || 0), icon: TrendingUp },
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

          <div className="supervisor-top-priority-wrap w-full self-end justify-self-end lg:max-w-[410px]">
            <div className={`group/top-priority relative overflow-hidden rounded-[32px] border border-white/15 bg-gradient-to-br ${topTone.heroCard} p-5 text-white shadow-[0_30px_78px_rgba(2,6,23,0.54)] ring-1 ring-white/10 backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:border-white/25 sm:p-6`}>
              <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${topTone.gradient}`} />
              <div className={`pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full ${topTone.glow} blur-3xl`} />

              <div className="relative flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/70">Current top priority</p>
                    <InformationTypeBadge type="decision" className="border-amber-300/20 bg-amber-300/10 text-amber-100 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100" />
                  </div>
                  <h2 className="mt-2 break-words text-3xl font-black leading-tight tracking-[-0.04em]">{topPriority?.barangay || 'No barangay ranked'}</h2>
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
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Forecast cases</p>
                    <InformationTypeBadge type="forecast" className="border-violet-300/20 bg-violet-300/10 text-violet-100 dark:border-violet-300/20 dark:bg-violet-300/10 dark:text-violet-100" />
                  </div>
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

          <div className="supervisor-ai-metrics grid w-full gap-3 sm:grid-cols-3 lg:w-auto lg:min-w-[430px]">
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

          <div className="supervisor-priority-suggestions mt-5 grid gap-3 sm:grid-cols-3">
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
            <div className="supervisor-action-command-mobile"><DecisionActionTracker priorityRows={sortedRows.slice(0, 10)} /></div>
          </div>
        </PremiumPanel>
      </section>

      <div className="supervisor-field-review-wrap"><FieldUpdateReviewPanel /></div>

      <section className="supervisor-ranking-layout grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <PremiumPanel tone="blue" className="supervisor-ranking-panel p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <SectionBadge icon={BarChart3} tone="blue">City-wide risk ranking</SectionBadge>
                <InformationTypeBadge type="decision" />
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-white">Barangay priority ranking</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted dark:text-slate-400">Sorted by saved priority rank, risk level, overall combined priority score, and forecast cases.</p>
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
                    <th className="px-4 py-3.5">Combined priority score</th>
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

        <div className="supervisor-side-stack space-y-5">
          <PremiumPanel tone="emerald" className="supervisor-priority-panel p-5 sm:p-6">
            <SectionBadge icon={ClipboardCheck} tone="emerald">Planning priorities</SectionBadge>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-white">Supervisor decision guide</h2>

            <div className="supervisor-decision-guide-list mt-5 space-y-3">
              {[
                { number: '01', title: 'Immediate response', text: 'Prioritize high-risk barangays for cleanup, vector control, field validation, and public advisories.', tone: 'rose' },
                { number: '02', title: 'Preventive monitoring', text: 'Review moderate-risk barangays for early warning, inspections, and possible escalation.', tone: 'amber' },
                { number: '03', title: 'Evidence-based allocation', text: 'Use recorded data, forecast results, field reports, and map context before assigning staff, supplies, and schedules.', tone: 'blue' },
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
