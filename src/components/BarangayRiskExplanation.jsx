import { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  CloudRain,
  Droplets,
  Gauge,
  Thermometer,
} from 'lucide-react'
import { getCanonicalCombinedRiskScore } from '../utils/analytics'

function formatNumber(value, maximumFractionDigits = 0) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'

  return new Intl.NumberFormat('en-PH', {
    maximumFractionDigits,
  }).format(numeric)
}

function formatDecimal(value) {
  return formatNumber(value, 2)
}

function normalizeRisk(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'high') return 'High'
  if (normalized === 'moderate') return 'Moderate'
  if (normalized === 'low') return 'Low'
  return 'Pending'
}

function readObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  return {}
}

function firstNumber(source, keys = []) {
  for (const key of keys) {
    const rawValue = source?.[key]
    if (rawValue === null || rawValue === undefined || rawValue === '') continue
    const numeric = Number(rawValue)
    if (Number.isFinite(numeric)) return numeric
  }
  return null
}

function firstText(source, keys = [], fallback = '') {
  for (const key of keys) {
    const value = String(source?.[key] ?? '').trim()
    if (value) return value
  }
  return fallback
}

function getRiskComponentItems(row = {}) {
  const components = readObject(row?.riskComponents ?? row?.risk_components)
  const backendKeys = [
    'risk_level_component',
    'forecast_volume_component',
    'trend_component',
    'rainfall_component',
    'temperature_component',
    'humidity_component',
    'population_component',
    'density_component',
  ]
  const hasBackendBreakdown = backendKeys.some((key) => Object.prototype.hasOwnProperty.call(components, key))

  if (hasBackendBreakdown) {
    return [
      ['Risk level', firstNumber(components, ['risk_level_component']) ?? 0],
      ['Forecast volume', firstNumber(components, ['forecast_volume_component']) ?? 0],
      ['Recent trend', firstNumber(components, ['trend_component']) ?? 0],
      ['Rainfall', firstNumber(components, ['rainfall_component']) ?? 0],
      ['Temperature', firstNumber(components, ['temperature_component']) ?? 0],
      ['Humidity', firstNumber(components, ['humidity_component']) ?? 0],
      ['Population', firstNumber(components, ['population_component']) ?? 0],
      ['Crowding', firstNumber(components, ['density_component']) ?? 0],
    ]
  }

  return [
    ['Forecast cases', firstNumber(components, ['forecast']) ?? 0],
    ['Recent change', firstNumber(components, ['trend']) ?? 0],
    ['Weather', firstNumber(components, ['environment']) ?? 0],
    ['Population', firstNumber(components, ['population']) ?? 0],
    ['Crowding', firstNumber(components, ['density']) ?? 0],
  ]
}

function FactorCard({ label, value, helper, signal, icon: Icon, tone = 'blue' }) {
  const tones = {
    blue: {
      line: 'from-sky-500 to-blue-500',
      icon: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-300',
      dot: 'bg-sky-500',
    },
    amber: {
      line: 'from-amber-400 via-orange-400 to-rose-400',
      icon: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-300',
      dot: 'bg-amber-500',
    },
    emerald: {
      line: 'from-emerald-500 to-cyan-400',
      icon: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300',
      dot: 'bg-emerald-500',
    },
  }
  const palette = tones[tone] || tones.blue

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-slate-200/90 bg-white/75 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-slate-950/55 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <div className="mt-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
            <span className={`h-1.5 w-1.5 rounded-full ${palette.dot}`} />
            {signal}
          </div>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border ${palette.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>

      <p className="mt-5 text-[1.35rem] font-black tracking-[-0.035em] text-slate-950 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
        {helper}
      </p>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-full w-2/3 rounded-full bg-gradient-to-r ${palette.line}`} />
      </div>
    </div>
  )
}

export default function BarangayRiskExplanation({
  row,
  barangayName,
  priorityRank,
  priorityTotal,
}) {
  const [open, setOpen] = useState(false)
  const risk = normalizeRisk(row?.risk_level ?? row?.risk)
  const score = Math.round(Number(getCanonicalCombinedRiskScore(row) || 0))
  const rankAvailable = Number(priorityRank) > 0 && Number(priorityTotal) > 0

  const averageRainfall = firstNumber(row, ['averageRainfall', 'average_rainfall', 'avgRainfall', 'avg_rainfall'])
  const averageTemperature = firstNumber(row, ['averageTemperature', 'average_temperature', 'avgTemperature', 'avg_temperature'])
  const averageHumidity = firstNumber(row, ['averageHumidity', 'average_humidity', 'avgHumidity', 'avg_humidity'])

  const environmentalSuitability = firstText(
    row,
    ['environmentalSuitability', 'environmental_suitability'],
    'Shared forecast-period weather context'
  )
  const rainfallPressure = firstText(row, ['rainfallPressure', 'rainfall_pressure'], 'Shared forecast-period rainfall')
  const temperatureSuitability = firstText(row, ['temperatureSuitability', 'temperature_suitability'], 'Shared forecast-period temperature')
  const humiditySuitability = firstText(row, ['humiditySuitability', 'humidity_suitability'], 'Shared forecast-period humidity')
  const components = getRiskComponentItems(row)

  return (
    <section className="overflow-hidden rounded-[30px] border border-emerald-200/80 bg-gradient-to-br from-white via-slate-50/85 to-cyan-50/60 shadow-[0_18px_48px_rgba(15,23,42,0.07)] dark:border-emerald-400/15 dark:from-slate-950 dark:via-slate-950 dark:to-cyan-950/20">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-4 p-5 text-left sm:p-6"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300">
              <Gauge className="h-3.5 w-3.5" />
              Risk explanation
            </span>
            {rankAvailable && (
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.13em] text-sky-700 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-300">
                #{priorityRank} of {priorityTotal} citywide priority
              </span>
            )}
          </div>

          <h2 className="mt-3 text-xl font-black tracking-tight text-slate-900 dark:text-white sm:text-2xl">
            Why {barangayName || 'this barangay'} received {risk} risk level
          </h2>
          <p className="mt-1 max-w-4xl text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">
            Based on the current forecast and dengue conditions. Open this section to see the barangay-specific factors and the shared weather context behind the score.
          </p>
        </div>

        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-emerald-200 bg-emerald-50 text-emerald-700 transition dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-200/80 p-5 dark:border-white/10 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                Factors used for risk level
              </p>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Forecast, recent trend, population and crowding can differ by barangay. Rainfall, temperature and humidity use the same forecast-period weather context, so those values may stay unchanged across barangays.
              </p>
            </div>

            <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300">
              Shared weather context · {environmentalSuitability}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FactorCard
              label="Combined priority score"
              value={score > 0 ? `${formatNumber(score)}/100` : 'No data'}
              helper="Overall barangay planning priority from forecast, weather, trend, population and density."
              signal="Barangay-specific score"
              icon={Gauge}
              tone="blue"
            />
            <FactorCard
              label="Rainfall level"
              value={averageRainfall !== null ? `${formatDecimal(averageRainfall)} mm average` : 'No data'}
              helper={`Shared context · ${rainfallPressure}`}
              signal="Shared weather signal"
              icon={CloudRain}
              tone="blue"
            />
            <FactorCard
              label="Temperature condition"
              value={averageTemperature !== null ? `${formatDecimal(averageTemperature)} °C` : 'No data'}
              helper={`Shared context · ${temperatureSuitability}`}
              signal="Shared weather signal"
              icon={Thermometer}
              tone="amber"
            />
            <FactorCard
              label="Humidity level"
              value={averageHumidity !== null ? `${formatDecimal(averageHumidity)}%` : 'No data'}
              helper={`Shared context · ${humiditySuitability}`}
              signal="Shared weather signal"
              icon={Droplets}
              tone="emerald"
            />
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_310px]">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/75 p-4 dark:border-white/10 dark:bg-slate-900/55">
              <p className="text-sm font-black text-slate-900 dark:text-white">What affected the score</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {components.map(([label, value]) => {
                  const numeric = Number(value || 0)
                  const width = Math.min(Math.max(numeric, 0), 40) * 2.5

                  return (
                    <div key={label} className="rounded-[18px] border border-slate-200 bg-white px-3 py-3 shadow-sm dark:border-white/10 dark:bg-slate-950/65">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">{label}</span>
                        <span className="text-sm font-black text-slate-900 dark:text-white">{formatNumber(numeric, 2)}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-600 to-cyan-400"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="rounded-[24px] border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-400/20 dark:bg-sky-500/10">
              <p className="text-sm font-black text-sky-800 dark:text-sky-300">Weather coverage</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-400">
                Rainfall, temperature and humidity are shared forecast-period weather signals. They provide environmental context but are not separate measurements for every barangay.
              </p>
              <p className="mt-3 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-500">
                Barangay priority differences mainly come from forecast volume, recent trend, population, crowding or density, and other barangay-specific inputs.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
