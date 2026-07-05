import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { computeDecisionSupport, computeMultiSourceRisk } from '../utils/analytics'
import {
  buildBackendIntegrationDataset,
  getBackendIntegrationStatus,
  getLatestBackendIntegrationDataset,
  getUploadDatabaseStatus,
  getUploadDatabasePreview,
  getLatestSavedBoundaryGeoJson,
  getLatestSavedForecast,
  resetBackendIntegrationWorkspace,
  getSavedWorkspaceState,
  saveWorkspaceState,
  clearSavedWorkspaceState,
} from '../services/api'

const DataContext = createContext(null)

const STORAGE_KEY = 'dengue-workspace-live-v1'

const emptySourceStatus = {
  dengue: {
    uploadedName: '',
    badge: 'Not loaded',
    recordCount: 0,
    validCount: 0,
    invalidCount: 0,
    uploadId: '',
    datasetType: 'dengue',
    uploadedAt: '',
    uploaded_at: '',
    uploadDateTime: '',
    fileType: '',
    status: '',
  },
  weather: {
    uploadedName: '',
    badge: 'Not loaded',
    recordCount: 0,
    validCount: 0,
    invalidCount: 0,
    uploadId: '',
    datasetType: 'weather',
    uploadedAt: '',
    uploaded_at: '',
    uploadDateTime: '',
    fileType: '',
    status: '',
  },
  population: {
    uploadedName: '',
    badge: 'Not loaded',
    recordCount: 0,
    validCount: 0,
    invalidCount: 0,
    uploadId: '',
    datasetType: 'population',
    uploadedAt: '',
    uploaded_at: '',
    uploadDateTime: '',
    fileType: '',
    status: '',
  },
  boundary: {
    uploadedName: '',
    badge: 'Not loaded',
    recordCount: 0,
    validCount: 0,
    invalidCount: 0,
    uploadId: '',
    datasetType: 'boundary',
    uploadedAt: '',
    uploaded_at: '',
    uploadDateTime: '',
    fileType: '',
    status: '',
  },
}

const emptyWorkspace = {
  dengueRecords: [],
  weatherRecords: [],
  populationRecords: [],
  boundaryRecords: [],
  backendDengueSummary: null,
  backendForecastResult: null,
  backendIntegrationStatus: null,
  backendIntegrationResult: null,
  backendMergedDataset: [],
  sourceStatus: emptySourceStatus,
  activityLogs: [],
}

function mapSavedDenguePreviewRows(rows = []) {
  return rows.map((row, index) => ({
    id: row.id || `saved-dengue-${index}`,
    barangay: row.barangay || '',
    reportingDate: row.date || row.period || '',
    period: row.period || row.date || '',
    date: row.date || '',
    year: row.year ?? '',
    month: row.month ?? '',
    week: row.week ?? '',
    cases: Number(row.cases || 0),
    deaths: Number(row.deaths || 0),
    status: 'Saved online',
  }))
}

function mapSavedWeatherPreviewRows(rows = []) {
  return rows.map((row, index) => ({
    id: row.id || `saved-weather-${index}`,
    reportingDate: row.reporting_date || row.date || row.period || '',
    rainfall: row.rainfall ?? '',
    temperature: row.temperature ?? '',
    humidity: row.humidity ?? '',
    status: 'Saved online',
  }))
}

function mapSavedPopulationPreviewRows(rows = []) {
  return rows.map((row, index) => ({
    id: row.id || `saved-population-${index}`,
    barangay: row.barangay || '',
    population: row.population ?? '',
    year: row.population_year ?? row.year ?? '',
    psgc: row.psgc || row.geometry_id || '',
    status: 'Saved online',
  }))
}

const mockDengueRecords = [
  { barangay: 'Baan KM 3', reportingDate: '2026-01-07', cases: 8 },
  { barangay: 'Baan KM 3', reportingDate: '2026-01-14', cases: 10 },
  { barangay: 'Baan KM 3', reportingDate: '2026-01-21', cases: 12 },
  { barangay: 'Baan KM 3', reportingDate: '2026-01-28', cases: 18 },
  { barangay: 'Baan KM 3', reportingDate: '2026-02-04', cases: 21 },
  { barangay: 'Baan KM 3', reportingDate: '2026-02-11', cases: 25 },

  { barangay: 'Tiniwisan', reportingDate: '2026-01-07', cases: 6 },
  { barangay: 'Tiniwisan', reportingDate: '2026-01-14', cases: 8 },
  { barangay: 'Tiniwisan', reportingDate: '2026-01-21', cases: 10 },
  { barangay: 'Tiniwisan', reportingDate: '2026-01-28', cases: 15 },
  { barangay: 'Tiniwisan', reportingDate: '2026-02-04', cases: 18 },
  { barangay: 'Tiniwisan', reportingDate: '2026-02-11', cases: 22 },

  { barangay: 'Ampayon', reportingDate: '2026-01-07', cases: 5 },
  { barangay: 'Ampayon', reportingDate: '2026-01-14', cases: 7 },
  { barangay: 'Ampayon', reportingDate: '2026-01-21', cases: 9 },
  { barangay: 'Ampayon', reportingDate: '2026-01-28', cases: 13 },
  { barangay: 'Ampayon', reportingDate: '2026-02-04', cases: 17 },
  { barangay: 'Ampayon', reportingDate: '2026-02-11', cases: 20 },

  { barangay: 'Bancasi', reportingDate: '2026-01-07', cases: 3 },
  { barangay: 'Bancasi', reportingDate: '2026-01-14', cases: 4 },
  { barangay: 'Bancasi', reportingDate: '2026-01-21', cases: 5 },
  { barangay: 'Bancasi', reportingDate: '2026-01-28', cases: 6 },
  { barangay: 'Bancasi', reportingDate: '2026-02-04', cases: 7 },
  { barangay: 'Bancasi', reportingDate: '2026-02-11', cases: 8 },

  { barangay: 'Libertad', reportingDate: '2026-01-07', cases: 2 },
  { barangay: 'Libertad', reportingDate: '2026-01-14', cases: 4 },
  { barangay: 'Libertad', reportingDate: '2026-01-21', cases: 4 },
  { barangay: 'Libertad', reportingDate: '2026-01-28', cases: 5 },
  { barangay: 'Libertad', reportingDate: '2026-02-04', cases: 7 },
  { barangay: 'Libertad', reportingDate: '2026-02-11', cases: 8 },

  { barangay: 'Ambago', reportingDate: '2026-01-07', cases: 2 },
  { barangay: 'Ambago', reportingDate: '2026-01-14', cases: 3 },
  { barangay: 'Ambago', reportingDate: '2026-01-21', cases: 4 },
  { barangay: 'Ambago', reportingDate: '2026-01-28', cases: 5 },
  { barangay: 'Ambago', reportingDate: '2026-02-04', cases: 6 },
  { barangay: 'Ambago', reportingDate: '2026-02-11', cases: 7 },

  { barangay: 'Doongan', reportingDate: '2026-01-07', cases: 1 },
  { barangay: 'Doongan', reportingDate: '2026-01-14', cases: 1 },
  { barangay: 'Doongan', reportingDate: '2026-01-21', cases: 2 },
  { barangay: 'Doongan', reportingDate: '2026-01-28', cases: 2 },
  { barangay: 'Doongan', reportingDate: '2026-02-04', cases: 3 },
  { barangay: 'Doongan', reportingDate: '2026-02-11', cases: 3 },

  { barangay: 'Mandamo', reportingDate: '2026-01-07', cases: 1 },
  { barangay: 'Mandamo', reportingDate: '2026-01-14', cases: 1 },
  { barangay: 'Mandamo', reportingDate: '2026-01-21', cases: 1 },
  { barangay: 'Mandamo', reportingDate: '2026-01-28', cases: 2 },
  { barangay: 'Mandamo', reportingDate: '2026-02-04', cases: 2 },
  { barangay: 'Mandamo', reportingDate: '2026-02-11', cases: 2 },

  { barangay: 'San Vicente', reportingDate: '2026-01-07', cases: 1 },
  { barangay: 'San Vicente', reportingDate: '2026-01-14', cases: 1 },
  { barangay: 'San Vicente', reportingDate: '2026-01-21', cases: 1 },
  { barangay: 'San Vicente', reportingDate: '2026-01-28', cases: 1 },
  { barangay: 'San Vicente', reportingDate: '2026-02-04', cases: 2 },
  { barangay: 'San Vicente', reportingDate: '2026-02-11', cases: 2 },
]

function normalizeSourceStatus(sourceStatus = {}) {
  return {
    dengue: {
      ...emptySourceStatus.dengue,
      ...(sourceStatus.dengue || {}),
    },
    weather: {
      ...emptySourceStatus.weather,
      ...(sourceStatus.weather || {}),
    },
    population: {
      ...emptySourceStatus.population,
      ...(sourceStatus.population || {}),
    },
    boundary: {
      ...emptySourceStatus.boundary,
      ...(sourceStatus.boundary || {}),
    },
  }
}

function getUploadTimestamp(upload = {}) {
  return (
    upload.uploaded_at ||
    upload.uploadedAt ||
    upload.uploadDateTime ||
    upload.created_at ||
    upload.createdAt ||
    ''
  )
}

function getUploadBadge(status = '') {
  const value = String(status || '').toLowerCase()

  if (
    value.includes('valid') ||
    value.includes('saved') ||
    value.includes('upload') ||
    value.includes('complete')
  ) {
    return 'Saved Online'
  }

  if (value.includes('review') || value.includes('pending')) {
    return 'Needs Review'
  }

  if (value.includes('fail') || value.includes('error')) {
    return 'Upload Issue'
  }

  return status ? 'Saved Online' : 'Not loaded'
}

function normalizeDatabaseUploadStatus(upload = {}, fallback = {}, datasetType = '') {
  const uploadedAt = getUploadTimestamp(upload) || getUploadTimestamp(fallback)
  const originalRowCount = Number(
    upload.original_row_count ??
      upload.originalRowCount ??
      fallback.recordCount ??
      0
  )
  const validRowCount = Number(
    upload.valid_row_count ??
      upload.validRowCount ??
      fallback.validCount ??
      0
  )
  const invalidRowCount = Number(
    upload.invalid_row_count ??
      upload.invalidRowCount ??
      fallback.invalidCount ??
      0
  )

  return {
    ...fallback,
    uploadedName:
      upload.original_filename ||
      upload.originalFilename ||
      fallback.uploadedName ||
      '',
    badge: getUploadBadge(upload.status || fallback.status || fallback.badge),
    recordCount: Number.isFinite(originalRowCount) ? originalRowCount : 0,
    validCount: Number.isFinite(validRowCount) ? validRowCount : 0,
    invalidCount: Number.isFinite(invalidRowCount) ? invalidRowCount : 0,
    uploadId: String(upload.upload_id || upload.uploadId || fallback.uploadId || ''),
    datasetType: upload.dataset_type || upload.datasetType || fallback.datasetType || datasetType,
    fileType: upload.file_type || upload.fileType || fallback.fileType || '',
    status: upload.status || fallback.status || '',
    uploadedAt,
    uploaded_at: uploadedAt,
    uploadDateTime: uploadedAt,
  }
}

function normalizeObjectOrNull(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value
}

function normalizeWorkspace(workspace = {}) {
  return {
    ...emptyWorkspace,
    ...workspace,
    dengueRecords: Array.isArray(workspace.dengueRecords)
      ? workspace.dengueRecords
      : [],
    weatherRecords: Array.isArray(workspace.weatherRecords)
      ? workspace.weatherRecords
      : [],
    populationRecords: Array.isArray(workspace.populationRecords)
      ? workspace.populationRecords
      : [],
    boundaryRecords: Array.isArray(workspace.boundaryRecords)
      ? workspace.boundaryRecords
      : workspace.boundaryRecords
        ? [workspace.boundaryRecords]
        : [],
    backendDengueSummary: normalizeObjectOrNull(workspace.backendDengueSummary),
    backendForecastResult: normalizeObjectOrNull(workspace.backendForecastResult),
    backendIntegrationStatus: normalizeObjectOrNull(workspace.backendIntegrationStatus),
    backendIntegrationResult: normalizeObjectOrNull(workspace.backendIntegrationResult),
    backendMergedDataset: Array.isArray(workspace.backendMergedDataset)
      ? workspace.backendMergedDataset
      : [],
    sourceStatus: normalizeSourceStatus(workspace.sourceStatus),
    activityLogs: Array.isArray(workspace.activityLogs)
      ? workspace.activityLogs
      : [],
  }
}

function loadWorkspace() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)

    if (!saved) {
      return normalizeWorkspace(emptyWorkspace)
    }

    const parsed = JSON.parse(saved)

    return normalizeWorkspace(parsed)
  } catch {
    return normalizeWorkspace(emptyWorkspace)
  }
}


function compactWorkspaceForPersistence(workspace = {}) {
  const normalized = normalizeWorkspace(workspace)

  return {
    ...normalized,
    dengueRecords: [],
    weatherRecords: [],
    populationRecords: [],
    boundaryRecords: [],
    backendMergedDataset: [],
    backendIntegrationResult: normalized.backendIntegrationResult
      ? {
          message: normalized.backendIntegrationResult.message,
          row_count: normalized.backendIntegrationResult.row_count,
          summary: normalized.backendIntegrationResult.summary,
          integration_run: normalized.backendIntegrationResult.integration_run,
          databaseBacked: normalized.backendIntegrationResult.databaseBacked,
        }
      : null,
    activityLogs: normalized.activityLogs.slice(0, 20),
  }
}

function saveWorkspace(workspace) {
  // Keep browser storage light. Large uploaded rows are already saved by the backend upload tables.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(compactWorkspaceForPersistence(workspace)))
  } catch {
    // Ignore storage failures so the app can continue running.
  }
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

function sum(values = []) {
  return values.reduce((total, value) => total + Number(value || 0), 0)
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

function getTrendLabel({
  recentAverage,
  previousAverage,
  firstValue,
  lastValue,
}) {
  if (previousAverage > 0) {
    const difference = recentAverage - previousAverage
    const percent = Math.round((difference / previousAverage) * 100)

    if (percent > 10) return `Increasing by ${Math.abs(percent)}%`
    if (percent < -10) return `Decreasing by ${Math.abs(percent)}%`
    return 'Stable'
  }

  if (firstValue !== lastValue) {
    if (lastValue > firstValue) return 'Increasing'
    if (lastValue < firstValue) return 'Decreasing'
  }

  return 'Stable'
}

function buildRiskRows(
  dengueRecords = [],
  populationRecords = [],
  boundaryRecords = [],
  weatherRecords = []
) {
  if (!dengueRecords.length) return []

  const periodMap = new Map()
  const barangayMap = new Map()

  dengueRecords.forEach((record, index) => {
    const barangay = getRecordBarangay(record)
    const barangayKey = normalizeBarangayName(barangay)
    const period = getRecordPeriod(record, index)
    const cases = getRecordCases(record)
    const periodSortValue = getPeriodSortValue(period, index)

    if (!periodMap.has(period)) {
      periodMap.set(period, {
        period,
        index,
        sortValue: periodSortValue,
      })
    }

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

  const weatherContext = getWeatherContextForPeriods(periods, weatherRecords)

  return Array.from(barangayMap.values())
    .map((barangayItem) => {
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

      const forecast = Math.max(
        0,
        Math.round(recentAverage * 4 * (1 + cappedTrendRate))
      )

      const firstValue = caseSeries[0] || 0
      const lastValue = caseSeries[caseSeries.length - 1] || 0

      const trend = getTrendLabel({
        recentAverage,
        previousAverage,
        firstValue,
        lastValue,
      })

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
        forecast,
        currentCases,
        previousCases,
        totalCases: barangayItem.totalCases,
        trend,
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
        barangay: barangayItem.barangay,

        totalCases: barangayItem.totalCases,
        cases: barangayItem.totalCases,
        currentCases,
        previousCases,

        forecast,
        forecastedCases: forecast,
        predictedCases: forecast,

        risk,

        trend,
        trendRate,
        recentAverage,
        previousAverage,

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
    .sort((a, b) => {
      const scoreDifference = Number(b.riskScore || 0) - Number(a.riskScore || 0)

      if (scoreDifference !== 0) return scoreDifference

      return b.forecast - a.forecast
    })
}

function buildWeeklyTotals(dengueRecords = []) {
  if (!dengueRecords.length) return []

  const periodMap = new Map()

  dengueRecords.forEach((record, index) => {
    const period = getRecordPeriod(record, index)
    const cases = getRecordCases(record)
    const sortValue = getPeriodSortValue(period, index)

    if (!periodMap.has(period)) {
      periodMap.set(period, {
        period,
        index,
        sortValue,
        totalCases: 0,
      })
    }

    periodMap.get(period).totalCases += cases
  })

  return Array.from(periodMap.values())
    .sort((a, b) => {
      if (a.sortValue !== b.sortValue) return a.sortValue - b.sortValue
      return a.index - b.index
    })
    .map((period) => period.totalCases)
}

function getDataQuality(sourceStatus) {
  const sources = Object.values(sourceStatus || {})
  const loadedSources = sources.filter((source) => {
    return Number(source.recordCount || 0) > 0
  })

  if (!loadedSources.length) return 0

  const totalRecords = loadedSources.reduce((sum, source) => {
    return sum + Number(source.recordCount || 0)
  }, 0)

  const validRecords = loadedSources.reduce((sum, source) => {
    return sum + Number(source.validCount || 0)
  }, 0)

  if (!totalRecords) return 0

  return Math.round((validRecords / totalRecords) * 100)
}

function getTotalPopulation(populationRecords = []) {
  if (!Array.isArray(populationRecords) || !populationRecords.length) {
    return 0
  }

  return populationRecords.reduce((sum, record) => {
    return (
      sum +
      readPositiveNumber(record, [
        'population',
        'totalPopulation',
        'populationCount',
        'population_count',
        'pop',
        'total_pop',
        'totalPop',
        'residents',
        'householdPopulation',
      ])
    )
  }, 0)
}

function getBoundaryFeatureCount(boundaryRecords = []) {
  const boundaryGeoJson = getBoundaryGeoJson(boundaryRecords)

  return boundaryGeoJson?.features?.length || 0
}

function makeBarangayItem(name = '', meta = {}) {
  const label = String(name || '').trim()
  const key = normalizeBarangayName(label)
  const compactKey = compactBarangayName(label)

  return {
    name: label,
    key,
    compactKey,
    ...meta,
  }
}

function uniqueBarangayItems(items = []) {
  const map = new Map()

  items.forEach((item) => {
    if (!item?.key && !item?.compactKey) return

    const key = item.key || item.compactKey

    if (!map.has(key)) {
      map.set(key, item)
    }
  })

  return Array.from(map.values()).sort((a, b) => {
    return String(a.name || '').localeCompare(String(b.name || ''))
  })
}

function getDengueBarangayItems(dengueRecords = []) {
  if (!Array.isArray(dengueRecords)) return []

  return uniqueBarangayItems(
    dengueRecords.map((record) => {
      return makeBarangayItem(getRecordBarangay(record), { source: 'dengue' })
    })
  )
}

function getPopulationBarangayItems(populationRecords = []) {
  if (!Array.isArray(populationRecords)) return []

  return uniqueBarangayItems(
    populationRecords.map((record) => {
      return makeBarangayItem(getRecordName(record), { source: 'population' })
    })
  )
}

function getBoundaryBarangayItems(boundaryRecords = []) {
  const boundaryGeoJson = getBoundaryGeoJson(boundaryRecords)

  if (!boundaryGeoJson?.features?.length) return []

  return uniqueBarangayItems(
    boundaryGeoJson.features.map((feature, index) => {
      return makeBarangayItem(
        getFeatureName(feature) || getFeatureReferenceName(feature) || `Boundary ${index + 1}`,
        {
          source: 'boundary',
          feature,
        }
      )
    })
  )
}

function findItemMatch(sourceItem, targetItems = []) {
  return targetItems.find((targetItem) => {
    if (!sourceItem?.key || !targetItem?.key) return false

    return (
      sourceItem.key === targetItem.key ||
      sourceItem.compactKey === targetItem.compactKey ||
      namesMatch(sourceItem.name, targetItem.name)
    )
  }) || null
}

function compareBarangayCoverage(sourceItems = [], targetItems = []) {
  const matched = []
  const missing = []

  sourceItems.forEach((sourceItem) => {
    const match = findItemMatch(sourceItem, targetItems)

    if (match) {
      matched.push({
        source: sourceItem,
        target: match,
      })
    } else {
      missing.push(sourceItem)
    }
  })

  return {
    total: sourceItems.length,
    matchedCount: matched.length,
    missingCount: missing.length,
    matched,
    missing,
    missingPreview: missing.slice(0, 8).map((item) => item.name),
  }
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

function getDateRange(records = [], keyGroups = []) {
  if (!Array.isArray(records) || !records.length) {
    return {
      start: null,
      end: null,
      count: 0,
      label: 'No records',
    }
  }

  const dates = records
    .map((record) => {
      for (const keys of keyGroups) {
        const value = readValue(record, keys)
        const parsed = parseCoverageDate(value)

        if (parsed) return parsed
      }

      return null
    })
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime())

  if (!dates.length) {
    return {
      start: null,
      end: null,
      count: 0,
      label: 'Date coverage unavailable',
    }
  }

  const start = dates[0]
  const end = dates[dates.length - 1]

  return {
    start,
    end,
    count: dates.length,
    label: `${formatCoverageDate(start)} to ${formatCoverageDate(end)}`,
  }
}

function buildWeatherCoverageCheck(dengueRecords = [], weatherRecords = []) {
  const dengueRange = getDateRange(dengueRecords, [
    ['reportingDate', 'reporting_date', 'date', 'period'],
  ])

  const weatherRange = getDateRange(weatherRecords, [
    ['reportingDate', 'reporting_date', 'date', 'weatherDate'],
  ])

  if (!dengueRecords.length || !weatherRecords.length) {
    return {
      ready: false,
      value: 'Pending',
      detail: 'Upload both dengue and weather records to check date coverage.',
      dengueRange,
      weatherRange,
    }
  }

  if (!dengueRange.start || !weatherRange.start) {
    return {
      ready: false,
      value: 'Needs Review',
      detail: 'Date fields could not be compared. Check reporting date columns.',
      dengueRange,
      weatherRange,
    }
  }

  const fullyCovered =
    weatherRange.start.getTime() <= dengueRange.start.getTime() &&
    weatherRange.end.getTime() >= dengueRange.end.getTime()

  const overlaps =
    weatherRange.start.getTime() <= dengueRange.end.getTime() &&
    weatherRange.end.getTime() >= dengueRange.start.getTime()

  if (fullyCovered) {
    return {
      ready: true,
      value: 'Covered',
      detail: `Weather coverage ${weatherRange.label} covers dengue records ${dengueRange.label}.`,
      dengueRange,
      weatherRange,
    }
  }

  if (overlaps) {
    return {
      ready: false,
      value: 'Partial',
      detail: `Weather coverage ${weatherRange.label} only partially overlaps dengue records ${dengueRange.label}.`,
      dengueRange,
      weatherRange,
    }
  }

  return {
    ready: false,
    value: 'No overlap',
    detail: `Weather coverage ${weatherRange.label} does not overlap dengue records ${dengueRange.label}.`,
    dengueRange,
    weatherRange,
  }
}

function buildIntegrationReadiness(workspace = {}, riskRows = []) {
  const dengueRecords = workspace.dengueRecords || []
  const populationRecords = workspace.populationRecords || []
  const weatherRecords = workspace.weatherRecords || []
  const boundaryRecords = workspace.boundaryRecords || []

  const dengueBarangays = getDengueBarangayItems(dengueRecords)
  const populationBarangays = getPopulationBarangayItems(populationRecords)
  const boundaryBarangays = getBoundaryBarangayItems(boundaryRecords)

  const denguePopulation = compareBarangayCoverage(dengueBarangays, populationBarangays)
  const dengueBoundary = compareBarangayCoverage(dengueBarangays, boundaryBarangays)
  const populationBoundary = compareBarangayCoverage(populationBarangays, boundaryBarangays)
  const weatherCoverage = buildWeatherCoverageCheck(dengueRecords, weatherRecords)

  const sharedBarangayCount = dengueBarangays.filter((barangay) => {
    return (
      findItemMatch(barangay, populationBarangays) &&
      findItemMatch(barangay, boundaryBarangays)
    )
  }).length

  const allSourcesLoaded =
    dengueRecords.length > 0 &&
    populationRecords.length > 0 &&
    weatherRecords.length > 0 &&
    boundaryBarangays.length > 0

  const checks = [
    {
      id: 'dengue-population-match',
      label: 'Dengue barangays matched with population',
      ready: denguePopulation.total > 0 && denguePopulation.missingCount === 0,
      value: `${denguePopulation.matchedCount}/${denguePopulation.total || 0}`,
      detail: denguePopulation.missingCount
        ? `${denguePopulation.missingCount} dengue barangay name(s) are missing in population data.`
        : 'All dengue barangays have matching population records.',
      missingPreview: denguePopulation.missingPreview,
    },
    {
      id: 'dengue-boundary-match',
      label: 'Dengue barangays matched with boundary layer',
      ready: dengueBoundary.total > 0 && dengueBoundary.missingCount === 0,
      value: `${dengueBoundary.matchedCount}/${dengueBoundary.total || 0}`,
      detail: dengueBoundary.missingCount
        ? `${dengueBoundary.missingCount} dengue barangay name(s) are missing in the boundary layer.`
        : 'All dengue barangays have matching boundary features.',
      missingPreview: dengueBoundary.missingPreview,
    },
    {
      id: 'population-boundary-match',
      label: 'Population barangays matched with boundary layer',
      ready: populationBoundary.total > 0 && populationBoundary.missingCount === 0,
      value: `${populationBoundary.matchedCount}/${populationBoundary.total || 0}`,
      detail: populationBoundary.missingCount
        ? `${populationBoundary.missingCount} population barangay name(s) are missing in the boundary layer.`
        : 'All population barangays have matching boundary features.',
      missingPreview: populationBoundary.missingPreview,
    },
    {
      id: 'weather-coverage',
      label: 'Weather coverage compared with dengue dates',
      ready: weatherCoverage.ready,
      value: weatherCoverage.value,
      detail: weatherCoverage.detail,
      missingPreview: [],
    },
    {
      id: 'forecast-rows-ready',
      label: 'Forecast and DSS rows generated',
      ready: Array.isArray(riskRows) && riskRows.length > 0,
      value: `${Array.isArray(riskRows) ? riskRows.length : 0} barangay rows`,
      detail: riskRows?.length
        ? 'Forecast-ready barangay rows are available for dashboard, map, reports, and DSS views.'
        : 'Upload dengue records to generate forecast-ready barangay rows.',
      missingPreview: [],
    },
  ]

  const readyCount = checks.filter((check) => check.ready).length
  const score = checks.length ? Math.round((readyCount / checks.length) * 100) : 0

  const status = !allSourcesLoaded
    ? 'Pending'
    : readyCount === checks.length
      ? 'Ready'
      : 'Needs Review'

  return {
    status,
    score,
    readyCount,
    checkCount: checks.length,
    allSourcesLoaded,
    checks,
    summary: {
      dengueBarangayCount: dengueBarangays.length,
      populationBarangayCount: populationBarangays.length,
      boundaryBarangayCount: boundaryBarangays.length,
      sharedBarangayCount,
      weatherDateCoverage: weatherCoverage.weatherRange.label,
      dengueDateCoverage: weatherCoverage.dengueRange.label,
      riskRowCount: Array.isArray(riskRows) ? riskRows.length : 0,
    },
  }
}

export function DataProvider({ children }) {
  const [workspace, setWorkspace] = useState(loadWorkspace)
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadSavedWorkspace() {
      try {
        const result = await getSavedWorkspaceState()
        const savedWorkspace = result?.workspace

        if (!cancelled && savedWorkspace && typeof savedWorkspace === 'object') {
          setWorkspace((current) =>
            normalizeWorkspace({
              ...current,
              ...savedWorkspace,
              dengueRecords: current.dengueRecords?.length
                ? current.dengueRecords
                : savedWorkspace.dengueRecords || [],
              weatherRecords: current.weatherRecords?.length
                ? current.weatherRecords
                : savedWorkspace.weatherRecords || [],
              populationRecords: current.populationRecords?.length
                ? current.populationRecords
                : savedWorkspace.populationRecords || [],
              boundaryRecords: current.boundaryRecords?.length
                ? current.boundaryRecords
                : savedWorkspace.boundaryRecords || [],
              backendMergedDataset: current.backendMergedDataset?.length
                ? current.backendMergedDataset
                : savedWorkspace.backendMergedDataset || [],
            })
          )
        }
      } catch {
        // Keep the local fallback workspace if Supabase is temporarily unavailable.
      } finally {
        if (!cancelled) {
          setWorkspaceHydrated(true)
        }
      }
    }

    loadSavedWorkspace()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!workspaceHydrated) return undefined

    const saveTimer = window.setTimeout(() => {
      saveWorkspaceState(compactWorkspaceForPersistence(workspace)).catch(() => {
        saveWorkspace(workspace)
      })
    }, 650)

    return () => window.clearTimeout(saveTimer)
  }, [workspace, workspaceHydrated])

  function updateWorkspace(updater) {
    setWorkspace((current) => {
      const next =
        typeof updater === 'function'
          ? updater(current)
          : {
              ...current,
              ...updater,
            }

      const normalized = normalizeWorkspace(next)

      saveWorkspace(normalized)

      return normalized
    })
  }

  function addActivityLog(action, details) {
    updateWorkspace((current) => ({
      ...current,
      activityLogs: [
        {
          id:
            globalThis.crypto?.randomUUID?.() ||
            `${Date.now()}-${Math.random()}`,
          action,
          details,
          timestamp: new Date().toISOString(),
        },
        ...(current.activityLogs || []),
      ].slice(0, 20),
    }))
  }

  function loadMockDengueData() {
    updateWorkspace((current) => ({
      ...current,
      dengueRecords: mockDengueRecords,
      backendDengueSummary: null,
      backendForecastResult: null,
      backendIntegrationResult: null,
      backendMergedDataset: [],
      sourceStatus: {
        ...(current.sourceStatus || {}),
        dengue: {
          uploadedName: 'mock_dengue_hotspot_testing.json',
          badge: 'Uploaded',
          recordCount: mockDengueRecords.length,
          validCount: mockDengueRecords.length,
        },
      },
      activityLogs: [
        {
          id:
            globalThis.crypto?.randomUUID?.() ||
            `${Date.now()}-${Math.random()}`,
          action: 'Mock dengue dataset loaded',
          details:
            'Temporary mock dengue records were loaded for hotspot, forecast, and risk map testing. Backend forecast results were cleared.',
          timestamp: new Date().toISOString(),
        },
        ...(current.activityLogs || []),
      ].slice(0, 20),
    }))
  }

  function clearMockDengueData() {
    updateWorkspace((current) => {
      const currentDengueName = current.sourceStatus?.dengue?.uploadedName || ''
      const isMockDataset = currentDengueName.includes('mock_dengue')

      if (!isMockDataset) {
        return current
      }

      return {
        ...current,
        dengueRecords: [],
        backendDengueSummary: null,
        backendForecastResult: null,
        backendIntegrationResult: null,
        backendMergedDataset: [],
        sourceStatus: {
          ...(current.sourceStatus || {}),
          dengue: {
            ...emptySourceStatus.dengue,
          },
        },
        activityLogs: [
          {
            id:
              globalThis.crypto?.randomUUID?.() ||
              `${Date.now()}-${Math.random()}`,
            action: 'Mock dengue dataset cleared',
            details:
              'Temporary mock dengue records were removed. Backend forecast results were cleared. Boundary and population data were kept.',
            timestamp: new Date().toISOString(),
          },
          ...(current.activityLogs || []),
        ].slice(0, 20),
      }
    })
  }

  function clearWorkspace() {
    resetBackendIntegrationWorkspace().catch(() => {})

    localStorage.removeItem(STORAGE_KEY)
    clearSavedWorkspaceState().catch(() => {})
    setWorkspace(normalizeWorkspace(emptyWorkspace))
  }

  async function loadLatestUploadDatabaseStatus({ silent = false } = {}) {
    try {
      const result = await getUploadDatabaseStatus()
      const uploads = result?.uploads || {}
      const requiredTypes = Array.isArray(result?.required_types)
        ? result.required_types
        : ['dengue', 'weather', 'population', 'boundary']

      let previewResult = null

      try {
        previewResult = await getUploadDatabasePreview(100)
      } catch {
        previewResult = null
      }

      const previewRows = previewResult?.previews || {}

      updateWorkspace((current) => {
        const currentSourceStatus = normalizeSourceStatus(current.sourceStatus)
        const nextSourceStatus = {
          ...currentSourceStatus,
        }

        requiredTypes.forEach((datasetType) => {
          const upload = uploads[datasetType]

          if (!upload) return

          nextSourceStatus[datasetType] = normalizeDatabaseUploadStatus(
            upload,
            currentSourceStatus[datasetType] || {},
            datasetType
          )
        })

        const savedDengueRows = Array.isArray(previewRows.dengue)
          ? mapSavedDenguePreviewRows(previewRows.dengue)
          : []

        const savedWeatherRows = Array.isArray(previewRows.weather)
          ? mapSavedWeatherPreviewRows(previewRows.weather)
          : []

        const savedPopulationRows = Array.isArray(previewRows.population)
          ? mapSavedPopulationPreviewRows(previewRows.population)
          : []

        return {
          ...current,
          dengueRecords: savedDengueRows.length > 0 ? savedDengueRows : current.dengueRecords,
          weatherRecords: savedWeatherRows.length > 0 ? savedWeatherRows : current.weatherRecords,
          populationRecords: savedPopulationRows.length > 0 ? savedPopulationRows : current.populationRecords,
          sourceStatus: normalizeSourceStatus(nextSourceStatus),
        }
      })

      return result
    } catch (error) {
      if (!silent) {
        addActivityLog(
          'Saved upload details unavailable',
          error?.message || 'The app could not load the latest uploaded file details.'
        )
      }

      return null
    }
  }

  async function syncBackendIntegrationStatus({ silent = false } = {}) {
    try {
      const status = await getBackendIntegrationStatus()

      updateWorkspace((current) => ({
        ...current,
        backendIntegrationStatus: status,
      }))

      return status
    } catch (error) {
      if (!silent) {
        addActivityLog(
          'Backend integration status unavailable',
          error?.message || 'The frontend could not reach the backend integration status endpoint.'
        )
      }

      return null
    }
  }

  async function buildBackendIntegrationWorkspace() {
    const result = await buildBackendIntegrationDataset()

    updateWorkspace((current) => ({
      ...current,
      backendIntegrationStatus:
        result.integration_status || current.backendIntegrationStatus || null,
      backendIntegrationResult: result,
      backendMergedDataset: Array.isArray(result.merged_dataset)
        ? result.merged_dataset
        : [],
    }))

    addActivityLog(
      'Backend multi-source dataset built',
      `${Number(result.row_count || 0)} merged model-ready row(s) were generated by the backend integration module.`
    )

    return result
  }

  async function loadLatestBackendIntegrationDataset({ silent = false } = {}) {
    try {
      const result = await getLatestBackendIntegrationDataset()

      if (!result?.has_saved_dataset) {
        return null
      }

      updateWorkspace((current) => ({
        ...current,
        backendIntegrationStatus: current.backendIntegrationStatus || {
          status: 'ready',
          can_build_dataset: true,
          complete: true,
          loaded_source_count: 4,
          required_source_count: 4,
          loaded_sources: ['dengue', 'weather', 'population', 'boundary'],
          missing_sources: [],
          sources: current.backendIntegrationStatus?.sources || {},
          message: 'Latest saved integrated dataset loaded from the online database.',
        },
        backendIntegrationResult: {
          message: result.message,
          integration_run: result.integration_run,
          row_count: result.row_count,
          summary: result.summary,
          merged_dataset: Array.isArray(result.merged_dataset)
            ? result.merged_dataset
            : [],
          merged_preview: Array.isArray(result.merged_preview)
            ? result.merged_preview
            : [],
          databaseBacked: true,
        },
        backendMergedDataset: Array.isArray(result.merged_dataset)
          ? result.merged_dataset
          : [],
      }))

      return result
    } catch (error) {
      if (!silent) {
        addActivityLog(
          'Saved combined data unavailable',
          error?.message || 'The frontend could not load the latest saved combined dataset.'
        )
      }

      return null
    }
  }

  async function loadLatestSavedForecast({ silent = false } = {}) {
    try {
      const result = await getLatestSavedForecast()

      if (!result?.has_saved_forecast) {
        return null
      }

      const forecastResults = Array.isArray(result.forecast_results)
        ? result.forecast_results
        : []

      const validRowCount = forecastResults.reduce((sum, row) => {
        return sum + Number(row.record_count || 0)
      }, 0)

      const normalizedForecastResult = {
        message: result.message || 'Latest saved forecast loaded from Supabase.',
        note: 'This forecast was loaded from the online database.',
        filename: 'latest_saved_forecast_from_database',
        file_type: 'database',
        original_row_count: validRowCount,
        valid_row_count: validRowCount,
        invalid_row_count: 0,
        barangay_count: Number(result.barangay_count || forecastResults.length),
        total_forecast_next_4_periods: Number(result.total_forecast_next_4_periods || 0),
        risk_counts: result.risk_counts || {},
        validation_summary: result.validation_summary || {},
        forecast_results: forecastResults,
        forecast_run: result.forecast_run || null,
        databaseBacked: true,
        database_forecast_run_id: result.forecast_run?.forecast_run_id || null,
      }

      updateWorkspace((current) => ({
        ...current,
        backendForecastResult: normalizedForecastResult,
      }))

      return normalizedForecastResult
    } catch (error) {
      if (!silent) {
        addActivityLog(
          'Saved forecast unavailable',
          error?.message || 'The frontend could not load the latest saved forecast.'
        )
      }

      return null
    }
  }

  async function loadLatestSavedBoundaryGeoJson({ silent = false } = {}) {
    try {
      const result = await getLatestSavedBoundaryGeoJson()

      if (!result?.has_saved_boundary) {
        return null
      }

      const boundaryGeoJson = result.boundary_geojson || {
        type: 'FeatureCollection',
        features: [],
      }

      const features = Array.isArray(boundaryGeoJson.features)
        ? boundaryGeoJson.features
        : []

      if (!features.length) {
        return null
      }

      const uploadedName =
        result.upload?.original_filename ||
        features[0]?.properties?.source_filename ||
        'latest_saved_boundary_geojson'

      updateWorkspace((current) => ({
        ...current,
        boundaryRecords: [boundaryGeoJson],
        sourceStatus: normalizeSourceStatus({
          ...(current.sourceStatus || {}),
          boundary: normalizeDatabaseUploadStatus(
            result.upload || {},
            {
              ...(current.sourceStatus?.boundary || {}),
              uploadedName,
              badge: 'Saved Online',
              recordCount: Number(result.feature_count || features.length),
              validCount: Number(result.feature_count || features.length),
              invalidCount: Number(current.sourceStatus?.boundary?.invalidCount || 0),
            },
            'boundary'
          ),
        }),
      }))

      return result
    } catch (error) {
      if (!silent) {
        addActivityLog(
          'Saved boundary map unavailable',
          error?.message || 'The frontend could not load the latest saved barangay boundary map.'
        )
      }

      return null
    }
  }

  async function resetBackendIntegration() {
    const result = await resetBackendIntegrationWorkspace()

    updateWorkspace((current) => ({
      ...current,
      backendIntegrationStatus: result.integration_status || null,
      backendIntegrationResult: null,
      backendMergedDataset: [],
    }))

    addActivityLog(
      'Backend integration workspace reset',
      'Stored backend dengue, weather, population, and boundary integration sources were cleared.'
    )

    return result
  }

  useEffect(() => {
    if (!workspaceHydrated) return

    loadLatestUploadDatabaseStatus({ silent: true })
    syncBackendIntegrationStatus({ silent: true })
    loadLatestSavedBoundaryGeoJson({ silent: true })
    loadLatestBackendIntegrationDataset({ silent: true })
    loadLatestSavedForecast({ silent: true })
  }, [workspaceHydrated])

  const riskRows = useMemo(() => {
    return buildRiskRows(
      workspace.dengueRecords,
      workspace.populationRecords,
      workspace.boundaryRecords,
      workspace.weatherRecords
    )
  }, [
    workspace.dengueRecords,
    workspace.populationRecords,
    workspace.boundaryRecords,
    workspace.weatherRecords,
  ])

  const weeklyTotals = useMemo(() => {
    return buildWeeklyTotals(workspace.dengueRecords)
  }, [workspace.dengueRecords])

  const dashboardStats = useMemo(() => {
    const totalCases = workspace.dengueRecords.reduce((sum, record) => {
      return sum + getRecordCases(record)
    }, 0)

    const fourWeekForecast = riskRows.reduce((sum, row) => {
      return sum + Number(row.forecast || 0)
    }, 0)

    return {
      totalCases,
      highRiskCount: riskRows.filter((row) => row.risk === 'High').length,
      moderateRiskCount: riskRows.filter((row) => row.risk === 'Moderate').length,
      lowRiskCount: riskRows.filter((row) => row.risk === 'Low').length,
      fourWeekForecast,
      dataQuality: getDataQuality(workspace.sourceStatus),
      weeklyTotals,
      totalPopulation: getTotalPopulation(workspace.populationRecords),
      boundaryFeatureCount: getBoundaryFeatureCount(workspace.boundaryRecords),
    }
  }, [
    workspace.dengueRecords,
    workspace.populationRecords,
    workspace.boundaryRecords,
    workspace.weatherRecords,
    workspace.sourceStatus,
    riskRows,
    weeklyTotals,
  ])

  const integrationReadiness = useMemo(() => {
    return buildIntegrationReadiness(workspace, riskRows)
  }, [
    workspace.dengueRecords,
    workspace.weatherRecords,
    workspace.populationRecords,
    workspace.boundaryRecords,
    riskRows,
  ])

  const value = {
    ...workspace,

    riskRows,
    weeklyTotals,
    dashboardStats,
    integrationReadiness,

    updateWorkspace,
    addActivityLog,
    clearWorkspace,
    loadMockDengueData,
    clearMockDengueData,

    loadLatestUploadDatabaseStatus,
    syncBackendIntegrationStatus,
    buildBackendIntegrationWorkspace,
    loadLatestBackendIntegrationDataset,
    loadLatestSavedBoundaryGeoJson,
    loadLatestSavedForecast,
    resetBackendIntegration,

    resetSampleData: clearWorkspace,
  }

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  const context = useContext(DataContext)

  if (!context) {
    throw new Error('useData must be used inside DataProvider')
  }

  return context
}