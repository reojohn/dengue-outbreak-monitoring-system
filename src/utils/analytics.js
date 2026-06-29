export const riskLevels = {
  HIGH: 'High',
  MODERATE: 'Moderate',
  LOW: 'Low',
}

export const riskThresholds = {
  high: 60,
  moderate: 25,
}

export const densityLevels = {
  VERY_HIGH: 'Very high density',
  HIGH: 'High density',
  MODERATE: 'Moderate density',
  LOW: 'Low density',
  UNKNOWN: 'Density unavailable',
}

export const trendDirections = {
  INCREASING: 'Increasing',
  DECREASING: 'Decreasing',
  STABLE: 'Stable',
  UNKNOWN: 'Trend unavailable',
}

export const decisionPriorityLevels = {
  IMMEDIATE: 'Immediate Response',
  HIGH: 'High Priority Response',
  ESCALATED: 'Escalated Watch',
  PREVENTIVE: 'Preventive Intensification',
  MONITORING: 'Close Monitoring',
  EARLY: 'Early Warning Watch',
  ROUTINE: 'Routine Monitoring',
  PENDING: 'Pending Dataset',
}

export const riskStyles = {
  High: 'bg-rose-50 text-rose-600 border-rose-100',
  Moderate: 'bg-amber-50 text-amber-600 border-amber-100',
  Low: 'bg-emerald-50 text-emerald-600 border-emerald-100',
}

export const riskDarkStyles = {
  High: 'dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
  Moderate: 'dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
  Low: 'dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
}

export const riskMapColors = {
  High: {
    fill: '#ef4444',
    border: '#dc2626',
    label: 'High risk',
    description: 'Immediate response is recommended.',
  },
  Moderate: {
    fill: '#f59e0b',
    border: '#d97706',
    label: 'Moderate risk',
    description: 'Close monitoring is recommended.',
  },
  Low: {
    fill: '#10b981',
    border: '#059669',
    label: 'Low risk',
    description: 'Routine monitoring is recommended.',
  },
}

export function toNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  const cleaned =
    typeof value === 'string'
      ? value.replace(/,/g, '').trim()
      : value

  const number = Number(cleaned)

  return Number.isFinite(number) ? number : fallback
}

export function computeRiskLevel(value) {
  const score = toNumber(value)

  if (score >= riskThresholds.high) return riskLevels.HIGH
  if (score >= riskThresholds.moderate) return riskLevels.MODERATE

  return riskLevels.LOW
}

export function getRiskStyle(risk) {
  return riskStyles[risk] || 'bg-slate-50 text-slate-600 border-slate-100'
}

export function getRiskDarkStyle(risk) {
  return riskDarkStyles[risk] || 'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

export function getRiskMapColor(risk) {
  return riskMapColors[risk] || {
    fill: '#64748b',
    border: '#94a3b8',
    label: 'No risk data',
    description: 'Upload and validate dengue records first.',
  }
}

export function computeTrendLabel({
  recentAverage = 0,
  previousAverage = 0,
  firstValue = 0,
  lastValue = 0,
} = {}) {
  const recent = toNumber(recentAverage)
  const previous = toNumber(previousAverage)
  const first = toNumber(firstValue)
  const last = toNumber(lastValue)

  if (previous > 0) {
    const difference = recent - previous
    const percent = Math.round((difference / previous) * 100)

    if (percent > 10) return `Increasing by ${Math.abs(percent)}%`
    if (percent < -10) return `Decreasing by ${Math.abs(percent)}%`

    return 'Stable'
  }

  if (last > first) return 'Increasing'
  if (last < first) return 'Decreasing'

  return 'Stable'
}

export function computeDensity(population, areaSqKm) {
  const populationValue = toNumber(population)
  const areaValue = toNumber(areaSqKm)

  if (populationValue <= 0 || areaValue <= 0) {
    return 0
  }

  return populationValue / areaValue
}

export function getDensityLevel(density) {
  const value = toNumber(density)

  if (value <= 0) return densityLevels.UNKNOWN
  if (value >= 6000) return densityLevels.VERY_HIGH
  if (value >= 3000) return densityLevels.HIGH
  if (value >= 1000) return densityLevels.MODERATE

  return densityLevels.LOW
}

export function getPopulationExposure(population) {
  const value = toNumber(population)

  if (value <= 0) {
    return {
      label: 'Population unavailable',
      score: 0,
    }
  }

  if (value >= 30000) {
    return {
      label: 'Large exposed population',
      score: 3,
    }
  }

  if (value >= 15000) {
    return {
      label: 'Significant exposed population',
      score: 2,
    }
  }

  if (value >= 5000) {
    return {
      label: 'Moderate exposed population',
      score: 1,
    }
  }

  return {
    label: 'Limited exposed population',
    score: 0,
  }
}

export function getTrendDirection({
  trend = '',
  trendRate = 0,
  recentAverage = 0,
  previousAverage = 0,
  currentCases = 0,
  previousCases = 0,
  history = [],
  weeklyCases = [],
} = {}) {
  const trendText = String(trend || '').toLowerCase()
  const rate = toNumber(trendRate)
  const recent = toNumber(recentAverage)
  const previous = toNumber(previousAverage)
  const current = toNumber(currentCases)
  const previousPeriod = toNumber(previousCases)
  const series = Array.isArray(history) && history.length ? history : weeklyCases

  if (trendText.includes('increasing')) return trendDirections.INCREASING
  if (trendText.includes('decreasing')) return trendDirections.DECREASING
  if (trendText.includes('stable')) return trendDirections.STABLE

  if (rate > 0.1) return trendDirections.INCREASING
  if (rate < -0.1) return trendDirections.DECREASING

  if (previous > 0) {
    const changeRate = (recent - previous) / previous

    if (changeRate > 0.1) return trendDirections.INCREASING
    if (changeRate < -0.1) return trendDirections.DECREASING
    return trendDirections.STABLE
  }

  if (previousPeriod > 0) {
    if (current > previousPeriod) return trendDirections.INCREASING
    if (current < previousPeriod) return trendDirections.DECREASING
    return trendDirections.STABLE
  }

  if (Array.isArray(series) && series.length >= 2) {
    const first = toNumber(series[0])
    const last = toNumber(series[series.length - 1])

    if (last > first) return trendDirections.INCREASING
    if (last < first) return trendDirections.DECREASING
    return trendDirections.STABLE
  }

  return trendDirections.UNKNOWN
}

export function getGenericRecommendedAction(risk) {
  if (risk === riskLevels.HIGH) {
    return 'Conduct source reduction, coordinate immediate cleanup, and issue a barangay-level dengue alert within 48 hours.'
  }

  if (risk === riskLevels.MODERATE) {
    return 'Continue close weekly monitoring, strengthen preventive messaging, and inspect common mosquito breeding areas.'
  }

  if (risk === riskLevels.LOW) {
    return 'Maintain routine monitoring, public advisories, and regular environmental sanitation activities.'
  }

  return 'Upload and validate dengue records first before generating a recommended barangay response.'
}

function getForecastPressure(forecast) {
  const value = toNumber(forecast)

  if (value >= 90) {
    return {
      label: 'Critical forecast pressure',
      score: 4,
    }
  }

  if (value >= 60) {
    return {
      label: 'High forecast pressure',
      score: 3,
    }
  }

  if (value >= 25) {
    return {
      label: 'Moderate forecast pressure',
      score: 2,
    }
  }

  if (value > 0) {
    return {
      label: 'Low forecast pressure',
      score: 1,
    }
  }

  return {
    label: 'Forecast unavailable',
    score: 0,
  }
}

function getDensityScore(densityLevel) {
  if (densityLevel === densityLevels.VERY_HIGH) return 3
  if (densityLevel === densityLevels.HIGH) return 2
  if (densityLevel === densityLevels.MODERATE) return 1

  return 0
}

function getTrendScore(trendDirection) {
  if (trendDirection === trendDirections.INCREASING) return 2
  if (trendDirection === trendDirections.STABLE) return 1
  if (trendDirection === trendDirections.DECREASING) return -1

  return 0
}

function getRiskScore(risk) {
  if (risk === riskLevels.HIGH) return 4
  if (risk === riskLevels.MODERATE) return 2
  if (risk === riskLevels.LOW) return 1

  return 0
}

function buildRationale({
  risk,
  forecastPressure,
  trendDirection,
  densityLevel,
  populationExposure,
  totalCases,
  currentCases,
}) {
  const reasons = []

  if (risk) {
    reasons.push(`Risk classification is ${risk}.`)
  }

  if (forecastPressure?.label && forecastPressure.score > 0) {
    reasons.push(`${forecastPressure.label} was detected from the forecasted case count.`)
  }

  if (trendDirection === trendDirections.INCREASING) {
    reasons.push('Recent case movement is increasing, which may indicate active transmission.')
  }

  if (trendDirection === trendDirections.DECREASING) {
    reasons.push('Recent case movement is decreasing, but continued monitoring is still needed.')
  }

  if (
    densityLevel === densityLevels.VERY_HIGH ||
    densityLevel === densityLevels.HIGH
  ) {
    reasons.push(`${densityLevel} may increase exposure and faster household-to-household transmission.`)
  }

  if (populationExposure?.score >= 2) {
    reasons.push(`${populationExposure.label} should be considered when prioritizing BHW coverage and advisories.`)
  }

  if (toNumber(totalCases) > 0) {
    reasons.push(`Historical total is ${toNumber(totalCases)} recorded cases.`)
  }

  if (toNumber(currentCases) > 0) {
    reasons.push(`Most recent period has ${toNumber(currentCases)} reported cases.`)
  }

  return reasons
}

function buildActions({
  priority,
  risk,
  trendDirection,
  densityLevel,
  forecast,
  currentCases,
}) {
  const forecastValue = toNumber(forecast)
  const currentValue = toNumber(currentCases)
  const isDense =
    densityLevel === densityLevels.VERY_HIGH ||
    densityLevel === densityLevels.HIGH

  if (priority === decisionPriorityLevels.IMMEDIATE) {
    return [
      'Activate barangay-level dengue alert and coordinate response within 24 to 48 hours.',
      'Conduct rapid source reduction in the selected barangay, prioritizing stagnant water sites and high-density puroks.',
      'Deploy BHWs for focused household inspection, fever case checking, and dengue prevention advisories.',
      'Coordinate cleanup operations with barangay officials, sanitation teams, and community volunteers.',
      'Review new dengue reports after 7 days to check if the intervention reduced case movement.',
    ]
  }

  if (priority === decisionPriorityLevels.HIGH) {
    return [
      'Schedule priority source reduction and environmental sanitation within the week.',
      'Inspect locations with repeated dengue reports and possible mosquito breeding sites.',
      'Strengthen barangay advisories through BHWs, schools, community pages, and purok leaders.',
      'Monitor weekly case updates and escalate if the forecast or recent cases continue to increase.',
    ]
  }

  if (priority === decisionPriorityLevels.ESCALATED) {
    return [
      'Increase surveillance because moderate risk is paired with increasing trend or high-density exposure.',
      'Conduct targeted inspection in dense residential zones, schools, drainage areas, and common water storage sites.',
      'Prepare cleanup and IEC activities before the barangay shifts into high-risk status.',
      'Validate new reports weekly and compare them against the forecasted case count.',
    ]
  }

  if (priority === decisionPriorityLevels.PREVENTIVE) {
    return [
      'Strengthen preventive messaging and weekly monitoring before the risk level worsens.',
      'Inspect common breeding areas and remind households to remove standing water.',
      'Coordinate with BHWs to watch for clustering of fever cases.',
      'Reassess the barangay after the next reporting period.',
    ]
  }

  if (priority === decisionPriorityLevels.MONITORING) {
    return [
      'Continue weekly monitoring and maintain routine source reduction activities.',
      'Focus inspections on areas with previous dengue reports or poor drainage conditions.',
      'Keep barangay advisories active and encourage early consultation for fever symptoms.',
      'Escalate only if forecasted cases, current cases, or trend begin increasing.',
    ]
  }

  if (priority === decisionPriorityLevels.EARLY) {
    return [
      'Flag the barangay for early warning because the trend is increasing even though the current risk is low.',
      'Verify recent reports and check whether cases are clustered in one purok or household group.',
      'Send preventive reminders through BHWs and barangay communication channels.',
      'Monitor the next reporting period before deciding whether to escalate response.',
    ]
  }

  if (risk === riskLevels.LOW && forecastValue > 0 && currentValue > 0) {
    return [
      'Maintain routine dengue surveillance and sanitation activities.',
      'Continue household reminders on eliminating stagnant water.',
      'Track the next reporting period to ensure cases do not increase.',
    ]
  }

  return [
    'Upload and validate dengue records before generating a full decision support recommendation.',
    'Use boundary and population data as supporting context once case records are available.',
  ]
}

function computePriority({
  risk,
  forecast,
  trendDirection,
  densityLevel,
  populationExposure,
}) {
  const forecastPressure = getForecastPressure(forecast)
  const score =
    getRiskScore(risk) +
    forecastPressure.score +
    getTrendScore(trendDirection) +
    getDensityScore(densityLevel) +
    populationExposure.score

  const isIncreasing = trendDirection === trendDirections.INCREASING
  const isDense =
    densityLevel === densityLevels.VERY_HIGH ||
    densityLevel === densityLevels.HIGH

  if (risk === riskLevels.HIGH && (isIncreasing || isDense || forecastPressure.score >= 4)) {
    return {
      priority: decisionPriorityLevels.IMMEDIATE,
      score,
      forecastPressure,
    }
  }

  if (risk === riskLevels.HIGH) {
    return {
      priority: decisionPriorityLevels.HIGH,
      score,
      forecastPressure,
    }
  }

  if (risk === riskLevels.MODERATE && isIncreasing && isDense) {
    return {
      priority: decisionPriorityLevels.ESCALATED,
      score,
      forecastPressure,
    }
  }

  if (risk === riskLevels.MODERATE && isIncreasing) {
    return {
      priority: decisionPriorityLevels.PREVENTIVE,
      score,
      forecastPressure,
    }
  }

  if (risk === riskLevels.MODERATE) {
    return {
      priority: decisionPriorityLevels.MONITORING,
      score,
      forecastPressure,
    }
  }

  if (risk === riskLevels.LOW && isIncreasing) {
    return {
      priority: decisionPriorityLevels.EARLY,
      score,
      forecastPressure,
    }
  }

  if (risk === riskLevels.LOW) {
    return {
      priority: decisionPriorityLevels.ROUTINE,
      score,
      forecastPressure,
    }
  }

  return {
    priority: decisionPriorityLevels.PENDING,
    score,
    forecastPressure,
  }
}

function buildDecisionSummary({
  priority,
  risk,
  trendDirection,
  densityLevel,
  forecast,
}) {
  const forecastValue = toNumber(forecast)

  if (priority === decisionPriorityLevels.IMMEDIATE) {
    return 'Immediate coordinated response is recommended because the barangay shows high risk with added outbreak pressure from forecast, trend, or exposure conditions.'
  }

  if (priority === decisionPriorityLevels.HIGH) {
    return 'Prioritize this barangay for source reduction, case validation, and intensified dengue advisories within the current reporting cycle.'
  }

  if (priority === decisionPriorityLevels.ESCALATED) {
    return 'Escalate preventive action because moderate risk is combined with increasing trend and dense population exposure.'
  }

  if (priority === decisionPriorityLevels.PREVENTIVE) {
    return 'Strengthen prevention before the barangay becomes high risk because the recent trend is increasing.'
  }

  if (priority === decisionPriorityLevels.MONITORING) {
    return 'Maintain close weekly monitoring and targeted inspection because the barangay remains at moderate risk.'
  }

  if (priority === decisionPriorityLevels.EARLY) {
    return 'Place the barangay under early warning watch because case movement is increasing despite a low current risk level.'
  }

  if (priority === decisionPriorityLevels.ROUTINE) {
    return 'Maintain routine dengue monitoring, sanitation activities, and public reminders.'
  }

  if (risk && forecastValue > 0) {
    return `${risk} risk was detected with ${forecastValue} forecasted cases.`
  }

  if (
    trendDirection === trendDirections.UNKNOWN &&
    densityLevel !== densityLevels.UNKNOWN
  ) {
    return 'Boundary and population context are available, but dengue records are still needed for final response recommendation.'
  }

  return 'Upload and validate dengue records first before generating a complete decision support recommendation.'
}

export function computeDecisionSupport(input = {}) {
  const forecast = toNumber(
    input.forecast ??
      input.forecastedCases ??
      input.predictedCases ??
      input.projectedCases
  )

  const totalCases = toNumber(
    input.totalCases ??
      input.cases ??
      input.total_cases
  )

  const currentCases = toNumber(
    input.currentCases ??
      input.current_cases ??
      input.latestCases ??
      input.latest_cases
  )

  const previousCases = toNumber(
    input.previousCases ??
      input.previous_cases ??
      input.lastPeriodCases
  )

  const population = toNumber(
    input.population ??
      input.totalPopulation ??
      input.populationCount
  )

  const areaSqKm = toNumber(
    input.area_sqkm ??
      input.areaSqKm ??
      input.areaKm2 ??
      input.area
  )

  const density = toNumber(input.density) || computeDensity(population, areaSqKm)

  const risk = input.risk || computeRiskLevel(forecast)

  const trendDirection = getTrendDirection({
    trend: input.trend || input.trendLabel || input.trendStatus,
    trendRate: input.trendRate,
    recentAverage: input.recentAverage,
    previousAverage: input.previousAverage,
    currentCases,
    previousCases,
    history: input.history,
    weeklyCases: input.weeklyCases,
  })

  const densityLevel = getDensityLevel(density)
  const populationExposure = getPopulationExposure(population)

  const {
    priority,
    score,
    forecastPressure,
  } = computePriority({
    risk,
    forecast,
    trendDirection,
    densityLevel,
    populationExposure,
  })

  const summary = buildDecisionSummary({
    priority,
    risk,
    trendDirection,
    densityLevel,
    forecast,
  })

  const actions = buildActions({
    priority,
    risk,
    trendDirection,
    densityLevel,
    forecast,
    currentCases,
  })

  const rationale = buildRationale({
    risk,
    forecastPressure,
    trendDirection,
    densityLevel,
    populationExposure,
    totalCases,
    currentCases,
  })

  return {
    priority,
    score,
    risk,
    summary,
    recommendedAction: summary,
    primaryAction: actions[0],
    actions,
    rationale,
    trendDirection,
    densityLevel,
    populationExposure: populationExposure.label,
    forecastPressure: forecastPressure.label,
  }
}

export function getRecommendedAction(input) {
  if (input && typeof input === 'object') {
    return computeDecisionSupport(input).summary
  }

  return getGenericRecommendedAction(input)
}