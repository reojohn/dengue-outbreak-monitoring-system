import { useEffect, useMemo, useRef, useState } from 'react'
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
  Moon,
  Navigation,
  Radar,
  Search,
  Satellite,
  ShieldAlert,
  Sun,
  Thermometer,
  TrendingUp,
  Users,
  X,
} from 'lucide-react'
import LeafletRiskMap from '../components/LeafletRiskMap'
import InformationTypeBadge from '../components/InformationTypeBadge'
import { useData } from '../context/DataContext'
import { compareCanonicalBarangayPriority, computeDecisionSupport, computeMultiSourceRisk, getCanonicalCombinedRiskScore, riskStyles } from '../utils/analytics'
import { getAuthSession } from '../utils/auth'
import { getLatestSavedBoundaryGeoJson } from '../services/api'
import gisGlobalNetworkGif from '../assets/gis-global-network.gif'
import mapHeroBackground from '../assets/map.png'
import mapLightHeroBackground from '../assets/maplight.png'

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

// Small session-only cache for the BHW local spatial context. It contains
// only the assigned barangay plus its immediate neighbors, so route changes
// do not repeatedly download the same small GeoJSON/risk snapshot.
const bhwLocalMapContextCache = new Map()

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
      'Prioritize this barangay in the next CHO coordination meeting because forecast case pressure is high.'
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

      // Response Priority is computed from the full decision-support context first.
      // CHO/Admin guidance is then applied by computeDecisionSupport for that priority.
      const priorityConfiguredPlan = Array.isArray(computedDecisionSupport.actions) ? computedDecisionSupport.actions.filter(Boolean) : []
      const actionPlan = priorityConfiguredPlan.length
        ? Array.from(new Set(priorityConfiguredPlan)).slice(0, 12)
        : Array.from(new Set([backendRecommendation, ...fallbackActionPlan].filter(Boolean))).slice(0, 8)

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
        // Keep the rule-based response score explicit so the UI can explain
        // the same decision logic that produced the response priority.
        responseLogicScore: Number(computedDecisionSupport.score || 0),
        summary:
          computedDecisionSupport.summary ||
          backendRecommendation ||
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
  const session = getAuthSession()
  const currentRole = String(session?.role || '').toLowerCase()
  const isBhwMap = currentRole === 'bhw'
  const assignedBarangay = String(session?.assignedBarangay || session?.assigned_barangay || '').trim()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedBarangay = searchParams.get('barangay') || ''

  const {
    riskRows = [],
    dashboardStats,
    sourceStatus,
    backendForecastResult = null,
    addActivityLog,
    boundaryRecords = [],
    loadLatestSavedBoundaryGeoJson,
    geospatialHotspotResult = null,
    loadGeospatialHotspotsCached,
  } = data

  const [bhwLocalMapContext, setBhwLocalMapContext] = useState(null)
  const [bhwLocalMapLoading, setBhwLocalMapLoading] = useState(false)
  const [bhwLocalMapError, setBhwLocalMapError] = useState('')

  const bhwLocalMapCacheKey = `${normalizeBarangayName(assignedBarangay)}::${String(
    backendForecastResult?.forecast_run?.forecast_run_id ||
      backendForecastResult?.database_forecast_run_id ||
      'latest'
  )}`

  useEffect(() => {
    if (!isBhwMap || !assignedBarangay || !hasBackendForecastData(backendForecastResult)) {
      setBhwLocalMapContext(null)
      setBhwLocalMapLoading(false)
      setBhwLocalMapError('')
      return undefined
    }

    const cached = bhwLocalMapContextCache.get(bhwLocalMapCacheKey)

    if (cached) {
      setBhwLocalMapContext(cached)
      setBhwLocalMapLoading(false)
      setBhwLocalMapError('')
      return undefined
    }

    let active = true
    setBhwLocalMapLoading(true)
    setBhwLocalMapError('')

    getLatestSavedBoundaryGeoJson({ scope: 'local' })
      .then((result) => {
        if (!active) return

        if (result?.has_saved_boundary && result?.boundary_geojson?.features?.length) {
          bhwLocalMapContextCache.set(bhwLocalMapCacheKey, result)
          setBhwLocalMapContext(result)
          return
        }

        setBhwLocalMapContext(null)
        setBhwLocalMapError('Nearby barangay risk context is not available yet.')
      })
      .catch(() => {
        if (!active) return
        setBhwLocalMapContext(null)
        setBhwLocalMapError('Nearby barangay risk context could not be loaded.')
      })
      .finally(() => {
        if (active) setBhwLocalMapLoading(false)
      })

    return () => {
      active = false
    }
  }, [
    assignedBarangay,
    backendForecastResult,
    bhwLocalMapCacheKey,
    isBhwMap,
  ])

  const boundaryLoadRequestedRef = useRef(false)

  useEffect(() => {
    const existingGeoJson = getBoundaryGeoJson(boundaryRecords)
    const existingFeatureCount = Array.isArray(existingGeoJson?.features)
      ? existingGeoJson.features.length
      : 0

    // CHO/Admin/Supervisor/Viewer keep the normal city map behavior. BHW may
    // already have only its assigned polygon from sign-in, so the Map page
    // upgrades that lightweight boundary to the full 86-barangay city layer.
    // The full boundary layer remains neutral geographic context, while a
    // separate compact BHW-local response supplies risk colors only for the
    // assigned barangay and its immediate neighbors.
    const needsBoundary = isBhwMap
      ? existingFeatureCount <= 1
      : existingFeatureCount === 0

    if (!needsBoundary || boundaryLoadRequestedRef.current) return

    boundaryLoadRequestedRef.current = true
    Promise.resolve(
      loadLatestSavedBoundaryGeoJson?.({
        silent: true,
        fullCity: isBhwMap,
      })
    ).finally(() => {
      const refreshedGeoJson = getBoundaryGeoJson(boundaryRecords)
      const refreshedFeatureCount = Array.isArray(refreshedGeoJson?.features)
        ? refreshedGeoJson.features.length
        : 0

      if (isBhwMap ? refreshedFeatureCount <= 1 : refreshedFeatureCount === 0) {
        boundaryLoadRequestedRef.current = false
      }
    })
  }, [boundaryRecords, isBhwMap, loadLatestSavedBoundaryGeoJson])

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

  const bhwLocalContextRows = useMemo(() => {
    const features = Array.isArray(bhwLocalMapContext?.boundary_geojson?.features)
      ? bhwLocalMapContext.boundary_geojson.features
      : []

    return features
      .map((feature) => {
        const properties = feature?.properties || {}
        const barangay = String(
          properties.barangay ||
            properties.adm4_name ||
            properties.adm4_ref_name ||
            properties.name ||
            ''
        ).trim()

        if (!barangay) return null

        const forecastRisk = String(properties.risk_level || '').trim()
        const risk = ['High', 'Moderate', 'Low'].includes(forecastRisk)
          ? forecastRisk
          : ''

        return {
          barangay,
          risk,
          risk_level: risk,
          hotspot_level: String(properties.hotspot_level || 'Not checked'),
          hotspotLevel: String(properties.hotspot_level || 'Not checked'),
          contextRole: String(properties.context_role || 'neighbor'),
          isBhwNeighborContext: String(properties.context_role || '') === 'neighbor',
        }
      })
      .filter(Boolean)
  }, [bhwLocalMapContext])

  const bhwNeighborCount = useMemo(() => {
    const fromApi = Number(bhwLocalMapContext?.neighbor_count)

    if (Number.isFinite(fromApi)) return fromApi

    return bhwLocalContextRows.filter((row) => row.contextRole === 'neighbor').length
  }, [bhwLocalContextRows, bhwLocalMapContext])

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

  const forecastMapRows = useMemo(() => {
    if (!isBhwMap || !bhwLocalContextRows.length) return displayRiskRows

    const merged = new Map()

    bhwLocalContextRows.forEach((row) => {
      const key = normalizeBarangayName(row.barangay)
      if (key) merged.set(key, row)
    })

    // The assigned row from /forecast/latest contains the full BHW-authorized
    // details. Overlay it on the compact neighbor context so only neighbors
    // remain limited/read-only records.
    displayRiskRows.forEach((row) => {
      const key = normalizeBarangayName(row?.barangay)
      if (!key) return

      merged.set(key, {
        ...(merged.get(key) || {}),
        ...row,
        contextRole: namesMatch(row?.barangay, assignedBarangay) ? 'assigned' : (merged.get(key)?.contextRole || ''),
      })
    })

    return [...merged.values()]
  }, [assignedBarangay, bhwLocalContextRows, displayRiskRows, isBhwMap])

 const usingMultiSourceRisk = !usingBackendForecast && hasMultiSourceRiskRows

  const displayPeriodCount = usingBackendForecast && !usingMultiSourceRisk
    ? buildBackendPeriodCount(backendForecastResult)
    : dashboardStats?.weeklyTotals?.length || 0

  const [selected, setSelected] = useState('')
  const [focusSelectedBarangay, setFocusSelectedBarangay] = useState(false)
  const [selectedPanelOpen, setSelectedPanelOpen] = useState(false)
  const [selectedPanelView, setSelectedPanelView] = useState('overview')
  const [responseScoreBreakdownOpen, setResponseScoreBreakdownOpen] = useState(false)
  const [responseTransparencyOpen, setResponseTransparencyOpen] = useState(false)
  const [hotspotCalculationOpen, setHotspotCalculationOpen] = useState('')

  useEffect(() => {
    if ((!responseScoreBreakdownOpen && !responseTransparencyOpen && !hotspotCalculationOpen) || typeof document === 'undefined') return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [responseScoreBreakdownOpen, responseTransparencyOpen, hotspotCalculationOpen])
  const [selectedPanelPosition, setSelectedPanelPosition] = useState(() => getDefaultPanelPosition())
  const [dragState, setDragState] = useState(null)
  const [legendOpen, setLegendOpen] = useState(true)
  const [mapStyle, setMapStyle] = useState('dark')
  const [mapLayerMode, setMapLayerMode] = useState('forecast')
  const [isMapExpanded, setIsMapExpanded] = useState(false)
  const [hotspotResult, setHotspotResult] = useState(() => geospatialHotspotResult || null)
  const [hotspotError, setHotspotError] = useState('')
  const [isLoadingHotspots, setIsLoadingHotspots] = useState(false)
  const [barangaySearch, setBarangaySearch] = useState('')
  const [barangaySearchOpen, setBarangaySearchOpen] = useState(false)
  const barangaySearchRef = useRef(null)

  useEffect(() => {
    if (geospatialHotspotResult) {
      setHotspotResult(geospatialHotspotResult)
    }
  }, [geospatialHotspotResult])

  const boundaryFeatureCount = countBoundaryFeatures(boundaryRecords)

  const hasRiskData = displayRiskRows.length > 0
  const hasBoundaryData =
    Number(sourceStatus?.boundary?.validCount || 0) > 0 ||
    boundaryFeatureCount > 0

  const canShowMap = hasRiskData || hasBoundaryData

  const hotspotConfig = hotspotResult?.hotspot_configuration || {
    local_weight: 60, nearby_weight: 25, spatial_weight: 15,
    watch_threshold: 45, emerging_threshold: 60, confirmed_threshold: 75, radius_km: 3,
  }

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
    const detailedRows = hotspotRows.map((hotspot) => {
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

    if (!isBhwMap || !bhwLocalContextRows.length) return detailedRows

    const merged = new Map()

    bhwLocalContextRows.forEach((row) => {
      const key = normalizeBarangayName(row.barangay)
      if (key) merged.set(key, row)
    })

    detailedRows.forEach((row) => {
      const key = normalizeBarangayName(row?.barangay)
      if (!key) return

      merged.set(key, {
        ...(merged.get(key) || {}),
        ...row,
        contextRole: namesMatch(row?.barangay, assignedBarangay) ? 'assigned' : (merged.get(key)?.contextRole || ''),
      })
    })

    return [...merged.values()]
  }, [assignedBarangay, bhwLocalContextRows, displayRiskRows, hotspotRows, isBhwMap])

  const activeMapRows = showingHotspotLayer ? hotspotMapRows : forecastMapRows

  const searchableBarangays = useMemo(() => {
    const names = []

    if (isBhwMap) {
      if (assignedBarangay) names.push(assignedBarangay)
    } else {
      activeMapRows.forEach((row) => {
        const name = String(row?.barangay || '').trim()
        if (name) names.push(name)
      })

      boundaryFeatures.forEach((feature) => {
        const name = String(getFeatureName(feature) || '').trim()
        const referenceName = String(getFeatureReferenceName(feature) || '').trim()
        if (name) names.push(name)
        if (referenceName) names.push(referenceName)
      })
    }

    const unique = new Map()

    names.forEach((name) => {
      const normalized = normalizeBarangayName(name)
      if (!normalized || unique.has(normalized)) return
      unique.set(normalized, name)
    })

    return [...unique.values()].sort((a, b) => a.localeCompare(b))
  }, [activeMapRows, assignedBarangay, boundaryFeatures, isBhwMap])

  const filteredBarangaySearch = useMemo(() => {
    const query = normalizeBarangayName(barangaySearch)
    if (!query) return []

    return searchableBarangays
      .filter((name) => {
        const normalized = normalizeBarangayName(name)
        return normalized.includes(query) || query.includes(normalized)
      })
      .slice(0, 8)
  }, [barangaySearch, searchableBarangays])

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
    function handleSearchOutsideClick(event) {
      if (!barangaySearchRef.current?.contains(event.target)) {
        setBarangaySearchOpen(false)
      }
    }

    function handleSearchEscape(event) {
      if (event.key === 'Escape') {
        setBarangaySearchOpen(false)
      }
    }

    document.addEventListener('mousedown', handleSearchOutsideClick)
    document.addEventListener('keydown', handleSearchEscape)

    return () => {
      document.removeEventListener('mousedown', handleSearchOutsideClick)
      document.removeEventListener('keydown', handleSearchEscape)
    }
  }, [])

  useEffect(() => {
    if (!isBhwMap || !assignedBarangay) return

    if (!selected || !namesMatch(selected, assignedBarangay)) {
      setSelected(assignedBarangay)
      setFocusSelectedBarangay(true)
      setSelectedPanelOpen(false)
    }
  }, [assignedBarangay, isBhwMap, selected])

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
    setFocusSelectedBarangay(true)
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
        setFocusSelectedBarangay(false)
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
        setFocusSelectedBarangay(false)
      }

      return
    }

    if (selected) {
      setSelected('')
      setFocusSelectedBarangay(false)
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
    selectedDecisionSupport?.responseLogicScore ??
    selectedDecisionSupport?.score ??
    details?.decisionScore ??
    0

  const responseScoreBreakdown = useMemo(() => {
    if (!details || !selectedDecisionSupport) return null
    const risk = String(details?.risk || selectedDecisionSupport?.risk || '').toLowerCase()
    const riskPoints = risk === 'high' ? 4 : risk === 'moderate' ? 2 : risk === 'low' ? 1 : 0
    const forecast = Number(details?.forecast || details?.forecastedCases || details?.predictedCases || 0)
    const forecastPoints = forecast >= 90 ? 4 : forecast >= 60 ? 3 : forecast >= 25 ? 2 : forecast > 0 ? 1 : 0
    const trend = String(selectedDecisionSupport?.trendDirection || selectedTrend || '').toLowerCase()
    const trendPoints = trend.includes('increas') ? 2 : trend.includes('stable') ? 1 : trend.includes('decreas') ? -1 : 0
    const densityLevel = String(selectedDecisionSupport?.densityLevel || '').toLowerCase()
    const densityPoints = densityLevel.includes('very high') ? 3 : densityLevel === 'high' || densityLevel.includes('high density') ? 2 : densityLevel.includes('moderate') ? 1 : 0
    const populationLabel = String(selectedDecisionSupport?.populationExposure || '').toLowerCase()
    const populationPoints = populationLabel.includes('high') ? 3 : populationLabel.includes('moderate') ? 2 : populationLabel && !populationLabel.includes('unavailable') ? 1 : 0
    const environmentLabel = String(selectedDecisionSupport?.environmentalSuitability || '').toLowerCase()
    const environmentPoints = environmentLabel.includes('high') ? 3 : environmentLabel.includes('moderate') ? 2 : environmentLabel && !environmentLabel.includes('unavailable') ? 1 : 0
    const multiSourceScore = Number(selectedDecisionSupport?.multiSourceRiskScore || selectedDecisionSupport?.riskScore || 0)
    const multiSourcePoints = Math.round(multiSourceScore / 25)
    const items = [
      {
        label: 'Risk level', value: details?.risk || 'Unavailable', points: riskPoints,
        why: risk === 'low' ? 'The current risk level is Low, so it contributes 1 point.' : risk === 'moderate' ? 'The current risk level is Moderate, so it contributes 2 points.' : risk === 'high' ? 'The current risk level is High, so it contributes 4 points.' : 'No recognized risk level is available, so no points are added.',
        guideRows: [
          { range: 'Low', points: 1, current: risk === 'low' },
          { range: 'Moderate', points: 2, current: risk === 'moderate' },
          { range: 'High', points: 4, current: risk === 'high' },
        ],
      },
      {
        label: 'Forecast pressure', value: `${formatNumber(forecast)} forecast cases`, points: forecastPoints,
        why: forecast <= 0 ? 'There are no forecast cases, so this factor adds 0 points.' : forecast < 25 ? `${formatNumber(forecast)} cases falls within the 1–24 case range, so it contributes 1 point.` : forecast < 60 ? `${formatNumber(forecast)} cases falls within the 25–59 case range, so it contributes 2 points.` : forecast < 90 ? `${formatNumber(forecast)} cases falls within the 60–89 case range, so it contributes 3 points.` : `${formatNumber(forecast)} cases is 90 or higher, so it contributes 4 points.`,
        guideRows: [
          { range: 'No forecast cases', points: 0, current: forecast <= 0 },
          { range: '1–24 cases', points: 1, current: forecast > 0 && forecast < 25 },
          { range: '25–59 cases', points: 2, current: forecast >= 25 && forecast < 60 },
          { range: '60–89 cases', points: 3, current: forecast >= 60 && forecast < 90 },
          { range: '90+ cases', points: 4, current: forecast >= 90 },
        ],
      },
      {
        label: 'Historical trend', value: selectedDecisionSupport?.trendDirection || selectedTrend || 'Unavailable', points: trendPoints,
        why: trend.includes('increas') ? 'The trend is Increasing, so it contributes 2 points and signals closer monitoring.' : trend.includes('stable') ? 'The trend is Stable, so it contributes 1 point.' : trend.includes('decreas') ? 'The trend is Decreasing, so 1 point is subtracted.' : 'No recognized trend is available, so no points are added.',
        guideRows: [
          { range: 'Decreasing', points: -1, current: trend.includes('decreas') },
          { range: 'Stable', points: 1, current: trend.includes('stable') },
          { range: 'Increasing', points: 2, current: trend.includes('increas') },
        ],
      },
      {
        label: 'Population density', value: selectedDensity > 0 ? `${formatNumber(selectedDensity, 2)} people/sq km` : 'Unavailable', points: densityPoints,
        why: selectedDensity <= 0 ? 'Population density is unavailable, so no points are added.' : selectedDensity < 500 ? `${formatNumber(selectedDensity, 2)} people/sq km is below 500, so it adds 0 points.` : selectedDensity < 1500 ? `${formatNumber(selectedDensity, 2)} people/sq km falls within 500–1,499, so it contributes 1 point.` : selectedDensity < 5000 ? `${formatNumber(selectedDensity, 2)} people/sq km falls within 1,500–4,999, so it contributes 2 points.` : `${formatNumber(selectedDensity, 2)} people/sq km is 5,000 or higher, so it contributes 3 points.`,
        guideRows: [
          { range: 'Below 500 people/sq km', points: 0, current: selectedDensity > 0 && selectedDensity < 500 },
          { range: '500–1,499 people/sq km', points: 1, current: selectedDensity >= 500 && selectedDensity < 1500 },
          { range: '1,500–4,999 people/sq km', points: 2, current: selectedDensity >= 1500 && selectedDensity < 5000 },
          { range: '5,000+ people/sq km', points: 3, current: selectedDensity >= 5000 },
        ],
      },
      {
        label: 'Population exposure', value: selectedPopulation > 0 ? `${formatNumber(selectedPopulation)} people` : 'Unavailable', points: populationPoints,
        why: selectedPopulation <= 0 ? 'Population is unavailable, so no points are added.' : selectedPopulation < 8000 ? `${formatNumber(selectedPopulation)} people is below 8,000, so it contributes 1 point.` : selectedPopulation < 15000 ? `${formatNumber(selectedPopulation)} people falls within 8,000–14,999, so it contributes 2 points.` : `${formatNumber(selectedPopulation)} people is 15,000 or higher, so it contributes 3 points.`,
        guideRows: [
          { range: 'Below 8,000 people', points: 1, current: selectedPopulation > 0 && selectedPopulation < 8000 },
          { range: '8,000–14,999 people', points: 2, current: selectedPopulation >= 8000 && selectedPopulation < 15000 },
          { range: '15,000+ people', points: 3, current: selectedPopulation >= 15000 },
        ],
      },
      {
        label: 'Environmental suitability', value: selectedDecisionSupport?.environmentalSuitability || 'Unavailable', points: environmentPoints,
        why: environmentLabel.includes('high') ? 'Environmental suitability is High, so it contributes 3 points.' : environmentLabel.includes('moderate') ? 'Environmental suitability is Moderate, so it contributes 2 points.' : environmentLabel && !environmentLabel.includes('unavailable') ? 'Environmental suitability is Low, so it contributes 1 point.' : 'Environmental suitability is unavailable, so no points are added.',
        guideRows: [
          { range: 'Low suitability', points: 1, current: !!environmentLabel && !environmentLabel.includes('unavailable') && !environmentLabel.includes('moderate') && !environmentLabel.includes('high') },
          { range: 'Moderate suitability', points: 2, current: environmentLabel.includes('moderate') },
          { range: 'High suitability', points: 3, current: environmentLabel.includes('high') },
        ],
      },
      {
        label: 'Combined priority contribution', value: `${formatNumber(multiSourceScore)}/100`, points: multiSourcePoints,
        why: `The combined priority score is ${formatNumber(multiSourceScore)}/100. The response logic divides it by 25 and rounds the result: ${formatNumber(multiSourceScore)} ÷ 25 = ${(multiSourceScore / 25).toFixed(2)}, rounded to ${multiSourcePoints} point${multiSourcePoints === 1 ? '' : 's'}.`,
        guideRows: [
          { range: `Current: ${formatNumber(multiSourceScore)} ÷ 25 = ${(multiSourceScore / 25).toFixed(2)} → rounded`, points: multiSourcePoints, current: true },
        ],
      },
    ]
    return { items, total: items.reduce((sum, item) => sum + Number(item.points || 0), 0) }
  }, [details, selectedDecisionSupport, selectedDensity, selectedPopulation, selectedTrend])

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

  const responseTransparency = useMemo(() => {
    if (!details) return null

    const risk = String(details?.risk || selectedDecisionSupport?.risk || 'Unavailable')
    const trend = String(selectedDecisionSupport?.trendDirection || selectedTrend || 'Unavailable')
    const forecast = Number(details?.forecast || details?.forecastedCases || details?.predictedCases || 0)
    const environment = String(selectedDecisionSupport?.environmentalSuitability || 'Unavailable')
    const riskKey = risk.toLowerCase()
    const trendKey = trend.toLowerCase()
    const environmentKey = environment.toLowerCase()

    let trigger = 'The response priority is selected from the current decision-support rules using the barangay indicators shown below.'
    if (riskKey === 'low' && trendKey.includes('increas')) {
      trigger = `${selectedLabel} is currently Low Risk, but its historical trend is Increasing. This early signal triggers closer monitoring under the Early Warning Watch rule.`
    } else if (riskKey === 'low' && environmentKey.includes('high')) {
      trigger = `${selectedLabel} is currently Low Risk, but environmental suitability is High. This early environmental signal triggers closer monitoring under the Early Warning Watch rule.`
    }

    const signals = [
      { label: 'Risk level', value: risk, role: riskKey === 'low' ? 'Current forecast risk remains low.' : 'Used directly by the response-priority rules.' },
      { label: 'Historical trend', value: trend, role: trendKey.includes('increas') ? 'Increasing activity is an early-warning signal.' : 'Shows whether recent dengue activity is rising, stable, or decreasing.' },
      { label: 'Forecast', value: `${formatNumber(forecast)} cases`, role: 'Adds forward-looking case pressure to the decision context.' },
      { label: 'Environment', value: environment, role: 'Summarizes rainfall, temperature, and humidity suitability.' },
      { label: 'Population', value: selectedPopulation > 0 ? `${formatNumber(selectedPopulation)} people` : 'Unavailable', role: 'Shows how many people may be exposed.' },
      { label: 'Density', value: selectedDensity > 0 ? `${formatNumber(selectedDensity, 2)} people/sq km` : 'Unavailable', role: 'Adds context about close residential exposure.' },
    ]

    const actionReasons = selectedActionPlan.map((action) => {
      const text = String(action).toLowerCase()
      let reason = 'Included by the current response-plan rules for this barangay.'
      if (text.includes('monitor closely') || text.includes('upward') || text.includes('reporting-period')) reason = 'The recent trend is increasing, so closer surveillance is recommended before escalation.'
      else if (text.includes('early warning')) reason = 'An early-warning condition is present even though the current risk level is not yet high.'
      else if (text.includes('nearby')) reason = 'Nearby activity is checked as supporting spatial context for possible spread or clustering.'
      else if (text.includes('cluster') || text.includes('purok') || text.includes('household group')) reason = 'Checking where cases are concentrated helps determine whether field action should be targeted.'
      else if (text.includes('densely populated') || text.includes('residential spacing')) reason = 'Population density is elevated, so densely populated areas receive additional attention.'
      else if (text.includes('preventive') || text.includes('reminder') || text.includes('communication')) reason = 'Preventive communication is appropriate while the barangay is being watched for change.'
      else if (text.includes('next reporting period')) reason = 'The next reporting period provides new evidence for deciding whether the response should be escalated.'
      return { action, reason }
    })

    return { trigger, signals, actionReasons }
  }, [details, selectedActionPlan, selectedDecisionSupport, selectedDensity, selectedLabel, selectedPopulation, selectedTrend])

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
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 639px)').matches
    ) {
      return
    }

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
    if (isBhwMap && assignedBarangay && !namesMatch(name, assignedBarangay)) return

    setSelected(name)
    setFocusSelectedBarangay(true)
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

  function handleBarangaySearchSelect(name) {
    const resolvedName = String(name || '').trim()
    if (!resolvedName) return

    setBarangaySearch(resolvedName)
    setBarangaySearchOpen(false)
    handleSelectBarangay(resolvedName)
  }

  function handleBarangaySearchKeyDown(event) {
    if (event.key !== 'Enter') return

    event.preventDefault()
    const exactMatch = searchableBarangays.find((name) => namesMatch(name, barangaySearch))
    const firstMatch = exactMatch || filteredBarangaySearch[0]

    if (firstMatch) {
      handleBarangaySearchSelect(firstMatch)
    }
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

  // In Forecast view this value is the Combined Priority Score (CRS), not the
  // Low/Moderate/High forecast-risk classification. Label it explicitly so a
  // Low-risk barangay with a CRS such as 52/100 does not look contradictory.
  const selectedHeroScoreLabel = showingHotspotLayer ? 'Hotspot score' : 'Priority score'

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
      label: 'Response logic score',
      value: details ? `${formatNumber(selectedDecisionScore)} points` : 'Waiting for data',
      icon: Gauge,
      tone: 'text-indigo-500 bg-indigo-50 border-indigo-100 dark:text-indigo-300 dark:bg-indigo-500/10 dark:border-indigo-500/20',
      onClick: details ? () => setResponseScoreBreakdownOpen(true) : null,
      helper: details ? 'View calculation' : '',
    },
    {
      label: 'Combined priority score',
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

  const overviewSelectedMetrics = selectedMetrics.filter(
    (metric) => !['Hotspot level', 'Hotspot score', 'Nearby barangay effect'].includes(metric.label)
  )

  async function handleRunHotspotAnalysis() {
    setHotspotError('')
    setIsLoadingHotspots(true)

    try {
      const result = await loadGeospatialHotspotsCached?.({
        silent: true,
        force: true,
      })

      if (!result) {
        throw new Error('The hotspot analysis could not be loaded from the server.')
      }

      setHotspotResult(result)

      if (isBhwMap) {
        try {
          const localContext = await getLatestSavedBoundaryGeoJson({ scope: 'local' })

          if (localContext?.has_saved_boundary && localContext?.boundary_geojson?.features?.length) {
            bhwLocalMapContextCache.set(bhwLocalMapCacheKey, localContext)
            setBhwLocalMapContext(localContext)
            setBhwLocalMapError('')
          }
        } catch {
          // Keep the existing local context if the small refresh is unavailable.
        }
      }

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
      <div className="map-control-stack flex flex-wrap items-center gap-2">
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
          onClick={handleRunHotspotAnalysis}
          disabled={isLoadingHotspots || !hasBoundaryData}
          className="map-hotspot-button inline-flex items-center gap-2 rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20"
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
          ? 'map-workspace-canvas map-workspace-canvas-expanded relative z-0 h-[calc(100vh-190px)] min-h-[720px] max-h-[920px] overflow-hidden rounded-[30px] border border-cyan-200/70 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.12),transparent_38%),linear-gradient(145deg,#eff6ff,#ffffff_58%,#ecfeff)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_20px_52px_rgba(15,23,42,0.10)] dark:border-cyan-500/20 dark:bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.10),transparent_38%),linear-gradient(145deg,#020617,#0f172a_58%,#082f49)]'
          : 'map-workspace-canvas map-workspace-canvas-compact relative z-0 h-[560px] overflow-hidden rounded-[28px] border border-cyan-200/70 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.12),transparent_38%),linear-gradient(145deg,#eff6ff,#ffffff_58%,#ecfeff)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_20px_52px_rgba(15,23,42,0.10)] dark:border-cyan-500/20 dark:bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.10),transparent_38%),linear-gradient(145deg,#020617,#0f172a_58%,#082f49)] sm:h-[680px] 2xl:h-[780px]'
      }
    >
      <div className="relative z-0 h-full overflow-hidden rounded-[22px] dark:[&_.leaflet-container]:bg-slate-950">
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
            isExpanded={isMapExpanded}
            onToggleExpanded={() => setIsMapExpanded((current) => !current)}
            showDetailsPanel={false}
            focusSelected={focusSelectedBarangay}
            restrictSelectionToRows={isBhwMap}
            contextBoundaryLabel={isBhwMap ? 'Other Butuan barangay · context only' : ''}
            neighborContextLabel={isBhwMap ? 'Neighboring barangay · read-only' : ''}
            assignedContextMode={isBhwMap}
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

      {hotspotCalculationOpen && selectedHotspot && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:p-6"
            onMouseDown={(event) => { if (event.target === event.currentTarget) setHotspotCalculationOpen('') }}
          >
            <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[26px] border border-cyan-300/20 bg-slate-950 text-white shadow-[0_35px_120px_rgba(2,6,23,0.75)]">
              <div className="shrink-0 border-b border-slate-800 px-5 py-5 sm:px-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-200">Hotspot transparency</span>
                    <h3 className="mt-3 text-xl font-black sm:text-2xl">
                      {hotspotCalculationOpen === 'local' && `How ${selectedLabel} gets its Local Risk`}
                      {hotspotCalculationOpen === 'nearby' && `How ${selectedLabel} gets its Nearby Influence`}
                      {hotspotCalculationOpen === 'spatial' && `How ${selectedLabel} gets its Spatial Concentration`}
                      {hotspotCalculationOpen === 'final' && `How ${selectedLabel} gets its Final Hotspot Score`}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">This uses the same values returned by the current hotspot check. Nothing here changes the calculation.</p>
                  </div>
                  <button type="button" onClick={() => setHotspotCalculationOpen('')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-900 font-black text-slate-300 hover:text-white">×</button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7" style={{ scrollbarGutter: 'stable' }}>
                {hotspotCalculationOpen === 'local' && (() => {
                  const b = selectedHotspot.base_score_breakdown || {}
                  const factors = [
                    ['Dengue cases', selectedHotspot.total_cases, b.case_pressure, 35, 'cases'],
                    ['Rainfall', selectedHotspot.average_rainfall, b.rainfall_pressure, 20, 'mm'],
                    ['Temperature', selectedHotspot.average_temperature, b.temperature_suitability, 15, '°C'],
                    ['Humidity', selectedHotspot.average_humidity, b.humidity_pressure, 10, '%'],
                    ['Population density', selectedHotspot.density, b.population_density_pressure, 20, 'people/km²'],
                  ]
                  const total = factors.reduce((sum, row) => sum + Number(row[2] || 0) * row[3] / 100, 0)
                  const maxCases = Math.max(...rawHotspotRows.map((row) => Number(row?.total_cases || 0)), 1)
                  const maxDensity = Math.max(...rawHotspotRows.map((row) => Number(row?.density || 0)), 1)
                  return <>
                    <div className="rounded-[20px] border border-cyan-300/20 bg-cyan-300/[0.07] p-4"><p className="text-sm font-black text-cyan-200">Local Risk = five local factors</p><p className="mt-2 text-sm leading-6 text-slate-300">Each raw barangay value is converted to a 0–100 pressure/suitability score by the hotspot engine, then multiplied by its fixed local-factor weight.</p></div>
                    <div className="mt-4 overflow-hidden rounded-[18px] border border-slate-700"><div className="grid grid-cols-[1.3fr_.8fr_.65fr_.65fr] gap-2 bg-slate-800 px-3 py-3 text-[10px] font-black uppercase text-slate-300"><span>Factor</span><span>Raw value</span><span>Score</span><span>Contribution</span></div>{factors.map(([label, raw, score, weight, unit]) => <div key={label} className="grid grid-cols-[1.3fr_.8fr_.65fr_.65fr] gap-2 border-t border-slate-800 px-3 py-3 text-xs sm:text-sm"><span className="font-bold">{label} <span className="text-slate-500">({weight}%)</span></span><span className="text-slate-300">{Number(raw || 0).toLocaleString(undefined,{maximumFractionDigits:2})} {unit}</span><span className="font-bold text-cyan-200">{Number(score || 0).toFixed(2)}</span><span className="font-bold text-emerald-300">{(Number(score || 0)*weight/100).toFixed(2)}</span></div>)}</div>
                    <div className="mt-4 rounded-[18px] border border-slate-700 bg-slate-900/60 p-4"><p className="font-black text-white">How the 0–100 factor scores are produced</p><div className="mt-3 space-y-2 text-sm leading-6 text-slate-300"><p><strong className="text-cyan-200">Cases:</strong> ({Number(selectedHotspot.total_cases||0).toFixed(2)} ÷ city maximum {maxCases.toFixed(2)}) × 100 = {Number(b.case_pressure||0).toFixed(2)}.</p><p><strong className="text-cyan-200">Rainfall:</strong> ({Number(selectedHotspot.average_rainfall||0).toFixed(2)} ÷ 30) × 100, capped at 100 = {Number(b.rainfall_pressure||0).toFixed(2)}.</p><p><strong className="text-cyan-200">Temperature:</strong> the current average {Number(selectedHotspot.average_temperature||0).toFixed(2)}°C is assigned to the backend temperature-suitability band = {Number(b.temperature_suitability||0).toFixed(2)}.</p><p><strong className="text-cyan-200">Humidity:</strong> the current average {Number(selectedHotspot.average_humidity||0).toFixed(2)}% is assigned to the backend humidity-pressure band = {Number(b.humidity_pressure||0).toFixed(2)}.</p><p><strong className="text-cyan-200">Density:</strong> ({Number(selectedHotspot.density||0).toFixed(2)} ÷ city maximum {maxDensity.toFixed(2)}) × 100 = {Number(b.population_density_pressure||0).toFixed(2)}.</p></div></div>
                    <div className="mt-4 rounded-[18px] border border-emerald-300/20 bg-emerald-300/[0.07] p-4"><p className="font-black text-emerald-200">Final local calculation</p><p className="mt-2 break-words text-sm leading-7 text-slate-200">{factors.map((r) => `${Number(r[2]||0).toFixed(2)}×${r[3]}%`).join(' + ')} = <strong>{total.toFixed(2)}</strong> → <strong>{formatHotspotScore(selectedHotspot.base_risk_score)}</strong></p></div>
                  </>
                })()}

                {hotspotCalculationOpen === 'nearby' && (() => {
                  const neighbors = Array.isArray(selectedHotspot.spatial_influence_barangays) ? selectedHotspot.spatial_influence_barangays : []
                  const rows = neighbors.map((n) => { const d=Math.max(Number(n.distance_km||0),0.1); const w=1/d; return {...n,_d:d,_w:w,_weighted:Number(n.base_risk_score||0)*w} })
                  const tw=rows.reduce((a,n)=>a+n._w,0), ts=rows.reduce((a,n)=>a+n._weighted,0)
                  return <>
                    <div className="rounded-[20px] border border-cyan-300/20 bg-cyan-300/[0.07] p-4"><p className="text-sm font-black text-cyan-200">Nearby Influence = distance-weighted neighbor risk</p><p className="mt-2 text-sm leading-6 text-slate-300">Barangays within {Number(hotspotConfig.radius_km || 3).toLocaleString(undefined,{maximumFractionDigits:2})} km are used. Closer barangays receive more influence because weight = 1 ÷ distance.</p></div>
                    <div className="mt-4 space-y-2">{rows.length ? rows.map((n)=><div key={`${n.barangay}-${n.distance_km}`} className="rounded-[16px] border border-slate-700 bg-slate-900/60 p-3 text-sm"><div className="flex justify-between gap-3"><strong>{n.barangay}</strong><span className="text-cyan-200">{n._d.toFixed(2)} km</span></div><p className="mt-1 text-slate-300">Local risk {Number(n.base_risk_score||0).toFixed(2)} · weight 1/{n._d.toFixed(2)} = {n._w.toFixed(3)} · weighted risk = {n._weighted.toFixed(2)}</p></div>) : <p className="text-slate-300">No spatial influence rows were returned.</p>}</div>
                    <div className="mt-4 rounded-[18px] border border-emerald-300/20 bg-emerald-300/[0.07] p-4"><p className="font-black text-emerald-200">Final nearby calculation</p><p className="mt-2 text-sm leading-7 text-slate-200">Weighted risk total {ts.toFixed(2)} ÷ weight total {tw.toFixed(3)} = <strong>{tw ? (ts/tw).toFixed(2) : '0.00'}</strong> → <strong>{formatHotspotScore(selectedHotspot.neighbor_influence_score)}</strong></p></div>
                  </>
                })()}

                {hotspotCalculationOpen === 'spatial' && (() => {
                  const neighbors = Array.isArray(selectedHotspot.spatial_influence_barangays) ? selectedHotspot.spatial_influence_barangays : []
                  const high = neighbors.filter((n)=>Number(n.base_risk_score||0)>=60).length
                  const ratio = neighbors.length ? high/neighbors.length : 0
                  const clusterPart=ratio*60, nearbyPart=Number(selectedHotspot.neighbor_influence_score||0)*0.40
                  return <>
                    <div className="rounded-[20px] border border-cyan-300/20 bg-cyan-300/[0.07] p-4"><p className="text-sm font-black text-cyan-200">Spatial Concentration checks whether high local risk is clustered nearby</p><p className="mt-2 text-sm leading-6 text-slate-300">The engine treats a nearby barangay with Local Risk ≥ 60 as high local risk for this concentration calculation.</p></div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-[18px] border border-slate-700 bg-slate-900/60 p-4"><p className="text-xs font-black uppercase text-slate-400">High-risk neighbor ratio</p><p className="mt-2 text-xl font-black">{high}/{neighbors.length}</p><p className="mt-2 text-sm text-slate-300">({ratio.toFixed(3)} × 60) = <strong className="text-cyan-200">{clusterPart.toFixed(2)}</strong></p></div><div className="rounded-[18px] border border-slate-700 bg-slate-900/60 p-4"><p className="text-xs font-black uppercase text-slate-400">Nearby influence share</p><p className="mt-2 text-xl font-black">{formatHotspotScore(selectedHotspot.neighbor_influence_score)}</p><p className="mt-2 text-sm text-slate-300">({Number(selectedHotspot.neighbor_influence_score||0).toFixed(2)} × 40%) = <strong className="text-cyan-200">{nearbyPart.toFixed(2)}</strong></p></div></div>
                    <div className="mt-4 rounded-[18px] border border-emerald-300/20 bg-emerald-300/[0.07] p-4"><p className="font-black text-emerald-200">Final spatial calculation</p><p className="mt-2 text-sm leading-7 text-slate-200">{clusterPart.toFixed(2)} + {nearbyPart.toFixed(2)} = <strong>{(clusterPart+nearbyPart).toFixed(2)}</strong> → <strong>{formatHotspotScore(selectedHotspot.spatial_concentration_score)}</strong></p></div>
                  </>
                })()}

                {hotspotCalculationOpen === 'final' && (() => {
                  const local=Number(selectedHotspot.base_risk_score||0)*Number(hotspotConfig.local_weight||0)/100
                  const nearby=Number(selectedHotspot.neighbor_influence_score||0)*Number(hotspotConfig.nearby_weight||0)/100
                  const spatial=Number(selectedHotspot.spatial_concentration_score||0)*Number(hotspotConfig.spatial_weight||0)/100
                  return <>
                    <div className="rounded-[20px] border border-violet-300/20 bg-violet-300/[0.08] p-4"><p className="text-sm font-black text-violet-200">Final Hotspot Score combines the three spatial indicators</p><p className="mt-2 text-sm leading-6 text-slate-300">These weights come from the current Hotspot Configuration.</p></div>
                    <div className="mt-4 space-y-2 text-sm">{[['Local Risk',selectedHotspot.base_risk_score,hotspotConfig.local_weight,local],['Nearby Influence',selectedHotspot.neighbor_influence_score,hotspotConfig.nearby_weight,nearby],['Spatial Concentration',selectedHotspot.spatial_concentration_score,hotspotConfig.spatial_weight,spatial]].map(([l,v,w,c])=><div key={l} className="flex items-center justify-between gap-4 rounded-[16px] border border-slate-700 bg-slate-900/60 p-4"><span className="font-bold">{l}: {Number(v||0).toFixed(2)} × {w}%</span><strong className="text-cyan-200">{Number(c).toFixed(2)}</strong></div>)}</div>
                    <div className="mt-4 rounded-[18px] border border-emerald-300/20 bg-emerald-300/[0.07] p-4"><p className="font-black text-emerald-200">Final calculation</p><p className="mt-2 text-base leading-7 text-slate-100">{local.toFixed(2)} + {nearby.toFixed(2)} + {spatial.toFixed(2)} = <strong>{(local+nearby+spatial).toFixed(2)}</strong> → <strong>{formatHotspotScore(selectedHotspot.hotspot_score)}</strong></p></div>
                    <div className="mt-4 rounded-[18px] border border-amber-300/20 bg-amber-300/[0.07] p-4 text-sm leading-7 text-slate-200"><strong className="text-amber-200">Classification:</strong> Low Spatial Concern &lt; {hotspotConfig.watch_threshold}; Watch Area {hotspotConfig.watch_threshold}–{Number(hotspotConfig.emerging_threshold)-0.01}; Emerging {hotspotConfig.emerging_threshold}–{Number(hotspotConfig.confirmed_threshold)-0.01}; Confirmed ≥ {hotspotConfig.confirmed_threshold}. Current result: <strong>{getHotspotLevelLabel(selectedHotspot.hotspot_level)}</strong>.</div>
                  </>
                })()}
              </div>
              <div className="shrink-0 border-t border-slate-800 px-5 py-4 sm:px-7"><div className="flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Transparency only · no data or model values are changed.</p><button type="button" onClick={() => setHotspotCalculationOpen('')} className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-black hover:border-cyan-400/40">Close</button></div></div>
            </div>
          </div>,
          document.body
        )}

      {responseTransparencyOpen && responseTransparency && typeof document !== 'undefined' &&
        createPortal(
          <>
          <style>{`
            .response-transparency-scroll { scrollbar-width: auto; scrollbar-color: #22d3ee #0f172a; scrollbar-gutter: stable; overscroll-behavior: contain; }
            .response-transparency-scroll::-webkit-scrollbar { width: 12px; }
            .response-transparency-scroll::-webkit-scrollbar-track { background: #0f172a; border-radius: 999px; margin: 10px 0; box-shadow: inset 0 0 0 1px rgba(148,163,184,.12); }
            .response-transparency-scroll::-webkit-scrollbar-thumb { background: linear-gradient(180deg,#22d3ee,#0284c7); border: 3px solid #0f172a; border-radius: 999px; min-height: 54px; }
            .response-transparency-scroll::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg,#67e8f9,#38bdf8); }
            @media (max-width: 640px) {
              .response-transparency-shell { width: calc(100vw - 16px) !important; max-height: calc(100dvh - 16px) !important; border-radius: 22px !important; }
              .response-transparency-header { padding: 14px 16px !important; }
              .response-transparency-header h3 { margin-top: 8px !important; font-size: 18px !important; line-height: 1.25 !important; }
              .response-transparency-header p { margin-top: 6px !important; font-size: 14px !important; line-height: 1.55 !important; }
              .response-transparency-scroll { padding: 14px 12px 14px 16px !important; scrollbar-width: thin; }
              .response-transparency-scroll::-webkit-scrollbar { width: 7px; }
              .response-transparency-scroll::-webkit-scrollbar-thumb { border-width: 1px; min-height: 42px; }
              .response-transparency-scroll::-webkit-scrollbar-track { margin: 6px 0; }
              .response-transparency-footer { padding: 10px 16px !important; }
              .response-transparency-footer button { padding: 8px 16px !important; }
              .response-action-card { padding: 12px !important; border-radius: 15px !important; }
              .response-action-list { gap: 9px !important; }
            }
          `}</style>
          <div
            className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/72 p-3 backdrop-blur-sm sm:p-6"
            onMouseDown={(event) => { if (event.target === event.currentTarget) setResponseTransparencyOpen(false) }}
          >
            <div className="response-transparency-shell flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-cyan-300/20 bg-slate-950 text-white shadow-[0_35px_120px_rgba(2,6,23,0.72)]">
              <div className="response-transparency-header shrink-0 border-b border-slate-800 bg-slate-950/98 px-5 py-5 sm:px-7">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <span className="inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-200">Response transparency</span>
                    <h3 className="mt-3 text-xl font-black leading-tight sm:text-2xl">Why {selectedLabel} gets “{selectedPriority}”</h3>
                    <p className="mt-2 max-w-2xl text-base leading-7 text-slate-300">See the rule that triggered the response, the supporting barangay conditions, and why each recommended action appears.</p>
                  </div>
                  <button type="button" onClick={() => setResponseTransparencyOpen(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-lg font-black text-slate-300 transition hover:border-cyan-400/40 hover:bg-slate-800 hover:text-white" aria-label="Close response transparency">×</button>
                </div>
              </div>

              <div className="response-transparency-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7" style={{ scrollbarGutter: 'stable' }}>
                <div className="rounded-[22px] border border-amber-300/25 bg-amber-300/10 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-black uppercase tracking-[0.12em] text-amber-200">Rule that triggered this response</p><span className={`rounded-full border px-3 py-1 text-[11px] font-black ${getPriorityBadgeStyle(selectedPriority)}`}>{selectedPriority}</span></div>
                  <p className="mt-3 text-base font-semibold leading-7 text-slate-100 sm:text-[17px]">{responseTransparency.trigger}</p>
                  <p className="mt-3 rounded-xl border border-white/10 bg-slate-950/35 px-4 py-3.5 text-sm leading-6 text-slate-300"><strong className="text-white">Important:</strong> the Response Logic Score summarizes contributing conditions. The response label itself is assigned by the decision rules.</p>
                </div>

                <div className="mt-5">
                  <div className="mb-3"><p className="text-base font-black text-white">Conditions used for this barangay</p><p className="mt-1 text-sm leading-6 text-slate-400">These values provide the evidence and context used by the response logic.</p></div>
                  <div className="overflow-hidden rounded-[20px] border border-slate-700/80 bg-slate-900/55">
                    <div className="hidden grid-cols-[0.8fr_0.8fr_1.4fr] border-b border-slate-700/80 bg-slate-800/80 px-4 py-3 text-xs font-black uppercase tracking-[0.10em] text-slate-300 sm:grid"><span>Condition</span><span>Current value</span><span>How it is used</span></div>
                    <div className="divide-y divide-slate-800">{responseTransparency.signals.map((signal) => (<div key={signal.label} className="grid gap-1.5 px-4 py-4 text-base sm:grid-cols-[0.8fr_0.8fr_1.4fr] sm:gap-5"><span className="font-black text-slate-100">{signal.label}</span><span className="font-bold text-cyan-200">{signal.value}</span><span className="leading-6 text-slate-300">{signal.role}</span></div>))}</div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-3"><p className="text-base font-black text-white">Why these actions were included</p><p className="mt-1 text-sm leading-6 text-slate-400">Each action is paired with the condition or operational reason that supports it.</p></div>
                  <div className="response-action-list space-y-3">{responseTransparency.actionReasons.map((row, index) => (<div key={`${row.action}-${index}`} className="response-action-card rounded-[18px] border border-slate-700/80 bg-slate-900/55 p-4"><div className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-300/25 bg-amber-300/10 text-xs font-black text-amber-200">{index + 1}</span><div className="min-w-0"><p className="text-base font-bold leading-7 text-white">{row.action}</p><p className="mt-1.5 text-sm leading-6 text-slate-400"><strong className="text-slate-300">Why:</strong> {row.reason}</p></div></div></div>))}</div>
                </div>

                {selectedRationale.length > 0 && <div className="mt-5 rounded-[20px] border border-cyan-300/15 bg-cyan-300/[0.06] p-4"><p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-200">Additional system rationale</p><ul className="mt-3 space-y-2.5 text-sm leading-6 text-slate-300">{selectedRationale.slice(0, 5).map((item, index) => <li key={`${item}-${index}`} className="flex gap-2"><span className="font-black text-cyan-300">•</span><span>{item}</span></li>)}</ul></div>}
              </div>

              <div className="response-transparency-footer shrink-0 border-t border-slate-800 bg-slate-950/98 px-5 py-4 sm:px-7"><div className="flex justify-end"><button type="button" onClick={() => setResponseTransparencyOpen(false)} className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-black text-white transition hover:border-cyan-400/40 hover:bg-slate-800">Close</button></div></div>
            </div>
          </div>
          </>,
          document.body
        )}

      {responseScoreBreakdownOpen && responseScoreBreakdown &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[200000] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-md sm:p-5"
            onMouseDown={(event) => { if (event.target === event.currentTarget) setResponseScoreBreakdownOpen(false) }}
          >
            <style>{`
              .response-score-scroll { scrollbar-width: thin; scrollbar-color: #22d3ee #0f172a; scrollbar-gutter: stable; overscroll-behavior: contain; }
              .response-score-scroll::-webkit-scrollbar { width: 9px; }
              .response-score-scroll::-webkit-scrollbar-track { background: #0f172a; border-radius: 999px; margin: 8px 0; }
              .response-score-scroll::-webkit-scrollbar-thumb { background: linear-gradient(180deg,#22d3ee,#0ea5e9); border: 2px solid #0f172a; border-radius: 999px; }
              .response-score-scroll::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg,#67e8f9,#38bdf8); }
              @media (max-width: 640px) {
                .response-score-shell { width: calc(100vw - 16px) !important; max-height: calc(100dvh - 16px) !important; border-radius: 22px !important; }
                .response-score-header { padding: 14px 16px !important; }
                .response-score-header h3 { margin-top: 8px !important; font-size: 18px !important; line-height: 1.25 !important; }
                .response-score-header > div > div > p { line-height: 1.5 !important; }
                .response-score-summary { margin-top: 12px !important; padding: 12px !important; border-radius: 16px !important; }
                .response-score-summary .text-4xl { font-size: 30px !important; line-height: 1 !important; }
                .response-score-scroll { padding: 12px 10px 12px 16px !important; scrollbar-width: thin; }
                .response-score-scroll::-webkit-scrollbar { width: 7px; }
                .response-score-scroll::-webkit-scrollbar-thumb { border-width: 1px; min-height: 42px; }
                .response-score-scroll::-webkit-scrollbar-track { margin: 6px 0; }
                .response-score-card { padding: 12px !important; border-radius: 16px !important; }
                .response-score-list { gap: 9px !important; }
                .response-score-card .mt-3 { margin-top: 8px !important; }
                .response-score-footer { padding: 10px 16px !important; }
                .response-score-footer button { padding: 8px 16px !important; }
              }
            `}</style>
            <div className="response-score-shell flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[30px] border border-cyan-300/20 bg-slate-950 text-white shadow-[0_36px_120px_rgba(2,6,23,0.75)]">
              <div className="response-score-header shrink-0 border-b border-slate-800 bg-slate-950/95 px-5 py-5 sm:px-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">Response transparency</span>
                    <h3 className="mt-3 text-xl font-black sm:text-2xl">How {selectedLabel} gets its response logic score</h3>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-300">Each factor below shows the barangay's current value, why it receives those points, and the other possible ranges.</p>
                  </div>
                  <button type="button" onClick={() => setResponseScoreBreakdownOpen(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-lg font-black text-slate-300 transition hover:border-cyan-400/40 hover:bg-slate-800 hover:text-white" aria-label="Close response score calculation">×</button>
                </div>
                <div className="response-score-summary mt-4 rounded-[20px] border border-cyan-400/20 bg-gradient-to-r from-cyan-400/10 to-indigo-400/10 p-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div><p className="text-[11px] font-black uppercase tracking-[0.15em] text-cyan-200">Response logic score</p><div className="mt-1 flex items-end gap-2"><span className="text-4xl font-black">{formatNumber(responseScoreBreakdown.total)}</span><span className="pb-1 text-sm font-bold text-slate-300">points</span></div></div>
                    <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs font-bold text-slate-300">{selectedPriority}</span>
                  </div>
                  <p className="mt-3 text-sm font-semibold leading-6 text-slate-200">{responseScoreBreakdown.items.map((item) => `${item.points >= 0 ? '+' : ''}${item.points} ${item.label.replace('Combined priority contribution', 'Priority')}`).join('  +  ').replaceAll('+ -', '− ')} = {formatNumber(responseScoreBreakdown.total)}</p>
                </div>
              </div>

              <div className="response-score-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                <div className="response-score-list space-y-3">
                  {responseScoreBreakdown.items.map((item, index) => (
                    <div key={item.label} className="response-score-card rounded-[20px] border border-slate-800 bg-slate-900/75 p-4 sm:p-5">
                      <div className="flex items-start gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/10 text-xs font-black text-cyan-200">{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-base font-black text-white">{item.label}</p><p className="mt-1 text-sm font-semibold text-slate-300">Current value: <span className="text-white">{item.value}</span></p></div><span className="shrink-0 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-sm font-black text-cyan-100">{item.points >= 0 ? '+' : ''}{item.points} {Math.abs(item.points) === 1 ? 'point' : 'points'}</span></div>
                          <div className="mt-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.07] px-3.5 py-3"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-300">Why this score?</p><p className="mt-1 text-sm leading-6 text-slate-200">{item.why}</p></div>
                          <div className="mt-3 overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/35">
                            <div className="grid grid-cols-[1fr_auto] border-b border-slate-700/80 bg-slate-800/70 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-300">
                              <span>Scoring guide</span><span className="pl-4 text-right">Points</span>
                            </div>
                            <div className="divide-y divide-slate-800">
                              {(item.guideRows || []).map((row, rowIndex) => (
                                <div key={`${item.label}-guide-${rowIndex}`} className={`grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5 text-xs sm:text-sm ${row.current ? 'bg-cyan-400/10 text-cyan-50' : 'text-slate-300'}`}>
                                  <span className="min-w-0 font-semibold">{row.range}{row.current && <span className="ml-2 inline-flex rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-cyan-200">Current</span>}</span>
                                  <span className={`min-w-[54px] text-right font-black ${row.current ? 'text-cyan-200' : 'text-slate-200'}`}>{row.points > 0 ? '+' : ''}{row.points}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-[20px] border border-amber-400/20 bg-amber-400/10 p-4 sm:p-5">
                  <p className="text-sm font-black text-amber-200">Why the response is “{selectedPriority}”</p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">The <strong>{formatNumber(responseScoreBreakdown.total)}-point score</strong> summarizes the conditions above. The response label is also determined by the system's decision rules, so the point total alone does not assign “{selectedPriority}”.</p>
                  {String(details?.risk || '').toLowerCase() === 'low' && String(selectedDecisionSupport?.trendDirection || selectedTrend || '').toLowerCase().includes('increas') && (
                    <p className="mt-2 rounded-xl border border-amber-300/15 bg-slate-950/30 px-3.5 py-3 text-sm leading-6 text-slate-200"><strong className="text-white">For {selectedLabel}:</strong> the current risk is <strong>Low</strong>, but the historical trend is <strong>Increasing</strong>. That condition triggers closer monitoring under the current Early Warning Watch rule.</p>
                  )}
                </div>
              </div>

              <div className="response-score-footer shrink-0 border-t border-slate-800 bg-slate-950/95 px-5 py-4 sm:px-6"><div className="flex justify-end"><button type="button" onClick={() => setResponseScoreBreakdownOpen(false)} className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-black text-white transition hover:border-cyan-400/40 hover:bg-slate-800">Close</button></div></div>
            </div>
          </div>,
          document.body
        )}


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

          <div className="map-selected-panel-body max-h-[calc(100vh-150px)] overflow-y-auto p-6">
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

            <div className="mt-5 grid grid-cols-2 gap-2 rounded-[20px] border border-slate-200/80 bg-slate-100/80 p-1.5 dark:border-slate-700 dark:bg-slate-900/80">
              <button
                type="button"
                onClick={() => setSelectedPanelView('overview')}
                className={`rounded-[15px] px-4 py-2.5 text-sm font-black transition ${
                  selectedPanelView === 'overview'
                    ? 'bg-white text-brand-blue shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-blue-300 dark:ring-slate-700'
                    : 'text-brand-muted hover:text-brand-text dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Barangay Overview
              </button>
              <button
                type="button"
                onClick={() => setSelectedPanelView('hotspot')}
                className={`rounded-[15px] px-4 py-2.5 text-sm font-black transition ${
                  selectedPanelView === 'hotspot'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-brand-muted hover:text-brand-text dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Hotspot Analysis
              </button>
            </div>

            {selectedPanelView === 'overview' && (
              <>
            <div className="map-mobile-selected-metrics mt-5 grid gap-3 sm:grid-cols-2">
              {overviewSelectedMetrics.map((metric) => {
                const Icon = metric.icon

                return (
                  <div
                    key={metric.label}
                    role={metric.onClick ? 'button' : undefined}
                    tabIndex={metric.onClick ? 0 : undefined}
                    onClick={metric.onClick || undefined}
                    onKeyDown={metric.onClick ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); metric.onClick() } } : undefined}
                    className={`group relative min-h-[144px] overflow-hidden rounded-[26px] border border-white/[0.80] bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.10),transparent_42%),linear-gradient(145deg,#ffffff,#f8fafc_68%,#eff6ff)] p-4 shadow-[0_14px_38px_rgba(15,23,42,0.07)] ring-1 ring-slate-200/60 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_50px_rgba(15,23,42,0.12)] dark:border-slate-800/80 dark:bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.10),transparent_42%),linear-gradient(145deg,#0f172a,#020617_70%,#082f49)] dark:ring-white/5 ${metric.onClick ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400/70' : ''}`}
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
                    {metric.helper && <p className="mt-2 text-[11px] font-bold text-indigo-600 dark:text-indigo-300">{metric.helper} →</p>}
                  </div>
                )
              })}
            </div>

            <div className="mt-4 rounded-[24px] border border-amber-100 bg-gradient-to-br from-amber-50 via-orange-50 to-white p-4 shadow-sm dark:border-amber-500/20 dark:from-amber-500/10 dark:via-slate-900 dark:to-slate-950 dark:shadow-none">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.14em] text-brand-orange dark:text-amber-300">Recommended response</p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-brand-muted dark:text-slate-400">Based on forecast, trend, risk level, rainfall, temperature, humidity, population count, and density.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setResponseTransparencyOpen(true)}
                  className="group w-full rounded-[18px] border border-amber-200/90 bg-white/75 px-3.5 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-300/70 sm:w-[178px] dark:border-amber-400/20 dark:bg-amber-400/[0.07] dark:hover:border-amber-400/35 dark:hover:bg-amber-400/[0.11]"
                  aria-label={`View why ${selectedLabel} is classified as ${selectedPriority}`}
                >
                  <span className="block text-[9px] font-black uppercase tracking-[0.16em] text-amber-600/80 dark:text-amber-300/70">Response priority</span>
                  <span className={`mt-1.5 inline-flex w-fit rounded-full border px-2.5 py-1 text-[10px] font-black leading-4 ${getPriorityBadgeStyle(selectedPriority)}`}>{selectedPriority}</span>
                  <span className="mt-2 flex items-center justify-between gap-2 border-t border-amber-200/70 pt-2 text-[11px] font-black text-amber-700 dark:border-amber-400/15 dark:text-amber-200">
                    <span>Why this response?</span>
                    <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span>
                  </span>
                </button>
              </div>
              <p className="mt-3 text-base font-semibold leading-7 text-brand-text dark:text-slate-200">{selectedRecommendation}</p>
              {selectedActionPlan.length > 0 && (
                <div className="mt-5 rounded-[22px] border border-white/[0.85] bg-white/[0.82] p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400">Response plan</p>
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">{selectedActionPlan.length} actions</span>
                  </div>
                  <ul className="mt-3 space-y-2.5 text-sm font-semibold leading-6 text-brand-text dark:text-slate-200">
                    {selectedActionPlan.map((item, index) => (
                      <li key={`${item}-${index}`} className="flex gap-3 rounded-2xl border border-slate-200/80 bg-white/70 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-900/55">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-black text-brand-orange dark:bg-amber-400/10 dark:text-amber-200">{index + 1}</span>
                        <span className="min-w-0 pt-0.5">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
              </>
            )}

            {selectedPanelView === 'hotspot' && (
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
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {[
                        { key: 'local', label: 'Local barangay risk', weight: hotspotConfig.local_weight, score: selectedHotspot.base_risk_score, violet: false },
                        { key: 'nearby', label: 'Nearby barangay influence', weight: hotspotConfig.nearby_weight, score: selectedHotspot.neighbor_influence_score, violet: false },
                        { key: 'spatial', label: 'Spatial concentration', weight: hotspotConfig.spatial_weight, score: selectedHotspot.spatial_concentration_score, violet: false },
                        { key: 'final', label: 'Final hotspot score', weight: null, score: selectedHotspot.hotspot_score, violet: true },
                      ].map((card) => (
                        <button
                          key={card.key}
                          type="button"
                          onClick={() => setHotspotCalculationOpen(card.key)}
                          className={`group rounded-[20px] border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-400/50 ${card.violet ? 'border-violet-200 bg-violet-50/90 dark:border-violet-500/25 dark:bg-violet-500/10' : 'border-white/[0.80] bg-white/[0.85] dark:border-slate-700 dark:bg-slate-950/70'}`}
                          aria-label={`View ${card.label} calculation`}
                        >
                          <p className={`text-xs font-black uppercase tracking-[0.12em] ${card.violet ? 'text-violet-700 dark:text-violet-300' : 'text-brand-muted dark:text-slate-400'}`}>
                            {card.label}{card.weight != null ? ` · ${card.weight}%` : ''}
                          </p>
                          <p className="mt-2 text-2xl font-black text-brand-text dark:text-slate-100">{formatHotspotScore(card.score)}</p>
                          <p className={`mt-2 text-[11px] font-black uppercase tracking-[0.10em] ${card.violet ? 'text-violet-600 dark:text-violet-300' : 'text-cyan-700 dark:text-cyan-300'}`}>View calculation →</p>
                        </button>
                      ))}
                    </div>

                    <div className="mt-3 rounded-[20px] border border-violet-100 bg-violet-50/70 p-4 text-sm font-semibold leading-6 text-brand-muted dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-slate-300">
                      <span className="font-black text-violet-700 dark:text-violet-300">What this means:</span>{' '}
                      The three spatial indicators above are combined into the final hotspot score. {selectedLabel} is currently classified as {getHotspotLevelLabel(selectedHotspot.hotspot_level)}. Detailed weights and thresholds remain available in Configurations for CHO/Admin review.
                    </div>

                    <div className="mt-3 rounded-[20px] border border-white/[0.80] bg-white/[0.85] p-4 dark:border-slate-700 dark:bg-slate-950/70">
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-brand-muted dark:text-slate-400">
                        Nearby barangay used
                      </p>
                      <p className="mt-2 text-base font-black leading-6 text-brand-text dark:text-slate-100">
                        {getHotspotInfluenceLabel(selectedHotspot)}
                      </p>
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

            )}

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
          className="government-hero-dark-image pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-center opacity-95"
          style={{ objectPosition: '58% center' }}
        />

        <img
          src={mapLightHeroBackground}
          alt=""
          aria-hidden="true"
          draggable="false"
          className="government-hero-light-image pointer-events-none absolute inset-0 hidden h-full w-full select-none object-cover"
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
              <InformationTypeBadge type="decision" className="border-amber-300/20 bg-amber-300/10 text-amber-100 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100" />
            </div>

            <h1 className="dengue-hero-title mt-6 max-w-3xl text-[2.2rem] font-bold leading-[1.08] tracking-[-0.035em] text-white drop-shadow-[0_6px_26px_rgba(2,6,23,0.70)] sm:text-[3.15rem] xl:text-[3.75rem]">
              Turn barangay risk into a clear spatial response.
            </h1>

            <p className="dengue-hero-copy mt-5 max-w-2xl text-sm font-medium leading-7 text-slate-200/[0.92] sm:text-[15px] sm:leading-8">
              {realHotspotReady
                ? 'Review dengue pressure, nearby barangay influence, hotspot concentration, and map-based response priorities from one coordinated view.'
                : usingMultiSourceRisk
                  ? 'Explore barangay risk using dengue cases, weather pressure, population exposure, density, and the uploaded map boundary.'
                  : usingBackendForecast
                    ? 'Explore saved forecast results across Butuan barangays and connect each risk result to its geographic area.'
                    : 'Upload and validate dengue records and barangay boundaries to activate risk colors, hotspot analysis, and response guidance.'}
            </p>

            <div className="map-hero-actions mt-7 flex flex-wrap gap-3">
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

          <div className="map-hero-selected-card w-full self-end justify-self-end lg:max-w-[400px]">
            <div className="relative overflow-hidden rounded-[30px] border border-white/15 bg-slate-950/[0.62] p-5 text-white shadow-[0_28px_76px_rgba(2,6,23,0.52)] ring-1 ring-white/5 backdrop-blur-2xl sm:p-6">
              <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-cyan-300/15 blur-3xl" />
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/60 to-transparent" />

              <div className="relative flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/75">Selected map area</p>
                  <h2 className="mt-2 truncate text-2xl font-black tracking-[-0.03em]">{selectedLabel}</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-400">Current view: {activeMapStyle.label}</p>
                </div>

                <div className="map-hero-score-card w-[118px] shrink-0 rounded-[20px] border border-white/15 bg-white/[0.07] px-3.5 py-3 text-center shadow-[0_14px_32px_rgba(2,6,23,0.22)] backdrop-blur-xl sm:w-[132px] sm:px-4 sm:py-3.5">
                  <span className="block whitespace-nowrap text-[20px] font-black leading-none tracking-[-0.04em] text-white sm:text-[22px]">
                    {formatNumber(selectedHeroScore)}/100
                  </span>
                  <span className="mt-2 block text-[9px] font-black uppercase leading-[1.15] tracking-[0.11em] text-cyan-100/75 sm:text-[10px]">
                    <span className="block">{showingHotspotLayer ? 'Hotspot' : 'Priority'}</span>
                    <span className="mt-0.5 block">Score</span>
                  </span>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-cyan-300 transition-[width] duration-300"
                      style={{ width: `${Math.max(0, Math.min(100, Number(selectedHeroScore) || 0))}%` }}
                    />
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

            </div>
          </div>
        </div>
      </section>

      <div
        className={
          isMapExpanded
            ? 'grid gap-6'
            : 'grid items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.75fr)]'
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

              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
                  {showingHotspotLayer ? 'Barangay GIS hotspot map' : 'Barangay forecast risk map'}
                </h2>
                <InformationTypeBadge type={showingHotspotLayer ? 'decision' : 'forecast'} />
              </div>

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

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[20px] border border-violet-200 bg-violet-50/80 p-3.5 dark:border-violet-400/20 dark:bg-violet-500/10">
              <div className="flex flex-wrap items-center gap-2">
                <InformationTypeBadge type="forecast" />
                <p className="text-sm font-bold text-violet-900 dark:text-violet-100">Forecast risk</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-violet-800/80 dark:text-violet-200/80">Predicted dengue risk for each barangay based on the saved forecast and supporting data.</p>
            </div>
            <div className="rounded-[20px] border border-amber-200 bg-amber-50/80 p-3.5 dark:border-amber-400/20 dark:bg-amber-500/10">
              <div className="flex flex-wrap items-center gap-2">
                <InformationTypeBadge type="decision" label="Spatial hotspot" />
                <p className="text-sm font-bold text-amber-900 dark:text-amber-100">Hotspot</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-amber-800/80 dark:text-amber-200/80">Spatial concern based on the barangay&apos;s local risk and the influence of nearby barangays.</p>
            </div>
          </div>

          <div className="map-workspace-shell relative mt-5 overflow-hidden rounded-[32px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.13),transparent_36%),linear-gradient(145deg,#f8fafc,#ffffff_58%,#eff6ff)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_18px_46px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.10),transparent_36%),linear-gradient(145deg,#020617,#0f172a_58%,#082f49)]">
            <div className="map-workspace-toolbar mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.16em] text-brand-muted dark:text-slate-500">
                  Barangay monitoring map
                </div>

                <p className="mt-1 text-sm font-semibold leading-6 text-brand-muted dark:text-slate-500">
                  Current map view: {activeMapStyle.label}
                </p>
              </div>

              <div className="map-workspace-controls flex flex-col gap-2 xl:items-end">
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

            {!isBhwMap && (
              <div ref={barangaySearchRef} className="relative z-[2000] mb-3">
              <div className="relative overflow-visible rounded-[24px] border border-cyan-200/80 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.15),transparent_42%),linear-gradient(145deg,#ffffff,#f8fafc_58%,#ecfeff)] p-3 shadow-[0_14px_36px_rgba(14,165,233,0.10)] ring-1 ring-white/80 dark:border-cyan-500/20 dark:bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.10),transparent_42%),linear-gradient(145deg,#07111f,#0f172a_58%,#082f49)] dark:ring-white/5 sm:p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-200 bg-cyan-50 text-cyan-700 shadow-[0_8px_18px_rgba(14,165,233,0.12)] dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-200">
                      <Search className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-950 dark:text-white">Search a barangay on the map</p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Choose a barangay to focus the map and open its current risk details.</p>
                    </div>
                  </div>

                  <span className="w-fit shrink-0 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-700 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-200">
                    {searchableBarangays.length} searchable barangays
                  </span>
                </div>

                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-cyan-600 dark:text-cyan-300" />
                  <input
                    type="search"
                    value={barangaySearch}
                    onChange={(event) => {
                      setBarangaySearch(event.target.value)
                      setBarangaySearchOpen(true)
                    }}
                    onFocus={() => setBarangaySearchOpen(true)}
                    onKeyDown={handleBarangaySearchKeyDown}
                    placeholder="Search barangay, e.g. Ampayon, Libertad, Port Poyohon..."
                    className="h-12 w-full rounded-[18px] border border-slate-200 bg-white pl-11 pr-12 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100/70 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-cyan-400/50 dark:focus:ring-cyan-400/10"
                    aria-label="Search barangay on map"
                    autoComplete="off"
                  />

                  {barangaySearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setBarangaySearch('')
                        setBarangaySearchOpen(false)
                      }}
                      className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
                      aria-label="Clear barangay search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}

                  {barangaySearchOpen && barangaySearch.trim() && (
                    <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[2100] overflow-hidden rounded-[22px] border border-cyan-200/90 bg-white/98 shadow-[0_24px_60px_rgba(15,23,42,0.22)] backdrop-blur-xl dark:border-cyan-500/20 dark:bg-slate-950/98">
                      {filteredBarangaySearch.length > 0 ? (
                        <div className="p-2">
                          <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Matching barangays</p>
                            <span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-black text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200">Press Enter for first match</span>
                          </div>

                          <div className="grid gap-1 sm:grid-cols-2">
                            {filteredBarangaySearch.map((name) => {
                              const row = activeMapRows.find((candidate) => namesMatch(candidate?.barangay, name))
                              const isSelected = namesMatch(selected, name)

                              return (
                                <button
                                  key={name}
                                  type="button"
                                  onClick={() => handleBarangaySearchSelect(name)}
                                  className={`flex items-center justify-between gap-3 rounded-[16px] border px-3 py-2.5 text-left transition ${
                                    isSelected
                                      ? 'border-cyan-300 bg-cyan-50 text-cyan-900 ring-2 ring-cyan-500/10 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-100'
                                      : 'border-transparent bg-slate-50/80 text-slate-800 hover:border-cyan-200 hover:bg-cyan-50/70 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-cyan-400/20 dark:hover:bg-cyan-400/10'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-black">{name}</p>
                                    <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                      {row
                                        ? showingHotspotLayer
                                          ? `${getHotspotLevelLabel(row.hotspot_level || row.hotspotLevel || 'Not checked')} · Hotspot score ${formatHotspotScore(row.hotspot_score || row.hotspotScore)}`
                                          : `${row.risk || 'Risk pending'} · Forecast ${formatNumber(row.forecast || row.forecastedCases || row.predictedCases || 0)} cases`
                                        : 'Barangay boundary available'}
                                    </p>
                                  </div>

                                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black ${
                                    isSelected
                                      ? 'border-cyan-300 bg-white text-cyan-700 dark:border-cyan-400/30 dark:bg-slate-900 dark:text-cyan-200'
                                      : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400'
                                  }`}>
                                    {isSelected ? 'Selected' : 'Focus'}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 text-center">
                          <p className="text-sm font-black text-slate-800 dark:text-slate-100">No barangay found</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Check the spelling or try a shorter barangay name.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {selected && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
                      <Crosshair className="h-3.5 w-3.5" />
                      Map focused on {selected}
                    </span>
                    <span>{isBhwMap ? 'Neighboring colored polygons are read-only spatial context.' : 'Click another result or map polygon to change the selected barangay.'}</span>
                  </div>
                )}
              </div>
            </div>

            )}

            {isBhwMap && (
              <div className="mb-3 flex flex-col gap-2 rounded-[22px] border border-slate-300/80 bg-slate-100/90 px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-700 dark:text-slate-200">Assigned barangay map view</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                    {assignedBarangay || 'Your assigned barangay'} stays emphasized with a bright outline. Immediate neighboring barangays show their forecast or saved hotspot colors as read-only spatial context, while the rest of Butuan stays gray.
                  </p>
                  {bhwLocalMapError ? (
                    <p className="mt-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">{bhwLocalMapError} The assigned-area view is still available.</p>
                  ) : null}
                </div>
                <span className="w-fit shrink-0 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-700 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-200">
                  {bhwLocalMapLoading ? 'Loading nearby' : `${bhwNeighborCount} nearby · read-only`}
                </span>
              </div>
            )}

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
              <>
                {showingHotspotLayer && (
                  <div className="border-t border-slate-100 px-4 pt-4 dark:border-slate-800">
                    <details className="group overflow-hidden rounded-[22px] border border-violet-100 bg-violet-50/70 shadow-sm dark:border-violet-500/20 dark:bg-violet-500/10">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300">How the hotspot score and level are calculated</p>
                          <p className="mt-1 text-xs leading-5 text-brand-muted dark:text-slate-400">Open to review the three weighted score components and the thresholds used to assign a hotspot level.</p>
                        </div>
                        <ChevronDown className="h-5 w-5 shrink-0 text-violet-600 transition-transform group-open:rotate-180 dark:text-violet-300" />
                      </summary>
                      <div className="border-t border-violet-100 px-4 py-4 dark:border-violet-500/20">
                        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-text dark:text-slate-100">How the hotspot score is calculated</p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          {[
                            { weight: `${hotspotConfig.local_weight}%`, label: 'Local / Barangay Risk', note: "The selected barangay's own dengue risk contributes the largest share of the hotspot score." },
                            { weight: `${hotspotConfig.nearby_weight}%`, label: 'Nearby Barangay Influence', note: 'Risk from nearby barangays contributes to the spatial hotspot score.' },
                            { weight: `${hotspotConfig.spatial_weight}%`, label: 'Spatial Concentration', note: 'Measures how concentrated dengue risk is around the selected barangay.' },
                          ].map((component) => (
                            <div key={component.label} className="rounded-[18px] border border-white/80 bg-white/90 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
                              <p className="text-lg font-black text-violet-700 dark:text-violet-300">{component.weight}</p>
                              <p className="mt-1 text-xs font-black text-brand-text dark:text-slate-100">{component.label}</p>
                              <p className="mt-1 text-[11px] leading-5 text-brand-muted dark:text-slate-400">{component.note}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 rounded-[18px] border border-violet-100 bg-white/70 px-3 py-2 text-center text-xs font-black text-violet-700 dark:border-violet-500/20 dark:bg-slate-950/40 dark:text-violet-300">
                          {hotspotConfig.local_weight}% Local Risk + {hotspotConfig.nearby_weight}% Nearby Influence + {hotspotConfig.spatial_weight}% Spatial Concentration = Hotspot Score / 100
                        </div>

                        <p className="mt-5 text-[11px] font-black uppercase tracking-[0.14em] text-brand-text dark:text-slate-100">How the score becomes a hotspot level</p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                          {[
                            { label: 'Low Spatial Concern', range: `< ${hotspotConfig.watch_threshold}` },
                            { label: 'Watch Area', range: `${hotspotConfig.watch_threshold}–${hotspotConfig.emerging_threshold - 0.01}` },
                            { label: 'Emerging Hotspot', range: `${hotspotConfig.emerging_threshold}–${hotspotConfig.confirmed_threshold - 0.01}` },
                            { label: 'Confirmed Hotspot', range: `≥ ${hotspotConfig.confirmed_threshold}` },
                          ].map((threshold) => (
                            <div key={threshold.label} className="rounded-[18px] border border-white/80 bg-white/90 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
                              <p className="text-sm font-black text-brand-text dark:text-slate-100">{threshold.range}</p>
                              <p className="mt-1 text-xs font-black text-violet-700 dark:text-violet-300">{threshold.label}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <p className="border-t border-violet-100 px-4 py-3 text-[11px] leading-5 text-brand-muted dark:border-violet-500/20 dark:text-slate-400">
                        Needs Map Review is not a numeric hotspot level. It appears when the barangay cannot be reliably matched to the uploaded map boundary.
                      </p>
                    </details>
                  </div>
                )}
                <div className={`map-mobile-legend-grid grid gap-3 ${showingHotspotLayer ? '' : 'border-t'} border-slate-100 px-4 py-4 dark:border-slate-800 ${showingHotspotLayer ? 'sm:grid-cols-2 xl:grid-cols-5' : 'sm:grid-cols-3'}`}>
                {activeLegendItems.map((item) => {
                  const Icon = item.icon

                  return (
                    <div
                      key={item.key}
                      className="map-legend-card group relative overflow-hidden rounded-[22px] border border-white/[0.80] bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.08),transparent_45%),linear-gradient(145deg,#ffffff,#f8fafc)] p-3 shadow-[0_10px_28px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/55 transition hover:-translate-y-0.5 hover:shadow-[0_16px_38px_rgba(15,23,42,0.11)] dark:border-slate-800 dark:bg-[linear-gradient(145deg,#0f172a,#020617)] dark:ring-white/5 before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-gradient-to-r before:from-cyan-500 before:via-blue-500 before:to-transparent"
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
              </>
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
            className={`map-side-visual group relative self-start overflow-hidden rounded-[32px] border border-cyan-400/20 bg-black shadow-[0_28px_78px_rgba(2,6,23,0.30)] ring-1 ring-white/10 ${
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

          <div className="map-priority-panel relative overflow-hidden rounded-[36px] border border-white/[0.80] bg-white/[0.94] p-5 shadow-[0_26px_78px_rgba(15,23,42,0.10)] ring-1 ring-slate-200/60 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-950/[0.88] dark:ring-white/5 sm:p-6">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              <Navigation className="h-3.5 w-3.5" />
              Priority barangays
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
                {showingHotspotLayer ? 'Hotspot summary' : 'Forecast priority summary'}
              </h2>
              <InformationTypeBadge type={showingHotspotLayer ? 'decision' : 'forecast'} />
            </div>

            <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
              {showingHotspotLayer
                ? 'Top barangays are ranked using hotspot score, nearby barangay effects, and barangay map matching.'
                : usingMultiSourceRisk
                  ? 'Top barangays are ranked by forecast risk, combined priority score, response priority, and forecast cases. The combined priority score is the overall planning priority from forecast and supporting factors.'
                  : usingBackendForecast
                    ? 'Top barangays are ranked by forecast risk, combined priority score, response priority, and forecast cases.'
                    : 'Top barangays will appear after forecast risk levels are calculated.'}
            </p>

            <div className="map-priority-list mt-5 space-y-3">
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
                            : `Combined priority score: ${formatRiskScore(getOverallRiskScore(row))}`}
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
            font-size: 0.8125rem !important;
            line-height: 1.3 !important;
          }

          .map-mobile-compact > section:first-of-type h1 + p {
            margin-top: 0.55rem !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
            font-size: 0.8125rem !important;
            line-height: 1.35 !important;
          }

          .map-mobile-compact .inline-flex.items-center.gap-2.rounded-full.border,
          .map-mobile-compact .mb-4.inline-flex,
          .map-mobile-compact .mb-2.inline-flex,
          .map-mobile-compact .mb-3.inline-flex {
            padding: 0.32rem 0.58rem !important;
            font-size: 0.8125rem !important;
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
            font-size: 0.8125rem !important;
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
            font-size: 0.8125rem !important;
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

          .map-mobile-compact #hotspot-map .map-workspace-controls > .flex.flex-wrap.gap-2 {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 0.35rem !important;
          }

          .map-mobile-compact #hotspot-map .map-workspace-controls > .flex.flex-wrap.gap-2 > div,
          .map-mobile-compact #hotspot-map .map-workspace-controls > .flex.flex-wrap.gap-2 > span {
            width: 100% !important;
            max-width: 100% !important;
            padding: 0.34rem 0.45rem !important;
            font-size: 0.8125rem !important;
            line-height: 1.08 !important;
            text-align: center !important;
            white-space: normal !important;
          }

          .map-mobile-compact #hotspot-map .map-control-stack {
            width: 100% !important;
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.35rem !important;
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
            font-size: 0.8125rem !important;
            letter-spacing: 0.055em !important;
          }

          .map-mobile-compact #hotspot-map .map-layer-toggle button svg,
          .map-mobile-compact #hotspot-map .map-style-toggle button svg {
            width: 0.72rem !important;
            height: 0.72rem !important;
          }

          .map-mobile-compact #hotspot-map .map-hotspot-button {
            grid-column: 1 / -1 !important;
            width: 100% !important;
            min-height: 38px !important;
            justify-content: center !important;
            border-radius: 13px !important;
            padding: 0.5rem !important;
            font-size: 0.8125rem !important;
            letter-spacing: 0.06em !important;
          }

          .map-mobile-compact #hotspot-map .map-hotspot-button svg {
            width: 0.8rem !important;
            height: 0.8rem !important;
          }

          /* Mobile map canvas: keep the actual interactive map tall enough to use.
             Target the semantic canvas classes directly so later compact rules cannot
             accidentally collapse it back to a short 270-420px strip. */
          .map-mobile-compact #hotspot-map .map-workspace-canvas-compact {
            height: clamp(500px, 68dvh, 620px) !important;
            min-height: 500px !important;
            max-height: 620px !important;
            border-radius: 18px !important;
            padding: 0.35rem !important;
          }

          .map-mobile-compact #hotspot-map .map-workspace-canvas-expanded {
            height: clamp(650px, 82dvh, 800px) !important;
            min-height: 650px !important;
            max-height: 800px !important;
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
            font-size: 0.8125rem !important;
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
            font-size: 0.8125rem !important;
          }

          .map-mobile-compact .mt-5.space-y-3 button span.font-black {
            font-size: 0.8125rem !important;
            line-height: 1.08 !important;
          }

          .map-mobile-compact .mt-5.space-y-3 button p {
            margin-top: 0.1rem !important;
            font-size: 0.8125rem !important;
            line-height: 1.14 !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 1;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
          }

          .map-mobile-compact .mt-5.space-y-3 button > span:last-child {
            padding: 0.35rem 0.5rem !important;
            font-size: 0.8125rem !important;
          }

          .map-mobile-compact .rounded-[26px].border.border-blue-100,
          .map-mobile-compact .rounded-[24px].border.border-blue-100,
          .map-mobile-compact .rounded-[24px].border.border-violet-100,
          .map-mobile-compact .rounded-[24px].border.border-slate-200,
          .map-mobile-compact .rounded-[24px].border.border-amber-100 {
            padding: 0.62rem !important;
            border-radius: 15px !important;
          }

          .map-mobile-compact .text-2xl { font-size: 1.2rem !important; line-height: 1.16 !important; }
          .map-mobile-compact .text-xl { font-size: 1.1rem !important; line-height: 1.16 !important; }
          .map-mobile-compact .text-lg { font-size: 1rem !important; line-height: 1.2 !important; }
          .map-mobile-compact .text-base { font-size: 0.9rem !important; line-height: 1.32 !important; }
          .map-mobile-compact .text-sm { font-size: 0.875rem !important; line-height: 1.35 !important; }
          .map-mobile-compact .text-xs { font-size: 0.8125rem !important; line-height: 1.3 !important; }
          .map-mobile-compact .text-[11px] { font-size: 0.8125rem !important; line-height: 1.25 !important; }

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
            font-size: 0.8125rem !important;
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
            font-size: 0.8125rem !important;
            line-height: 1.1 !important;
            letter-spacing: 0.06em !important;
          }

          .map-selected-panel .map-mobile-selected-metrics p:last-of-type {
            margin-top: 0.35rem !important;
            font-size: 0.8125rem !important;
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
            font-size: 0.8125rem !important;
          }
        }

        /* =========================================================
           FINAL MAP RESPONSIVE STABILIZATION
           Page-local only. Keeps the global Leaflet/app-shell rules
           in index.css unchanged.
           ========================================================= */
        @media (max-width: 639px) {
          .map-mobile-compact {
            width: 100% !important;
            max-width: 100% !important;
            overflow-x: hidden !important;
            border-radius: 22px !important;
            padding-bottom: 1rem !important;
          }

          /* HERO: remove desktop minimum height and keep real content visible. */
          .map-mobile-compact .premium-map-hero {
            min-height: 0 !important;
            border-radius: 24px !important;
            padding: 0 !important;
          }

          .map-mobile-compact .premium-map-hero > .relative.z-10 {
            min-height: 0 !important;
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 1rem !important;
            padding: 1rem !important;
          }

          .map-mobile-compact .premium-map-hero h1 {
            margin-top: 1rem !important;
            max-width: 100% !important;
            font-size: 1.9rem !important;
            line-height: 1.04 !important;
            letter-spacing: -0.045em !important;
          }

          .map-mobile-compact .premium-map-hero h1 + p {
            display: block !important;
            margin-top: 0.75rem !important;
            overflow: visible !important;
            -webkit-line-clamp: unset !important;
            font-size: 0.8125rem !important;
            line-height: 1.5 !important;
          }

          /* Hero actions: 2-up on normal phones. */
          .map-mobile-compact .map-hero-actions {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.55rem !important;
            margin-top: 1rem !important;
          }

          .map-mobile-compact .map-hero-actions > button {
            width: 100% !important;
            min-width: 0 !important;
            min-height: 48px !important;
            padding: 0.7rem 0.6rem !important;
            font-size: 0.8125rem !important;
            line-height: 1.2 !important;
            white-space: normal !important;
          }

          /* Four hero metrics should be a real 2 x 2 grid, not 3 + 1. */
          .map-mobile-compact .map-mobile-hero-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.55rem !important;
            margin-top: 1rem !important;
          }

          .map-mobile-compact .map-mobile-hero-grid > div {
            min-width: 0 !important;
            min-height: 88px !important;
            border-radius: 17px !important;
            padding: 0.7rem !important;
          }

          .map-mobile-compact .map-mobile-hero-grid > div .relative.flex.items-center {
            align-items: flex-start !important;
          }

          .map-mobile-compact .map-mobile-hero-grid span {
            font-size: 0.8125rem !important;
            line-height: 1.15 !important;
            letter-spacing: 0.06em !important;
            overflow-wrap: break-word !important;
          }

          .map-mobile-compact .map-mobile-hero-grid p {
            margin-top: 0.45rem !important;
            font-size: 1.18rem !important;
            line-height: 1.05 !important;
          }

          /* Selected-area hero card: preserve detail instead of over-compressing. */
          .map-mobile-compact .map-hero-selected-card > div {
            border-radius: 20px !important;
            padding: 0.85rem !important;
          }

          .map-mobile-compact .map-hero-selected-card h2 {
            white-space: normal !important;
            overflow: visible !important;
            text-overflow: clip !important;
            font-size: 1.25rem !important;
            line-height: 1.15 !important;
          }

          .map-mobile-compact .map-hero-selected-card .relative.flex.h-20.w-20 {
            width: 4.25rem !important;
            height: 4.25rem !important;
          }

          .map-mobile-compact .map-hero-selected-card .relative.mt-5.grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.5rem !important;
          }

          .map-mobile-compact .map-hero-selected-card .relative.mt-5.grid > div {
            min-width: 0 !important;
            padding: 0.65rem !important;
          }

          .map-mobile-compact .map-hero-selected-card .relative.mt-5.grid p:first-child {
            font-size: 0.8125rem !important;
            line-height: 1.15 !important;
          }

          .map-mobile-compact .map-hero-selected-card .relative.mt-5.grid p:last-child {
            white-space: normal !important;
            overflow: visible !important;
            text-overflow: clip !important;
            font-size: 0.8125rem !important;
            line-height: 1.25 !important;
          }

          .map-mobile-compact .map-hero-selected-card .relative.mt-3.rounded-\[20px\] p:last-of-type {
            white-space: normal !important;
            overflow: visible !important;
            text-overflow: clip !important;
          }

          /* MAP WORKSPACE */
          .map-mobile-compact #hotspot-map {
            overflow: visible !important;
            border-radius: 20px !important;
            padding: 0.7rem !important;
          }

          .map-mobile-compact #hotspot-map > .flex:first-child {
            gap: 0.65rem !important;
          }

          .map-mobile-compact #hotspot-map h2 {
            font-size: 1.25rem !important;
            line-height: 1.15 !important;
          }

          .map-mobile-compact #hotspot-map h2 + p {
            font-size: 0.8125rem !important;
            line-height: 1.45 !important;
          }

          .map-mobile-compact #hotspot-map > .flex:first-child > .w-fit {
            width: 100% !important;
            text-align: center !important;
            white-space: normal !important;
            font-size: 0.8125rem !important;
          }

          .map-mobile-compact .map-workspace-shell {
            border-radius: 18px !important;
            padding: 0.55rem !important;
          }

          .map-mobile-compact .map-workspace-toolbar {
            gap: 0.65rem !important;
            margin-bottom: 0.6rem !important;
          }

          .map-mobile-compact .map-workspace-toolbar > div:first-child p {
            font-size: 0.8125rem !important;
            line-height: 1.35 !important;
          }

          .map-mobile-compact .map-workspace-controls {
            width: 100% !important;
          }

          /* Three state pills become 2 + 1 rather than three tiny chips. */
          .map-mobile-compact .map-workspace-controls > .flex.flex-wrap.gap-2 {
            display: grid !important;
            width: 100% !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.4rem !important;
          }

          .map-mobile-compact .map-workspace-controls > .flex.flex-wrap.gap-2 > div {
            width: 100% !important;
            min-width: 0 !important;
            padding: 0.45rem 0.5rem !important;
            font-size: 0.8125rem !important;
            line-height: 1.2 !important;
            white-space: normal !important;
            text-align: center !important;
          }

          .map-mobile-compact .map-workspace-controls > .flex.flex-wrap.gap-2 > div:last-child:nth-child(odd) {
            grid-column: 1 / -1 !important;
          }

          /* Overall map controls stack into comfortable groups. */
          .map-mobile-compact #hotspot-map .map-layer-toggle,
          .map-mobile-compact #hotspot-map .map-style-toggle {
            width: 100% !important;
            display: grid !important;
            gap: 0.35rem !important;
            padding: 0.3rem !important;
            border-radius: 14px !important;
          }

          .map-mobile-compact #hotspot-map .map-layer-toggle {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .map-mobile-compact #hotspot-map .map-style-toggle {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .map-mobile-compact #hotspot-map .map-layer-toggle button,
          .map-mobile-compact #hotspot-map .map-style-toggle button {
            min-width: 0 !important;
            min-height: 42px !important;
            justify-content: center !important;
            gap: 0.35rem !important;
            padding: 0.55rem 0.4rem !important;
            border-radius: 11px !important;
            font-size: 0.8125rem !important;
            line-height: 1.15 !important;
            letter-spacing: 0.06em !important;
          }

          .map-mobile-compact #hotspot-map .map-layer-toggle button svg,
          .map-mobile-compact #hotspot-map .map-style-toggle button svg {
            width: 0.9rem !important;
            height: 0.9rem !important;
          }

          /* Expand + Run Hotspot are full-width action buttons. */
          .map-mobile-compact #hotspot-map .map-workspace-controls > .flex:last-child {
            width: 100% !important;
          }

          .map-mobile-compact #hotspot-map .map-hotspot-button {
            width: 100% !important;
            min-height: 46px !important;
            justify-content: center !important;
            padding: 0.6rem 0.7rem !important;
            border-radius: 13px !important;
            font-size: 0.8125rem !important;
            line-height: 1.15 !important;
          }

          /* Map canvas: compact still large enough to interact with,
             expanded mode now actually grows on phones. */
          .map-mobile-compact #hotspot-map .map-workspace-canvas {
            width: 100% !important;
            min-width: 0 !important;
            border-radius: 18px !important;
            padding: 0.35rem !important;
          }

          .map-mobile-compact #hotspot-map .map-workspace-canvas-compact {
            height: clamp(480px, 64dvh, 580px) !important;
            min-height: 480px !important;
            max-height: 580px !important;
          }

          .map-mobile-compact #hotspot-map .map-workspace-canvas-expanded {
            height: clamp(650px, 82dvh, 780px) !important;
            min-height: 650px !important;
            max-height: 780px !important;
          }

          .map-mobile-compact #hotspot-map .map-workspace-canvas > .h-full {
            border-radius: 15px !important;
          }

          /* Map legend: 2 columns so names like "Low Spatial Concern"
             remain readable. */
          .map-mobile-compact .map-mobile-legend-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.5rem !important;
            padding: 0.65rem !important;
          }

          .map-mobile-compact .map-legend-card {
            min-width: 0 !important;
            min-height: 92px !important;
            border-radius: 15px !important;
            padding: 0.6rem !important;
          }

          .map-mobile-compact .map-legend-card .inline-flex {
            max-width: 100% !important;
            white-space: normal !important;
            padding: 0.35rem 0.5rem !important;
            font-size: 0.8125rem !important;
            line-height: 1.15 !important;
          }

          .map-mobile-compact .map-legend-card p {
            font-size: 0.8125rem !important;
            line-height: 1.3 !important;
          }

          /* Barangay map note: preserve useful 3 rows but don't squeeze into
             three columns on a phone. */
          .map-mobile-compact #hotspot-map .group.relative.mt-4.overflow-hidden.rounded-\[26px\] .mt-2.grid {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 0.3rem !important;
          }

          /* Side visual should not consume excessive vertical space. */
          .map-mobile-compact .map-side-visual {
            height: 220px !important;
            min-height: 220px !important;
            border-radius: 18px !important;
          }

          .map-mobile-compact .map-side-visual .absolute.bottom-0 {
            padding: 0.85rem !important;
          }

          .map-mobile-compact .map-side-visual h3 {
            font-size: 1rem !important;
          }

          .map-mobile-compact .map-side-visual p {
            display: -webkit-box !important;
            -webkit-line-clamp: 2 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
            font-size: 0.8125rem !important;
            line-height: 1.4 !important;
          }

          /* PRIORITY BARANGAYS: one full-width card per row. */
          .map-mobile-compact .map-priority-panel {
            border-radius: 20px !important;
            padding: 0.8rem !important;
          }

          .map-mobile-compact .map-priority-panel h2 {
            font-size: 1.25rem !important;
            line-height: 1.15 !important;
          }

          .map-mobile-compact .map-priority-panel h2 + p {
            font-size: 0.8125rem !important;
            line-height: 1.45 !important;
          }

          .map-mobile-compact .map-priority-list {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 0.6rem !important;
          }

          .map-mobile-compact .map-priority-list > button {
            min-width: 0 !important;
            border-radius: 17px !important;
            padding: 0.75rem !important;
            gap: 0.65rem !important;
          }

          .map-mobile-compact .map-priority-list > button .h-10.w-10 {
            width: 2.25rem !important;
            height: 2.25rem !important;
            border-radius: 12px !important;
            font-size: 0.8125rem !important;
          }

          .map-mobile-compact .map-priority-list > button span.font-black {
            font-size: 0.875rem !important;
            line-height: 1.2 !important;
          }

          .map-mobile-compact .map-priority-list > button p {
            display: block !important;
            overflow: visible !important;
            -webkit-line-clamp: unset !important;
            font-size: 0.8125rem !important;
            line-height: 1.35 !important;
          }

          .map-mobile-compact .map-priority-list > button > span:last-child {
            padding: 0.4rem 0.6rem !important;
            font-size: 0.8125rem !important;
            white-space: normal !important;
          }

          /* General supporting cards: restore readable phone typography.
             This intentionally overrides the earlier 0.5rem–0.6rem rules. */
          .map-mobile-compact p {
            font-size: 0.8125rem !important;
            line-height: 1.45 !important;
          }

          .map-mobile-compact .text-base {
            font-size: 0.875rem !important;
            line-height: 1.45 !important;
          }

          .map-mobile-compact .text-sm {
            font-size: 0.8125rem !important;
            line-height: 1.45 !important;
          }

          .map-mobile-compact .text-xs {
            font-size: 0.8125rem !important;
            line-height: 1.35 !important;
          }

          .map-mobile-compact .text-\[11px\] {
            font-size: 0.8125rem !important;
            line-height: 1.25 !important;
          }

          .map-mobile-compact .text-\[10px\] {
            font-size: 0.8125rem !important;
            line-height: 1.2 !important;
          }

          /* SELECTED BARANGAY PANEL = mobile bottom sheet.
             It no longer visually behaves like a draggable desktop window. */
          .map-selected-panel {
            left: 0.55rem !important;
            right: 0.55rem !important;
            top: auto !important;
            bottom: max(0.6rem, env(safe-area-inset-bottom)) !important;
            width: auto !important;
            max-width: none !important;
            max-height: calc(100dvh - max(1.2rem, env(safe-area-inset-top)) - max(1.2rem, env(safe-area-inset-bottom))) !important;
            border-radius: 22px !important;
          }

          .map-selected-panel > div:first-child {
            cursor: default !important;
            padding: 0.8rem !important;
          }

          .map-selected-panel > div:first-child p {
            display: none !important;
          }

          .map-selected-panel .map-selected-panel-body {
            max-height: calc(100dvh - 6rem - max(1rem, env(safe-area-inset-bottom))) !important;
            overflow-y: auto !important;
            overscroll-behavior: contain !important;
            -webkit-overflow-scrolling: touch !important;
            padding: 0.8rem !important;
          }

          .map-selected-panel h3 {
            font-size: 1.35rem !important;
            line-height: 1.12 !important;
          }

          .map-selected-panel > div:first-child .inline-flex {
            font-size: 0.8125rem !important;
          }

          .map-selected-panel .map-mobile-selected-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.5rem !important;
          }

          .map-selected-panel .map-mobile-selected-metrics > div {
            min-width: 0 !important;
            min-height: 104px !important;
            border-radius: 15px !important;
            padding: 0.65rem !important;
          }

          .map-selected-panel .map-mobile-selected-metrics .h-11.w-11 {
            display: flex !important;
            width: 2rem !important;
            height: 2rem !important;
            margin-bottom: 0.45rem !important;
            border-radius: 11px !important;
          }

          .map-selected-panel .map-mobile-selected-metrics .h-11.w-11 svg {
            width: 0.9rem !important;
            height: 0.9rem !important;
          }

          .map-selected-panel .map-mobile-selected-metrics p:first-of-type {
            font-size: 0.8125rem !important;
            line-height: 1.15 !important;
            letter-spacing: 0.05em !important;
          }

          .map-selected-panel .map-mobile-selected-metrics p:last-of-type {
            display: block !important;
            margin-top: 0.35rem !important;
            overflow: visible !important;
            -webkit-line-clamp: unset !important;
            font-size: 0.8125rem !important;
            line-height: 1.3 !important;
            overflow-wrap: break-word !important;
          }

          /* Hotspot detail 3-card rows become 2 + 1. */
          .map-selected-panel .map-mobile-field-grid-3 {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.5rem !important;
          }

          .map-selected-panel .map-mobile-field-grid-3 > div {
            min-width: 0 !important;
            border-radius: 14px !important;
            padding: 0.65rem !important;
          }

          .map-selected-panel .map-mobile-field-grid-3 > div:last-child:nth-child(odd) {
            grid-column: 1 / -1 !important;
          }

          .map-selected-panel p,
          .map-selected-panel span,
          .map-selected-panel li {
            font-size: 0.8125rem !important;
            line-height: 1.4 !important;
          }

          .map-selected-panel .flex.flex-wrap.gap-2 span {
            max-width: 100% !important;
            white-space: normal !important;
            padding: 0.4rem 0.6rem !important;
            font-size: 0.8125rem !important;
          }

          .map-selected-panel .text-base {
            font-size: 0.875rem !important;
            line-height: 1.45 !important;
          }

          .map-selected-panel .text-sm {
            font-size: 0.8125rem !important;
            line-height: 1.4 !important;
          }

          .map-selected-panel .text-xs {
            font-size: 0.8125rem !important;
            line-height: 1.3 !important;
          }
        }

        /* Very narrow phones: stack action buttons before they become cramped. */
        @media (max-width: 374px) {
          .map-mobile-compact .map-hero-actions {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .map-mobile-compact .map-mobile-hero-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .map-mobile-compact .map-workspace-controls > .flex.flex-wrap.gap-2 {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .map-mobile-compact .map-workspace-controls > .flex.flex-wrap.gap-2 > div:last-child:nth-child(odd) {
            grid-column: auto !important;
          }

          .map-selected-panel .map-mobile-selected-metrics,
          .map-selected-panel .map-mobile-field-grid-3 {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .map-selected-panel .map-mobile-field-grid-3 > div:last-child:nth-child(odd) {
            grid-column: auto !important;
          }
        }

        /* Tablets: keep map workspace stacked until the existing xl split. */
        @media (min-width: 640px) and (max-width: 1023px) {
          .map-mobile-compact .premium-map-hero > .relative.z-10 {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .map-mobile-compact .map-workspace-controls {
            width: 100% !important;
          }
        }


        /* =========================================================
           PHONE MAP CONTROL FIX
           Prevents the map layer/style controls from sharing one row
           and breaking labels into individual syllables.
           ========================================================= */
        @media (max-width: 639px) {
          .map-mobile-compact #hotspot-map .map-control-stack {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
            width: 100% !important;
            gap: 0.55rem !important;
            align-items: stretch !important;
          }

          /* Forecast / Hotspot */
          .map-mobile-compact #hotspot-map .map-control-stack > .map-layer-toggle {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            width: 100% !important;
            max-width: none !important;
            gap: 0.35rem !important;
            padding: 0.3rem !important;
          }

          /* Dark / Light / Street / Satellite */
          .map-mobile-compact #hotspot-map .map-control-stack > .map-style-toggle {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            width: 100% !important;
            max-width: none !important;
            gap: 0.35rem !important;
            padding: 0.3rem !important;
          }

          .map-mobile-compact #hotspot-map .map-control-stack .map-layer-toggle button,
          .map-mobile-compact #hotspot-map .map-control-stack .map-style-toggle button {
            width: 100% !important;
            min-width: 0 !important;
            min-height: 46px !important;
            display: inline-flex !important;
            flex-direction: row !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 0.45rem !important;
            padding: 0.6rem 0.5rem !important;
            font-size: 0.8125rem !important;
            line-height: 1.1 !important;
            letter-spacing: 0.04em !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }

          .map-mobile-compact #hotspot-map .map-control-stack .map-layer-toggle button svg,
          .map-mobile-compact #hotspot-map .map-control-stack .map-style-toggle button svg {
            width: 0.95rem !important;
            height: 0.95rem !important;
            flex: 0 0 auto !important;
          }

          /* Action buttons become full-width rows, avoiding label collisions. */
          .map-mobile-compact #hotspot-map .map-control-stack > .map-expand-button,
          .map-mobile-compact #hotspot-map .map-control-stack > .map-hotspot-button {
            width: 100% !important;
            max-width: none !important;
            min-height: 50px !important;
            justify-content: center !important;
            gap: 0.6rem !important;
            padding: 0.7rem 0.85rem !important;
            border-radius: 14px !important;
            font-size: 0.8125rem !important;
            line-height: 1.15 !important;
            letter-spacing: 0.06em !important;
            white-space: normal !important;
            text-align: center !important;
          }

          .map-mobile-compact #hotspot-map .map-control-stack > .map-expand-button .h-9.w-9 {
            display: flex !important;
            width: 2rem !important;
            height: 2rem !important;
            flex: 0 0 auto !important;
          }

          .map-mobile-compact #hotspot-map .map-control-stack > .map-expand-button > span {
            white-space: nowrap !important;
          }

          /* Status chips above controls use readable 2 + 1 layout. */
          .map-mobile-compact .map-workspace-controls > .flex.flex-wrap.gap-2 {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .map-mobile-compact .map-workspace-controls > .flex.flex-wrap.gap-2 > div {
            min-height: 40px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 0.8125rem !important;
            line-height: 1.2 !important;
          }

          .map-mobile-compact .map-workspace-controls > .flex.flex-wrap.gap-2 > div:last-child:nth-child(odd) {
            grid-column: 1 / -1 !important;
          }
        }

        /* Leaflet overlay isolation. These selectors are deliberately more
           specific than the page-wide mobile helpers so the floating map UI
           keeps its own dimensions. */
        @media (max-width: 639px) {
          .map-mobile-compact #hotspot-map .risk-map-root .risk-map-boundary-card {
            left: 8px !important;
            top: 8px !important;
            width: 154px !important;
            max-width: 154px !important;
            padding: 8px 9px !important;
          }

          .map-mobile-compact #hotspot-map .risk-map-root .risk-map-top-actions {
            right: 8px !important;
            top: 8px !important;
            width: auto !important;
            max-width: 116px !important;
            display: flex !important;
            grid-template-columns: none !important;
            gap: 5px !important;
          }

          .map-mobile-compact #hotspot-map .risk-map-root button.risk-map-view-button.group.inline-flex {
            width: 42px !important;
            min-width: 42px !important;
            max-width: 42px !important;
            min-height: 42px !important;
            padding: 5px !important;
            justify-content: center !important;
          }

          .map-mobile-compact #hotspot-map .risk-map-root button.risk-map-view-button.group.inline-flex > span:first-child {
            display: flex !important;
            width: 30px !important;
            height: 30px !important;
          }

          .map-mobile-compact #hotspot-map .risk-map-root button.risk-map-view-button.group.inline-flex > span:nth-child(2) {
            display: none !important;
          }

          .map-mobile-compact #hotspot-map .risk-map-root .risk-map-basemap-card {
            width: 68px !important;
            min-width: 68px !important;
            max-width: 68px !important;
            min-height: 42px !important;
            padding: 7px 8px !important;
          }

          .map-mobile-compact #hotspot-map .risk-map-root .risk-map-legend {
            right: 7px !important;
            bottom: 22px !important;
            left: 7px !important;
            width: auto !important;
            max-width: none !important;
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            flex-wrap: initial !important;
            gap: 4px !important;
          }

          .map-mobile-compact #hotspot-map .risk-map-root .risk-map-legend > div {
            width: 100% !important;
            min-width: 0 !important;
            max-width: none !important;
            padding: 5px 4px !important;
            font-size: 8px !important;
            line-height: 1.05 !important;
            text-align: center !important;
            white-space: normal !important;
          }

          /* Keep the native Leaflet +/- zoom control beside the Boundary Layer
             card on phones. This must stay here because these page-level
             selectors are more specific than the component-level map CSS. */
          .map-mobile-compact #hotspot-map .risk-map-root .leaflet-top.leaflet-left {
            top: 8px !important;
            left: 170px !important;
          }

          .map-mobile-compact #hotspot-map .risk-map-root .leaflet-top.leaflet-left .leaflet-control {
            margin: 0 !important;
          }
        }

        @media (max-width: 374px) {
          .map-mobile-compact #hotspot-map .risk-map-root .leaflet-top.leaflet-left {
            top: 8px !important;
            left: 158px !important;
          }

          .map-mobile-compact #hotspot-map .map-control-stack > .map-style-toggle {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .map-mobile-compact #hotspot-map .map-control-stack > .map-layer-toggle {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .map-mobile-compact #hotspot-map .map-control-stack .map-layer-toggle button,
          .map-mobile-compact #hotspot-map .map-control-stack .map-style-toggle button {
            white-space: normal !important;
          }
        }

      `}</style>

    </div>
  )
}