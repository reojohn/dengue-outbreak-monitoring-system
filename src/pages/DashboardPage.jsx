import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
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
  Search,
  ShieldAlert,
  Sparkles,
  Thermometer,
  TrendingUp,
  UploadCloud,
  X,
} from 'lucide-react'
import SectionTitle from '../components/SectionTitle'
import dashboardBackground from '../assets/dashboard1.png'
import { useData } from '../context/DataContext'
import {
  compareCanonicalBarangayPriority,
  computeDecisionSupport,
  computeMultiSourceRisk,
  getCanonicalCombinedRiskScore,
  riskStyles,
} from '../utils/analytics'

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

function getForecastPeriodDisplay(backendForecastResult = null) {
  const forecastRows = Array.isArray(backendForecastResult?.forecast_results)
    ? backendForecastResult.forecast_results
    : []
  const periodLabels = forecastRows
    .map((row) => String(row?.latest_period || '').trim())
    .filter(Boolean)
  const monthlyPeriodCount = periodLabels.filter((value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value)).length
  const weeklyPeriodCount = periodLabels.filter((value) => /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/i.test(value)).length
  const periodsLookMonthly =
    periodLabels.length > 0 && monthlyPeriodCount >= Math.ceil(periodLabels.length * 0.8)
  const periodsLookWeekly =
    periodLabels.length > 0 && weeklyPeriodCount >= Math.ceil(periodLabels.length * 0.8)

  const rawUnit = String(
    backendForecastResult?.forecast_period_unit ||
      backendForecastResult?.validation_summary?.forecast_period_unit ||
      ''
  )
    .trim()
    .toLowerCase()

  const granularity = String(
    backendForecastResult?.temporal_granularity ||
      backendForecastResult?.validation_summary?.temporal_granularity ||
      ''
  )
    .trim()
    .toLowerCase()

  const unit = periodsLookMonthly
    ? 'month'
    : periodsLookWeekly
      ? 'week'
      : rawUnit ||
        (granularity.includes('month')
          ? 'month'
          : granularity.includes('day')
            ? 'day'
            : 'week')

  if (unit.startsWith('month')) {
    return {
      unit: 'month',
      singular: 'month',
      plural: 'months',
      adjective: 'Monthly',
      prefix: 'M',
    }
  }

  if (unit.startsWith('day')) {
    return {
      unit: 'day',
      singular: 'day',
      plural: 'days',
      adjective: 'Daily',
      prefix: 'D',
    }
  }

  if (unit.startsWith('week')) {
    return {
      unit: 'week',
      singular: 'week',
      plural: 'weeks',
      adjective: 'Weekly',
      prefix: 'W',
    }
  }

  return {
    unit: 'period',
    singular: 'period',
    plural: 'periods',
    adjective: 'Forecast-period',
    prefix: 'P',
  }
}

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
  return getCanonicalCombinedRiskScore(row)
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
  const backendRows = Array.isArray(backendForecastResult?.forecast_results)
    ? backendForecastResult.forecast_results
    : []
  const combinedLookup = buildCombinedDatasetLookup(backendMergedDataset)

  return backendRows
    .map((row) => {
      const barangay = row.barangay || 'Unspecified barangay'
      const barangayKey =
        row.barangay_key ||
        row.barangayKey ||
        normalizeDashboardBarangayKey(barangay)
      const combinedRows = combinedLookup.get(barangayKey) || []
      const combinedSummary = summarizeCombinedRows(combinedRows)

      const forecast = toNumber(
        row.forecast_next_4_periods ??
          row.forecastNext4Periods ??
          row.forecast ??
          row.forecastedCases,
        0
      )
      const forecastNextPeriod = toNumber(
        row.forecast_next_period ??
          row.forecastNextPeriod ??
          row.currentCases,
        0
      )
      const recentAverage = toNumber(
        row.recent_average_cases ??
          row.recentAverageCases ??
          row.recentAverage,
        0
      )
      const previousAverage = toNumber(
        row.previous_average_cases ??
          row.previousAverageCases ??
          row.previousAverage,
        0
      )
      const historicalTotalCases = toNumber(
        row.historical_total_cases ??
          row.historicalTotalCases ??
          row.totalCases ??
          row.cases,
        0
      )
      const trendDirection =
        row.trend_direction ||
        row.trendDirection ||
        row.trend ||
        'Stable'
      const recommendation =
        row.recommendation ||
        row.recommendedAction ||
        ''

      const averageRainfall = normalizeClimateValue(
        row.average_rainfall ??
          row.averageRainfall ??
          row.avg_rainfall ??
          row.avgRainfall ??
          combinedSummary.averageRainfall,
        'rainfall'
      )
      const averageTemperature = normalizeClimateValue(
        row.average_temperature ??
          row.averageTemperature ??
          row.avg_temperature ??
          row.avgTemperature ??
          combinedSummary.averageTemperature,
        'temperature'
      )
      const averageHumidity = normalizeClimateValue(
        row.average_humidity ??
          row.averageHumidity ??
          row.avg_humidity ??
          row.avgHumidity ??
          combinedSummary.averageHumidity,
        'humidity'
      )
      const population = toNumber(
        row.population ??
          row.total_population ??
          row.totalPopulation ??
          combinedSummary.population,
        0
      )
      const areaSqKm = toNumber(
        row.boundary_area_sqkm ??
          row.boundaryAreaSqKm ??
          row.area_sqkm ??
          row.areaSqKm ??
          combinedSummary.areaSqKm,
        0
      )
      const density =
        toNumber(
          row.density ??
            row.population_density ??
            row.populationDensity ??
            combinedSummary.density,
          0
        ) ||
        (population > 0 && areaSqKm > 0 ? population / areaSqKm : 0)

      const history = [
        previousAverage,
        recentAverage,
        forecastNextPeriod,
      ].filter((value) => Number.isFinite(Number(value)))

      const fallbackMultiSourceRisk = computeMultiSourceRisk({
        forecast,
        currentCases: forecastNextPeriod,
        forecastNextPeriod,
        forecast_next_period: forecastNextPeriod,
        previousCases: previousAverage,
        totalCases: historicalTotalCases,
        trend: trendDirection,
        recentAverage,
        previousAverage,
        history,
        weeklyCases: history,
        population,
        areaSqKm,
        density,
        averageRainfall,
        averageTemperature,
        averageHumidity,
      })

      const savedCombinedRiskScore = getCanonicalCombinedRiskScore(row)
      const combinedRiskScore =
        savedCombinedRiskScore > 0
          ? savedCombinedRiskScore
          : toNumber(fallbackMultiSourceRisk?.score, 0)

      const risk =
        row.risk_level ||
        row.risk ||
        fallbackMultiSourceRisk?.risk ||
        'Low'

      const riskComponents =
        row.risk_components ||
        row.riskComponents ||
        fallbackMultiSourceRisk?.components ||
        {}

      const fallbackEnvironment =
        fallbackMultiSourceRisk?.environmentalSuitability || {}

      const rowData = {
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
        priorityRank: toNumber(row.priority_rank ?? row.priorityRank, 0),
        recommendation,
        recommendedAction: recommendation,
        historicalTotalCases,
        latestPeriod: row.latest_period || row.latestPeriod || '',
        trendDirection,
        trend: trendDirection,
        trendLabel: trendDirection,
        recentAverage,
        previousAverage,

        combinedRiskScore,
        combined_risk_score: combinedRiskScore,
        multiSourceRiskScore: combinedRiskScore,
        multi_source_risk_score: combinedRiskScore,
        overallRiskScore: combinedRiskScore,
        overall_risk_score: combinedRiskScore,
        riskScore: combinedRiskScore,

        averageRainfall,
        avgRainfall: averageRainfall,
        averageTemperature,
        avgTemperature: averageTemperature,
        averageHumidity,
        avgHumidity: averageHumidity,
        population,
        areaSqKm,
        area_sqkm: areaSqKm,
        density,

        environmentalSuitability:
          row.environmental_suitability ||
          row.environmentalSuitability ||
          fallbackEnvironment.label ||
          combinedSummary.environmentalSuitability,
        rainfallPressure:
          row.rainfall_pressure ||
          row.rainfallPressure ||
          fallbackEnvironment.rainfallPressure?.label ||
          combinedSummary.rainfallPressure,
        temperatureSuitability:
          row.temperature_suitability ||
          row.temperatureSuitability ||
          fallbackEnvironment.temperatureSuitability?.label ||
          combinedSummary.temperatureSuitability,
        humiditySuitability:
          row.humidity_suitability ||
          row.humiditySuitability ||
          fallbackEnvironment.humiditySuitability?.label ||
          combinedSummary.humiditySuitability,
        populationExposure:
          row.population_exposure ||
          row.populationExposure ||
          combinedSummary.populationExposure,
        densityLevel:
          row.density_level ||
          row.densityLevel ||
          combinedSummary.densityLevel,
        riskComponents,
      }

      const computedDecisionSupport = computeDecisionSupport(rowData)
      const summary =
        recommendation ||
        computedDecisionSupport.summary ||
        'Continue dengue prevention and barangay-level monitoring.'

      const decisionSupport = {
        ...computedDecisionSupport,
        summary,
        recommendedAction: summary,
        primaryAction: summary,
        actions: recommendation
          ? [recommendation]
          : computedDecisionSupport.actions,
        rationale: [
          `${barangay} has a combined multi-source risk score of ${formatNumber(combinedRiskScore)}/100.`,
          `${formatNumber(forecast)} cases are expected in the forecast window.`,
          rowData.environmentalSuitability,
        ].filter(Boolean),
        multiSourceRiskScore: combinedRiskScore,
        riskScore: combinedRiskScore,
        riskComponents,
      }

      return {
        ...rowData,
        responsePriority: decisionSupport.priority,
        decisionScore: decisionSupport.score,
        forecastPressure:
          decisionSupport.forecastPressure ||
          getForecastPressureLabel(forecast),
        decisionSupport,
      }
    })
    .sort(compareCanonicalBarangayPriority)
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
  const explicitBarangayMatchStatuses = mergedRows
    .map((row) =>
      String(
        row.barangay_match_status ||
          row.barangayMatchStatus ||
          ''
      )
        .trim()
        .toLowerCase()
    )
    .filter(Boolean)

  const explicitBarangayMatchesReady =
    explicitBarangayMatchStatuses.length > 0 &&
    explicitBarangayMatchStatuses.every((status) => {
      return (
        status.includes('exact') ||
        status.includes('matched') ||
        status.includes('auto') ||
        status.includes('found')
      )
    })

  const expectedBarangayCount = Math.max(
    toNumber(backendForecastResult?.barangay_count, 0),
    toNumber(backendForecastResult?.total_barangays, 0),
    toNumber(sourceStatus?.boundary?.validCount, 0),
    toNumber(sourceStatus?.population?.validCount, 0),
    86
  )

  const forecastBarangayCount = new Set(
    forecastRows
      .map((row) =>
        normalizeDashboardBarangayKey(
          row?.barangay ||
            row?.barangay_original ||
            row?.barangayOriginal ||
            ''
        )
      )
      .filter(Boolean)
  ).size

  const savedForecastCoverageReady =
    hasAllSources &&
    hasForecastRows &&
    hasBoundaryRows &&
    forecastBarangayCount >= expectedBarangayCount

  const barangayMatchReady =
    explicitBarangayMatchesReady ||
    savedForecastCoverageReady

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
        ? 'Barangay names are matched across the saved forecast, population, weather, and boundary records.'
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
  const backendRows = Array.isArray(backendForecastResult?.forecast_results)
    ? backendForecastResult.forecast_results
    : []

  if (!backendRows.length) return []

  const previousAverageTotal = backendRows.reduce((sum, row) => {
    return sum + toNumber(row?.previous_average_cases, 0)
  }, 0)

  const recentAverageTotal = backendRows.reduce((sum, row) => {
    return sum + toNumber(row?.recent_average_cases, 0)
  }, 0)

  const directHorizonCount = Math.max(
    0,
    ...backendRows.map((row) => {
      const predictions =
        row?.forecast_period_predictions ||
        row?.forecastPeriodPredictions ||
        []

      return Array.isArray(predictions) ? predictions.length : 0
    })
  )

  if (directHorizonCount > 0) {
    const directHorizonTotals = Array.from(
      { length: directHorizonCount },
      (_, horizonIndex) => {
        return Math.round(
          backendRows.reduce((sum, row) => {
            const predictions =
              row?.forecast_period_predictions ||
              row?.forecastPeriodPredictions ||
              []

            if (!Array.isArray(predictions)) return sum

            const orderedPredictions = [...predictions].sort((first, second) => {
              const firstHorizon = toNumber(first?.horizon, 0)
              const secondHorizon = toNumber(second?.horizon, 0)

              return firstHorizon - secondHorizon
            })

            const prediction = orderedPredictions[horizonIndex]
            const predictedCases = toNumber(
              prediction?.predicted_cases ?? prediction?.predictedCases,
              0
            )

            return sum + predictedCases
          }, 0)
        )
      }
    )

    return [
      Math.round(previousAverageTotal),
      Math.round(recentAverageTotal),
      ...directHorizonTotals,
    ]
  }

  const nextPeriodTotal = backendRows.reduce((sum, row) => {
    return sum + toNumber(row?.forecast_next_period, 0)
  }, 0)

  const fallbackHorizonCount = Math.max(
    1,
    toNumber(
      backendForecastResult?.forecast_horizon_periods ||
        backendForecastResult?.validation_summary?.forecast_horizon_periods,
      4
    )
  )

  return [
    Math.round(previousAverageTotal),
    Math.round(recentAverageTotal),
    ...Array.from({ length: fallbackHorizonCount }, () =>
      Math.round(nextPeriodTotal)
    ),
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

function CurvedCardTab({
  icon: Icon = Sparkles,
  tone = 'blue',
  label = '',
  compact = false,
}) {
  const toneMap = {
    blue:
      'border-blue-200/70 bg-blue-50/90 text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200',
    red:
      'border-rose-200/70 bg-rose-50/90 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200',
    orange:
      'border-amber-200/70 bg-amber-50/90 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200',
    green:
      'border-emerald-200/70 bg-emerald-50/90 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200',
    amber:
      'border-amber-200/70 bg-amber-50/90 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200',
    emerald:
      'border-emerald-200/70 bg-emerald-50/90 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200',
    rose:
      'border-rose-200/70 bg-rose-50/90 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200',
    slate:
      'border-slate-200/80 bg-slate-100/90 text-slate-600 dark:border-slate-600/40 dark:bg-slate-700/30 dark:text-slate-200',
  }

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border font-black uppercase shadow-sm backdrop-blur-md ${
        compact
          ? 'px-3 py-1.5 text-[9px] tracking-[0.15em]'
          : 'px-3.5 py-2 text-[10px] tracking-[0.16em]'
      } ${toneMap[tone] || toneMap.blue}`}
    >
      <Icon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} strokeWidth={2.25} />
      {label ? <span className="whitespace-nowrap">{label}</span> : null}
    </div>
  )
}

function PremiumStatCard({
  title,
  value,
  helper,
  icon: Icon,
  tone = 'blue',
  onClick = null,
  clickLabel = 'View barangays',
}) {
  const toneMap = {
    blue: {
      surface:
        'border-blue-200/70 bg-gradient-to-br from-blue-50/95 via-white to-cyan-50/80 dark:border-blue-400/20 dark:from-blue-500/[0.12] dark:via-slate-950 dark:to-cyan-500/5',
      icon:
        'border-blue-200/80 bg-white text-blue-700 shadow-[0_12px_28px_rgba(37,99,235,0.16)] dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-200',
      glow: 'bg-blue-400/25',
      line: 'from-blue-600 via-cyan-400 to-sky-300',
      value: 'text-blue-950 dark:text-blue-50',
      signal: 'bg-blue-500 dark:bg-blue-300',
      chip:
        'border-blue-200/80 bg-blue-100/80 text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200',
    },
    red: {
      surface:
        'border-rose-200/70 bg-gradient-to-br from-rose-50/95 via-white to-orange-50/75 dark:border-rose-400/20 dark:from-rose-500/[0.12] dark:via-slate-950 dark:to-orange-500/5',
      icon:
        'border-rose-200/80 bg-white text-rose-700 shadow-[0_12px_28px_rgba(225,29,72,0.16)] dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-200',
      glow: 'bg-rose-400/25',
      line: 'from-rose-600 via-orange-400 to-amber-300',
      value: 'text-rose-950 dark:text-rose-50',
      signal: 'bg-rose-500 dark:bg-rose-300',
      chip:
        'border-rose-200/80 bg-rose-100/80 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200',
    },
    orange: {
      surface:
        'border-amber-200/70 bg-gradient-to-br from-amber-50/95 via-white to-orange-50/80 dark:border-amber-400/20 dark:from-amber-500/[0.12] dark:via-slate-950 dark:to-orange-500/5',
      icon:
        'border-amber-200/80 bg-white text-amber-700 shadow-[0_12px_28px_rgba(217,119,6,0.16)] dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200',
      glow: 'bg-amber-400/25',
      line: 'from-amber-600 via-orange-400 to-yellow-300',
      value: 'text-amber-950 dark:text-amber-50',
      signal: 'bg-amber-500 dark:bg-amber-300',
      chip:
        'border-amber-200/80 bg-amber-100/80 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200',
    },
    green: {
      surface:
        'border-emerald-200/70 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/80 dark:border-emerald-400/20 dark:from-emerald-500/[0.12] dark:via-slate-950 dark:to-teal-500/5',
      icon:
        'border-emerald-200/80 bg-white text-emerald-700 shadow-[0_12px_28px_rgba(5,150,105,0.16)] dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200',
      glow: 'bg-emerald-400/25',
      line: 'from-emerald-600 via-teal-400 to-cyan-300',
      value: 'text-emerald-950 dark:text-emerald-50',
      signal: 'bg-emerald-500 dark:bg-emerald-300',
      chip:
        'border-emerald-200/80 bg-emerald-100/80 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200',
    },
  }

  const style = toneMap[tone] || toneMap.blue
  const CardComponent = onClick ? 'button' : 'article'

  return (
    <CardComponent
      type={onClick ? 'button' : undefined}
      onClick={onClick || undefined}
      aria-label={onClick ? `${title}. ${clickLabel}` : undefined}
      className={`group relative min-h-[188px] w-full overflow-hidden rounded-[30px] border p-5 text-left shadow-[0_20px_54px_rgba(15,23,42,0.08)] ring-1 ring-white/80 transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_30px_76px_rgba(15,23,42,0.15)] focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/40 dark:ring-white/5 dark:hover:shadow-[0_30px_76px_rgba(2,6,23,0.38)] sm:min-h-[205px] sm:p-6 ${onClick ? 'cursor-pointer' : ''} ${style.surface}`}
    >
      <div className={`pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full blur-3xl transition-transform duration-500 group-hover:scale-125 ${style.glow}`} />
      <div className="pointer-events-none absolute right-5 top-5 h-20 w-20 rounded-full border border-white/70 opacity-60 dark:border-white/5" />
      <div className="pointer-events-none absolute right-9 top-9 h-12 w-12 rounded-full border border-white/80 opacity-70 dark:border-white/5" />
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${style.line}`} />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.19em] text-slate-500 dark:text-slate-400 sm:text-[11px]">
                {title}
              </p>
              <span className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] ${style.chip}`}>
                Live
              </span>
            </div>

            <h3 className={`mt-4 break-words text-[2.1rem] font-black leading-none tracking-[-0.05em] sm:text-[2.55rem] ${style.value}`}>
              {value}
            </h3>
          </div>

          <div className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] border ${style.icon}`}>
            <div className={`pointer-events-none absolute inset-2 rounded-[14px] opacity-10 ${style.signal}`} />
            <Icon className="relative h-6 w-6" strokeWidth={2.25} />
          </div>
        </div>

        <div className="mt-auto pt-5">
          <div className="mb-3 flex items-end gap-1.5" aria-hidden="true">
            {[42, 62, 52, 82, 68].map((height, index) => (
              <span
                key={`${title}-signal-${index}`}
                className={`w-full rounded-full ${style.signal}`}
                style={{
                  height: `${Math.max(4, Math.round(height / 8))}px`,
                  opacity: index === 3 ? 1 : 0.45,
                }}
              />
            ))}
          </div>

          <p className="max-w-[270px] text-xs font-semibold leading-5 text-slate-600 dark:text-slate-400 sm:text-[13px]">
            {helper}
          </p>

          {onClick && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-sky-700 dark:text-slate-400 dark:group-hover:text-sky-300">
              {clickLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
          )}
        </div>
      </div>
    </CardComponent>
  )
}

function DashboardBarangayListModal({ config, onClose, onOpenForecast }) {
  const [searchQuery, setSearchQuery] = useState('')
  const rows = Array.isArray(config?.rows) ? config.rows : []

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    if (!query) return rows

    return rows.filter((row) => {
      const decision = getDecisionSupport(row)
      const searchableText = [
        row?.barangay,
        row?.risk,
        row?.trendLabel,
        row?.trendDirection,
        row?.trend,
        decision.priority,
        decision.summary,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchableText.includes(query)
    })
  }, [rows, searchQuery])

  const toneMap = {
    blue: {
      badge: 'border-sky-300/25 bg-sky-300/10 text-sky-100',
      icon: 'border-sky-300/20 bg-sky-300/10 text-sky-200',
      accent: 'from-sky-400 via-cyan-300 to-blue-400',
    },
    red: {
      badge: 'border-rose-300/25 bg-rose-300/10 text-rose-100',
      icon: 'border-rose-300/20 bg-rose-300/10 text-rose-200',
      accent: 'from-rose-500 via-orange-400 to-amber-300',
    },
    orange: {
      badge: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
      icon: 'border-amber-300/20 bg-amber-300/10 text-amber-200',
      accent: 'from-amber-500 via-orange-400 to-yellow-300',
    },
    emerald: {
      badge: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
      icon: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200',
      accent: 'from-emerald-500 via-teal-400 to-cyan-300',
    },
  }

  const style = toneMap[config?.tone] || toneMap.blue

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dashboard-barangay-list-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-950/75 backdrop-blur-md"
        onClick={onClose}
        aria-label="Close barangay list"
      />

      <section className="relative z-10 flex max-h-[calc(100vh-1.5rem)] w-full max-w-[920px] flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#07111f] text-white shadow-[0_36px_120px_rgba(2,6,23,0.72)] ring-1 ring-cyan-300/10 sm:max-h-[calc(100vh-3rem)] sm:rounded-[36px]">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-12 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className={`pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent ${style.accent} to-transparent`} />

        <div className="relative border-b border-white/10 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3.5">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[17px] border ${style.icon}`}>
                <MapPinned className="h-5 w-5" />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${style.badge}`}>
                    Barangay list
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">
                    {formatNumber(rows.length)} total
                  </span>
                </div>

                <h2 id="dashboard-barangay-list-title" className="mt-3 text-2xl font-black tracking-[-0.035em] text-white sm:text-3xl">
                  {config?.title || 'Barangay list'}
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
                  {config?.description || 'Review the barangays included in this dashboard indicator.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-300 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-400/30 hover:bg-rose-500/10 hover:text-rose-200"
              aria-label="Close barangay list"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <label className="relative mt-5 block">
            <span className="sr-only">Search barangays</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search barangay, risk, priority, or trend"
              autoFocus
              className="w-full rounded-[18px] border border-white/10 bg-slate-950/70 py-3 pl-11 pr-4 text-sm font-semibold text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10"
            />
          </label>
        </div>

        <div className="dengue-premium-scrollbar relative min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          {filteredRows.length > 0 ? (
            <div className="space-y-3">
              {filteredRows.map((row, index) => {
                const decision = getDecisionSupport(row)
                const score = Math.max(0, Math.min(100, getMultiSourceScore(row)))
                const historicalTotal = toNumber(
                  row?.totalCases ?? row?.historicalTotalCases ?? row?.cases,
                  0
                )
                const trend =
                  row?.trendLabel || row?.trendDirection || row?.trend || 'Stable'

                return (
                  <div
                    key={`${row?.barangay || 'barangay'}-${index}`}
                    className="group/modal-row relative overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-br from-white/[0.07] via-slate-950/70 to-cyan-400/[0.04] p-4 shadow-[0_12px_32px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:border-cyan-300/25 hover:bg-white/[0.09]"
                  >
                    <div className={`absolute inset-y-4 left-0 w-1 rounded-r-full bg-gradient-to-b ${style.accent}`} />

                    <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] border border-white/10 bg-white/10 text-xs font-black text-white">
                          #{index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="break-words text-base font-black text-white">
                            {row?.barangay || 'Unspecified barangay'}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-400">
                            {formatNumber(row?.forecast || 0)} projected cases · {formatNumber(score)}/100 risk score
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${getRiskBadgeStyle(row?.risk)}`}>
                          {row?.risk || 'Pending'}
                        </span>
                        <span className="rounded-full border border-sky-300/15 bg-sky-300/10 px-2.5 py-1 text-[10px] font-black text-sky-200">
                          {decision.priority}
                        </span>
                      </div>
                    </div>

                    <div className="relative mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        ['Projected', `${formatNumber(row?.forecast || 0)} cases`],
                        ['Historical total', `${formatNumber(historicalTotal)} cases`],
                        ['Risk score', `${formatNumber(score)}/100`],
                        ['Trend', trend],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-[16px] border border-white/10 bg-slate-950/45 px-3 py-2.5">
                          <p className="text-[9px] font-black uppercase tracking-[0.13em] text-slate-500">
                            {label}
                          </p>
                          <p className="mt-1 text-xs font-black text-slate-200">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex min-h-[220px] items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-5 text-center">
              <div>
                <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-300" />
                <p className="mt-3 text-sm font-black text-white">
                  No barangays found
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  No barangays match this category or search term.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="relative flex flex-col gap-3 border-t border-white/10 bg-slate-950/45 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs leading-5 text-slate-400">
            Rankings and values use the same canonical forecast data shown across the system.
          </p>
          <button
            type="button"
            onClick={onOpenForecast}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[16px] border border-cyan-300/20 bg-cyan-300/10 px-4 py-2.5 text-xs font-black text-cyan-100 transition hover:-translate-y-0.5 hover:bg-cyan-300/15"
          >
            Open full forecast
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>,
    document.body
  )
}

function SignalCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = 'blue',
}) {
  const toneMap = {
    blue: {
      surface:
        'border-blue-200/70 bg-gradient-to-br from-blue-50/95 via-white to-cyan-50/75 dark:border-blue-400/20 dark:from-blue-500/10 dark:via-slate-950 dark:to-cyan-500/5',
      icon:
        'border-blue-200/80 bg-white text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200',
      glow: 'bg-blue-400/20',
      line: 'from-blue-600 via-cyan-400 to-transparent',
      meter: 'from-blue-600 to-cyan-400',
    },
    sky: {
      surface:
        'border-sky-200/70 bg-gradient-to-br from-sky-50/95 via-white to-blue-50/75 dark:border-sky-400/20 dark:from-sky-500/10 dark:via-slate-950 dark:to-blue-500/5',
      icon:
        'border-sky-200/80 bg-white text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200',
      glow: 'bg-sky-400/20',
      line: 'from-sky-600 via-blue-400 to-transparent',
      meter: 'from-sky-600 to-blue-400',
    },
    amber: {
      surface:
        'border-amber-200/70 bg-gradient-to-br from-amber-50/95 via-white to-orange-50/75 dark:border-amber-400/20 dark:from-amber-500/10 dark:via-slate-950 dark:to-orange-500/5',
      icon:
        'border-amber-200/80 bg-white text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200',
      glow: 'bg-amber-400/20',
      line: 'from-amber-600 via-orange-400 to-transparent',
      meter: 'from-amber-600 to-orange-400',
    },
    emerald: {
      surface:
        'border-emerald-200/70 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/75 dark:border-emerald-400/20 dark:from-emerald-500/10 dark:via-slate-950 dark:to-teal-500/5',
      icon:
        'border-emerald-200/80 bg-white text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200',
      glow: 'bg-emerald-400/20',
      line: 'from-emerald-600 via-teal-400 to-transparent',
      meter: 'from-emerald-600 to-teal-400',
    },
  }

  const style = toneMap[tone] || toneMap.blue

  return (
    <article
      className={`group relative min-h-[178px] overflow-hidden rounded-[28px] border p-4 shadow-[0_16px_40px_rgba(15,23,42,0.07)] ring-1 ring-white/70 transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_58px_rgba(15,23,42,0.13)] dark:ring-white/5 ${style.surface}`}
    >
      <div className={`pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl transition-transform duration-500 group-hover:scale-125 ${style.glow}`} />
      <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${style.line}`} />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-[18px] border shadow-sm ${style.icon}`}>
            <Icon className="h-5 w-5" strokeWidth={2.25} />
          </div>

          <span className="rounded-full border border-white/80 bg-white/75 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-slate-500 shadow-sm dark:border-white/5 dark:bg-white/5 dark:text-slate-400">
            Signal
          </span>
        </div>

        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          {label}
        </p>

        <p className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-950 dark:text-slate-100">
          {value}
        </p>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/80 shadow-inner dark:bg-slate-800">
          <div className={`h-full w-[72%] rounded-full bg-gradient-to-r ${style.meter}`} />
        </div>

        <p className="mt-3 text-xs font-medium leading-5 text-slate-600 dark:text-slate-400">
          {helper}
        </p>
      </div>
    </article>
  )
}

function getRiskCardTheme(risk = '') {
  if (risk === 'High') {
    return {
      surface:
        'border-rose-300/70 bg-gradient-to-br from-rose-50/95 via-white to-orange-50/75 dark:border-rose-400/25 dark:from-rose-500/[0.12] dark:via-slate-950 dark:to-orange-500/5',
      rail: 'from-rose-600 via-orange-400 to-amber-300',
      glow: 'bg-rose-400/20',
      rank:
        'border-rose-200 bg-rose-600 text-white shadow-[0_12px_28px_rgba(225,29,72,0.28)] dark:border-rose-400/30 dark:bg-rose-500',
    }
  }

  if (risk === 'Moderate') {
    return {
      surface:
        'border-amber-300/70 bg-gradient-to-br from-amber-50/95 via-white to-yellow-50/75 dark:border-amber-400/25 dark:from-amber-500/[0.12] dark:via-slate-950 dark:to-yellow-500/5',
      rail: 'from-amber-600 via-orange-400 to-yellow-300',
      glow: 'bg-amber-400/20',
      rank:
        'border-amber-200 bg-amber-500 text-white shadow-[0_12px_28px_rgba(217,119,6,0.25)] dark:border-amber-400/30 dark:bg-amber-500',
    }
  }

  return {
    surface:
      'border-emerald-300/70 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/75 dark:border-emerald-400/25 dark:from-emerald-500/[0.12] dark:via-slate-950 dark:to-teal-500/5',
    rail: 'from-emerald-600 via-teal-400 to-cyan-300',
    glow: 'bg-emerald-400/20',
    rank:
      'border-emerald-200 bg-emerald-600 text-white shadow-[0_12px_28px_rgba(5,150,105,0.25)] dark:border-emerald-400/30 dark:bg-emerald-500',
  }
}

function getActionCardTheme(label = '') {
  const value = String(label).toLowerCase()

  if (value.includes('response')) {
    return {
      surface:
        'border-sky-200/70 bg-gradient-to-br from-sky-50/95 via-white to-cyan-50/75 dark:border-sky-400/20 dark:from-sky-500/10 dark:via-slate-950 dark:to-cyan-500/5',
      rail: 'from-sky-600 via-cyan-400 to-blue-300',
      glow: 'bg-sky-400/[0.18]',
    }
  }

  if (value.includes('upload')) {
    return {
      surface:
        'border-blue-200/70 bg-gradient-to-br from-blue-50/95 via-white to-indigo-50/70 dark:border-blue-400/20 dark:from-blue-500/10 dark:via-slate-950 dark:to-indigo-500/5',
      rail: 'from-blue-600 via-indigo-400 to-cyan-300',
      glow: 'bg-blue-400/[0.18]',
    }
  }

  if (value.includes('forecast')) {
    return {
      surface:
        'border-amber-200/70 bg-gradient-to-br from-amber-50/95 via-white to-orange-50/75 dark:border-amber-400/20 dark:from-amber-500/10 dark:via-slate-950 dark:to-orange-500/5',
      rail: 'from-amber-600 via-orange-400 to-yellow-300',
      glow: 'bg-amber-400/[0.18]',
    }
  }

  if (value.includes('map')) {
    return {
      surface:
        'border-teal-200/70 bg-gradient-to-br from-teal-50/95 via-white to-cyan-50/75 dark:border-teal-400/20 dark:from-teal-500/10 dark:via-slate-950 dark:to-cyan-500/5',
      rail: 'from-teal-600 via-cyan-400 to-emerald-300',
      glow: 'bg-teal-400/[0.18]',
    }
  }

  return {
    surface:
      'border-emerald-200/70 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/75 dark:border-emerald-400/20 dark:from-emerald-500/10 dark:via-slate-950 dark:to-teal-500/5',
    rail: 'from-emerald-600 via-teal-400 to-cyan-300',
    glow: 'bg-emerald-400/[0.18]',
  }
}

function createSmoothTrendPath(points = []) {
  if (!points.length) return ''

  if (points.length === 1) {
    const point = points[0]
    return `M ${point.x} ${point.y}`
  }

  return points.reduce((path, point, index, list) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`
    }

    const previous = list[index - 1]
    const previousPrevious = list[index - 2] || previous
    const next = list[index + 1] || point
    const controlPointOneX = previous.x + (point.x - previousPrevious.x) / 6
    const controlPointOneY = previous.y + (point.y - previousPrevious.y) / 6
    const controlPointTwoX = point.x - (next.x - previous.x) / 6
    const controlPointTwoY = point.y - (next.y - previous.y) / 6

    return `${path} C ${controlPointOneX} ${controlPointOneY}, ${controlPointTwoX} ${controlPointTwoY}, ${point.x} ${point.y}`
  }, '')
}

function getNiceChartMaximum(value) {
  const maximum = Math.max(0, Number(value || 0))

  if (maximum <= 10) return 10
  if (maximum <= 50) return Math.ceil(maximum / 10) * 10
  if (maximum <= 100) return Math.ceil(maximum / 20) * 20
  if (maximum <= 500) return Math.ceil(maximum / 50) * 50

  const magnitude = 10 ** Math.floor(Math.log10(maximum))
  return Math.ceil(maximum / magnitude) * magnitude
}

function ThreeDTrendChart({
  values = [],
  labels = [],
  title = 'Dengue case trend',
  forecastStartIndex = 0,
}) {
  const chart = useMemo(() => {
    const numericValues = values.map((value) => Math.max(0, toNumber(value)))
    const width = 1000
    const height = 620
    const left = 92
    const right = 934
    const top = 190
    const baseline = 445
    const maximum = getNiceChartMaximum(Math.max(...numericValues, 0))
    const count = numericValues.length
    const step = count > 1 ? (right - left) / (count - 1) : 0

    const points = numericValues.map((value, index) => ({
      x: count === 1 ? (left + right) / 2 : left + step * index,
      y: baseline - (value / maximum) * (baseline - top),
      value,
      label: labels[index] || `P${index + 1}`,
    }))

    const linePath = createSmoothTrendPath(points)
    const areaPath = points.length
      ? `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`
      : ''

    const validForecastStart = Math.max(
      0,
      Math.min(Number(forecastStartIndex || 0), points.length)
    )
    const hasForecastSplit = validForecastStart > 0 && validForecastStart < points.length
    const forecastBoundaryX = hasForecastSplit
      ? points[validForecastStart].x
      : left
    const forecastBoundaryPercent = Math.max(
      0,
      Math.min(100, ((forecastBoundaryX - left) / (right - left)) * 100)
    )
    const transitionStart = Math.max(0, forecastBoundaryPercent - 6)
    const transitionEnd = Math.min(100, forecastBoundaryPercent + 6)

    const ticks = Array.from({ length: 5 }, (_, index) => {
      const value = maximum - (maximum / 4) * index

      return {
        value,
        y: top + ((baseline - top) / 4) * index,
      }
    })

    return {
      width,
      height,
      left,
      right,
      top,
      baseline,
      maximum,
      points,
      linePath,
      areaPath,
      ticks,
      hasForecastSplit,
      validForecastStart,
      transitionStart,
      transitionEnd,
    }
  }, [values, labels, forecastStartIndex])

  if (!chart.points.length) {
    return null
  }

  return (
    <div className="h-full w-full overflow-x-auto overscroll-x-contain rounded-[24px]">
      <div className="h-full min-w-[720px]">
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          role="img"
          aria-label={`${title}. ${chart.points
            .map((point) => `${point.label}: ${formatNumber(point.value)} cases`)
            .join(', ')}`}
          className="h-full w-full select-none"
          preserveAspectRatio="xMidYMid meet"
        >
          <title>{title}</title>
          <desc>
            A three-dimensional styled dengue trend chart showing historical and projected case values.
          </desc>

          <defs>
            <linearGradient id="trend-card-background" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#020617" />
              <stop offset="45%" stopColor="#071827" />
              <stop offset="100%" stopColor="#03111f" />
            </linearGradient>

            <linearGradient id="trend-line-gradient" x1="0" y1="0" x2="1" y2="0">
              {chart.hasForecastSplit ? (
                <>
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset={`${chart.transitionStart}%`} stopColor="#fb923c" />
                  <stop offset={`${chart.transitionEnd}%`} stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#22d3ee" />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="55%" stopColor="#0ea5e9" />
                  <stop offset="100%" stopColor="#22d3ee" />
                </>
              )}
            </linearGradient>

            <linearGradient id="trend-area-gradient" x1="0" y1="0" x2="1" y2="0">
              {chart.hasForecastSplit ? (
                <>
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.72" />
                  <stop offset={`${chart.transitionStart}%`} stopColor="#fb923c" stopOpacity="0.34" />
                  <stop offset={`${chart.transitionEnd}%`} stopColor="#0284c7" stopOpacity="0.42" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.68" />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor="#0284c7" stopOpacity="0.46" />
                  <stop offset="55%" stopColor="#0ea5e9" stopOpacity="0.56" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.68" />
                </>
              )}
            </linearGradient>

            <linearGradient id="trend-depth-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.18" />
              <stop offset="55%" stopColor="#0369a1" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#020617" stopOpacity="0" />
            </linearGradient>

            <linearGradient id="trend-floor-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.28" />
              <stop offset="45%" stopColor="#0f2c42" stopOpacity="0.94" />
              <stop offset="100%" stopColor="#020617" stopOpacity="1" />
            </linearGradient>

            <linearGradient id="trend-floor-edge-gradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.9" />
              <stop offset="35%" stopColor="#f8fafc" stopOpacity="0.3" />
              <stop offset="68%" stopColor="#38bdf8" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.95" />
            </linearGradient>

            <radialGradient id="trend-spotlight" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </radialGradient>

            <pattern id="trend-surface-pattern" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 0 24 L 24 0" stroke="#ffffff" strokeOpacity="0.035" strokeWidth="1" />
              <path d="M -6 18 L 6 6 M 18 30 L 30 18" stroke="#38bdf8" strokeOpacity="0.035" strokeWidth="1" />
            </pattern>

            <filter id="trend-soft-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="trend-strong-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="13" result="blur" />
              <feColorMatrix
                in="blur"
                type="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1.2 0"
                result="glow"
              />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="trend-platform-shadow" x="-20%" y="-50%" width="140%" height="220%">
              <feDropShadow dx="0" dy="18" stdDeviation="16" floodColor="#000000" floodOpacity="0.65" />
            </filter>

            <clipPath id="trend-area-clip">
              <path d={chart.areaPath} />
            </clipPath>
          </defs>

          <rect
            x="2"
            y="2"
            width={chart.width - 4}
            height={chart.height - 4}
            rx="34"
            fill="url(#trend-card-background)"
            stroke="#0ea5e9"
            strokeOpacity="0.18"
          />

          <ellipse
            cx="760"
            cy="220"
            rx="300"
            ry="220"
            fill="url(#trend-spotlight)"
          />

          <g opacity="0.5">
            {chart.ticks.map((tick) => (
              <line
                key={`grid-${tick.value}`}
                x1={chart.left}
                y1={tick.y}
                x2={chart.right}
                y2={tick.y}
                stroke="#7dd3fc"
                strokeOpacity="0.18"
                strokeDasharray="6 9"
              />
            ))}
          </g>

          <text
            x="36"
            y="56"
            fill="#f8fafc"
            fontSize="24"
            fontWeight="800"
            fontFamily="Inter, ui-sans-serif, system-ui"
          >
            {title}
          </text>

          <text
            x="36"
            y="82"
            fill="#94a3b8"
            fontSize="13"
            fontWeight="600"
            fontFamily="Inter, ui-sans-serif, system-ui"
          >
            Case movement across historical and projected reporting periods
          </text>

          <text
            x="38"
            y={chart.top - 42}
            fill="#94a3b8"
            fontSize="13"
            fontWeight="700"
            fontFamily="Inter, ui-sans-serif, system-ui"
          >
            Cases
          </text>

          {chart.ticks.map((tick) => (
            <text
              key={`tick-${tick.value}`}
              x={chart.left - 24}
              y={tick.y + 5}
              textAnchor="end"
              fill="#94a3b8"
              fontSize="12"
              fontWeight="700"
              fontFamily="Inter, ui-sans-serif, system-ui"
            >
              {formatNumber(Math.round(tick.value))}
            </text>
          ))}

          <g filter="url(#trend-platform-shadow)">
            <path
              d={`M 52 ${chart.baseline} L 948 ${chart.baseline} L 982 ${chart.baseline + 44} L 22 ${chart.baseline + 44} Z`}
              fill="url(#trend-floor-gradient)"
              stroke="#38bdf8"
              strokeOpacity="0.25"
            />
            <path
              d={`M 22 ${chart.baseline + 44} L 982 ${chart.baseline + 44} L 966 ${chart.baseline + 70} L 40 ${chart.baseline + 70} Z`}
              fill="#020617"
              stroke="#0ea5e9"
              strokeOpacity="0.26"
            />
            <line
              x1="52"
              y1={chart.baseline}
              x2="948"
              y2={chart.baseline}
              stroke="url(#trend-floor-edge-gradient)"
              strokeWidth="3"
              filter="url(#trend-soft-glow)"
            />
          </g>

          <g opacity="0.2">
            {Array.from({ length: 14 }, (_, index) => {
              const x = 70 + index * 66
              return (
                <line
                  key={`floor-grid-${index}`}
                  x1={x}
                  y1={chart.baseline}
                  x2={x - 28}
                  y2={chart.baseline + 44}
                  stroke="#7dd3fc"
                  strokeOpacity="0.45"
                />
              )
            })}
            {[14, 28, 42].map((offset) => {
              const y = chart.baseline + offset

              return (
                <line
                  key={`floor-line-${offset}`}
                  x1={40 - offset * 0.5}
                  y1={y}
                  x2={960 + offset * 0.5}
                  y2={y}
                  stroke="#7dd3fc"
                  strokeOpacity="0.36"
                />
              )
            })}
          </g>

          <path
            d={chart.areaPath}
            transform="translate(0 16)"
            fill="url(#trend-depth-gradient)"
            opacity="0.52"
            filter="url(#trend-soft-glow)"
          />

          <path
            d={chart.areaPath}
            fill="url(#trend-area-gradient)"
            stroke="url(#trend-line-gradient)"
            strokeWidth="2"
            opacity="0.94"
          />

          <rect
            x={chart.left}
            y={chart.top}
            width={chart.right - chart.left}
            height={chart.baseline - chart.top}
            fill="url(#trend-surface-pattern)"
            clipPath="url(#trend-area-clip)"
          />

          <path
            d={chart.linePath}
            fill="none"
            stroke="url(#trend-line-gradient)"
            strokeWidth="13"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.2"
            filter="url(#trend-strong-glow)"
          />

          <path
            d={chart.linePath}
            fill="none"
            stroke="url(#trend-line-gradient)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#trend-soft-glow)"
          />

          {chart.points.map((point, index) => {
            const historical = chart.hasForecastSplit && index < chart.validForecastStart
            const color = historical ? '#fbbf24' : '#22d3ee'
            const glowColor = historical ? '#f59e0b' : '#38bdf8'

            return (
              <g key={`${point.label}-${index}`}>
                <title>{`${point.label}: ${formatNumber(point.value)} cases`}</title>

                <line
                  x1={point.x}
                  y1={point.y + 10}
                  x2={point.x}
                  y2={chart.baseline}
                  stroke={color}
                  strokeOpacity="0.58"
                  strokeWidth="1.5"
                  strokeDasharray="4 6"
                />

                <ellipse
                  cx={point.x}
                  cy={chart.baseline + 4}
                  rx="17"
                  ry="5"
                  fill={glowColor}
                  fillOpacity="0.16"
                  filter="url(#trend-soft-glow)"
                />

                <circle
                  cx={point.x}
                  cy={point.y}
                  r="15"
                  fill={glowColor}
                  fillOpacity="0.22"
                  filter="url(#trend-strong-glow)"
                />

                <circle
                  cx={point.x}
                  cy={point.y}
                  r="7"
                  fill="#f8fafc"
                  stroke={color}
                  strokeWidth="4"
                />

                <text
                  x={point.x}
                  y={Math.max(36, point.y - 21)}
                  textAnchor="middle"
                  fill={historical ? '#fed7aa' : '#67e8f9'}
                  fontSize="18"
                  fontWeight="900"
                  fontFamily="Inter, ui-sans-serif, system-ui"
                  style={{ filter: `drop-shadow(0 0 8px ${glowColor})` }}
                >
                  {formatNumber(point.value)}
                </text>

                <text
                  x={point.x}
                  y={chart.baseline + 112}
                  textAnchor="middle"
                  fill="#cbd5e1"
                  fontSize="13"
                  fontWeight="700"
                  fontFamily="Inter, ui-sans-serif, system-ui"
                >
                  {point.label}
                </text>
              </g>
            )
          })}

          <g transform={`translate(350 ${chart.baseline + 150})`}>
            <rect x="0" y="-14" width="22" height="14" rx="4" fill="url(#trend-line-gradient)" />
            <rect x="0" y="-14" width="22" height="14" rx="4" fill="none" stroke="#bae6fd" strokeOpacity="0.5" />
            <text
              x="34"
              y="-2"
              fill="#e2e8f0"
              fontSize="14"
              fontWeight="800"
              fontFamily="Inter, ui-sans-serif, system-ui"
            >
              Dengue cases
            </text>
          </g>
        </svg>
      </div>
    </div>
  )
}

function Panel({
  children,
  className = '',
  tabTone = 'blue',
  tabLabel = '',
  tabIcon = Sparkles,
  curve = 'bottom-right',
}) {
  const toneMap = {
    blue: {
      line: 'from-blue-600 via-cyan-400 to-transparent',
      glow: 'bg-blue-400/10',
    },
    red: {
      line: 'from-rose-600 via-orange-400 to-transparent',
      glow: 'bg-rose-400/10',
    },
    orange: {
      line: 'from-amber-600 via-orange-400 to-transparent',
      glow: 'bg-amber-400/10',
    },
    green: {
      line: 'from-emerald-600 via-teal-400 to-transparent',
      glow: 'bg-emerald-400/10',
    },
    amber: {
      line: 'from-amber-600 via-orange-400 to-transparent',
      glow: 'bg-amber-400/10',
    },
    emerald: {
      line: 'from-emerald-600 via-teal-400 to-transparent',
      glow: 'bg-emerald-400/10',
    },
    rose: {
      line: 'from-rose-600 via-fuchsia-400 to-transparent',
      glow: 'bg-rose-400/10',
    },
    slate: {
      line: 'from-slate-500 via-slate-300 to-transparent',
      glow: 'bg-slate-400/10',
    },
  }

  const curveMap = {
    'bottom-right': 'rounded-[32px]',
    'bottom-left': 'rounded-[32px]',
    'top-left': 'rounded-[32px]',
    'top-right': 'rounded-[32px]',
  }

  const tone = toneMap[tabTone] || toneMap.blue

  return (
    <section
      className={`group relative overflow-hidden border border-white/[0.85] bg-gradient-to-br from-white/95 via-white/90 to-slate-50/[0.85] shadow-[0_22px_68px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/60 backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_30px_82px_rgba(15,23,42,0.12)] dark:border-slate-800/80 dark:from-slate-950/95 dark:via-slate-950/90 dark:to-slate-900/80 dark:ring-white/5 dark:hover:shadow-[0_30px_82px_rgba(2,6,23,0.34)] ${
        curveMap[curve] || curveMap['bottom-right']
      } ${className}`}
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tone.line}`} />
      <div className={`pointer-events-none absolute -right-24 -top-24 h-60 w-60 rounded-full blur-3xl transition-transform duration-500 group-hover:scale-110 ${tone.glow}`} />
      <div className="pointer-events-none absolute inset-0 opacity-[0.025] [background-image:linear-gradient(rgba(15,23,42,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.5)_1px,transparent_1px)] [background-size:32px_32px] dark:opacity-[0.035] dark:[background-image:linear-gradient(rgba(255,255,255,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.5)_1px,transparent_1px)]" />

      {tabLabel ? (
        <div className="relative z-[2] mb-4 flex justify-end">
          <CurvedCardTab icon={tabIcon} tone={tabTone} label={tabLabel} compact />
        </div>
      ) : null}

      <div className="relative z-[1]">{children}</div>
    </section>
  )
}

function SectionBadge({ children, tone = 'slate' }) {
  const toneMap = {
    slate:
      'border-slate-200/80 bg-slate-100/80 text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300',
    blue:
      'border-blue-200/70 bg-blue-50/90 text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200',
    amber:
      'border-amber-200/70 bg-amber-50/90 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200',
    emerald:
      'border-emerald-200/70 bg-emerald-50/90 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200',
    rose:
      'border-rose-200/70 bg-rose-50/90 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200',
  }

  return (
    <div
      className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] shadow-sm ${toneMap[tone] || toneMap.slate}`}
    >
      {children}
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [barangayModal, setBarangayModal] = useState(null)
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

  const forecastPeriodDisplay = getForecastPeriodDisplay(backendForecastResult)
  const dashboardChartLabels = usingBackendForecast
    ? [
        'Prev avg',
        'Recent avg',
        ...Array.from({ length: Math.max(weeklyTotals.length - 2, 0) }, (_, index) => {
          return `${forecastPeriodDisplay.prefix}${index + 1}`
        }),
      ]
    : weeklyTotals.map((_, index) => `W${index + 1}`)
  const dashboardChartTitle = usingBackendForecast
    ? `${forecastPeriodDisplay.adjective} dengue case trend`
    : 'Weekly dengue case values'
  const forecastHorizonPeriods = Number(
    backendForecastResult?.forecast_horizon_periods ||
      backendForecastResult?.validation_summary?.forecast_horizon_periods ||
      4
  )
  const forecastHorizonLabel = `Next ${forecastHorizonPeriods} ${
    forecastHorizonPeriods === 1
      ? forecastPeriodDisplay.singular
      : forecastPeriodDisplay.plural
  }`

  const displayRiskRows = usingBackendForecast
    ? backendPriorityRows
    : riskRows

  const canonicalPriorityRows = useMemo(() => {
    return [...displayRiskRows].sort(compareCanonicalBarangayPriority)
  }, [displayRiskRows])

  const recordedCaseRows = useMemo(() => {
    return [...displayRiskRows].sort((first, second) => {
      const firstTotal = toNumber(
        first?.totalCases ?? first?.historicalTotalCases ?? first?.cases,
        0
      )
      const secondTotal = toNumber(
        second?.totalCases ?? second?.historicalTotalCases ?? second?.cases,
        0
      )

      if (secondTotal !== firstTotal) return secondTotal - firstTotal

      return compareCanonicalBarangayPriority(first, second)
    })
  }, [displayRiskRows])

  const projectedCaseRows = useMemo(() => {
    return [...displayRiskRows].sort((first, second) => {
      const difference = toNumber(second?.forecast, 0) - toNumber(first?.forecast, 0)

      if (difference !== 0) return difference

      return compareCanonicalBarangayPriority(first, second)
    })
  }, [displayRiskRows])

  const priority = canonicalPriorityRows.slice(0, 5)

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


  function openBarangayList({ title, description, tone = 'blue', rows = [] }) {
    setBarangayModal({
      title,
      description,
      tone,
      rows: Array.isArray(rows) ? rows : [],
    })
  }

  function closeBarangayList() {
    setBarangayModal(null)
  }

  function openFullForecastFromModal() {
    setBarangayModal(null)
    navigate('/forecast#top-barangays')

    window.setTimeout(() => {
      document.getElementById('top-barangays')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 220)
  }

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
    <div className="dashboard-mobile-compact relative isolate space-y-7 overflow-hidden rounded-[36px] bg-[radial-gradient(circle_at_8%_2%,rgba(14,165,233,0.08),transparent_28%),radial-gradient(circle_at_92%_8%,rgba(16,185,129,0.07),transparent_24%),linear-gradient(180deg,rgba(248,250,252,0.72),rgba(248,250,252,0))] pb-6 sm:space-y-8 dark:bg-[radial-gradient(circle_at_8%_2%,rgba(14,165,233,0.08),transparent_28%),radial-gradient(circle_at_92%_8%,rgba(16,185,129,0.06),transparent_24%),linear-gradient(180deg,rgba(15,23,42,0.35),rgba(15,23,42,0))]">
      {barangayModal && (
        <DashboardBarangayListModal
          config={barangayModal}
          onClose={closeBarangayList}
          onOpenForecast={openFullForecastFromModal}
        />
      )}

      <SectionTitle
        title="Dashboard Overview"
        subtitle={
          usingBackendForecast
            ? 'Decision-ready overview from the latest uploaded dengue records.'
            : 'Quick status, dengue trends, weather pressure, priority barangays, and file readiness from the current records.'
        }
      />

      <section className="relative isolate overflow-hidden rounded-[34px] border border-slate-900/10 bg-[#071525] shadow-[0_32px_90px_rgba(2,6,23,0.26)] ring-1 ring-white/10 dark:border-white/10 sm:rounded-[40px]">
        <img
          src={dashboardBackground}
          alt=""
          aria-hidden="true"
          draggable="false"
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-center opacity-90"
        />

        <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(2,6,23,0.98)_0%,rgba(4,18,33,0.94)_36%,rgba(4,18,33,0.64)_61%,rgba(2,6,23,0.18)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_74%_24%,rgba(56,189,248,0.20),transparent_28%),radial-gradient(circle_at_92%_90%,rgba(16,185,129,0.15),transparent_30%)]" />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-slate-950/[0.85] to-transparent" />
        <div className="absolute inset-0 opacity-[0.13] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:42px_42px]" />

        <div className="relative z-10 grid min-h-[520px] gap-10 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.62fr)] lg:items-center lg:p-10 xl:min-h-[550px] xl:p-12">
          <div className="max-w-[760px]">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100 shadow-lg backdrop-blur-xl">
                <Sparkles className="h-3.5 w-3.5" />
                Dengue intelligence center
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-200 backdrop-blur-xl">
                <span className={`h-2 w-2 rounded-full ${usingBackendForecast ? 'bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.9)]' : 'bg-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.9)]'}`} />
                {usingBackendForecast ? 'Analysis online' : 'Awaiting analysis'}
              </div>
            </div>

            <h2 className="mt-6 max-w-3xl text-[2.15rem] font-black leading-[1.04] tracking-[-0.045em] text-white drop-shadow-[0_5px_24px_rgba(2,6,23,0.65)] sm:text-[3rem] xl:text-[3.6rem]">
              Barangay-level dengue intelligence, built for faster decisions.
            </h2>

            <p className="mt-5 max-w-2xl text-sm font-medium leading-7 text-slate-200/90 sm:text-[15px] sm:leading-8">
              Monitor dengue cases, environmental pressure, population exposure, and spatial risk from one coordinated command view.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate('/forecast')}
                style={{
                  background: '#ffffff',
                  backgroundImage: 'none',
                  color: '#0f172a',
                }}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white px-5 py-3 text-sm font-black shadow-[0_14px_34px_rgba(255,255,255,0.18)] transition duration-200 hover:-translate-y-0.5 hover:opacity-95"
              >
                Review forecast
                <ArrowRight className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => navigate('/map')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/[0.15] bg-white/[0.08] px-5 py-3 text-sm font-black text-white shadow-lg backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:bg-white/[0.14]"
              >
                Open risk map
                <MapPinned className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-8 grid max-w-2xl grid-cols-2 gap-2.5 sm:grid-cols-4">
              {[
                { label: 'Records', value: formatNumber(acceptedRecords), icon: Database },
                { label: 'High risk', value: formatNumber(highRiskCount), icon: ShieldAlert },
                { label: 'Readiness', value: `${formatNumber(integrationScore)}%`, icon: Layers3 },
                { label: 'Data quality', value: `${formatNumber(displayStats.dataQuality)}%`, icon: CheckCircle2 },
              ].map((item) => {
                const Icon = item.icon

                return (
                  <div
                    key={item.label}
                    className="group/hero-metric relative overflow-hidden rounded-[20px] border border-white/[0.15] bg-gradient-to-br from-white/[0.12] via-slate-950/[0.35] to-cyan-400/[0.07] p-3.5 shadow-[0_14px_32px_rgba(2,6,23,0.30)] ring-1 ring-white/5 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-300/30 hover:bg-white/[0.14]"
                  >
                    <div className="flex items-center gap-2 text-slate-300">
                      <Icon className="h-3.5 w-3.5" />
                      <span className="text-[9px] font-black uppercase tracking-[0.15em]">
                        {item.label}
                      </span>
                    </div>
                    <p className="mt-2 text-lg font-black tracking-tight text-white">
                      {item.value}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="w-full self-end justify-self-end lg:max-w-[390px]">
            <div className="group/top-priority relative overflow-hidden rounded-[32px] border border-cyan-300/20 bg-gradient-to-br from-slate-950/75 via-slate-950/60 to-cyan-950/[0.45] p-5 text-white shadow-[0_30px_78px_rgba(2,6,23,0.52)] ring-1 ring-white/10 backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:border-cyan-300/30 hover:shadow-[0_36px_90px_rgba(2,6,23,0.60)] sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/75">
                    Current top priority
                  </p>
                  <h3 className="mt-2 max-w-[230px] truncate text-2xl font-black tracking-[-0.03em]">
                    {topPriority?.barangay || 'No barangay yet'}
                  </h3>
                </div>

                <div
                  className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full p-[7px] shadow-[0_0_36px_rgba(56,189,248,0.18)]"
                  style={{
                    background: `conic-gradient(#22d3ee ${Math.min(100, Math.max(0, topMultiSourceScore)) * 3.6}deg, rgba(255,255,255,0.10) 0deg)`,
                  }}
                >
                  <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-white/10 bg-[#071525]">
                    <span className="text-xl font-black leading-none">{formatNumber(topMultiSourceScore)}</span>
                    <span className="mt-1 text-[8px] font-black uppercase tracking-[0.14em] text-cyan-100/70">Risk</span>
                  </div>
                </div>
              </div>

              <p className="mt-4 text-sm font-medium leading-6 text-slate-300">
                {topPriority
                  ? `${formatNumber(topPriority.forecast)} projected cases. ${topDecision.environmentalSuitability}.`
                  : 'Upload the required files to generate a barangay-level priority assessment.'}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-2.5">
                <div className="relative overflow-hidden rounded-[18px] border border-white/[0.15] bg-gradient-to-br from-white/[0.10] to-cyan-300/[0.05] p-3 shadow-inner">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Risk level</p>
                  <p className="mt-1 text-sm font-black text-white">{topPriority?.risk || 'Pending'}</p>
                </div>
                <div className="relative overflow-hidden rounded-[18px] border border-white/[0.15] bg-gradient-to-br from-white/[0.10] to-cyan-300/[0.05] p-3 shadow-inner">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Integration</p>
                  <p className="mt-1 text-sm font-black text-white">{integrationStatus}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate('/forecast')}
                className="mt-4 inline-flex w-full items-center justify-between rounded-[18px] border border-cyan-300/[0.15] bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-50 transition hover:bg-cyan-300/[0.15]"
              >
                Open decision support
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <div
        id="dashboard-summary"
        className="scroll-mt-28 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <PremiumStatCard
          title="Total cases"
          value={formatNumber(displayStats.totalCases)}
          helper="Recorded dengue cases in the current workspace"
          icon={Activity}
          tone="blue"
          clickLabel="View barangay case totals"
          onClick={() =>
            openBarangayList({
              title: 'Barangays by recorded dengue cases',
              description: 'Barangays are ordered from the highest historical dengue case total to the lowest.',
              tone: 'blue',
              rows: recordedCaseRows,
            })
          }
        />

        <PremiumStatCard
          title="High-risk barangays"
          value={formatNumber(displayStats.highRiskCount)}
          helper="Barangays that need immediate attention"
          icon={ShieldAlert}
          tone="red"
          clickLabel="View high-risk barangays"
          onClick={() =>
            openBarangayList({
              title: 'High-risk barangays',
              description: 'These barangays are classified as High risk and remain ordered by the canonical response-priority ranking.',
              tone: 'red',
              rows: canonicalPriorityRows.filter((row) => row.risk === 'High'),
            })
          }
        />

        <PremiumStatCard
          title="Forecast total"
          value={formatNumber(displayStats.fourWeekForecast)}
          helper={`Expected dengue cases for ${forecastHorizonLabel.toLowerCase()}`}
          icon={BarChart3}
          tone="orange"
          clickLabel="View projected cases"
          onClick={() =>
            openBarangayList({
              title: 'Barangays by projected dengue cases',
              description: `Barangays are ordered by their expected dengue cases for ${forecastHorizonLabel.toLowerCase()}.`,
              tone: 'orange',
              rows: projectedCaseRows,
            })
          }
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
        <div className="relative overflow-hidden rounded-[24px] border border-emerald-200/70 bg-white/[0.85] px-5 py-4 text-sm leading-6 text-emerald-800 shadow-[0_14px_40px_rgba(15,23,42,0.06)] ring-1 ring-emerald-100/70 backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-gradient-to-b before:from-emerald-500 before:to-teal-400 dark:border-emerald-400/20 dark:bg-emerald-400/[0.07] dark:text-emerald-200 dark:ring-emerald-400/10">
          <span className="font-black">Analysis ready:</span>{' '}
          The uploaded dengue records are now being used for dashboard totals, trend view, priority barangays, and monitoring alerts. The system identified{' '}
          {formatNumber(highRiskCount)} high-risk barangay{highRiskCount === 1 ? '' : 's'},{' '}
          {formatNumber(moderateRiskCount)} moderate-risk barangay{moderateRiskCount === 1 ? '' : 's'}, and{' '}
          {formatNumber(lowRiskCount)} low-risk barangay{lowRiskCount === 1 ? '' : 's'}.
        </div>
      )}

      <Panel className="p-6" tabTone="blue" tabLabel="Integrated" tabIcon={Layers3} curve="bottom-right">
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
          <SignalCard
            label="Avg. risk score"
            value={averageMultiSourceScore > 0 ? `${formatNumber(averageMultiSourceScore)}/100` : 'No data'}
            helper="Average multi-source score across computed barangay risk rows."
            icon={Gauge}
            tone="blue"
          />

          <SignalCard
            label="Rainfall average"
            value={environmentalSummary.averageRainfall > 0 ? `${formatDecimal(environmentalSummary.averageRainfall)} mm` : 'No data'}
            helper="Weather conditions used in the barangay risk score."
            icon={CloudRain}
            tone="sky"
          />

          <SignalCard
            label="Temperature avg."
            value={environmentalSummary.averageTemperature > 0 ? `${formatDecimal(environmentalSummary.averageTemperature)} °C` : 'No data'}
            helper="Temperature suitability helps contextualize dengue transmission risk."
            icon={Thermometer}
            tone="amber"
          />

          <SignalCard
            label="Humidity avg."
            value={environmentalSummary.averageHumidity > 0 ? `${formatDecimal(environmentalSummary.averageHumidity)}%` : 'No data'}
            helper="Humidity and rainfall support the environmental suitability check."
            icon={Droplets}
            tone="emerald"
          />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/70">
            <p className="text-sm font-black text-brand-text dark:text-slate-100">
              Integration checks
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-2">
              {integrationChecks.length > 0 ? (
                integrationChecks.slice(0, 6).map((check) => (
                  <div
                    key={check.label}
                    className={`group/check relative overflow-hidden rounded-[22px] border px-3.5 py-3.5 shadow-[0_10px_26px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(15,23,42,0.10)] ${check.ready ? 'border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/70 dark:border-emerald-400/20 dark:from-emerald-500/10 dark:via-slate-950 dark:to-teal-500/5' : 'border-amber-200/80 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/70 dark:border-amber-400/20 dark:from-amber-500/10 dark:via-slate-950 dark:to-orange-500/5'}`}
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

          <div className="relative overflow-hidden rounded-[30px] border border-blue-200/70 bg-gradient-to-br from-blue-50/95 via-white to-cyan-50/75 p-5 shadow-[0_18px_44px_rgba(37,99,235,0.10)] ring-1 ring-white/80 dark:border-blue-400/20 dark:from-blue-500/10 dark:via-slate-950 dark:to-cyan-500/5 dark:ring-white/5">
            <p className="text-sm font-black text-brand-blue dark:text-blue-300">
              Dataset coverage
            </p>

            <div className="mt-4 space-y-3">
              <div className="group/coverage flex items-center justify-between rounded-[18px] border border-blue-100/80 bg-white/[0.85] px-3.5 py-3 text-xs font-bold text-brand-muted shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-blue-400/10 dark:bg-slate-950/75 dark:text-slate-400">
                <span>Loaded sources</span>
                <span>{formatNumber(sourceHealth.loadedCount)} / {formatNumber(sourceHealth.sourceCount)}</span>
              </div>

              <div className="group/coverage flex items-center justify-between rounded-[18px] border border-blue-100/80 bg-white/[0.85] px-3.5 py-3 text-xs font-bold text-brand-muted shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-blue-400/10 dark:bg-slate-950/75 dark:text-slate-400">
                <span>Valid records</span>
                <span>{formatNumber(sourceHealth.totalValid)} / {formatNumber(sourceHealth.totalRecords)}</span>
              </div>

              <div className="group/coverage flex items-center justify-between rounded-[18px] border border-blue-100/80 bg-white/[0.85] px-3.5 py-3 text-xs font-bold text-brand-muted shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-blue-400/10 dark:bg-slate-950/75 dark:text-slate-400">
                <span>Weather rows</span>
                <span>{formatNumber(sourceStatus?.weather?.validCount || weatherRecords.length || 0)}</span>
              </div>

              <div className="group/coverage flex items-center justify-between rounded-[18px] border border-blue-100/80 bg-white/[0.85] px-3.5 py-3 text-xs font-bold text-brand-muted shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-blue-400/10 dark:bg-slate-950/75 dark:text-slate-400">
                <span>Barangay risk rows</span>
                <span>{formatNumber(displayRiskRows.length)}</span>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.85fr]">
        <Panel className="p-6" tabTone="rose" tabLabel="Trend" tabIcon={TrendingUp} curve="bottom-left">
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
                  ? `Values show the previous average, recent average, and the projected ${forecastPeriodDisplay.plural} from the latest analysis.`
                  : 'Weekly case values are recalculated from uploaded or sample dengue records.'}
              </p>
            </div>

            <span className={`inline-flex w-fit rounded-full border px-4 py-1.5 text-xs font-black shadow-sm ${trendStatus.style}`}>
              {trendStatus.label}
            </span>
          </div>

          <div className="mt-5 space-y-4">
  <div className="relative overflow-hidden rounded-[30px] border border-cyan-400/[0.15] bg-gradient-to-b from-[#061321] via-[#06111d] to-[#020817] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_70px_rgba(2,8,23,0.42)] sm:p-5">
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300/80">
          Dengue case values
        </p>

        <p className="mt-1 text-xs text-slate-400">
          {trendStatus.description}
        </p>
      </div>

      <div className="w-fit rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-bold text-cyan-200">
        {usingBackendForecast ? 'Latest analysis' : 'Last 6 periods'}
      </div>
    </div>

    <div className="h-[520px] lg:h-[620px]">
      {weeklyTotals.length > 0 ? (
        <ThreeDTrendChart
          values={weeklyTotals}
          labels={dashboardChartLabels}
          title={dashboardChartTitle}
          forecastStartIndex={usingBackendForecast ? 2 : 0}
        />
      ) : (
        <div className="flex h-full items-center justify-center rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-5 text-center text-sm leading-6 text-brand-muted dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
          No chart available until dengue records are loaded.
        </div>
      )}
    </div>
  </div>

  <div className="grid gap-3 sm:grid-cols-3">
    {riskDistribution.map((item, index) => {
      const riskAccent =
        item.label === 'High'
          ? 'from-rose-600 via-orange-400 to-amber-300'
          : item.label === 'Moderate'
            ? 'from-amber-600 via-yellow-400 to-orange-300'
            : 'from-emerald-600 via-teal-400 to-cyan-300'

      return (
        <button
          type="button"
          key={item.label}
          onClick={() =>
            openBarangayList({
              title: `${item.label}-risk barangays`,
              description: `${item.label}-risk barangays are shown using the same canonical ranking applied throughout the dashboard and forecast pages.`,
              tone:
                item.label === 'High'
                  ? 'red'
                  : item.label === 'Moderate'
                    ? 'orange'
                    : 'emerald',
              rows: canonicalPriorityRows.filter((row) => row.risk === item.label),
            })
          }
          className={`group/risk relative w-full overflow-hidden rounded-[28px] border p-4 text-left shadow-[0_16px_40px_rgba(15,23,42,0.08)] ring-1 ring-white/70 transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_58px_rgba(15,23,42,0.14)] focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/40 dark:ring-white/5 ${item.style}`}
          aria-label={`View ${item.label.toLowerCase()}-risk barangays`}
        >
          <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${riskAccent}`} />
          <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/[0.55] blur-2xl transition-transform duration-500 group-hover/risk:scale-125 dark:bg-white/5" />

          <div className="relative flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-80">
                {item.label} risk
              </p>
              <p className="mt-3 text-4xl font-black tracking-[-0.05em]">
                {formatNumber(item.value)}
              </p>
            </div>

            <div className="flex h-11 w-11 items-center justify-center rounded-[17px] border border-white/80 bg-white/70 text-sm font-black shadow-sm dark:border-white/10 dark:bg-white/10">
              {index + 1}
            </div>
          </div>

          <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-white/70 shadow-inner dark:bg-slate-950/25">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${riskAccent}`}
              style={{
                width: `${Math.max(
                  8,
                  Math.min(
                    100,
                    ((Number(item.value || 0) / Math.max(displayRiskRows.length, 1)) * 100)
                  )
                )}%`,
              }}
            />
          </div>

          <div className="relative mt-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold opacity-80">
              {item.helper}
            </p>
            <span className="rounded-full border border-white/80 bg-white/70 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] shadow-sm dark:border-white/10 dark:bg-white/10">
              Barangays
            </span>
          </div>
        </button>
      )
    })}
  </div>
</div>
        </Panel>

        <Panel className="p-6" tabTone="amber" tabLabel="Priority" tabIcon={Navigation} curve="top-right">
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
                Ranked by risk level, combined multi-source score, response priority, and projected cases.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {priority.length > 0 ? (
              priority.map((row, index) => {
                const riskTheme = getRiskCardTheme(row.risk)
                const decision = getDecisionSupport(row)
                const score = Math.max(0, Math.min(100, getMultiSourceScore(row)))

                return (
                  <div
                    key={`${row.barangay}-${index}`}
                    className={`group/priority relative overflow-hidden rounded-[28px] border p-4 shadow-[0_16px_42px_rgba(15,23,42,0.08)] ring-1 ring-white/70 transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_62px_rgba(15,23,42,0.14)] dark:ring-white/5 ${riskTheme.surface}`}
                  >
                    <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${riskTheme.rail}`} />
                    <div className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full blur-3xl transition-transform duration-500 group-hover/priority:scale-125 ${riskTheme.glow}`} />
                    <div className="pointer-events-none absolute right-5 top-5 h-16 w-16 rounded-full border border-white/60 dark:border-white/5" />

                    <div className="relative flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border text-sm font-black ${riskTheme.rank}`}>
                          #{index + 1}
                        </div>

                        <div className="min-w-0">
                          <p className="break-words text-base font-black tracking-tight text-brand-text dark:text-slate-100">
                            {row.barangay}
                          </p>

                          <p className="mt-1 text-xs font-semibold leading-5 text-brand-muted dark:text-slate-400">
                            {formatNumber(row.forecast)} projected cases
                          </p>

                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${getRiskBadgeStyle(row.risk)}`}>
                              {row.risk} risk
                            </span>
                            <span className="rounded-full border border-white/80 bg-white/75 px-2.5 py-1 text-[10px] font-black text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                              {decision.priority}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                          Risk score
                        </p>
                        <p className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-950 dark:text-white">
                          {formatNumber(score)}
                          <span className="text-xs font-bold text-slate-400">/100</span>
                        </p>
                      </div>
                    </div>

                    <div className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-white/80 shadow-inner dark:bg-slate-900/80">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${riskTheme.rail}`}
                        style={{ width: `${Math.max(4, score)}%` }}
                      />
                    </div>

                    <div className="relative mt-4 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-[18px] border border-white/80 bg-white/75 px-3 py-2.5 shadow-sm dark:border-white/10 dark:bg-white/5">
                        <p className="text-[9px] font-black uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
                          Rainfall pressure
                        </p>
                        <p className="mt-1 text-xs font-bold leading-5 text-slate-800 dark:text-slate-200">
                          {decision.rainfallPressure}
                        </p>
                      </div>

                      <div className="rounded-[18px] border border-white/80 bg-white/75 px-3 py-2.5 shadow-sm dark:border-white/10 dark:bg-white/5">
                        <p className="text-[9px] font-black uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
                          Population exposure
                        </p>
                        <p className="mt-1 text-xs font-bold leading-5 text-slate-800 dark:text-slate-200">
                          {decision.populationExposure}
                        </p>
                      </div>
                    </div>

                    <div className="relative mt-3 rounded-[20px] border border-white/80 bg-white/80 px-3.5 py-3 shadow-sm dark:border-white/10 dark:bg-slate-950/[0.45]">
                      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        Recommended focus
                      </p>
                      <p className="mt-1.5 text-xs font-semibold leading-5 text-slate-700 dark:text-slate-300">
                        {decision.summary}
                      </p>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-brand-muted dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                No priority barangay list is available yet.
              </div>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_0.85fr_1fr]">
        <Panel className="p-6" tabTone="blue" tabLabel="Navigate" tabIcon={ArrowRight} curve="bottom-right">
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
              const actionTheme = getActionCardTheme(action.label)

              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => handleQuickActionNavigation(actionRoutes[action.label])}
                  className={`group/action relative flex min-h-[144px] w-full flex-col items-start justify-between gap-4 overflow-hidden rounded-[24px] border px-3.5 py-3.5 text-left shadow-[0_12px_32px_rgba(15,23,42,0.06)] ring-1 ring-white/70 transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_48px_rgba(15,23,42,0.12)] dark:ring-white/5 sm:min-h-0 sm:flex-row sm:items-center sm:px-4 sm:py-4 ${actionTheme.surface}`}
                >
                  <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${actionTheme.rail}`} />
                  <div className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full blur-3xl transition-transform duration-500 group-hover/action:scale-125 ${actionTheme.glow}`} />

                  <div className="relative flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[17px] border bg-white shadow-sm dark:bg-white/5 sm:h-12 sm:w-12 ${action.style}`}
                    >
                      <Icon className="h-5 w-5" strokeWidth={2.25} />
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-black leading-tight text-brand-text dark:text-slate-100">
                          {action.label}
                        </p>
                        <span className="rounded-full border border-white/80 bg-white/70 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                          Open
                        </span>
                      </div>

                      <p className="mt-1 text-xs font-medium leading-5 text-brand-muted dark:text-slate-400 sm:mt-1">
                        {action.description}
                      </p>
                    </div>
                  </div>

                  <span className="relative mt-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/75 text-brand-muted shadow-sm transition duration-300 group-hover/action:translate-x-1 group-hover/action:text-brand-blue dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:group-hover/action:text-blue-300 sm:mt-0">
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </button>
              )
            })}

            <button
              type="button"
              onClick={resetSampleData}
              className="group/reset relative flex min-h-[144px] w-full flex-col items-start justify-between gap-4 overflow-hidden rounded-[24px] border border-slate-200/80 bg-gradient-to-br from-slate-50/95 via-white to-rose-50/60 px-3.5 py-3.5 text-left text-slate-600 shadow-[0_12px_32px_rgba(15,23,42,0.06)] ring-1 ring-white/70 transition duration-300 hover:-translate-y-1 hover:border-rose-200 hover:text-rose-600 hover:shadow-[0_20px_48px_rgba(225,29,72,0.12)] dark:border-slate-700 dark:from-slate-900 dark:via-slate-950 dark:to-rose-500/5 dark:text-slate-300 dark:ring-white/5 dark:hover:border-rose-500/30 dark:hover:text-rose-300 sm:min-h-0 sm:flex-row sm:items-center sm:px-4 sm:py-4"
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

        <Panel className="p-6" tabTone="amber" tabLabel="Alerts" tabIcon={AlertTriangle} curve="bottom-left">
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
                  className={`group/alert relative overflow-hidden rounded-[28px] border p-4 shadow-[0_14px_36px_rgba(15,23,42,0.07)] ring-1 ring-white/70 transition duration-300 before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-gradient-to-r before:from-amber-500 before:via-cyan-400 before:to-transparent hover:-translate-y-1 hover:shadow-[0_22px_52px_rgba(15,23,42,0.13)] dark:ring-white/5 ${alert.style}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-white/80 bg-white/80 shadow-[0_10px_24px_rgba(15,23,42,0.10)] transition-transform duration-300 group-hover/alert:scale-105 dark:border-white/10 dark:bg-white/10">
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

        <Panel className="p-6" tabTone="emerald" tabLabel="Sources" tabIcon={Database} curve="top-right">
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
                className="group/source relative min-h-[148px] overflow-hidden rounded-[28px] border border-emerald-200/[0.65] bg-gradient-to-br from-emerald-50/80 via-white to-cyan-50/[0.65] p-3.5 shadow-[0_14px_36px_rgba(15,23,42,0.07)] ring-1 ring-white/70 transition duration-300 before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-gradient-to-r before:from-emerald-600 before:via-teal-400 before:to-cyan-300 hover:-translate-y-1 hover:shadow-[0_22px_52px_rgba(15,23,42,0.13)] dark:border-emerald-400/20 dark:from-emerald-500/10 dark:via-slate-950 dark:to-cyan-500/5 dark:ring-white/5 sm:min-h-0 sm:p-4"
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

                <div className="relative mt-3 rounded-[18px] border border-white/80 bg-white/80 px-3 py-2.5 text-[11px] font-bold leading-4 text-brand-muted shadow-[0_8px_20px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/5 dark:text-slate-400 sm:flex sm:items-center sm:justify-between sm:text-xs">
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

      <Panel className="p-6" tabTone="slate" tabLabel="Activity" tabIcon={Clock3} curve="bottom-right">
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
                className="group/activity relative overflow-hidden rounded-[28px] border border-blue-200/70 bg-gradient-to-br from-blue-50/90 via-white to-cyan-50/70 p-4 shadow-[0_14px_38px_rgba(15,23,42,0.07)] ring-1 ring-white/70 transition duration-300 before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-gradient-to-r before:from-blue-600 before:via-cyan-400 before:to-transparent hover:-translate-y-1 hover:shadow-[0_22px_54px_rgba(15,23,42,0.13)] dark:border-blue-400/20 dark:from-blue-500/10 dark:via-slate-950 dark:to-cyan-500/5 dark:ring-white/5"
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
