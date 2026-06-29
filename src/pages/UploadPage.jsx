import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  CloudRain,
  Database,
  FileCheck2,
  FileText,
  Map as MapIcon,
  ShieldCheck,
  Sparkles,
  Table2,
  UploadCloud,
  Users,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { useData } from '../context/DataContext'
import {
  cleanDengueFile,
  forecastDengueFile,
  inspectUploadedFile,
  summarizeDengueFile,
} from '../services/api'

const sources = [
  {
    id: 'historical',
    contextKey: 'dengue',
    recordKey: 'dengueRecords',
    title: 'Historical dengue data',
    desc: 'Past dengue case records by barangay and reporting period',
    type: 'CSV / Excel / JSON',
    icon: FileText,
    color:
      'bg-blue-50 text-brand-blue border-blue-100 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
    glow:
      'from-blue-50 to-sky-50 dark:from-blue-500/10 dark:to-slate-900',
    accept: '.csv,.json,.xlsx,.xls',
  },
  {
    id: 'meteorological',
    contextKey: 'weather',
    recordKey: 'weatherRecords',
    title: 'Meteorological data',
    desc: 'Rainfall, temperature, and humidity records',
    type: 'CSV / Excel / JSON',
    icon: CloudRain,
    color:
      'bg-teal-50 text-brand-teal border-teal-100 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300',
    glow:
      'from-teal-50 to-cyan-50 dark:from-teal-500/10 dark:to-slate-900',
    accept: '.csv,.json,.xlsx,.xls',
  },
  {
    id: 'demographic',
    contextKey: 'population',
    recordKey: 'populationRecords',
    title: 'Demographic data',
    desc: 'Population records by barangay',
    type: 'CSV / Excel / JSON',
    icon: Users,
    color:
      'bg-amber-50 text-brand-orange border-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
    glow:
      'from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-slate-900',
    accept: '.csv,.json,.xlsx,.xls',
  },
  {
    id: 'boundary',
    contextKey: 'boundary',
    recordKey: 'boundaryRecords',
    title: 'Barangay boundary',
    desc: 'Barangay boundary layer for geospatial mapping',
    type: 'GeoJSON / JSON',
    icon: MapIcon,
    color:
      'bg-emerald-50 text-brand-green border-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
    glow:
      'from-emerald-50 to-green-50 dark:from-emerald-500/10 dark:to-slate-900',
    accept: '.geojson,.json',
  },
]

const weatherFieldConfig = {
  reportingDate: {
    label: 'reporting date',
    aliases: [
      'reporting_date',
      'date',
      'weather_date',
      'observation_date',
      'observed_date',
      'record_date',
      'day_date',
      'datetime',
      'time',
    ],
    fallback: (key) => key === 'date' || key.includes('date') || key.includes('time'),
  },
  year: {
    label: 'year',
    aliases: ['year', 'yr'],
    fallback: (key) => key === 'year' || key === 'yr',
  },
  month: {
    label: 'month',
    aliases: ['month', 'mo', 'mn'],
    fallback: (key) => key === 'month' || key === 'mo',
  },
  day: {
    label: 'day',
    aliases: ['day', 'dy', 'date_day'],
    fallback: (key) => key === 'day' || key === 'dy',
  },
  doy: {
    label: 'day of year',
    aliases: ['doy', 'day_of_year', 'julian_day', 'daynumber', 'day_number'],
    fallback: (key) => key === 'doy' || key.includes('day_of_year') || key.includes('julian'),
  },
  rainfall: {
    label: 'rainfall',
    aliases: [
      'rainfall',
      'rainfall_mm',
      'rain_mm',
      'rain',
      'precipitation',
      'precipitation_mm',
      'precip_mm',
      'precip',
      'prectotcorr',
      'prectot',
      'prcp',
      'daily_rainfall',
    ],
    fallback: (key) =>
      key.includes('rain') ||
      key.includes('precip') ||
      key.includes('prectot') ||
      key.includes('prcp'),
  },
  temperature: {
    label: 'temperature',
    aliases: [
      'temperature',
      'temp',
      'temperature_c',
      'temp_c',
      'air_temperature',
      'mean_temperature',
      'avg_temperature',
      'average_temperature',
      'temperature_at_2_meters',
      't2m',
    ],
    fallback: (key) =>
      key === 't2m' ||
      key.includes('temperature') ||
      key.includes('temp'),
  },
  humidity: {
    label: 'humidity',
    aliases: [
      'humidity',
      'relative_humidity',
      'relative_humidity_percent',
      'humidity_percent',
      'rh',
      'rh2m',
      'relative_humidity_at_2_meters',
    ],
    fallback: (key) =>
      key === 'rh2m' ||
      key === 'rh' ||
      key.includes('humidity'),
  },
}

const dengueFieldConfig = {
  barangay: {
    label: 'barangay',
    aliases: [
      'barangay',
      'barangay_name',
      'brgy',
      'brgy_name',
      'location',
      'area',
      'village',
      'adm4_name',
      'adm4_en',
      'name',
    ],
    fallback: (key) =>
      key.includes('barangay') ||
      key.includes('brgy') ||
      key.includes('location') ||
      key.includes('area'),
  },
  reportingDate: {
    label: 'reporting date',
    aliases: [
      'reporting_date',
      'date',
      'reported_date',
      'report_date',
      'week_start',
      'onset_date',
      'period',
      'month',
    ],
    fallback: (key) => key.includes('date') || key.includes('period'),
  },
  year: {
    label: 'year',
    aliases: ['year', 'yr'],
    fallback: (key) => key === 'year' || key === 'yr',
  },
  month: {
    label: 'month',
    aliases: ['month', 'mo'],
    fallback: (key) => key === 'month' || key === 'mo',
  },
  week: {
    label: 'week',
    aliases: [
      'week',
      'epi_week',
      'week_number',
      'morbidity_week',
      'mw',
      'reporting_week',
    ],
    fallback: (key) => key.includes('week') || key === 'mw',
  },
  cases: {
    label: 'cases',
    aliases: [
      'cases',
      'case_count',
      'dengue_cases',
      'total_cases',
      'number_of_cases',
      'confirmed_cases',
      'reported_cases',
    ],
    fallback: (key) => key.includes('case'),
  },
  deaths: {
    label: 'deaths',
    aliases: [
      'deaths',
      'dengue_deaths',
      'death_count',
      'total_deaths',
      'number_of_deaths',
    ],
    fallback: (key) => key.includes('death'),
  },
}

const populationFieldConfig = {
  barangay: {
    label: 'barangay',
    aliases: [
      'barangay',
      'barangay_name',
      'brgy',
      'brgy_name',
      'location',
      'area',
      'village',
      'adm4_name',
      'adm4_en',
      'name',
    ],
    fallback: (key) =>
      key.includes('barangay') ||
      key.includes('brgy') ||
      key.includes('location') ||
      key.includes('area'),
  },
  population: {
    label: 'population',
    aliases: [
      'population',
      'population_count',
      'total_population',
      'pop',
      'pop2020',
      'population_2020',
      '2020_population',
      'census_population',
    ],
    fallback: (key) => key.includes('population') || key === 'pop' || key.includes('pop2020'),
  },
  year: {
    label: 'year',
    aliases: ['year', 'census_year', 'reference_year', 'ref_year'],
    fallback: (key) => key === 'year' || key.includes('census') || key.includes('reference_year'),
  },
  psgc: {
    label: 'PSGC',
    aliases: ['psgc', 'psgc_code', 'code', 'barangay_code', 'brgy_code'],
    fallback: (key) => key.includes('psgc') || key.includes('code'),
  },
}

const knownHeaderFragments = [
  'barangay',
  'brgy',
  'date',
  'year',
  'month',
  'day',
  'doy',
  'week',
  'case',
  'death',
  'rain',
  'precip',
  'prectot',
  'temperature',
  'temp',
  't2m',
  'humidity',
  'rh2m',
  'population',
  'psgc',
  'geometry',
  'name',
]

function normalizeKey(key) {
  return String(key || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/%/g, 'percent')
    .replace(/[()]/g, '')
    .replaceAll(' ', '_')
    .replaceAll('-', '_')
    .replaceAll('/', '_')
    .replace(/[^\w]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const knownHeaderAliases = new Set(
  [
    ...Object.values(weatherFieldConfig).flatMap((field) => field.aliases),
    ...Object.values(dengueFieldConfig).flatMap((field) => field.aliases),
    ...Object.values(populationFieldConfig).flatMap((field) => field.aliases),
  ].map((key) => normalizeKey(key))
)

function normalizeRow(row) {
  return Object.entries(row || {}).reduce((acc, [key, value]) => {
    acc[normalizeKey(key)] = value
    return acc
  }, {})
}

function getAllHeaders(rows) {
  const headers = new Set()

  rows.slice(0, 25).forEach((row) => {
    Object.keys(normalizeRow(row)).forEach((key) => headers.add(key))
  })

  return Array.from(headers)
}

function inferColumn(headers, config) {
  const normalizedAliases = config.aliases.map(normalizeKey)

  for (const alias of normalizedAliases) {
    if (headers.includes(alias)) return alias
  }

  for (const header of headers) {
    if (config.fallback?.(header)) return header
  }

  return ''
}

function inferColumnMap(rows, fieldConfig) {
  const headers = getAllHeaders(rows)

  return Object.entries(fieldConfig).reduce((acc, [field, config]) => {
    acc[field] = inferColumn(headers, config)
    return acc
  }, {})
}

function getMappedValue(row, columnMap, field, aliases = []) {
  const normalized = normalizeRow(row)
  const mappedColumn = columnMap[field]

  if (
    mappedColumn &&
    normalized[mappedColumn] !== undefined &&
    normalized[mappedColumn] !== null &&
    String(normalized[mappedColumn]).trim() !== ''
  ) {
    return normalized[mappedColumn]
  }

  for (const alias of aliases) {
    const value = normalized[normalizeKey(alias)]

    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value
    }
  }

  return ''
}

function parseNumber(value) {
  if (value === undefined || value === null) return null

  const cleaned = String(value)
    .trim()
    .replace(/,/g, '')
    .replace(/%/g, '')

  if (cleaned === '') return null

  const number = Number(cleaned)
  return Number.isFinite(number) ? number : null
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function formatDateUTC(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

function buildDateFromParts(yearValue, monthValue, dayValue) {
  const year = parseNumber(yearValue)
  const month = parseNumber(monthValue)
  const day = parseNumber(dayValue)

  if (!year || !month || !day) return ''

  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return ''
  }

  return formatDateUTC(date)
}

function buildDateFromYearDoy(yearValue, doyValue) {
  const year = parseNumber(yearValue)
  const doy = parseNumber(doyValue)

  if (!year || !doy || doy < 1 || doy > 366) return ''

  const date = new Date(Date.UTC(year, 0, doy))

  if (date.getUTCFullYear() !== year) return ''

  return formatDateUTC(date)
}

function normalizeDateValue(value) {
  if (value === undefined || value === null) return ''

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateUTC(
      new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()))
    )
  }

  const raw = String(value).trim()

  if (!raw) return ''

  if (/^\d{8}$/.test(raw)) {
    const year = raw.slice(0, 4)
    const month = raw.slice(4, 6)
    const day = raw.slice(6, 8)
    return buildDateFromParts(year, month, day)
  }

  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(raw)) {
    const [year, month, day] = raw.split(/[T\s]/)[0].split(/[-/]/)
    return buildDateFromParts(year, month, day)
  }

  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(raw)) {
    const [first, second, year] = raw.split(/[T\s]/)[0].split(/[-/]/)

    const firstNumber = Number(first)
    const secondNumber = Number(second)

    if (firstNumber > 12) {
      return buildDateFromParts(year, second, first)
    }

    if (secondNumber > 12) {
      return buildDateFromParts(year, first, second)
    }

    return buildDateFromParts(year, first, second)
  }

  const excelSerial = Number(raw)

  if (Number.isFinite(excelSerial) && excelSerial > 20000 && excelSerial < 60000) {
    const milliseconds = (excelSerial - 25569) * 86400 * 1000
    const date = new Date(milliseconds)

    if (!Number.isNaN(date.getTime())) {
      return formatDateUTC(date)
    }
  }

  const fallbackDate = new Date(raw)

  if (!Number.isNaN(fallbackDate.getTime())) {
    return formatDateUTC(
      new Date(
        Date.UTC(
          fallbackDate.getFullYear(),
          fallbackDate.getMonth(),
          fallbackDate.getDate()
        )
      )
    )
  }

  return ''
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Unable to read file.'))

    reader.readAsText(file)
  })
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Unable to read Excel file.'))

    reader.readAsArrayBuffer(file)
  })
}

function countDelimiter(line, delimiter) {
  let count = 0
  let insideQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"' && insideQuotes && next === '"') {
      index += 1
      continue
    }

    if (char === '"') {
      insideQuotes = !insideQuotes
      continue
    }

    if (char === delimiter && !insideQuotes) count += 1
  }

  return count
}

function detectDelimiter(text) {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .slice(0, 30)

  const delimiters = [',', ';', '\t']

  const scores = delimiters.map((delimiter) => ({
    delimiter,
    score: lines.reduce((sum, line) => sum + countDelimiter(line, delimiter), 0),
  }))

  scores.sort((a, b) => b.score - a.score)

  return scores[0]?.score > 0 ? scores[0].delimiter : ','
}

function parseCsvRows(text, delimiter) {
  const rows = []
  let row = []
  let value = ''
  let insideQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]

    if (char === '"' && insideQuotes && next === '"') {
      value += '"'
      index += 1
      continue
    }

    if (char === '"') {
      insideQuotes = !insideQuotes
      continue
    }

    if (char === delimiter && !insideQuotes) {
      row.push(value.trim())
      value = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && next === '\n') index += 1

      row.push(value.trim())
      value = ''

      if (row.some((cell) => cell !== '')) {
        rows.push(row)
      }

      row = []
      continue
    }

    value += char
  }

  row.push(value.trim())

  if (row.some((cell) => cell !== '')) {
    rows.push(row)
  }

  return rows
}

function scoreHeaderRow(row) {
  return row.reduce((score, cell) => {
    const key = normalizeKey(cell)

    if (!key) return score
    if (knownHeaderAliases.has(key)) return score + 4
    if (knownHeaderFragments.some((fragment) => key.includes(fragment))) return score + 1

    return score
  }, 0)
}

function findHeaderIndex(rows) {
  let bestIndex = 0
  let bestScore = 0

  rows.forEach((row, index) => {
    const score = scoreHeaderRow(row.map((cell) => String(cell || '')))

    if (score > bestScore) {
      bestIndex = index
      bestScore = score
    }
  })

  return bestScore >= 2 ? bestIndex : 0
}

function rowsToObjects(rows) {
  if (rows.length === 0) return []

  const headerIndex = findHeaderIndex(rows)
  const headers = rows[headerIndex] || []
  const body = rows.slice(headerIndex + 1)
  const normalizedHeaders = headers.map(normalizeKey)

  return body
    .filter((cells) => cells.some((cell) => String(cell || '').trim() !== ''))
    .map((cells) => {
      return normalizedHeaders.reduce((acc, header, index) => {
        if (!header) return acc
        acc[header] = cells[index] ?? ''
        return acc
      }, {})
    })
}

function parseCsv(text) {
  const delimiter = detectDelimiter(text)
  const rows = parseCsvRows(text, delimiter)

  return rowsToObjects(rows)
}

function parseExcelWorkbook(arrayBuffer, preferredSheetKeywords = []) {
  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
    cellDates: true,
  })

  const preferredKeys = preferredSheetKeywords.map(normalizeKey)

  const scoredSheets = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      blankrows: false,
      raw: false,
    })

    const headerScore = rows.slice(0, 30).reduce((total, row) => {
      return total + scoreHeaderRow(row.map((cell) => String(cell || '')))
    }, 0)

    const sheetKey = normalizeKey(sheetName)
    const preferredScore = preferredKeys.some((keyword) => sheetKey.includes(keyword)) ? 1000 : 0

    return {
      sheetName,
      rows,
      score: headerScore + preferredScore,
    }
  })

  scoredSheets.sort((a, b) => b.score - a.score)

  const bestSheet = scoredSheets[0]

  if (!bestSheet || bestSheet.rows.length === 0) {
    throw new Error('Excel file does not contain readable rows.')
  }

  return {
    rows: rowsToObjects(bestSheet.rows),
    sheetName: bestSheet.sheetName,
  }
}

function parseJson(text) {
  const parsed = JSON.parse(text)

  if (Array.isArray(parsed)) return parsed
  if (Array.isArray(parsed.records)) return parsed.records
  if (Array.isArray(parsed.data)) return parsed.data

  return parsed
}

function buildMappingSummary(columnMap, fieldConfig, overrides = {}) {
  const entries = Object.entries(fieldConfig)
    .map(([field, config]) => {
      const source = overrides[field] || columnMap[field]
      return source ? `${config.label} → ${source}` : ''
    })
    .filter(Boolean)

  return entries.join(', ')
}

function validateDengueRows(rows) {
  const columnMap = inferColumnMap(rows, dengueFieldConfig)
  const seen = new Set()
  let missingCount = 0
  let duplicateCount = 0
  let invalidCount = 0

  const previewRows = rows.map((row, index) => {
    const barangay = String(
      getMappedValue(row, columnMap, 'barangay', dengueFieldConfig.barangay.aliases)
    ).trim()

    const directDate = getMappedValue(
      row,
      columnMap,
      'reportingDate',
      dengueFieldConfig.reportingDate.aliases
    )

    const year = getMappedValue(row, columnMap, 'year', dengueFieldConfig.year.aliases)
    const month = getMappedValue(row, columnMap, 'month', dengueFieldConfig.month.aliases)
    const week = getMappedValue(row, columnMap, 'week', dengueFieldConfig.week.aliases)
    const casesValue = getMappedValue(row, columnMap, 'cases', dengueFieldConfig.cases.aliases)
    const deathsValue = getMappedValue(row, columnMap, 'deaths', dengueFieldConfig.deaths.aliases)

    let reportingDate = normalizeDateValue(directDate)

    if (!reportingDate && year && month) {
      reportingDate = buildDateFromParts(year, month, 1)
    }

    if (!reportingDate && year && week) {
      reportingDate = `${year}-W${pad2(week)}`
    }

    const cases = parseNumber(casesValue)
    const deaths = deathsValue === '' ? 0 : parseNumber(deathsValue)

    const missing = !barangay || !reportingDate || casesValue === ''
    const invalid =
      !missing &&
      (cases === null ||
        cases < 0 ||
        deaths === null ||
        deaths < 0)

    const duplicateKey = `${barangay.toLowerCase()}-${reportingDate}-${week || 'no-week'}`
    const duplicate = !missing && !invalid && seen.has(duplicateKey)

    if (!missing && !invalid && !duplicate) seen.add(duplicateKey)
    if (missing) missingCount += 1
    if (invalid) invalidCount += 1
    if (duplicate) duplicateCount += 1

    const status = missing
      ? 'Missing Fields'
      : invalid
        ? 'Invalid Values'
        : duplicate
          ? 'Duplicate'
          : 'Valid'

    return {
      id: Date.now() + index,
      barangay,
      reportingDate,
      week: week || '',
      cases: cases ?? 0,
      deaths: deaths ?? 0,
      status,
    }
  })

  const validRecords = previewRows.filter((row) => row.status === 'Valid')

  return {
    previewRows,
    validRecords,
    recordCount: previewRows.length,
    validCount: validRecords.length,
    missingCount,
    duplicateCount,
    invalidCount,
    mappingSummary: buildMappingSummary(columnMap, dengueFieldConfig),
  }
}

function validateWeatherRows(rows) {
  const columnMap = inferColumnMap(rows, weatherFieldConfig)
  const seen = new Set()
  let missingCount = 0
  let duplicateCount = 0
  let invalidCount = 0

  const dateSourceOverride = !columnMap.reportingDate && columnMap.year && columnMap.doy
    ? 'year + day of year'
    : !columnMap.reportingDate && columnMap.year && columnMap.month && columnMap.day
      ? 'year + month + day'
      : ''

  const previewRows = rows.map((row, index) => {
    const directDate = getMappedValue(
      row,
      columnMap,
      'reportingDate',
      weatherFieldConfig.reportingDate.aliases
    )

    const year = getMappedValue(row, columnMap, 'year', weatherFieldConfig.year.aliases)
    const month = getMappedValue(row, columnMap, 'month', weatherFieldConfig.month.aliases)
    const day = getMappedValue(row, columnMap, 'day', weatherFieldConfig.day.aliases)
    const doy = getMappedValue(row, columnMap, 'doy', weatherFieldConfig.doy.aliases)

    let reportingDate = normalizeDateValue(directDate)

    if (!reportingDate && year && month && day) {
      reportingDate = buildDateFromParts(year, month, day)
    }

    if (!reportingDate && year && doy) {
      reportingDate = buildDateFromYearDoy(year, doy)
    }

    const rainfallValue = getMappedValue(
      row,
      columnMap,
      'rainfall',
      weatherFieldConfig.rainfall.aliases
    )

    const temperatureValue = getMappedValue(
      row,
      columnMap,
      'temperature',
      weatherFieldConfig.temperature.aliases
    )

    const humidityValue = getMappedValue(
      row,
      columnMap,
      'humidity',
      weatherFieldConfig.humidity.aliases
    )

    const rainfall = parseNumber(rainfallValue)
    const temperature = parseNumber(temperatureValue)
    const humidity = parseNumber(humidityValue)

    const missing =
      !reportingDate ||
      rainfallValue === '' ||
      temperatureValue === '' ||
      humidityValue === ''

    const invalid =
      !missing &&
      (rainfall === null ||
        temperature === null ||
        humidity === null ||
        rainfall < 0 ||
        humidity < 0 ||
        humidity > 100 ||
        temperature < -20 ||
        temperature > 60)

    const duplicateKey = reportingDate
    const duplicate = !missing && !invalid && seen.has(duplicateKey)

    if (!missing && !invalid && !duplicate) seen.add(duplicateKey)
    if (missing) missingCount += 1
    if (invalid) invalidCount += 1
    if (duplicate) duplicateCount += 1

    const status = missing
      ? 'Missing Fields'
      : invalid
        ? 'Invalid Values'
        : duplicate
          ? 'Duplicate'
          : 'Valid'

    return {
      id: Date.now() + index,
      reportingDate,
      rainfall: rainfall ?? 0,
      temperature: temperature ?? 0,
      humidity: humidity ?? 0,
      status,
    }
  })

  const validRecords = previewRows.filter((row) => row.status === 'Valid')

  return {
    previewRows,
    validRecords,
    recordCount: previewRows.length,
    validCount: validRecords.length,
    missingCount,
    duplicateCount,
    invalidCount,
    mappingSummary: buildMappingSummary(columnMap, weatherFieldConfig, {
      reportingDate: columnMap.reportingDate || dateSourceOverride,
    }),
  }
}

function validatePopulationRows(rows) {
  const columnMap = inferColumnMap(rows, populationFieldConfig)
  const seen = new Set()
  let missingCount = 0
  let duplicateCount = 0
  let invalidCount = 0

  const previewRows = rows.map((row, index) => {
    const barangay = String(
      getMappedValue(row, columnMap, 'barangay', populationFieldConfig.barangay.aliases)
    ).trim()

    const populationValue = getMappedValue(
      row,
      columnMap,
      'population',
      populationFieldConfig.population.aliases
    )

    const year = getMappedValue(row, columnMap, 'year', populationFieldConfig.year.aliases)
    const psgc = getMappedValue(row, columnMap, 'psgc', populationFieldConfig.psgc.aliases)
    const population = parseNumber(populationValue)

    const missing = !barangay || populationValue === ''
    const invalid = !missing && (population === null || population < 0)
    const duplicateKey = `${barangay.toLowerCase()}-${year || 'no-year'}`
    const duplicate = !missing && !invalid && seen.has(duplicateKey)

    if (!missing && !invalid && !duplicate) seen.add(duplicateKey)
    if (missing) missingCount += 1
    if (invalid) invalidCount += 1
    if (duplicate) duplicateCount += 1

    const status = missing
      ? 'Missing Fields'
      : invalid
        ? 'Invalid Values'
        : duplicate
          ? 'Duplicate'
          : 'Valid'

    return {
      id: Date.now() + index,
      barangay,
      population: population ?? 0,
      year: year || '',
      psgc: psgc || '',
      status,
    }
  })

  const validRecords = previewRows.filter((row) => row.status === 'Valid')

  return {
    previewRows,
    validRecords,
    recordCount: previewRows.length,
    validCount: validRecords.length,
    missingCount,
    duplicateCount,
    invalidCount,
    mappingSummary: buildMappingSummary(columnMap, populationFieldConfig),
  }
}

function getBoundaryName(feature, index) {
  const properties = feature.properties || {}

  return (
    properties.name ||
    properties.NAME ||
    properties.barangay ||
    properties.BARANGAY ||
    properties.barangay_name ||
    properties.BARANGAY_NAME ||
    properties.brgy ||
    properties.BRGY ||
    properties.brgy_name ||
    properties.BRGY_NAME ||
    properties.adm4_name ||
    properties.ADM4_NAME ||
    properties.adm4_en ||
    properties.ADM4_EN ||
    properties.NAME_4 ||
    properties.name_4 ||
    `Boundary ${index + 1}`
  )
}

function validateBoundaryData(data) {
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    return {
      previewRows: [],
      validRecords: [],
      recordCount: 0,
      validCount: 0,
      missingCount: 1,
      duplicateCount: 0,
      invalidCount: 0,
      error: 'Boundary file must be a valid GeoJSON FeatureCollection.',
    }
  }

  let missingCount = 0

  const previewRows = data.features.map((feature, index) => {
    const name = getBoundaryName(feature, index)
    const hasGeometry = Boolean(feature.geometry)
    const hasCoordinates = Boolean(feature.geometry?.coordinates)

    const status = hasGeometry && hasCoordinates ? 'Valid' : 'Missing Geometry'

    if (status !== 'Valid') missingCount += 1

    return {
      id: Date.now() + index,
      barangay: name,
      geometryType: feature.geometry?.type || 'No geometry',
      status,
    }
  })

  const validRows = previewRows.filter((row) => row.status === 'Valid')

  return {
    previewRows,
    validRecords: validRows.length > 0 ? [data] : [],
    recordCount: previewRows.length,
    validCount: validRows.length,
    missingCount,
    duplicateCount: 0,
    invalidCount: 0,
    mappingSummary: 'GeoJSON FeatureCollection → barangay boundary layer',
  }
}

function getStatusStyle(badge = '') {
  const value = String(badge).toLowerCase()

  if (value.includes('review') || value.includes('missing') || value.includes('invalid')) {
    return 'bg-amber-50 text-brand-orange border-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
  }

  if (value.includes('uploaded') || value.includes('sample') || value.includes('ready') || value.includes('valid')) {
    return 'bg-emerald-50 text-brand-green border-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
  }

  return 'bg-slate-50 text-brand-muted border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

function getSourceRecords(sourceId, data) {
  if (sourceId === 'historical') return data.dengueRecords || []
  if (sourceId === 'meteorological') return data.weatherRecords || []
  if (sourceId === 'demographic') return data.populationRecords || []
  if (sourceId === 'boundary') return data.boundaryRecords || []

  return []
}

function renderPreviewCells(sourceId, row) {
  if (sourceId === 'historical') {
    return [
      row.barangay,
      row.reportingDate,
      row.week,
      row.cases,
      row.deaths,
      row.status,
    ]
  }

  if (sourceId === 'meteorological') {
    return [
      row.reportingDate,
      row.rainfall,
      row.temperature,
      row.humidity,
      row.status,
    ]
  }

  if (sourceId === 'demographic') {
    return [
      row.barangay,
      row.population,
      row.year,
      row.status,
    ]
  }

  if (sourceId === 'boundary') {
    return [
      row.barangay || 'GeoJSON layer',
      row.geometryType || 'FeatureCollection',
      row.status || 'Valid',
    ]
  }

  return []
}

function getPreviewHeaders(sourceId) {
  if (sourceId === 'historical') return ['Barangay', 'Date', 'Week', 'Cases', 'Deaths', 'Status']
  if (sourceId === 'meteorological') return ['Date', 'Rainfall', 'Temperature', 'Humidity', 'Status']
  if (sourceId === 'demographic') return ['Barangay', 'Population', 'Year', 'Status']
  if (sourceId === 'boundary') return ['Barangay', 'Geometry', 'Status']

  return []
}


function formatBackendMappingSummary(detection = {}) {
  const matchedFields = detection.matched_fields || {}

  const labels = {
    barangay: 'barangay',
    date: 'date',
    year: 'year',
    month: 'month',
    week: 'week',
    cases: 'cases',
    deaths: 'deaths',
  }

  return Object.entries(matchedFields)
    .map(([field, sourceColumn]) => `${labels[field] || field} → ${sourceColumn}`)
    .join(', ')
}

function getBackendValidationCounts(cleanResult = {}) {
  const summary = cleanResult.validation_summary || {}

  const missingCount =
    Number(summary.invalid_barangay_rows || 0) +
    Number(summary.invalid_time_rows || 0)

  const invalidCount =
    Number(summary.invalid_cases_rows || 0) +
    Number(summary.invalid_deaths_rows || 0)

  return {
    missingCount,
    invalidCount,
    duplicateCount: 0,
  }
}

function mapBackendCleanedRows(cleanedRows = []) {
  return cleanedRows.map((row, index) => ({
    id: Date.now() + index,
    barangay: row.barangay || '',
    reportingDate: row.date || row.period || '',
    period: row.period || row.date || '',
    date: row.date || '',
    year: row.year ?? '',
    month: row.month ?? '',
    week: row.week ?? '',
    cases: Number(row.cases || 0),
    deaths: Number(row.deaths || 0),
    status: 'Valid',
  }))
}

function mapBackendInvalidRows(invalidRows = []) {
  return invalidRows.map((row, index) => ({
    id: Date.now() + 10000 + index,
    barangay: row.barangay || '',
    reportingDate: row.date || row.period || '',
    period: row.period || row.date || '',
    date: row.date || '',
    year: row.year ?? '',
    month: row.month ?? '',
    week: row.week ?? '',
    cases: Number(row.cases || 0),
    deaths: Number(row.deaths || 0),
    status: 'Needs Review',
  }))
}

function buildBackendDengueValidationResult({
  fileName,
  inspectResult,
  cleanResult,
  summaryResult,
  forecastResult,
}) {
  const counts = getBackendValidationCounts(cleanResult)
  const validRecords = mapBackendCleanedRows(cleanResult.cleaned_preview || [])
  const invalidPreview = mapBackendInvalidRows(cleanResult.invalid_preview || [])
  const mappingSummary = formatBackendMappingSummary(cleanResult.dengue_detection)

  return {
    sourceId: 'historical',
    fileName,
    backendPowered: true,
    previewRows: [...validRecords, ...invalidPreview],
    validRecords,
    recordCount: Number(cleanResult.original_row_count || 0),
    validCount: Number(cleanResult.valid_row_count || 0),
    missingCount: counts.missingCount,
    duplicateCount: counts.duplicateCount,
    invalidCount: counts.invalidCount,
    mappingSummary,
    inspectResult,
    cleanResult,
    summaryResult,
    forecastResult,
  }
}

export default function UploadPage() {
  const navigate = useNavigate()
  const data = useData()
  const {
    sourceStatus,
    updateWorkspace,
    addActivityLog,
    riskRows = [],
  } = data

  const [selected, setSelected] = useState('historical')
  const [validationResult, setValidationResult] = useState(null)
  const [uploadMessage, setUploadMessage] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const selectedSource = sources.find((item) => item.id === selected) || sources[0]
  const selectedStatus = sourceStatus?.[selectedSource.contextKey] || {}

  const storedRecords = useMemo(() => {
    return getSourceRecords(selected, data)
  }, [selected, data])

  const previewRows = validationResult?.sourceId === selected
    ? validationResult.previewRows
    : storedRecords.slice(0, 8)

  const previewHeaders = getPreviewHeaders(selected)

  const checklist = [
    {
      label: 'Historical dengue data available',
      ready: Number(sourceStatus?.dengue?.validCount || 0) > 0,
    },
    {
      label: 'Meteorological fields available',
      ready: Number(sourceStatus?.weather?.validCount || 0) > 0,
    },
    {
      label: 'Demographic data available',
      ready: Number(sourceStatus?.population?.validCount || 0) > 0,
    },
    {
      label: 'Boundary layer available',
      ready: Number(sourceStatus?.boundary?.validCount || 0) > 0,
    },
    {
      label: 'Forecast workflow ready',
      ready: riskRows.length > 0,
    },
  ]

  const currentStats = validationResult?.sourceId === selected
    ? validationResult
    : {
        missingCount: 0,
        duplicateCount: 0,
        invalidCount: 0,
        validCount: selectedStatus.validCount || storedRecords.length,
        recordCount: selectedStatus.recordCount || storedRecords.length,
      }

  const ActiveSourceIcon = selectedSource.icon
  const validPercent = Number(currentStats.recordCount || 0) > 0
    ? Math.round((Number(currentStats.validCount || 0) / Number(currentStats.recordCount || 0)) * 100)
    : 0
  const readyChecklistCount = checklist.filter((item) => item.ready).length
  const loadedSourceCount = sources.filter((source) => {
    return Number(sourceStatus?.[source.contextKey]?.validCount || 0) > 0
  }).length
  const selectedFileName = selectedStatus.uploadedName || 'No file uploaded yet'

  async function handleFileUpload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file || !selectedSource) return

    setIsProcessing(true)
    setUploadMessage('')
    setUploadError('')

    try {
      const fileName = file.name.toLowerCase()
      const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls')
      const isCsv = fileName.endsWith('.csv')

      if (selected === 'historical' && (isCsv || isExcel)) {
        const inspectResult = await inspectUploadedFile(file)
        const cleanResult = await cleanDengueFile(file)
        const summaryResult = await summarizeDengueFile(file)
        const forecastResult = await forecastDengueFile(file)

        const backendResult = buildBackendDengueValidationResult({
          fileName: file.name,
          inspectResult,
          cleanResult,
          summaryResult,
          forecastResult,
        })

        updateWorkspace((current) => ({
          ...current,
          [selectedSource.recordKey]: backendResult.validRecords,
          backendDengueSummary: summaryResult,
          backendForecastResult: forecastResult,
          sourceStatus: {
            ...(current.sourceStatus || {}),
            [selectedSource.contextKey]: {
              uploadedName: file.name,
              badge: backendResult.validCount > 0 ? 'Backend Validated' : 'Needs Review',
              recordCount: backendResult.recordCount,
              validCount: backendResult.validCount,
              missingCount: backendResult.missingCount,
              duplicateCount: backendResult.duplicateCount,
              invalidCount: backendResult.invalidCount,
              mappingSummary: backendResult.mappingSummary,
              backendPowered: true,
            },
          },
        }))

        setValidationResult(backendResult)

        const riskCounts = forecastResult.risk_counts || {}
        const riskNote = ` Forecast generated: ${riskCounts.High || 0} high, ${riskCounts.Moderate || 0} moderate, and ${riskCounts.Low || 0} low-risk barangays.`
        const invalidNote = backendResult.recordCount > backendResult.validCount
          ? ` ${backendResult.recordCount - backendResult.validCount} row(s) need review.`
          : ''

        const highRiskCount = Number(forecastResult?.risk_counts?.High || 0)
const moderateRiskCount = Number(forecastResult?.risk_counts?.Moderate || 0)
const lowRiskCount = Number(forecastResult?.risk_counts?.Low || 0)

setUploadMessage(
  `Upload successful. Dengue records are ready for analysis. The system identified ${highRiskCount} high-risk barangay${highRiskCount === 1 ? '' : 's'}, ${moderateRiskCount} moderate-risk barangay${moderateRiskCount === 1 ? '' : 's'}, and ${lowRiskCount} low-risk barangay${lowRiskCount === 1 ? '' : 's'}.`
)

        addActivityLog(
          'Backend dengue dataset uploaded',
          `${selectedSource.title} uploaded from ${file.name}. Backend valid records: ${backendResult.validCount}/${backendResult.recordCount}.`
        )

        return
      }

      let parsed
      let result
      let usedSheetName = ''

      if (isExcel) {
        if (selected === 'boundary') {
          throw new Error('Excel files cannot be used as barangay boundary layers. Please upload GeoJSON or JSON for boundary data.')
        }

        const preferredSheetKeywords = ['butuan']
        const arrayBuffer = await readFileAsArrayBuffer(file)
        const excelResult = parseExcelWorkbook(arrayBuffer, preferredSheetKeywords)

        parsed = excelResult.rows
        usedSheetName = excelResult.sheetName

        if (selected === 'historical') result = validateDengueRows(parsed)
        if (selected === 'meteorological') result = validateWeatherRows(parsed)
        if (selected === 'demographic') result = validatePopulationRows(parsed)
      } else {
        const text = await readFileAsText(file)

        if (selected === 'boundary') {
          parsed = parseJson(text)
          result = validateBoundaryData(parsed)
        } else if (fileName.endsWith('.json')) {
          parsed = parseJson(text)

          if (!Array.isArray(parsed)) {
            throw new Error('JSON file must contain an array of records or a records/data array.')
          }

          if (selected === 'historical') result = validateDengueRows(parsed)
          if (selected === 'meteorological') result = validateWeatherRows(parsed)
          if (selected === 'demographic') result = validatePopulationRows(parsed)
        } else {
          parsed = parseCsv(text)

          if (selected === 'historical') result = validateDengueRows(parsed)
          if (selected === 'meteorological') result = validateWeatherRows(parsed)
          if (selected === 'demographic') result = validatePopulationRows(parsed)
        }
      }

      if (!result) {
        throw new Error('Unable to validate the selected file.')
      }

      if (result.error) {
        throw new Error(result.error)
      }

      const finalMappingSummary = usedSheetName
        ? `${result.mappingSummary || ''}${result.mappingSummary ? ', ' : ''}Excel sheet → ${usedSheetName}`
        : result.mappingSummary

      updateWorkspace((current) => ({
        ...current,
        [selectedSource.recordKey]: result.validRecords,
        sourceStatus: {
          ...(current.sourceStatus || {}),
          [selectedSource.contextKey]: {
            uploadedName: file.name,
            badge: result.validCount > 0 ? 'Uploaded' : 'Needs Review',
            recordCount: result.recordCount,
            validCount: result.validCount,
            missingCount: result.missingCount,
            duplicateCount: result.duplicateCount,
            invalidCount: result.invalidCount,
            mappingSummary: finalMappingSummary,
          },
        },
      }))

      setValidationResult({
        ...result,
        mappingSummary: finalMappingSummary,
        sourceId: selected,
        fileName: file.name,
      })

      const mappingNote = finalMappingSummary
        ? ` Auto-mapped fields: ${finalMappingSummary}.`
        : ''

      setUploadMessage(
        `${file.name} was uploaded, auto-cleaned, and validated. ${result.validCount} of ${result.recordCount} records are valid.${mappingNote}`
      )

      addActivityLog(
        'Dataset uploaded',
        `${selectedSource.title} uploaded from ${file.name}. Valid records: ${result.validCount}/${result.recordCount}.`
      )
    } catch (error) {
      setUploadError(error.message || 'Upload failed. Please check the file and try again.')

      addActivityLog(
        'Dataset upload failed',
        `${selectedSource.title} upload failed.`
      )
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="relative space-y-6 pb-10">
      <div className="pointer-events-none absolute inset-x-0 -top-8 -z-10 h-72 rounded-full bg-blue-100/60 blur-3xl dark:bg-blue-500/10" />

      <section className="relative overflow-hidden rounded-[36px] border border-slate-900/10 bg-gradient-to-br from-slate-950 via-blue-950 to-emerald-900 p-5 shadow-[0_28px_70px_rgba(15,23,42,0.20)] dark:border-slate-800 sm:p-6 lg:p-7">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-10 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.16),transparent_34%)]" />

        <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-stretch">
          <div className="flex flex-col justify-between">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/90 backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                Data intake center
              </div>

              <h1 className="max-w-4xl text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
                Data Upload and Validation
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-7 text-white/80 sm:text-base">
                Upload dengue, weather, population, and boundary datasets. The system automatically maps fields, cleans records, validates data quality, and prepares the workspace for forecasting.
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] border border-white/20 bg-white/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/60">
                  Sources loaded
                </p>
                <p className="mt-3 text-2xl font-black text-white">
                  {loadedSourceCount}/{sources.length}
                </p>
                <p className="mt-1 text-xs leading-5 text-white/70">
                  Datasets with valid records
                </p>
              </div>

              <div className="rounded-[22px] border border-white/20 bg-white/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/60">
                  Current validity
                </p>
                <p className="mt-3 text-2xl font-black text-white">
                  {validPercent}%
                </p>
                <p className="mt-1 text-xs leading-5 text-white/70">
                  Valid records in selected source
                </p>
              </div>

              <div className="rounded-[22px] border border-white/20 bg-white/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/60">
                  Forecast readiness
                </p>
                <p className="mt-3 text-2xl font-black text-white">
                  {readyChecklistCount}/{checklist.length}
                </p>
                <p className="mt-1 text-xs leading-5 text-white/70">
                  Required checks completed
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-white/20 bg-white/20 p-5 shadow-[0_20px_48px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] border border-white/20 bg-white/20 text-white shadow-inner">
                <ActiveSourceIcon className="h-7 w-7" strokeWidth={2.2} />
              </div>

              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/60">
                  Selected source
                </p>
                <h2 className="mt-2 text-xl font-black tracking-tight text-white">
                  {selectedSource.title}
                </h2>
                <p className="mt-1 text-sm leading-6 text-white/70">
                  {selectedSource.desc}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-white/20 bg-black/10 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/60">
                Current file
              </p>
              <p className="mt-2 break-words text-sm font-bold leading-6 text-white">
                {selectedFileName}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-black text-white/80">
                  {selectedSource.type}
                </span>
                <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${getStatusStyle(selectedStatus.badge || 'Not loaded')}`}>
                  {selectedStatus.badge || 'Not loaded'}
                </span>
              </div>
            </div>

            <label
  style={{
    backgroundColor: '#ffffff',
    color: '#0f172a',
    borderColor: 'rgba(255,255,255,0.45)',
  }}
  className="group mt-5 flex min-h-[82px] cursor-pointer items-center justify-between gap-4 rounded-[24px] border px-5 py-4 shadow-[0_18px_38px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_46px_rgba(15,23,42,0.20)]"
>
  <div className="flex min-w-0 items-center gap-3">
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-blue text-white shadow-[0_12px_24px_rgba(37,95,143,0.24)]">
      <UploadCloud className="h-5 w-5" />
    </div>

    <div className="min-w-0">
      <p
        style={{ color: '#0f172a' }}
        className="break-words text-sm font-black leading-5"
      >
        {isProcessing ? 'Processing file...' : `Choose ${selectedSource.title} file`}
      </p>

      <p
        style={{ color: '#64748b' }}
        className="mt-1 text-xs font-semibold leading-5"
      >
        Automatic mapping, cleaning, and validation
      </p>
    </div>
  </div>

  <div
    style={{
      backgroundColor: '#f1f5f9',
      color: '#255f8f',
    }}
    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition group-hover:translate-x-0.5"
  >
    →
  </div>

  <input
    type="file"
    className="hidden"
    accept={selectedSource?.accept}
    onChange={handleFileUpload}
    disabled={isProcessing}
  />
</label>
          </div>
        </div>
      </section>

      <div
        id="data-upload"
        className="scroll-mt-28 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.18fr)_390px]"
      >
        <div className="space-y-5">
          <div className="rounded-[32px] border border-brand-line/70 bg-white/90 p-4 shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                  <Database className="h-3.5 w-3.5" />
                  Dataset sources
                </div>
                <h3 className="text-xl font-black tracking-tight text-brand-text dark:text-slate-100">
                  Select the dataset to upload
                </h3>
                <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                  Each source is validated separately so the forecast workflow receives clean and standardized records.
                </p>
              </div>

              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {loadedSourceCount} active source{loadedSourceCount === 1 ? '' : 's'}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {sources.map((source) => {
                const isActive = selected === source.id
                const status = sourceStatus?.[source.contextKey] || {}
                const badge = status.badge || 'Not loaded'
                const SourceIcon = source.icon
                const validCount = Number(status.validCount || 0)
                const recordCount = Number(status.recordCount || 0)
                const sourcePercent = recordCount > 0 ? Math.round((validCount / recordCount) * 100) : 0

                return (
                  <button
                    key={source.id}
                    id={source.id === 'boundary' ? 'boundary-upload' : undefined}
                    type="button"
                    onClick={() => {
                      setSelected(source.id)
                      setUploadMessage('')
                      setUploadError('')
                    }}
                    className={`group relative overflow-hidden rounded-[28px] border p-5 text-left shadow-[0_14px_34px_rgba(15,23,42,0.06)] transition-all duration-200 dark:shadow-none ${
                      isActive
                        ? 'border-brand-blue bg-gradient-to-br from-blue-50 via-white to-sky-50 ring-2 ring-brand-blue/20 dark:border-blue-500/50 dark:from-blue-500/10 dark:via-slate-900 dark:to-slate-900 dark:ring-blue-500/20'
                        : 'border-brand-line/70 bg-white/90 hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-[0_22px_44px_rgba(15,23,42,0.09)] dark:border-slate-800 dark:bg-slate-900/90 dark:hover:shadow-none'
                    }`}
                  >
                    <div className={`pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-gradient-to-br ${source.glow} blur-2xl opacity-70 transition group-hover:opacity-100`} />

                    <div className="relative flex items-start justify-between gap-3">
                      <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] border shadow-sm ${source.color}`}>
                        <SourceIcon className="h-6 w-6" strokeWidth={2.3} />
                      </div>

                      <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-black ${getStatusStyle(badge)}`}>
                        {badge}
                      </span>
                    </div>

                    <div className="relative mt-4">
                      <h3 className="text-lg font-black tracking-tight text-brand-text dark:text-slate-100">
                        {source.title}
                      </h3>

                      <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                        {source.desc}
                      </p>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-bold text-brand-muted dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                          {source.type}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-bold text-brand-muted dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                          {validCount}/{recordCount} valid
                        </span>
                      </div>

                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-brand-blue transition-all"
                          style={{ width: `${sourcePercent}%` }}
                        />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-[32px] border border-brand-line/70 bg-white/90 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Data quality
                </div>
                <h3 className="text-xl font-black tracking-tight text-brand-text dark:text-slate-100">
                  Validation summary
                </h3>
                <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                  Uploaded files are automatically mapped, cleaned, and checked before forecasting.
                </p>
              </div>

              <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-right dark:border-slate-700 dark:bg-slate-800/70">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400">
                  Validity score
                </p>
                <p className="mt-1 text-2xl font-black text-brand-text dark:text-slate-100">
                  {validPercent}%
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Missing values', currentStats.missingCount || 0, AlertTriangle, 'border-rose-100 bg-rose-50 text-brand-red dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300'],
                ['Invalid values', currentStats.invalidCount || 0, AlertTriangle, 'border-orange-100 bg-orange-50 text-brand-orange dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300'],
                ['Duplicates removed', currentStats.duplicateCount || 0, FileCheck2, 'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'],
                ['Valid records', `${currentStats.validCount || 0}/${currentStats.recordCount || 0}`, CheckCircle2, 'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'],
              ].map(([label, value, Icon, style]) => (
                <div
                  key={label}
                  className="rounded-[24px] border border-brand-line bg-gradient-to-b from-white to-slate-50 p-4 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-slate-900 dark:shadow-none"
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${style}`}>
                    <Icon className="h-5 w-5" />
                  </div>

                  <p className="mt-4 text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                    {label}
                  </p>

                  <p className="mt-2 text-3xl font-black tracking-tight text-brand-text dark:text-slate-100">
                    {value}
                  </p>
                </div>
              ))}
            </div>

            {uploadMessage && (
              <div className="mt-5 flex items-start gap-3 rounded-[24px] border border-emerald-100 bg-emerald-50/80 p-4 text-sm leading-6 text-brand-green shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/70 shadow-sm dark:bg-white/10">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <p>{uploadMessage}</p>
              </div>
            )}

            {uploadError && (
              <div className="mt-5 flex items-start gap-3 rounded-[24px] border border-rose-100 bg-rose-50/80 p-4 text-sm leading-6 text-brand-red shadow-sm dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/70 shadow-sm dark:bg-white/10">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <p>{uploadError}</p>
              </div>
            )}

            {(validationResult?.sourceId === selected && validationResult.mappingSummary) && (
              <div className="mt-5 rounded-[24px] border border-blue-100 bg-blue-50/80 p-4 text-sm leading-6 text-brand-blue shadow-sm dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                <span className="font-black">Auto-cleaning details:</span>{' '}
                {validationResult.mappingSummary}
              </div>
            )}
          </div>

          <div className="rounded-[32px] border border-brand-line/70 bg-white/90 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                  <Table2 className="h-3.5 w-3.5" />
                  Records preview
                </div>
                <h3 className="text-xl font-black tracking-tight text-brand-text dark:text-slate-100">
                  Cleaned records preview
                </h3>
                <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                  Preview of standardized records after automatic cleaning and validation.
                </p>
              </div>

              <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Showing 8 rows
              </span>
            </div>

            <div className="mt-5 overflow-hidden rounded-[24px] border border-brand-line dark:border-slate-800">
              <div className="max-w-full overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-brand-muted dark:bg-slate-950 dark:text-slate-400">
                    <tr>
                      {previewHeaders.map((header) => (
                        <th key={header} className="px-4 py-4 font-black">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                    {previewRows.length > 0 ? (
                      previewRows.slice(0, 8).map((row, index) => {
                        const cells = renderPreviewCells(selected, row)

                        return (
                          <tr key={row.id || index} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/60">
                            {cells.map((cell, cellIndex) => {
                              const isStatusCell = cellIndex === cells.length - 1

                              return (
                                <td
                                  key={`${row.id || index}-${cellIndex}`}
                                  className="px-4 py-4 text-sm text-brand-text dark:text-slate-300"
                                >
                                  {isStatusCell ? (
                                    <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black ${getStatusStyle(String(cell || ''))}`}>
                                      {String(cell || 'N/A')}
                                    </span>
                                  ) : (
                                    String(cell || 'N/A')
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={previewHeaders.length}
                          className="px-4 py-10 text-center text-sm text-brand-muted dark:text-slate-400"
                        >
                          No records available for this source yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="mt-3 text-xs text-brand-muted dark:text-slate-500">
              Showing up to 8 records only. Swipe sideways on mobile to view the full table.
            </p>
          </div>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-[32px] border border-brand-line/70 bg-white/90 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Validation
            </div>

            <h3 className="text-xl font-black tracking-tight text-brand-text dark:text-slate-100">
              Readiness checklist
            </h3>

            <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
              Complete each requirement before relying on the forecast and DSS outputs.
            </p>

            <div className="mt-5 space-y-3">
              {checklist.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-3 rounded-[22px] border border-brand-line bg-gradient-to-r from-slate-50 to-white px-4 py-3.5 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-slate-900 dark:shadow-none"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                        item.ready
                          ? 'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                          : 'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
                      }`}
                    >
                      {item.ready ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <AlertTriangle className="h-4 w-4" />
                      )}
                    </div>

                    <span className="text-sm font-bold leading-6 text-brand-text dark:text-slate-100">
                      {item.label}
                    </span>
                  </div>

                  <span
                    className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-black ${
                      item.ready
                        ? 'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                        : 'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
                    }`}
                  >
                    {item.ready ? 'Ready' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-brand-line/70 bg-white/90 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
              <UploadCloud className="h-3.5 w-3.5" />
              Upload control
            </div>

            <h3 className="text-xl font-black tracking-tight text-brand-text dark:text-slate-100">
              Upload selected source
            </h3>

            <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                Selected source
              </p>
              <div className="mt-3 flex items-start gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${selectedSource.color}`}>
                  <ActiveSourceIcon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-black text-brand-text dark:text-slate-100">
                    {selectedSource.title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                    {selectedSource.desc}
                  </p>
                </div>
              </div>

              <p className="mt-4 break-words text-xs leading-5 text-brand-muted dark:text-slate-500">
                Current source file: {selectedFileName}
              </p>
            </div>

            <label className="mt-5 flex min-h-[56px] cursor-pointer items-center justify-center gap-2 rounded-[22px] border border-brand-blue bg-brand-blue px-4 py-4 text-center text-sm font-black leading-5 text-white shadow-[0_14px_30px_rgba(37,95,143,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(37,95,143,0.34)] dark:border-blue-500/30">
              <UploadCloud className="h-4 w-4" />
              {isProcessing ? 'Processing file...' : `Choose ${selectedSource?.title} file`}
              <input
                type="file"
                className="hidden"
                accept={selectedSource?.accept}
                onChange={handleFileUpload}
                disabled={isProcessing}
              />
            </label>

            <div className="mt-5 rounded-[24px] border border-amber-100 bg-amber-50/75 p-4 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/10 dark:shadow-none">
              <p className="text-sm font-black text-brand-orange dark:text-amber-300">
                File format note
              </p>

              <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                CSV, Excel, JSON, and GeoJSON are supported. Boundary layers must be uploaded as GeoJSON or JSON. Shapefile parsing can be added later through the backend.
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate('/forecast')}
              className="group mt-5 flex w-full items-center justify-center gap-2 rounded-[22px] bg-gradient-to-r from-brand-blue to-[#255f8f] px-4 py-4 text-sm font-black text-white shadow-[0_14px_30px_rgba(37,95,143,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(37,95,143,0.34)]"
            >
              Proceed to Forecast
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}