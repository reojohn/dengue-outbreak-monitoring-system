import { useEffect, useMemo } from 'react'
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useData } from '../context/DataContext'

const BUTUAN_CENTER = [8.9475, 125.5406]

const tileLayers = {
  dark: {
    name: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  },
  light: {
    name: 'Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  },
  street: {
    name: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
}

const riskTheme = {
  High: {
    fill: '#ef4444',
    border: '#fecdd3',
    selected: '#38bdf8',
    label: 'High risk',
  },
  Moderate: {
    fill: '#f59e0b',
    border: '#fde68a',
    selected: '#38bdf8',
    label: 'Moderate risk',
  },
  Low: {
    fill: '#10b981',
    border: '#bbf7d0',
    selected: '#38bdf8',
    label: 'Low risk',
  },
  None: {
    fill: '#64748b',
    border: '#94a3b8',
    selected: '#38bdf8',
    label: 'No risk data',
  },
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-PH').format(Number(value || 0))
}

function formatOptionalNumber(value, suffix = '') {
  const number = Number(value)

  if (!Number.isFinite(number) || number <= 0) {
    return 'Not available'
  }

  return `${formatNumber(number)}${suffix}`
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
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
    'Unnamed barangay'
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

function getFeatureCode(feature) {
  const props = feature?.properties || {}

  return props.adm4_pcode || props.pcode || props.code || props.id || ''
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

function getRiskRowForFeature(feature, riskItems) {
  const featureName = getFeatureName(feature)
  const referenceName = getFeatureReferenceName(feature)

  return (
    riskItems.find((item) => {
      return (
        namesMatch(item.barangay, featureName) ||
        namesMatch(item.barangay, referenceName)
      )
    }) || null
  )
}

function getPopulationRowForFeature(feature, row, populationItems) {
  const featureName = getFeatureName(feature)
  const referenceName = getFeatureReferenceName(feature)
  const rowName = row?.barangay

  return (
    populationItems.find((item) => {
      const itemName =
        item.barangay ||
        item.name ||
        item.adm4_name ||
        item.adm4_ref_name ||
        item.barangay_name ||
        item.BARANGAY

      return (
        namesMatch(itemName, featureName) ||
        namesMatch(itemName, referenceName) ||
        namesMatch(itemName, rowName)
      )
    }) || null
  )
}

function readFirstNumber(source, keys = []) {
  if (!source) return 0

  for (const key of keys) {
    const value = Number(source[key])

    if (Number.isFinite(value) && value > 0) {
      return value
    }
  }

  return 0
}

function getPopulationValue({ row, feature, populationRow }) {
  const props = feature?.properties || {}

  return (
    readFirstNumber(row, [
      'population',
      'totalPopulation',
      'populationCount',
      'pop',
      'total_pop',
      'totalPop',
    ]) ||
    readFirstNumber(populationRow, [
      'population',
      'totalPopulation',
      'populationCount',
      'pop',
      'total_pop',
      'totalPop',
    ]) ||
    readFirstNumber(props, [
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
    readFirstNumber(row, ['area_sqkm', 'areaSqKm', 'area', 'areaKm2']) ||
    readFirstNumber(props, ['area_sqkm', 'areaSqKm', 'area', 'areaKm2'])
  )
}

function getRiskColors(risk) {
  return riskTheme[risk] || riskTheme.None
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
  const directTrend =
    row?.trend ||
    row?.trendLabel ||
    row?.trendStatus ||
    row?.historicalTrendLabel

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

  const previous = Number(row?.previousCases || row?.lastPeriodCases || row?.previousTotal)
  const current = Number(row?.totalCases || row?.cases || row?.currentCases)

  if (Number.isFinite(previous) && Number.isFinite(current) && previous > 0) {
    if (current > previous) return `Increasing (${formatNumber(previous)} to ${formatNumber(current)})`
    if (current < previous) return `Decreasing (${formatNumber(previous)} to ${formatNumber(current)})`
    return `Stable (${formatNumber(current)} cases)`
  }

  return 'Not available'
}

function getDecisionSupport(row) {
  const decisionSupport = row?.decisionSupport || {}

  const summary =
    decisionSupport.summary ||
    row?.recommendedAction ||
    getGenericRecommendedAction(row?.risk)

  const priority =
    decisionSupport.priority ||
    row?.responsePriority ||
    (row ? 'Standard Risk Response' : 'Pending Dataset')

  const score =
    row?.decisionScore ??
    decisionSupport.score ??
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

  const densityLevel =
    decisionSupport.densityLevel ||
    row?.densityLevel ||
    'Density unavailable'

  const trendDirection =
    decisionSupport.trendDirection ||
    row?.trendDirection ||
    'Trend unavailable'

  const forecastPressure =
    decisionSupport.forecastPressure ||
    row?.forecastPressure ||
    'Forecast unavailable'

  const populationExposure =
    decisionSupport.populationExposure ||
    row?.populationExposure ||
    'Population exposure unavailable'

  const environmentalSuitability =
    decisionSupport.environmentalSuitability ||
    row?.environmentalSuitability ||
    'Environmental data unavailable'

  const rainfallPressure =
    decisionSupport.rainfallPressure ||
    row?.rainfallPressure ||
    'Rainfall data unavailable'

  const temperatureSuitability =
    decisionSupport.temperatureSuitability ||
    row?.temperatureSuitability ||
    'Temperature data unavailable'

  const humiditySuitability =
    decisionSupport.humiditySuitability ||
    row?.humiditySuitability ||
    'Humidity data unavailable'

  const multiSourceRiskScore =
    row?.multiSourceRiskScore ??
    row?.riskScore ??
    decisionSupport.multiSourceRiskScore ??
    0

  return {
    summary,
    priority,
    score,
    actions,
    rationale,
    densityLevel,
    trendDirection,
    forecastPressure,
    populationExposure,
    environmentalSuitability,
    rainfallPressure,
    temperatureSuitability,
    humiditySuitability,
    multiSourceRiskScore,
  }
}

function getPriorityClassName(priority) {
  const value = String(priority || '').toLowerCase()

  if (value.includes('immediate') || value.includes('high priority')) {
    return 'barangay-priority-critical'
  }

  if (value.includes('escalated') || value.includes('preventive')) {
    return 'barangay-priority-warning'
  }

  if (value.includes('monitoring') || value.includes('early')) {
    return 'barangay-priority-watch'
  }

  if (value.includes('routine')) {
    return 'barangay-priority-routine'
  }

  return 'barangay-priority-pending'
}

function getFallbackPoint(row, index, total) {
  const lat = Number(row.latitude || row.lat || row.center_lat)
  const lon = Number(row.longitude || row.lng || row.lon || row.center_lon)

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return [lat, lon]
  }

  const angle = (index / Math.max(total, 1)) * Math.PI * 2
  const radius = 0.055

  return [
    BUTUAN_CENTER[0] + Math.sin(angle) * radius,
    BUTUAN_CENTER[1] + Math.cos(angle) * radius,
  ]
}

function buildTooltipHtml({ feature, row }) {
  const barangay = row?.barangay || getFeatureName(feature)
  const risk = row?.risk || 'No risk data'
  const forecast = row?.forecast ?? 0
  const totalCases = row?.totalCases ?? 0
  const decision = getDecisionSupport(row)
  const area = Number(feature?.properties?.area_sqkm || 0)
  const code = getFeatureCode(feature)

  return `
    <div class="risk-tooltip-card">
      <div class="risk-tooltip-title">${escapeHtml(barangay)}</div>

      <div class="risk-tooltip-row">
        <span>Risk level</span>
        <strong>${escapeHtml(risk)}</strong>
      </div>

      <div class="risk-tooltip-row">
        <span>Multi-source score</span>
        <strong>${escapeHtml(formatRiskScore(decision.multiSourceRiskScore))}</strong>
      </div>

      <div class="risk-tooltip-row">
        <span>DSS priority</span>
        <strong>${escapeHtml(decision.priority)}</strong>
      </div>

      <div class="risk-tooltip-row">
        <span>Environment</span>
        <strong>${escapeHtml(decision.environmentalSuitability)}</strong>
      </div>

      <div class="risk-tooltip-row">
        <span>Forecast</span>
        <strong>${escapeHtml(formatNumber(forecast))} cases</strong>
      </div>

      <div class="risk-tooltip-row">
        <span>Historical</span>
        <strong>${escapeHtml(formatNumber(totalCases))} cases</strong>
      </div>

      ${
        area
          ? `
            <div class="risk-tooltip-row">
              <span>Area</span>
              <strong>${escapeHtml(area.toFixed(2))} sq km</strong>
            </div>
          `
          : ''
      }

      ${
        code
          ? `<div class="risk-tooltip-code">${escapeHtml(code)}</div>`
          : ''
      }
    </div>
  `
}

function buildActionListHtml(actions = []) {
  if (!actions.length) {
    return `
      <div class="barangay-action-item">
        <span>1</span>
        <p>Upload and validate dengue records before generating a complete action plan.</p>
      </div>
    `
  }

  return actions
    .slice(0, 5)
    .map((action, index) => {
      return `
        <div class="barangay-action-item">
          <span>${index + 1}</span>
          <p>${escapeHtml(action)}</p>
        </div>
      `
    })
    .join('')
}

function buildRationaleListHtml(rationale = []) {
  if (!rationale.length) {
    return `
      <div class="barangay-rationale-item">
        <span>•</span>
        <p>Decision rationale will be generated after dengue records, forecast output, and risk values are available.</p>
      </div>
    `
  }

  return rationale
    .slice(0, 4)
    .map((reason) => {
      return `
        <div class="barangay-rationale-item">
          <span>•</span>
          <p>${escapeHtml(reason)}</p>
        </div>
      `
    })
    .join('')
}

function buildDetailedPopupHtml({ feature, row, populationRow }) {
  const barangay = row?.barangay || getFeatureName(feature)
  const risk = row?.risk || 'No risk data'
  const colors = getRiskColors(row?.risk)
  const totalCases = Number(row?.totalCases || row?.cases || row?.currentCases || 0)
  const forecast = Number(row?.forecast || row?.forecastedCases || row?.predictedCases || 0)
  const area = getAreaValue({ row, feature })
  const population = getPopulationValue({ row, feature, populationRow })
  const density = population && area ? population / area : 0
  const trend = getHistoricalTrend(row)
  const decision = getDecisionSupport(row)
  const priorityClassName = getPriorityClassName(decision.priority)
  const code = getFeatureCode(feature)

  return `
    <div class="barangay-detail-card">
      <div class="barangay-detail-header">
        <div>
          <div class="barangay-detail-eyebrow">Barangay Detail</div>
          <div class="barangay-detail-title">${escapeHtml(barangay)}</div>
        </div>

        <div 
          class="barangay-risk-pill"
          style="background:${colors.fill};"
        >
          ${escapeHtml(risk)}
        </div>
      </div>

      <div class="barangay-decision-banner ${priorityClassName}">
        <span>Decision Support Priority</span>
        <strong>${escapeHtml(decision.priority)}</strong>
        <small>Decision score: ${escapeHtml(formatNumber(decision.score))} points · Multi-source score: ${escapeHtml(formatRiskScore(decision.multiSourceRiskScore))}</small>
      </div>

      <div class="barangay-detail-grid">
        <div class="barangay-detail-stat">
          <span>Total dengue cases</span>
          <strong>${escapeHtml(formatOptionalNumber(totalCases))}</strong>
        </div>

        <div class="barangay-detail-stat">
          <span>Forecasted cases</span>
          <strong>${escapeHtml(formatOptionalNumber(forecast))}</strong>
        </div>

        <div class="barangay-detail-stat">
          <span>Historical trend</span>
          <strong>${escapeHtml(trend)}</strong>
        </div>

        <div class="barangay-detail-stat">
          <span>Risk level</span>
          <strong>${escapeHtml(risk)}</strong>
        </div>

        <div class="barangay-detail-stat">
          <span>Multi-source score</span>
          <strong>${escapeHtml(formatRiskScore(decision.multiSourceRiskScore))}</strong>
        </div>

        <div class="barangay-detail-stat">
          <span>Environmental suitability</span>
          <strong>${escapeHtml(decision.environmentalSuitability)}</strong>
        </div>

        <div class="barangay-detail-stat">
          <span>Rainfall pressure</span>
          <strong>${escapeHtml(decision.rainfallPressure)}</strong>
        </div>

        <div class="barangay-detail-stat">
          <span>Temperature suitability</span>
          <strong>${escapeHtml(decision.temperatureSuitability)}</strong>
        </div>

        <div class="barangay-detail-stat">
          <span>Humidity suitability</span>
          <strong>${escapeHtml(decision.humiditySuitability)}</strong>
        </div>

        <div class="barangay-detail-stat">
          <span>Area</span>
          <strong>${escapeHtml(formatOptionalNumber(area, ' sq km'))}</strong>
        </div>

        <div class="barangay-detail-stat">
          <span>Population</span>
          <strong>${escapeHtml(formatOptionalNumber(population))}</strong>
        </div>

        <div class="barangay-detail-stat">
          <span>Density</span>
          <strong>${escapeHtml(formatOptionalNumber(density, ' people/sq km'))}</strong>
        </div>

        <div class="barangay-detail-stat">
          <span>Forecast pressure</span>
          <strong>${escapeHtml(decision.forecastPressure)}</strong>
        </div>
      </div>

      <div class="barangay-action-box">
        <span>DSS recommendation</span>
        <p>${escapeHtml(decision.summary)}</p>
      </div>

      <div class="barangay-plan-box">
        <span>Action plan</span>
        ${buildActionListHtml(decision.actions)}
      </div>

      <div class="barangay-rationale-box">
        <span>Why this recommendation</span>
        ${buildRationaleListHtml(decision.rationale)}
      </div>

      <div class="barangay-context-grid">
        <div>
          <span>Trend direction</span>
          <strong>${escapeHtml(decision.trendDirection)}</strong>
        </div>

        <div>
          <span>Density level</span>
          <strong>${escapeHtml(decision.densityLevel)}</strong>
        </div>

        <div>
          <span>Population exposure</span>
          <strong>${escapeHtml(decision.populationExposure)}</strong>
        </div>

        <div>
          <span>Environmental suitability</span>
          <strong>${escapeHtml(decision.environmentalSuitability)}</strong>
        </div>
      </div>

      ${
        code
          ? `<div class="barangay-detail-code">${escapeHtml(code)}</div>`
          : ''
      }
    </div>
  `
}

function FitBoundaryToMap({ geoJson }) {
  const map = useMap()

  useEffect(() => {
    if (!geoJson?.features?.length) return

    try {
      const layer = L.geoJSON(geoJson)
      const bounds = layer.getBounds()

      if (bounds.isValid()) {
        map.fitBounds(bounds, {
          padding: [24, 24],
          maxZoom: 13,
          animate: true,
        })
      }
    } catch (error) {
      console.warn('Unable to fit boundary layer:', error)
    }
  }, [geoJson, map])

  return null
}

function FocusSelectedBarangay({ geoJson, selected }) {
  const map = useMap()

  useEffect(() => {
    if (!selected || !geoJson?.features?.length) return

    const selectedFeature = geoJson.features.find((feature) => {
      return (
        namesMatch(selected, getFeatureName(feature)) ||
        namesMatch(selected, getFeatureReferenceName(feature))
      )
    })

    if (!selectedFeature) return

    try {
      const layer = L.geoJSON(selectedFeature)
      const bounds = layer.getBounds()

      if (bounds.isValid()) {
        map.flyToBounds(bounds, {
          padding: [50, 50],
          maxZoom: 14,
          duration: 0.7,
        })
      }
    } catch (error) {
      console.warn('Unable to focus selected barangay:', error)
    }
  }, [geoJson, selected, map])

  return null
}

function InvalidateMapSize({ layoutKey, mapStyle }) {
  const map = useMap()

  useEffect(() => {
    const firstTimer = window.setTimeout(() => {
      map.invalidateSize()
    }, 80)

    const secondTimer = window.setTimeout(() => {
      map.invalidateSize()
    }, 320)

    return () => {
      window.clearTimeout(firstTimer)
      window.clearTimeout(secondTimer)
    }
  }, [layoutKey, mapStyle, map])

  return null
}

export default function LeafletRiskMap({
  selected,
  onSelect,
  rows = [],
  mapStyle = 'dark',
  layoutKey = '',
  showDetailsPanel = false,
}) {
  const {
    boundaryRecords = [],
    populationRecords = [],
  } = useData()

  const activeTileLayer = tileLayers[mapStyle] || tileLayers.dark
  const isSatellite = mapStyle === 'satellite'

  const boundaryGeoJson = useMemo(() => {
    return getBoundaryGeoJson(boundaryRecords)
  }, [boundaryRecords])

  const populationItems = useMemo(() => {
    return Array.isArray(populationRecords) ? populationRecords : []
  }, [populationRecords])

  const riskItems = useMemo(() => {
    return rows.map((row) => ({
      ...row,
      normalizedBarangay: normalizeBarangayName(row.barangay),
      compactBarangay: compactBarangayName(row.barangay),
    }))
  }, [rows])

  const matchedFeatureCount = useMemo(() => {
    if (!boundaryGeoJson?.features?.length) return 0

    return boundaryGeoJson.features.filter((feature) => {
      return Boolean(getRiskRowForFeature(feature, riskItems))
    }).length
  }, [boundaryGeoJson, riskItems])

  const mapKey = useMemo(() => {
    const boundaryCount = boundaryGeoJson?.features?.length || 0
    const riskHash = rows
      .map((row) => `${row.barangay}-${row.risk}-${row.forecast}-${row.responsePriority}-${row.multiSourceRiskScore || row.riskScore || 0}-${row.environmentalSuitability || ''}`)
      .join('|')

    return `${selected}-${boundaryCount}-${riskHash}-${mapStyle}-${layoutKey}-${showDetailsPanel ? 'popup' : 'external'}`
  }, [selected, rows, boundaryGeoJson, mapStyle, layoutKey, showDetailsPanel])

  function getFeatureStyle(feature) {
    const row = getRiskRowForFeature(feature, riskItems)
    const colors = getRiskColors(row?.risk)
    const featureName = getFeatureName(feature)

    const isSelected =
      namesMatch(selected, row?.barangay) ||
      namesMatch(selected, featureName)

    return {
      color: isSelected ? colors.selected : colors.border,
      weight: isSelected ? 4 : row ? 2.4 : 1.5,
      opacity: isSelected ? 1 : 0.95,
      fillColor: colors.fill,
      fillOpacity: isSelected
        ? isSatellite
          ? 0.52
          : 0.68
        : row
          ? isSatellite
            ? 0.34
            : 0.48
          : isSatellite
            ? 0.08
            : 0.14,
      dashArray: row ? '' : '5 5',
      lineJoin: 'round',
      lineCap: 'round',
      className: isSelected
        ? 'barangay-polygon barangay-polygon-selected'
        : 'barangay-polygon',
    }
  }

  function handleEachFeature(feature, layer) {
    const row = getRiskRowForFeature(feature, riskItems)
    const populationRow = getPopulationRowForFeature(feature, row, populationItems)
    const barangay = row?.barangay || getFeatureName(feature)

    layer.bindTooltip(buildTooltipHtml({ feature, row }), {
      sticky: true,
      direction: 'top',
      opacity: 1,
      className: 'risk-tooltip',
    })

    if (showDetailsPanel) {
      layer.bindPopup(
        buildDetailedPopupHtml({
          feature,
          row,
          populationRow,
        }),
        {
          className: 'barangay-detail-popup',
          maxWidth: 440,
          minWidth: 340,
          closeButton: true,
        }
      )
    }

    layer.on({
      click: (event) => {
        L.DomEvent.stopPropagation(event)
        onSelect?.(barangay)

        if (showDetailsPanel) {
          layer.openPopup(event.latlng)
        }
      },
      mouseover: () => {
        const colors = getRiskColors(row?.risk)

        layer.setStyle({
          color: '#e0f2fe',
          weight: 4,
          fillColor: colors.fill,
          fillOpacity: row ? (isSatellite ? 0.48 : 0.74) : 0.28,
          dashArray: '',
        })

        layer.bringToFront()
      },
      mouseout: () => {
        layer.setStyle(getFeatureStyle(feature))
      },
    })
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[22px] bg-slate-950">
      <MapContainer
        center={BUTUAN_CENTER}
        zoom={11}
        minZoom={10}
        maxZoom={18}
        scrollWheelZoom
        dragging
        doubleClickZoom
        touchZoom
        boxZoom
        keyboard
        className="h-full w-full rounded-[22px]"
        zoomControl
      >
        <TileLayer
          key={mapStyle}
          attribution={activeTileLayer.attribution}
          url={activeTileLayer.url}
        />

        <InvalidateMapSize layoutKey={layoutKey} mapStyle={mapStyle} />

        {boundaryGeoJson?.features?.length > 0 && (
          <>
            <GeoJSON
              key={mapKey}
              data={boundaryGeoJson}
              style={getFeatureStyle}
              onEachFeature={handleEachFeature}
            />

            <FitBoundaryToMap geoJson={boundaryGeoJson} />

            <FocusSelectedBarangay
              geoJson={boundaryGeoJson}
              selected={selected}
            />
          </>
        )}

        {!boundaryGeoJson?.features?.length &&
          rows.map((row, index) => {
            const position = getFallbackPoint(row, index, rows.length)
            const colors = getRiskColors(row.risk)
            const isSelected = namesMatch(selected, row.barangay)
            const normalRadius = isSelected ? 16 : row.risk === 'High' ? 12 : 10
            const decision = getDecisionSupport(row)

            return (
              <CircleMarker
                key={row.barangay || index}
                center={position}
                radius={normalRadius}
                pathOptions={{
                  color: isSelected ? '#38bdf8' : '#ffffff',
                  weight: isSelected ? 4 : 3,
                  fillColor: colors.fill,
                  fillOpacity: 0.9,
                }}
                eventHandlers={{
                  click: () => onSelect?.(row.barangay),
                  mouseover: (event) => {
                    event.target.setRadius(16)
                    event.target.setStyle({
                      weight: 4,
                    })
                  },
                  mouseout: (event) => {
                    event.target.setRadius(normalRadius)
                    event.target.setStyle({
                      weight: isSelected ? 4 : 3,
                    })
                  },
                }}
              >
                <Tooltip direction="top" offset={[0, -12]} opacity={1}>
                  <div className="text-[11px] font-semibold">
                    {row.barangay}
                  </div>
                </Tooltip>

                {showDetailsPanel && (
                  <Popup>
                    <div className="min-w-[220px]">
                      <p className="font-bold">{row.barangay}</p>
                      <p>Risk: {row.risk}</p>
                      <p>Priority: {decision.priority}</p>
                      <p>Forecast: {formatNumber(row.forecast)} cases</p>
                      <p>Total cases: {formatNumber(row.totalCases)}</p>
                      <p className="mt-2 text-sm">{decision.summary}</p>
                    </div>
                  </Popup>
                )}
              </CircleMarker>
            )
          })}
      </MapContainer>

      <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-[18px] border border-white/10 bg-slate-950/80 px-4 py-3 text-white shadow-xl backdrop-blur">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">
          Boundary Layer
        </p>

        <p className="mt-1 text-sm font-bold">
          {boundaryGeoJson?.features?.length
            ? `${formatNumber(boundaryGeoJson.features.length)} barangays loaded`
            : 'No boundary layer'}
        </p>

        <p className="mt-0.5 text-xs text-slate-400">
          {matchedFeatureCount > 0
            ? `${formatNumber(matchedFeatureCount)} matched with risk data`
            : boundaryGeoJson?.features?.length
              ? 'Boundary-only view'
              : 'Using fallback points'}
        </p>
      </div>

      <div className="pointer-events-none absolute right-4 top-4 z-[500] rounded-[18px] border border-white/10 bg-slate-950/80 px-4 py-3 text-white shadow-xl backdrop-blur">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">
          Base Map
        </p>

        <p className="mt-1 text-sm font-bold">
          {activeTileLayer.name}
        </p>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 z-[500] flex flex-wrap gap-2">
        {Object.entries(riskTheme)
          .filter(([key]) => key !== 'None')
          .map(([key, theme]) => (
            <div
              key={key}
              className="rounded-full border border-white/10 bg-slate-950/80 px-3 py-1.5 text-xs font-bold text-white shadow-lg backdrop-blur"
            >
              <span
                className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: theme.fill }}
              />
              {theme.label}
            </div>
          ))}
      </div>

      <style>{`
        .leaflet-container {
          background: #020617;
          font-family: inherit;
        }

        .leaflet-control-zoom {
          border: 1px solid rgba(148, 163, 184, 0.24) !important;
          border-radius: 16px !important;
          overflow: hidden !important;
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.28) !important;
        }

        .leaflet-control-zoom a {
          background: rgba(15, 23, 42, 0.92) !important;
          color: #e2e8f0 !important;
          border-color: rgba(148, 163, 184, 0.18) !important;
        }

        .leaflet-control-zoom a:hover {
          background: rgba(30, 41, 59, 0.96) !important;
          color: #67e8f9 !important;
        }

        .leaflet-control-attribution {
          border-radius: 999px 0 0 0 !important;
          background: rgba(2, 6, 23, 0.72) !important;
          color: #cbd5e1 !important;
          backdrop-filter: blur(10px);
        }

        .leaflet-control-attribution a {
          color: #7dd3fc !important;
        }

        .barangay-polygon {
          transition:
            fill-opacity 0.18s ease,
            stroke-width 0.18s ease,
            filter 0.18s ease;
          filter: drop-shadow(0 0 5px rgba(14, 165, 233, 0.08));
          cursor: pointer;
        }

        .barangay-polygon-selected {
          filter: drop-shadow(0 0 12px rgba(56, 189, 248, 0.58));
        }

        .risk-tooltip {
          border: none !important;
          background: transparent !important;
          box-shadow: none !important;
          pointer-events: none !important;
        }

        .risk-tooltip::before {
          display: none !important;
        }

        .risk-tooltip-card {
          min-width: 210px;
          border: 1px solid rgba(125, 211, 252, 0.22);
          border-radius: 18px;
          background: rgba(2, 6, 23, 0.92);
          color: #e2e8f0;
          padding: 12px;
          box-shadow: 0 18px 42px rgba(2, 6, 23, 0.42);
          backdrop-filter: blur(14px);
        }

        .risk-tooltip-title {
          margin-bottom: 8px;
          color: #ffffff;
          font-size: 13px;
          font-weight: 900;
          line-height: 1.3;
        }

        .risk-tooltip-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-top: 1px solid rgba(148, 163, 184, 0.14);
          padding-top: 7px;
          margin-top: 7px;
          font-size: 11px;
        }

        .risk-tooltip-row span {
          color: #94a3b8;
        }

        .risk-tooltip-row strong {
          color: #f8fafc;
          font-weight: 800;
          text-align: right;
        }

        .risk-tooltip-code {
          margin-top: 8px;
          border-radius: 999px;
          background: rgba(14, 165, 233, 0.12);
          padding: 5px 8px;
          color: #7dd3fc;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-align: center;
        }

        .barangay-detail-popup {
          border: none !important;
        }

        .barangay-detail-popup .leaflet-popup-content-wrapper,
        .barangay-detail-popup .leaflet-popup-tip {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
        }

        .barangay-detail-popup .leaflet-popup-content {
          margin: 0 !important;
        }

        .barangay-detail-card {
          width: 390px;
          max-height: 78vh;
          overflow-y: auto;
          border: 1px solid rgba(125, 211, 252, 0.22);
          border-radius: 24px;
          background: rgba(2, 6, 23, 0.94);
          color: #e2e8f0;
          box-shadow: 0 24px 55px rgba(2, 6, 23, 0.55);
          backdrop-filter: blur(16px);
        }

        .barangay-detail-card::-webkit-scrollbar {
          width: 8px;
        }

        .barangay-detail-card::-webkit-scrollbar-thumb {
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.32);
        }

        .barangay-detail-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.16);
          padding: 16px;
        }

        .barangay-detail-eyebrow {
          color: #67e8f9;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .barangay-detail-title {
          margin-top: 4px;
          color: #ffffff;
          font-size: 18px;
          font-weight: 950;
          line-height: 1.2;
        }

        .barangay-risk-pill {
          flex-shrink: 0;
          border-radius: 999px;
          padding: 7px 10px;
          color: #ffffff;
          font-size: 11px;
          font-weight: 900;
          box-shadow: 0 10px 22px rgba(2, 6, 23, 0.3);
          text-transform: uppercase;
        }

        .barangay-decision-banner {
          margin: 14px 14px 0;
          border-radius: 20px;
          padding: 13px;
        }

        .barangay-decision-banner span {
          display: block;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .barangay-decision-banner strong {
          display: block;
          margin-top: 5px;
          color: #ffffff;
          font-size: 15px;
          font-weight: 950;
          line-height: 1.3;
        }

        .barangay-decision-banner small {
          display: block;
          margin-top: 4px;
          color: rgba(226, 232, 240, 0.78);
          font-size: 11px;
          font-weight: 700;
        }

        .barangay-priority-critical {
          border: 1px solid rgba(244, 63, 94, 0.35);
          background: rgba(244, 63, 94, 0.14);
          color: #fecdd3;
        }

        .barangay-priority-warning {
          border: 1px solid rgba(245, 158, 11, 0.35);
          background: rgba(245, 158, 11, 0.14);
          color: #fde68a;
        }

        .barangay-priority-watch {
          border: 1px solid rgba(59, 130, 246, 0.35);
          background: rgba(59, 130, 246, 0.14);
          color: #bfdbfe;
        }

        .barangay-priority-routine {
          border: 1px solid rgba(16, 185, 129, 0.35);
          background: rgba(16, 185, 129, 0.14);
          color: #bbf7d0;
        }

        .barangay-priority-pending {
          border: 1px solid rgba(148, 163, 184, 0.28);
          background: rgba(148, 163, 184, 0.12);
          color: #cbd5e1;
        }

        .barangay-detail-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          padding: 14px;
        }

        .barangay-detail-stat {
          min-height: 68px;
          border: 1px solid rgba(148, 163, 184, 0.14);
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.72);
          padding: 11px;
        }

        .barangay-detail-stat span {
          display: block;
          color: #94a3b8;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .barangay-detail-stat strong {
          display: block;
          margin-top: 6px;
          color: #f8fafc;
          font-size: 13px;
          font-weight: 900;
          line-height: 1.35;
        }

        .barangay-action-box,
        .barangay-plan-box,
        .barangay-rationale-box {
          margin: 0 14px 14px;
          border-radius: 20px;
          padding: 13px;
        }

        .barangay-action-box {
          border: 1px solid rgba(245, 158, 11, 0.2);
          background: rgba(245, 158, 11, 0.1);
        }

        .barangay-plan-box {
          border: 1px solid rgba(56, 189, 248, 0.18);
          background: rgba(14, 165, 233, 0.08);
        }

        .barangay-rationale-box {
          border: 1px solid rgba(16, 185, 129, 0.16);
          background: rgba(16, 185, 129, 0.07);
        }

        .barangay-action-box span,
        .barangay-plan-box > span,
        .barangay-rationale-box > span {
          display: block;
          color: #fcd34d;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .barangay-plan-box > span {
          color: #7dd3fc;
        }

        .barangay-rationale-box > span {
          color: #86efac;
        }

        .barangay-action-box p {
          margin: 7px 0 0;
          color: #e2e8f0;
          font-size: 12px;
          font-weight: 650;
          line-height: 1.6;
        }

        .barangay-action-item,
        .barangay-rationale-item {
          display: flex;
          gap: 8px;
          margin-top: 9px;
        }

        .barangay-action-item span {
          display: flex;
          height: 20px;
          width: 20px;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: rgba(125, 211, 252, 0.16);
          color: #7dd3fc;
          font-size: 10px;
          font-weight: 950;
        }

        .barangay-action-item p,
        .barangay-rationale-item p {
          margin: 0;
          color: #e2e8f0;
          font-size: 11.5px;
          font-weight: 650;
          line-height: 1.55;
        }

        .barangay-rationale-item span {
          margin-top: 1px;
          color: #86efac;
          font-size: 16px;
          font-weight: 950;
        }

        .barangay-rationale-item p {
          color: #cbd5e1;
          font-size: 11px;
        }

        .barangay-context-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 8px;
          margin: 0 14px 14px;
        }

        .barangay-context-grid div {
          border: 1px solid rgba(148, 163, 184, 0.14);
          border-radius: 16px;
          background: rgba(15, 23, 42, 0.62);
          padding: 10px;
        }

        .barangay-context-grid span {
          display: block;
          color: #94a3b8;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .barangay-context-grid strong {
          display: block;
          margin-top: 4px;
          color: #f8fafc;
          font-size: 11px;
          font-weight: 850;
          line-height: 1.4;
        }

        .barangay-detail-code {
          margin: 0 14px 14px;
          border-radius: 999px;
          background: rgba(14, 165, 233, 0.12);
          padding: 7px 10px;
          color: #7dd3fc;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-align: center;
        }

        .leaflet-popup-content-wrapper,
        .leaflet-popup-tip {
          background: #020617 !important;
          color: #e2e8f0 !important;
          border: 1px solid rgba(148, 163, 184, 0.24);
          box-shadow: 0 18px 42px rgba(2, 6, 23, 0.45);
        }

        .leaflet-popup-content {
          margin: 14px !important;
        }

        .leaflet-popup-close-button {
          color: #cbd5e1 !important;
          top: 10px !important;
          right: 10px !important;
          z-index: 20 !important;
        }

        .leaflet-attribution-flag {
          display: none !important;
        }

        @media (max-width: 520px) {
          .barangay-detail-card {
            width: 295px;
          }

          .barangay-detail-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}