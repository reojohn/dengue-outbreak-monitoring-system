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

function getWorkspaceRiskScoringGuide(row = {}, label = '', componentValue = 0) {
  const normalizedLabel = String(label || '').trim().toLowerCase()
  const risk = normalizeRisk(row?.risk_level ?? row?.risk)
  const forecast = firstNumber(row, ['forecast_next_4_periods', 'forecasted_cases', 'predictedCases', 'predicted_cases', 'forecast', 'forecastCases', 'forecast_cases', 'cases', 'totalCases', 'total_cases']) || 0
  const trend = firstText(row, ['trendLabel', 'trend', 'trend_direction'], 'Trend unavailable')
  const rainfall = firstNumber(row, ['averageRainfall', 'average_rainfall', 'avgRainfall', 'avg_rainfall']) || 0
  const temperature = firstNumber(row, ['averageTemperature', 'average_temperature', 'avgTemperature', 'avg_temperature']) || 0
  const humidity = firstNumber(row, ['averageHumidity', 'average_humidity', 'avgHumidity', 'avg_humidity']) || 0
  const population = firstNumber(row, ['population', 'totalPopulation', 'population_count']) || 0
  const density = firstNumber(row, ['density', 'populationDensity', 'population_density']) || 0

  const guides = {
    'risk level': {
      current: `${risk} risk · ${formatNumber(componentValue)} pts`,
      explanation: 'Risk level comes from the cumulative four-period forecast case total.',
      rows: [
        { range: '< 25 forecast cases', result: 'Low risk', points: 10, active: risk === 'Low' },
        { range: '25–59.99 forecast cases', result: 'Moderate risk', points: 25, active: risk === 'Moderate' },
        { range: '≥ 60 forecast cases', result: 'High risk', points: 40, active: risk === 'High' },
      ],
    },
    'forecast volume': {
      current: `${formatNumber(forecast, 2)} forecast cases · ${formatNumber(componentValue, 2)} pts`,
      explanation: 'Forecast volume adds forecast cases ÷ 8, capped at 15 points.',
      rows: [
        { range: 'Forecast cases ÷ 8', result: 'Gradual score', points: '0–15', active: forecast < 120 },
        { range: '≥ 120 forecast cases', result: 'Maximum contribution', points: 15, active: forecast >= 120 },
      ],
    },
    'recent trend': {
      current: `${trend} · ${formatNumber(componentValue)} pts`,
      explanation: 'The recent case direction determines the trend contribution.',
      rows: [
        { range: 'Decreasing', result: 'Recent trend', points: 1, active: String(trend).toLowerCase().includes('decreasing') },
        { range: 'Stable', result: 'Recent trend', points: 5, active: String(trend).toLowerCase().includes('stable') },
        { range: 'Increasing', result: 'Recent trend', points: 10, active: String(trend).toLowerCase().includes('increasing') },
      ],
    },
    rainfall: {
      current: rainfall > 0 ? `${formatDecimal(rainfall)} mm average · ${formatNumber(componentValue)} pts` : 'Rainfall data unavailable',
      explanation: 'The shared forecast-period average rainfall is matched to these scoring bands.',
      rows: [
        { range: '< 20 mm', result: 'Low rainfall pressure', points: 3, active: rainfall > 0 && rainfall < 20 },
        { range: '20–79.99 mm', result: 'Moderate rainfall pressure', points: 7, active: rainfall >= 20 && rainfall < 80 },
        { range: '≥ 80 mm', result: 'High rainfall pressure', points: 10, active: rainfall >= 80 },
      ],
    },
    temperature: {
      current: temperature > 0 ? `${formatDecimal(temperature)} °C · ${formatNumber(componentValue)} pts` : 'Temperature data unavailable',
      explanation: 'The shared forecast-period average temperature is matched to these suitability bands.',
      rows: [
        { range: '< 20°C or > 35°C', result: 'Less suitable', points: 2, active: temperature > 0 && (temperature < 20 || temperature > 35) },
        { range: '20–<24°C or >32–35°C', result: 'Partly suitable', points: 6, active: temperature >= 20 && (temperature < 24 || (temperature > 32 && temperature <= 35)) },
        { range: '24–32°C', result: 'Suitable for mosquito activity', points: 10, active: temperature >= 24 && temperature <= 32 },
      ],
    },
    humidity: {
      current: humidity > 0 ? `${formatDecimal(humidity)}% · ${formatNumber(componentValue)} pts` : 'Humidity data unavailable',
      explanation: 'The shared forecast-period average humidity is matched to these scoring bands.',
      rows: [
        { range: '< 60%', result: 'Low suitability', points: 3, active: humidity > 0 && humidity < 60 },
        { range: '60–79.99%', result: 'Moderate suitability', points: 7, active: humidity >= 60 && humidity < 80 },
        { range: '≥ 80%', result: 'High suitability', points: 10, active: humidity >= 80 },
      ],
    },
    population: {
      current: population > 0 ? `${formatNumber(population)} people · ${formatNumber(componentValue)} pts` : 'Population data unavailable',
      explanation: 'Barangay population is matched to these exposure bands.',
      rows: [
        { range: '< 8,000 people', result: 'Lower exposure', points: 2, active: population > 0 && population < 8000 },
        { range: '8,000–14,999 people', result: 'Moderate exposure', points: 5, active: population >= 8000 && population < 15000 },
        { range: '≥ 15,000 people', result: 'High exposure', points: 8, active: population >= 15000 },
      ],
    },
    crowding: {
      current: density > 0 ? `${formatNumber(density)} people/km² · ${formatNumber(componentValue)} pts` : 'Density data unavailable',
      explanation: 'Population density is used as the crowding measure.',
      rows: [
        { range: '< 500 people/km²', result: 'Lower density', points: 1, active: density > 0 && density < 500 },
        { range: '500–1,499 people/km²', result: 'Moderate density', points: 3, active: density >= 500 && density < 1500 },
        { range: '1,500–4,999 people/km²', result: 'Dense barangay', points: 5, active: density >= 1500 && density < 5000 },
        { range: '≥ 5,000 people/km²', result: 'Very dense barangay', points: 7, active: density >= 5000 },
      ],
    },
  }
  return guides[normalizedLabel] || null
}

export default function BarangayRiskExplanation({
  row,
  barangayName,
  priorityRank,
  priorityTotal,
}) {
  const [open, setOpen] = useState(false)
  const [riskGuideOpen, setRiskGuideOpen] = useState(true)
  const [expandedScoreFactor, setExpandedScoreFactor] = useState('')
  const risk = normalizeRisk(row?.risk_level ?? row?.risk)
  const score = Math.round(Number(getCanonicalCombinedRiskScore(row) || 0))
  const rankAvailable = Number(priorityRank) > 0 && Number(priorityTotal) > 0
  const forecastCases = firstNumber(row, [
    'forecast_next_4_periods',
    'forecasted_cases',
    'predictedCases',
    'predicted_cases',
    'forecast',
    'forecastCases',
    'forecast_cases',
    'cases',
    'totalCases',
    'total_cases',
  ])

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
          <div className="mb-5 overflow-hidden rounded-[24px] border border-emerald-200/80 bg-emerald-50/55 dark:border-emerald-400/20 dark:bg-emerald-500/[0.07]">
            <button
              type="button"
              onClick={() => setRiskGuideOpen((current) => !current)}
              className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left"
              aria-expanded={riskGuideOpen}
            >
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                  How risk levels are classified
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Based on the cumulative four-period forecast case total.
                </p>
              </div>
              {riskGuideOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" /> : <ChevronDown className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" />}
            </button>

            {riskGuideOpen && (
              <div className="border-t border-emerald-200/70 px-4 py-4 dark:border-emerald-400/15">
                <div className="mb-3 rounded-[16px] border border-white/80 bg-white/80 px-3 py-2.5 text-xs font-semibold text-slate-600 shadow-sm dark:border-white/10 dark:bg-slate-950/55 dark:text-slate-300">
                  Current cumulative forecast:{' '}
                  <span className="font-black text-slate-950 dark:text-white">
                    {forecastCases !== null ? `${formatNumber(forecastCases, 2)} cases` : 'No forecast value'}
                  </span>
                  {risk !== 'Pending' && (
                    <> · <span className="font-black text-emerald-700 dark:text-emerald-300">{risk} Risk</span></>
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    { label: '< 25 forecast cases', risk: 'Low', points: 'Low Risk' },
                    { label: '25–59.99 forecast cases', risk: 'Moderate', points: 'Moderate Risk' },
                    { label: '≥ 60 forecast cases', risk: 'High', points: 'High Risk' },
                  ].map((item) => {
                    const current = risk === item.risk
                    return (
                      <div
                        key={item.risk}
                        className={`rounded-[16px] border px-3 py-3 ${
                          current
                            ? 'border-emerald-300 bg-emerald-100/80 shadow-sm dark:border-emerald-400/35 dark:bg-emerald-500/15'
                            : 'border-slate-200 bg-white/80 dark:border-white/10 dark:bg-slate-950/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-black text-slate-800 dark:text-slate-100">{item.label}</p>
                            <p className="mt-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">{item.points}</p>
                          </div>
                          {current && (
                            <span className="rounded-full bg-emerald-600 px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-white">
                              Current
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

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
                  const guide = getWorkspaceRiskScoringGuide(row, label, numeric)
                  const isExpanded = expandedScoreFactor === label

                  return (
                    <div
                      key={label}
                      className={`overflow-hidden rounded-[18px] border bg-white shadow-sm transition dark:bg-slate-950/65 ${
                        isExpanded
                          ? 'border-sky-300 ring-2 ring-sky-100 dark:border-sky-500/50 dark:ring-sky-500/10'
                          : 'border-slate-200 dark:border-white/10'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedScoreFactor((current) => current === label ? '' : label)}
                        className="w-full px-3 py-3 text-left"
                        aria-expanded={isExpanded}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">{label}</span>
                          <span className="flex items-center gap-2">
                            <span className="text-sm font-black text-slate-900 dark:text-white">{formatNumber(numeric, 2)}</span>
                            {isExpanded
                              ? <ChevronUp className="h-4 w-4 text-sky-600 dark:text-sky-300" />
                              : <ChevronDown className="h-4 w-4 text-slate-500 dark:text-slate-400" />}
                          </span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className="h-full rounded-full bg-gradient-to-r from-sky-600 to-cyan-400" style={{ width: `${width}%` }} />
                        </div>
                      </button>

                      {isExpanded && guide && (
                        <div className="border-t border-slate-100 bg-slate-50/80 px-3 pb-3 pt-3 dark:border-slate-800 dark:bg-slate-900/60">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-sky-700 dark:text-sky-300">How this score was calculated</p>
                          <p className="mt-1 text-xs font-bold leading-5 text-slate-900 dark:text-slate-200">Current: {guide.current}</p>
                          <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">{guide.explanation}</p>
                          <div className="mt-3 space-y-1.5">
                            {guide.rows.map((threshold, index) => (
                              <div
                                key={`${label}-${index}`}
                                className={`grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-xl border px-2.5 py-2 ${
                                  threshold.active
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                                    : 'border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400'
                                }`}
                              >
                                <div className="min-w-0">
                                  <p className="text-[11px] font-black">{threshold.range}</p>
                                  <p className="mt-0.5 text-[10px] leading-4 opacity-80">{threshold.result}</p>
                                </div>
                                <div className="flex items-center gap-1.5 text-right text-[11px] font-black">
                                  {typeof threshold.points === 'string' ? threshold.points : formatNumber(threshold.points)} pts
                                  {threshold.active && <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.08em] text-white">Current</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
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
