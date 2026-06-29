import { createContext, useContext, useMemo, useState } from 'react'
import { computeDecisionSupport, computeRiskLevel } from '../utils/analytics'

const DataContext = createContext(null)

const STORAGE_KEY = 'dengue-workspace-live-v1'

const emptySourceStatus = {
  dengue: {
    uploadedName: '',
    badge: 'Not loaded',
    recordCount: 0,
    validCount: 0,
  },
  weather: {
    uploadedName: '',
    badge: 'Not loaded',
    recordCount: 0,
    validCount: 0,
  },
  population: {
    uploadedName: '',
    badge: 'Not loaded',
    recordCount: 0,
    validCount: 0,
  },
  boundary: {
    uploadedName: '',
    badge: 'Not loaded',
    recordCount: 0,
    validCount: 0,
  },
}

const emptyWorkspace = {
  dengueRecords: [],
  weatherRecords: [],
  populationRecords: [],
  boundaryRecords: [],
  sourceStatus: emptySourceStatus,
  activityLogs: [],
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

function saveWorkspace(workspace) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace))
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
  boundaryRecords = []
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

      const risk = computeRiskLevel(forecast)

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
      }
    })
    .sort((a, b) => b.forecast - a.forecast)
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

export function DataProvider({ children }) {
  const [workspace, setWorkspace] = useState(loadWorkspace)

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
            'Temporary mock dengue records were loaded for hotspot, forecast, and risk map testing.',
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
              'Temporary mock dengue records were removed. Boundary and population data were kept.',
            timestamp: new Date().toISOString(),
          },
          ...(current.activityLogs || []),
        ].slice(0, 20),
      }
    })
  }

  function clearWorkspace() {
    localStorage.removeItem(STORAGE_KEY)
    setWorkspace(normalizeWorkspace(emptyWorkspace))
  }

  const riskRows = useMemo(() => {
    return buildRiskRows(
      workspace.dengueRecords,
      workspace.populationRecords,
      workspace.boundaryRecords
    )
  }, [
    workspace.dengueRecords,
    workspace.populationRecords,
    workspace.boundaryRecords,
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
    workspace.sourceStatus,
    riskRows,
    weeklyTotals,
  ])

  const value = {
    ...workspace,

    riskRows,
    weeklyTotals,
    dashboardStats,

    updateWorkspace,
    addActivityLog,
    clearWorkspace,
    loadMockDengueData,
    clearMockDengueData,

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