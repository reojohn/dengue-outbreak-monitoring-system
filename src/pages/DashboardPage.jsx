import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  CloudRain,
  Database,
  Droplets,
  FileText,
  Gauge,
  Layers3,
  MapPinned,
  Navigation,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
  Target,
  Thermometer,
  TrendingUp,
  UploadCloud,
} from 'lucide-react'
import SectionTitle from '../components/SectionTitle'
import SparkChart from '../components/SparkChart'
import { useData } from '../context/DataContext'
import { riskStyles } from '../utils/analytics'

const actionRoutes = {
  'Create response action': '/forecast#decision-action-tracking',
  'Upload data': '/upload',
  'Run forecast': '/forecast',
  'Open map': '/map',
  'Generate report': '/reports',
}

const actions = [
  {
    label: 'Create response action',
    description: 'Open the action command center and assign barangay response tasks',
    icon: ClipboardCheck,
    style:
      'border-sky-100 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300',
  },
  {
    label: 'Upload data',
    description: 'Upload dengue records and supporting files',
    icon: UploadCloud,
    style:
      'border-blue-100 bg-blue-50 text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
  },
  {
    label: 'Run forecast',
    description: 'Review projected cases and risk level changes',
    icon: TrendingUp,
    style:
      'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
  },
  {
    label: 'Open map',
    description: 'View hotspot barangays on the GIS map',
    icon: MapPinned,
    style:
      'border-teal-100 bg-teal-50 text-brand-teal dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300',
  },
  {
    label: 'Generate report',
    description: 'Create reports for review and coordination',
    icon: FileText,
    style:
      'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
]

function formatNumber(value) {
  return new Intl.NumberFormat('en-PH').format(Number(value || 0))
}

function toNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback

  const cleaned =
    typeof value === 'string'
      ? value.replace(/,/g, '').trim()
      : value

  const number = Number(cleaned)

  return Number.isFinite(number) ? number : fallback
}

function formatDecimal(value, decimals = 2) {
  const number = toNumber(value)

  return new Intl.NumberFormat('en-PH', {
    maximumFractionDigits: decimals,
  }).format(number)
}

function getTrendStatus(values = []) {
  if (!values.length) {
    return {
      label: 'No trend data',
      description: 'Upload dengue records to show trend movement.',
      style:
        'border-slate-200 bg-slate-50 text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    }
  }

  const latest = Number(values[values.length - 1] || 0)
  const previous = Number(values[values.length - 2] || 0)

  if (latest > previous) {
    return {
      label: 'Rising',
      description: 'Latest projected value is higher than the previous value.',
      style:
        'border-rose-100 bg-rose-50 text-brand-red dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
    }
  }

  if (latest < previous) {
    return {
      label: 'Decreasing',
      description: 'Latest projected value is lower than the previous value.',
      style:
        'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
    }
  }

  return {
    label: 'Stable',
    description: 'Latest projected value is unchanged from the previous value.',
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

  if (
  value.includes('validated') ||
  value.includes('uploaded') ||
  value.includes('saved online') ||
  value.includes('checked')
) {
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

function getDecisionSupport(row) {
  const decisionSupport = row?.decisionSupport || {}
  const summary =
    decisionSupport.summary ||
    row?.recommendedAction ||
    row?.recommendation ||
    'Decision support recommendation will appear after risk rows are computed.'

  const priority =
    decisionSupport.priority ||
    row?.responsePriority ||
    (row ? 'Standard Risk Response' : 'Pending Dataset')

  const score =
    row?.decisionScore ??
    decisionSupport.score ??
    row?.riskScore ??
    row?.multiSourceRiskScore ??
    0

  const actions = Array.isArray(decisionSupport.actions)
    ? decisionSupport.actions
    : Array.isArray(row?.recommendedActions)
      ? row.recommendedActions
      : summary
        ? [summary]
        : []

  const rationale = Array.isArray(decisionSupport.rationale)
    ? decisionSupport.rationale
    : Array.isArray(row?.recommendationRationale)
      ? row.recommendationRationale
      : []

  return {
    priority,
    score,
    summary,
    primaryAction: decisionSupport.primaryAction || row?.primaryAction || actions[0] || summary,
    actions,
    rationale,
    trendDirection:
      decisionSupport.trendDirection ||
      row?.trendDirection ||
      row?.trend ||
      'Trend unavailable',
    densityLevel:
      decisionSupport.densityLevel ||
      row?.densityLevel ||
      'Density unavailable',
    populationExposure:
      decisionSupport.populationExposure ||
      row?.populationExposure ||
      'Population exposure unavailable',
    forecastPressure:
      decisionSupport.forecastPressure ||
      row?.forecastPressure ||
      'Forecast pressure unavailable',
    environmentalSuitability:
      decisionSupport.environmentalSuitability ||
      row?.environmentalSuitability ||
      'Environmental data unavailable',
    rainfallPressure:
      decisionSupport.rainfallPressure ||
      row?.rainfallPressure ||
      'Rainfall data unavailable',
    temperatureSuitability:
      decisionSupport.temperatureSuitability ||
      row?.temperatureSuitability ||
      'Temperature data unavailable',
    humiditySuitability:
      decisionSupport.humiditySuitability ||
      row?.humiditySuitability ||
      'Humidity data unavailable',
    multiSourceRiskScore:
      decisionSupport.multiSourceRiskScore ??
      row?.multiSourceRiskScore ??
      row?.riskScore ??
      0,
    riskComponents:
      decisionSupport.riskComponents ||
      row?.riskComponents ||
      {},
  }
}

function getMultiSourceScore(row) {
  const decision = getDecisionSupport(row)

  return toNumber(
    row?.multiSourceRiskScore ??
      row?.riskScore ??
      decision.multiSourceRiskScore ??
      decision.score
  )
}

function getAverageMultiSourceScore(rows = []) {
  const values = rows
    .map((row) => getMultiSourceScore(row))
    .filter((value) => value > 0)

  if (!values.length) return 0

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function getEnvironmentalSummary(rows = []) {
  const withEnvironment = rows.filter((row) => {
    const decision = getDecisionSupport(row)
    return !String(decision.environmentalSuitability || '').toLowerCase().includes('unavailable')
  })

  const highPressure = rows.filter((row) => {
    const decision = getDecisionSupport(row)
    const text = [
      decision.environmentalSuitability,
      decision.rainfallPressure,
      decision.humiditySuitability,
    ].join(' ').toLowerCase()

    return text.includes('high')
  }).length

  const averageRainfallValues = rows
    .map((row) => toNumber(row?.averageRainfall ?? row?.avgRainfall))
    .filter((value) => value > 0)

  const averageTemperatureValues = rows
    .map((row) => toNumber(row?.averageTemperature ?? row?.avgTemperature))
    .filter((value) => value > 0)

  const averageHumidityValues = rows
    .map((row) => toNumber(row?.averageHumidity ?? row?.avgHumidity))
    .filter((value) => value > 0)

  const averageOf = (values) => {
    if (!values.length) return 0
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }

  return {
    availableCount: withEnvironment.length,
    highPressureCount: highPressure,
    averageRainfall: averageOf(averageRainfallValues),
    averageTemperature: averageOf(averageTemperatureValues),
    averageHumidity: averageOf(averageHumidityValues),
  }
}

function getIntegrationStatusStyle(status = '') {
  const value = String(status || '').toLowerCase()

  if (value.includes('ready')) {
    return 'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
  }

  if (value.includes('review')) {
    return 'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
  }

  return 'border-slate-200 bg-slate-50 text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

function getSourceHealth(sourceStatus = {}) {
  const sources = Object.values(sourceStatus || {})
  const loaded = sources.filter((source) => Number(source?.recordCount || 0) > 0)

  return {
    loadedCount: loaded.length,
    sourceCount: sources.length,
    totalValid: sources.reduce((sum, source) => sum + Number(source?.validCount || 0), 0),
    totalRecords: sources.reduce((sum, source) => sum + Number(source?.recordCount || 0), 0),
  }
}

function hasBackendForecastData(backendForecastResult) {
  return (
    Array.isArray(backendForecastResult?.forecast_results) &&
    backendForecastResult.forecast_results.length > 0
  )
}

function normalizeDashboardBarangayKey(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/g, 'n')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\bpob\.?\b/gi, ' ')
    .replace(/\bbgy\.?\b/gi, ' ')
    .replace(/\bbarangay\b/gi, ' ')
    .replace(/\./g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function getDashboardRowBarangayKey(row = {}) {
  return (
    row.barangay_key ||
    row.barangay_original_key ||
    normalizeDashboardBarangayKey(row.barangay || row.barangay_original || '')
  )
}

function normalizeClimateValue(value, type = '') {
  let number = toNumber(value, 0)

  // Some uploaded CSV values use comma decimals, like 29,496 for 29.496.
  // If those values were already saved as 29496 in the database, scale them back for display.
  if (type === 'rainfall' && number > 1000) number = number / 1000
  if (type === 'temperature' && number > 1000) number = number / 1000
  if (type === 'humidity' && number > 1000) number = number / 1000

  return number
}

function averagePositive(values = []) {
  const cleaned = values
    .map((value) => Number(value || 0))
    .filter((value) => Number.isFinite(value) && value > 0)

  if (!cleaned.length) return 0

  return cleaned.reduce((sum, value) => sum + value, 0) / cleaned.length
}

function getRainfallPressureLabel(value) {
  const rainfall = Number(value || 0)

  if (rainfall >= 20) return 'High rainfall pressure'
  if (rainfall >= 8) return 'Moderate rainfall pressure'
  if (rainfall > 0) return 'Low rainfall pressure'

  return 'Rainfall data unavailable'
}

function getTemperatureSuitabilityLabel(value) {
  const temperature = Number(value || 0)

  if (temperature >= 25 && temperature <= 32) return 'Favorable temperature range'
  if (temperature > 0) return 'Temperature outside ideal range'

  return 'Temperature data unavailable'
}

function getHumiditySuitabilityLabel(value) {
  const humidity = Number(value || 0)

  if (humidity >= 70) return 'High humidity suitability'
  if (humidity >= 50) return 'Moderate humidity suitability'
  if (humidity > 0) return 'Low humidity suitability'

  return 'Humidity data unavailable'
}

function getEnvironmentalSuitabilityLabel({ rainfall, temperature, humidity }) {
  if (!rainfall && !temperature && !humidity) {
    return 'Environmental data unavailable'
  }

  const pressureCount = [
    rainfall >= 20,
    temperature >= 25 && temperature <= 32,
    humidity >= 70,
  ].filter(Boolean).length

  if (pressureCount >= 2) return 'Weather conditions may support dengue spread'
  if (pressureCount === 1) return 'Some weather conditions need monitoring'

  return 'Weather conditions available for review'
}

function getPopulationExposureLabel(population) {
  const value = Number(population || 0)

  if (value >= 10000) return 'High population exposure'
  if (value >= 5000) return 'Moderate population exposure'
  if (value > 0) return 'Lower population exposure'

  return 'Population exposure unavailable'
}

function getDensityLevelLabel(density) {
  const value = Number(density || 0)

  if (value >= 5000) return 'Very crowded area'
  if (value >= 1000) return 'Crowded area'
  if (value > 0) return 'Lower crowding level'

  return 'Density unavailable'
}

function getForecastPressureLabel(forecast) {
  const value = Number(forecast || 0)

  if (value >= 60) return 'High forecast pressure'
  if (value >= 25) return 'Moderate forecast pressure'
  if (value > 0) return 'Low forecast pressure'

  return 'Forecast pressure unavailable'
}

function getPriorityLabel(risk = '') {
  if (risk === 'High') return 'Immediate Response Priority'
  if (risk === 'Moderate') return 'Preventive Monitoring Priority'
  if (risk === 'Low') return 'Routine Monitoring Priority'

  return 'Standard Risk Response'
}

function buildCombinedDatasetLookup(backendMergedDataset = []) {
  const lookup = new Map()

  if (!Array.isArray(backendMergedDataset)) return lookup

  backendMergedDataset.forEach((row) => {
    const key = getDashboardRowBarangayKey(row)

    if (!key) return

    if (!lookup.has(key)) {
      lookup.set(key, [])
    }

    lookup.get(key).push(row)
  })

  return lookup
}

function summarizeCombinedRows(rows = []) {
  const rainfallValues = rows.map((row) => normalizeClimateValue(row.rainfall, 'rainfall'))
  const temperatureValues = rows.map((row) => normalizeClimateValue(row.temperature, 'temperature'))
  const humidityValues = rows.map((row) => normalizeClimateValue(row.humidity, 'humidity'))
  const populationValues = rows.map((row) => toNumber(row.population, 0))
  const densityValues = rows.map((row) => toNumber(row.density, 0))
  const areaValues = rows.map((row) => toNumber(row.boundary_area_sqkm, 0))

  const averageRainfall = averagePositive(rainfallValues)
  const averageTemperature = averagePositive(temperatureValues)
  const averageHumidity = averagePositive(humidityValues)
  const population = averagePositive(populationValues)
  const density = averagePositive(densityValues)
  const areaSqKm = averagePositive(areaValues)

  return {
    averageRainfall,
    avgRainfall: averageRainfall,
    averageTemperature,
    avgTemperature: averageTemperature,
    averageHumidity,
    avgHumidity: averageHumidity,
    population,
    density,
    areaSqKm,
    area_sqkm: areaSqKm,
    weatherRecordCount: rows.filter((row) => {
      return row.rainfall !== undefined || row.temperature !== undefined || row.humidity !== undefined
    }).length,
    weatherCoverageLabel: rows.length
      ? 'Loaded from saved combined files'
      : 'Weather data unavailable',
    rainfallPressure: getRainfallPressureLabel(averageRainfall),
    temperatureSuitability: getTemperatureSuitabilityLabel(averageTemperature),
    humiditySuitability: getHumiditySuitabilityLabel(averageHumidity),
    environmentalSuitability: getEnvironmentalSuitabilityLabel({
      rainfall: averageRainfall,
      temperature: averageTemperature,
      humidity: averageHumidity,
    }),
    populationExposure: getPopulationExposureLabel(population),
    densityLevel: getDensityLevelLabel(density),
  }
}

function getMergedDatasetEnvironmentalSummary(backendMergedDataset = [], fallbackRows = []) {
  const rows = Array.isArray(backendMergedDataset) ? backendMergedDataset : []
  const summary = summarizeCombinedRows(rows)

  if (
    summary.averageRainfall > 0 ||
    summary.averageTemperature > 0 ||
    summary.averageHumidity > 0
  ) {
    return {
      availableCount: summary.weatherRecordCount,
      highPressureCount: rows.filter((row) => {
        const rainfall = normalizeClimateValue(row.rainfall, 'rainfall')
        const humidity = normalizeClimateValue(row.humidity, 'humidity')

        return rainfall >= 20 || humidity >= 70
      }).length,
      averageRainfall: summary.averageRainfall,
      averageTemperature: summary.averageTemperature,
      averageHumidity: summary.averageHumidity,
    }
  }

  return getEnvironmentalSummary(fallbackRows)
}

function buildBackendPriorityRows(backendForecastResult = null, backendMergedDataset = []) {
  const backendRows = backendForecastResult?.forecast_results || []
  const combinedLookup = buildCombinedDatasetLookup(backendMergedDataset)

  return backendRows
    .map((row) => {
      const barangay = row.barangay || 'Unspecified barangay'
      const barangayKey = row.barangay_key || normalizeDashboardBarangayKey(barangay)
      const combinedRows = combinedLookup.get(barangayKey) || []
      const combinedSummary = summarizeCombinedRows(combinedRows)
      const forecast = Number(row.forecast_next_4_periods || 0)
      const risk = row.risk_level || 'Low'
      const cappedRiskScore = Math.min(
        100,
        Math.max(0, Number(row.risk_score ?? row.forecast_next_4_periods ?? 0))
      )
      const priority = getPriorityLabel(risk)
      const recommendation = row.recommendation || ''
      const trendDirection = row.trend_direction || 'Stable'
      const recentAverage = Number(row.recent_average_cases || 0)
      const previousAverage = Number(row.previous_average_cases || 0)
      const forecastNextPeriod = Number(row.forecast_next_period || 0)
      const historicalTotalCases = Number(row.historical_total_cases || 0)

      const riskComponents = {
        forecast: Math.min(40, Math.round(forecast / 3)),
        currentCases: Math.min(20, Math.round(forecastNextPeriod / 2)),
        trend: trendDirection === 'Increasing' ? 15 : trendDirection === 'Decreasing' ? 3 : 8,
        environment: combinedSummary.averageRainfall || combinedSummary.averageHumidity ? 15 : 0,
        population: combinedSummary.population ? 8 : 0,
        density: combinedSummary.density ? 8 : 0,
      }

      return {
        barangay,
        barangayKey,
        forecast,
        forecastedCases: forecast,
        predictedCases: forecast,
        currentCases: forecastNextPeriod,
        previousCases: previousAverage,
        totalCases: historicalTotalCases,
        cases: historicalTotalCases,
        risk,
        priorityRank: Number(row.priority_rank || 0),
        recommendation,
        recommendedAction: recommendation,
        historicalTotalCases,
        latestPeriod: row.latest_period || '',
        trendDirection,
        trend: trendDirection,
        trendLabel: trendDirection,
        recentAverage,
        previousAverage,
        riskScore: cappedRiskScore,
        multiSourceRiskScore: cappedRiskScore,
        decisionScore: cappedRiskScore,
        responsePriority: priority,
        forecastPressure: getForecastPressureLabel(forecast),
        ...combinedSummary,
        riskComponents,
        decisionSupport: {
          priority,
          score: cappedRiskScore,
          summary: recommendation || 'Continue dengue prevention and barangay-level monitoring.',
          primaryAction: recommendation || 'Continue dengue prevention and barangay-level monitoring.',
          actions: recommendation ? [recommendation] : ['Continue dengue prevention and barangay-level monitoring.'],
          rationale: [
            `${barangay} is ranked #${Number(row.priority_rank || 0) || 'N/A'} in the latest saved forecast.`,
            `${formatNumber(forecast)} cases are expected in the forecast window.`,
            combinedSummary.environmentalSuitability,
          ],
          trendDirection,
          densityLevel: combinedSummary.densityLevel,
          populationExposure: combinedSummary.populationExposure,
          forecastPressure: getForecastPressureLabel(forecast),
          environmentalSuitability: combinedSummary.environmentalSuitability,
          environmentalScore: riskComponents.environment,
          rainfallPressure: combinedSummary.rainfallPressure,
          temperatureSuitability: combinedSummary.temperatureSuitability,
          humiditySuitability: combinedSummary.humiditySuitability,
          multiSourceRiskScore: cappedRiskScore,
          riskScore: cappedRiskScore,
          riskComponents,
        },
      }
    })
    .sort((a, b) => {
      if (a.priorityRank && b.priorityRank) {
        return a.priorityRank - b.priorityRank
      }

      return b.forecast - a.forecast
    })
}

function buildDatabaseIntegrationReadiness({
  backendMergedDataset = [],
  backendForecastResult = null,
  sourceStatus = {},
}) {
  const mergedRows = Array.isArray(backendMergedDataset) ? backendMergedDataset : []
  const forecastRows = backendForecastResult?.forecast_results || []
  const sourceHealth = getSourceHealth(sourceStatus)

  const hasAllSources = sourceHealth.loadedCount >= 4 || mergedRows.length > 0
  const hasForecastRows = forecastRows.length > 0
  const hasWeatherRows = mergedRows.some((row) => {
    return row.weather_match_status === 'Matched' || row.weather_match_status === 'Monthly Weather Average' || row.rainfall !== undefined
  })
  const hasPopulationRows = mergedRows.some((row) => {
    return row.population_match_status === 'Found' || row.population !== undefined
  })
  const hasBoundaryRows = mergedRows.some((row) => {
    return row.boundary_match_status === 'Found' || row.geometry_id || row.boundary_area_sqkm !== undefined
  })
  const barangayMatchReady = mergedRows.length > 0 && mergedRows.every((row) => {
    const status = String(row.barangay_match_status || '').toLowerCase()
    return status.includes('exact') || status.includes('matched') || status.includes('auto')
  })

  const checks = [
    {
      id: 'sources-loaded',
      label: 'All required files loaded',
      ready: hasAllSources,
      value: `${formatNumber(sourceHealth.loadedCount)} / ${formatNumber(Math.max(sourceHealth.sourceCount, 4))}`,
      description: hasAllSources
        ? 'Dengue, weather, population, and boundary files are available from the saved workspace.'
        : 'Load all four required files before relying on the dashboard.',
    },
    {
      id: 'barangay-name-check',
      label: 'Barangay names checked automatically',
      ready: barangayMatchReady,
      value: barangayMatchReady ? 'Matched' : 'Needs Review',
      description: barangayMatchReady
        ? 'Barangay names in the dengue file were matched with the supporting files.'
        : 'Some barangay names still need review.',
    },
    {
      id: 'weather-linked',
      label: 'Weather rows linked',
      ready: hasWeatherRows,
      value: hasWeatherRows ? 'Linked' : 'Missing',
      description: hasWeatherRows
        ? 'Rainfall, temperature, and humidity values are available in the saved combined files.'
        : 'Weather values were not found in the saved combined files.',
    },
    {
      id: 'population-linked',
      label: 'Population rows linked',
      ready: hasPopulationRows,
      value: hasPopulationRows ? 'Linked' : 'Missing',
      description: hasPopulationRows
        ? 'Population values are available in the saved combined files.'
        : 'Population values were not found in the saved combined files.',
    },
    {
      id: 'boundary-linked',
      label: 'Map boundary rows linked',
      ready: hasBoundaryRows,
      value: hasBoundaryRows ? 'Linked' : 'Missing',
      description: hasBoundaryRows
        ? 'Barangay map references are available for GIS display.'
        : 'Barangay map references were not found in the saved combined files.',
    },
    {
      id: 'forecast-ready',
      label: 'Forecast and DSS rows generated',
      ready: hasForecastRows,
      value: `${formatNumber(forecastRows.length)} barangay row${forecastRows.length === 1 ? '' : 's'}`,
      description: hasForecastRows
        ? 'Saved forecast results are available for the dashboard, map, reports, and recommended actions.'
        : 'Run the forecast to create barangay risk results.',
    },
  ]

  const readyCount = checks.filter((check) => check.ready).length
  const score = checks.length ? Math.round((readyCount / checks.length) * 100) : 0

  return {
    status: score === 100 ? 'Ready' : score > 0 ? 'Needs Review' : 'Pending',
    score,
    readyCount,
    checkCount: checks.length,
    allSourcesLoaded: hasAllSources,
    checks,
    summary: {
      mergedRowCount: mergedRows.length,
      forecastRowCount: forecastRows.length,
    },
  }
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

  const moderateRiskCount =
    Number(riskCounts.Moderate || 0) ||
    backendRows.filter((row) => row.risk_level === 'Moderate').length

  const lowRiskCount =
    Number(riskCounts.Low || 0) ||
    backendRows.filter((row) => row.risk_level === 'Low').length

  const dataQuality =
    originalRowCount > 0
      ? Math.round((validRowCount / originalRowCount) * 100)
      : 0

  return {
    totalCases,
    highRiskCount,
    moderateRiskCount,
    lowRiskCount,
    fourWeekForecast,
    dataQuality,
  }
}

function PremiumStatCard({
  title,
  value,
  helper,
  icon: Icon,
  tone = 'blue',
}) {
  const toneMap = {
    blue: {
      icon: 'border-blue-100 bg-blue-50 text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
      badge: 'bg-blue-500',
      glow: 'from-blue-50/90 via-white to-white dark:from-blue-500/10 dark:via-slate-900 dark:to-slate-900',
    },
    red: {
      icon: 'border-rose-100 bg-rose-50 text-brand-red dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
      badge: 'bg-rose-500',
      glow: 'from-rose-50/90 via-white to-white dark:from-rose-500/10 dark:via-slate-900 dark:to-slate-900',
    },
    orange: {
      icon: 'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
      badge: 'bg-amber-500',
      glow: 'from-amber-50/90 via-white to-white dark:from-amber-500/10 dark:via-slate-900 dark:to-slate-900',
    },
    green: {
      icon: 'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
      badge: 'bg-emerald-500',
      glow: 'from-emerald-50/90 via-white to-white dark:from-emerald-500/10 dark:via-slate-900 dark:to-slate-900',
    },
  }

  const style = toneMap[tone] || toneMap.blue

  return (
    <div
      className={`group relative min-h-[150px] overflow-hidden rounded-[24px] border border-brand-line/70 bg-gradient-to-br ${style.glow} p-3 shadow-[0_18px_50px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(15,23,42,0.12)] dark:border-slate-800 dark:shadow-none sm:min-h-[172px] sm:rounded-[32px] sm:p-5`}
    >
      <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-white/70 blur-2xl dark:bg-white/5 sm:-right-10 sm:-top-10 sm:h-28 sm:w-28" />
      <div className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent dark:via-slate-700" />

      <div className="relative flex items-start justify-between gap-2 sm:gap-4">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400 sm:text-[11px] sm:tracking-[0.18em]">
            {title}
          </p>

          <h3 className="mt-2 text-[1.55rem] font-black leading-none tracking-tight text-brand-text dark:text-slate-100 sm:mt-4 sm:text-4xl">
            {value}
          </h3>

          <p className="mt-2 max-w-[7.8rem] text-[11px] leading-4 text-brand-muted dark:text-slate-400 sm:max-w-[210px] sm:text-sm sm:leading-6">
            {helper}
          </p>
        </div>

        <div
          className={`-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border shadow-sm sm:mr-0 sm:h-12 sm:w-12 sm:rounded-[20px] ${style.icon}`}
        >
          <Icon className="h-4 w-4 sm:h-6 sm:w-6" strokeWidth={2.4} />
        </div>
      </div>

      <div className={`absolute bottom-3 right-3 h-2.5 w-2.5 rounded-full sm:bottom-5 sm:right-5 ${style.badge}`} />
    </div>
  )
}

function Panel({ children, className = '' }) {
  return (
    <div
      className={`rounded-[34px] border border-brand-line/70 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none ${className}`}
    >
      {children}
    </div>
  )
}

function SectionBadge({ children, tone = 'slate' }) {
  const toneMap = {
    slate:
      'border-slate-200 bg-slate-50 text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    blue:
      'border-blue-100 bg-blue-50 text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
    amber:
      'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
    emerald:
      'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
    rose:
      'border-rose-100 bg-rose-50 text-brand-red dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
  }

  return (
    <div
      className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${toneMap[tone] || toneMap.slate}`}
    >
      {children}
    </div>
  )
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
    backendMergedDataset = [],
    integrationReadiness = null,
    weatherRecords = [],
    resetSampleData,
  } = useData()

  const usingBackendForecast = hasBackendForecastData(backendForecastResult)

  const backendPriorityRows = useMemo(() => {
    return buildBackendPriorityRows(backendForecastResult, backendMergedDataset)
  }, [backendForecastResult, backendMergedDataset])

  const backendWeeklyTotals = useMemo(() => {
    return buildBackendWeeklyTotals(backendForecastResult)
  }, [backendForecastResult])

  const backendDashboardStats = useMemo(() => {
    return buildBackendDashboardStats(backendForecastResult, backendDengueSummary)
  }, [backendForecastResult, backendDengueSummary])

  const databaseIntegrationReadiness = useMemo(() => {
    return buildDatabaseIntegrationReadiness({
      backendMergedDataset,
      backendForecastResult,
      sourceStatus,
    })
  }, [backendMergedDataset, backendForecastResult, sourceStatus])

  const displayIntegrationReadiness = usingBackendForecast || backendMergedDataset.length > 0
    ? databaseIntegrationReadiness
    : integrationReadiness

  const displayStats = usingBackendForecast
    ? backendDashboardStats
    : {
        totalCases: dashboardStats.totalCases || 0,
        highRiskCount: dashboardStats.highRiskCount || 0,
        moderateRiskCount: dashboardStats.moderateRiskCount || 0,
        lowRiskCount: dashboardStats.lowRiskCount || 0,
        fourWeekForecast: dashboardStats.fourWeekForecast || 0,
        dataQuality: dashboardStats.dataQuality || 0,
      }

  const weeklyTotals = usingBackendForecast
    ? backendWeeklyTotals
    : dashboardStats?.weeklyTotals || []

  const displayRiskRows = usingBackendForecast
  ? backendPriorityRows
  : riskRows

  const priority = displayRiskRows.slice(0, 5)

  const latestLogs = activityLogs.slice(0, 3)
  const trendStatus = getTrendStatus(weeklyTotals)

  const highRiskCount = displayRiskRows.length
    ? displayRiskRows.filter((row) => row.risk === 'High').length
    : Number(displayStats.highRiskCount || 0)

  const moderateRiskCount = displayRiskRows.length
    ? displayRiskRows.filter((row) => row.risk === 'Moderate').length
    : Number(displayStats.moderateRiskCount || 0)

  const lowRiskCount = displayRiskRows.length
    ? displayRiskRows.filter((row) => row.risk === 'Low').length
    : Number(displayStats.lowRiskCount || 0)

  const topPriority = priority[0] || null
  const topDecision = getDecisionSupport(topPriority)
  const topMultiSourceScore = getMultiSourceScore(topPriority)
  const averageMultiSourceScore = getAverageMultiSourceScore(displayRiskRows)
  const environmentalSummary = usingBackendForecast || backendMergedDataset.length > 0
    ? getMergedDatasetEnvironmentalSummary(backendMergedDataset, displayRiskRows)
    : getEnvironmentalSummary(displayRiskRows)
  const sourceHealth = getSourceHealth(sourceStatus)
  const integrationStatus = displayIntegrationReadiness?.status || 'Pending'
  const integrationScore = toNumber(displayIntegrationReadiness?.score)
  const integrationChecks = displayIntegrationReadiness?.checks || []
  const acceptedRecords = Number(
    backendForecastResult?.valid_row_count ||
      sourceStatus?.dengue?.validCount ||
      0
  )

  const dataHealth =
    Number(displayStats.dataQuality || 0) >= 95
      ? 'Ready for review'
      : Number(displayStats.dataQuality || 0) > 0
        ? 'Needs checking'
        : 'Waiting for data'

  function handleQuickActionNavigation(route) {
    if (!route) return

    const [path, hash] = route.split('#')
    const targetPath = hash ? `${path}#${hash}` : path

    navigate(targetPath)

    if (!hash) return

    window.setTimeout(() => {
      const targetElement = document.getElementById(hash)

      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      }
    }, 220)
  }

  const riskDistribution = [
    {
      label: 'High',
      value: highRiskCount,
      helper: 'Needs immediate attention',
      style:
        'border-rose-100 bg-rose-50 text-rose-600 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
    },
    {
      label: 'Moderate',
      value: moderateRiskCount,
      helper: 'Needs close monitoring',
      style:
        'border-amber-100 bg-amber-50 text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
    },
    {
      label: 'Low',
      value: lowRiskCount,
      helper: 'Routine watch',
      style:
        'border-emerald-100 bg-emerald-50 text-emerald-600 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
    },
  ]

  const alertCards = useMemo(() => {
    const highestRisk = priority[0]
    const priorityHighCount = priority.filter((row) => row.risk === 'High').length

    return [
      {
        title: highestRisk ? `${highestRisk.risk} risk priority` : 'No risk data yet',
        message: highestRisk
          ? `${highestRisk.barangay} has the highest priority with ${formatNumber(getMultiSourceScore(highestRisk))}/100 multi-source score and ${formatNumber(highestRisk.forecast)} projected cases.`
          : 'Upload dengue, weather, population, and boundary records to generate priority alerts.',
        icon: ShieldAlert,
        style: highestRisk?.risk === 'High'
          ? 'border-rose-100 bg-rose-50/75 dark:border-rose-500/20 dark:bg-rose-500/10'
          : 'border-blue-100 bg-blue-50/75 dark:border-blue-500/20 dark:bg-blue-500/10',
      },
      {
        title: usingBackendForecast ? 'Analysis ready' : 'Data readiness',
        message: usingBackendForecast
          ? `The uploaded files are now feeding dashboard totals, priority barangays, weather factors, trend view, and monitoring alerts.`
          : `${Object.keys(sourceStatus || {}).length} data sources are available in the prototype workspace.`,
        icon: CheckCircle2,
        style:
          'border-blue-100 bg-blue-50/75 dark:border-blue-500/20 dark:bg-blue-500/10',
      },
      {
        title: 'Monitoring priority',
        message: `${priorityHighCount} barangay${priorityHighCount === 1 ? '' : 's'} currently require closer monitoring.`,
        icon: AlertTriangle,
        style: priorityHighCount > 0
          ? 'border-amber-100 bg-amber-50/75 dark:border-amber-500/20 dark:bg-amber-500/10'
          : 'border-emerald-100 bg-emerald-50/75 dark:border-emerald-500/20 dark:bg-emerald-500/10',
      },
    ]
  }, [
    priority,
    sourceStatus,
    usingBackendForecast,
  ])

  return (
    <div className="dashboard-mobile-compact space-y-6">
      <SectionTitle
        title="Dashboard Overview"
        subtitle={
          usingBackendForecast
            ? 'Decision-ready overview from the latest uploaded dengue records.'
            : 'Quick status, dengue trends, weather pressure, priority barangays, and file readiness from the current records.'
        }
      />

      <div className="relative overflow-hidden rounded-[38px] border border-brand-line/70 bg-gradient-to-br from-slate-950 via-[#1e4e75] to-slate-900 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.22)] dark:border-slate-800 sm:p-7">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-36 w-36 rounded-full bg-emerald-300/10 blur-3xl" />

        <div className="relative grid gap-6 xl:grid-cols-[1.35fr_0.65fr] xl:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-100 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Dengue decision center
            </div>

            <h2 className="mt-5 max-w-3xl text-3xl font-black tracking-tight text-white sm:text-4xl">
              Multi-source dengue command center for faster barangay response planning.
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-7 text-blue-100/90">
              The dashboard combines dengue cases, weather, population, and barangay map boundaries into one clear view for forecasting, hotspot checking, and response priorities.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white backdrop-blur">
                <CheckCircle2 className="h-4 w-4 text-emerald-200" />
                {dataHealth}
              </span>

              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white backdrop-blur">
                <Database className="h-4 w-4 text-blue-200" />
                {formatNumber(acceptedRecords)} accepted record{acceptedRecords === 1 ? '' : 's'}
              </span>

              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white backdrop-blur">
                <Target className="h-4 w-4 text-amber-200" />
                {formatNumber(highRiskCount)} high-risk barangay{highRiskCount === 1 ? '' : 's'}
              </span>

              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white backdrop-blur">
                <Layers3 className="h-4 w-4 text-cyan-200" />
                {integrationStatus} integration
              </span>
            </div>
          </div>

          <div className="rounded-[30px] border border-white/15 bg-white/10 p-5 text-white shadow-2xl backdrop-blur">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-100">
              Current top priority
            </p>

            <h3 className="mt-3 text-2xl font-black tracking-tight">
              {topPriority?.barangay || 'No barangay yet'}
            </h3>

            <p className="mt-2 text-sm leading-6 text-blue-100/90">
              {topPriority
                ? `${formatNumber(topPriority.forecast)} projected cases. Multi-source score: ${formatNumber(topMultiSourceScore)}/100. ${topDecision.environmentalSuitability}.`
                : 'Upload dengue, weather, population, and boundary records to generate the top priority barangay.'}
            </p>

            <button
              type="button"
              onClick={() => navigate('/forecast')}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#1e4e75] shadow-lg transition hover:-translate-y-0.5 hover:bg-blue-50"
            >
              Review forecast
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div
        id="dashboard-summary"
        className="scroll-mt-28 grid grid-cols-2 gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <PremiumStatCard
          title="Total cases"
          value={formatNumber(displayStats.totalCases)}
          helper="Recorded dengue cases in the current workspace"
          icon={Activity}
          tone="blue"
        />

        <PremiumStatCard
          title="High-risk barangays"
          value={formatNumber(displayStats.highRiskCount)}
          helper="Barangays that need immediate attention"
          icon={ShieldAlert}
          tone="red"
        />

        <PremiumStatCard
          title="Forecast total"
          value={formatNumber(displayStats.fourWeekForecast)}
          helper="Expected dengue cases for the selected period"
          icon={BarChart3}
          tone="orange"
        />

        <PremiumStatCard
          title="Data quality"
          value={`${displayStats.dataQuality}%`}
          helper="Accepted records compared with uploaded records"
          icon={CheckCircle2}
          tone="green"
        />
      </div>

      {usingBackendForecast && (
        <div className="rounded-[28px] border border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4 text-sm leading-6 text-brand-green shadow-sm dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-slate-900 dark:text-emerald-300">
          <span className="font-black">Analysis ready:</span>{' '}
          The uploaded dengue records are now being used for dashboard totals, trend view, priority barangays, and monitoring alerts. The system identified{' '}
          {formatNumber(highRiskCount)} high-risk barangay{highRiskCount === 1 ? '' : 's'},{' '}
          {formatNumber(moderateRiskCount)} moderate-risk barangay{moderateRiskCount === 1 ? '' : 's'}, and{' '}
          {formatNumber(lowRiskCount)} low-risk barangay{lowRiskCount === 1 ? '' : 's'}.
        </div>
      )}

      <Panel className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <SectionBadge tone="blue">
              <Layers3 className="h-3.5 w-3.5" />
              Multi-source command summary
            </SectionBadge>

            <h3 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
              Integrated dengue risk intelligence
            </h3>

            <p className="mt-1 max-w-3xl text-sm leading-6 text-brand-muted dark:text-slate-400">
              Shows whether dengue, weather, population, and boundary files are working together for forecasting, mapping, and response planning.
            </p>
          </div>

          <span className={`inline-flex w-fit rounded-full border px-4 py-1.5 text-xs font-black shadow-sm ${getIntegrationStatusStyle(integrationStatus)}`}>
            {integrationStatus} • {formatNumber(integrationScore)}% ready
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[24px] border border-slate-200 bg-gradient-to-br from-white to-blue-50 p-4 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-blue-950/20">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                <Gauge className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                  Avg. risk score
                </p>
                <p className="text-2xl font-black text-brand-text dark:text-slate-100">
                  {averageMultiSourceScore > 0 ? `${formatNumber(averageMultiSourceScore)}/100` : 'No data'}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-brand-muted dark:text-slate-400">
              Average multi-source score across computed barangay risk rows.
            </p>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-gradient-to-br from-white to-sky-50 p-4 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-sky-950/20">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 text-sky-600 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300">
                <CloudRain className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                  Rainfall average
                </p>
                <p className="text-2xl font-black text-brand-text dark:text-slate-100">
                  {environmentalSummary.averageRainfall > 0 ? `${formatDecimal(environmentalSummary.averageRainfall)} mm` : 'No data'}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-brand-muted dark:text-slate-400">
              Weather conditions used in the barangay risk score.
            </p>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-gradient-to-br from-white to-amber-50 p-4 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-amber-950/20">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                <Thermometer className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                  Temperature avg.
                </p>
                <p className="text-2xl font-black text-brand-text dark:text-slate-100">
                  {environmentalSummary.averageTemperature > 0 ? `${formatDecimal(environmentalSummary.averageTemperature)} °C` : 'No data'}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-brand-muted dark:text-slate-400">
              Temperature suitability helps contextualize dengue transmission risk.
            </p>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-gradient-to-br from-white to-emerald-50 p-4 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-emerald-950/20">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                <Droplets className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                  Humidity avg.
                </p>
                <p className="text-2xl font-black text-brand-text dark:text-slate-100">
                  {environmentalSummary.averageHumidity > 0 ? `${formatDecimal(environmentalSummary.averageHumidity)}%` : 'No data'}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-brand-muted dark:text-slate-400">
              Humidity and rainfall support the environmental suitability check.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/70">
            <p className="text-sm font-black text-brand-text dark:text-slate-100">
              Integration checks
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-2">
              {integrationChecks.length > 0 ? (
                integrationChecks.slice(0, 6).map((check) => (
                  <div
                    key={check.label}
                    className="rounded-[20px] border border-slate-200 bg-white px-3 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-start gap-2">
                      {check.ready ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green dark:text-emerald-300" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange dark:text-amber-300" />
                      )}

                      <div>
                        <p className="text-xs font-black text-brand-text dark:text-slate-100">
                          {check.label}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-brand-muted dark:text-slate-400">
                          {check.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-[20px] border border-dashed border-slate-200 bg-white px-4 py-4 text-sm leading-6 text-brand-muted dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 md:col-span-2">
                  Upload the dengue, weather, population, and boundary files so the system can check if they match.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-[26px] border border-blue-100 bg-blue-50/80 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
            <p className="text-sm font-black text-brand-blue dark:text-blue-300">
              Dataset coverage
            </p>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-2xl bg-white/80 px-3 py-2 text-xs font-bold text-brand-muted shadow-sm dark:bg-slate-950/70 dark:text-slate-400">
                <span>Loaded sources</span>
                <span>{formatNumber(sourceHealth.loadedCount)} / {formatNumber(sourceHealth.sourceCount)}</span>
              </div>

              <div className="flex items-center justify-between rounded-2xl bg-white/80 px-3 py-2 text-xs font-bold text-brand-muted shadow-sm dark:bg-slate-950/70 dark:text-slate-400">
                <span>Valid records</span>
                <span>{formatNumber(sourceHealth.totalValid)} / {formatNumber(sourceHealth.totalRecords)}</span>
              </div>

              <div className="flex items-center justify-between rounded-2xl bg-white/80 px-3 py-2 text-xs font-bold text-brand-muted shadow-sm dark:bg-slate-950/70 dark:text-slate-400">
                <span>Weather rows</span>
                <span>{formatNumber(sourceStatus?.weather?.validCount || weatherRecords.length || 0)}</span>
              </div>

              <div className="flex items-center justify-between rounded-2xl bg-white/80 px-3 py-2 text-xs font-bold text-brand-muted shadow-sm dark:bg-slate-950/70 dark:text-slate-400">
                <span>Barangay risk rows</span>
                <span>{formatNumber(displayRiskRows.length)}</span>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.85fr]">
        <Panel className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <SectionBadge tone="rose">
                <TrendingUp className="h-3.5 w-3.5" />
                Trend analysis
              </SectionBadge>

              <h3 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
                Dengue trend
              </h3>

              <p className="mt-1 max-w-xl text-sm leading-6 text-brand-muted dark:text-slate-400">
                {usingBackendForecast
                  ? 'Values show previous average, recent average, and projected forecast periods from the latest analysis.'
                  : 'Weekly case values are recalculated from uploaded or sample dengue records.'}
              </p>
            </div>

            <span className={`inline-flex w-fit rounded-full border px-4 py-1.5 text-xs font-black shadow-sm ${trendStatus.style}`}>
              {trendStatus.label}
            </span>
          </div>

          <div className="mt-5 space-y-4">
  <div className="rounded-[30px] border border-slate-100 bg-gradient-to-b from-white to-slate-50 p-4 shadow-inner dark:border-slate-800 dark:from-slate-950 dark:to-slate-900 dark:shadow-none sm:p-5">
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-muted dark:text-slate-500">
          Dengue case values
        </p>

        <p className="mt-1 text-xs text-brand-muted dark:text-slate-500">
          {trendStatus.description}
        </p>
      </div>

      <div className="w-fit rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-brand-muted dark:bg-slate-800 dark:text-slate-300">
        {usingBackendForecast ? 'Latest analysis' : 'Last 6 periods'}
      </div>
    </div>

    <div className="h-[360px] lg:h-[420px]">
      {weeklyTotals.length > 0 ? (
        <SparkChart values={weeklyTotals} />
      ) : (
        <div className="flex h-full items-center justify-center rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-5 text-center text-sm leading-6 text-brand-muted dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
          No chart available until dengue records are loaded.
        </div>
      )}
    </div>
  </div>

  <div className="grid gap-3 sm:grid-cols-3">
    {riskDistribution.map((item) => (
      <div
        key={item.label}
        className={`rounded-[24px] border p-4 shadow-sm ${item.style}`}
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.16em]">
          {item.label} risk
        </p>

        <div className="mt-3 flex items-end justify-between gap-3">
          <p className="text-4xl font-black">
            {formatNumber(item.value)}
          </p>

          <span className="rounded-full bg-white/70 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] shadow-sm dark:bg-white/10">
            Barangays
          </span>
        </div>

        <p className="mt-2 text-xs font-semibold opacity-80">
          {item.helper}
        </p>
      </div>
    ))}
  </div>
</div>
        </Panel>

        <Panel className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SectionBadge tone="amber">
                <Navigation className="h-3.5 w-3.5" />
                Risk ranking
              </SectionBadge>

              <h3 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
                Priority barangays
              </h3>

              <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                Ranked by multi-source risk score, environmental pressure, projected cases, and response priority.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {priority.length > 0 ? (
              priority.map((row, index) => (
                <div
                  key={`${row.barangay}-${index}`}
                  className="group rounded-[24px] border border-brand-line bg-gradient-to-r from-slate-50 to-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-md dark:border-slate-800 dark:from-slate-950 dark:to-slate-900 dark:shadow-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-sm font-black text-brand-text shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700">
                        {index + 1}
                      </div>

                      <div className="min-w-0">
                        <p className="break-words font-black text-brand-text dark:text-slate-100">
                          {row.barangay}
                        </p>

                        <p className="mt-1 text-xs leading-5 text-brand-muted dark:text-slate-400">
                          Forecast: {formatNumber(row.forecast)} cases • Score: {formatNumber(getMultiSourceScore(row))}/100
                        </p>

                        <p className="text-[11px] font-semibold text-brand-muted dark:text-slate-500">
                          {getDecisionSupport(row).environmentalSuitability}
                        </p>
                      </div>
                    </div>

                    <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-black ${getRiskBadgeStyle(row.risk)}`}>
                      {row.risk}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-[18px] border border-slate-100 bg-white/80 px-3 py-2 text-xs leading-5 text-brand-muted dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-400">
                      <span className="font-black text-brand-text dark:text-slate-200">
                        Rainfall:
                      </span>{' '}
                      {getDecisionSupport(row).rainfallPressure}
                    </div>

                    <div className="rounded-[18px] border border-slate-100 bg-white/80 px-3 py-2 text-xs leading-5 text-brand-muted dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-400">
                      <span className="font-black text-brand-text dark:text-slate-200">
                        Exposure:
                      </span>{' '}
                      {getDecisionSupport(row).populationExposure}
                    </div>
                  </div>

                  <p className="mt-3 rounded-[18px] border border-slate-100 bg-white/80 px-3 py-2 text-xs leading-5 text-brand-muted dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-400">
                    {getDecisionSupport(row).summary}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-brand-muted dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                No priority barangay list is available yet.
              </div>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_0.85fr_1fr]">
        <Panel className="p-6">
          <SectionBadge tone="blue">
            <Layers3 className="h-3.5 w-3.5" />
            Navigation
          </SectionBadge>

          <h3 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
            Quick actions
          </h3>

          <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
            Continue the dengue monitoring workflow.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:block sm:space-y-3">
            {actions.map((action) => {
              const Icon = action.icon

              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => handleQuickActionNavigation(actionRoutes[action.label])}
                  className="group flex min-h-[132px] w-full flex-col items-start justify-between gap-3 overflow-hidden rounded-[24px] border border-brand-line bg-gradient-to-r from-white to-slate-50 px-3 py-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-md dark:border-slate-800 dark:from-slate-950 dark:to-slate-900 dark:shadow-none sm:min-h-0 sm:flex-row sm:items-center sm:px-4 sm:py-4"
                >
                  <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border sm:h-11 sm:w-11 ${action.style}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm font-black leading-tight text-brand-text dark:text-slate-100">
                        {action.label}
                      </p>

                      <p className="mt-1 text-xs leading-5 text-brand-muted dark:text-slate-400 sm:mt-0.5">
                        {action.description}
                      </p>
                    </div>
                  </div>

                  <ArrowRight className="mt-auto h-4 w-4 text-brand-muted transition group-hover:translate-x-1 group-hover:text-brand-blue dark:text-slate-500 dark:group-hover:text-blue-300 sm:mt-0" />
                </button>
              )
            })}

            <button
              type="button"
              onClick={resetSampleData}
              className="group flex min-h-[132px] w-full flex-col items-start justify-between gap-3 overflow-hidden rounded-[24px] border border-slate-200 bg-white px-3 py-3 text-left text-slate-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-rose-200 hover:text-rose-600 hover:shadow-md dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:shadow-none dark:hover:border-rose-500/30 dark:hover:text-rose-300 sm:min-h-0 sm:flex-row sm:items-center sm:px-4 sm:py-4"
            >
              <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900 sm:h-11 sm:w-11">
                  <RefreshCcw className="h-5 w-5" />
                </div>

                <div>
                  <p className="text-sm font-black leading-tight">Reset workspace</p>

                  <p className="mt-1 text-xs leading-5 text-brand-muted dark:text-slate-400 sm:mt-0.5">
                    Clear uploaded results and return to an empty workspace.
                  </p>
                </div>
              </div>

              <ArrowRight className="mt-auto h-4 w-4 transition group-hover:translate-x-1 sm:mt-0" />
            </button>
          </div>
        </Panel>

        <Panel className="p-6">
          <SectionBadge tone="amber">
            <AlertTriangle className="h-3.5 w-3.5" />
            Live updates
          </SectionBadge>

          <h3 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
            Recent alerts
          </h3>

          <div className="mt-5 space-y-4">
            {alertCards.map((alert) => {
              const Icon = alert.icon

              return (
                <div
                  key={alert.title}
                  className={`rounded-[24px] border p-4 shadow-sm ${alert.style}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/70 shadow-sm dark:bg-white/10">
                      <Icon className="h-5 w-5 text-brand-text dark:text-slate-100" />
                    </div>

                    <div>
                      <p className="text-sm font-black text-brand-text dark:text-slate-100">
                        {alert.title}
                      </p>

                      <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                        {alert.message}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>

        <Panel className="p-6">
          <SectionBadge tone="emerald">
            <Database className="h-3.5 w-3.5" />
            Data readiness
          </SectionBadge>

          <h3 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
            Source summary
          </h3>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:block sm:space-y-3">
            {Object.entries(sourceStatus || {}).map(([key, item = {}]) => (
              <div
                key={key}
                className="min-h-[138px] overflow-hidden rounded-[24px] border border-brand-line bg-gradient-to-r from-slate-50 to-white p-3 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-slate-900 dark:shadow-none sm:min-h-0 sm:p-4"
              >
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black capitalize text-brand-text dark:text-slate-100">
                      {key}
                    </p>

                    <p className="mt-1 max-w-full truncate text-[11px] leading-4 text-brand-muted dark:text-slate-400 sm:text-xs sm:leading-5">
                      {item.uploadedName || 'No file uploaded'}
                    </p>
                  </div>

                  <span className={`w-fit shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black leading-none sm:px-3 sm:text-[11px] ${getStatusStyle(item.badge)}`}>
                    {item.badge || 'No status'}
                  </span>
                </div>

                <div className="mt-3 rounded-2xl border border-slate-100 bg-white px-3 py-2 text-[11px] font-bold leading-4 text-brand-muted shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 sm:flex sm:items-center sm:justify-between sm:text-xs">
                  <span className="block">Accepted records</span>
                  <span className="mt-1 block font-black text-brand-text dark:text-slate-100 sm:mt-0">
                    {formatNumber(item.validCount || 0)} / {formatNumber(item.recordCount || 0)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel className="p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <SectionBadge>
              <Clock3 className="h-3.5 w-3.5" />
              Activity trail
            </SectionBadge>

            <h3 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
              Recent system actions
            </h3>
          </div>

          <button
            type="button"
            onClick={() => navigate('/reports')}
            className="inline-flex w-fit items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-black text-brand-blue transition hover:bg-blue-100 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
          >
            Open reports
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {latestLogs.length > 0 ? (
            latestLogs.map((log) => (
              <div
                key={log.id}
                className="rounded-[24px] border border-blue-100 bg-blue-50/60 p-4 shadow-sm dark:border-blue-500/20 dark:bg-blue-500/10"
              >
                <p className="text-sm font-black text-brand-text dark:text-slate-100">
                  {log.action}
                </p>

                <p className="mt-1 text-xs font-semibold text-brand-muted dark:text-slate-500">
                  {new Date(log.timestamp).toLocaleString()}
                </p>

                <p className="mt-2 text-sm leading-6 text-brand-muted dark:text-slate-400">
                  {log.details}
                </p>
              </div>
            ))
          ) : (
            <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-brand-muted dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 lg:col-span-3">
              No activity recorded yet.
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}
