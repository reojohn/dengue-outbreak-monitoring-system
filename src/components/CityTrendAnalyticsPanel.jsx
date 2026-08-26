import { useEffect, useMemo, useState } from 'react'
import { Activity, CalendarDays, Loader2, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import SparkChart from './SparkChart'
import InformationTypeBadge from './InformationTypeBadge'
import { TrendPanelSkeleton } from './SystemSkeleton'
import { getCityTrendAnalytics } from '../services/api'
import { getUserRole } from '../utils/auth'

const PERIOD_OPTIONS = [
  { value: 'all', label: 'Full year' },
  { value: 'q1', label: 'Q1 · Jan–Mar' },
  { value: 'q2', label: 'Q2 · Apr–Jun' },
  { value: 'q3', label: 'Q3 · Jul–Sep' },
  { value: 'q4', label: 'Q4 · Oct–Dec' },
  { value: 'm1', label: 'January' },
  { value: 'm2', label: 'February' },
  { value: 'm3', label: 'March' },
  { value: 'm4', label: 'April' },
  { value: 'm5', label: 'May' },
  { value: 'm6', label: 'June' },
  { value: 'm7', label: 'July' },
  { value: 'm8', label: 'August' },
  { value: 'm9', label: 'September' },
  { value: 'm10', label: 'October' },
  { value: 'm11', label: 'November' },
  { value: 'm12', label: 'December' },
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
  if (direction === 'Increasing') {
    return {
      card: 'border-rose-200/80 bg-gradient-to-br from-rose-50 via-white to-orange-50 text-rose-800 dark:border-rose-400/20 dark:from-rose-500/10 dark:via-slate-950 dark:to-orange-500/5 dark:text-rose-200',
      Icon: TrendingUp,
    }
  }

  if (direction === 'Decreasing') {
    return {
      card: 'border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 text-emerald-800 dark:border-emerald-400/20 dark:from-emerald-500/10 dark:via-slate-950 dark:to-teal-500/5 dark:text-emerald-200',
      Icon: TrendingDown,
    }
  }

  return {
    card: 'border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-blue-50 text-slate-800 dark:border-white/10 dark:from-slate-800/70 dark:via-slate-950 dark:to-blue-500/5 dark:text-slate-200',
    Icon: Activity,
  }
}

export default function CityTrendAnalyticsPanel({ context = 'dashboard', onAnalyticsChange = null }) {
  const role = getUserRole()
  const canViewCitywide = ['cho', 'admin', 'supervisor', 'viewer'].includes(role)
  const [analytics, setAnalytics] = useState(null)
  const [year, setYear] = useState('')
  const [period, setPeriod] = useState('all')
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

        <div className="grid w-full grid-cols-2 gap-2 lg:w-auto lg:min-w-[360px]">
          <label className="min-w-0">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Year</span>
            <select
              value={year}
              onChange={(event) => setYear(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-black text-slate-800 outline-none transition focus:border-cyan-400 dark:border-white/10 dark:bg-slate-900 dark:text-white"
            >
              {!availableYears.length && <option value="">No years available</option>}
              {availableYears.map((availableYear) => (
                <option key={availableYear} value={availableYear}>{availableYear}</option>
              ))}
            </select>
          </label>

          <label className="min-w-0">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Period</span>
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-black text-slate-800 outline-none transition focus:border-cyan-400 dark:border-white/10 dark:bg-slate-900 dark:text-white"
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error && (
        <div className="relative mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </div>
      )}

      <div className="relative mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-[22px] border border-blue-200/80 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-4 dark:border-blue-400/20 dark:from-blue-500/10 dark:via-slate-950 dark:to-cyan-500/5">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Actual cases</p>
          <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{loading ? '…' : formatNumber(summary?.total_cases)}</p>
          <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{scopeLabel}</p>
        </div>

        <div className="rounded-[22px] border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-4 dark:border-amber-400/20 dark:from-amber-500/10 dark:via-slate-950 dark:to-orange-500/5">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{highestMonthLabel}</p>
          <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{loading ? '…' : (peak?.month_label || 'No data')}</p>
          <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{peak ? `${formatNumber(peak.cases)} recorded cases` : 'No recorded cases'}</p>
        </div>

        <div className="rounded-[22px] border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4 dark:border-emerald-400/20 dark:from-emerald-500/10 dark:via-slate-950 dark:to-teal-500/5">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Lowest month</p>
          <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{loading ? '…' : (lowest?.month_label || '—')}</p>
          <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{lowest ? `${formatNumber(lowest.cases)} recorded cases` : 'No monthly record'}</p>
        </div>

        <div className={`rounded-[22px] border p-4 ${movement.card}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-75">Current movement</p>
            <MovementIcon className="h-4 w-4 opacity-80" />
          </div>
          <p className="mt-2 text-2xl font-black">{loading ? '…' : direction}</p>
          <p className="mt-1 text-[11px] font-semibold opacity-80">{summary?.change_label || 'No previous month available'}</p>
        </div>
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
          <span className="w-fit rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-bold text-cyan-200">{scopeLabel}</span>
        </div>

        <div className="min-h-[300px] w-full sm:min-h-[430px] lg:min-h-[520px]">
          <SparkChart
            values={chartValues}
            labels={chartLabels}
            title="Butuan City actual dengue cases"
            subtitle={`Recorded monthly dengue cases · ${scopeLabel}`}
            emptyLabel="No citywide monthly dengue records for this period"
            loading={loading}
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
