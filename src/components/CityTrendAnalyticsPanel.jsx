import { useEffect, useMemo, useState } from 'react'
import { Activity, BarChart3, CalendarDays, Loader2, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import SparkChart from './SparkChart'
import InformationTypeBadge from './InformationTypeBadge'
import { TrendPanelSkeleton } from './SystemSkeleton'
import TrendFilterDropdown from './TrendFilterDropdown'
import TrendMetricCard from './TrendMetricCard'
import { getCityTrendAnalytics } from '../services/api'
import { getUserRole } from '../utils/auth'

const PERIOD_OPTIONS = [
  { value: 'all', label: 'Full year', note: 'Show all recorded months for the selected year' },
  { value: 'q1', label: 'Q1 · Jan–Mar', note: 'First quarter trend' },
  { value: 'q2', label: 'Q2 · Apr–Jun', note: 'Second quarter trend' },
  { value: 'q3', label: 'Q3 · Jul–Sep', note: 'Third quarter trend' },
  { value: 'q4', label: 'Q4 · Oct–Dec', note: 'Fourth quarter trend' },
  { value: 'm1', label: 'January', note: 'Recorded cases for January' },
  { value: 'm2', label: 'February', note: 'Recorded cases for February' },
  { value: 'm3', label: 'March', note: 'Recorded cases for March' },
  { value: 'm4', label: 'April', note: 'Recorded cases for April' },
  { value: 'm5', label: 'May', note: 'Recorded cases for May' },
  { value: 'm6', label: 'June', note: 'Recorded cases for June' },
  { value: 'm7', label: 'July', note: 'Recorded cases for July' },
  { value: 'm8', label: 'August', note: 'Recorded cases for August' },
  { value: 'm9', label: 'September', note: 'Recorded cases for September' },
  { value: 'm10', label: 'October', note: 'Recorded cases for October' },
  { value: 'm11', label: 'November', note: 'Recorded cases for November' },
  { value: 'm12', label: 'December', note: 'Recorded cases for December' },
]

function parsePeriod(value) {
  if (String(value).startsWith('q')) {
    return { quarter: Number(String(value).slice(1)) || null, month: null }
  }

  if (String(value).startsWith('m')) {
    return { quarter: null, month: Number(String(value).slice(1)) || null }
  }

  return { quarter: null, month: null }
}

function formatNumber(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return new Intl.NumberFormat('en-PH').format(number)
}

function movementTone(direction = '') {
  if (direction === 'Increasing') return { tone: 'rose', Icon: TrendingUp }
  if (direction === 'Decreasing') return { tone: 'emerald', Icon: TrendingDown }
  return { tone: 'slate', Icon: Activity }
}

export default function CityTrendAnalyticsPanel({ context = 'dashboard', onAnalyticsChange = null }) {
  const role = getUserRole()
  const canViewCitywide = ['cho', 'admin', 'supervisor', 'viewer'].includes(role)
  const [analytics, setAnalytics] = useState(null)
  const [year, setYear] = useState('')
  const [period, setPeriod] = useState('all')
  const [chartType, setChartType] = useState('line')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const periodParams = useMemo(() => parsePeriod(period), [period])

  useEffect(() => {
    if (!canViewCitywide) return undefined

    let active = true

    async function load() {
      setLoading(true)
      setError('')

      try {
        const result = await getCityTrendAnalytics({
          year: year ? Number(year) : undefined,
          quarter: periodParams.quarter,
          month: periodParams.month,
        })

        if (!active) return
        setAnalytics(result || null)
        onAnalyticsChange?.(result || null)

        const resolvedYear = result?.filters?.year
        if (!year && resolvedYear) setYear(String(resolvedYear))
      } catch (loadError) {
        if (!active) return
        const message = String(loadError?.message || '').toLowerCase()
        setAnalytics(null)
        onAnalyticsChange?.(null)
        setError(
          message.includes('authentication') || message.includes('token')
            ? 'Your session has expired. Please sign in again to refresh the recorded citywide trend.'
            : message.includes('fetch') || message.includes('network') || message.includes('backend')
              ? 'The recorded citywide trend could not be reached. Check that the backend is running, then try again.'
              : 'The recorded citywide trend could not be loaded. Please try again.'
        )
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [canViewCitywide, onAnalyticsChange, periodParams.month, periodParams.quarter, year])

  if (!canViewCitywide) return null
  if (loading && !analytics) return <TrendPanelSkeleton />

  const availableYears = Array.isArray(analytics?.filters?.available_years)
    ? analytics.filters.available_years
    : []
  const yearOptions = availableYears.map((availableYear) => ({
    value: String(availableYear),
    label: String(availableYear),
    note: `Recorded citywide cases for ${availableYear}`,
  }))
  const summary = analytics?.summary || {}
  const monthly = Array.isArray(analytics?.monthly) ? analytics.monthly : []
  const chartValues = monthly.map((row) => Number(row?.cases || 0))
  const chartLabels = monthly.map((row) => row?.month_short || row?.month_label || '')
  const scopeLabel = analytics?.filters?.scope_label || year || 'Selected period'
  const highestMonthLabel = String(period).startsWith('m')
    ? 'Selected month'
    : `Highest month in ${scopeLabel}`
  const peak = summary?.peak_month || null
  const lowest = summary?.lowest_month || null
  const historicalPeak = analytics?.historical_peak || null
  const direction = summary?.trend_direction || 'No comparison'
  const movement = movementTone(direction)
  const MovementIcon = movement.Icon
  const panelTitle = context === 'reports' ? 'Historical dengue trend snapshot' : 'Citywide historical dengue trend'
  const panelDescription = context === 'reports'
    ? 'Recorded citywide cases, highest months, and recent movement for report review. Forecast values are shown separately.'
    : 'Review what actually happened across Butuan City before reading the forecast for future periods below.'

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-sky-200/70 bg-white/85 p-4 shadow-[0_20px_55px_rgba(15,23,42,0.08)] ring-1 ring-white/80 dark:border-sky-400/15 dark:bg-slate-950/65 dark:ring-white/5 sm:rounded-[34px] sm:p-6">
      <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-400/10" />

      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-700 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-200">
              <Activity className="h-3.5 w-3.5" />
              Actual dengue surveillance
            </div>
            <InformationTypeBadge type="recorded" />
          </div>
          <h2 className="mt-3 text-xl font-black tracking-tight text-slate-950 dark:text-white sm:text-2xl">{panelTitle}</h2>
          <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">{panelDescription}</p>
        </div>

        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:w-auto lg:min-w-[440px]">
          <TrendFilterDropdown
            label="Year"
            value={year}
            options={yearOptions}
            onChange={setYear}
            emptyLabel="No years available"
            tone="cyan"
          />

          <TrendFilterDropdown
            label="Period"
            value={period}
            options={PERIOD_OPTIONS}
            onChange={setPeriod}
            emptyLabel="Choose a period"
            tone="amber"
          />
        </div>
      </div>

      {error && (
        <div className="relative mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </div>
      )}

      <div className="relative mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <TrendMetricCard
          label="Actual cases"
          value={loading ? '…' : formatNumber(summary?.total_cases)}
          helper={scopeLabel}
          icon={Activity}
          tone="blue"
          badge="Recorded"
        />

        <TrendMetricCard
          label={highestMonthLabel}
          value={loading ? '…' : (peak?.month_label || 'No data')}
          helper={peak ? `${formatNumber(peak.cases)} recorded cases` : 'No recorded cases'}
          icon={TrendingUp}
          tone="amber"
          badge="Peak"
        />

        <TrendMetricCard
          label="Lowest month"
          value={loading ? '…' : (lowest?.month_label || '—')}
          helper={lowest ? `${formatNumber(lowest.cases)} recorded cases` : 'No monthly record'}
          icon={TrendingDown}
          tone="emerald"
          badge="Lowest"
        />

        <TrendMetricCard
          label="Current movement"
          value={loading ? '…' : direction}
          helper={summary?.change_label || 'No previous month available'}
          icon={MovementIcon}
          tone={movement.tone}
          badge="Trend"
        />
      </div>

      <div className="relative mt-4 overflow-hidden rounded-[24px] border border-cyan-400/15 bg-gradient-to-b from-[#061321] via-[#06111d] to-[#020817] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_70px_rgba(2,8,23,0.42)] sm:rounded-[30px] sm:p-5">
        <div className="mb-3 flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between sm:px-0">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300/80">Recorded citywide trend</p>
              <InformationTypeBadge type="recorded" className="border-cyan-300/20 bg-cyan-300/10 text-cyan-100 dark:border-cyan-300/20 dark:bg-cyan-300/10 dark:text-cyan-100" />
            </div>
            <p className="mt-1 text-xs text-slate-400">Actual recorded cases only. Predictions are shown in forecast sections.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex items-center rounded-xl border border-cyan-400/20 bg-slate-950/45 p-1 shadow-inner"
              role="group"
              aria-label="Historical dengue chart type"
            >
              <button
                type="button"
                onClick={() => setChartType('line')}
                aria-pressed={chartType === 'line'}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-black transition ${
                  chartType === 'line'
                    ? 'bg-cyan-400 text-slate-950 shadow-[0_0_18px_rgba(34,211,238,0.28)]'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <TrendingUp className="h-3.5 w-3.5" />
                Trend
              </button>
              <button
                type="button"
                onClick={() => setChartType('bar')}
                aria-pressed={chartType === 'bar'}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-black transition ${
                  chartType === 'bar'
                    ? 'bg-cyan-400 text-slate-950 shadow-[0_0_18px_rgba(34,211,238,0.28)]'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Bar graph
              </button>
            </div>

            <span className="w-fit rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-bold text-cyan-200">{scopeLabel}</span>
          </div>
        </div>

        <div className="min-h-[300px] w-full sm:min-h-[430px] lg:min-h-[520px]">
          <SparkChart
            values={chartValues}
            labels={chartLabels}
            title="Butuan City actual dengue cases"
            subtitle={`Recorded monthly dengue cases · ${scopeLabel}`}
            emptyLabel="No citywide monthly dengue records for this period"
            loading={loading}
            mode={chartType}
          />
        </div>
      </div>

      <div className="relative mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-[22px] border border-blue-200/70 bg-blue-50/70 p-4 dark:border-blue-400/20 dark:bg-blue-500/10 sm:p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-300" />
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">Simple interpretation</p>
          </div>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-800 dark:text-slate-200">
            {loading ? 'Reading the actual citywide dengue pattern…' : (analytics?.interpretation || 'No trend interpretation is available yet.')}
          </p>
        </div>

        <div className="rounded-[22px] border border-amber-200/70 bg-amber-50/70 p-4 dark:border-amber-400/20 dark:bg-amber-500/10 sm:p-5">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-amber-600 dark:text-amber-300" />
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">Usual peak month</p>
          </div>
          {historicalPeak ? (
            <>
              <p className="mt-2 text-xl font-black text-slate-950 dark:text-white">{historicalPeak.month_label}</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Based on past records, citywide dengue cases are usually highest in {historicalPeak.month_label}.
                <span className="mt-1 block text-xs font-bold text-amber-700/80 dark:text-amber-200/70">Historical monthly average: {historicalPeak.average_cases} cases.</span>
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">A usual peak month cannot be identified from the available records yet.</p>
          )}
        </div>
      </div>

      {loading && (
        <div className="pointer-events-none absolute right-5 top-5 hidden items-center gap-2 rounded-full border border-cyan-200 bg-white/90 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-700 shadow-sm dark:border-cyan-400/20 dark:bg-slate-900/90 dark:text-cyan-200 sm:flex">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Updating
        </div>
      )}
    </section>
  )
}
