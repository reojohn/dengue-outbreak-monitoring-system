import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CloudRain,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Droplets,
  Gauge,
  Layers3,
  Map as MapIcon,
  MapPinned,
  ArrowUpRight,
  Maximize2,
  Minimize2,
  Moon,
  Navigation,
  Radar,
  Satellite,
  ShieldAlert,
  Sun,
  Thermometer,
  TrendingUp,
  Users,
} from 'lucide-react'
import LeafletRiskMap from '../components/LeafletRiskMap'
import { useData } from '../context/DataContext'
import { getGeospatialHotspots } from '../services/api'
import { compareCanonicalBarangayPriority, computeDecisionSupport, computeMultiSourceRisk, getCanonicalCombinedRiskScore, riskStyles } from '../utils/analytics'
import gisGlobalNetworkGif from '../assets/gis-global-network.gif'
import mapHeroBackground from '../assets/map.png'

const mapStyleOptions = [
  {
    value: 'dark',
    label: 'Dark',
    icon: Moon,
    description: 'Dark map for dashboard viewing',
  },
  {
    value: 'light',
    label: 'Light',
    icon: Sun,
    description: 'Soft light map view',
  },
  {
    value: 'street',
    label: 'Street',
    icon: MapIcon,
    description: 'Street map with road and place labels',
  },
  {
    value: 'satellite',
    label: 'Satellite',
    icon: Satellite,
    description: 'Satellite imagery layer',
  },

]

const mapLayerOptions = [
  {
    value: 'forecast',
    label: 'Forecast risk',
    shortLabel: 'Forecast',
    icon: ShieldAlert,
    description: 'Color barangays using Low, Moderate, and High forecast risk.',
  },
  {
    value: 'hotspot',
    label: 'GIS hotspot',
    shortLabel: 'Hotspot',
    icon: Radar,
    description: 'Color barangays using the completed GIS hotspot classification.',
  },
]

const BARANGAY_NAME_ALIASES = {
  'agusan pequenio': 'agusan pequeno',
  'agusan pequino': 'agusan pequeno',
  'baan km3': 'baan km 3',
  'baan kilometer 3': 'baan km 3',
  'brgy baan km 3': 'baan km 3',
  'datu silongan': 'silongan',
  'fort poyohon new asia': 'port poyohon',
  'fort poyohon': 'port poyohon',
  'new society village poblacion': 'new society village',
  nsv: 'new society village',
  'sto nino': 'santo nino',
  'st nino': 'santo nino',
}

function getGenericRecommendedAction(risk) {
  if (risk === 'High') {
    return 'Conduct source reduction, coordinate immediate cleanup, and issue a barangay-level dengue alert within 48 hours.'
  }

  if (risk === 'Moderate') {
    return 'Continue close weekly monitoring, strengthen preventive messaging, and inspect common mosquito breeding areas.'
  }

  if (risk === 'Low') {
    return 'Maintain routine monitoring, public advisories, and regular environmental sanitation activities.'
  }

  return 'Upload and validate dengue records first before generating a recommended barangay response.'
}

function getRiskLabel(risk) {
  if (!risk) return 'Pending risk data'
  return `${risk} risk`
}

function getLegendDescription(risk) {
  if (risk === 'High') return 'Immediate response'
  if (risk === 'Moderate') return 'Close monitoring'
  return 'Routine watch'
}

function getHotspotLegendDescription(level) {
  if (level === 'Confirmed Hotspot') return 'Highest spatial priority'
  if (level === 'Emerging Hotspot') return 'Escalating spatial concern'
  if (level === 'Watch Area') return 'Monitor nearby influence'
  if (level === 'Needs Map Review') return 'Boundary match required'
  return 'Low spatial concern'
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

function formatRiskScore(value) {
  const number = Number(value)

  if (!Number.isFinite(number) || number <= 0) {
    return 'Not available'
  }

  return `${Math.round(number)}/100`
}

function getLabelValue(value, fallback = 'Not available') {
  const text = String(value || '').trim()

  return text || fallback
}

function normalizeBarangayName(value = '') {
  const normalized = String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/g, 'n')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\bpob\.?\b/gi, ' ')
    .replace(/\bbgy\.?\b/gi, ' ')
    .replace(/\bbrgy\.?\b/gi, ' ')
    .replace(/\bbarangay\b/gi, ' ')
    .replace(/\bsto\.?\b/gi, 'santo')
    .replace(/\bst\.?\b/gi, 'santo')
    .replace(/\bkilometer\b/gi, 'km')
    .replace(/\bkm\.?(\d+)\b/gi, 'km $1')
    .replace(/\./g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

  return BARANGAY_NAME_ALIASES[normalized] || normalized
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

function getFeatureName(feature) {
  const props = feature?.properties || {}

  return (
    props.adm4_name ||
    props.adm4_ref_name ||
    props.name ||
    props.Name ||
    props.NAME ||
    props.barangay ||
    props.barangayName ||
    props.barangay_name ||
    props.brgy ||
    props.brgy_name ||
    props.BARANGAY ||
    props.BRGY ||
    props.BRGY_NAME ||
    props.BGY_NAME ||
    props.BgyName ||
    props.ADM4_EN ||
    props.NAME_3 ||
    props.NAME_4 ||
    props.LOC_NAME ||
    props.LOCALITY ||
    props.MUNICIPALITY ||
    props.detected_barangay_name ||
    props.standardized_barangay ||
    'Unnamed barangay'
  )
}

function getFeatureReferenceName(feature) {
  const props = feature?.properties || {}

  return (
    props.adm4_ref_name ||
    props.adm4_name ||
    props.name ||
    props.Name ||
    props.NAME ||
    props.barangay ||
    props.barangayName ||
    props.barangay_name ||
    props.brgy ||
    props.brgy_name ||
    props.BARANGAY ||
    props.BRGY_NAME ||
    props.BgyName ||
    props.ADM4_EN ||
    props.NAME_3 ||
    props.NAME_4 ||
    props.detected_barangay_name ||
    props.standardized_barangay ||
    ''
  )
}


function getSelectedBarangayName(value) {
  if (!value) return ''

  if (typeof value === 'string') {
    return value
  }

  if (value?.type === 'Feature') {
    return getFeatureName(value)
  }

  if (value?.feature) {
    return getSelectedBarangayName(value.feature)
  }

  if (value?.target?.feature) {
    return getSelectedBarangayName(value.target.feature)
  }

  if (value?.layer?.feature) {
    return getSelectedBarangayName(value.layer.feature)
  }

  if (value?.properties) {
    return getFeatureName(value)
  }

  return (
    value.barangay ||
    value.name ||
    value.adm4_name ||
    value.adm4_ref_name ||
    value.barangay_name ||
    value.BARANGAY ||
    value.ADM4_EN ||
    value.label ||
    value.value ||
    ''
  )
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

function countBoundaryFeatures(boundaryRecords) {
  const geoJson = getBoundaryGeoJson(boundaryRecords)

  return geoJson?.features?.length || 0
}

function normalizeDataKey(key = '') {
  return String(key)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function readValue(source, keys = [], fallback = undefined) {
  if (!source) return fallback

  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      return source[key]
    }
  }

  const normalizedLookup = Object.keys(source).reduce((acc, key) => {
    acc[normalizeDataKey(key)] = source[key]
    return acc
  }, {})

  for (const key of keys) {
    const normalizedKey = normalizeDataKey(key)

    if (
      normalizedLookup[normalizedKey] !== undefined &&
      normalizedLookup[normalizedKey] !== null &&
      normalizedLookup[normalizedKey] !== ''
    ) {
      return normalizedLookup[normalizedKey]
    }
  }

  return fallback
}

function toFiniteNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback

  const cleaned = typeof value === 'string'
    ? value.replace(/,/g, '').replace(/%/g, '').trim()
    : value

  const number = Number(cleaned)

  return Number.isFinite(number) ? number : fallback
}

function readNumber(source, keys = [], fallback = 0) {
  return toFiniteNumber(readValue(source, keys), fallback)
}

function readPositiveNumber(source, keys = []) {
  const number = readNumber(source, keys, 0)

  return number > 0 ? number : 0
}

function readText(source, keys = [], fallback = '') {
  const value = readValue(source, keys)
  const text = String(value ?? '').trim()

  return text || fallback
}

function getOverallRiskScore(row) {
  return getCanonicalCombinedRiskScore(row)
}

function getEnvironmentalSuitabilityValue(row) {
  return readText(row, [
    'environmentalSuitability',
    'environmental_suitability',
    'weatherCondition',
    'weather_condition',
    'environmentalLabel',
    'environmental_label',
  ])
}

function getRainfallPressureValue(row) {
  return readText(row, [
    'rainfallPressure',
    'rainfall_pressure',
    'rainfallRisk',
    'rainfall_risk',
  ])
}

function getTemperatureSuitabilityValue(row) {
  return readText(row, [
    'temperatureSuitability',
    'temperature_suitability',
    'temperatureCondition',
    'temperature_condition',
  ])
}

function getHumiditySuitabilityValue(row) {
  return readText(row, [
    'humiditySuitability',
    'humidity_suitability',
    'humidityCondition',
    'humidity_condition',
  ])
}

function getRecordName(record) {
  if (!record) return ''

  return readText(record, [
    'barangay',
    'barangayName',
    'barangay_name',
    'barangay_raw',
    'barangayRaw',
    'brgy',
    'brgy_name',
    'name',
    'adm4_name',
    'adm4_ref_name',
    'location',
    'area',
    'BgyName',
    'BRGY_NAME',
    'BARANGAY',
  ])
}

function getPopulationRowForSelection(selected, feature, populationRecords = []) {
  const featureName = getFeatureName(feature)
  const referenceName = getFeatureReferenceName(feature)

  return (
    populationRecords.find((record) => {
      const recordName = getRecordName(record)

      return (
        namesMatch(recordName, selected) ||
        namesMatch(recordName, featureName) ||
        namesMatch(recordName, referenceName)
      )
    }) || null
  )
}

function getPopulationValue({ row, feature, populationRow }) {
  const props = feature?.properties || {}

  return (
    readPositiveNumber(row, [
      'population',
      'totalPopulation',
      'populationCount',
      'pop',
      'total_pop',
      'totalPop',
    ]) ||
    readPositiveNumber(populationRow, [
      'population',
      'totalPopulation',
      'populationCount',
      'pop',
      'total_pop',
      'totalPop',
    ]) ||
    readPositiveNumber(props, [
      'population',
      'totalPopulation',
      'populationCount',
      'pop',
      'total_pop',
      'totalPop',
      'POPULATION',
    ])
  )
}

function getAreaValue({ row, feature }) {
  const props = feature?.properties || {}

  return (
    readPositiveNumber(row, ['area_sqkm', 'areaSqKm', 'area_sq_km', 'area', 'areaKm2', 'boundary_area_sqkm', 'boundaryAreaSqKm']) ||
    readPositiveNumber(props, ['area_sqkm', 'areaSqKm', 'area_sq_km', 'area', 'areaKm2', 'boundary_area_sqkm', 'boundaryAreaSqKm'])
  )
}


function getBoundaryFeatureForBarangay(barangay, boundaryFeatures = []) {
  if (!barangay || !Array.isArray(boundaryFeatures) || !boundaryFeatures.length) {
    return null
  }

  return (
    boundaryFeatures.find((feature) => {
      return (
        namesMatch(barangay, getFeatureName(feature)) ||
        namesMatch(barangay, getFeatureReferenceName(feature))
      )
    }) || null
  )
}

function average(values = []) {
  const validValues = values
    .map((value) => Number(value || 0))
    .filter((value) => Number.isFinite(value))

  if (!validValues.length) return 0

  return validValues.reduce((total, value) => total + value, 0) / validValues.length
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
  const directDate = readValue(record, [
    'date',
    'reportingDate',
    'reporting_date',
    'weatherDate',
    'weather_date',
    'observationDate',
    'observation_date',
    'recordDate',
    'record_date',
    'period',
  ])

  const parsedDirectDate = parseCoverageDate(directDate)

  if (parsedDirectDate) return parsedDirectDate

  const year = readNumber(record, ['year', 'weatherYear', 'weather_year'], 0)
  const month = readNumber(record, ['month', 'weatherMonth', 'weather_month'], 0)
  const day = readNumber(record, ['day', 'dateDay', 'weatherDay', 'weather_day'], 1)
  const dayOfYear = readNumber(record, ['dayOfYear', 'day_of_year', 'doy', 'julianDay', 'julian_day'], 0)

  if (year > 0 && dayOfYear > 0) {
    const date = new Date(Date.UTC(year, 0, dayOfYear))
    return Number.isNaN(date.getTime()) ? null : date
  }

  if (year > 0 && month > 0) {
    const date = new Date(Date.UTC(year, month - 1, day > 0 ? day : 1))
    return Number.isNaN(date.getTime()) ? null : date
  }

  return null
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
        'precipAmount',
        'precip_amount',
      ]),
      temperature: getWeatherNumber(record, [
        'temperature',
        'temperature_c',
        'temperatureC',
        'temp',
        'temp_c',
        'air_temperature',
        'airTemperature',
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
    .map((period) => parseCoverageDate(period.period || period))
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

function getTrendValues(row) {
  const candidates = [
    row?.history,
    row?.historicalTrend,
    row?.weeklyCases,
    row?.caseHistory,
    row?.casesByWeek,
    row?.series,
    row?.values,
  ]

  const array = candidates.find((item) => Array.isArray(item))

  if (!array) return []

  return array
    .map((item) => {
      if (typeof item === 'number') return item

      return Number(
        item?.cases ||
          item?.caseCount ||
          item?.value ||
          item?.total ||
          item?.count ||
          item?.dengueCases
      )
    })
    .filter((value) => Number.isFinite(value))
}

function getHistoricalTrend(row) {
  if (!row) return 'Pending dengue records'

  const directTrend =
    row.trend ||
    row.trendLabel ||
    row.trendStatus ||
    row.historicalTrendLabel

  if (directTrend && typeof directTrend === 'string') {
    return directTrend
  }

  const values = getTrendValues(row)

  if (values.length >= 2) {
    const first = values[0]
    const last = values[values.length - 1]
    const difference = last - first

    if (difference > 0) {
      return `Increasing (${formatNumber(first)} to ${formatNumber(last)})`
    }

    if (difference < 0) {
      return `Decreasing (${formatNumber(first)} to ${formatNumber(last)})`
    }

    return `Stable (${formatNumber(last)} cases)`
  }

  const previous = Number(row.previousCases || row.lastPeriodCases || row.previousTotal)
  const current = Number(row.totalCases || row.cases || row.currentCases)

  if (Number.isFinite(previous) && Number.isFinite(current) && previous > 0) {
    if (current > previous) return `Increasing (${formatNumber(previous)} to ${formatNumber(current)})`
    if (current < previous) return `Decreasing (${formatNumber(previous)} to ${formatNumber(current)})`
    return `Stable (${formatNumber(current)} cases)`
  }

  return 'Not available'
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

function getHotspotBadgeStyle(level) {
  const value = String(level || '').toLowerCase()

  if (value.includes('confirmed')) {
    return 'border-rose-100 bg-rose-50 text-rose-600 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300'
  }

  if (value.includes('emerging')) {
    return 'border-orange-100 bg-orange-50 text-orange-600 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300'
  }

  if (value.includes('watch')) {
    return 'border-amber-100 bg-amber-50 text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
  }

  if (value.includes('review')) {
    return 'border-blue-100 bg-blue-50 text-blue-600 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300'
  }

  if (value.includes('low')) {
    return 'border-emerald-100 bg-emerald-50 text-emerald-600 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
  }

  return 'border-slate-200 bg-slate-50 text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

function getHotspotLevelLabel(level) {
  const value = String(level || '').trim()

  if (!value) return 'Hotspot not checked'

  if (value === 'Confirmed Hotspot') return 'Confirmed hotspot'
  if (value === 'Emerging Hotspot') return 'Emerging hotspot'
  if (value === 'Watch Area') return 'Watch area'
  if (value === 'Low Spatial Concern') return 'Low map concern'
  if (value === 'Needs Map Review') return 'Needs map review'
  if (value === 'Not checked') return 'Not checked'

  return value
}

function isMapReviewHotspot(row = null) {
  if (!row) return false

  return (
    row.hotspot_level === 'Needs Map Review' ||
    row.has_map_boundary === false ||
    row.spatial_influence_source === 'no_map_boundary'
  )
}

function strictBarangayNamesMatch(first, second) {
  const a = normalizeBarangayName(first)
  const b = normalizeBarangayName(second)

  if (!a || !b) return false

  return a === b || a.replace(/\s+/g, '') === b.replace(/\s+/g, '')
}

function hotspotMatchesRiskRow(hotspot = null, riskRow = null, strict = false) {
  if (!hotspot || !riskRow) return false

  const hotspotNames = [
    hotspot.barangay,
    hotspot.barangay_key,
    hotspot.barangayKey,
  ].filter(Boolean)

  const riskNames = [
    riskRow.barangay,
    riskRow.barangay_key,
    riskRow.barangayKey,
  ].filter(Boolean)

  const matcher = strict ? strictBarangayNamesMatch : namesMatch

  return hotspotNames.some((hotspotName) => {
    return riskNames.some((riskName) => matcher(hotspotName, riskName))
  })
}

function chooseBestHotspotCandidate(candidates = [], riskRow = null) {
  if (!candidates.length) return null

  return [...candidates].sort((a, b) => {
    const boundaryDifference =
      Number(!isMapReviewHotspot(b.row)) - Number(!isMapReviewHotspot(a.row))

    if (boundaryDifference !== 0) return boundaryDifference

    const exactDifference = Number(b.strict) - Number(a.strict)

    if (exactDifference !== 0) return exactDifference

    const scoreDifference =
      Number(b.row?.hotspot_score || b.row?.base_risk_score || 0) -
      Number(a.row?.hotspot_score || a.row?.base_risk_score || 0)

    if (scoreDifference !== 0) return scoreDifference

    const aExactName = strictBarangayNamesMatch(
      a.row?.barangay,
      riskRow?.barangay
    )
    const bExactName = strictBarangayNamesMatch(
      b.row?.barangay,
      riskRow?.barangay
    )

    return Number(bExactName) - Number(aExactName)
  })[0]
}

function reconcileHotspotRows(hotspotRows = [], riskRows = []) {
  if (!Array.isArray(hotspotRows) || hotspotRows.length === 0) return []

  if (!Array.isArray(riskRows) || riskRows.length === 0) {
    const byName = new Map()

    hotspotRows.forEach((row) => {
      const key = normalizeBarangayName(
        row?.barangay || row?.barangay_key || row?.barangayKey
      )

      if (!key) return

      const existing = byName.get(key)

      if (!existing) {
        byName.set(key, row)
        return
      }

      const existingReview = isMapReviewHotspot(existing)
      const currentReview = isMapReviewHotspot(row)

      if (
        (existingReview && !currentReview) ||
        Number(row?.hotspot_score || 0) >
          Number(existing?.hotspot_score || 0)
      ) {
        byName.set(key, row)
      }
    })

    return Array.from(byName.values())
  }

  const usedIndexes = new Set()

  return riskRows.map((riskRow) => {
    const strictCandidates = hotspotRows
      .map((row, index) => ({ row, index, strict: true }))
      .filter((candidate) => {
        return (
          !usedIndexes.has(candidate.index) &&
          hotspotMatchesRiskRow(candidate.row, riskRow, true)
        )
      })

    const looseCandidates = strictCandidates.length
      ? []
      : hotspotRows
          .map((row, index) => ({ row, index, strict: false }))
          .filter((candidate) => {
            return (
              !usedIndexes.has(candidate.index) &&
              hotspotMatchesRiskRow(candidate.row, riskRow, false)
            )
          })

    const selected = chooseBestHotspotCandidate(
      strictCandidates.length ? strictCandidates : looseCandidates,
      riskRow
    )

    if (!selected) {
      return {
        barangay: riskRow.barangay || 'Unknown barangay',
        barangay_key:
          riskRow.barangayKey || riskRow.barangay_key || '',
        hotspot_level: 'Not checked',
        hotspot_score: 0,
        neighbor_influence_score: 0,
        has_map_boundary: null,
        spatial_influence_source: 'not_returned',
        recommended_map_action:
          'Hotspot result was not returned for this official barangay.',
        forecast_risk: riskRow.risk || '',
        forecast_cases: Number(riskRow.forecast || 0),
      }
    }

    usedIndexes.add(selected.index)

    return {
      ...selected.row,
      barangay:
        riskRow.barangay ||
        selected.row?.barangay ||
        'Unknown barangay',
      barangay_key:
        riskRow.barangayKey ||
        riskRow.barangay_key ||
        selected.row?.barangay_key ||
        '',
      forecast_risk:
        riskRow.risk || selected.row?.forecast_risk || '',
      forecast_cases: Number(
        riskRow.forecast || selected.row?.forecast_cases || 0
      ),
    }
  })
}

function getHotspotCounts(hotspotRows = []) {
  return hotspotRows.reduce(
    (acc, row) => {
      const level = row.hotspot_level || 'Not checked'

      if (level === 'Confirmed Hotspot') acc.confirmed += 1
      else if (level === 'Emerging Hotspot') acc.emerging += 1
      else if (level === 'Watch Area') acc.watch += 1
      else if (level === 'Needs Map Review') acc.needsReview += 1
      else if (level === 'Low Spatial Concern') acc.low += 1
      else acc.notChecked += 1

      return acc
    },
    {
      confirmed: 0,
      emerging: 0,
      watch: 0,
      low: 0,
      needsReview: 0,
      notChecked: 0,
    }
  )
}

function getHotspotCountTotal(counts = {}) {
  return (
    Number(counts.confirmed || 0) +
    Number(counts.emerging || 0) +
    Number(counts.watch || 0) +
    Number(counts.low || 0) +
    Number(counts.needsReview || 0) +
    Number(counts.notChecked || 0)
  )
}

function buildReconciledHotspotSummary(
  summary = null,
  counts = {},
  officialBarangayCount = 0
) {
  return {
    ...(summary || {}),
    official_barangay_count: Number(officialBarangayCount || 0),
    reconciled_total: getHotspotCountTotal(counts),
    level_counts: {
      'Confirmed Hotspot': Number(counts.confirmed || 0),
      'Emerging Hotspot': Number(counts.emerging || 0),
      'Watch Area': Number(counts.watch || 0),
      'Low Spatial Concern': Number(counts.low || 0),
      'Needs Map Review': Number(counts.needsReview || 0),
      'Not checked': Number(counts.notChecked || 0),
    },
    barangays_needing_map_review: Number(counts.needsReview || 0),
  }
}

function getMapReviewPriorityText(row = null) {
  const cases = Number(row?.total_cases || row?.cases || row?.totalCases || 0)
  const baseRisk = Number(row?.base_risk_score || 0)

  if (cases >= 25 || baseRisk >= 70) {
    return 'High dengue concern'
  }

  if (cases > 0 || baseRisk >= 45) {
    return 'Needs data review'
  }

  return 'Map review needed'
}

function getMapReviewMessage(row = null) {
  const cases = Number(row?.total_cases || row?.cases || row?.totalCases || 0)
  const baseRisk = Number(row?.base_risk_score || 0)

  if (cases > 0 || baseRisk > 0) {
    return (
      'This barangay has dengue records, but it is not ranked as a normal spatial hotspot because the map boundary is not matched yet.'
    )
  }

  return (
    'This barangay needs a map name match before the system can check nearby barangay effect.'
  )
}

function formatHotspotScore(value) {
  const number = Number(value)

  if (!Number.isFinite(number) || number <= 0) {
    return 'Not checked'
  }

  return `${Math.round(number)}/100`
}

function formatHotspotDistance(value) {
  const number = Number(value)

  if (!Number.isFinite(number) || number <= 0) {
    return 'Distance not available'
  }

  return `${formatDecimal(number, 2)} km away`
}

function getHotspotInfluenceRows(hotspot = null) {
  const withinRadius = Array.isArray(hotspot?.within_radius_barangays)
    ? hotspot.within_radius_barangays
    : []

  const nearestFallback = Array.isArray(hotspot?.nearest_barangays_used)
    ? hotspot.nearest_barangays_used
    : []

  const spatialInfluence = Array.isArray(hotspot?.spatial_influence_barangays)
    ? hotspot.spatial_influence_barangays
    : []

  if (withinRadius.length > 0) {
    return {
      rows: withinRadius,
      source: 'within_radius',
      label: 'Nearby barangays inside selected distance',
    }
  }

  if (nearestFallback.length > 0) {
    return {
      rows: nearestFallback,
      source: 'nearest_fallback',
      label: 'Nearest nearby barangay used',
    }
  }

  if (spatialInfluence.length > 0) {
    return {
      rows: spatialInfluence,
      source: hotspot?.spatial_influence_source || 'spatial_context',
      label: 'Nearby barangay used',
    }
  }

  return {
    rows: [],
    source: hotspot?.spatial_influence_source || 'none',
    label: hotspot?.has_map_boundary === false ? 'Needs map review' : 'No nearby barangay effect found',
  }
}

function getHotspotInfluenceLabel(hotspot = null) {
  const influence = getHotspotInfluenceRows(hotspot)

  if (!influence.rows.length) {
    if (hotspot?.has_map_boundary === false) {
      return 'Map name not matched'
    }

    return 'No nearby barangay inside the selected distance'
  }

  const firstRow = influence.rows[0]
  const prefix = influence.source === 'nearest_fallback'
    ? 'Nearest nearby barangay'
    : influence.source === 'within_radius'
      ? 'Inside selected distance'
      : 'Nearby barangay used'

  return `${prefix}: ${firstRow.barangay} (${formatHotspotDistance(firstRow.distance_km)})`
}

function getHotspotInfluenceNote(hotspot = null) {
  return (
    hotspot?.spatial_influence_note ||
    'Run the hotspot check to check within-radius barangays and fallback spatial context.'
  )
}

function getHotspotReason(hotspot = null) {
  return (
    hotspot?.reason ||
    'Run the hotspot check to check if within-radius barangays are affecting this area.'
  )
}


function getMapStatusStyle(hasRiskData, hasBoundaryData) {
  if (hasRiskData) {
    return 'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
  }

  if (hasBoundaryData) {
    return 'border-blue-100 bg-blue-50 text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300'
  }

  return 'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
}

function getMapStatusLabel(hasRiskData, hasBoundaryData) {
  if (hasRiskData) return 'Risk colors ready'
  if (hasBoundaryData) return 'Barangay map ready'
  return 'Waiting for data'
}

function getDefaultPanelPosition() {
  if (typeof window === 'undefined') {
    return {
      x: 32,
      y: 120,
    }
  }

  return {
    x: Math.max(16, window.innerWidth - 590),
    y: 120,
  }
}

function clampPanelPosition(position) {
  if (typeof window === 'undefined') return position

  const panelWidth = Math.min(560, window.innerWidth - 24)
  const minX = 12
  const minY = 12
  const maxX = Math.max(minX, window.innerWidth - panelWidth - 12)
  const maxY = Math.max(minY, window.innerHeight - 96)

  return {
    x: Math.min(Math.max(position.x, minX), maxX),
    y: Math.min(Math.max(position.y, minY), maxY),
  }
}

function getClientPoint(event) {
  const touch = event.touches?.[0] || event.changedTouches?.[0]

  return {
    clientX: touch?.clientX ?? event.clientX,
    clientY: touch?.clientY ?? event.clientY,
  }
}

function hasBackendForecastData(backendForecastResult) {
  return (
    Array.isArray(backendForecastResult?.forecast_results) &&
    backendForecastResult.forecast_results.length > 0
  )
}

function getBackendResponsePriority(risk) {
  if (risk === 'High') return 'Immediate Response'
  if (risk === 'Moderate') return 'Preventive Monitoring'
  if (risk === 'Low') return 'Routine Monitoring'
  return 'Waiting for data'
}

function getBackendDecisionScore(row) {
  const risk = row.risk_level || 'Low'
  const riskScore = risk === 'High' ? 70 : risk === 'Moderate' ? 45 : 20
  const forecastScore = Math.min(Number(row.forecast_next_4_periods || 0), 100)
  const rankPenalty = Number(row.priority_rank || 0) > 0 ? Number(row.priority_rank || 0) : 0

  return Math.max(0, Math.round(riskScore + forecastScore - rankPenalty))
}

function buildBackendActionPlan({
  risk,
  forecast,
  forecastNextPeriod,
  recentAverage,
  previousAverage,
  trendLabel,
  recommendation,
}) {
  const actions = []
  const trendText = String(trendLabel || '').toLowerCase()
  const isIncreasing = trendText.includes('increasing')
  const isDecreasing = trendText.includes('decreasing')

  if (recommendation) {
    actions.push(recommendation)
  }

  if (risk === 'High') {
    actions.push(
      'Activate barangay-level dengue alert and coordinate response within 24 to 48 hours.',
      'Prioritize source reduction in households, drainage areas, water storage containers, and other mosquito breeding sites.',
      'Deploy BHWs for focused fever case checking, household advisories, and immediate reporting of new suspected dengue cases.',
      'Coordinate cleanup activities with barangay officials, sanitation personnel, and community volunteers.',
      'Review updated case reports after 7 days to determine if the response reduced case movement.'
    )
  } else if (risk === 'Moderate') {
    actions.push(
      'Place the barangay under intensified reporting-period monitoring to prevent escalation into high-risk status.',
      'Inspect common breeding areas such as stagnant water sites, canals, schools, and dense residential zones.',
      'Strengthen dengue prevention messaging through BHWs, purok leaders, barangay pages, and community announcements.',
      'Prepare targeted cleanup and IEC activities if the next reporting period continues to increase.',
      'Compare new dengue reports against the forecast output during the next reporting-period review.'
    )
  } else if (risk === 'Low') {
    actions.push(
      'Maintain routine dengue surveillance and regular environmental sanitation activities.',
      'Continue household reminders on removing stagnant water and seeking early consultation for fever symptoms.',
      'Check if new cases are clustered in a specific purok or household group before escalating the response.',
      'Keep barangay advisories active during rainy periods and add spatial coordination only when the hotspot check confirms nearby higher-risk influence.',
      'Reassess the barangay after the next reporting period.'
    )
  } else {
    actions.push(
      'Upload and validate dengue records before generating a full response action plan.',
      'Use boundary and population context as supporting information once case records are available.'
    )
  }

  if (isIncreasing) {
    actions.push(
      'Escalate surveillance because the recent trend indicates increasing case movement.'
    )
  }

  if (isDecreasing && risk !== 'Low') {
    actions.push(
      'Continue monitoring despite the decreasing trend because the barangay still has non-low risk classification.'
    )
  }

  if (forecast >= 100 || forecastNextPeriod >= 25) {
    actions.push(
      'Prioritize this barangay in the next CHO coordination meeting because projected case pressure is high.'
    )
  }

  if (recentAverage > previousAverage && previousAverage > 0) {
    actions.push(
      'Validate recent case reports because the recent average is higher than the previous baseline period.'
    )
  }

  return Array.from(new Set(actions.filter(Boolean))).slice(0, 8)
}

function buildBackendRationale({
  barangay,
  risk,
  forecast,
  forecastNextPeriod,
  recentAverage,
  previousAverage,
  historicalTotalCases,
  trendLabel,
  latestPeriod,
  recordCount,
}) {
  const rationale = [
    `Saved forecast classified ${barangay} as ${risk} risk.`,
    `Projected four-period cases: ${formatNumber(forecast)}.`,
    `Forecast for the next period: ${formatNumber(forecastNextPeriod)} cases.`,
    `Recent average cases: ${formatNumber(recentAverage)}.`,
    `Previous average cases: ${formatNumber(previousAverage)}.`,
    `Historical total cases: ${formatNumber(historicalTotalCases)}.`,
    `Recent trend direction: ${trendLabel || 'Not available'}.`,
  ]

  if (latestPeriod) {
    rationale.push(`Latest reporting period used: ${latestPeriod}.`)
  }

  if (recordCount > 0) {
    rationale.push(`${formatNumber(recordCount)} historical record${recordCount === 1 ? '' : 's'} were used for this barangay.`)
  }

  if (forecast >= 100) {
    rationale.push('The forecast is high, so immediate response planning is recommended.')
  }

  if (recentAverage > previousAverage && previousAverage > 0) {
    rationale.push('Recent average is higher than the previous average, indicating possible worsening case movement.')
  }

  if (recentAverage <= previousAverage && previousAverage > 0) {
    rationale.push('Recent average is not higher than the previous average, but risk classification and forecast output still require monitoring.')
  }

  return Array.from(new Set(rationale.filter(Boolean))).slice(0, 9)
}

function buildBackendRiskRows(backendForecastResult = null, context = {}) {
  const backendRows = backendForecastResult?.forecast_results || []
  const {
    populationRecords = [],
    boundaryFeatures = [],
    weatherRecords = [],
  } = context

  const backendPeriods = backendRows.map((row, index) => ({
    period: readText(row, ['latest_period', 'latestPeriod', 'period'], `Forecast period ${index + 1}`),
    index,
    sortValue: index,
  }))

  const sharedWeatherContext = getWeatherContextForPeriods(backendPeriods, weatherRecords)

  return backendRows
    .map((row) => {
      const barangay = row.barangay || row.barangay_name || 'Unspecified barangay'
      const forecast = Number(row.forecast_next_4_periods || row.forecastedCases || row.forecast || 0)
      const forecastNextPeriod = Number(row.forecast_next_period || row.currentCases || row.current_cases || 0)
      const forecastPeriodPredictions = Array.isArray(row.forecast_period_predictions || row.forecastPeriodPredictions)
        ? (row.forecast_period_predictions || row.forecastPeriodPredictions).map((item, index) => ({
            horizon: Number(item?.horizon || index + 1),
            period: String(item?.period || `Forecast period ${index + 1}`),
            predictedCases: Number(item?.predicted_cases ?? item?.predictedCases ?? 0),
          }))
        : []
      const recentAverage = Number(row.recent_average_cases || row.recentAverage || 0)
      const previousAverage = Number(row.previous_average_cases || row.previousAverage || 0)
      const historicalTotalCases = Number(row.historical_total_cases || row.totalCases || row.cases || 0)
      const trendLabel = row.trend_direction || row.trendDirection || row.trend || 'Stable'
      const responsePriority = row.response_priority || row.responsePriority || getBackendResponsePriority(row.risk_level || row.risk)
      const backendRecommendation = row.recommendation || getGenericRecommendedAction(row.risk_level || row.risk)
      const backendDecisionScore = getBackendDecisionScore(row)
      const latestPeriod = row.latest_period || row.latestPeriod || ''
      const recordCount = Number(row.record_count || row.recordCount || 0)

      const boundaryFeature = getBoundaryFeatureForBarangay(barangay, boundaryFeatures)
      const populationRow = getPopulationRowForSelection(barangay, boundaryFeature, populationRecords)
      const boundaryArea = getAreaValue({ row, feature: boundaryFeature })
      const population = getPopulationValue({ row, feature: boundaryFeature, populationRow })
      const density =
        readPositiveNumber(row, [
          'density',
          'populationDensity',
          'population_density',
          'densityPerSqKm',
        ]) ||
        (population > 0 && boundaryArea > 0 ? population / boundaryArea : 0)

      const rowWeatherContext = latestPeriod
        ? getWeatherContextForPeriods([{ period: latestPeriod }], weatherRecords)
        : sharedWeatherContext

      const weatherContext = rowWeatherContext.weatherRecordCount > 0
        ? rowWeatherContext
        : sharedWeatherContext

      const averageRainfall =
        readNumber(row, [
          'average_rainfall',
          'averageRainfall',
          'avgRainfall',
          'rainfall',
          'rainfall_mm',
          'rainfallMm',
        ], 0) || weatherContext.averageRainfall

      const averageTemperature =
        readNumber(row, [
          'average_temperature',
          'averageTemperature',
          'avgTemperature',
          'temperature',
          'temperature_c',
          'temperatureC',
        ], 0) || weatherContext.averageTemperature

      const averageHumidity =
        readNumber(row, [
          'average_humidity',
          'averageHumidity',
          'avgHumidity',
          'humidity',
          'relative_humidity',
          'relativeHumidity',
        ], 0) || weatherContext.averageHumidity

      const series = [
        {
          period: 'Previous average',
          cases: previousAverage,
        },
        {
          period: 'Recent average',
          cases: recentAverage,
        },
        ...(forecastPeriodPredictions.length
          ? forecastPeriodPredictions.map((item) => ({
              period: item.period,
              cases: item.predictedCases,
              horizon: item.horizon,
              isForecast: true,
            }))
          : [{ period: 'Forecast next period', cases: forecastNextPeriod, horizon: 1, isForecast: true }]),
      ]

      const history = [previousAverage, recentAverage, forecastNextPeriod]

      const multiSourceRisk = computeMultiSourceRisk({
        forecast,
        currentCases: forecastNextPeriod,
        forecastNextPeriod,
        forecast_next_period: forecastNextPeriod,
        previousCases: previousAverage,
        totalCases: historicalTotalCases,
        trend: trendLabel,
        recentAverage,
        previousAverage,
        history,
        weeklyCases: history,
        population,
        areaSqKm: boundaryArea,
        density,
        averageRainfall,
        totalRainfall: weatherContext.totalRainfall,
        averageTemperature,
        averageHumidity,
      })

      const backendRisk = row.risk_level || row.risk || multiSourceRisk.risk || 'Low'
      const baseRiskScore = readNumber(row, [
        'risk_score',
        'riskScore',
        'base_risk_score',
        'baseRiskScore',
      ], 0)
      const combinedRiskScore = readNumber(row, [
        'combined_risk_score',
        'multi_source_risk_score',
        'combinedRiskScore',
        'multiSourceRiskScore',
        'overallRiskScore',
        'overall_risk_score',
      ], multiSourceRisk.score || baseRiskScore)
      const environmentalScore = readNumber(row, [
        'environmental_score',
        'environmentalScore',
      ], multiSourceRisk.environmentalSuitability?.score || 0)
      const environmentalSuitability =
        getEnvironmentalSuitabilityValue(row) ||
        multiSourceRisk.environmentalSuitability?.label ||
        ''
      const rainfallPressure =
        getRainfallPressureValue(row) ||
        multiSourceRisk.environmentalSuitability?.rainfallPressure?.label ||
        ''
      const temperatureSuitability =
        getTemperatureSuitabilityValue(row) ||
        multiSourceRisk.environmentalSuitability?.temperatureSuitability?.label ||
        ''
      const humiditySuitability =
        getHumiditySuitabilityValue(row) ||
        multiSourceRisk.environmentalSuitability?.humiditySuitability?.label ||
        ''
      const populationExposure = readText(row, [
        'population_exposure',
        'populationExposure',
      ])
      const densityLevel = readText(row, [
        'density_level',
        'densityLevel',
      ])
      const riskComponents = row.risk_components || row.riskComponents || multiSourceRisk.components || null

      const rowData = {
        barangay,
        barangayKey: row.barangay_key || row.barangayKey || '',
        risk: backendRisk,
        forecast,
        forecastedCases: forecast,
        predictedCases: forecast,

        totalCases: historicalTotalCases,
        cases: historicalTotalCases,
        currentCases: forecastNextPeriod,
        previousCases: previousAverage,

        recentAverage,
        previousAverage,
        trend: trendLabel,
        trendLabel,
        trendDirection: trendLabel,

        riskScore: combinedRiskScore,
        risk_score: baseRiskScore,
        baseRiskScore,
        combinedRiskScore,
        combined_risk_score: combinedRiskScore,
        multiSourceRiskScore: combinedRiskScore,
        multi_source_risk_score: combinedRiskScore,
        overallRiskScore: combinedRiskScore,

        environmentalScore,
        environmental_score: environmentalScore,
        environmentalSuitability,
        environmental_suitability: environmentalSuitability,
        rainfallPressure,
        rainfall_pressure: rainfallPressure,
        temperatureSuitability,
        temperature_suitability: temperatureSuitability,
        humiditySuitability,
        humidity_suitability: humiditySuitability,
        populationExposure,
        population_exposure: populationExposure,
        densityLevel,
        density_level: densityLevel,

        averageRainfall,
        average_rainfall: averageRainfall,
        avgRainfall: averageRainfall,
        totalRainfall: weatherContext.totalRainfall,
        total_rainfall: weatherContext.totalRainfall,
        averageTemperature,
        average_temperature: averageTemperature,
        avgTemperature: averageTemperature,
        averageHumidity,
        average_humidity: averageHumidity,
        avgHumidity: averageHumidity,
        weatherRecordCount: weatherContext.weatherRecordCount,
        weather_record_count: weatherContext.weatherRecordCount,
        weatherCoverageLabel: weatherContext.weatherCoverageLabel,
        weather_coverage_label: weatherContext.weatherCoverageLabel,

        population,
        density,
        areaSqKm: boundaryArea,
        area_sqkm: boundaryArea,
        boundaryAreaSqKm: boundaryArea,
        boundary_area_sqkm: boundaryArea,
        riskComponents,
        risk_components: riskComponents,

        history,
        weeklyCases: history,
        caseHistory: series,
        series,
        periods: forecastPeriodPredictions.length
          ? forecastPeriodPredictions.map((item) => item.period)
          : [latestPeriod || 'Latest period'],
        forecastPeriodPredictions,
        forecastStrategy: row.forecast_strategy || row.forecastStrategy || '',

        latestPeriod,
        recordCount,
      }

      const computedDecisionSupport = computeDecisionSupport(rowData)

      const fallbackActionPlan = buildBackendActionPlan({
        risk: backendRisk,
        forecast,
        forecastNextPeriod,
        recentAverage,
        previousAverage,
        trendLabel,
        recommendation: backendRecommendation || computedDecisionSupport.primaryAction,
      })

      const actionPlan = Array.from(
        new Set([
          backendRecommendation,
          ...(Array.isArray(computedDecisionSupport.actions)
            ? computedDecisionSupport.actions
            : []),
          ...fallbackActionPlan,
        ].filter(Boolean))
      ).slice(0, 8)

      const backendRationale = buildBackendRationale({
        barangay,
        risk: backendRisk,
        forecast,
        forecastNextPeriod,
        recentAverage,
        previousAverage,
        historicalTotalCases,
        trendLabel,
        latestPeriod,
        recordCount,
      })

      const rationale = Array.from(
        new Set([
          ...backendRationale,
          ...(Array.isArray(computedDecisionSupport.rationale)
            ? computedDecisionSupport.rationale
            : []),
        ].filter(Boolean))
      ).slice(0, 9)

      const decisionSupport = {
        ...computedDecisionSupport,
        summary:
          backendRecommendation ||
          computedDecisionSupport.summary ||
          getGenericRecommendedAction(backendRisk),
        priority:
          computedDecisionSupport.priority ||
          responsePriority,
        actions: actionPlan,
        rationale,
        score: Math.max(
          Number(computedDecisionSupport.score || 0),
          Number(backendDecisionScore || 0)
        ),
        primaryAction: actionPlan[0] || backendRecommendation,
        trendDirection: trendLabel,
        forecastPressure:
          computedDecisionSupport.forecastPressure ||
          'Forecast pressure available',
      }

      return {
        ...rowData,

        recommendedAction: decisionSupport.summary,
        primaryAction: decisionSupport.primaryAction,
        recommendedActions: decisionSupport.actions,
        responsePriority: decisionSupport.priority,
        recommendationRationale: decisionSupport.rationale,
        decisionScore: decisionSupport.score,
        decisionSupport,

        backendPriorityRank: Number(row.priority_rank || row.priorityRank || 0),
      }
    })
    .sort(compareCanonicalBarangayPriority)
}

function buildBackendPeriodCount(backendForecastResult = null) {
  const backendRows = backendForecastResult?.forecast_results || []

  if (!backendRows.length) return 0

  return 4
}

export default function MapPage() {
  const data = useData()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedBarangay = searchParams.get('barangay') || ''

  const {
    riskRows = [],
    dashboardStats,
    sourceStatus,
    backendForecastResult = null,
    addActivityLog,
    boundaryRecords = [],
  } = data

  const populationRecords = useMemo(() => {
    const candidates = [
      data.populationRecords,
      data.populationRows,
      data.populationData,
      data.populationDataset,
    ]

    return candidates.find((candidate) => Array.isArray(candidate)) || []
  }, [
    data.populationRecords,
    data.populationRows,
    data.populationData,
    data.populationDataset,
  ])

  const weatherRecords = useMemo(() => {
    const candidates = [
      data.weatherRecords,
      data.weatherRows,
      data.weatherData,
      data.weatherDataset,
      data.meteorologicalRecords,
      data.meteorologicalRows,
      data.meteorologicalData,
      data.meteorologicalDataset,
    ]

    return candidates.find((candidate) => Array.isArray(candidate)) || []
  }, [
    data.weatherRecords,
    data.weatherRows,
    data.weatherData,
    data.weatherDataset,
    data.meteorologicalRecords,
    data.meteorologicalRows,
    data.meteorologicalData,
    data.meteorologicalDataset,
  ])

  const usingBackendForecast = hasBackendForecastData(backendForecastResult)

  const boundaryGeoJson = useMemo(() => {
    return getBoundaryGeoJson(boundaryRecords)
  }, [boundaryRecords])

  const boundaryFeatures = useMemo(() => {
    return boundaryGeoJson?.features || []
  }, [boundaryGeoJson])

  const backendRiskRows = useMemo(() => {
    return buildBackendRiskRows(backendForecastResult, {
      populationRecords,
      boundaryFeatures,
      weatherRecords,
    })
  }, [
    backendForecastResult,
    populationRecords,
    boundaryFeatures,
    weatherRecords,
  ])

  const hasMultiSourceRiskRows = riskRows.some((row) => {
    return (
      Number(getOverallRiskScore(row)) > 0 ||
      Boolean(getEnvironmentalSuitabilityValue(row)) ||
      Boolean(getRainfallPressureValue(row)) ||
      Boolean(getTemperatureSuitabilityValue(row)) ||
      Boolean(getHumiditySuitabilityValue(row))
    )
  })

  const displayRiskRows = usingBackendForecast
  ? backendRiskRows
  : riskRows

 const usingMultiSourceRisk = !usingBackendForecast && hasMultiSourceRiskRows

  const displayPeriodCount = usingBackendForecast && !usingMultiSourceRisk
    ? buildBackendPeriodCount(backendForecastResult)
    : dashboardStats?.weeklyTotals?.length || 0

  const [selected, setSelected] = useState('')
  const [selectedPanelOpen, setSelectedPanelOpen] = useState(false)
  const [selectedPanelPosition, setSelectedPanelPosition] = useState(() => getDefaultPanelPosition())
  const [dragState, setDragState] = useState(null)
  const [legendOpen, setLegendOpen] = useState(true)
  const [mapStyle, setMapStyle] = useState('dark')
  const [mapLayerMode, setMapLayerMode] = useState('forecast')
  const [isMapExpanded, setIsMapExpanded] = useState(false)
  const [hotspotResult, setHotspotResult] = useState(null)
  const [hotspotError, setHotspotError] = useState('')
  const [isLoadingHotspots, setIsLoadingHotspots] = useState(false)

  const boundaryFeatureCount = countBoundaryFeatures(boundaryRecords)

  const hasRiskData = displayRiskRows.length > 0
  const hasBoundaryData =
    Number(sourceStatus?.boundary?.validCount || 0) > 0 ||
    boundaryFeatureCount > 0

  const canShowMap = hasRiskData || hasBoundaryData

  const rawHotspotRows = useMemo(() => {
    return Array.isArray(hotspotResult?.hotspots)
      ? hotspotResult.hotspots
      : []
  }, [hotspotResult])

  const hotspotRows = useMemo(() => {
    return reconcileHotspotRows(rawHotspotRows, displayRiskRows)
  }, [rawHotspotRows, displayRiskRows])

  const hotspotCounts = useMemo(() => {
    return getHotspotCounts(hotspotRows)
  }, [hotspotRows])

  const hotspotCountTotal = getHotspotCountTotal(hotspotCounts)

  const hotspotSummary = useMemo(() => {
    return buildReconciledHotspotSummary(
      hotspotResult?.summary || null,
      hotspotCounts,
      displayRiskRows.length
    )
  }, [hotspotResult, hotspotCounts, displayRiskRows.length])

  const hotspotLevelCounts = hotspotSummary?.level_counts || {}
  const hotspotPriorityCount =
    Number(hotspotCounts.confirmed || 0) +
    Number(hotspotCounts.emerging || 0)
  const realHotspotReady = rawHotspotRows.length > 0

  const rankedHotspotRows = useMemo(() => {
    return [...hotspotRows]
      .filter((row) => {
        return (
          !isMapReviewHotspot(row) &&
          row.hotspot_level !== 'Not checked'
        )
      })
      .sort(
        (a, b) =>
          Number(b.hotspot_score || 0) -
          Number(a.hotspot_score || 0)
      )
  }, [hotspotRows])

  const mapReviewRows = useMemo(() => {
    return hotspotRows
      .filter((row) => isMapReviewHotspot(row))
      .sort((a, b) => {
        if (Number(b.total_cases || 0) !== Number(a.total_cases || 0)) {
          return Number(b.total_cases || 0) - Number(a.total_cases || 0)
        }

        return Number(b.base_risk_score || 0) - Number(a.base_risk_score || 0)
      })
  }, [hotspotRows])

  const showingHotspotLayer = mapLayerMode === 'hotspot' && realHotspotReady

  const hotspotMapRows = useMemo(() => {
    if (!hotspotRows.length) return []

    return hotspotRows.map((hotspot) => {
      const forecastRow = displayRiskRows.find((row) => {
        return namesMatch(row.barangay, hotspot.barangay)
      })

      return {
        ...(forecastRow || {}),
        ...hotspot,
        barangay: hotspot.barangay || forecastRow?.barangay || 'Unspecified barangay',
        hotspotLevel: hotspot.hotspot_level || '',
        hotspotScore: Number(hotspot.hotspot_score || 0),
        neighborInfluenceScore: Number(hotspot.neighbor_influence_score || 0),
      }
    })
  }, [hotspotRows, displayRiskRows])

  const activeMapRows = showingHotspotLayer ? hotspotMapRows : displayRiskRows

  const activeMatchedBoundaryCount = useMemo(() => {
    if (!boundaryFeatures.length || !activeMapRows.length) return 0

    return boundaryFeatures.filter((feature) => {
      const featureName = getFeatureName(feature)
      const referenceName = getFeatureReferenceName(feature)

      return activeMapRows.some((row) => {
        return (
          namesMatch(row.barangay, featureName) ||
          namesMatch(row.barangay, referenceName)
        )
      })
    }).length
  }, [boundaryFeatures, activeMapRows])

  const activeUnmatchedRowCount = useMemo(() => {
    if (!activeMapRows.length) return 0

    return activeMapRows.filter((row) => {
      return !getBoundaryFeatureForBarangay(row.barangay, boundaryFeatures)
    }).length
  }, [activeMapRows, boundaryFeatures])

  useEffect(() => {
    if (!dragState) return undefined

    function handleMove(event) {
      event.preventDefault()

      const { clientX, clientY } = getClientPoint(event)

      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return

      setSelectedPanelPosition(
        clampPanelPosition({
          x: clientX - dragState.offsetX,
          y: clientY - dragState.offsetY,
        })
      )
    }

    function handleEnd() {
      setDragState(null)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleEnd)
    window.addEventListener('touchmove', handleMove, { passive: false })
    window.addEventListener('touchend', handleEnd)
    window.addEventListener('touchcancel', handleEnd)

    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleEnd)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleEnd)
      window.removeEventListener('touchcancel', handleEnd)
    }
  }, [dragState])

  useEffect(() => {
    function handleResize() {
      setSelectedPanelPosition((current) => clampPanelPosition(current))
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  useEffect(() => {
    if (!requestedBarangay) return

    const requestedRiskRow = displayRiskRows.find((row) => {
      return namesMatch(row.barangay, requestedBarangay)
    })

    const requestedBoundaryFeature = boundaryFeatures.find((feature) => {
      return (
        namesMatch(requestedBarangay, getFeatureName(feature)) ||
        namesMatch(requestedBarangay, getFeatureReferenceName(feature))
      )
    })

    const matchedBarangay =
      requestedRiskRow?.barangay ||
      (requestedBoundaryFeature
        ? getFeatureName(requestedBoundaryFeature)
        : '')

    if (!matchedBarangay) return

    setSelected(matchedBarangay)
    setSelectedPanelPosition(clampPanelPosition(getDefaultPanelPosition()))
    setSelectedPanelOpen(true)

    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.delete('barangay')
    setSearchParams(nextSearchParams, { replace: true })
  }, [
    requestedBarangay,
    displayRiskRows,
    boundaryFeatures,
    searchParams,
    setSearchParams,
  ])

  useEffect(() => {
    if (requestedBarangay) return

    if (displayRiskRows.length) {
      const riskExists = displayRiskRows.some((row) => namesMatch(row.barangay, selected))
      const boundaryExists = boundaryFeatures.some((feature) => {
        return (
          namesMatch(selected, getFeatureName(feature)) ||
          namesMatch(selected, getFeatureReferenceName(feature))
        )
      })

      if (!selected || (!riskExists && !boundaryExists)) {
        setSelected(displayRiskRows[0].barangay)
      }

      return
    }

    if (boundaryFeatures.length) {
      const boundaryExists = boundaryFeatures.some((feature) => {
        return (
          namesMatch(selected, getFeatureName(feature)) ||
          namesMatch(selected, getFeatureReferenceName(feature))
        )
      })

      if (!selected || !boundaryExists) {
        setSelected(getFeatureName(boundaryFeatures[0]))
      }

      return
    }

    if (selected) {
      setSelected('')
      setSelectedPanelOpen(false)
    }
  }, [displayRiskRows, selected, boundaryFeatures, requestedBarangay])

  const details = useMemo(() => {
    if (!hasRiskData || !selected) return null

    return displayRiskRows.find((row) => namesMatch(row.barangay, selected)) || null
  }, [displayRiskRows, selected, hasRiskData])

  const selectedBoundaryFeature = useMemo(() => {
    if (!selected || !boundaryFeatures.length) return null

    return (
      boundaryFeatures.find((feature) => {
        return (
          namesMatch(selected, getFeatureName(feature)) ||
          namesMatch(selected, getFeatureReferenceName(feature))
        )
      }) || null
    )
  }, [selected, boundaryFeatures])

  const selectedPopulationRow = useMemo(() => {
    return getPopulationRowForSelection(
      selected,
      selectedBoundaryFeature,
      populationRecords
    )
  }, [selected, selectedBoundaryFeature, populationRecords])

  const selectedLabel =
    details?.barangay ||
    selected ||
    (selectedBoundaryFeature ? getFeatureName(selectedBoundaryFeature) : 'No barangay selected')

  const selectedHotspot = useMemo(() => {
    if (!selected && !selectedLabel) return null

    return (
      hotspotRows.find((row) => {
        return (
          namesMatch(row.barangay, selected) ||
          namesMatch(row.barangay, selectedLabel)
        )
      }) || null
    )
  }, [hotspotRows, selected, selectedLabel])

  const selectedNeedsMapReview = Boolean(
    selectedHotspot && isMapReviewHotspot(selectedHotspot)
  )

  const selectedArea = getAreaValue({
    row: details,
    feature: selectedBoundaryFeature,
  })

  const selectedPopulation = getPopulationValue({
    row: details,
    feature: selectedBoundaryFeature,
    populationRow: selectedPopulationRow,
  })

  const selectedDensity =
    readPositiveNumber(details, [
      'density',
      'populationDensity',
      'population_density',
      'densityPerSqKm',
    ]) ||
    (selectedPopulation > 0 && selectedArea > 0
      ? selectedPopulation / selectedArea
      : 0)

  const selectedTrend = getHistoricalTrend(details)

  const selectedDecisionSupport = details?.decisionSupport || null

  const selectedRecommendation =
    selectedDecisionSupport?.summary ||
    details?.recommendedAction ||
    getGenericRecommendedAction(details?.risk)

  const selectedPriority =
    selectedDecisionSupport?.priority ||
    details?.responsePriority ||
    (details ? 'Standard response' : 'Waiting for data')

  const selectedDecisionScore =
    details?.decisionScore ??
    selectedDecisionSupport?.score ??
    0

  const selectedActionPlan = useMemo(() => {
    let actions = Array.isArray(selectedDecisionSupport?.actions)
      ? selectedDecisionSupport.actions
      : Array.isArray(details?.recommendedActions)
        ? details.recommendedActions
        : selectedRecommendation
          ? [selectedRecommendation]
          : []

    if (actions.length < 3 && details) {
      actions = buildBackendActionPlan({
        risk: details.risk,
        forecast: Number(details.forecast || details.forecastedCases || details.predictedCases || 0),
        forecastNextPeriod: Number(details.currentCases || 0),
        recentAverage: Number(details.recentAverage || 0),
        previousAverage: Number(details.previousAverage || 0),
        trendLabel: details.trend || details.trendLabel || details.trendDirection,
        recommendation: selectedRecommendation,
      })
    }

    const hotspotAction =
      realHotspotReady && selectedHotspot?.recommended_map_action
        ? selectedHotspot.recommended_map_action
        : ''

    return Array.from(
      new Set([
        ...actions.slice(0, 2),
        hotspotAction,
        ...actions.slice(2),
      ].filter(Boolean))
    ).slice(0, 8)
  }, [
    details,
    realHotspotReady,
    selectedDecisionSupport,
    selectedHotspot,
    selectedRecommendation,
  ])

  const selectedRationale = useMemo(() => {
    const rationale = Array.isArray(selectedDecisionSupport?.rationale)
      ? selectedDecisionSupport.rationale
      : Array.isArray(details?.recommendationRationale)
        ? details.recommendationRationale
        : []

    if (rationale.length >= 4) {
      return rationale
    }

    if (!details) {
      return rationale
    }

    return buildBackendRationale({
      barangay: details.barangay || selectedLabel,
      risk: details.risk,
      forecast: Number(details.forecast || details.forecastedCases || details.predictedCases || 0),
      forecastNextPeriod: Number(details.currentCases || 0),
      recentAverage: Number(details.recentAverage || 0),
      previousAverage: Number(details.previousAverage || 0),
      historicalTotalCases: Number(details.totalCases || details.cases || 0),
      trendLabel: details.trend || details.trendLabel || details.trendDirection,
      latestPeriod: details.latestPeriod,
      recordCount: Number(details.recordCount || 0),
    })
  }, [details, selectedDecisionSupport, selectedLabel])

  const summary = showingHotspotLayer
    ? rankedHotspotRows.slice(0, 5)
    : hasRiskData
      ? displayRiskRows.slice(0, 5)
      : []

  function openSelectedPanel() {
    setSelectedPanelPosition((current) => {
      if (selectedPanelOpen) return clampPanelPosition(current)

      return clampPanelPosition(getDefaultPanelPosition())
    })

    setSelectedPanelOpen(true)
  }

  function handleStartPanelDrag(event) {
    const target = event.target

    if (target?.closest?.('button, a, input, textarea, select')) return

    const { clientX, clientY } = getClientPoint(event)

    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return

    setDragState({
      offsetX: clientX - selectedPanelPosition.x,
      offsetY: clientY - selectedPanelPosition.y,
    })
  }

  function handleSelectBarangay(value) {
    const name = getSelectedBarangayName(value)

    if (!name) return

    setSelected(name)
    openSelectedPanel()

    const selectedRow = displayRiskRows.find((row) => namesMatch(row.barangay, name))
    const selectedFeature = boundaryFeatures.find((feature) => {
      return (
        namesMatch(name, getFeatureName(feature)) ||
        namesMatch(name, getFeatureReferenceName(feature))
      )
    })

    addActivityLog?.(
      'Barangay selected on map',
      `${name} was selected on the hotspot map. Current risk: ${selectedRow?.risk || (selectedFeature ? 'Boundary only' : 'No risk data')}.`
    )
  }

  const highRiskCount = displayRiskRows.filter((row) => row.risk === 'High').length
  const moderateRiskCount = displayRiskRows.filter((row) => row.risk === 'Moderate').length
  const lowRiskCount = displayRiskRows.filter((row) => row.risk === 'Low').length

  const forecastLegendItems = [
    {
      key: 'High',
      label: 'High Risk',
      count: highRiskCount,
      dot: 'bg-rose-500',
      badge: 'border-rose-100 bg-rose-50 text-rose-600 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
      icon: ShieldAlert,
      description: getLegendDescription('High'),
    },
    {
      key: 'Moderate',
      label: 'Moderate Risk',
      count: moderateRiskCount,
      dot: 'bg-amber-500',
      badge: 'border-amber-100 bg-amber-50 text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
      icon: AlertTriangle,
      description: getLegendDescription('Moderate'),
    },
    {
      key: 'Low',
      label: 'Low Risk',
      count: lowRiskCount,
      dot: 'bg-emerald-500',
      badge: 'border-emerald-100 bg-emerald-50 text-emerald-600 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
      icon: CheckCircle2,
      description: getLegendDescription('Low'),
    },
  ]

  const hotspotLegendItems = [
    {
      key: 'Confirmed Hotspot',
      label: 'Confirmed Hotspot',
      count: Number(hotspotLevelCounts['Confirmed Hotspot'] || 0),
      dot: 'bg-rose-600',
      badge: 'border-rose-100 bg-rose-50 text-rose-600 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
      icon: ShieldAlert,
      description: getHotspotLegendDescription('Confirmed Hotspot'),
    },
    {
      key: 'Emerging Hotspot',
      label: 'Emerging Hotspot',
      count: Number(hotspotLevelCounts['Emerging Hotspot'] || 0),
      dot: 'bg-orange-500',
      badge: 'border-orange-100 bg-orange-50 text-orange-600 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300',
      icon: TrendingUp,
      description: getHotspotLegendDescription('Emerging Hotspot'),
    },
    {
      key: 'Watch Area',
      label: 'Watch Area',
      count: Number(hotspotLevelCounts['Watch Area'] || 0),
      dot: 'bg-yellow-500',
      badge: 'border-yellow-100 bg-yellow-50 text-yellow-700 dark:border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-300',
      icon: Radar,
      description: getHotspotLegendDescription('Watch Area'),
    },
    {
      key: 'Low Spatial Concern',
      label: 'Low Spatial Concern',
      count: Number(hotspotLevelCounts['Low Spatial Concern'] || 0),
      dot: 'bg-emerald-500',
      badge: 'border-emerald-100 bg-emerald-50 text-emerald-600 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
      icon: CheckCircle2,
      description: getHotspotLegendDescription('Low Spatial Concern'),
    },
    {
      key: 'Needs Map Review',
      label: 'Needs Map Review',
      count: Number(hotspotCounts.needsReview || 0),
      dot: 'bg-blue-500',
      badge: 'border-blue-100 bg-blue-50 text-blue-600 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
      icon: MapPinned,
      description: getHotspotLegendDescription('Needs Map Review'),
    },
    {
      key: 'Not checked',
      label: 'Not Checked',
      count: Number(hotspotCounts.notChecked || 0),
      dot: 'bg-slate-500',
      badge: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
      icon: AlertTriangle,
      description: 'Hotspot result not returned',
    },
  ]

  const activeLegendItems = showingHotspotLayer
    ? hotspotLegendItems
    : forecastLegendItems

  const activeMapStyle =
    mapStyleOptions.find((item) => item.value === mapStyle) || mapStyleOptions[0]

  const selectedHeroScore = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        Number(
          showingHotspotLayer
            ? selectedHotspot?.hotspot_score || 0
            : getOverallRiskScore(details) ||
                details?.riskScore ||
                details?.multiSourceRiskScore ||
                0
        )
      )
    )
  )

  const selectedHeroScoreLabel = showingHotspotLayer ? 'Hotspot' : 'Risk'

  const selectedMetrics = [
    {
      label: 'Total dengue cases',
      value: details
        ? `${formatNumber(readNumber(details, ['totalCases', 'cases', 'currentCases'], 0))} cases`
        : 'Pending dengue records',
      icon: Activity,
      tone: 'text-rose-500 bg-rose-50 border-rose-100 dark:text-rose-300 dark:bg-rose-500/10 dark:border-rose-500/20',
    },
    {
      label: 'Forecasted cases',
      value: details
        ? `${formatNumber(readNumber(details, ['forecast', 'forecastedCases', 'predictedCases'], 0))} cases`
        : 'Pending forecast',
      icon: BarChart3,
      tone: 'text-blue-500 bg-blue-50 border-blue-100 dark:text-blue-300 dark:bg-blue-500/10 dark:border-blue-500/20',
    },
    {
      label: 'Historical trend',
      value: selectedTrend,
      icon: TrendingUp,
      tone: 'text-amber-500 bg-amber-50 border-amber-100 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/20',
    },
    {
      label: 'Risk level',
      value: details?.risk || 'Pending risk data',
      icon: ShieldAlert,
      tone: 'text-emerald-500 bg-emerald-50 border-emerald-100 dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/20',
    },
    {
      label: 'Hotspot level',
      value: selectedHotspot ? getHotspotLevelLabel(selectedHotspot.hotspot_level) : 'Run hotspot check',
      icon: MapPinned,
      tone: 'text-rose-500 bg-rose-50 border-rose-100 dark:text-rose-300 dark:bg-rose-500/10 dark:border-rose-500/20',
    },
    {
      label: 'Hotspot score',
      value: selectedHotspot
        ? selectedNeedsMapReview
          ? 'Not finalized'
          : formatHotspotScore(selectedHotspot.hotspot_score)
        : 'Not checked',
      icon: Radar,
      tone: 'text-violet-500 bg-violet-50 border-violet-100 dark:text-violet-300 dark:bg-violet-500/10 dark:border-violet-500/20',
    },
    {
      label: 'Nearby barangay effect',
      value: selectedHotspot
        ? selectedNeedsMapReview
          ? 'Not available'
          : formatHotspotScore(selectedHotspot.neighbor_influence_score)
        : 'Not checked',
      icon: Navigation,
      tone: 'text-orange-500 bg-orange-50 border-orange-100 dark:text-orange-300 dark:bg-orange-500/10 dark:border-orange-500/20',
    },
    {
      label: 'Response priority',
      value: selectedPriority,
      icon: Navigation,
      tone: 'text-orange-500 bg-orange-50 border-orange-100 dark:text-orange-300 dark:bg-orange-500/10 dark:border-orange-500/20',
    },
    {
      label: 'Response score',
      value: details ? `${formatNumber(selectedDecisionScore)} points` : 'Waiting for data',
      icon: Gauge,
      tone: 'text-indigo-500 bg-indigo-50 border-indigo-100 dark:text-indigo-300 dark:bg-indigo-500/10 dark:border-indigo-500/20',
    },
    {
      label: 'Overall risk score',
      value: details ? formatRiskScore(getOverallRiskScore(details) || details?.riskScore || details?.multiSourceRiskScore) : 'Waiting for data',
      icon: Radar,
      tone: 'text-sky-500 bg-sky-50 border-sky-100 dark:text-sky-300 dark:bg-sky-500/10 dark:border-sky-500/20',
    },
    {
      label: 'Weather condition',
      value: details ? getLabelValue(getEnvironmentalSuitabilityValue(details) || details?.environmentalSuitability) : 'Pending weather data',
      icon: CloudRain,
      tone: 'text-cyan-500 bg-cyan-50 border-cyan-100 dark:text-cyan-300 dark:bg-cyan-500/10 dark:border-cyan-500/20',
    },
    {
      label: 'Rainfall risk',
      value: details ? getLabelValue(getRainfallPressureValue(details) || details?.rainfallPressure) : 'Pending weather data',
      icon: CloudRain,
      tone: 'text-blue-500 bg-blue-50 border-blue-100 dark:text-blue-300 dark:bg-blue-500/10 dark:border-blue-500/20',
    },
    {
      label: 'Temperature condition',
      value: details ? getLabelValue(getTemperatureSuitabilityValue(details) || details?.temperatureSuitability) : 'Pending weather data',
      icon: Thermometer,
      tone: 'text-orange-500 bg-orange-50 border-orange-100 dark:text-orange-300 dark:bg-orange-500/10 dark:border-orange-500/20',
    },
    {
      label: 'Humidity condition',
      value: details ? getLabelValue(getHumiditySuitabilityValue(details) || details?.humiditySuitability) : 'Pending weather data',
      icon: Droplets,
      tone: 'text-teal-500 bg-teal-50 border-teal-100 dark:text-teal-300 dark:bg-teal-500/10 dark:border-teal-500/20',
    },
    {
      label: 'Area',
      value: formatOptionalNumber(selectedArea, ' sq km'),
      icon: MapIcon,
      tone: 'text-cyan-500 bg-cyan-50 border-cyan-100 dark:text-cyan-300 dark:bg-cyan-500/10 dark:border-cyan-500/20',
    },
    {
      label: 'Population',
      value: formatOptionalNumber(selectedPopulation),
      icon: Users,
      tone: 'text-violet-500 bg-violet-50 border-violet-100 dark:text-violet-300 dark:bg-violet-500/10 dark:border-violet-500/20',
    },
    {
      label: 'Density',
      value: formatOptionalNumber(selectedDensity, ' people/sq km'),
      icon: Gauge,
      tone: 'text-teal-500 bg-teal-50 border-teal-100 dark:text-teal-300 dark:bg-teal-500/10 dark:border-teal-500/20',
    },
  ]

  async function handleRunHotspotAnalysis() {
    setHotspotError('')
    setIsLoadingHotspots(true)

    try {
      const result = await getGeospatialHotspots()

      setHotspotResult(result)

      if (Array.isArray(result?.hotspots) && result.hotspots.length > 0) {
        setMapLayerMode('hotspot')
      }

      const reconciledRows = reconcileHotspotRows(
        Array.isArray(result?.hotspots) ? result.hotspots : [],
        displayRiskRows
      )
      const reconciledCounts = getHotspotCounts(reconciledRows)
      const hotspotCount =
        Number(reconciledCounts.confirmed || 0) +
        Number(reconciledCounts.emerging || 0)
      const accountedCount = getHotspotCountTotal(reconciledCounts)

      addActivityLog?.(
        'Hotspot check completed',
        `${formatNumber(hotspotCount)} hotspot area${hotspotCount === 1 ? '' : 's'} identified. ${formatNumber(accountedCount)} of ${formatNumber(displayRiskRows.length)} official barangays were accounted for once.`
      )
    } catch (error) {
      setHotspotError(
        error?.message ||
          'Unable to run the hotspot check. Upload and combine dengue, weather, population, and barangay map data first.'
      )
    } finally {
      setIsLoadingHotspots(false)
    }
  }

  function renderMapControls() {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <div className="map-layer-toggle flex flex-wrap rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
          {mapLayerOptions.map((option) => {
            const Icon = option.icon
            const active = mapLayerMode === option.value
            const disabled = option.value === 'hotspot' && !realHotspotReady

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => !disabled && setMapLayerMode(option.value)}
                disabled={disabled}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition ${
                  active
                    ? 'bg-violet-700 text-white shadow-sm dark:bg-violet-500'
                    : disabled
                      ? 'cursor-not-allowed text-slate-300 opacity-60 dark:text-slate-600'
                      : 'text-brand-muted hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
                title={disabled ? 'Run the hotspot check first.' : option.description}
              >
                <Icon className="h-3.5 w-3.5" />
                {option.shortLabel}
              </button>
            )
          })}
        </div>

        <div className="map-style-toggle flex flex-wrap rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
          {mapStyleOptions.map((option) => {
            const Icon = option.icon
            const active = mapStyle === option.value

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setMapStyle(option.value)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition ${
                  active
                    ? 'bg-brand-blue text-white shadow-sm dark:bg-blue-500'
                    : 'text-brand-muted hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
                title={option.description}
              >
                <Icon className="h-3.5 w-3.5" />
                {option.label}
              </button>
            )
          })}
        </div>

       <button
  type="button"
  onClick={() => setIsMapExpanded((current) => !current)}
  style={{
    backgroundColor: '#ffffff',
    color: '#0f172a',
    borderColor: 'rgba(255,255,255,0.45)',
  }}
  className="group inline-flex w-fit max-w-full items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-left shadow-[0_10px_24px_rgba(15,23,42,0.14)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(15,23,42,0.18)]"
>
  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-blue text-white shadow-[0_8px_18px_rgba(37,95,143,0.22)]">
    {isMapExpanded ? (
      <Minimize2 className="h-4 w-4" />
    ) : (
      <Maximize2 className="h-4 w-4" />
    )}
  </div>

  <span
    style={{ color: '#0f172a' }}
    className="whitespace-nowrap text-xs font-black uppercase tracking-[0.12em]"
  >
    {isMapExpanded ? 'Compact map' : 'Expand map'}
  </span>

  <ArrowUpRight className="h-4 w-4 shrink-0 text-brand-blue transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
</button>

        <button
          type="button"
          onClick={handleRunHotspotAnalysis}
          disabled={isLoadingHotspots || !hasBoundaryData}
          className="inline-flex items-center gap-2 rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20"
        >
          <Radar className="h-3.5 w-3.5" />
          {isLoadingHotspots ? 'Checking hotspot areas...' : 'Run hotspot check'}
        </button>

      </div>
    )
  }

  const mapContent = (
    <div
      className={
        isMapExpanded
          ? 'h-[calc(100vh-190px)] min-h-[720px] max-h-[920px] overflow-hidden rounded-[30px] border border-cyan-200/70 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.12),transparent_38%),linear-gradient(145deg,#eff6ff,#ffffff_58%,#ecfeff)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_20px_52px_rgba(15,23,42,0.10)] dark:border-cyan-500/20 dark:bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.10),transparent_38%),linear-gradient(145deg,#020617,#0f172a_58%,#082f49)]'
          : 'h-[560px] overflow-hidden rounded-[28px] border border-cyan-200/70 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.12),transparent_38%),linear-gradient(145deg,#eff6ff,#ffffff_58%,#ecfeff)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_20px_52px_rgba(15,23,42,0.10)] dark:border-cyan-500/20 dark:bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.10),transparent_38%),linear-gradient(145deg,#020617,#0f172a_58%,#082f49)] sm:h-[680px] 2xl:h-[780px]'
      }
    >
      <div className="h-full overflow-hidden rounded-[22px] dark:[&_.leaflet-container]:bg-slate-950">
        {canShowMap ? (
          <LeafletRiskMap
            key={`${mapStyle}-${mapLayerMode}-${isMapExpanded ? 'expanded' : 'normal'}`}
            selected={selected}
            onSelect={handleSelectBarangay}
            onBarangaySelect={handleSelectBarangay}
            onFeatureSelect={handleSelectBarangay}
            onPolygonClick={handleSelectBarangay}
            rows={activeMapRows}
            mapStyle={mapStyle}
            layerMode={showingHotspotLayer ? 'hotspot' : 'forecast'}
            matchedLabel={showingHotspotLayer ? 'matched with hotspot data' : 'matched with forecast data'}
            layoutKey={isMapExpanded ? 'expanded' : 'normal'}
            showDetailsPanel={false}
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded-[22px] border border-dashed border-slate-200 bg-white/[0.80] p-8 text-center dark:border-slate-700 dark:bg-slate-950">
            <div>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-xl font-black text-brand-blue dark:bg-blue-500/10 dark:text-blue-300">
                GIS
              </div>

              <h4 className="mt-4 text-lg font-black text-brand-text dark:text-slate-100">
                No barangay map available yet
              </h4>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-brand-muted dark:text-slate-400">
                Upload the Butuan barangay map file first. After dengue records are checked, the map will color each barangay by risk level.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="map-mobile-compact relative isolate space-y-7 overflow-hidden rounded-[38px] bg-[radial-gradient(circle_at_8%_2%,rgba(14,165,233,0.09),transparent_28%),radial-gradient(circle_at_92%_10%,rgba(16,185,129,0.08),transparent_24%),linear-gradient(180deg,rgba(248,250,252,0.78),rgba(248,250,252,0))] pb-10 sm:space-y-8 dark:bg-[radial-gradient(circle_at_8%_2%,rgba(14,165,233,0.10),transparent_28%),radial-gradient(circle_at_92%_10%,rgba(16,185,129,0.07),transparent_24%),linear-gradient(180deg,rgba(15,23,42,0.42),rgba(15,23,42,0))]">
      <div className="pointer-events-none absolute inset-x-0 -top-8 -z-10 h-72 rounded-full bg-blue-100/70 blur-3xl dark:bg-blue-500/10" />

      {selectedPanelOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          (
        <div
          className={`map-selected-panel fixed z-[9999] w-[min(560px,calc(100vw-24px))] overflow-hidden rounded-[34px] border border-white/[0.80] bg-white/[0.96] shadow-[0_34px_100px_rgba(15,23,42,0.34)] ring-1 ring-slate-200/70 backdrop-blur-2xl dark:border-slate-700/80 dark:bg-slate-950/[0.96] dark:ring-white/10 ${
            dragState ? 'select-none ring-2 ring-brand-blue/30' : ''
          }`}
          style={{
            left: `${selectedPanelPosition.x}px`,
            top: `${selectedPanelPosition.y}px`,
            zIndex: 99999,
          }}
        >
          <div
            role="button"
            tabIndex={0}
            onMouseDown={handleStartPanelDrag}
            onTouchStart={handleStartPanelDrag}
            className="relative flex cursor-move items-start justify-between gap-3 overflow-hidden border-b border-slate-200/80 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.16),transparent_42%),linear-gradient(135deg,#f8fafc,#ffffff_58%,#eff6ff)] px-5 py-4 dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.14),transparent_42%),linear-gradient(135deg,#020617,#0f172a_58%,#082f49)]"
            title="Drag this panel"
          >
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-brand-blue shadow-sm dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                <Crosshair className="h-3.5 w-3.5" />
                Selected area
              </div>

              <p className="mt-2 text-sm font-semibold text-brand-muted dark:text-slate-400">
                Drag this panel anywhere on the screen.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedPanelOpen(false)}
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-brand-muted transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Close selected barangay panel"
            >
              ×
            </button>
          </div>

          <div className="max-h-[calc(100vh-150px)] overflow-y-auto p-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-muted dark:text-slate-500">
              Selected barangay
            </p>

            <h3 className="mt-2 break-words text-3xl font-black tracking-tight text-brand-blue dark:text-blue-300">
              {selectedLabel}
            </h3>

            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className={`inline-flex rounded-full border px-3 py-1.5 text-sm font-black ${getRiskBadgeStyle(details?.risk)}`}
              >
                {getRiskLabel(details?.risk)}
              </span>

              <span
                className={`inline-flex rounded-full border px-3 py-1.5 text-sm font-black ${getPriorityBadgeStyle(selectedPriority)}`}
              >
                {selectedPriority}
              </span>

              <span
                className={`inline-flex rounded-full border px-3 py-1.5 text-sm font-black ${getHotspotBadgeStyle(selectedHotspot?.hotspot_level)}`}
              >
                {getHotspotLevelLabel(selectedHotspot?.hotspot_level)}
              </span>
            </div>

            <div className="map-mobile-selected-metrics mt-5 grid gap-3 sm:grid-cols-2">
              {selectedMetrics.map((metric) => {
                const Icon = metric.icon

                return (
                  <div
                    key={metric.label}
                    className="group relative min-h-[144px] overflow-hidden rounded-[26px] border border-white/[0.80] bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.10),transparent_42%),linear-gradient(145deg,#ffffff,#f8fafc_68%,#eff6ff)] p-4 shadow-[0_14px_38px_rgba(15,23,42,0.07)] ring-1 ring-slate-200/60 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_50px_rgba(15,23,42,0.12)] dark:border-slate-800/80 dark:bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.10),transparent_42%),linear-gradient(145deg,#0f172a,#020617_70%,#082f49)] dark:ring-white/5"
                  >
                    <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-cyan-300/10 blur-3xl transition group-hover:scale-125" />
                    <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-cyan-500 via-blue-500 to-transparent" />
                    <div
                      className={`relative mb-3 flex h-11 w-11 items-center justify-center rounded-[17px] border shadow-sm ${metric.tone}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    <p className="text-xs font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                      {metric.label}
                    </p>

                    <p className="mt-2 text-base font-black leading-7 text-brand-text dark:text-slate-100">
                      {metric.value}
                    </p>
                  </div>
                )
              })}
            </div>

            <div className={`mt-4 rounded-[26px] border p-5 shadow-sm ${
              selectedNeedsMapReview
                ? 'border-blue-200 bg-gradient-to-br from-blue-50 via-white to-sky-50 dark:border-blue-500/25 dark:from-blue-500/10 dark:via-slate-900 dark:to-slate-950'
                : 'border-violet-100 bg-gradient-to-br from-violet-50 via-white to-blue-50 dark:border-violet-500/20 dark:from-violet-500/10 dark:via-slate-900 dark:to-slate-950'
            } dark:shadow-none`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className={`text-sm font-black uppercase tracking-[0.14em] ${
                    selectedNeedsMapReview
                      ? 'text-blue-700 dark:text-blue-300'
                      : 'text-violet-700 dark:text-violet-300'
                  }`}>
                    {selectedNeedsMapReview ? 'Map name check needed' : 'Hotspot check'}
                  </p>

                  <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted dark:text-slate-300">
                    {selectedNeedsMapReview
                      ? 'This barangay has dengue records, but it is not included in the normal hotspot ranking until the barangay name matches the barangay map.'
                      : 'This checks whether nearby barangays may affect this barangay’s dengue priority. If no barangay is inside the selected distance, the nearest barangay is shown only as supporting reference.'}
                  </p>
                </div>

                <span
                  className={`w-fit rounded-full border px-3 py-1.5 text-sm font-black ${getHotspotBadgeStyle(selectedHotspot?.hotspot_level)}`}
                >
                  {getHotspotLevelLabel(selectedHotspot?.hotspot_level)}
                </span>
              </div>

              {selectedHotspot ? (
                selectedNeedsMapReview ? (
                  <>
                    <div className="mt-4 rounded-[22px] border border-blue-100 bg-white/[0.85] p-4 shadow-sm dark:border-blue-500/20 dark:bg-slate-950/70">
                      <p className="text-sm font-black text-blue-700 dark:text-blue-300">
                        Important interpretation
                      </p>

                      <p className="mt-2 text-base font-semibold leading-7 text-brand-text dark:text-slate-200">
                        {getMapReviewMessage(selectedHotspot)} Do not treat this as a low-priority result. Review the barangay name match first, then run the hotspot check again.
                      </p>
                    </div>

                    <div className="map-mobile-field-grid-3 mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-[20px] border border-white/[0.80] bg-white/[0.85] p-4 dark:border-slate-700 dark:bg-slate-950/70">
                        <p className="text-xs font-black uppercase tracking-[0.12em] text-brand-muted dark:text-slate-400">
                          Dengue cases
                        </p>
                        <p className="mt-2 text-2xl font-black text-brand-text dark:text-slate-100">
                          {formatNumber(selectedHotspot.total_cases || details?.totalCases || details?.cases || 0)}
                        </p>
                      </div>

                      <div className="rounded-[20px] border border-white/[0.80] bg-white/[0.85] p-4 dark:border-slate-700 dark:bg-slate-950/70">
                        <p className="text-xs font-black uppercase tracking-[0.12em] text-brand-muted dark:text-slate-400">
                          Local risk before map name check
                        </p>
                        <p className="mt-2 text-2xl font-black text-brand-text dark:text-slate-100">
                          {formatHotspotScore(selectedHotspot.base_risk_score)}
                        </p>
                      </div>

                      <div className="rounded-[20px] border border-white/[0.80] bg-white/[0.85] p-4 dark:border-slate-700 dark:bg-slate-950/70">
                        <p className="text-xs font-black uppercase tracking-[0.12em] text-brand-muted dark:text-slate-400">
                          Map status
                        </p>
                        <p className="mt-2 text-base font-black leading-6 text-brand-text dark:text-slate-100">
                          Map name not matched
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-[20px] border border-blue-100 bg-white/[0.85] p-4 text-base leading-7 text-brand-muted dark:border-blue-500/20 dark:bg-slate-950/70 dark:text-slate-300">
                      <span className="font-black text-brand-text dark:text-slate-100">
                        Why this is not ranked as a normal hotspot:
                      </span>{' '}
                      The system cannot calculate the map center point, nearby distance, or nearby barangay effect until the map name match is fixed.
                    </div>

                    <div className="mt-3 rounded-[20px] border border-blue-100 bg-white/[0.85] p-4 text-base leading-7 text-brand-muted dark:border-blue-500/20 dark:bg-slate-950/70 dark:text-slate-300">
                      <span className="font-black text-brand-text dark:text-slate-100">
                        Recommended field action:
                      </span>{' '}
                      {selectedHotspot.recommended_map_action || 'Correct the barangay name or map match before using this area for hotspot decisions.'}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-[20px] border border-white/[0.80] bg-white/[0.85] p-4 dark:border-slate-700 dark:bg-slate-950/70">
                        <p className="text-xs font-black uppercase tracking-[0.12em] text-brand-muted dark:text-slate-400">
                          Hotspot score
                        </p>
                        <p className="mt-2 text-2xl font-black text-brand-text dark:text-slate-100">
                          {formatHotspotScore(selectedHotspot.hotspot_score)}
                        </p>
                      </div>

                      <div className="rounded-[20px] border border-white/[0.80] bg-white/[0.85] p-4 dark:border-slate-700 dark:bg-slate-950/70">
                        <p className="text-xs font-black uppercase tracking-[0.12em] text-brand-muted dark:text-slate-400">
                          Nearby barangay effect
                        </p>
                        <p className="mt-2 text-2xl font-black text-brand-text dark:text-slate-100">
                          {formatHotspotScore(selectedHotspot.neighbor_influence_score)}
                        </p>
                      </div>

                      <div className="rounded-[20px] border border-white/[0.80] bg-white/[0.85] p-4 dark:border-slate-700 dark:bg-slate-950/70">
                        <p className="text-xs font-black uppercase tracking-[0.12em] text-brand-muted dark:text-slate-400">
                          Nearby barangay used
                        </p>
                        <p className="mt-2 text-base font-black leading-6 text-brand-text dark:text-slate-100">
                          {getHotspotInfluenceLabel(selectedHotspot)}
                        </p>
                      </div>
                    </div>

                    <p className="mt-4 text-base font-semibold leading-7 text-brand-text dark:text-slate-200">
                      {getHotspotReason(selectedHotspot)}
                    </p>

                    <div className="mt-3 rounded-[20px] border border-white/[0.80] bg-white/[0.85] p-4 text-base leading-7 text-brand-muted dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300">
                      <span className="font-black text-brand-text dark:text-slate-100">
                        Nearby barangay rule:
                      </span>{' '}
                      {getHotspotInfluenceNote(selectedHotspot)}
                    </div>

                    <div className="mt-3 rounded-[20px] border border-white/[0.80] bg-white/[0.85] p-4 text-base leading-7 text-brand-muted dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300">
                      <span className="font-black text-brand-text dark:text-slate-100">
                        Recommended field action:
                      </span>{' '}
                      {selectedHotspot.recommended_map_action || 'Continue routine monitoring.'}
                    </div>
                  </>
                )
              ) : (
                <div className="mt-4 rounded-[20px] border border-white/[0.80] bg-white/[0.85] p-4 text-base leading-7 text-brand-muted shadow-sm dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300">
                  Run the hotspot check to show nearby barangay effect, hotspot score, and field action guidance for this area.
                </div>
              )}
            </div>

            <div className="mt-4 rounded-[24px] border border-amber-100 bg-gradient-to-br from-amber-50 via-orange-50 to-white p-4 shadow-sm dark:border-amber-500/20 dark:from-amber-500/10 dark:via-slate-900 dark:to-slate-950 dark:shadow-none">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.14em] text-brand-orange dark:text-amber-300">
                    Recommended response
                  </p>

                  <p className="mt-1 text-sm font-semibold leading-6 text-brand-muted dark:text-slate-400">
                    Based on forecast, trend, risk level, rainfall, temperature, humidity, population count, and density.
                  </p>
                </div>

                <span
                  className={`w-fit rounded-full border px-3 py-1 text-[11px] font-black ${getPriorityBadgeStyle(selectedPriority)}`}
                >
                  {selectedPriority}
                </span>
              </div>

              <p className="mt-3 text-base font-semibold leading-7 text-brand-text dark:text-slate-200">
                {selectedRecommendation}
              </p>

              {selectedActionPlan.length > 0 && (
                <div className="mt-4 rounded-[20px] border border-white/[0.80] bg-white/[0.80] p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400">
                    Response plan
                  </p>

                  <div className="mt-3 space-y-2">
                    {selectedActionPlan.slice(0, 8).map((action, index) => (
                      <div
                        key={`${action}-${index}`}
                        className="flex gap-3 text-base leading-7 text-brand-text dark:text-slate-300"
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

              {selectedRationale.length > 0 && (
                <div className="mt-3 rounded-[20px] border border-white/[0.80] bg-white/[0.80] p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400">
                    Why this is recommended
                  </p>

                  <div className="mt-3 space-y-2">
                    {selectedRationale.slice(0, 8).map((reason, index) => (
                      <div
                        key={`${reason}-${index}`}
                        className="flex gap-3 text-sm leading-6 text-brand-muted dark:text-slate-400"
                      >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green dark:text-emerald-300" />
                        <span>{reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-brand-muted dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <span className="font-black text-brand-text dark:text-slate-200">
                  Map match:
                </span>{' '}
                {selectedBoundaryFeature ? 'Matched to barangay map' : 'Needs map name check'}
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-brand-muted dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <span className="font-black text-brand-text dark:text-slate-200">
                  Population:
                </span>{' '}
                {selectedPopulationRow || selectedPopulation > 0
                  ? 'Available'
                  : 'Pending population data'}
              </div>
            </div>
          </div>
        </div>
        ),
        document.body
      )}

      <section className="premium-map-hero relative isolate min-h-[520px] overflow-hidden rounded-[38px] border border-slate-900/10 bg-[#061321] shadow-[0_34px_96px_rgba(2,6,23,0.30)] ring-1 ring-white/10 dark:border-white/10 sm:rounded-[42px]">
        <img
          src={mapHeroBackground}
          alt=""
          aria-hidden="true"
          draggable="false"
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-center opacity-95"
          style={{ objectPosition: '58% center' }}
        />

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,rgba(2,6,23,0.98)_0%,rgba(4,18,33,0.94)_36%,rgba(4,18,33,0.62)_62%,rgba(2,6,23,0.20)_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_73%_24%,rgba(56,189,248,0.22),transparent_28%),radial-gradient(circle_at_92%_88%,rgba(16,185,129,0.17),transparent_30%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-slate-950/[0.92] to-transparent" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.13] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:42px_42px]" />
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/[0.70] to-transparent" />

        <div className="relative z-10 grid min-h-[520px] gap-9 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(330px,0.62fr)] lg:items-center lg:p-10 xl:min-h-[550px] xl:p-12">
          <div className="max-w-[780px]">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100 shadow-lg backdrop-blur-xl">
                <Radar className="h-3.5 w-3.5" />
                Geospatial command center
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-200 backdrop-blur-xl">
                <span className={`h-2 w-2 rounded-full ${realHotspotReady ? 'bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.9)]' : hasBoundaryData ? 'bg-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.9)]' : 'bg-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.9)]'}`} />
                {realHotspotReady ? 'Hotspot engine ready' : hasBoundaryData ? 'Map layer online' : 'Awaiting map data'}
              </div>
            </div>

            <h1 className="mt-6 max-w-3xl text-[2.2rem] font-black leading-[1.03] tracking-[-0.05em] text-white drop-shadow-[0_6px_26px_rgba(2,6,23,0.70)] sm:text-[3.15rem] xl:text-[3.75rem]">
              Turn barangay risk into a clear spatial response.
            </h1>

            <p className="mt-5 max-w-2xl text-sm font-medium leading-7 text-slate-200/[0.92] sm:text-[15px] sm:leading-8">
              {realHotspotReady
                ? 'Review dengue pressure, nearby barangay influence, hotspot concentration, and map-based response priorities from one coordinated view.'
                : usingMultiSourceRisk
                  ? 'Explore barangay risk using dengue cases, weather pressure, population exposure, density, and the uploaded map boundary.'
                  : usingBackendForecast
                    ? 'Explore saved forecast results across Butuan barangays and connect each risk result to its geographic area.'
                    : 'Upload and validate dengue records and barangay boundaries to activate risk colors, hotspot analysis, and response guidance.'}
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => document.getElementById('hotspot-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                style={{ background: '#ffffff', backgroundImage: 'none', color: '#0f172a' }}
                className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-2xl border border-white px-5 py-3 text-sm font-black shadow-[0_16px_38px_rgba(255,255,255,0.18)] transition duration-200 hover:-translate-y-0.5 hover:opacity-95"
              >
                Explore barangay map
                <MapPinned className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={handleRunHotspotAnalysis}
                disabled={isLoadingHotspots || !hasBoundaryData}
                className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.08] px-5 py-3 text-sm font-black text-white shadow-lg backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-55"
              >
                <Radar className={`h-4 w-4 ${isLoadingHotspots ? 'animate-spin' : ''}`} />
                {isLoadingHotspots ? 'Checking hotspots...' : 'Run hotspot check'}
              </button>
            </div>

            <div className="map-mobile-hero-grid mt-8 grid max-w-3xl grid-cols-2 gap-2.5 sm:grid-cols-4">
              {[
                { label: 'Mapped areas', value: formatNumber(boundaryFeatureCount || displayRiskRows.length), icon: MapPinned },
                { label: 'High risk', value: formatNumber(highRiskCount), icon: ShieldAlert },
                { label: realHotspotReady ? 'Priority hotspots' : 'Hotspots', value: realHotspotReady ? formatNumber(hotspotPriorityCount) : 'Not calculated', icon: Radar },
                { label: 'Periods used', value: formatNumber(displayPeriodCount), icon: BarChart3 },
              ].map((item) => {
                const Icon = item.icon

                return (
                  <div
                    key={item.label}
                    className="group relative overflow-hidden rounded-[20px] border border-white/10 bg-slate-950/[0.38] p-3.5 shadow-lg backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-cyan-300/20 hover:bg-slate-950/[0.48]"
                  >
                    <div className="pointer-events-none absolute -right-7 -top-7 h-16 w-16 rounded-full bg-cyan-300/10 blur-2xl transition group-hover:scale-125" />
                    <div className="relative flex items-center gap-2 text-slate-300">
                      <Icon className="h-3.5 w-3.5 text-cyan-200" />
                      <span className="text-[9px] font-black uppercase tracking-[0.15em]">{item.label}</span>
                    </div>
                    <p className="relative mt-2 text-lg font-black tracking-tight text-white">{item.value}</p>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="w-full self-end justify-self-end lg:max-w-[400px]">
            <div className="relative overflow-hidden rounded-[30px] border border-white/15 bg-slate-950/[0.62] p-5 text-white shadow-[0_28px_76px_rgba(2,6,23,0.52)] ring-1 ring-white/5 backdrop-blur-2xl sm:p-6">
              <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-cyan-300/15 blur-3xl" />
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/60 to-transparent" />

              <div className="relative flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/75">Selected map area</p>
                  <h2 className="mt-2 truncate text-2xl font-black tracking-[-0.03em]">{selectedLabel}</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-400">Current view: {activeMapStyle.label}</p>
                </div>

                <div
                  className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full p-[6px] shadow-[0_0_38px_rgba(56,189,248,0.20)]"
                  style={{
                    background: `conic-gradient(#22d3ee ${selectedHeroScore * 3.6}deg, rgba(255,255,255,0.10) 0deg)`,
                  }}
                >
                  <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-white/10 bg-[#071525]">
                    <span className="text-xl font-black leading-none">{formatNumber(selectedHeroScore)}</span>
                    <span className="mt-1 text-[8px] font-black uppercase tracking-[0.14em] text-cyan-100/70">{selectedHeroScoreLabel}</span>
                  </div>
                </div>
              </div>

              <div className="relative mt-5 grid grid-cols-2 gap-2.5">
                <div className="rounded-[18px] border border-white/10 bg-white/[0.06] p-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Risk level</p>
                  <p className="mt-1 text-sm font-black text-white">{details?.risk || 'Pending'}</p>
                </div>
                <div className="rounded-[18px] border border-white/10 bg-white/[0.06] p-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Hotspot level</p>
                  <p className="mt-1 truncate text-sm font-black text-white">{getHotspotLevelLabel(selectedHotspot?.hotspot_level)}</p>
                </div>
              </div>

              <div className="relative mt-3 rounded-[20px] border border-white/10 bg-white/[0.045] p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Boundary file</p>
                    <p className="mt-1 truncate text-xs font-bold text-slate-200">{sourceStatus?.boundary?.uploadedName || 'No boundary file uploaded yet'}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-[10px] font-black text-cyan-100">
                    {formatNumber(boundaryFeatureCount || sourceStatus?.boundary?.validCount || 0)} areas
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsMapExpanded((current) => !current)}
                className="relative mt-4 inline-flex w-full items-center justify-between rounded-[18px] border border-cyan-300/15 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-50 transition hover:bg-cyan-300/15"
              >
                {isMapExpanded ? 'Return to compact map' : 'Expand map workspace'}
                {isMapExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div
        className={
          isMapExpanded
            ? 'grid gap-6'
            : 'grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.75fr)]'
        }
      >
        <div
          id="hotspot-map"
          className={
            isMapExpanded
              ? 'scroll-mt-28 relative overflow-hidden rounded-[36px] border border-white/[0.80] bg-white/[0.94] p-3 shadow-[0_26px_78px_rgba(15,23,42,0.10)] ring-1 ring-slate-200/60 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-950/[0.88] dark:ring-white/5 sm:p-4'
              : 'scroll-mt-28 relative overflow-hidden rounded-[36px] border border-white/[0.80] bg-white/[0.94] p-4 shadow-[0_26px_78px_rgba(15,23,42,0.10)] ring-1 ring-slate-200/60 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-950/[0.88] dark:ring-white/5 sm:p-5'
          }
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                <MapPinned className="h-3.5 w-3.5" />
                Map view
              </div>

              <h2 className="text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
                {showingHotspotLayer ? 'Barangay GIS hotspot map' : 'Barangay forecast risk map'}
              </h2>

              <p className="mt-1 max-w-3xl text-sm leading-6 text-brand-muted dark:text-slate-400">
                {showingHotspotLayer
                  ? 'Polygons are colored by GIS hotspot class using local risk, nearby barangay influence, and spatial concentration.'
                  : usingMultiSourceRisk
                    ? 'Polygons are colored by forecast risk using dengue, weather, population, and density information.'
                    : usingBackendForecast
                      ? 'Polygons are colored by the saved four-period forecast risk classification.'
                      : 'Barangay areas are visible now. Forecast risk colors appear after dengue records are processed.'}
              </p>
            </div>

            <div
              className={`w-fit rounded-full border px-3 py-1.5 text-[11px] font-black ${getMapStatusStyle(
                hasRiskData,
                hasBoundaryData
              )}`}
            >
              {showingHotspotLayer
                ? 'Hotspot colors ready'
                : hasRiskData
                  ? 'Forecast risk colors ready'
                  : getMapStatusLabel(hasRiskData, hasBoundaryData)}
            </div>
          </div>

          <div className="relative mt-5 overflow-hidden rounded-[32px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.13),transparent_36%),linear-gradient(145deg,#f8fafc,#ffffff_58%,#eff6ff)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_18px_46px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.10),transparent_36%),linear-gradient(145deg,#020617,#0f172a_58%,#082f49)]">
            <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.16em] text-brand-muted dark:text-slate-500">
                  Barangay monitoring map
                </div>

                <p className="mt-1 text-sm font-semibold leading-6 text-brand-muted dark:text-slate-500">
                  Current map view: {activeMapStyle.label}
                </p>
              </div>

              <div className="flex flex-col gap-2 xl:items-end">
                <div className="flex flex-wrap gap-2">
                  <div className="w-fit rounded-full bg-white px-3 py-1 text-[11px] font-bold text-brand-muted shadow-sm dark:bg-slate-800 dark:text-slate-300 dark:shadow-none">
                    {hasBoundaryData ? 'Barangay map available' : 'Map file pending'}
                  </div>

                  <div className="w-fit rounded-full bg-white px-3 py-1 text-[11px] font-bold text-brand-muted shadow-sm dark:bg-slate-800 dark:text-slate-300 dark:shadow-none">
                    {showingHotspotLayer
                      ? 'Hotspot colors active'
                      : hasRiskData
                        ? 'Forecast risk colors active'
                        : 'Map only, no risk colors'}
                  </div>

                  <div className="w-fit rounded-full bg-white px-3 py-1 text-[11px] font-bold text-brand-muted shadow-sm dark:bg-slate-800 dark:text-slate-300 dark:shadow-none">
                    {realHotspotReady ? 'Hotspot check ready' : 'Hotspot check not yet run'}
                  </div>
                </div>

                {renderMapControls()}
              </div>
            </div>

            {mapContent}
          </div>

          {hotspotError && (
            <div className="mt-4 rounded-[24px] border border-amber-100 bg-amber-50/80 p-4 text-sm leading-6 text-brand-orange shadow-sm dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              {hotspotError}
            </div>
          )}

          <div className="mt-4 overflow-hidden rounded-[28px] border border-white/[0.80] bg-white/[0.92] shadow-[0_16px_46px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/60 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/[0.78] dark:ring-white/5">
            <button
              type="button"
              onClick={() => setLegendOpen((current) => !current)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-brand-muted dark:text-slate-400">
                  {showingHotspotLayer ? 'GIS hotspot color guide' : 'Dengue forecast risk color guide'}
                </p>

                <p className="mt-0.5 text-xs text-brand-muted dark:text-slate-500">
                  {showingHotspotLayer
                    ? 'Colors represent spatial hotspot classifications after the GIS check.'
                    : 'Colors represent Low, Moderate, and High four-period forecast risk.'}
                </p>
              </div>

              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {legendOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </span>
            </button>

            {legendOpen && (
              <div className={`map-mobile-legend-grid grid gap-3 border-t border-slate-100 px-4 py-4 dark:border-slate-800 ${showingHotspotLayer ? 'sm:grid-cols-2 xl:grid-cols-5' : 'sm:grid-cols-3'}`}>
                {activeLegendItems.map((item) => {
                  const Icon = item.icon

                  return (
                    <div
                      key={item.key}
                      className="group relative overflow-hidden rounded-[22px] border border-white/[0.80] bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.08),transparent_45%),linear-gradient(145deg,#ffffff,#f8fafc)] p-3 shadow-[0_10px_28px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/55 transition hover:-translate-y-0.5 hover:shadow-[0_16px_38px_rgba(15,23,42,0.11)] dark:border-slate-800 dark:bg-[linear-gradient(145deg,#0f172a,#020617)] dark:ring-white/5 before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-gradient-to-r before:from-cyan-500 before:via-blue-500 before:to-transparent"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-3 w-3 rounded-full ${item.dot}`} />

                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${item.badge}`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {item.label}
                        </span>
                      </div>

                      <p className="mt-2 text-xs font-black text-brand-text dark:text-slate-100">
                        {item.description}
                      </p>

                      <p className="mt-1 text-xs text-brand-muted dark:text-slate-400">
                        {formatNumber(item.count)} barangay{item.count === 1 ? '' : 's'}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <p className="mt-3 text-xs font-semibold leading-5 text-brand-muted dark:text-slate-400">
            {hasRiskData
              ? 'Click a barangay area on the map to open a movable details panel.'
              : hasBoundaryData
                ? 'Barangay map areas are now visible. Upload or check dengue records to color barangays by risk level.'
                : 'The map will become interactive after the barangay map file and dengue records are uploaded.'}
          </p>

          <div className="group relative mt-4 overflow-hidden rounded-[26px] border border-amber-200/70 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.16),transparent_42%),linear-gradient(145deg,#fffbeb,#ffffff_64%,#fff7ed)] p-4 shadow-[0_14px_38px_rgba(245,158,11,0.09)] ring-1 ring-amber-100/70 dark:border-amber-500/25 dark:bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_42%),linear-gradient(145deg,#1c1917,#020617)] dark:ring-amber-500/10">
            <p className="flex items-center gap-2 text-sm font-black text-brand-orange dark:text-amber-300">
              <Layers3 className="h-4 w-4" />
              Barangay map note
            </p>

            <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
              {hasBoundaryData
                ? `Current map file: ${sourceStatus?.boundary?.uploadedName || 'Uploaded boundary file'}`
                : 'No official barangay map file has been uploaded yet. Upload the prepared Butuan barangay map file to enable map coloring.'}
            </p>

            {hasBoundaryData && (
              <div className="mt-2 grid gap-1 text-sm font-semibold text-brand-muted dark:text-slate-500 sm:grid-cols-3">
                <p>Boundaries loaded: {formatNumber(boundaryFeatureCount || sourceStatus?.boundary?.validCount || 0)}</p>
                <p>Matched to active layer: {formatNumber(activeMatchedBoundaryCount)}</p>
                <p>Needs name review: {formatNumber(activeUnmatchedRowCount)}</p>
                {showingHotspotLayer && (
                  <p className="sm:col-span-3">
                    Official barangays accounted for: {formatNumber(hotspotCountTotal)} of {formatNumber(displayRiskRows.length)}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div
          className={
            isMapExpanded
              ? 'grid items-start gap-5 lg:grid-cols-[0.75fr_1fr]'
              : 'space-y-5'
          }
        >
          <div
            className={`group relative self-start overflow-hidden rounded-[32px] border border-cyan-400/20 bg-black shadow-[0_28px_78px_rgba(2,6,23,0.30)] ring-1 ring-white/10 ${
              isMapExpanded
                ? 'h-[min(680px,calc(100vh-180px))] min-h-[520px]'
                : 'h-[360px]'
            }`}
          >
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <img
                src={gisGlobalNetworkGif}
                alt="Barangay map monitoring animation"
                className="h-full w-full object-cover object-center opacity-95"
              />
            </div>

            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.20)_55%,rgba(0,0,0,0.85)_100%)]" />

            <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white/90 backdrop-blur">
                <Navigation className="h-3.5 w-3.5" />
                Live map view
              </div>

              <h3 className="text-lg font-black tracking-tight text-white">
                Barangay details view
              </h3>

              <p className="mt-1 max-w-md text-sm leading-6 text-white/75">
                Select a barangay on the map to open its risk profile, hotspot score, nearby barangay effect, response plan, and reason for the recommendation.
              </p>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[36px] border border-white/[0.80] bg-white/[0.94] p-5 shadow-[0_26px_78px_rgba(15,23,42,0.10)] ring-1 ring-slate-200/60 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-950/[0.88] dark:ring-white/5 sm:p-6">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              <Navigation className="h-3.5 w-3.5" />
              Priority barangays
            </div>

            <h2 className="text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
              {showingHotspotLayer ? 'Hotspot summary' : 'Forecast priority summary'}
            </h2>

            <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
              {showingHotspotLayer
                ? 'Top barangays are ranked using hotspot score, nearby barangay effects, and barangay map matching.'
                : usingMultiSourceRisk
                  ? 'Top barangays are ranked by risk level, combined multi-source score, response priority, and expected cases.'
                  : usingBackendForecast
                    ? 'Top barangays are ranked by risk level, combined multi-source score, response priority, and expected cases.'
                    : 'Top barangays will appear after risk levels are calculated.'}
            </p>

            <div className="mt-5 space-y-3">
              {summary.length > 0 ? (
                summary.map((row, index) => (
                  <button
                    key={row.barangay}
                    type="button"
                    onClick={() => handleSelectBarangay(row.barangay)}
                    className={`group relative flex w-full flex-col gap-3 overflow-hidden rounded-[26px] border px-4 py-4 text-left shadow-[0_12px_34px_rgba(15,23,42,0.06)] transition-all duration-300 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-gradient-to-b before:from-cyan-500 before:via-blue-500 before:to-indigo-500 sm:flex-row sm:items-center sm:justify-between ${
                      namesMatch(selected, row.barangay)
                        ? 'border-blue-300 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_42%),linear-gradient(145deg,#eff6ff,#ffffff_58%,#ecfeff)] ring-2 ring-blue-500/20 shadow-[0_18px_46px_rgba(37,99,235,0.15)] dark:border-blue-500/45 dark:bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.18),transparent_42%),linear-gradient(145deg,#0f172a,#020617_65%,#082f49)] dark:ring-blue-500/20'
                        : 'border-slate-200/80 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.09),transparent_42%),linear-gradient(145deg,#ffffff,#f8fafc_68%,#eff6ff)] hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_18px_46px_rgba(15,23,42,0.12)] dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.08),transparent_42%),linear-gradient(145deg,#0f172a,#020617_68%,#082f49)] dark:hover:border-blue-500/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white shadow-sm dark:bg-white dark:text-slate-950">
                        {index + 1}
                      </div>

                      <div>
                        <span className="font-black text-brand-text dark:text-slate-100">
                          {row.barangay}
                        </span>

                        <p className="text-xs font-semibold text-brand-muted dark:text-slate-400">
                          {showingHotspotLayer
                            ? `Hotspot score: ${formatHotspotScore(row.hotspot_score)}`
                            : `Forecast: ${formatNumber(row.forecast)} cases`}
                        </p>

                        <p className="mt-0.5 text-xs font-semibold text-brand-muted dark:text-slate-500">
                          {showingHotspotLayer
                            ? `Nearby barangay effect: ${formatHotspotScore(row.neighbor_influence_score)}`
                            : `Overall risk score: ${formatRiskScore(getOverallRiskScore(row))}`}
                        </p>

                        <p className="mt-0.5 text-xs font-semibold text-brand-muted dark:text-slate-500">
                          {showingHotspotLayer
                            ? getHotspotInfluenceLabel(row)
                            : row.responsePriority || row.decisionSupport?.priority || 'Response pending'}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`w-fit rounded-full border px-3 py-1 text-xs font-black ${
                        showingHotspotLayer
                          ? getHotspotBadgeStyle(row.hotspot_level)
                          : getRiskBadgeStyle(row.risk)
                      }`}
                    >
                      {showingHotspotLayer ? getHotspotLevelLabel(row.hotspot_level) : row.risk}
                    </span>
                  </button>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-brand-muted dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                  {hasBoundaryData
                    ? 'The barangay map is available. Upload dengue records to generate the hotspot summary.'
                    : 'No hotspot summary is available yet. Upload dengue records and the barangay map file first.'}
                </div>
              )}
            </div>

            {showingHotspotLayer && mapReviewRows.length > 0 && (
              <div className="relative mt-5 overflow-hidden rounded-[28px] border border-blue-200/70 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.15),transparent_42%),linear-gradient(145deg,#eff6ff,#ffffff_60%,#ecfeff)] p-4 shadow-[0_16px_44px_rgba(37,99,235,0.10)] ring-1 ring-blue-100/70 dark:border-blue-500/25 dark:bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.12),transparent_42%),linear-gradient(145deg,#082f49,#020617)] dark:ring-blue-500/10">
                <p className="flex items-center gap-2 text-sm font-black text-blue-700 dark:text-blue-300">
                  <AlertTriangle className="h-4 w-4" />
                  Barangays needing map name review
                </p>

                <p className="mt-2 text-sm leading-6 text-brand-muted dark:text-slate-400">
                  These barangays are separated from the normal hotspot ranking because the system cannot match them to the barangay map yet. They may still need urgent attention based on dengue records.
                </p>

                <div className="mt-3 space-y-2">
                  {mapReviewRows.map((row) => (
                    <button
                      key={`map-review-${row.barangay}`}
                      type="button"
                      onClick={() => handleSelectBarangay(row.barangay)}
                      className={`w-full rounded-[20px] border px-4 py-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                        namesMatch(selected, row.barangay)
                          ? 'border-blue-300 bg-blue-100/80 ring-2 ring-blue-500/20 dark:border-blue-500/40 dark:bg-blue-500/15'
                          : 'border-blue-100 bg-white/[0.85] dark:border-blue-500/20 dark:bg-slate-950/70'
                      }`}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-base font-black text-brand-text dark:text-slate-100">
                            {row.barangay}
                          </p>

                          <p className="mt-1 text-sm font-semibold leading-6 text-brand-muted dark:text-slate-400">
                            Dengue cases: {formatNumber(row.total_cases || 0)} • Local risk before map name check: {formatHotspotScore(row.base_risk_score)}
                          </p>

                          <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                            {getMapReviewMessage(row)}
                          </p>
                        </div>

                        <span className={`w-fit rounded-full border px-3 py-1.5 text-xs font-black ${getHotspotBadgeStyle(row.hotspot_level)}`}>
                          {getMapReviewPriorityText(row)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="group relative mt-5 overflow-hidden rounded-[26px] border border-blue-200/70 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.15),transparent_42%),linear-gradient(145deg,#eff6ff,#ffffff_64%,#ecfeff)] p-4 shadow-[0_14px_38px_rgba(37,99,235,0.09)] ring-1 ring-blue-100/70 dark:border-blue-500/25 dark:bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.12),transparent_42%),linear-gradient(145deg,#0f172a,#020617)] dark:ring-blue-500/10">
              <p className="flex items-center gap-2 text-sm font-black text-brand-blue dark:text-blue-300">
                <MapPinned className="h-4 w-4" />
                Map note
              </p>

              <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                {showingHotspotLayer
                  ? 'The GIS hotspot layer uses each barangay’s local risk, nearby barangay effect, spatial concentration, and boundary match status.'
                  : hasRiskData
                    ? usingMultiSourceRisk
                      ? 'The hotspot map is using dengue case trend, weather factors, population count, density, response guidance, and uploaded barangay map areas.'
                      : usingBackendForecast
                        ? 'The hotspot map is using saved forecast results, saved recommendations, and uploaded barangay map areas.'
                        : 'The hotspot map is using dengue risk results, response guidance, and uploaded barangay map areas.'
                    : hasBoundaryData
                      ? 'The map is currently showing barangay areas only. Risk colors and response guidance will appear after dengue records are processed.'
                      : 'The hotspot map will become interactive after the system receives the barangay map file and calculates barangay-level risk.'}
              </p>
            </div>

            <div className="group relative mt-4 overflow-hidden rounded-[26px] border border-violet-200/70 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.16),transparent_42%),linear-gradient(145deg,#f5f3ff,#ffffff_64%,#eff6ff)] p-4 shadow-[0_14px_38px_rgba(109,40,217,0.09)] ring-1 ring-violet-100/70 dark:border-violet-500/25 dark:bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.12),transparent_42%),linear-gradient(145deg,#1e1b4b,#020617)] dark:ring-violet-500/10">
              <p className="flex items-center gap-2 text-sm font-black text-violet-700 dark:text-violet-300">
                <Radar className="h-4 w-4" />
                Hotspot check
              </p>

              <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                {realHotspotReady
                  ? `${formatNumber(hotspotPriorityCount)} barangay${hotspotPriorityCount === 1 ? '' : 's'} are confirmed or emerging hotspots. ${formatNumber(hotspotCounts.needsReview)} barangay${Number(hotspotCounts.needsReview || 0) === 1 ? '' : 's'} need map name checking. ${formatNumber(hotspotCountTotal)} of ${formatNumber(displayRiskRows.length)} official barangays are accounted for once.`
                  : 'Click “Run hotspot check” to see hotspot priority and nearby barangay effects.'}
              </p>

              <button
                type="button"
                onClick={handleRunHotspotAnalysis}
                disabled={isLoadingHotspots || !hasBoundaryData}
                className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-violet-700 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white shadow-[0_12px_24px_rgba(109,40,217,0.22)] transition hover:-translate-y-0.5 hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-violet-500 dark:hover:bg-violet-400"
              >
                <Radar className="h-3.5 w-3.5" />
                {isLoadingHotspots ? 'Checking hotspot areas...' : 'Run hotspot check'}
              </button>
            </div>

            <div className="group relative mt-4 overflow-hidden rounded-[26px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_right,rgba(148,163,184,0.13),transparent_42%),linear-gradient(145deg,#f8fafc,#ffffff)] p-4 shadow-[0_14px_38px_rgba(15,23,42,0.07)] ring-1 ring-slate-200/55 dark:border-slate-800 dark:bg-[linear-gradient(145deg,#0f172a,#020617)] dark:ring-white/5">
              <p className="flex items-center gap-2 text-sm font-black text-brand-text dark:text-slate-100">
                <Layers3 className="h-4 w-4 text-brand-blue dark:text-blue-300" />
                Map file
              </p>

              <p className="mt-1 break-words text-sm leading-6 text-brand-muted dark:text-slate-400">
                {sourceStatus?.boundary?.uploadedName || 'No boundary file uploaded yet'}
              </p>

              <div className="mt-2 space-y-1 text-sm font-semibold leading-6 text-brand-muted dark:text-slate-500">
                <p>Boundaries loaded: {formatNumber(boundaryFeatureCount || sourceStatus?.boundary?.validCount || 0)}</p>
                <p>Matched to active layer: {formatNumber(activeMatchedBoundaryCount)}</p>
                <p>Needs name review: {formatNumber(activeUnmatchedRowCount)}</p>
                {showingHotspotLayer && (
                  <p className="sm:col-span-3">
                    Official barangays accounted for: {formatNumber(hotspotCountTotal)} of {formatNumber(displayRiskRows.length)}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`

        .premium-map-hero,
        #hotspot-map,
        .map-selected-panel {
          isolation: isolate;
        }

        .premium-map-hero::after {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
          border-radius: inherit;
        }

        @media (max-width: 639px) {
          .map-mobile-compact,
          .map-mobile-compact * {
            min-width: 0;
            box-sizing: border-box;
          }

          .map-mobile-compact {
            width: 100%;
            max-width: 100vw;
            overflow-x: hidden;
            padding-bottom: 1.25rem !important;
          }

          .map-mobile-compact > .pointer-events-none.absolute {
            display: none !important;
          }

          .map-mobile-compact.space-y-6 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 0.85rem !important;
          }

          .map-mobile-compact section,
          .map-mobile-compact #hotspot-map,
          .map-mobile-compact [class*="rounded-[34px]"],
          .map-mobile-compact [class*="rounded-[36px]"] {
            max-width: 100% !important;
            overflow: hidden !important;
            border-radius: 22px !important;
            padding: 0.85rem !important;
          }

          .map-mobile-compact > section:first-of-type {
            padding: 0.9rem !important;
            border-radius: 22px !important;
            box-shadow: 0 16px 40px rgba(15, 23, 42, 0.22) !important;
          }

          .map-mobile-compact > section:first-of-type .relative.grid {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 0.75rem !important;
          }

          .map-mobile-compact h1 {
            font-size: 1.55rem !important;
            line-height: 1.05 !important;
            letter-spacing: -0.045em !important;
          }

          .map-mobile-compact h2,
          .map-mobile-compact .text-2xl.font-black.tracking-tight {
            font-size: 1.08rem !important;
            line-height: 1.14 !important;
            letter-spacing: -0.035em !important;
          }

          .map-mobile-compact h3,
          .map-mobile-compact .text-xl.font-black,
          .map-mobile-compact .text-lg.font-black {
            font-size: 0.95rem !important;
            line-height: 1.12 !important;
          }

          .map-mobile-compact p {
            font-size: 0.72rem !important;
            line-height: 1.3 !important;
          }

          .map-mobile-compact > section:first-of-type h1 + p {
            margin-top: 0.55rem !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
            font-size: 0.78rem !important;
            line-height: 1.35 !important;
          }

          .map-mobile-compact .inline-flex.items-center.gap-2.rounded-full.border,
          .map-mobile-compact .mb-4.inline-flex,
          .map-mobile-compact .mb-2.inline-flex,
          .map-mobile-compact .mb-3.inline-flex {
            padding: 0.32rem 0.58rem !important;
            font-size: 0.55rem !important;
            letter-spacing: 0.09em !important;
          }

          .map-mobile-hero-grid {
            margin-top: 0.75rem !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 0.48rem !important;
          }

          .map-mobile-hero-grid > div {
            min-height: 76px !important;
            border-radius: 16px !important;
            padding: 0.55rem !important;
          }

          .map-mobile-hero-grid p:first-child {
            font-size: 0.47rem !important;
            line-height: 1.1 !important;
            letter-spacing: 0.065em !important;
          }

          .map-mobile-hero-grid p:nth-child(2) {
            margin-top: 0.35rem !important;
            font-size: 1.12rem !important;
            line-height: 1 !important;
          }

          .map-mobile-hero-grid p:last-child {
            margin-top: 0.2rem !important;
            font-size: 0.55rem !important;
            line-height: 1.16 !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
          }

          .map-mobile-compact > section:first-of-type .rounded-[30px] {
            border-radius: 18px !important;
            padding: 0.7rem !important;
          }

          .map-mobile-compact > section:first-of-type .h-14.w-14,
          .map-mobile-compact > section:first-of-type .h-12.w-12 {
            height: 2.35rem !important;
            width: 2.35rem !important;
            border-radius: 14px !important;
          }

          .map-mobile-compact > section:first-of-type .h-14.w-14 svg,
          .map-mobile-compact > section:first-of-type .h-12.w-12 svg {
            height: 1.05rem !important;
            width: 1.05rem !important;
          }

          .map-mobile-compact > section:first-of-type .mt-5.rounded-[24px] {
            margin-top: 0.65rem !important;
            border-radius: 15px !important;
            padding: 0.6rem !important;
          }

          .map-mobile-compact > section:first-of-type button.mt-5 {
            min-height: 64px !important;
            margin-top: 0.65rem !important;
            border-radius: 16px !important;
            padding: 0.65rem !important;
          }

          .map-mobile-compact > section:first-of-type button.mt-5 .h-12.w-12,
          .map-mobile-compact > section:first-of-type button.mt-5 .h-10.w-10 {
            height: 2rem !important;
            width: 2rem !important;
            border-radius: 12px !important;
          }

          .map-mobile-compact .mt-6 { margin-top: 0.9rem !important; }
          .map-mobile-compact .mt-5 { margin-top: 0.75rem !important; }
          .map-mobile-compact .mt-4 { margin-top: 0.6rem !important; }
          .map-mobile-compact .mt-3 { margin-top: 0.48rem !important; }
          .map-mobile-compact .gap-6 { gap: 0.85rem !important; }
          .map-mobile-compact .gap-5 { gap: 0.7rem !important; }
          .map-mobile-compact .gap-4 { gap: 0.6rem !important; }
          .map-mobile-compact .gap-3 { gap: 0.48rem !important; }

          .map-mobile-compact .grid.gap-6.xl\:grid-cols-\[minmax\(0\,1\.65fr\)_minmax\(340px\,0\.75fr\)\],
          .map-mobile-compact .grid.gap-6 {
            gap: 0.85rem !important;
          }

          .map-mobile-compact #hotspot-map {
            border-radius: 20px !important;
            padding: 0.7rem !important;
          }

          .map-mobile-compact #hotspot-map > .flex,
          .map-mobile-compact #hotspot-map .mb-3.flex {
            gap: 0.55rem !important;
          }

          .map-mobile-compact #hotspot-map .mt-5.overflow-hidden.rounded-[30px] {
            margin-top: 0.65rem !important;
            border-radius: 18px !important;
            padding: 0.6rem !important;
          }

          .map-mobile-compact #hotspot-map .flex.flex-wrap.gap-2 {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 0.35rem !important;
          }

          .map-mobile-compact #hotspot-map .flex.flex-wrap.gap-2 > div,
          .map-mobile-compact #hotspot-map .flex.flex-wrap.gap-2 > span {
            width: 100% !important;
            max-width: 100% !important;
            padding: 0.34rem 0.45rem !important;
            font-size: 0.5rem !important;
            line-height: 1.08 !important;
            text-align: center !important;
            white-space: normal !important;
          }

          .map-mobile-compact #hotspot-map .flex.flex-wrap.items-center.gap-2 {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .map-mobile-compact #hotspot-map .map-layer-toggle,
          .map-mobile-compact #hotspot-map .map-style-toggle {
            display: grid !important;
            width: 100% !important;
            border-radius: 14px !important;
            padding: 0.25rem !important;
            gap: 0.25rem !important;
          }

          .map-mobile-compact #hotspot-map .map-layer-toggle {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .map-mobile-compact #hotspot-map .map-style-toggle {
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          }

          .map-mobile-compact #hotspot-map .map-layer-toggle button,
          .map-mobile-compact #hotspot-map .map-style-toggle button {
            justify-content: center !important;
            gap: 0.2rem !important;
            border-radius: 10px !important;
            padding: 0.42rem 0.25rem !important;
            font-size: 0.5rem !important;
            letter-spacing: 0.055em !important;
          }

          .map-mobile-compact #hotspot-map .map-layer-toggle button svg,
          .map-mobile-compact #hotspot-map .map-style-toggle button svg {
            width: 0.72rem !important;
            height: 0.72rem !important;
          }

          .map-mobile-compact #hotspot-map button.group.inline-flex,
          .map-mobile-compact #hotspot-map button.inline-flex.items-center.gap-2 {
            width: 100% !important;
            min-height: 38px !important;
            justify-content: center !important;
            border-radius: 13px !important;
            padding: 0.5rem !important;
            font-size: 0.55rem !important;
            letter-spacing: 0.06em !important;
          }

          .map-mobile-compact #hotspot-map button.group.inline-flex .h-9.w-9 {
            display: none !important;
          }

          .map-mobile-compact #hotspot-map button.group.inline-flex svg,
          .map-mobile-compact #hotspot-map button.inline-flex.items-center.gap-2 svg {
            width: 0.8rem !important;
            height: 0.8rem !important;
          }

          .map-mobile-compact #hotspot-map .h-[560px],
          .map-mobile-compact #hotspot-map .sm\:h-[680px],
          .map-mobile-compact #hotspot-map .h-[calc(100vh-190px)] {
            height: 420px !important;
            min-height: 420px !important;
            max-height: 420px !important;
            border-radius: 18px !important;
            padding: 0.35rem !important;
          }

          .map-mobile-compact #hotspot-map .h-full.overflow-hidden.rounded-[22px] {
            border-radius: 15px !important;
          }

          .map-mobile-legend-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 0.4rem !important;
            padding: 0.55rem !important;
          }

          .map-mobile-legend-grid > div {
            border-radius: 13px !important;
            padding: 0.45rem !important;
            min-height: 70px !important;
          }

          .map-mobile-legend-grid .inline-flex {
            padding: 0.25rem 0.35rem !important;
            font-size: 0.46rem !important;
            letter-spacing: 0.035em !important;
          }

          .map-mobile-compact .rounded-[26px],
          .map-mobile-compact .rounded-[24px],
          .map-mobile-compact .rounded-[20px] {
            border-radius: 15px !important;
          }

          .map-mobile-compact .p-5,
          .map-mobile-compact .p-4,
          .map-mobile-compact .px-4.py-3,
          .map-mobile-compact .px-4.py-3\.5,
          .map-mobile-compact .p-3 {
            padding: 0.62rem !important;
          }

          .map-mobile-compact .relative.self-start.overflow-hidden.rounded-[30px] {
            height: 205px !important;
            min-height: 205px !important;
            border-radius: 18px !important;
          }

          .map-mobile-compact .relative.self-start.overflow-hidden.rounded-[30px] .absolute.bottom-0 {
            padding: 0.75rem !important;
          }

          .map-mobile-compact .relative.self-start.overflow-hidden.rounded-[30px] p {
            display: -webkit-box !important;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
          }

          .map-mobile-compact .space-y-5 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 0.75rem !important;
          }

          .map-mobile-compact .mt-5.space-y-3 > :not([hidden]) ~ :not([hidden]),
          .map-mobile-compact .mt-3.space-y-2 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 0.48rem !important;
          }

          .map-mobile-compact .mt-5.space-y-3 button {
            border-radius: 15px !important;
            padding: 0.58rem !important;
            gap: 0.45rem !important;
          }

          .map-mobile-compact .mt-5.space-y-3 button .h-10.w-10 {
            height: 1.75rem !important;
            width: 1.75rem !important;
            border-radius: 10px !important;
            font-size: 0.62rem !important;
          }

          .map-mobile-compact .mt-5.space-y-3 button span.font-black {
            font-size: 0.72rem !important;
            line-height: 1.08 !important;
          }

          .map-mobile-compact .mt-5.space-y-3 button p {
            margin-top: 0.1rem !important;
            font-size: 0.58rem !important;
            line-height: 1.14 !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 1;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
          }

          .map-mobile-compact .mt-5.space-y-3 button > span:last-child {
            padding: 0.35rem 0.5rem !important;
            font-size: 0.56rem !important;
          }

          .map-mobile-compact .rounded-[26px].border.border-blue-100,
          .map-mobile-compact .rounded-[24px].border.border-blue-100,
          .map-mobile-compact .rounded-[24px].border.border-violet-100,
          .map-mobile-compact .rounded-[24px].border.border-slate-200,
          .map-mobile-compact .rounded-[24px].border.border-amber-100 {
            padding: 0.62rem !important;
            border-radius: 15px !important;
          }

          .map-mobile-compact .text-2xl { font-size: 1.05rem !important; line-height: 1.1 !important; }
          .map-mobile-compact .text-xl { font-size: 0.98rem !important; line-height: 1.1 !important; }
          .map-mobile-compact .text-lg { font-size: 0.9rem !important; line-height: 1.14 !important; }
          .map-mobile-compact .text-base { font-size: 0.78rem !important; line-height: 1.2 !important; }
          .map-mobile-compact .text-sm { font-size: 0.7rem !important; line-height: 1.28 !important; }
          .map-mobile-compact .text-xs { font-size: 0.6rem !important; line-height: 1.18 !important; }
          .map-mobile-compact .text-[11px] { font-size: 0.52rem !important; line-height: 1.1 !important; }

          .map-selected-panel {
            left: 0.55rem !important;
            right: 0.55rem !important;
            top: auto !important;
            bottom: 0.6rem !important;
            width: auto !important;
            max-height: 84vh !important;
            border-radius: 22px !important;
          }

          .map-selected-panel > div:first-child {
            cursor: default !important;
            padding: 0.75rem !important;
          }

          .map-selected-panel > div:first-child p {
            display: none !important;
          }

          .map-selected-panel > div:last-child {
            max-height: calc(84vh - 68px) !important;
            padding: 0.75rem !important;
          }

          .map-selected-panel h3 {
            font-size: 1.2rem !important;
            line-height: 1.1 !important;
          }

          .map-selected-panel p,
          .map-selected-panel span,
          .map-selected-panel button,
          .map-selected-panel li {
            font-size: 0.68rem !important;
            line-height: 1.22 !important;
          }

          .map-selected-panel .map-mobile-selected-metrics {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.42rem !important;
          }

          .map-selected-panel .map-mobile-selected-metrics > div {
            min-height: 78px !important;
            border-radius: 14px !important;
            padding: 0.5rem !important;
          }

          .map-selected-panel .map-mobile-selected-metrics .h-10.w-10 {
            display: none !important;
          }

          .map-selected-panel .map-mobile-selected-metrics p:first-of-type {
            font-size: 0.48rem !important;
            line-height: 1.1 !important;
            letter-spacing: 0.06em !important;
          }

          .map-selected-panel .map-mobile-selected-metrics p:last-of-type {
            margin-top: 0.35rem !important;
            font-size: 0.68rem !important;
            line-height: 1.15 !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
          }

          .map-selected-panel .map-mobile-field-grid-3 {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 0.4rem !important;
          }

          .map-selected-panel .map-mobile-field-grid-3 > div {
            border-radius: 13px !important;
            padding: 0.5rem !important;
          }

          .map-selected-panel .rounded-[26px],
          .map-selected-panel .rounded-[24px],
          .map-selected-panel .rounded-[22px],
          .map-selected-panel .rounded-[20px] {
            border-radius: 15px !important;
            padding: 0.62rem !important;
          }

          .map-selected-panel .mt-5 { margin-top: 0.65rem !important; }
          .map-selected-panel .mt-4 { margin-top: 0.55rem !important; }
          .map-selected-panel .mt-3 { margin-top: 0.45rem !important; }
          .map-selected-panel .space-y-2 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.38rem !important; }

          .map-selected-panel .flex.flex-wrap.gap-2 {
            gap: 0.35rem !important;
          }

          .map-selected-panel .flex.flex-wrap.gap-2 span {
            padding: 0.33rem 0.48rem !important;
            font-size: 0.55rem !important;
          }
        }
      `}</style>

    </div>
  )
}