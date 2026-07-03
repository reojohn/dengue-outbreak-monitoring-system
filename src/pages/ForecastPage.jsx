import { useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  CloudRain,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Database,
  Droplets,
  Gauge,
  LineChart,
  MapPin,
  ShieldAlert,
  Sparkles,
  Target,
  Thermometer,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'
import DecisionActionTracker from '../components/DecisionActionTracker'
import SparkChart from '../components/SparkChart'
import { useData } from '../context/DataContext'
import {
  computeDecisionSupport,
  computeMultiSourceRisk,
  computeRiskLevel,
  riskStyles,
} from '../utils/analytics'

const modeMeta = {
  caution: {
    label: 'Lower estimate',
    multiplier: 0.9,
    chip: 'bg-emerald-50 text-brand-green border-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  baseline: {
    label: 'Most likely',
    multiplier: 1,
    chip: 'bg-blue-50 text-brand-blue border-blue-100 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
  },
  elevated: {
    label: 'Higher estimate',
    multiplier: 1.15,
    chip: 'bg-amber-50 text-brand-orange border-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
  },
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-PH').format(Number(value || 0))
}

function formatDecimal(value, decimals = 2) {
  const number = Number(value || 0)

  return new Intl.NumberFormat('en-PH', {
    maximumFractionDigits: decimals,
  }).format(number)
}

function formatOptionalNumber(value, suffix = '') {
  const number = Number(value)

  if (!Number.isFinite(number) || number <= 0) {
    return 'Not available'
  }

  return `${formatDecimal(number)}${suffix}`
}

function normalizeFieldKey(key = '') {
  return String(key)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function readValue(record, keys = []) {
  if (!record) return undefined

  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
      return record[key]
    }
  }

  const normalizedLookup = Object.keys(record).reduce((acc, key) => {
    acc[normalizeFieldKey(key)] = record[key]
    return acc
  }, {})

  for (const key of keys) {
    const normalizedKey = normalizeFieldKey(key)

    if (
      normalizedLookup[normalizedKey] !== undefined &&
      normalizedLookup[normalizedKey] !== null &&
      normalizedLookup[normalizedKey] !== ''
    ) {
      return normalizedLookup[normalizedKey]
    }
  }

  return undefined
}

function toNumber(value) {
  if (value === undefined || value === null || value === '') return 0

  const cleaned =
    typeof value === 'string'
      ? value.replace(/,/g, '').trim()
      : value

  const number = Number(cleaned)

  return Number.isFinite(number) ? number : 0
}

function readNumber(record, keys = [], fallback = 0) {
  const value = readValue(record, keys)
  const number = toNumber(value)

  return Number.isFinite(number) ? number : fallback
}

function readPositiveNumber(record, keys = []) {
  const number = readNumber(record, keys, 0)

  return number > 0 ? number : 0
}

function readText(record, keys = [], fallback = '') {
  const value = readValue(record, keys)

  if (value === undefined || value === null || value === '') {
    return fallback
  }

  return String(value).trim()
}

function normalizeBarangayName(value = '') {
  return String(value)
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

function compactBarangayName(value = '') {
  return normalizeBarangayName(value).replace(/\s+/g, '')
}

function namesMatch(first, second) {
  const a = normalizeBarangayName(first)
  const b = normalizeBarangayName(second)
  const compactA = compactBarangayName(first)
  const compactB = compactBarangayName(second)

  if (!a || !b) return false
  if (a === b) return true
  if (compactA === compactB) return true

  if (a.length >= 4 && b.includes(a)) return true
  if (b.length >= 4 && a.includes(b)) return true

  return false
}

function getRecordPeriod(record, index) {
  const year = readText(record, ['year', 'reportingYear'])
  const week = readText(record, ['week', 'epi_week', 'epidemiologicalWeek'])

  if (year && week) {
    return `${year}-W${week}`
  }

  return (
    readText(record, [
      'reportingDate',
      'reporting_date',
      'date',
      'week',
      'epi_week',
      'period',
      'month',
      'quarter',
    ]) || `Period ${index + 1}`
  )
}

function getPeriodSortValue(period, fallbackIndex) {
  const parsedDate = Date.parse(period)

  if (Number.isFinite(parsedDate)) {
    return parsedDate
  }

  const numbers = String(period).match(/\d+/g)

  if (numbers?.length) {
    return Number(numbers.join('').slice(0, 12))
  }

  return fallbackIndex
}

function getRecordBarangay(record) {
  return (
    readText(record, [
      'barangay',
      'barangayName',
      'barangay_name',
      'brgy',
      'brgy_name',
      'location',
      'area',
      'adm4_name',
      'adm4_ref_name',
      'name',
    ]) || 'Unspecified barangay'
  )
}

function getRecordCases(record) {
  return readNumber(record, [
    'cases',
    'case_count',
    'caseCount',
    'dengue_cases',
    'dengueCases',
    'total_cases',
    'totalCases',
    'count',
    'confirmed_cases',
    'confirmedCases',
  ])
}

function average(values) {
  if (!values.length) return 0

  const total = values.reduce((sum, value) => {
    return sum + Number(value || 0)
  }, 0)

  return total / values.length
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function sum(values = []) {
  return values.reduce((total, value) => total + Number(value || 0), 0)
}

function parseCoverageDate(value) {
  if (value === undefined || value === null || value === '') return null

  const raw = String(value).trim()

  if (!raw) return null

  const weekMatch = raw.match(/^(\d{4})-?W(\d{1,2})$/i)

  if (weekMatch) {
    const year = Number(weekMatch[1])
    const week = Number(weekMatch[2])
    const date = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7))

    return Number.isNaN(date.getTime()) ? null : date
  }

  const parsed = new Date(raw)

  if (Number.isNaN(parsed.getTime())) return null

  return parsed
}

function formatCoverageDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'N/A'

  return date.toISOString().slice(0, 10)
}

function getWeatherDate(record) {
  const value = readValue(record, [
    'reportingDate',
    'reporting_date',
    'date',
    'weatherDate',
    'weather_date',
    'observationDate',
    'observation_date',
  ])

  return parseCoverageDate(value)
}

function getWeatherNumber(record, keys = []) {
  return readNumber(record, keys, 0)
}

function getWeatherContextForPeriods(periods = [], weatherRecords = []) {
  const emptyContext = {
    averageRainfall: 0,
    totalRainfall: 0,
    averageTemperature: 0,
    averageHumidity: 0,
    weatherRecordCount: 0,
    weatherCoverageLabel: 'Weather data unavailable',
  }

  if (!Array.isArray(weatherRecords) || !weatherRecords.length) {
    return emptyContext
  }

  const weatherItems = weatherRecords
    .map((record, index) => ({
      record,
      index,
      date: getWeatherDate(record),
      rainfall: getWeatherNumber(record, [
        'rainfall',
        'rainfall_mm',
        'rainfallMm',
        'rain',
        'rain_mm',
        'precipitation',
        'precipitation_mm',
        'precip',
        'prectotcorr',
      ]),
      temperature: getWeatherNumber(record, [
        'temperature',
        'temperature_c',
        'temperatureC',
        'temp',
        'temp_c',
        'air_temperature',
        't2m',
      ]),
      humidity: getWeatherNumber(record, [
        'humidity',
        'relative_humidity',
        'relativeHumidity',
        'humidity_percent',
        'rh',
        'rh2m',
      ]),
    }))
    .filter((item) => item.date)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  if (!weatherItems.length) {
    return emptyContext
  }

  const periodDates = periods
    .map((period) => parseCoverageDate(period.period))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime())

  let selectedWeatherItems = []

  if (periodDates.length) {
    const start = new Date(periodDates[0].getTime())
    const end = new Date(periodDates[periodDates.length - 1].getTime())

    start.setUTCDate(start.getUTCDate() - 14)
    end.setUTCDate(end.getUTCDate() + 7)

    selectedWeatherItems = weatherItems.filter((item) => {
      return item.date.getTime() >= start.getTime() && item.date.getTime() <= end.getTime()
    })
  }

  if (!selectedWeatherItems.length) {
    selectedWeatherItems = weatherItems.slice(-30)
  }

  const rainfallValues = selectedWeatherItems.map((item) => item.rainfall)
  const temperatureValues = selectedWeatherItems
    .map((item) => item.temperature)
    .filter((value) => value !== 0)
  const humidityValues = selectedWeatherItems
    .map((item) => item.humidity)
    .filter((value) => value !== 0)

  const firstDate = selectedWeatherItems[0]?.date
  const lastDate = selectedWeatherItems[selectedWeatherItems.length - 1]?.date

  return {
    averageRainfall: Number(average(rainfallValues).toFixed(2)),
    totalRainfall: Number(sum(rainfallValues).toFixed(2)),
    averageTemperature: Number(average(temperatureValues).toFixed(2)),
    averageHumidity: Number(average(humidityValues).toFixed(2)),
    weatherRecordCount: selectedWeatherItems.length,
    weatherCoverageLabel: firstDate && lastDate
      ? `${formatCoverageDate(firstDate)} to ${formatCoverageDate(lastDate)}`
      : 'Weather data available',
  }
}

function getTrendLabel(rate) {
  if (rate >= 0.25) return 'Increasing'
  if (rate <= -0.15) return 'Decreasing'
  return 'Stable'
}

function getTrendStyle(label) {
  if (label === 'Increasing') {
    return 'bg-rose-50 text-brand-red border-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300'
  }

  if (label === 'Decreasing') {
    return 'bg-emerald-50 text-brand-green border-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
  }

  return 'bg-blue-50 text-brand-blue border-blue-100 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300'
}

function getTrendIcon(label) {
  if (label === 'Increasing') return TrendingUp
  if (label === 'Decreasing') return TrendingDown
  return Activity
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

  return 'border-slate-200 bg-slate-50 text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

function getPriorityBadgeStyle(priority) {
  const value = String(priority || '').toLowerCase()

  if (value.includes('immediate') || value.includes('high priority')) {
    return 'border-rose-100 bg-rose-50 text-rose-600 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300'
  }

  if (value.includes('escalated') || value.includes('preventive')) {
    return 'border-amber-100 bg-amber-50 text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
  }

  if (value.includes('monitoring') || value.includes('early')) {
    return 'border-blue-100 bg-blue-50 text-blue-600 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300'
  }

  if (value.includes('routine')) {
    return 'border-emerald-100 bg-emerald-50 text-emerald-600 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
  }

  return 'border-slate-200 bg-slate-50 text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

function getBoundaryGeoJson(boundaryRecords = []) {
  if (!boundaryRecords) return null

  if (
    boundaryRecords.type === 'FeatureCollection' &&
    Array.isArray(boundaryRecords.features)
  ) {
    return boundaryRecords
  }

  if (Array.isArray(boundaryRecords)) {
    const featureCollection = boundaryRecords.find((item) => {
      return item?.type === 'FeatureCollection' && Array.isArray(item.features)
    })

    if (featureCollection) {
      return featureCollection
    }

    const features = boundaryRecords.filter((item) => {
      return item?.type === 'Feature' && item.geometry
    })

    if (features.length > 0) {
      return {
        type: 'FeatureCollection',
        features,
      }
    }
  }

  return null
}

function getFeatureName(feature) {
  const props = feature?.properties || {}

  return (
    props.adm4_name ||
    props.adm4_ref_name ||
    props.name ||
    props.barangay ||
    props.barangay_name ||
    props.BARANGAY ||
    props.ADM4_EN ||
    ''
  )
}

function getFeatureReferenceName(feature) {
  const props = feature?.properties || {}

  return (
    props.adm4_ref_name ||
    props.adm4_name ||
    props.name ||
    props.barangay ||
    props.barangay_name ||
    ''
  )
}

function getBoundaryFeatureForBarangay(barangay, boundaryRecords = []) {
  const boundaryGeoJson = getBoundaryGeoJson(boundaryRecords)

  if (!boundaryGeoJson?.features?.length) return null

  return (
    boundaryGeoJson.features.find((feature) => {
      return (
        namesMatch(barangay, getFeatureName(feature)) ||
        namesMatch(barangay, getFeatureReferenceName(feature))
      )
    }) || null
  )
}

function getRecordName(record) {
  return (
    readText(record, [
      'barangay',
      'barangayName',
      'barangay_name',
      'brgy',
      'brgy_name',
      'name',
      'adm4_name',
      'adm4_ref_name',
      'location',
    ]) || ''
  )
}

function getPopulationRecordForBarangay(barangay, populationRecords = []) {
  if (!Array.isArray(populationRecords) || !populationRecords.length) {
    return null
  }

  return (
    populationRecords.find((record) => {
      return namesMatch(getRecordName(record), barangay)
    }) || null
  )
}

function getPopulationValue(barangay, populationRecords = [], boundaryFeature = null) {
  const populationRecord = getPopulationRecordForBarangay(
    barangay,
    populationRecords
  )

  const props = boundaryFeature?.properties || {}

  return (
    readPositiveNumber(populationRecord, [
      'population',
      'totalPopulation',
      'populationCount',
      'population_count',
      'pop',
      'total_pop',
      'totalPop',
      'residents',
      'householdPopulation',
    ]) ||
    readPositiveNumber(props, [
      'population',
      'totalPopulation',
      'populationCount',
      'population_count',
      'pop',
      'total_pop',
      'totalPop',
      'POPULATION',
    ])
  )
}

function getAreaValue(boundaryFeature = null) {
  const props = boundaryFeature?.properties || {}

  return readPositiveNumber(props, [
    'area_sqkm',
    'areaSqKm',
    'area',
    'areaKm2',
    'area_km2',
    'sqkm',
  ])
}

function groupDengueRecords(records = []) {
  const periodMap = new Map()
  const barangayMap = new Map()

  records.forEach((record, index) => {
    const barangay = getRecordBarangay(record)
    const period = getRecordPeriod(record, index)
    const periodSortValue = getPeriodSortValue(period, index)
    const cases = getRecordCases(record)

    if (!periodMap.has(period)) {
      periodMap.set(period, {
        period,
        index,
        sortValue: periodSortValue,
        totalCases: 0,
      })
    }

    const periodItem = periodMap.get(period)
    periodItem.totalCases += cases

    const barangayKey = normalizeBarangayName(barangay)

    if (!barangayMap.has(barangayKey)) {
      barangayMap.set(barangayKey, {
        barangay,
        totalCases: 0,
        periodCases: new Map(),
      })
    }

    const barangayItem = barangayMap.get(barangayKey)
    barangayItem.totalCases += cases
    barangayItem.periodCases.set(
      period,
      toNumber(barangayItem.periodCases.get(period)) + cases
    )
  })

  const periods = Array.from(periodMap.values()).sort((a, b) => {
    if (a.sortValue !== b.sortValue) return a.sortValue - b.sortValue
    return a.index - b.index
  })

  const barangays = Array.from(barangayMap.values())

  return {
    periods,
    barangays,
  }
}

function buildDynamicForecastRows(
  records = [],
  multiplier = 1,
  populationRecords = [],
  boundaryRecords = [],
  weatherRecords = []
) {
  const { periods, barangays } = groupDengueRecords(records)

  if (!records.length || !periods.length || !barangays.length) {
    return {
      forecastRows: [],
      weeklyTotals: [],
      projectedWeeklyValues: [],
      computedPeriods: [],
    }
  }

  const weeklyTotals = periods.map((period) => period.totalCases)
  const weatherContext = getWeatherContextForPeriods(periods, weatherRecords)

  const forecastRows = barangays.map((barangayItem) => {
    const boundaryFeature = getBoundaryFeatureForBarangay(
      barangayItem.barangay,
      boundaryRecords
    )

    const caseSeries = periods.map((period) => {
      return toNumber(barangayItem.periodCases.get(period.period))
    })

    const series = periods.map((period) => {
      return {
        period: period.period,
        cases: toNumber(barangayItem.periodCases.get(period.period)),
      }
    })

    const recentValues = caseSeries.slice(-3)
    const previousValues = caseSeries.slice(-6, -3)

    const recentAverage = average(recentValues)
    const previousAverage = average(previousValues)

    let trendRate = 0

    if (previousAverage > 0) {
      trendRate = (recentAverage - previousAverage) / previousAverage
    } else if (recentAverage > 0) {
      trendRate = 0.15
    }

    const cappedTrendRate = clamp(trendRate, -0.5, 0.75)

    const projectedFourWeekCases = Math.max(
      0,
      Math.round(recentAverage * 4 * multiplier * (1 + cappedTrendRate))
    )

    const trendLabel = getTrendLabel(cappedTrendRate)

    const firstValue = caseSeries[0] || 0
    const lastValue = caseSeries[caseSeries.length - 1] || 0

    const population = getPopulationValue(
      barangayItem.barangay,
      populationRecords,
      boundaryFeature
    )

    const area = getAreaValue(boundaryFeature)
    const density = population > 0 && area > 0 ? population / area : 0

    const previousCases =
      caseSeries.length >= 2 ? caseSeries[caseSeries.length - 2] : 0

    const currentCases =
      caseSeries.length >= 1 ? caseSeries[caseSeries.length - 1] : 0

    const multiSourceRisk = computeMultiSourceRisk({
      forecast: projectedFourWeekCases,
      currentCases,
      previousCases,
      totalCases: barangayItem.totalCases,
      trend: trendLabel,
      trendRate: cappedTrendRate,
      recentAverage,
      previousAverage,
      history: caseSeries,
      weeklyCases: caseSeries,
      population,
      areaSqKm: area,
      density,
      averageRainfall: weatherContext.averageRainfall,
      totalRainfall: weatherContext.totalRainfall,
      averageTemperature: weatherContext.averageTemperature,
      averageHumidity: weatherContext.averageHumidity,
    })

    const risk = multiSourceRisk.risk
    const riskScore = multiSourceRisk.score

    const rowData = {
      barangay: barangayItem.barangay,
      totalCases: barangayItem.totalCases,
      cases: barangayItem.totalCases,
      currentCases,
      previousCases,
      recentAverage: Number(recentAverage.toFixed(2)),
      previousAverage: Number(previousAverage.toFixed(2)),
      trendRate: cappedTrendRate,
      trendPercent: Math.round(cappedTrendRate * 100),
      trend: trendLabel,
      trendLabel,
      firstValue,
      lastValue,
      forecast: projectedFourWeekCases,
      forecastedCases: projectedFourWeekCases,
      predictedCases: projectedFourWeekCases,
      risk,
      history: caseSeries,
      weeklyCases: caseSeries,
      caseHistory: series,
      series,
      periods: periods.map((period) => period.period),
      population,
      area_sqkm: area,
      areaSqKm: area,
      density,
      averageRainfall: weatherContext.averageRainfall,
      avgRainfall: weatherContext.averageRainfall,
      totalRainfall: weatherContext.totalRainfall,
      averageTemperature: weatherContext.averageTemperature,
      avgTemperature: weatherContext.averageTemperature,
      averageHumidity: weatherContext.averageHumidity,
      avgHumidity: weatherContext.averageHumidity,
      weatherRecordCount: weatherContext.weatherRecordCount,
      weatherCoverageLabel: weatherContext.weatherCoverageLabel,
      riskScore,
      multiSourceRiskScore: riskScore,
      riskComponents: multiSourceRisk.components,
      environmentalSuitability: multiSourceRisk.environmentalSuitability.label,
      environmentalScore: multiSourceRisk.environmentalSuitability.score,
      rainfallPressure: multiSourceRisk.environmentalSuitability.rainfallPressure.label,
      temperatureSuitability: multiSourceRisk.environmentalSuitability.temperatureSuitability.label,
      humiditySuitability: multiSourceRisk.environmentalSuitability.humiditySuitability.label,
    }

    const decisionSupport = computeDecisionSupport(rowData)

    return {
      ...rowData,
      decisionSupport,
      recommendedAction: decisionSupport.summary,
      primaryAction: decisionSupport.primaryAction,
      recommendedActions: decisionSupport.actions,
      recommendationRationale: decisionSupport.rationale,
      responsePriority: decisionSupport.priority,
      decisionScore: decisionSupport.score,
      trendDirection: decisionSupport.trendDirection,
      densityLevel: decisionSupport.densityLevel,
      populationExposure: decisionSupport.populationExposure,
      forecastPressure: decisionSupport.forecastPressure,
      environmentalSuitability: decisionSupport.environmentalSuitability,
      environmentalScore: decisionSupport.environmentalScore,
      rainfallPressure: decisionSupport.rainfallPressure,
      temperatureSuitability: decisionSupport.temperatureSuitability,
      humiditySuitability: decisionSupport.humiditySuitability,
      multiSourceRiskScore: decisionSupport.multiSourceRiskScore,
      riskScore: decisionSupport.riskScore,
      riskComponents: decisionSupport.riskComponents,
    }
  })

  const totalRecentAverage = average(weeklyTotals.slice(-3))
  const totalPreviousAverage = average(weeklyTotals.slice(-6, -3))

  let totalTrendRate = 0

  if (totalPreviousAverage > 0) {
    totalTrendRate = (totalRecentAverage - totalPreviousAverage) / totalPreviousAverage
  } else if (totalRecentAverage > 0) {
    totalTrendRate = 0.15
  }

  const cappedTotalTrendRate = clamp(totalTrendRate, -0.5, 0.75)

  const projectedWeeklyValues = Array.from({ length: 6 }).map((_, index) => {
    const growthFactor = 1 + cappedTotalTrendRate * ((index + 1) / 6)
    return Math.max(0, Math.round(totalRecentAverage * multiplier * growthFactor))
  })

  return {
    forecastRows: forecastRows.sort((a, b) => {
      const scoreDifference = Number(b.riskScore || 0) - Number(a.riskScore || 0)

      if (scoreDifference !== 0) return scoreDifference

      if (b.decisionScore !== a.decisionScore) {
        return b.decisionScore - a.decisionScore
      }

      return b.forecast - a.forecast
    }),
    weeklyTotals,
    projectedWeeklyValues,
    computedPeriods: periods,
  }
}

function hasBackendForecastData(backendForecastResult) {
  return Array.isArray(backendForecastResult?.forecast_results) &&
    backendForecastResult.forecast_results.length > 0
}

function getTrendRateFromLabel(label = '') {
  if (label === 'Increasing') return 0.25
  if (label === 'Decreasing') return -0.15
  return 0
}

function buildBackendForecastRows(
  backendForecastResult = null,
  multiplier = 1,
  populationRecords = [],
  boundaryRecords = [],
  weatherRecords = []
) {
  const backendRows = backendForecastResult?.forecast_results || []

  if (!backendRows.length) {
    return {
      forecastRows: [],
      weeklyTotals: [],
      projectedWeeklyValues: [],
      computedPeriods: [],
    }
  }

  const backendPeriods = backendRows.map((backendRow, index) => ({
    period: readText(backendRow, ['latest_period'], `Forecast period ${index + 1}`),
    index,
    sortValue: index,
  }))

  const weatherContext = getWeatherContextForPeriods(backendPeriods, weatherRecords)

  const forecastRows = backendRows.map((backendRow) => {
    const baseForecast = readNumber(backendRow, ['forecast_next_4_periods'], 0)
    const adjustedForecast = Math.max(0, Math.round(baseForecast * multiplier))
    const barangay = readText(backendRow, ['barangay'], 'Unspecified barangay')
    const trendLabel = readText(backendRow, ['trend_direction'], 'Stable')
    const trendRate = getTrendRateFromLabel(trendLabel)
    const forecastNextPeriod = Math.max(
      0,
      Math.round(readNumber(backendRow, ['forecast_next_period'], 0) * multiplier)
    )
    const recentAverage = readNumber(backendRow, ['recent_average_cases'], 0)
    const previousAverage = readNumber(backendRow, ['previous_average_cases'], 0)
    const historicalTotalCases = readNumber(backendRow, ['historical_total_cases'], 0)
    const latestPeriod = readText(backendRow, ['latest_period'], 'Latest period')

    const caseSeries = [
      previousAverage,
      recentAverage,
      forecastNextPeriod,
    ].filter((value) => Number.isFinite(Number(value)))

    const series = [
      {
        period: 'Previous average',
        cases: previousAverage,
      },
      {
        period: 'Recent average',
        cases: recentAverage,
      },
      {
        period: 'Forecast next period',
        cases: forecastNextPeriod,
      },
    ]

    const boundaryFeature = getBoundaryFeatureForBarangay(barangay, boundaryRecords)
    const population = getPopulationValue(barangay, populationRecords, boundaryFeature)
    const area = getAreaValue(boundaryFeature)
    const density = population > 0 && area > 0 ? population / area : 0

    const multiSourceRisk = computeMultiSourceRisk({
      forecast: adjustedForecast,
      currentCases: forecastNextPeriod,
      previousCases: previousAverage,
      totalCases: historicalTotalCases,
      trend: trendLabel,
      trendRate,
      recentAverage,
      previousAverage,
      history: caseSeries,
      weeklyCases: caseSeries,
      population,
      areaSqKm: area,
      density,
      averageRainfall: weatherContext.averageRainfall,
      totalRainfall: weatherContext.totalRainfall,
      averageTemperature: weatherContext.averageTemperature,
      averageHumidity: weatherContext.averageHumidity,
    })

    const risk = multiSourceRisk.risk
    const riskScore = multiSourceRisk.score

    const rowData = {
      barangay,
      totalCases: historicalTotalCases,
      cases: historicalTotalCases,
      currentCases: forecastNextPeriod,
      previousCases: previousAverage,
      recentAverage: Number(recentAverage.toFixed(2)),
      previousAverage: Number(previousAverage.toFixed(2)),
      trendRate,
      trendPercent: Math.round(trendRate * 100),
      trend: trendLabel,
      trendLabel,
      firstValue: caseSeries[0] || 0,
      lastValue: caseSeries[caseSeries.length - 1] || 0,
      forecast: adjustedForecast,
      forecastedCases: adjustedForecast,
      predictedCases: adjustedForecast,
      risk,
      history: caseSeries,
      weeklyCases: caseSeries,
      caseHistory: series,
      series,
      periods: [latestPeriod],
      population,
      area_sqkm: area,
      areaSqKm: area,
      density,
      averageRainfall: weatherContext.averageRainfall,
      avgRainfall: weatherContext.averageRainfall,
      totalRainfall: weatherContext.totalRainfall,
      averageTemperature: weatherContext.averageTemperature,
      avgTemperature: weatherContext.averageTemperature,
      averageHumidity: weatherContext.averageHumidity,
      avgHumidity: weatherContext.averageHumidity,
      weatherRecordCount: weatherContext.weatherRecordCount,
      weatherCoverageLabel: weatherContext.weatherCoverageLabel,
      riskScore,
      multiSourceRiskScore: riskScore,
      riskComponents: multiSourceRisk.components,
      environmentalSuitability: multiSourceRisk.environmentalSuitability.label,
      environmentalScore: multiSourceRisk.environmentalSuitability.score,
      rainfallPressure: multiSourceRisk.environmentalSuitability.rainfallPressure.label,
      temperatureSuitability: multiSourceRisk.environmentalSuitability.temperatureSuitability.label,
      humiditySuitability: multiSourceRisk.environmentalSuitability.humiditySuitability.label,
      backendPriorityRank: readNumber(backendRow, ['priority_rank'], 0),
      backendRecommendation: readText(backendRow, ['recommendation'], ''),
      backendRiskLevel: readText(backendRow, ['risk_level'], risk),
    }

    const decisionSupportBase = computeDecisionSupport(rowData)
    const backendRecommendation = rowData.backendRecommendation || decisionSupportBase.summary

    const decisionSupport = {
      ...decisionSupportBase,
      summary: backendRecommendation,
    }

    return {
      ...rowData,
      decisionSupport,
      recommendedAction: backendRecommendation,
      primaryAction: decisionSupport.primaryAction,
      recommendedActions: decisionSupport.actions,
      recommendationRationale: decisionSupport.rationale,
      responsePriority: decisionSupport.priority,
      decisionScore: decisionSupport.score,
      trendDirection: decisionSupport.trendDirection,
      densityLevel: decisionSupport.densityLevel,
      populationExposure: decisionSupport.populationExposure,
      forecastPressure: decisionSupport.forecastPressure,
      environmentalSuitability: decisionSupport.environmentalSuitability,
      environmentalScore: decisionSupport.environmentalScore,
      rainfallPressure: decisionSupport.rainfallPressure,
      temperatureSuitability: decisionSupport.temperatureSuitability,
      humiditySuitability: decisionSupport.humiditySuitability,
      multiSourceRiskScore: decisionSupport.multiSourceRiskScore,
      riskScore: decisionSupport.riskScore,
      riskComponents: decisionSupport.riskComponents,
    }
  })

  const sortedForecastRows = forecastRows.sort((a, b) => {
    if (a.backendPriorityRank && b.backendPriorityRank) {
      return a.backendPriorityRank - b.backendPriorityRank
    }

    if (b.decisionScore !== a.decisionScore) {
      return b.decisionScore - a.decisionScore
    }

    return b.forecast - a.forecast
  })

  const totalNextPeriod = sortedForecastRows.reduce((sum, row) => {
    return sum + Number(row.currentCases || 0)
  }, 0)

  const projectedWeeklyValues = Array.from({ length: 4 }).map(() => {
    return Math.max(0, Math.round(totalNextPeriod))
  })

  const computedPeriods = Array.from({ length: 4 }).map((_, index) => ({
    period: `Forecast period ${index + 1}`,
    index,
    sortValue: index,
    totalCases: projectedWeeklyValues[index] || 0,
  }))

  return {
    forecastRows: sortedForecastRows,
    weeklyTotals: projectedWeeklyValues,
    projectedWeeklyValues,
    computedPeriods,
  }
}

function getRiskDistribution(rows) {
  const total = rows.length || 1

  const counts = {
    High: rows.filter((row) => row.risk === 'High').length,
    Moderate: rows.filter((row) => row.risk === 'Moderate').length,
    Low: rows.filter((row) => row.risk === 'Low').length,
  }

  return [
    {
      label: 'High risk',
      level: 'High',
      count: counts.High,
      width: `${Math.round((counts.High / total) * 100)}%`,
      bar: 'bg-rose-500',
      badge: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
      icon: ShieldAlert,
    },
    {
      label: 'Moderate risk',
      level: 'Moderate',
      count: counts.Moderate,
      width: `${Math.round((counts.Moderate / total) * 100)}%`,
      bar: 'bg-amber-500',
      badge: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
      icon: AlertTriangle,
    },
    {
      label: 'Low risk',
      level: 'Low',
      count: counts.Low,
      width: `${Math.round((counts.Low / total) * 100)}%`,
      bar: 'bg-emerald-500',
      badge: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
      icon: CheckCircle2,
    },
  ]
}

function getPriorityDistribution(rows) {
  const priorityMap = new Map()

  rows.forEach((row) => {
    const priority =
      row.responsePriority ||
      row.decisionSupport?.priority ||
      'Pending Dataset'

    priorityMap.set(priority, toNumber(priorityMap.get(priority)) + 1)
  })

  return Array.from(priorityMap.entries())
    .map(([priority, count]) => ({
      priority,
      count,
    }))
    .sort((a, b) => b.count - a.count)
}

function getComputationStatus(records, sourceStatus, backendForecastResult = null) {
  if (hasBackendForecastData(backendForecastResult)) {
    const processedRecordCount = Number(
  backendForecastResult.valid_row_count || records.length || 0
)

const highRiskCount = Number(backendForecastResult?.risk_counts?.High || 0)
const moderateRiskCount = Number(backendForecastResult?.risk_counts?.Moderate || 0)
const lowRiskCount = Number(backendForecastResult?.risk_counts?.Low || 0)

return {
  title: 'Forecast ready',
  message: `${formatNumber(processedRecordCount)} dengue record${processedRecordCount === 1 ? '' : 's'} were analyzed. The system identified ${formatNumber(highRiskCount)} high-risk barangay${highRiskCount === 1 ? '' : 's'}, ${formatNumber(moderateRiskCount)} moderate-risk barangay${moderateRiskCount === 1 ? '' : 's'}, and ${formatNumber(lowRiskCount)} low-risk barangay${lowRiskCount === 1 ? '' : 's'}. Review the priority barangays and recommended actions below.`,
  style: 'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
  icon: CheckCircle2,
}
  }

  if (!records.length) {
    return {
      title: 'No dengue records available',
      message: 'Upload dengue case records first before generating a forecast.',
      style: 'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
      icon: AlertTriangle,
    }
  }

  return {
    title: 'Forecast ready',
    message: `${formatNumber(records.length)} dengue record${records.length === 1 ? '' : 's'} loaded from ${sourceStatus?.dengue?.uploadedName || 'current dataset'}. The system prepared the forecast, checked recent changes, weather, population, and barangay size, then ranked the barangays by priority.`,
    style: 'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
    icon: CheckCircle2,
  }
}

function PremiumPanel({ id, children, className = '' }) {
  return (
    <section
      id={id}
      className={`scroll-mt-28 overflow-hidden rounded-[32px] border border-slate-200/80 bg-white/90 shadow-[0_22px_60px_rgba(15,23,42,0.08)] ring-1 ring-white/70 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/80 dark:ring-white/5 ${className}`}
    >
      {children}
    </section>
  )
}

function SectionBadge({ icon: Icon, children, tone = 'blue' }) {
  const toneMap = {
    blue: 'border-blue-100 bg-blue-50 text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
    rose: 'border-rose-100 bg-rose-50 text-brand-red dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
    emerald: 'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
    amber: 'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
    slate: 'border-slate-200 bg-slate-50 text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  }

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${toneMap[tone] || toneMap.blue}`}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
      {children}
    </div>
  )
}

function StatCard({ label, value, helper, icon: Icon, tone = 'blue' }) {
  const toneMap = {
    blue: {
      iconWrap: 'border-blue-100 bg-blue-50 text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
      glow: 'bg-blue-500/10',
      accent: 'from-blue-500 to-sky-400',
    },
    rose: {
      iconWrap: 'border-rose-100 bg-rose-50 text-brand-red dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
      glow: 'bg-rose-500/10',
      accent: 'from-rose-500 to-red-400',
    },
    emerald: {
      iconWrap: 'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
      glow: 'bg-emerald-500/10',
      accent: 'from-emerald-500 to-teal-400',
    },
    amber: {
      iconWrap: 'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
      glow: 'bg-amber-500/10',
      accent: 'from-amber-500 to-orange-400',
    },
  }

  const style = toneMap[tone] || toneMap.blue

  return (
    <div className="group relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.07)] ring-1 ring-white/70 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_26px_58px_rgba(15,23,42,0.12)] dark:border-slate-800/80 dark:bg-slate-950/80 dark:ring-white/5">
      <div className={`absolute -right-8 -top-8 h-28 w-28 rounded-full ${style.glow} blur-3xl`} />
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${style.accent}`} />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand-muted dark:text-slate-400">
            {label}
          </p>

          <h3 className="mt-3 break-words text-3xl font-black tracking-tight text-brand-text dark:text-slate-100">
            {value}
          </h3>

          <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
            {helper}
          </p>
        </div>

        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border shadow-sm ${style.iconWrap}`}>
          <Icon className="h-6 w-6" strokeWidth={2.3} />
        </div>
      </div>
    </div>
  )
}

function HeroMetric({ label, value, helper }) {
  return (
    <div className="rounded-[24px] border border-white/20 bg-white/10 p-4 shadow-sm backdrop-blur">
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/80">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black tracking-tight text-white">
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-white/80">
        {helper}
      </p>
    </div>
  )
}

export default function ForecastPage() {
  const [mode, setMode] = useState('baseline')
  const [showAllTopBarangays, setShowAllTopBarangays] = useState(false)
  const [expandedBarangay, setExpandedBarangay] = useState(null)

  const {
    dengueRecords = [],
    populationRecords = [],
    boundaryRecords = [],
    weatherRecords = [],
    sourceStatus,
    backendForecastResult = null,
    addActivityLog,
  } = useData()

  const selectedMode = modeMeta[mode]
  const usingBackendForecast = hasBackendForecastData(backendForecastResult)

  const {
    forecastRows,
    weeklyTotals,
    projectedWeeklyValues,
    computedPeriods,
  } = useMemo(() => {
    if (hasBackendForecastData(backendForecastResult)) {
      return buildBackendForecastRows(
        backendForecastResult,
        selectedMode.multiplier,
        populationRecords,
        boundaryRecords,
        weatherRecords
      )
    }

    return buildDynamicForecastRows(
      dengueRecords,
      selectedMode.multiplier,
      populationRecords,
      boundaryRecords,
      weatherRecords
    )
  }, [
    backendForecastResult,
    dengueRecords,
    selectedMode,
    populationRecords,
    boundaryRecords,
    weatherRecords,
  ])

  const topBarangays = forecastRows.slice(0, 5)
  const visibleTopBarangays = showAllTopBarangays
    ? topBarangays
    : topBarangays.slice(0, 3)

  const riskDistribution = getRiskDistribution(forecastRows)
  const priorityDistribution = getPriorityDistribution(forecastRows)
  const highRiskCount = riskDistribution.find((item) => item.level === 'High')?.count || 0

  const projectedTotal = forecastRows.reduce((sum, row) => {
    return sum + Number(row.forecast || 0)
  }, 0)

  const actualTotal = usingBackendForecast
    ? Number(backendForecastResult?.forecast_results?.reduce((sum, row) => {
        return sum + Number(row.historical_total_cases || 0)
      }, 0) || 0)
    : dengueRecords.reduce((sum, record) => {
        return sum + getRecordCases(record)
      }, 0)

  const loadedRecordCount = usingBackendForecast
    ? Number(backendForecastResult?.valid_row_count || 0)
    : dengueRecords.length

  const latestSourceTotal = weeklyTotals.length
    ? weeklyTotals[weeklyTotals.length - 1]
    : 0

  const highestRiskBarangay = forecastRows[0]
  const topDecisionSupport = highestRiskBarangay?.decisionSupport || null
  const topRiskScore = Number(
    highestRiskBarangay?.riskScore ||
      highestRiskBarangay?.multiSourceRiskScore ||
      0
  )
  const topEnvironmentalSuitability = highestRiskBarangay?.environmentalSuitability || 'Weather data unavailable'
  const topRainfallPressure = highestRiskBarangay?.rainfallPressure || 'Rainfall unavailable'
  const topTemperatureSuitability = highestRiskBarangay?.temperatureSuitability || 'Temperature unavailable'
  const topHumiditySuitability = highestRiskBarangay?.humiditySuitability || 'Humidity unavailable'
  const topWeatherCoverage = highestRiskBarangay?.weatherCoverageLabel || 'Weather data unavailable'
  const topAverageRainfall = Number(highestRiskBarangay?.averageRainfall || highestRiskBarangay?.avgRainfall || 0)
  const topAverageTemperature = Number(highestRiskBarangay?.averageTemperature || highestRiskBarangay?.avgTemperature || 0)
  const topAverageHumidity = Number(highestRiskBarangay?.averageHumidity || highestRiskBarangay?.avgHumidity || 0)
  const topWeatherRecordCount = Number(highestRiskBarangay?.weatherRecordCount || 0)
  const topRiskComponents = highestRiskBarangay?.riskComponents || {}
  const computationStatus = getComputationStatus(
    dengueRecords,
    sourceStatus,
    backendForecastResult
  )
  const StatusIcon = computationStatus.icon

  const immediatePriorityCount = forecastRows.filter((row) => {
    const priority = String(row.responsePriority || '').toLowerCase()
    return (
      priority.includes('immediate') ||
      priority.includes('high priority') ||
      priority.includes('escalated')
    )
  }).length

  const increasingBarangays = forecastRows.filter((row) => {
    return row.trendLabel === 'Increasing'
  }).length

  const multiSourceFactorCards = [
    {
      label: 'Overall risk score',
      value: topRiskScore > 0 ? `${formatNumber(topRiskScore)}/100` : 'No data',
      helper: 'Combined case, weather, population, and crowding score',
      icon: Gauge,
      tone: topRiskScore >= 60 ? 'rose' : topRiskScore >= 25 ? 'amber' : 'blue',
    },
    {
      label: 'Rainfall level',
      value: topAverageRainfall > 0 ? `${formatDecimal(topAverageRainfall)} mm average` : 'No data',
      helper: topRainfallPressure,
      icon: CloudRain,
      tone: 'blue',
    },
    {
      label: 'Temperature condition',
      value: topAverageTemperature > 0 ? `${formatDecimal(topAverageTemperature)} °C` : 'No data',
      helper: topTemperatureSuitability,
      icon: Thermometer,
      tone: 'amber',
    },
    {
      label: 'Humidity level',
      value: topAverageHumidity > 0 ? `${formatDecimal(topAverageHumidity)}%` : 'No data',
      helper: topHumiditySuitability,
      icon: Droplets,
      tone: 'emerald',
    },
  ]

  const decisionHighlights = useMemo(() => {
    if (!forecastRows.length) {
      return [
        {
          title: 'Dengue records needed',
          body: 'Upload dengue case records first so the system can suggest which barangays need attention.',
          icon: Database,
          style: 'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
        },
        {
          title: 'Check the uploaded file',
          body: 'Review the uploaded dengue records so the system can prepare barangay forecasts, risk levels, and recommended actions.',
          icon: ClipboardList,
          style: 'border-blue-100 bg-blue-50 text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
        },
        {
          title: 'Priority list ready',
          body: 'Once records are available, this page will rank barangays by overall priority, not by color alone.',
          icon: Target,
          style: 'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
        },
      ]
    }

    return [
      {
        title: 'Barangays needing attention',
        body: immediatePriorityCount > 0
          ? `${immediatePriorityCount} barangay${immediatePriorityCount === 1 ? '' : 's'} need quick or high-priority action based on the selected forecast setting.`
          : 'No barangay currently needs urgent action based on the selected forecast setting.',
        icon: ShieldAlert,
        style: immediatePriorityCount > 0
          ? 'border-rose-100 bg-rose-50 text-rose-600 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300'
          : 'border-emerald-100 bg-emerald-50 text-emerald-600 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
      },
      {
        title: 'Barangays with rising cases',
        body: increasingBarangays > 0
          ? `${increasingBarangays} barangay${increasingBarangays === 1 ? ' has' : 's have'} rising recent cases and should be checked before the situation gets worse.`
          : 'Current dengue cases are stable or decreasing across the checked barangays.',
        icon: TrendingUp,
        style: increasingBarangays > 0
          ? 'border-amber-100 bg-amber-50 text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
          : 'border-blue-100 bg-blue-50 text-blue-600 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
      },
      {
        title: 'Main barangay to focus on',
        body: highestRiskBarangay
          ? `${highestRiskBarangay.barangay} is currently the top priority because of its expected cases, recent changes, weather, population, and crowding level.`
          : 'No top barangay has been identified yet.',
        icon: Target,
        style: 'border-blue-100 bg-blue-50 text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
      },
    ]
  }, [
    forecastRows,
    immediatePriorityCount,
    increasingBarangays,
    highestRiskBarangay,
  ])

  function handleRunForecast() {
    addActivityLog(
      usingBackendForecast ? 'Forecast saved' : 'Forecast generated',
      `${selectedMode.label} forecast prepared from ${formatNumber(loadedRecordCount)} dengue records with ${formatNumber(projectedTotal)} expected cases.`
    )
  }

  return (
    <div className="relative space-y-6 pb-10">
      <div className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-72 rounded-full bg-blue-100/60 blur-3xl dark:bg-blue-500/10" />

      <section className="relative overflow-hidden rounded-[36px] border border-slate-900/10 bg-gradient-to-br from-slate-950 via-blue-950 to-emerald-900 p-5 shadow-[0_28px_70px_rgba(15,23,42,0.22)] sm:p-6 lg:p-7">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-10 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_34%)]" />

        <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_410px] xl:items-end">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/80 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Case forecast
            </div>

            <h1 className="max-w-4xl text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
              Dengue Case Forecast
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/90 sm:text-base">
              {usingBackendForecast
                ? 'The latest uploaded data was analyzed together with weather, population, and barangay map details to show which areas may need attention first.'
                : 'Dengue records are checked together with weather, population, and barangay map details to estimate future cases and suggest actions for each barangay.'}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <HeroMetric
                label="Expected total cases"
                value={formatNumber(projectedTotal)}
                helper="Expected cases in the next four weeks"
              />

              <HeroMetric
                label="Urgent alerts"
                value={formatNumber(immediatePriorityCount)}
                helper="Barangays needing quick action"
              />

              <HeroMetric
                label="High-risk barangays"
                value={formatNumber(highRiskCount)}
                helper="Barangays with high warning level"
              />
            </div>
          </div>

          <div className="rounded-[28px] border border-white/25 bg-white/20 p-4 shadow-[0_20px_48px_rgba(0,0,0,0.16)] backdrop-blur-xl">
  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/80">
    Forecast setting
  </p>

  <div className="mt-3 grid gap-2">
    {[
      ['caution', 'Lower estimate', '0.90x'],
      ['baseline', 'Most likely', '1.00x'],
      ['elevated', 'Higher estimate', '1.15x'],
    ].map(([key, label, multiplier]) => {
      const isActive = mode === key

      return (
        <button
          key={key}
          type="button"
          onClick={() => setMode(key)}
          style={
            isActive
              ? {
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  borderColor: '#ffffff',
                }
              : undefined
          }
          className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-bold transition ${
            isActive
              ? 'shadow-[0_14px_30px_rgba(255,255,255,0.24)]'
              : 'border-white/20 bg-white/10 text-white hover:border-white/40 hover:bg-white/20'
          }`}
        >
          <span>{label}</span>

          <span
            style={
              isActive
                ? {
                    backgroundColor: '#255f8f',
                    color: '#ffffff',
                  }
                : undefined
            }
            className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
              isActive
                ? ''
                : 'bg-white/20 text-white'
            }`}
          >
            {multiplier}
          </span>
        </button>
      )
    })}
  </div>

  <div className="mt-4 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-xs leading-5 text-white/80">
    This setting adjusts the estimate before the system ranks barangays by priority.
  </div>
</div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Expected total cases"
          value={formatNumber(projectedTotal)}
          helper="Four-week projected cases"
          icon={LineChart}
          tone="blue"
        />

        <StatCard
          label="Top priority barangay"
          value={highestRiskBarangay?.barangay || 'No data'}
          helper={highestRiskBarangay?.responsePriority || 'Highest priority barangay'}
          icon={Target}
          tone="rose"
        />

        <StatCard
          label="Cases in records"
          value={formatNumber(actualTotal)}
          helper="Total cases from the uploaded file"
          icon={Activity}
          tone="amber"
        />

        <StatCard
          label="Records checked"
          value={formatNumber(loadedRecordCount)}
          helper={usingBackendForecast ? 'Valid records used' : 'Dengue records used'}
          icon={Database}
          tone="emerald"
        />
      </div>

      <div className={`relative overflow-hidden rounded-[28px] border px-5 py-4 shadow-[0_18px_40px_rgba(15,23,42,0.07)] ${computationStatus.style}`}>
        <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-white/50 blur-2xl dark:bg-white/5" />
        <div className="relative flex items-start gap-3">
          <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/80 shadow-sm ring-1 ring-white/70 dark:bg-white/10 dark:ring-white/10">
            <StatusIcon className="h-5 w-5" />
          </div>

          <div>
            <p className="text-sm font-black">
              {computationStatus.title}
            </p>

            <p className="mt-1 text-sm leading-6 opacity-85">
              {computationStatus.message}
            </p>
          </div>
        </div>
      </div>

      <PremiumPanel id="multi-source-risk-factors" className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <SectionBadge icon={Gauge} tone="emerald">
              Factors used for risk level
            </SectionBadge>

            <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
              Weather and community details
            </h2>

            <p className="mt-1 max-w-3xl text-sm leading-6 text-brand-muted dark:text-slate-400">
              The top barangay is checked using expected cases, recent changes, rainfall, temperature, humidity, population, crowding level, and barangay land area.
            </p>
          </div>

          <div className="w-fit rounded-full border border-emerald-100 bg-emerald-50 px-4 py-2 text-xs font-black text-brand-green shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
            {topEnvironmentalSuitability}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {multiSourceFactorCards.map((item) => (
            <StatCard
              key={item.label}
              label={item.label}
              value={item.value}
              helper={item.helper}
              icon={item.icon}
              tone={item.tone}
            />
          ))}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
            <p className="text-sm font-black text-brand-text dark:text-slate-100">
              What affected the score
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Expected cases', topRiskComponents.forecast || 0],
                ['Current cases', topRiskComponents.currentCases || 0],
                ['Recent change', topRiskComponents.trend || 0],
                ['Weather', topRiskComponents.environment || 0],
                ['Population', topRiskComponents.population || 0],
                ['Crowding', topRiskComponents.density || 0],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[20px] border border-slate-200 bg-white px-3 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                      {label}
                    </span>
                    <span className="text-sm font-black text-brand-text dark:text-slate-100">
                      {formatNumber(value)}
                    </span>
                  </div>

                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-blue to-cyan-400"
                      style={{ width: `${Math.min(Math.max(Number(value || 0), 0), 40) * 2.5}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[26px] border border-blue-100 bg-blue-50/80 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
            <p className="text-sm font-black text-brand-blue dark:text-blue-300">
              Weather records used
            </p>

            <p className="mt-2 text-sm leading-6 text-brand-muted dark:text-slate-400">
              {topWeatherCoverage}. The system used {formatNumber(topWeatherRecordCount)} weather record{topWeatherRecordCount === 1 ? '' : 's'} near the dengue reporting period.
            </p>

            <p className="mt-3 text-xs leading-5 text-brand-muted dark:text-slate-500">
              These weather values help estimate risk. The warning levels can still be improved when more dengue records are available.
            </p>
          </div>
        </div>
      </PremiumPanel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.24fr)_minmax(360px,0.76fr)]">
        <PremiumPanel id="forecast-model" className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <SectionBadge icon={Sparkles} tone="amber">
                Forecast details
              </SectionBadge>

              <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
                Expected weekly cases
              </h2>

              <p className="mt-1 max-w-2xl text-sm leading-6 text-brand-muted dark:text-slate-400">
                {usingBackendForecast
                  ? 'Loaded from the latest checked forecast after upload review.'
                  : 'Estimated from recent dengue case changes in the uploaded records.'}
              </p>
            </div>

            <span className={`w-fit rounded-full border px-4 py-2 text-xs font-black shadow-sm ${selectedMode.chip}`}>
              {selectedMode.label} mode
            </span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
              <p className="text-[11px] font-black uppercase tracking-[0.15em] text-brand-muted dark:text-slate-500">
                Latest case total
              </p>
              <p className="mt-2 text-2xl font-black text-brand-text dark:text-slate-100">
                {formatNumber(latestSourceTotal)}
              </p>
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
              <p className="text-[11px] font-black uppercase tracking-[0.15em] text-brand-muted dark:text-slate-500">
                Periods checked
              </p>
              <p className="mt-2 text-2xl font-black text-brand-text dark:text-slate-100">
                {formatNumber(computedPeriods.length)}
              </p>
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
              <p className="text-[11px] font-black uppercase tracking-[0.15em] text-brand-muted dark:text-slate-500">
                Forecast adjustment
              </p>
              <p className="mt-2 text-2xl font-black text-brand-text dark:text-slate-100">
                {formatDecimal(selectedMode.multiplier, 2)}x
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-[26px] border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50/50 px-4 py-4 text-sm leading-6 text-brand-text shadow-inner dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-blue-950/20 dark:text-slate-300">
            <span className="font-black text-brand-text dark:text-slate-100">
              How the forecast was prepared:
            </span>{' '}
            {usingBackendForecast
              ? 'The latest forecast, recent case changes, weather, population, crowding level, and selected forecast setting are used to show priority recommendations.'
              : 'Recent case averages, case changes, rainfall, temperature, humidity, population, crowding level, and barangay map details are used to estimate risk and rank barangays by priority.'}
          </div>

          <div className="mt-5 overflow-hidden rounded-[30px] border border-slate-200 bg-white p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_18px_40px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-muted dark:text-slate-500">
                  Expected weekly case values
                </p>
                <p className="mt-1 text-sm text-brand-muted dark:text-slate-400">
                  Expected case pattern for the selected setting.
                </p>
              </div>

              <div className="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black text-brand-muted dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                {computedPeriods.length} periods checked
              </div>
            </div>

            <div className="h-[300px] sm:h-[340px]">
              {projectedWeeklyValues.length > 0 ? (
                <SparkChart values={projectedWeeklyValues} />
              ) : (
                <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 text-center text-sm leading-6 text-brand-muted dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  No chart available until dengue records are uploaded.
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-stretch">
  <div className="grid gap-3 sm:grid-cols-2">
    <div className="rounded-[22px] border border-blue-100 bg-blue-50/80 px-4 py-3 dark:border-blue-500/20 dark:bg-blue-500/10">
      <p className="text-sm font-black text-brand-blue dark:text-blue-300">
        Forecast setting
      </p>

      <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
        {selectedMode.label} uses a {selectedMode.multiplier}x adjustment on the case estimate.
      </p>
    </div>

    <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
      <p className="text-sm font-black text-brand-text dark:text-slate-100">
        How barangays are ranked
      </p>

      <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
        Barangays are ranked by overall risk first, then by priority level and expected cases.
      </p>
    </div>
  </div>

  <button
    type="button"
    onClick={handleRunForecast}
    className="group relative flex min-h-[96px] w-full overflow-hidden rounded-[24px] border border-blue-400/30 bg-gradient-to-br from-brand-blue via-blue-600 to-sky-500 px-5 py-4 text-left text-white shadow-[0_18px_38px_rgba(37,95,143,0.30)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_46px_rgba(37,95,143,0.38)]"
  >
    <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-white/20 blur-2xl transition group-hover:bg-white/30" />
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/30" />

    <div className="relative flex w-full items-center gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 shadow-inner ring-1 ring-white/30">
        <BarChart3 className="h-5 w-5" />
      </div>

      <div className="min-w-0">
        <p className="text-sm font-black leading-5">
          Save forecast result
        </p>

        <p className="mt-1 text-xs leading-5 text-white/80">
          Add this forecast result to the activity log.
        </p>
      </div>
    </div>
  </button>
</div>
        </PremiumPanel>

        <PremiumPanel id="risk-summary" className="p-5 sm:p-6">
          <SectionBadge icon={ShieldAlert} tone="rose">
            Risk overview
          </SectionBadge>

          <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
            Risk summary
          </h2>

          <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
            Barangays grouped by their estimated risk level.
          </p>

          <div className="mt-5 space-y-4">
            {riskDistribution.map((item) => {
              const Icon = item.icon

              return (
                <div
                  key={item.label}
                  className="rounded-[26px] border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:from-slate-950 dark:to-slate-900"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-11 w-11 items-center justify-center rounded-[18px] ${item.badge}`}>
                        <Icon className="h-5 w-5" />
                      </div>

                      <div>
                        <p className="font-black text-brand-text dark:text-slate-100">
                          {item.label}
                        </p>

                        <p className="text-sm text-brand-muted dark:text-slate-400">
                          {item.count} barangay{item.count === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>

                    <span className={`rounded-full px-3 py-1 text-xs font-black ${item.badge}`}>
                      {item.width}
                    </span>
                  </div>

                  <div className="mt-4 h-3.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-3.5 rounded-full shadow-sm ${item.bar}`}
                      style={{ width: item.width }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-5 rounded-[26px] border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70">
            <p className="text-sm font-black text-brand-text dark:text-slate-100">
              Priority overview
            </p>

            <div className="mt-3 space-y-2">
              {priorityDistribution.length > 0 ? (
                priorityDistribution.map((item) => (
                  <div
                    key={item.priority}
                    className="flex items-center justify-between gap-3 rounded-[20px] border border-slate-200 bg-white px-3 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950"
                  >
                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] font-black ${getPriorityBadgeStyle(item.priority)}`}
                    >
                      {item.priority}
                    </span>

                    <span className="text-sm font-black text-brand-text dark:text-slate-100">
                      {formatNumber(item.count)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="rounded-[18px] border border-dashed border-slate-200 bg-white px-4 py-4 text-sm leading-6 text-brand-muted dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                  Priority levels will appear after dengue records are uploaded.
                </p>
              )}
            </div>
          </div>
        </PremiumPanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.94fr)_minmax(380px,1.06fr)]">
        <PremiumPanel id="top-barangays" className="p-5 sm:p-6">
          <SectionBadge icon={MapPin} tone="slate">
            Priority barangay list
          </SectionBadge>

          <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
            Top barangays
          </h2>

          <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
            Showing the barangays that need attention first. Open details only when needed.
          </p>

          <div className="mt-5 space-y-3">
            {visibleTopBarangays.length > 0 ? (
              <>
                {visibleTopBarangays.map((row, index) => {
                  const TrendIcon = getTrendIcon(row.trendLabel)
                  const isExpanded = expandedBarangay === row.barangay

                  return (
                    <div
                      key={row.barangay}
                      className="group rounded-[26px] border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-blue/20 hover:shadow-md dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] bg-slate-950 text-sm font-black text-white shadow-sm ring-1 ring-slate-900/5 dark:bg-white dark:text-slate-950">
                            #{index + 1}
                          </div>

                          <div className="min-w-0">
                            <span className="break-words text-base font-black text-brand-text dark:text-slate-100">
                              {row.barangay}
                            </span>

                            <p className="text-xs font-semibold text-brand-muted dark:text-slate-400">
                              Forecast: {formatNumber(row.forecast)} cases • Risk: {formatNumber(row.riskScore || row.multiSourceRiskScore || 0)}/100
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`w-fit rounded-full border px-3 py-1 text-xs font-black ${getRiskBadgeStyle(row.risk)}`}>
                            {row.risk}
                          </span>

                          <span className={`w-fit rounded-full border px-3 py-1 text-xs font-black ${getPriorityBadgeStyle(row.responsePriority)}`}>
                            {row.responsePriority}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                            Priority points
                          </p>
                          <p className="mt-1 text-sm font-black text-brand-text dark:text-slate-100">
                            {formatNumber(row.decisionScore)} points
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                            Trend
                          </p>
                          <p className="mt-1 text-sm font-black text-brand-text dark:text-slate-100">
                            {row.trendLabel}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                            Total
                          </p>
                          <p className="mt-1 text-sm font-black text-brand-text dark:text-slate-100">
                            {formatNumber(row.totalCases)} cases
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                            Weather status
                          </p>
                          <p className="mt-1 text-sm font-black text-brand-text dark:text-slate-100">
                            {row.environmentalSuitability || 'Unavailable'}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedBarangay(isExpanded ? null : row.barangay)
                          }}
                          className="inline-flex w-fit items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-brand-text shadow-sm transition hover:border-brand-blue/30 hover:text-brand-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-blue-300"
                        >
                          {isExpanded ? 'Hide details' : 'View details'}
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 rounded-[22px] border border-slate-200 bg-white/90 p-4 shadow-inner dark:border-slate-800 dark:bg-slate-950/80">
                          <div className="grid gap-2 sm:grid-cols-3">
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-black ${getTrendStyle(row.trendLabel)}`}>
                              <TrendIcon className="h-3.5 w-3.5" />
                              {row.trendLabel}
                            </span>

                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-brand-muted dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                              Crowding: {formatOptionalNumber(row.density, ' people/sq km')}
                            </span>

                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-brand-muted dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                              Recent average: {formatDecimal(row.recentAverage)}
                            </span>
                          </div>

                          <div className="mt-4 grid gap-2 sm:grid-cols-3">
                            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-brand-muted dark:text-slate-500">
                                Rainfall
                              </p>
                              <p className="mt-1 text-xs font-bold text-brand-text dark:text-slate-300">
                                {formatOptionalNumber(row.averageRainfall || row.avgRainfall, ' mm average')}
                              </p>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-brand-muted dark:text-slate-500">
                                Temperature
                              </p>
                              <p className="mt-1 text-xs font-bold text-brand-text dark:text-slate-300">
                                {formatOptionalNumber(row.averageTemperature || row.avgTemperature, ' °C')}
                              </p>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-brand-muted dark:text-slate-500">
                                Humidity
                              </p>
                              <p className="mt-1 text-xs font-bold text-brand-text dark:text-slate-300">
                                {formatOptionalNumber(row.averageHumidity || row.avgHumidity, '%')}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 rounded-[20px] border border-blue-100 bg-blue-50/90 px-4 py-3 dark:border-blue-500/20 dark:bg-blue-500/10">
                            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-blue dark:text-blue-300">
                              Recommended action
                            </p>

                            <p className="mt-1 text-sm leading-6 text-brand-text dark:text-slate-300">
                              {row.recommendedAction}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

                {topBarangays.length > 3 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAllTopBarangays((current) => !current)
                      setExpandedBarangay(null)
                    }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-black text-brand-text shadow-sm transition hover:border-brand-blue/30 hover:text-brand-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-blue-300"
                  >
                    {showAllTopBarangays ? 'Show less barangays' : `Show all ${topBarangays.length} barangays`}
                    {showAllTopBarangays ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                )}
              </>
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm leading-6 text-brand-muted dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                No forecast ranking available yet. Upload historical dengue records first.
              </div>
            )}
          </div>
        </PremiumPanel>

        <PremiumPanel className="p-5 sm:p-6 xl:sticky xl:top-24 xl:self-start">
          <SectionBadge icon={Target} tone="emerald">
            Recommended actions
          </SectionBadge>

          <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
            Recommended response
          </h2>

          <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
            The system checks the forecast, recent case changes, risk level, weather, population, crowding level, and barangay map details before suggesting an action.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-1">
            {decisionHighlights.map((item) => {
              const Icon = item.icon

              return (
                <div
                  key={item.title}
                  className={`flex items-start gap-3 rounded-[24px] border px-4 py-3.5 shadow-sm ${item.style}`}
                >
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/75 shadow-sm ring-1 ring-white/60 dark:bg-white/10 dark:ring-white/10">
                    <Icon className="h-4 w-4" />
                  </div>

                  <div>
                    <p className="text-sm font-black">
                      {item.title}
                    </p>

                    <p className="mt-1 text-sm leading-6 opacity-85">
                      {item.body}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-5 overflow-hidden rounded-[28px] border border-amber-100 bg-gradient-to-br from-amber-50 via-orange-50 to-white p-4 shadow-sm dark:border-amber-500/20 dark:from-amber-500/10 dark:via-slate-900 dark:to-slate-950">
            <p className="flex items-center gap-2 text-sm font-black text-brand-orange dark:text-amber-300">
              <ArrowUpRight className="h-4 w-4" />
              Main response plan
            </p>

            {topDecisionSupport ? (
              <div className="mt-3 space-y-3">
                <div>
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black ${getPriorityBadgeStyle(topDecisionSupport.priority)}`}
                  >
                    {topDecisionSupport.priority}
                  </span>

                  <p className="mt-3 text-sm font-semibold leading-6 text-brand-text dark:text-slate-200">
                    {topDecisionSupport.summary}
                  </p>
                </div>

                {Array.isArray(topDecisionSupport.actions) && topDecisionSupport.actions.length > 0 && (
                  <div className="rounded-[20px] border border-white/80 bg-white/75 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400">
                      Action plan
                    </p>

                    <div className="mt-3 space-y-2">
                      {topDecisionSupport.actions.slice(0, 5).map((action, index) => (
                        <div
                          key={`${action}-${index}`}
                          className="flex gap-2 text-sm leading-6 text-brand-text dark:text-slate-300"
                        >
                          <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-black text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                            {index + 1}
                          </span>

                          <span>{action}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(topDecisionSupport.rationale) && topDecisionSupport.rationale.length > 0 && (
                  <div className="rounded-[20px] border border-white/80 bg-white/75 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400">
                      Why this is recommended
                    </p>

                    <div className="mt-3 space-y-2">
                      {topDecisionSupport.rationale.slice(0, 4).map((reason, index) => (
                        <div
                          key={`${reason}-${index}`}
                          className="flex gap-2 text-xs leading-5 text-brand-muted dark:text-slate-400"
                        >
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green dark:text-emerald-300" />
                          <span>{reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm leading-6 text-brand-muted dark:text-slate-400">
                The priority list updates automatically when new valid dengue records are uploaded.
              </p>
            )}
          </div>
        </PremiumPanel>
      </div>

      <DecisionActionTracker priorityRows={topBarangays} />

    </div>
  )
}
