import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import SectionTitle from '../components/SectionTitle'
import StatCard from '../components/StatCard'
import SparkChart from '../components/SparkChart'
import { useData } from '../context/DataContext'
import { riskStyles } from '../utils/analytics'

const actionRoutes = {
  'Upload data': '/upload',
  'Run forecast': '/forecast',
  'Open map': '/map',
  'Generate report': '/reports',
}

const actions = [
  [
    'Upload data',
    'Import case, weather, demographic, and boundary records',
    'border-blue-100 bg-gradient-to-r from-blue-50 to-sky-50 text-brand-blue dark:border-blue-500/20 dark:from-blue-500/10 dark:to-slate-900 dark:text-blue-300',
  ],
  [
    'Run forecast',
    'Generate dengue risk projections from current records',
    'border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50 text-brand-orange dark:border-amber-500/20 dark:from-amber-500/10 dark:to-slate-900 dark:text-amber-300',
  ],
  [
    'Open map',
    'View hotspot barangays and risk distribution',
    'border-teal-100 bg-gradient-to-r from-teal-50 to-cyan-50 text-brand-teal dark:border-teal-500/20 dark:from-teal-500/10 dark:to-slate-900 dark:text-teal-300',
  ],
  [
    'Generate report',
    'Prepare monitoring summary for review and planning',
    'border-emerald-100 bg-gradient-to-r from-emerald-50 to-green-50 text-brand-green dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-slate-900 dark:text-emerald-300',
  ],
]

function formatNumber(value) {
  return new Intl.NumberFormat('en-PH').format(Number(value || 0))
}

function getTrendStatus(values = []) {
  if (!values.length) {
    return {
      label: 'No data',
      style:
        'border-slate-200 bg-slate-50 text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    }
  }

  const latest = values[values.length - 1] || 0
  const previous = values[values.length - 2] || 0

  if (latest > previous) {
    return {
      label: 'Rising',
      style:
        'border-rose-100 bg-rose-50 text-brand-red dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
    }
  }

  if (latest < previous) {
    return {
      label: 'Decreasing',
      style:
        'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
    }
  }

  return {
    label: 'Stable',
    style:
      'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
  }
}

function getStatusStyle(badge = '') {
  const value = String(badge).toLowerCase()

  if (value.includes('review')) {
    return 'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
  }

  if (value.includes('sample')) {
    return 'border-blue-100 bg-blue-50 text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300'
  }

  if (value.includes('validated') || value.includes('uploaded')) {
    return 'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
  }

  return 'border-slate-200 bg-slate-100 text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

function getRiskBadgeStyle(risk) {
  if (risk === 'High') {
    return `${riskStyles[risk]} dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300`
  }

  if (risk === 'Moderate') {
    return `${riskStyles[risk]} dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300`
  }

  if (risk === 'Low') {
    return `${riskStyles[risk]} dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300`
  }

  return 'border-slate-200 bg-slate-100 text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

function hasBackendForecastData(backendForecastResult) {
  return (
    Array.isArray(backendForecastResult?.forecast_results) &&
    backendForecastResult.forecast_results.length > 0
  )
}

function buildBackendPriorityRows(backendForecastResult = null) {
  const backendRows = backendForecastResult?.forecast_results || []

  return backendRows
    .map((row) => ({
      barangay: row.barangay || 'Unspecified barangay',
      forecast: Number(row.forecast_next_4_periods || 0),
      risk: row.risk_level || 'Low',
      priorityRank: Number(row.priority_rank || 0),
      recommendation: row.recommendation || '',
      historicalTotalCases: Number(row.historical_total_cases || 0),
      latestPeriod: row.latest_period || '',
      trendDirection: row.trend_direction || 'Stable',
    }))
    .sort((a, b) => {
      if (a.priorityRank && b.priorityRank) {
        return a.priorityRank - b.priorityRank
      }

      return b.forecast - a.forecast
    })
}

function buildBackendWeeklyTotals(backendForecastResult = null) {
  const backendRows = backendForecastResult?.forecast_results || []

  if (!backendRows.length) return []

  const previousAverageTotal = backendRows.reduce((sum, row) => {
    return sum + Number(row.previous_average_cases || 0)
  }, 0)

  const recentAverageTotal = backendRows.reduce((sum, row) => {
    return sum + Number(row.recent_average_cases || 0)
  }, 0)

  const nextPeriodTotal = backendRows.reduce((sum, row) => {
    return sum + Number(row.forecast_next_period || 0)
  }, 0)

  return [
    Math.round(previousAverageTotal),
    Math.round(recentAverageTotal),
    Math.round(nextPeriodTotal),
    Math.round(nextPeriodTotal),
    Math.round(nextPeriodTotal),
    Math.round(nextPeriodTotal),
  ]
}

function buildBackendDashboardStats(backendForecastResult = null, backendDengueSummary = null) {
  const backendRows = backendForecastResult?.forecast_results || []
  const riskCounts = backendForecastResult?.risk_counts || {}

  const originalRowCount = Number(backendForecastResult?.original_row_count || 0)
  const validRowCount = Number(backendForecastResult?.valid_row_count || 0)

  const totalCases =
    Number(backendDengueSummary?.total_cases || 0) ||
    backendRows.reduce((sum, row) => {
      return sum + Number(row.historical_total_cases || 0)
    }, 0)

  const fourWeekForecast =
    Number(backendForecastResult?.total_forecast_next_4_periods || 0) ||
    backendRows.reduce((sum, row) => {
      return sum + Number(row.forecast_next_4_periods || 0)
    }, 0)

  const highRiskCount =
    Number(riskCounts.High || 0) ||
    backendRows.filter((row) => row.risk_level === 'High').length

  const dataQuality =
    originalRowCount > 0
      ? Math.round((validRowCount / originalRowCount) * 100)
      : 0

  return {
    totalCases,
    highRiskCount,
    fourWeekForecast,
    dataQuality,
  }
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const {
    dashboardStats = {},
    riskRows = [],
    sourceStatus = {},
    activityLogs = [],
    backendForecastResult = null,
    backendDengueSummary = null,
    resetSampleData,
  } = useData()

  const usingBackendForecast = hasBackendForecastData(backendForecastResult)

  const backendPriorityRows = useMemo(() => {
    return buildBackendPriorityRows(backendForecastResult)
  }, [backendForecastResult])

  const backendWeeklyTotals = useMemo(() => {
    return buildBackendWeeklyTotals(backendForecastResult)
  }, [backendForecastResult])

  const backendDashboardStats = useMemo(() => {
    return buildBackendDashboardStats(backendForecastResult, backendDengueSummary)
  }, [backendForecastResult, backendDengueSummary])

  const displayStats = usingBackendForecast
    ? backendDashboardStats
    : {
        totalCases: dashboardStats.totalCases || 0,
        highRiskCount: dashboardStats.highRiskCount || 0,
        fourWeekForecast: dashboardStats.fourWeekForecast || 0,
        dataQuality: dashboardStats.dataQuality || 0,
      }

  const weeklyTotals = usingBackendForecast
    ? backendWeeklyTotals
    : dashboardStats?.weeklyTotals || []

  const priority = usingBackendForecast
    ? backendPriorityRows.slice(0, 5)
    : riskRows.slice(0, 5)

  const latestLogs = activityLogs.slice(0, 3)
  const trendStatus = getTrendStatus(weeklyTotals)

  const alertCards = useMemo(() => {
    const highestRisk = priority[0]
    const highRiskCount = priority.filter((row) => row.risk === 'High').length

    return [
      {
        title: highestRisk ? `${highestRisk.risk} risk` : 'No risk data',
        message: highestRisk
          ? `${highestRisk.barangay} has the highest projected value with ${formatNumber(highestRisk.forecast)} projected cases.`
          : 'Upload dengue records to generate priority alerts.',
        style: highestRisk?.risk === 'High'
          ? 'border-rose-100 bg-rose-50/70 dark:border-rose-500/20 dark:bg-rose-500/10'
          : 'border-blue-100 bg-blue-50/70 dark:border-blue-500/20 dark:bg-blue-500/10',
      },
      {
        title: usingBackendForecast ? 'Backend forecast active' : 'Data readiness',
        message: usingBackendForecast
          ? `Dashboard values are using the FastAPI backend forecast from ${backendForecastResult?.filename || sourceStatus?.dengue?.uploadedName || 'the uploaded dataset'}.`
          : `${Object.keys(sourceStatus || {}).length} data sources are available in the prototype workspace.`,
        style:
          'border-blue-100 bg-blue-50/70 dark:border-blue-500/20 dark:bg-blue-500/10',
      },
      {
        title: 'Monitoring priority',
        message: `${highRiskCount} barangay${highRiskCount === 1 ? '' : 's'} currently require closer monitoring.`,
        style: highRiskCount > 0
          ? 'border-amber-100 bg-amber-50/70 dark:border-amber-500/20 dark:bg-amber-500/10'
          : 'border-emerald-100 bg-emerald-50/70 dark:border-emerald-500/20 dark:bg-emerald-500/10',
      },
    ]
  }, [
    priority,
    sourceStatus,
    usingBackendForecast,
    backendForecastResult,
  ])

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Dashboard Overview"
        subtitle={
          usingBackendForecast
            ? 'Quick status, backend forecast totals, priority barangays, and data readiness from the uploaded dengue dataset.'
            : 'Quick status, dengue trends, priority barangays, and data readiness from the current working dataset.'
        }
      />

      <div
        id="dashboard-summary"
        className="scroll-mt-28 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <div className="rounded-[28px] border border-brand-line/70 bg-white/80 p-1 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/80 dark:shadow-none">
          <StatCard
            title="Total cases"
            value={formatNumber(displayStats.totalCases)}
            color="blue"
          />
        </div>

        <div className="rounded-[28px] border border-brand-line/70 bg-white/80 p-1 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/80 dark:shadow-none">
          <StatCard
            title="High-risk barangays"
            value={formatNumber(displayStats.highRiskCount)}
            color="red"
          />
        </div>

        <div className="rounded-[28px] border border-brand-line/70 bg-white/80 p-1 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/80 dark:shadow-none">
          <StatCard
            title="Forecast total"
            value={formatNumber(displayStats.fourWeekForecast)}
            color="orange"
          />
        </div>

        <div className="rounded-[28px] border border-brand-line/70 bg-white/80 p-1 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/80 dark:shadow-none">
          <StatCard
            title="Data quality"
            value={`${displayStats.dataQuality}%`}
            color="green"
          />
        </div>
      </div>

      {usingBackendForecast && (
        <div className="rounded-[24px] border border-emerald-100 bg-emerald-50/70 px-5 py-4 text-sm leading-6 text-brand-green shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          <span className="font-bold">Backend forecast loaded:</span>{' '}
          Dashboard totals, risk ranking, trend chart, and priority alerts are now using the FastAPI forecast output from{' '}
          {backendForecastResult?.filename || sourceStatus?.dengue?.uploadedName || 'the uploaded dengue dataset'}.
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.85fr]">
        <div className="rounded-[30px] border border-brand-line/70 bg-white/90 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.07)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-2 inline-flex rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-600 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
                Trend analysis
              </div>

              <h3 className="text-xl font-bold tracking-tight text-brand-text dark:text-slate-100">
                Dengue trend
              </h3>

              <p className="mt-1 text-sm text-brand-muted dark:text-slate-400">
                {usingBackendForecast
                  ? 'Projected case values generated from the backend baseline forecast.'
                  : 'Weekly case values recalculated from uploaded or sample dengue records.'}
              </p>
            </div>

            <span className={`rounded-full border px-4 py-1.5 text-xs font-semibold shadow-sm ${trendStatus.style}`}>
              {trendStatus.label}
            </span>
          </div>

          <div className="mt-5 rounded-[24px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3.5 text-sm text-brand-text shadow-sm dark:border-slate-700 dark:from-slate-950 dark:to-slate-900 dark:text-slate-300 dark:shadow-none">
            <span className="font-semibold text-brand-text dark:text-slate-100">
              Chart guide:
            </span>{' '}
            {usingBackendForecast
              ? 'Values represent previous average, recent average, and projected forecast periods from the backend output.'
              : 'Each point represents a reporting period. Values update after historical dengue data is uploaded and validated.'}
          </div>

          <div className="mt-5 rounded-[28px] border border-slate-100 bg-gradient-to-b from-white to-slate-50 p-4 shadow-inner dark:border-slate-800 dark:from-slate-950 dark:to-slate-900 dark:shadow-none">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-muted dark:text-slate-500">
                Weekly dengue case values
              </div>

              <div className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-brand-muted dark:bg-slate-800 dark:text-slate-300">
                {usingBackendForecast ? 'Backend forecast' : 'Last 6 periods'}
              </div>
            </div>

            <div className="h-[250px]">
              {weeklyTotals.length > 0 ? (
                <SparkChart values={weeklyTotals} />
              ) : (
                <div className="flex h-full items-center justify-center rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-5 text-center text-sm leading-6 text-brand-muted dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                  No chart available until dengue records are loaded.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-[30px] border border-brand-line/70 bg-white/90 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.07)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none">
          <div className="mb-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Risk ranking
          </div>

          <h3 className="text-xl font-bold tracking-tight text-brand-text dark:text-slate-100">
            Priority barangays
          </h3>

          <p className="mt-1 text-sm text-brand-muted dark:text-slate-400">
            {usingBackendForecast
              ? 'Ranked from the backend baseline forecast priority output.'
              : 'Ranked from the current computed dengue risk score.'}
          </p>

          <div className="mt-5 space-y-3">
            {priority.length > 0 ? (
              priority.map((row, index) => (
                <div
                  key={`${row.barangay}-${index}`}
                  className="group flex items-center justify-between rounded-[22px] border border-brand-line bg-gradient-to-r from-slate-50 to-white px-4 py-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:from-slate-950 dark:to-slate-900 dark:shadow-none dark:hover:shadow-none"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-bold text-brand-text shadow-sm dark:bg-slate-800 dark:text-slate-100 dark:shadow-none">
                      {index + 1}
                    </div>

                    <div>
                      <span className="font-semibold text-brand-text dark:text-slate-100">
                        {row.barangay}
                      </span>

                      <p className="text-xs text-brand-muted dark:text-slate-400">
                        Forecast: {formatNumber(row.forecast)} cases
                      </p>

                      {usingBackendForecast && row.trendDirection && (
                        <p className="mt-0.5 text-[11px] text-brand-muted dark:text-slate-500">
                          Trend: {row.trendDirection}
                        </p>
                      )}
                    </div>
                  </div>

                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getRiskBadgeStyle(row.risk)}`}>
                    {row.risk}
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-[22px] border border-slate-100 bg-slate-50 p-4 text-sm text-brand-muted dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                No barangay risk ranking available yet.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_0.85fr_1fr]">
        <div className="rounded-[30px] border border-brand-line/70 bg-white/90 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.07)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none">
          <div className="mb-2 inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
            Navigation
          </div>

          <h3 className="text-xl font-bold tracking-tight text-brand-text dark:text-slate-100">
            Quick actions
          </h3>

          <div className="mt-5 space-y-3">
            {actions.map(([label, desc, style]) => (
              <button
                key={label}
                type="button"
                onClick={() => navigate(actionRoutes[label])}
                className={`w-full rounded-[22px] border px-4 py-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:shadow-none dark:hover:shadow-none ${style}`}
              >
                <div className="text-sm font-semibold">{label}</div>
                <div className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                  {desc}
                </div>
              </button>
            ))}

            <button
              type="button"
              onClick={resetSampleData}
              className="w-full rounded-[22px] border border-slate-200 bg-white px-4 py-4 text-left text-slate-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:shadow-none dark:hover:bg-slate-900 dark:hover:shadow-none"
            >
              <div className="text-sm font-semibold">Reset sample data</div>
              <div className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                Restore the prototype workspace to default demo records.
              </div>
            </button>
          </div>
        </div>

        <div className="rounded-[30px] border border-brand-line/70 bg-white/90 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.07)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none">
          <div className="mb-2 inline-flex rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
            Live updates
          </div>

          <h3 className="text-xl font-bold tracking-tight text-brand-text dark:text-slate-100">
            Recent alerts
          </h3>

          <div className="mt-5 space-y-4">
            {alertCards.map((alert) => (
              <div
                key={alert.title}
                className={`rounded-[22px] border p-4 ${alert.style}`}
              >
                <p className="text-sm font-semibold text-brand-text dark:text-slate-100">
                  {alert.title}
                </p>

                <p className="mt-1 text-sm text-brand-muted dark:text-slate-400">
                  {alert.message}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[30px] border border-brand-line/70 bg-white/90 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.07)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none">
          <div className="mb-2 inline-flex rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
            Data readiness
          </div>

          <h3 className="text-xl font-bold tracking-tight text-brand-text dark:text-slate-100">
            System summary
          </h3>

          <div className="mt-5 space-y-3">
            {Object.entries(sourceStatus || {}).map(([key, item]) => (
              <div
                key={key}
                className="flex items-start justify-between gap-3 rounded-[20px] border border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-3 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-slate-900 dark:shadow-none"
              >
                <div>
                  <p className="text-sm font-semibold capitalize text-brand-text dark:text-slate-100">
                    {key}
                  </p>

                  <p className="text-xs text-brand-muted dark:text-slate-400">
                    {item.uploadedName || 'No file uploaded'}
                  </p>

                  <p className="mt-1 text-[11px] text-brand-muted dark:text-slate-500">
                    {item.validCount || 0} valid of {item.recordCount || 0} records
                  </p>
                </div>

                <span className={`chip border ${getStatusStyle(item.badge)}`}>
                  {item.badge}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-[30px] border border-brand-line/70 bg-white/90 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.07)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none">
        <div className="mb-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          Activity trail
        </div>

        <h3 className="text-xl font-bold tracking-tight text-brand-text dark:text-slate-100">
          Recent system actions
        </h3>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {latestLogs.length > 0 ? (
            latestLogs.map((log) => (
              <div
                key={log.id}
                className="rounded-[22px] border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-500/20 dark:bg-blue-500/10"
              >
                <p className="text-sm font-semibold text-brand-text dark:text-slate-100">
                  {log.action}
                </p>

                <p className="mt-1 text-xs text-brand-muted dark:text-slate-500">
                  {new Date(log.timestamp).toLocaleString()}
                </p>

                <p className="mt-1 text-sm text-brand-muted dark:text-slate-400">
                  {log.details}
                </p>
              </div>
            ))
          ) : (
            <div className="rounded-[22px] border border-slate-100 bg-slate-50 p-4 text-sm text-brand-muted dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
              No activity recorded yet.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}