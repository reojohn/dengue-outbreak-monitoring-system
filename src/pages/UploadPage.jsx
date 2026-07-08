import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  CloudRain,
  Database,
  FileCheck2,
  FileText,
  Loader2,
  Map as MapIcon,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Table2,
  UploadCloud,
  Users,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { useData } from '../context/DataContext'
import {
  autoRunModel,
  cleanDengueFile,
  forecastDengueFile,
  getBackendAlignmentReport,
  getUploadDatabasePreview,
  getUploadDatabaseStatus,
  getUploadJobStatus,
  inspectUploadedFile,
  summarizeDengueFile,
  validateBoundaryFile,
  validatePopulationFile,
  validateWeatherFile,
} from '../services/api'

const sources = [
  {
    id: 'historical',
    contextKey: 'dengue',
    recordKey: 'dengueRecords',
    title: 'Dengue case records',
    desc: 'Dengue cases by barangay and date or month',
    type: 'Spreadsheet / CSV / JSON',
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
    title: 'Weather records',
    desc: 'Rainfall, temperature, and humidity by date',
    type: 'Spreadsheet / CSV / JSON',
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
    title: 'Population records',
    desc: 'Number of people living in each barangay',
    type: 'Spreadsheet / CSV / JSON',
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
    title: 'Map boundary file',
    desc: 'Barangay shapes used to display areas on the map',
    type: 'Map boundary file',
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
      'bgy',
      'bgy_name',
      'name_of_barangay',
      'barangay_of_residence',
      'residence_barangay',
      'residence_brgy',
      'address_barangay',
      'address_brgy',
      'patient_barangay',
      'patient_brgy',
      'case_barangay',
      'case_brgy',
      'home_barangay',
      'home_brgy',
      'location',
      'locality',
      'area',
      'village',
      'adm4_name',
      'adm4_ref_name',
      'adm4_en',
      'name',
    ],
    fallback: (key) =>
      key.includes('barangay') ||
      key.includes('brgy') ||
      key.includes('bgy') ||
      key.includes('residence') ||
      key.includes('address') ||
      key.includes('locality') ||
      key.includes('village') ||
      key.includes('location') ||
      key.includes('adm4') ||
      (key.includes('area') && !key.includes('area_sq') && !key.includes('sqkm')),
  },
  reportingDate: {
    label: 'reporting date',
    aliases: [
      'reporting_date',
      'date',
      'reported_date',
      'report_date',
      'case_date',
      'onset_date',
      'date_of_onset',
      'date_reported',
      'date_admitted',
      'admission_date',
      'consultation_date',
      'morbidity_date',
      'surveillance_date',
      'notification_date',
      'period',
      'reporting_period',
      'week_start',
      'week_ending',
      'week_end',
    ],
    fallback: (key) =>
      key.includes('date') ||
      key.includes('period') ||
      key.includes('onset') ||
      key.includes('admission') ||
      key.includes('consultation') ||
      key.includes('notification'),
  },
  year: {
    label: 'year',
    aliases: [
      'year',
      'yr',
      'report_year',
      'reporting_year',
      'morbidity_year',
      'epi_year',
      'epidemiological_year',
    ],
    fallback: (key) => key === 'year' || key === 'yr' || key.endsWith('_year') || key.includes('epi_year'),
  },
  month: {
    label: 'month',
    aliases: [
      'month',
      'mo',
      'mn',
      'report_month',
      'reporting_month',
      'morbidity_month',
      'case_month',
    ],
    fallback: (key) => key === 'month' || key === 'mo' || key === 'mn' || key.endsWith('_month'),
  },
  week: {
    label: 'week',
    aliases: [
      'week',
      'wk',
      'week_no',
      'week_num',
      'week_number',
      'epi_week',
      'ep_week',
      'epidemiological_week',
      'epidemiologic_week',
      'morbidity_week',
      'mw',
      'reporting_week',
      'case_week',
    ],
    fallback: (key) =>
      key.includes('week') ||
      key === 'mw' ||
      key.includes('epi') ||
      key.includes('epidemiologic') ||
      key.includes('morbidity_week'),
  },
  cases: {
    label: 'cases',
    aliases: [
      'cases',
      'case',
      'case_count',
      'dengue_cases',
      'dengue_case_count',
      'no_of_cases',
      'no._of_cases',
      'number_of_cases',
      'num_cases',
      'total_cases',
      'total_case_count',
      'historical_total_cases',
      'confirmed_cases',
      'confirmed_dengue_cases',
      'reported_cases',
      'reported_dengue_cases',
      'suspected_cases',
      'suspected_dengue_cases',
      'positive_cases',
      'morbidity_cases',
      'admitted_cases',
      'admissions',
      'count',
      'total',
    ],
    fallback: (key) =>
      !key.includes('death') &&
      !key.includes('fatal') &&
      !key.includes('mortality') &&
      (
        key.includes('case') ||
        key.includes('confirmed') ||
        key.includes('reported') ||
        key.includes('suspected') ||
        key.includes('positive') ||
        key.includes('dengue') ||
        key.includes('admission') ||
        key.includes('admitted') ||
        key === 'count' ||
        key === 'total'
      ),
  },
  deaths: {
    label: 'deaths',
    aliases: [
      'deaths',
      'death',
      'dengue_deaths',
      'death_count',
      'no_of_deaths',
      'no._of_deaths',
      'total_deaths',
      'number_of_deaths',
      'num_deaths',
      'fatalities',
      'fatality',
      'mortality',
      'died',
    ],
    fallback: (key) => key.includes('death') || key.includes('fatal') || key.includes('mortality') || key.includes('died'),
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
  'bgy',
  'residence',
  'address',
  'locality',
  'village',
  'date',
  'year',
  'month',
  'day',
  'doy',
  'week',
  'case',
  'confirmed',
  'reported',
  'suspected',
  'morbidity',
  'death',
  'fatal',
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
      error: 'Boundary file must be a valid barangay map boundary file.',
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
    mappingSummary: 'Barangay map boundary loaded',
  }
}

function getStatusStyle(badge = '') {
  const value = String(badge).toLowerCase()

  if (
    value.includes('review') ||
    value.includes('missing') ||
    value.includes('invalid') ||
    value.includes('unmatched') ||
    value.includes('unavailable')
  ) {
    return 'bg-amber-50 text-brand-orange border-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
  }

  if (
    value.includes('uploaded') ||
    value.includes('sample') ||
    value.includes('ready') ||
    value.includes('valid') ||
    value.includes('matched') ||
    value.includes('found') ||
    value.includes('complete') ||
    value.includes('aligned') ||
    value.includes('checked') ||
    value.includes('online')
  ) {
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

function getBoundaryPreviewRows(records = []) {
  const boundaryLayer = Array.isArray(records)
    ? records.find((record) => record?.type === 'FeatureCollection')
    : records

  if (!boundaryLayer?.features || !Array.isArray(boundaryLayer.features)) {
    return Array.isArray(records) ? records : []
  }

  return boundaryLayer.features.map((feature, index) => {
    const hasGeometry = Boolean(feature.geometry)
    const hasCoordinates = Boolean(feature.geometry?.coordinates)

    return {
      id: feature.id || `boundary-preview-${index}`,
      barangay: getBoundaryName(feature, index),
      geometryType: feature.geometry?.type || 'No geometry',
      status: hasGeometry && hasCoordinates ? 'Valid' : 'Missing Geometry',
    }
  })
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
  const validRecords = mapBackendCleanedRows(
  cleanResult.cleaned_records || cleanResult.cleaned_preview || []
)
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

function getBackendPopulationValidationCounts(validateResult = {}) {
  const summary = validateResult.validation_summary || {}

  return {
    missingCount: Number(summary.invalid_barangay_rows || 0),
    invalidCount:
      Number(summary.invalid_population_rows || 0) +
      Number(summary.invalid_year_rows || 0),
    duplicateCount: Number(summary.duplicate_barangay_rows || 0),
  }
}

function mapBackendPopulationRows(rows = [], offset = 0) {
  return rows.map((row, index) => ({
    id: Date.now() + offset + index,
    barangay: row.barangay || '',
    barangayKey: row.barangay_key || '',
    barangayRaw: row.barangay_raw || '',
    population: Number(row.population || 0),
    year: row.year ?? '',
    psgc: row.psgc || '',
    status: row.validation_status || 'Valid',
  }))
}

function formatBackendPopulationMappingSummary(detection = {}) {
  const matchedFields = detection.matched_fields || {}

  const labels = {
    barangay: 'barangay',
    population: 'population',
    year: 'year',
    psgc: 'PSGC',
  }

  return Object.entries(matchedFields)
    .map(([field, sourceColumn]) => `${labels[field] || field} → ${sourceColumn}`)
    .join(', ')
}

function buildBackendPopulationValidationResult({
  fileName,
  validateResult,
}) {
  const counts = getBackendPopulationValidationCounts(validateResult)
  const validRecords = mapBackendPopulationRows(
  validateResult.cleaned_records || validateResult.cleaned_preview || []
)
  const invalidPreview = mapBackendPopulationRows(validateResult.invalid_preview || [], 10000)
  const mappingSummary = formatBackendPopulationMappingSummary(validateResult.population_detection)

  return {
    sourceId: 'demographic',
    fileName,
    backendPowered: true,
    previewRows: [...validRecords, ...invalidPreview],
    validRecords,
    recordCount: Number(validateResult.original_row_count || 0),
    validCount: Number(validateResult.valid_row_count || 0),
    missingCount: counts.missingCount,
    duplicateCount: counts.duplicateCount,
    invalidCount: counts.invalidCount,
    mappingSummary,
    validateResult,
  }
}


function getBackendWeatherValidationCounts(validateResult = {}) {
  const summary = validateResult.validation_summary || {}

  return {
    missingCount: Number(summary.invalid_date_rows || 0),
    invalidCount:
      Number(summary.invalid_rainfall_rows || 0) +
      Number(summary.invalid_temperature_rows || 0) +
      Number(summary.invalid_humidity_rows || 0),
    duplicateCount: Number(summary.duplicate_weather_rows || 0),
  }
}

function mapBackendWeatherRows(rows = [], offset = 0) {
  return rows.map((row, index) => ({
    id: Date.now() + offset + index,
    reportingDate: row.reporting_date || '',
    year: row.year ?? '',
    month: row.month ?? '',
    rainfall: Number(row.rainfall || 0),
    temperature: Number(row.temperature || 0),
    humidity: Number(row.humidity || 0),
    status: row.validation_status || 'Valid',
  }))
}

function formatBackendWeatherMappingSummary(detection = {}) {
  const matchedFields = detection.matched_fields || {}

  const labels = {
    date: 'date',
    year: 'year',
    month: 'month',
    day: 'day',
    doy: 'day of year',
    rainfall: 'rainfall',
    temperature: 'temperature',
    humidity: 'humidity',
  }

  return Object.entries(matchedFields)
    .map(([field, sourceColumn]) => `${labels[field] || field} → ${sourceColumn}`)
    .join(', ')
}

function buildBackendWeatherValidationResult({
  fileName,
  validateResult,
}) {
  const counts = getBackendWeatherValidationCounts(validateResult)
  const validRecords = mapBackendWeatherRows(
  validateResult.cleaned_records || validateResult.cleaned_preview || []
)
  const invalidPreview = mapBackendWeatherRows(validateResult.invalid_preview || [], 10000)
  const mappingSummary = formatBackendWeatherMappingSummary(validateResult.weather_detection)

  return {
    sourceId: 'meteorological',
    fileName,
    backendPowered: true,
    previewRows: [...validRecords, ...invalidPreview],
    validRecords,
    recordCount: Number(validateResult.original_row_count || 0),
    validCount: Number(validateResult.valid_row_count || 0),
    missingCount: counts.missingCount,
    duplicateCount: counts.duplicateCount,
    invalidCount: counts.invalidCount,
    mappingSummary,
    validateResult,
  }
}


function getBackendBoundaryValidationCounts(validateResult = {}) {
  const summary = validateResult.validation_summary || {}

  return {
    missingCount: Number(summary.missing_barangay_name_rows || 0),
    invalidCount: Number(summary.invalid_geometry_rows || 0),
    duplicateCount: Number(summary.duplicate_boundary_rows || 0),
  }
}

function mapBackendBoundaryRows(rows = [], offset = 0) {
  return rows.map((row, index) => ({
    id: row.id || `backend-boundary-${offset + index}`,
    barangay: row.barangay || '',
    barangayKey: row.barangay_key || '',
    barangayRaw: row.barangay_raw || '',
    geometryType: row.geometry_type || row.geometryType || 'Feature',
    psgc: row.psgc || '',
    status: row.status || 'Valid',
  }))
}

function mapBackendBoundaryGeoJsonRows(cleanedGeojson = null) {
  if (!cleanedGeojson?.features || !Array.isArray(cleanedGeojson.features)) {
    return []
  }

  return cleanedGeojson.features.map((feature, index) => {
    const properties = feature.properties || {}

    return {
      id: feature.id || `backend-boundary-feature-${index}`,
      barangay: properties.barangay || properties.adm4_name || properties.name || `Boundary ${index + 1}`,
      barangayKey: properties.barangay_key || '',
      barangayRaw: properties.barangay_raw || properties.adm4_name || properties.name || '',
      geometryType: feature.geometry?.type || 'No geometry',
      psgc: properties.psgc || properties.adm4_pcode || properties.PSGC || '',
      status: properties.validation_status || 'Valid',
    }
  })
}

function formatBackendBoundaryMappingSummary(detection = {}) {
  const matchedFields = detection.matched_fields || {}
  const labels = {
    barangay_name_property: 'barangay name property',
    code_property: 'PSGC/code property',
    geojson_type: 'GeoJSON type',
    features: 'features array',
    geometry: 'geometry field',
    properties: 'properties object',
  }

  const entries = Object.entries(matchedFields)
    .filter(([field]) => !['geojson_type', 'features', 'geometry', 'properties'].includes(field))
    .map(([field, source]) => `${labels[field] || field} → ${source}`)

  if (entries.length > 0) {
    return entries.join(', ')
  }

  const readiness = detection.readiness || 'ready_for_mapping'

  if (readiness === 'ready_for_mapping') {
    return 'Barangay map boundary loaded'
  }

  return 'Barangay map boundary needs review'
}

function buildBackendBoundaryValidationResult({
  fileName,
  validateResult,
}) {
  const counts = getBackendBoundaryValidationCounts(validateResult)
  const cleanedGeojson = validateResult.cleaned_geojson || null
  const geojsonPreviewRows = mapBackendBoundaryGeoJsonRows(cleanedGeojson)
  const cleanedPreviewRows = mapBackendBoundaryRows(validateResult.cleaned_preview || [])
  const invalidPreview = mapBackendBoundaryRows(validateResult.invalid_preview || [], 10000)
  const validPreview = geojsonPreviewRows.length > 0 ? geojsonPreviewRows : cleanedPreviewRows
  const mappingSummary = formatBackendBoundaryMappingSummary(validateResult.boundary_detection)

  return {
    sourceId: 'boundary',
    fileName,
    backendPowered: true,
    previewRows: [...validPreview, ...invalidPreview],
    validRecords: cleanedGeojson ? [cleanedGeojson] : [],
    recordCount: Number(validateResult.original_feature_count || 0),
    validCount: Number(validateResult.valid_feature_count || 0),
    missingCount: counts.missingCount,
    duplicateCount: counts.duplicateCount,
    invalidCount: counts.invalidCount,
    mappingSummary,
    validateResult,
  }
}

function countUsablePreviewRows(rows = []) {
  return rows.filter((row) => {
    const status = String(row?.status || '').toLowerCase()
    return (
      status.includes('valid') ||
      status.includes('saved') ||
      status.includes('checked') ||
      status.includes('ready') ||
      status.includes('clean')
    )
  }).length
}

function selectFullPreviewRows(primaryRows = [], fallbackRows = []) {
  const primary = Array.isArray(primaryRows) ? primaryRows : []
  const fallback = Array.isArray(fallbackRows) ? fallbackRows : []

  const primaryUsableCount = countUsablePreviewRows(primary)
  const fallbackUsableCount = countUsablePreviewRows(fallback)

  if (!primary.length) return fallback
  if (!fallback.length) return primary

  return fallback.length > primary.length && fallbackUsableCount >= primaryUsableCount
    ? fallback
    : primary
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function getCompletedUploadJobResult(job = {}, initialResult = {}) {
  const result =
    job.result ||
    job.output ||
    job.data ||
    job.payload ||
    job.response ||
    null

  if (result && typeof result === 'object' && !Array.isArray(result)) {
    return {
      ...initialResult,
      ...result,
      processing: false,
      upload_job_id: initialResult.upload_job_id || job.upload_job_id || job.job_id || job.id,
      upload_id: result.upload_id || job.upload_id || initialResult.upload_id,
    }
  }

  return {
    ...initialResult,
    ...job,
    processing: false,
    upload_job_id: initialResult.upload_job_id || job.upload_job_id || job.job_id || job.id,
    upload_id: job.upload_id || initialResult.upload_id,
  }
}

async function waitForUploadJobResult(initialResult, onProgress) {
  if (!initialResult?.processing || !initialResult?.upload_job_id) {
    return initialResult
  }

  const jobId = initialResult.upload_job_id
  const startedAt = Date.now()
  const timeoutMs = 180000

  onProgress?.({
    ...initialResult,
    status: 'processing',
    message: initialResult.message || 'File accepted. Background processing is running.',
  })

  while (Date.now() - startedAt < timeoutMs) {
    await sleep(1200)

    const job = await getUploadJobStatus(jobId)

    if (job?.status === 'completed') {
      const completedResult = getCompletedUploadJobResult(job, initialResult)
      window.dispatchEvent(new CustomEvent('dengue-upload-job-completed', { detail: job }))
      return completedResult
    }

    if (job?.status === 'failed') {
      window.dispatchEvent(new CustomEvent('dengue-upload-job-failed', { detail: job }))
      throw new Error(job?.error || job?.message || 'Background processing failed.')
    }

    onProgress?.(job || {
      ...initialResult,
      status: 'processing',
      message: 'Background processing is still running.',
    })
  }

  throw new Error('Background processing is taking too long. Please keep the server running and try refreshing the status.')
}


function shouldBuildLocalPreview(file) {
  return Boolean(file && Number(file.size || 0) <= LARGE_FILE_LOCAL_PREVIEW_LIMIT_BYTES)
}

function getVisibleTableRows(rows = [], page = 1) {
  if (!Array.isArray(rows)) return []

  const safePage = Math.max(1, Number(page || 1))
  const start = (safePage - 1) * TABLE_PAGE_SIZE

  return rows.slice(start, start + TABLE_PAGE_SIZE)
}

function getPageCount(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return 1
  return Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE))
}

function getPageRangeLabel(rows = [], page = 1) {
  if (!Array.isArray(rows) || rows.length === 0) return '0 of 0'

  const safePage = Math.max(1, Number(page || 1))
  const start = (safePage - 1) * TABLE_PAGE_SIZE + 1
  const end = Math.min(rows.length, safePage * TABLE_PAGE_SIZE)

  return `${start}-${end} of ${rows.length}`
}

function TablePagination({ rows = [], page = 1, onPageChange }) {
  const pageCount = getPageCount(rows)

  if (!Array.isArray(rows) || rows.length <= TABLE_PAGE_SIZE) return null

  const safePage = Math.min(Math.max(1, Number(page || 1)), pageCount)

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/80 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs font-bold text-brand-muted dark:text-slate-400">
        Showing {getPageRangeLabel(rows, safePage)} rows
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange?.(1)}
          disabled={safePage <= 1}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-brand-muted transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          First
        </button>

        <button
          type="button"
          onClick={() => onPageChange?.(safePage - 1)}
          disabled={safePage <= 1}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-brand-muted transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Previous
        </button>

        <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-black text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
          Page {safePage} of {pageCount}
        </span>

        <button
          type="button"
          onClick={() => onPageChange?.(safePage + 1)}
          disabled={safePage >= pageCount}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-brand-muted transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Next
        </button>

        <button
          type="button"
          onClick={() => onPageChange?.(pageCount)}
          disabled={safePage >= pageCount}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-brand-muted transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Last
        </button>
      </div>
    </div>
  )
}

function getMergedDatasetHeaders(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [
      'barangay',
      'period',
      'cases',
      'rainfall',
      'temperature',
      'humidity',
      'population',
      'density',
      'boundary_match_status',
      'population_match_status',
      'weather_match_status',
    ]
  }

  const priorityHeaders = [
    'barangay',
    'period',
    'date',
    'year',
    'month',
    'week',
    'cases',
    'deaths',
    'rainfall',
    'temperature',
    'humidity',
    'population',
    'population_year',
    'density',
    'boundary_area_sqkm',
    'geometry_id',
    'boundary_match_status',
    'population_match_status',
    'weather_match_status',
  ]

  const rowKeys = new Set()

  rows.slice(0, 25).forEach((row) => {
    Object.keys(row || {}).forEach((key) => rowKeys.add(key))
  })

  return [
    ...priorityHeaders.filter((header) => rowKeys.has(header)),
    ...Array.from(rowKeys).filter((header) => !priorityHeaders.includes(header)),
  ]
}

function getFriendlyMergedHeader(header = '') {
  const labels = {
    barangay: 'Barangay',
    barangay_key: 'System name',
    period: 'Period',
    date: 'Date',
    year: 'Year',
    month: 'Month',
    week: 'Week',
    cases: 'Cases',
    deaths: 'Deaths',
    rainfall: 'Rainfall',
    temperature: 'Temperature',
    humidity: 'Humidity',
    population: 'Population',
    population_year: 'Population year',
    density: 'People per sq. km',
    boundary_area_sqkm: 'Barangay area',
    geometry_id: 'Map area ID',
    boundary_match_status: 'Found on map?',
    population_match_status: 'Found in population file?',
    weather_match_status: 'Weather match',
  }

  return labels[header] || String(header || '').replaceAll('_', ' ')
}

function formatFriendlyStatusValue(value) {
  const text = String(value || '').toLowerCase()

  if (!text || text === 'n/a') return 'N/A'
  if (text === 'matched') return 'Found'
  if (text === 'psgc_matched') return 'Code Matched'
  if (text === 'exact_matched') return 'Name Matched'
  if (text === 'auto_matched') return 'Auto Matched'
  if (text === 'needs_review') return 'Needs Review'
  if (text === 'unmatched') return 'Needs Review'
  if (text === 'exact_date') return 'Same Date'
  if (text === 'weekly_average') return 'Weekly Weather Average'
  if (text === 'monthly_average') return 'Monthly Weather Average'
  if (text === 'calendar_month_average') return 'Calendar Month Weather Average'
  if (text === 'overall_average') return 'Available Weather Average'
  if (text === 'unavailable') return 'Not Available'

  return String(value)
}

function formatMergedCellValue(value) {
  if (value === undefined || value === null || value === '') {
    return 'N/A'
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toLocaleString(undefined, { maximumFractionDigits: 3 })
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

function getFriendlyAlignmentWarning(warning = '') {
  const text = String(warning || '')
  const lower = text.toLowerCase()

  if (lower.includes('could not be matched with population')) {
    return text.replace(
      'dengue barangay name(s) could not be matched with population.',
      'dengue barangay name(s) were not found in the population file.'
    )
  }

  if (lower.includes('could not be matched with boundary')) {
    return text.replace(
      'dengue barangay name(s) could not be matched with boundary.',
      'dengue barangay name(s) were not found in the map boundary file.'
    )
  }

  if (lower.includes('dengue data has no psgc values')) {
    return 'The dengue file has no barangay code, so the system checked using barangay names.'
  }

  if (lower.includes('population data has no psgc values')) {
    return 'The population file has no barangay code, so the system checked using barangay names.'
  }

  if (lower.includes('duplicate')) {
    return text.replaceAll('PSGC', 'barangay code')
  }

  return text.replaceAll('PSGC', 'barangay code')
}

function getAlignmentPairSummary(pairReport = {}) {
  return {
    sourceCount: Number(pairReport.source_count || 0),
    targetCount: Number(pairReport.target_count || 0),
    matchedCount: Number(pairReport.matched_count || 0),
    unmatchedCount: Number(pairReport.unmatched_count || 0),
    matchRate: Number(pairReport.match_rate || 0),
    warning: pairReport.warning || '',
  }
}

function getAlignmentUnmatchedRows(alignmentReport = {}) {
  const pairReports = alignmentReport?.pair_reports || {}
  const rows = []
  const seen = new Set()

  ;[
    ['Population file', pairReports.dengue_to_population],
    ['Map boundary file', pairReports.dengue_to_boundary],
  ].forEach(([targetLabel, report]) => {
    ;(report?.unmatched || []).forEach((row) => {
      const key = `${targetLabel}-${row.source_key || row.source_name}`

      if (seen.has(key)) return
      seen.add(key)

      rows.push({
        ...row,
        targetLabel,
      })
    })
  })

  return rows
}

function formatAlignmentSuggestions(row = {}) {
  const suggestions = Array.isArray(row.suggestions) ? row.suggestions : []

  if (!suggestions.length) {
    return 'No close match suggested'
  }

  return suggestions
    .slice(0, 3)
    .map((suggestion) => {
      const percent = Math.round(Number(suggestion.similarity || 0) * 100)
      return `${suggestion.target_name || suggestion.target_raw_name || 'Unnamed'}${percent ? ` (${percent}% close)` : ''}`
    })
    .join(', ')
}

function getAlignmentDuplicateTotal(alignmentReport = {}) {
  const duplicates = alignmentReport?.duplicates || {}

  return Object.values(duplicates).reduce((total, duplicateReport = {}) => {
    return (
      total +
      Number(duplicateReport.duplicate_name_group_count || 0) +
      Number(duplicateReport.duplicate_psgc_group_count || 0)
    )
  }, 0)
}

async function buildLocalValidationResultForSource(file, sourceId) {
  const fileName = file.name.toLowerCase()
  const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls')
  const isJson = fileName.endsWith('.json') || fileName.endsWith('.geojson')

  if (isExcel) {
    if (sourceId === 'boundary') {
      throw new Error('Excel files cannot be used for barangay map boundaries. Please upload the barangay boundary JSON/GeoJSON file.')
    }

    const arrayBuffer = await readFileAsArrayBuffer(file)
    const excelResult = parseExcelWorkbook(arrayBuffer, ['butuan'])
    let result = null

    if (sourceId === 'historical') result = validateDengueRows(excelResult.rows)
    if (sourceId === 'meteorological') result = validateWeatherRows(excelResult.rows)
    if (sourceId === 'demographic') result = validatePopulationRows(excelResult.rows)

    return result
      ? {
          ...result,
          mappingSummary: `${result.mappingSummary || ''}${result.mappingSummary ? ', ' : ''}Excel sheet → ${excelResult.sheetName}`,
        }
      : null
  }

  const text = await readFileAsText(file)

  if (sourceId === 'boundary') {
    const parsed = parseJson(text)
    return validateBoundaryData(parsed)
  }

  if (isJson) {
    const parsed = parseJson(text)

    if (!Array.isArray(parsed)) {
      throw new Error('JSON file must contain a list of records that the system can read.')
    }

    if (sourceId === 'historical') return validateDengueRows(parsed)
    if (sourceId === 'meteorological') return validateWeatherRows(parsed)
    if (sourceId === 'demographic') return validatePopulationRows(parsed)

    return null
  }

  const parsed = parseCsv(text)

  if (sourceId === 'historical') return validateDengueRows(parsed)
  if (sourceId === 'meteorological') return validateWeatherRows(parsed)
  if (sourceId === 'demographic') return validatePopulationRows(parsed)

  return null
}

function withTimeout(promise, milliseconds, message) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(message || 'The system took too long to respond. Please try again.'))
    }, milliseconds)

    Promise.resolve(promise)
      .then(resolve)
      .catch(reject)
      .finally(() => {
        window.clearTimeout(timer)
      })
  })
}


const AUTO_PREPARATION_STORAGE_KEY = 'dengue-auto-prepared-source-signature'
const LARGE_FILE_LOCAL_PREVIEW_LIMIT_BYTES = 1024 * 1024
const TABLE_PAGE_SIZE = 300

function getStoredAutoPreparationKey() {
  try {
    return window.localStorage.getItem(AUTO_PREPARATION_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

function saveAutoPreparationKey(key = '') {
  if (!key) return

  try {
    window.localStorage.setItem(AUTO_PREPARATION_STORAGE_KEY, key)
  } catch {
    // Ignore storage errors. The in-memory guard will still work for this page visit.
  }
}

function clearAutoPreparationKey() {
  try {
    window.localStorage.removeItem(AUTO_PREPARATION_STORAGE_KEY)
  } catch {
    // Ignore storage errors.
  }
}


function wait(milliseconds = 0) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds)
  })
}

function formatModelName(value = '') {
  if (!value) return 'Not selected yet'

  return String(value)
    .replace(/^auto_selected_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function getForecastModelMeta(forecastResult = null) {
  const forecastRun =
    forecastResult?.forecast_run ||
    forecastResult?.forecastRun ||
    forecastResult?.run ||
    {}

  const rawModelName =
    forecastResult?.model_display_name ||
    forecastResult?.model_name ||
    forecastRun?.model_name ||
    ''

  const modelVersion =
    forecastResult?.model_version ||
    forecastRun?.model_version ||
    'v1'

  const isMachineLearning = Boolean(
    forecastResult?.is_machine_learning ||
      forecastRun?.is_machine_learning ||
      String(rawModelName).toLowerCase().startsWith('auto_selected_')
  )

  return {
    rawModelName,
    displayName: formatModelName(rawModelName),
    modelVersion,
    isMachineLearning,
    hasModel: Boolean(rawModelName),
  }
}


function AutoProcessingModal({ visible, step = 'combine', detail = '' }) {
  if (!visible) return null

  const steps = [
    {
      id: 'combine',
      label: 'Combining files',
      message: 'Creating one clean table from dengue, weather, population, and map files.',
      icon: Database,
    },
    {
      id: 'names',
      label: 'Checking barangay names',
      message: 'Making sure dengue barangays match the population file and map boundary file.',
      icon: ClipboardCheck,
    },
    {
      id: 'model',
      label: 'Choosing the best forecast method',
      message: 'The system is preparing the forecast method and checking if the result is reliable.',
      icon: Bot,
    },
    {
      id: 'forecast',
      label: 'Creating dengue forecast',
      message: 'The system is creating and saving the latest dengue forecast for each barangay.',
      icon: Sparkles,
    },
    {
      id: 'done',
      label: 'Ready',
      message: 'Automatic preparation is complete. You can review the results below.',
      icon: CheckCircle2,
    },
  ]

  const activeIndex = Math.max(
    0,
    steps.findIndex((item) => item.id === step)
  )

  const activeStep = steps[activeIndex] || steps[0]
  const ActiveIcon = activeStep.icon

  const modal = (
    <div className="fixed inset-0 z-[99999] flex min-h-dvh items-center justify-center overflow-hidden bg-slate-950/75 px-4 py-6 backdrop-blur-md">
      <div className="relative w-full max-w-[520px] overflow-hidden rounded-[36px] border border-white/15 bg-slate-950 p-6 text-white shadow-[0_34px_100px_rgba(0,0,0,0.58)] ring-1 ring-white/10">
        <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-6 h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.10)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.10)_1px,transparent_1px)] bg-[size:22px_22px] opacity-25" />
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />

        <div className="relative">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-400/10 shadow-[0_0_38px_rgba(34,211,238,0.30)]">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-[26px] bg-gradient-to-br from-cyan-400 via-blue-500 to-emerald-400 text-white shadow-[0_18px_42px_rgba(14,165,233,0.42)]">
              <span className="absolute inset-0 rounded-[26px] border border-white/30 animate-ping" />
              {step === 'done' ? (
                <ActiveIcon className="relative h-8 w-8" strokeWidth={2.6} />
              ) : (
                <Loader2 className="relative h-8 w-8 animate-spin" strokeWidth={2.6} />
              )}
            </div>
          </div>

          <div className="mt-6 text-center">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-200">
              Automatic data preparation
            </p>

            <h3 className="mt-3 text-2xl font-black tracking-tight">
              {activeStep.label}
            </h3>

            <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-slate-300">
              {detail || activeStep.message}
            </p>
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-4">
            {steps.map((item, index) => {
              const StepIcon = item.icon
              const isDone = index < activeIndex || step === 'done'
              const isActive = index === activeIndex && step !== 'done'

              return (
                <div
                  key={item.id}
                  className={`rounded-[22px] border px-3 py-3 text-center transition ${
                    isDone
                      ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200'
                      : isActive
                        ? 'border-cyan-300/30 bg-cyan-400/10 text-cyan-200 shadow-[0_0_24px_rgba(34,211,238,0.12)]'
                        : 'border-white/10 bg-white/5 text-slate-400'
                  }`}
                >
                  <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-2xl bg-white/10">
                    {isDone ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : isActive ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <StepIcon className="h-4 w-4" />
                    )}
                  </div>

                  <p className="mt-2 text-[10px] font-black uppercase tracking-[0.14em]">
                    {item.label}
                  </p>
                </div>
              )
            })}
          </div>

          <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-blue-400 to-emerald-300 shadow-[0_0_20px_rgba(34,211,238,0.55)] transition-all duration-500"
              style={{ width: `${step === 'done' ? 100 : activeIndex === 0 ? 25 : activeIndex === 1 ? 50 : activeIndex === 2 ? 75 : 90}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}


function getBadgeFromDatabaseUpload(upload = {}) {
  if (!upload) return 'Not loaded'

  const status = String(upload.status || '').toLowerCase()
  const validCount = Number(upload.valid_row_count || 0)

  if (status.includes('validated') && validCount > 0) return 'Saved online'
  if (status.includes('failed')) return 'Needs Review'

  return validCount > 0 ? 'Saved online' : 'Needs Review'
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

function buildSourceStatusFromDatabaseUploads(uploads = {}) {
  return Object.entries(uploads).reduce((acc, [datasetType, upload]) => {
    acc[datasetType] = {
      uploadedName: upload.original_filename || 'Saved online',
      badge: getBadgeFromDatabaseUpload(upload),
      recordCount: Number(upload.original_row_count || 0),
      validCount: Number(upload.valid_row_count || 0),
      missingCount: 0,
      duplicateCount: 0,
      invalidCount: Number(upload.invalid_row_count || 0),
      mappingSummary: 'Loaded from online database',
      backendPowered: true,
      databaseUploadId: upload.upload_id,
      uploadedAt: upload.uploaded_at,
    }

    return acc
  }, {})
}


function getUniqueBarangayRows(rows = []) {
  const map = new Map()

  rows.forEach((row) => {
    const key = String(row?.barangay_key || row?.barangay || '').trim().toLowerCase()

    if (!key || map.has(key)) return

    map.set(key, row)
  })

  return Array.from(map.values())
}

function buildSavedDatasetPairReport(rows = [], statusField = '') {
  const uniqueRows = getUniqueBarangayRows(rows)
  const matchedRows = uniqueRows.filter((row) => String(row?.[statusField] || '').toLowerCase() === 'matched')
  const unmatchedRows = uniqueRows.filter((row) => String(row?.[statusField] || '').toLowerCase() !== 'matched')
  const sourceCount = uniqueRows.length
  const matchedCount = matchedRows.length
  const unmatchedCount = unmatchedRows.length
  const matchRate = sourceCount > 0 ? Math.round((matchedCount / sourceCount) * 100) : 0

  return {
    source_count: sourceCount,
    target_count: sourceCount,
    matched_count: matchedCount,
    unmatched_count: unmatchedCount,
    match_rate: matchRate,
    warning: unmatchedCount > 0 ? `${unmatchedCount} barangay name(s) need review.` : '',
    unmatched: unmatchedRows.map((row) => ({
      source_name: row?.barangay_original || row?.barangay || 'Unnamed',
      source_raw_name: row?.barangay_original || row?.barangay || 'Unnamed',
      source_key: row?.barangay_original_key || row?.barangay_key || '',
      suggestions: [],
    })),
  }
}

function buildSavedDatasetPopulationBoundaryReport(rows = []) {
  const uniqueRows = getUniqueBarangayRows(rows)
  const matchedRows = uniqueRows.filter((row) => {
    return (
      String(row?.population_match_status || '').toLowerCase() === 'matched' &&
      String(row?.boundary_match_status || '').toLowerCase() === 'matched'
    )
  })
  const unmatchedRows = uniqueRows.filter((row) => !matchedRows.includes(row))
  const sourceCount = uniqueRows.length
  const matchedCount = matchedRows.length
  const unmatchedCount = unmatchedRows.length
  const matchRate = sourceCount > 0 ? Math.round((matchedCount / sourceCount) * 100) : 0

  return {
    source_count: sourceCount,
    target_count: sourceCount,
    matched_count: matchedCount,
    unmatched_count: unmatchedCount,
    match_rate: matchRate,
    warning: unmatchedCount > 0 ? `${unmatchedCount} population barangay name(s) need review against the map.` : '',
    unmatched: unmatchedRows.map((row) => ({
      source_name: row?.barangay || 'Unnamed',
      source_raw_name: row?.barangay_original || row?.barangay || 'Unnamed',
      source_key: row?.barangay_key || '',
      suggestions: [],
    })),
  }
}

function buildAlignmentReportFromMergedRows(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return null

  const dengueToPopulation = buildSavedDatasetPairReport(rows, 'population_match_status')
  const dengueToBoundary = buildSavedDatasetPairReport(rows, 'boundary_match_status')
  const populationToBoundary = buildSavedDatasetPopulationBoundaryReport(rows)
  const pairReports = {
    dengue_to_population: dengueToPopulation,
    dengue_to_boundary: dengueToBoundary,
    population_to_boundary: populationToBoundary,
  }

  const matchRates = [
    dengueToPopulation.match_rate,
    dengueToBoundary.match_rate,
    populationToBoundary.match_rate,
  ]
  const alignmentScore = Math.round(
    matchRates.reduce((total, value) => total + Number(value || 0), 0) / matchRates.length
  )
  const warnings = Object.values(pairReports)
    .map((report) => report.warning)
    .filter(Boolean)

  return {
    alignment_score: alignmentScore,
    warnings,
    pair_reports: pairReports,
    duplicates: {},
    source: 'saved_integrated_dataset',
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
    integrationReadiness = null,
    backendIntegrationStatus = null,
    backendIntegrationResult = null,
    backendMergedDataset = [],
    backendForecastResult = null,
    syncBackendIntegrationStatus,
    buildBackendIntegrationWorkspace,
    resetBackendIntegration,
  } = data

  const [selected, setSelected] = useState('historical')
  const [validationResult, setValidationResult] = useState(null)
  const [uploadMessage, setUploadMessage] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [sourceUploadStates, setSourceUploadStates] = useState({})
  const [isBuildingBackendDataset, setIsBuildingBackendDataset] = useState(false)
  const [alignmentReport, setAlignmentReport] = useState(null)
  const [isCheckingAlignment, setIsCheckingAlignment] = useState(false)
  const [databaseUploadStatus, setDatabaseUploadStatus] = useState(null)
  const [previewPage, setPreviewPage] = useState(1)
  const [backendMergedPage, setBackendMergedPage] = useState(1)
  const [autoProcessing, setAutoProcessing] = useState({
    visible: false,
    step: 'combine',
    detail: '',
  })
  const autoPreparationKeyRef = useRef(getStoredAutoPreparationKey())
  const autoPreparationRunningRef = useRef(false)
  const autoPreparationRunIdRef = useRef(0)
  const databaseUploadStatusLoadedRef = useRef(false)

  useEffect(() => {
    function getSourceIdFromDatasetType(datasetType = '') {
      if (datasetType === 'dengue') return 'historical'
      if (datasetType === 'weather') return 'meteorological'
      if (datasetType === 'population') return 'demographic'
      if (datasetType === 'boundary') return 'boundary'
      return selected
    }

    async function handleUploadJobCompleted(event) {
      const job = event.detail || {}
      const sourceId = getSourceIdFromDatasetType(job.dataset_type)

      setSourceUploadStates((current) => ({
        ...current,
        [sourceId]: {
          status: 'success',
          message: 'Background processing completed. Saved online.',
        },
      }))

      setUploadMessage('Background processing completed. The latest saved data is now available.')
      await refreshBackendStatusAfterUpload()
    }

    function handleUploadJobFailed(event) {
      const job = event.detail || {}
      const sourceId = getSourceIdFromDatasetType(job.dataset_type)

      setSourceUploadStates((current) => ({
        ...current,
        [sourceId]: {
          status: 'error',
          message: job.error || 'Background processing failed.',
        },
      }))
    }

    window.addEventListener('dengue-upload-job-completed', handleUploadJobCompleted)
    window.addEventListener('dengue-upload-job-failed', handleUploadJobFailed)

    return () => {
      window.removeEventListener('dengue-upload-job-completed', handleUploadJobCompleted)
      window.removeEventListener('dengue-upload-job-failed', handleUploadJobFailed)
    }
  }, [selected])

  useEffect(() => {
    if (databaseUploadStatusLoadedRef.current) return undefined

    databaseUploadStatusLoadedRef.current = true
    let cancelled = false

    async function loadDatabaseUploadStatus() {
      try {
        const status = await withTimeout(
          getUploadDatabaseStatus(),
          15000,
          'Checking online uploaded files is taking too long.'
        )

        if (cancelled || !status) return

        setDatabaseUploadStatus(status)

        const databaseSourceStatus = buildSourceStatusFromDatabaseUploads(status.uploads || {})
        let preview = null

        try {
          preview = await withTimeout(
            getUploadDatabasePreview(100),
            45000,
            'Loading saved preview rows is taking too long.'
          )
        } catch {
          preview = null
        }

        const previewRows = preview?.previews || {}

        updateWorkspace((current) => ({
          ...current,
          dengueRecords:
            previewRows.dengue?.length > 0
              ? mapSavedDenguePreviewRows(previewRows.dengue)
              : current.dengueRecords || [],
          weatherRecords:
            previewRows.weather?.length > 0
              ? mapSavedWeatherPreviewRows(previewRows.weather)
              : current.weatherRecords || [],
          populationRecords:
            previewRows.population?.length > 0
              ? mapSavedPopulationPreviewRows(previewRows.population)
              : current.populationRecords || [],
          sourceStatus: {
            ...(current.sourceStatus || {}),
            ...databaseSourceStatus,
          },
        }))
      } catch {
        // Do not block the Upload page if the online database status cannot be loaded.
      }
    }

    loadDatabaseUploadStatus()

    return () => {
      cancelled = true
    }
  }, [updateWorkspace])

  const selectedSource = sources.find((item) => item.id === selected) || sources[0]
  const selectedStatus = sourceStatus?.[selectedSource.contextKey] || {}

  const storedRecords = useMemo(() => {
    return getSourceRecords(selected, data)
  }, [selected, data])

  const previewRows = useMemo(() => {
    if (validationResult?.sourceId === selected) {
      return validationResult.previewRows || []
    }

    if (selected === 'boundary') {
      return getBoundaryPreviewRows(storedRecords)
    }

    return storedRecords
  }, [validationResult, selected, storedRecords])

  const visiblePreviewRows = useMemo(() => getVisibleTableRows(previewRows, previewPage), [previewRows, previewPage])
  const previewHeaders = getPreviewHeaders(selected)

  useEffect(() => {
    setPreviewPage(1)
  }, [selected, previewRows.length])

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
  const databaseUploads = databaseUploadStatus?.uploads || {}
  const loadedSourceCount = sources.filter((source) => {
    return (
      Number(sourceStatus?.[source.contextKey]?.validCount || 0) > 0 ||
      Number(databaseUploads?.[source.contextKey]?.valid_row_count || 0) > 0
    )
  }).length
  const selectedFileName = selectedStatus.uploadedName || 'No file uploaded yet'
  const integrationStatus = integrationReadiness?.status || 'Pending'
  const integrationChecks = integrationReadiness?.checks || []
  const integrationSummary = integrationReadiness?.summary || {}
  const integrationScore = Number(integrationReadiness?.score || 0)

  const backendStatus = backendIntegrationStatus || {}
  const backendSources = backendStatus.sources || {}

  const sourceStatusLoadedSourceCount = sources.filter((source) => {
    return Number(sourceStatus?.[source.contextKey]?.validCount || 0) > 0
  }).length

  const databaseLoadedSourceCount = sources.filter((source) => {
    return Number(databaseUploads?.[source.contextKey]?.valid_row_count || 0) > 0
  }).length

  const backendLoadedSourceCount = Math.max(
    Number(backendStatus.loaded_source_count || 0),
    databaseLoadedSourceCount,
    sourceStatusLoadedSourceCount
  )

  const backendRequiredSourceCount = Number(backendStatus.required_source_count || sources.length)

  const backendStatusLabel =
    backendLoadedSourceCount >= backendRequiredSourceCount
      ? 'ready'
      : backendStatus.status || 'empty'

  const backendCanBuildDataset = Boolean(
    backendStatus.can_build_dataset ||
      Number(databaseUploads?.dengue?.valid_row_count || 0) > 0 ||
      Number(sourceStatus?.dengue?.validCount || 0) > 0
  )

  const backendComplete = Boolean(
    backendStatus.complete ||
      backendLoadedSourceCount >= backendRequiredSourceCount
  )
  const backendMergedRows = Array.isArray(backendMergedDataset) ? backendMergedDataset : []
  const latestForecastResult = backendForecastResult || validationResult?.forecastResult || null
  const forecastModelMeta = getForecastModelMeta(latestForecastResult)

  useEffect(() => {
    setBackendMergedPage(1)
  }, [backendMergedRows.length])

  const visibleBackendMergedRows = useMemo(() => getVisibleTableRows(backendMergedRows, backendMergedPage), [backendMergedRows, backendMergedPage])
  const backendMergedHeaders = useMemo(() => {
    return getMergedDatasetHeaders(backendMergedRows)
  }, [backendMergedRows])
  const backendBuildSummary = backendIntegrationResult?.summary || null
  const savedDatasetAlignmentReport = useMemo(() => {
    return buildAlignmentReportFromMergedRows(backendMergedRows)
  }, [backendMergedRows])
  const activeAlignmentReport = alignmentReport || savedDatasetAlignmentReport || null
  const alignmentPairReports = activeAlignmentReport?.pair_reports || {}
  const denguePopulationAlignment = getAlignmentPairSummary(alignmentPairReports.dengue_to_population)
  const dengueBoundaryAlignment = getAlignmentPairSummary(alignmentPairReports.dengue_to_boundary)
  const populationBoundaryAlignment = getAlignmentPairSummary(alignmentPairReports.population_to_boundary)
  const alignmentWarnings = Array.isArray(activeAlignmentReport?.warnings)
    ? activeAlignmentReport.warnings
    : []
  const alignmentUnmatchedRows = getAlignmentUnmatchedRows(activeAlignmentReport)
  const alignmentDuplicateTotal = getAlignmentDuplicateTotal(activeAlignmentReport)
  const backendSourceSignature = sources
    .map((source) => {
      const backendSource = backendSources[source.contextKey] || {}
      const databaseUpload = databaseUploads[source.contextKey] || {}
      const statusSource = sourceStatus?.[source.contextKey] || {}

      const filename =
        backendSource.filename ||
        databaseUpload.original_filename ||
        statusSource.uploadedName ||
        ''

      const validCount = Number(
        backendSource.valid_count ??
          databaseUpload.valid_row_count ??
          statusSource.validCount ??
          0
      )

      const recordCount = Number(
        backendSource.record_count ??
          databaseUpload.original_row_count ??
          statusSource.recordCount ??
          0
      )

      const loaded = Boolean(backendSource.loaded || validCount > 0)

      return [
        source.contextKey,
        filename,
        validCount,
        recordCount,
        loaded ? 'loaded' : 'pending',
      ].join(':')
    })
    .join('|')
  const allRequiredFilesReady = Boolean(
    backendCanBuildDataset &&
      backendRequiredSourceCount >= sources.length &&
      backendLoadedSourceCount >= backendRequiredSourceCount
  )
  const hasCombinedBackendData = Boolean(
    backendMergedRows.length > 0 ||
      Number(backendBuildSummary?.row_count || 0) > 0 ||
      Number(backendIntegrationResult?.row_count || 0) > 0
  )


  async function handleResetWorkspace() {
    if (isProcessing) return

    clearAutoPreparationKey()
    autoPreparationKeyRef.current = ''
    autoPreparationRunIdRef.current += 1
    autoPreparationRunningRef.current = false
    setAutoProcessing({
      visible: false,
      step: 'combine',
      detail: '',
    })

    setIsProcessing(true)

    try {
      await resetBackendIntegration?.()
    } catch {
      // Continue clearing the frontend workspace even if the backend is offline.
    }

    updateWorkspace((current) => ({
      ...current,
      dengueRecords: [],
      weatherRecords: [],
      populationRecords: [],
      boundaryRecords: [],
      riskRows: [],
      backendDengueSummary: null,
      backendForecastResult: null,
      backendIntegrationStatus: null,
      backendIntegrationResult: null,
      backendMergedDataset: [],
      sourceStatus: {
        dengue: {},
        weather: {},
        population: {},
        boundary: {},
      },
    }))

    setAlignmentReport(null)
    setSelected('historical')
    setValidationResult(null)
    setSourceUploadStates({})
    setUploadError('')
    setUploadMessage('Workspace reset. Uploaded files, checking results, forecast results, and combined data were cleared.')

    addActivityLog(
      'Workspace reset',
      'Uploaded files, checking results, forecast results, and combined data were cleared.'
    )

    setIsProcessing(false)
  }

  async function handleSyncBackendStatus() {
    setUploadMessage('')
    setUploadError('')
    setIsBuildingBackendDataset(true)

    try {
      const status = await withTimeout(
        syncBackendIntegrationStatus?.({ silent: false }),
        15000,
        'Refreshing file status is taking too long. Make sure the system server is running.'
      )

      if (!status) {
        throw new Error('Unable to check file status. Make sure the system server is running.')
      }

      setUploadMessage(
        `File status refreshed. ${Number(status.loaded_source_count || 0)} of ${Number(status.required_source_count || sources.length)} required files are ready.`
      )
    } catch (error) {
      setUploadError(error?.message || 'Unable to refresh file status.')
    } finally {
      setIsBuildingBackendDataset(false)
    }
  }

  async function handleBuildBackendDataset() {
    setUploadMessage('')
    setUploadError('')
    setIsBuildingBackendDataset(true)

    try {
      const result = await withTimeout(
        buildBackendIntegrationWorkspace?.(),
        180000,
        'Combining the uploaded files is taking too long. Make sure the system server is running.'
      )

      if (!result) {
        throw new Error('The system did not return combined data. Please try again.')
      }

      let alignmentMessage = ''

      try {
        const alignmentResult = await withTimeout(
          getBackendAlignmentReport(),
          90000,
          'Barangay name checking is taking too long. Please try again.'
        )
        setAlignmentReport(alignmentResult)

        const score = Number(alignmentResult?.alignment_score || 0)
        const warnings = Array.isArray(alignmentResult?.warnings) ? alignmentResult.warnings.length : 0
        alignmentMessage = ` Barangay name check also completed with ${score}% matched and ${warnings} item${warnings === 1 ? '' : 's'} to review.`
      } catch {
        alignmentMessage = ' Barangay name check can be run again if needed.'
      }

      if (backendSourceSignature) {
        autoPreparationKeyRef.current = backendSourceSignature
        saveAutoPreparationKey(backendSourceSignature)
      }

      setUploadMessage(
        `Uploaded files were combined successfully. ${Number(result.row_count || 0)} dengue row${Number(result.row_count || 0) === 1 ? '' : 's'} now include matching weather, population, and map information when available.${alignmentMessage}`
      )
    } catch (error) {
      setUploadError(
        error?.message ||
          'Unable to combine the uploaded files. Upload dengue, weather, population, and map files first.'
      )

      addActivityLog(
        'Combine uploaded data failed',
        error?.message || 'Unable to combine the uploaded files.'
      )
    } finally {
      setIsBuildingBackendDataset(false)
    }
  }

  async function handleResetBackendIntegration() {
    autoPreparationRunIdRef.current += 1
    autoPreparationRunningRef.current = false
    setAutoProcessing({
      visible: false,
      step: 'combine',
      detail: '',
    })

    setUploadMessage('')
    setUploadError('')
    setIsBuildingBackendDataset(true)

    try {
      const result = await withTimeout(
        resetBackendIntegration?.(),
        15000,
        'Clearing combined data is taking too long. Make sure the system server is running.'
      )

      if (backendSourceSignature) {
        autoPreparationKeyRef.current = backendSourceSignature
        saveAutoPreparationKey(backendSourceSignature)
      }

      setValidationResult(null)
      setAlignmentReport(null)
      setUploadMessage(result?.message || 'Combined data was cleared.')
    } catch (error) {
      setUploadError(error?.message || 'Unable to clear combined data.')
    } finally {
      setIsBuildingBackendDataset(false)
    }
  }

  async function handleCheckAlignmentReport() {
    setUploadMessage('')
    setUploadError('')
    setIsCheckingAlignment(true)

    try {
      const result = await withTimeout(
        getBackendAlignmentReport(),
        90000,
        'Barangay name checking is taking too long. Please try again.'
      )

      setAlignmentReport(result)
      await withTimeout(
        syncBackendIntegrationStatus?.({ silent: true }),
        15000,
        'The file was uploaded, but refreshing the file status took too long.'
      )

      const score = Number(result?.alignment_score || 0)
      const warnings = Array.isArray(result?.warnings) ? result.warnings.length : 0

      if (backendSourceSignature) {
        autoPreparationKeyRef.current = backendSourceSignature
        saveAutoPreparationKey(backendSourceSignature)
      }

      setUploadMessage(
        `Barangay name check completed. ${score}% of names matched, with ${warnings} item${warnings === 1 ? '' : 's'} to review.`
      )

      addActivityLog(
        'Barangay name check completed',
        `Barangay name match: ${score}%. Items to review: ${warnings}.`
      )
    } catch (error) {
      setUploadError(
        error?.message ||
          'Unable to check barangay names. Upload the needed files first and make sure the system server is running.'
      )

      addActivityLog(
        'Barangay name check failed',
        error?.message || 'Unable to check barangay names.'
      )
    } finally {
      setIsCheckingAlignment(false)
    }
  }


  useEffect(() => {
    if (!allRequiredFilesReady) return
    if (!hasCombinedBackendData) return
    if (alignmentReport) return
    if (isProcessing || isBuildingBackendDataset || isCheckingAlignment) return

    let cancelled = false

    async function runAutomaticBarangayNameCheck() {
      setIsCheckingAlignment(true)

      try {
        const result = await withTimeout(
          getBackendAlignmentReport(),
          90000,
          'Barangay name checking is taking too long. The saved combined data will still be shown.'
        )

        if (cancelled) return

        setAlignmentReport(result)

        const score = Number(result?.alignment_score || 0)
        const warnings = Array.isArray(result?.warnings) ? result.warnings.length : 0

        addActivityLog(
          'Barangay name check completed',
          `Barangay names were checked automatically. Match: ${score}%. Items to review: ${warnings}.`
        )
      } catch {
        if (cancelled || !savedDatasetAlignmentReport) return

        const score = Number(savedDatasetAlignmentReport?.alignment_score || 0)
        const warnings = Array.isArray(savedDatasetAlignmentReport?.warnings)
          ? savedDatasetAlignmentReport.warnings.length
          : 0

        addActivityLog(
          'Barangay name check loaded from saved data',
          `Barangay name check was read from the saved combined dataset. Match: ${score}%. Items to review: ${warnings}.`
        )
      } finally {
        if (!cancelled) {
          setIsCheckingAlignment(false)
        }
      }
    }

    runAutomaticBarangayNameCheck()

    return () => {
      cancelled = true
    }
  }, [
    allRequiredFilesReady,
    hasCombinedBackendData,
    alignmentReport,
    isProcessing,
    isBuildingBackendDataset,
    isCheckingAlignment,
    savedDatasetAlignmentReport,
    addActivityLog,
  ])



  useEffect(() => {
    if (!allRequiredFilesReady) return
    if (hasCombinedBackendData) return
    if (isProcessing || autoPreparationRunningRef.current) return
    if (!backendSourceSignature || backendSourceSignature.includes('pending')) return

    const preparationKey = backendSourceSignature

    if (autoPreparationKeyRef.current === preparationKey) return

    const runId = autoPreparationRunIdRef.current + 1
    autoPreparationRunIdRef.current = runId
    autoPreparationKeyRef.current = preparationKey
    autoPreparationRunningRef.current = true

    let closeTimer = null

    const isCurrentRun = () => autoPreparationRunIdRef.current === runId

    async function runAutomaticPreparation() {
      setUploadMessage('')
      setUploadError('')
      setIsBuildingBackendDataset(true)
      setIsCheckingAlignment(true)
      setAutoProcessing({
        visible: true,
        step: 'combine',
        detail: 'All four files are ready. The system is now combining them automatically, so users do not need to click another button.',
      })

      try {
        const result = await withTimeout(
  buildBackendIntegrationWorkspace?.(),
  180000,
  'Combining the uploaded files is taking too long. Please make sure the system server is running, then click “Run again”.'
)

        if (!result) {
          throw new Error('The system did not return combined data. Please try again.')
        }

        if (!isCurrentRun()) return

        setAutoProcessing({
          visible: true,
          step: 'names',
          detail: 'Combined data is ready. The system is now checking barangay names across the dengue, population, and map files.',
        })

        const alignmentResult = await withTimeout(
          getBackendAlignmentReport(),
          90000,
          'Barangay name checking is taking too long. The combined data was prepared, but the name check did not finish. You can click “Check again” later.'
        )

        if (!isCurrentRun()) return

        setAlignmentReport(alignmentResult)

        await withTimeout(
          syncBackendIntegrationStatus?.({ silent: true }),
          15000,
          'The files were prepared, but refreshing the status took too long.'
        )

        if (!isCurrentRun()) return

        setAutoProcessing({
          visible: true,
          step: 'model',
          detail: 'The system is now training or loading the best machine learning model, evaluating it, and generating the dengue forecast automatically.',
        })

        const autoRunResult = await withTimeout(
          autoRunModel(),
          180000,
          'Automatic model training and forecasting is taking too long. Please make sure the system server is running, then try again.'
        )

        if (!isCurrentRun()) return

        updateWorkspace((current) => ({
          ...current,
          backendForecastResult: autoRunResult,
          riskRows: Array.isArray(autoRunResult?.forecast_results)
            ? autoRunResult.forecast_results
            : current.riskRows || [],
        }))

        setAutoProcessing({
          visible: true,
          step: 'forecast',
          detail: `${autoRunResult?.model_display_name || 'The selected machine learning model'} generated the latest dengue forecast and saved ${Number(autoRunResult?.barangay_count || 0)} barangay result${Number(autoRunResult?.barangay_count || 0) === 1 ? '' : 's'}.`,
        })

        await wait(700)

        if (!isCurrentRun()) return

        if (preparationKey) {
          autoPreparationKeyRef.current = preparationKey
          saveAutoPreparationKey(preparationKey)
        }

        const rowCount = Number(
          result?.row_count ||
            result?.summary?.row_count ||
            backendBuildSummary?.row_count ||
            backendMergedRows.length ||
            0
        )
        const score = Number(alignmentResult?.alignment_score || 0)
        const warnings = Array.isArray(alignmentResult?.warnings)
          ? alignmentResult.warnings.length
          : 0

        setUploadMessage(
          `Automatic preparation completed. ${rowCount} dengue row${rowCount === 1 ? '' : 's'} were combined, barangay names were checked with ${score}% matched and ${warnings} item${warnings === 1 ? '' : 's'} to review, and the machine learning forecast was generated successfully.`
        )

        addActivityLog(
          'Automatic data preparation completed',
          `The system automatically combined uploaded files, checked barangay names, and generated the machine learning forecast. Rows: ${rowCount}. Barangay name match: ${score}%. Items to review: ${warnings}. Forecasted cases: ${Number(autoRunResult?.total_forecast_next_4_periods || 0)}.`
        )

        const finalModelMeta = getForecastModelMeta(autoRunResult)

        setAutoProcessing({
          visible: true,
          step: 'done',
          detail: finalModelMeta.hasModel
            ? `The uploaded files were combined, barangay names were checked, and the latest forecast was generated using ${finalModelMeta.displayName}. You can continue explaining this page before opening the Forecast page.`
            : 'The uploaded files were combined, barangay names were checked, and the latest forecast was generated automatically. You can continue explaining this page before opening the Forecast page.',
        })

        closeTimer = window.setTimeout(() => {
          if (isCurrentRun()) {
            setAutoProcessing((current) => ({
              ...current,
              visible: false,
            }))
          }
        }, 950)
      } catch (error) {
        if (!isCurrentRun()) return

        autoPreparationKeyRef.current = ''
        clearAutoPreparationKey()

        setUploadError(
          error?.message ||
            'Automatic preparation failed. Check that all four files are uploaded and the system server is running.'
        )

        addActivityLog(
          'Automatic data preparation failed',
          error?.message || 'The system could not automatically prepare the uploaded files.'
        )

        setAutoProcessing((current) => ({
          ...current,
          visible: false,
        }))
      } finally {
        if (isCurrentRun()) {
          setIsBuildingBackendDataset(false)
          setIsCheckingAlignment(false)
          autoPreparationRunningRef.current = false
        }
      }
    }

    runAutomaticPreparation()

    return () => {
      if (closeTimer) {
        window.clearTimeout(closeTimer)
      }
    }
  }, [
    allRequiredFilesReady,
    hasCombinedBackendData,
    backendSourceSignature,
    isProcessing,
    updateWorkspace,
    addActivityLog,
  ])


  function getSourceUploadErrorMessage(error, sourceTitle = 'selected file type') {
    const fallbackMessage =
      `This file does not match the selected upload type. Please upload the correct ${sourceTitle.toLowerCase()} file.`

    const rawMessage = String(error?.message || '').trim()

    if (!rawMessage) return fallbackMessage

    const lower = rawMessage.toLowerCase()

    if (
      lower.includes('missing') ||
      lower.includes('required') ||
      lower.includes('not valid') ||
      lower.includes('invalid') ||
      lower.includes('unable to validate') ||
      lower.includes('does not contain') ||
      lower.includes('must contain') ||
      lower.includes('featurecollection') ||
      lower.includes('cannot be used') ||
      lower.includes('expected') ||
      lower.includes('column') ||
      lower.includes('field')
    ) {
      return fallbackMessage
    }

    return rawMessage
  }

  function setSourceUploadProcessing(sourceId, sourceTitle) {
    setSourceUploadStates((current) => ({
      ...current,
      [sourceId]: {
        status: 'processing',
        message: `Processing and checking ${sourceTitle.toLowerCase()}...`,
      },
    }))
  }

  function setSourceUploadSuccess(sourceId) {
    setSourceUploadStates((current) => ({
      ...current,
      [sourceId]: {
        status: 'success',
        message: 'File checked successfully.',
      },
    }))
  }

  function setSourceUploadError(sourceId, sourceTitle, error) {
    setSourceUploadStates((current) => ({
      ...current,
      [sourceId]: {
        status: 'error',
        message: getSourceUploadErrorMessage(error, sourceTitle),
      },
    }))
  }

  function clearStaleCombinedData() {
    setAlignmentReport(null)

    updateWorkspace((current) => ({
      ...current,
      backendIntegrationResult: null,
      backendMergedDataset: [],
    }))
  }

  async function refreshBackendStatusAfterUpload() {
    try {
      await withTimeout(
        syncBackendIntegrationStatus?.({ silent: true }),
        15000,
        'The file was uploaded, but refreshing the file status took too long.'
      )
    } catch {
      // Keep the upload successful even if the status refresh is slow.
    }
  }

  async function handleFileUpload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file || !selectedSource) return

    clearAutoPreparationKey()
    autoPreparationKeyRef.current = ''
    autoPreparationRunIdRef.current += 1
    autoPreparationRunningRef.current = false
    setAutoProcessing({
      visible: false,
      step: 'combine',
      detail: '',
    })

    setIsProcessing(true)
    setSourceUploadProcessing(selected, selectedSource.title)
    setUploadMessage('')
    setUploadError('')

    try {
      const fileName = file.name.toLowerCase()
      const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls')
      const isCsv = fileName.endsWith('.csv')
      const isJson = fileName.endsWith('.json') || fileName.endsWith('.geojson')

      let localValidationResult = null

      if (shouldBuildLocalPreview(file)) {
        try {
          localValidationResult = await buildLocalValidationResultForSource(file, selected)
        } catch {
          localValidationResult = null
        }
      }

      if (selected === 'historical' && (isCsv || isExcel || fileName.endsWith('.json'))) {
        const forecastInitialResult = await forecastDengueFile(file)
        const forecastResult = await waitForUploadJobResult(forecastInitialResult, () => {
          setSourceUploadStates((current) => ({
            ...current,
            [selected]: {
              status: 'processing',
              message: 'File accepted. Saving and generating forecast in the background...',
            },
          }))
        })
        const inspectResult = null
        const cleanResult = forecastResult
        const summaryResult = null

        const rawBackendResult = buildBackendDengueValidationResult({
          fileName: file.name,
          inspectResult,
          cleanResult,
          summaryResult,
          forecastResult,
        })

        const backendResult = {
          ...rawBackendResult,
          previewRows: selectFullPreviewRows(rawBackendResult.previewRows, localValidationResult?.previewRows),
        }

        if (Number(backendResult.validCount || 0) <= 0) {
          throw new Error(
            `This file does not match the selected upload type. Please upload the correct ${selectedSource.title.toLowerCase()} file.`
          )
        }

        updateWorkspace((current) => ({
          ...current,
          [selectedSource.recordKey]: backendResult.validRecords,
          backendDengueSummary: summaryResult,
          backendForecastResult: forecastResult,
          sourceStatus: {
            ...(current.sourceStatus || {}),
            [selectedSource.contextKey]: {
              uploadedName: file.name,
              badge: backendResult.validCount > 0 ? 'Checked' : 'Needs Review',
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

        const highRiskCount = Number(forecastResult?.risk_counts?.High || 0)
        const moderateRiskCount = Number(forecastResult?.risk_counts?.Moderate || 0)
        const lowRiskCount = Number(forecastResult?.risk_counts?.Low || 0)

        const adaptiveMappingNote = backendResult.mappingSummary
          ? ` Detected mapping: ${backendResult.mappingSummary}.`
          : ''

        setUploadMessage(
          `Upload successful. Dengue records are ready for analysis. The system identified ${highRiskCount} high-risk barangay${highRiskCount === 1 ? '' : 's'}, ${moderateRiskCount} moderate-risk barangay${moderateRiskCount === 1 ? '' : 's'}, and ${lowRiskCount} low-risk barangay${lowRiskCount === 1 ? '' : 's'}.${adaptiveMappingNote}`
        )

        addActivityLog(
          'Dengue file uploaded',
          `${selectedSource.title} uploaded from ${file.name}. Valid records: ${backendResult.validCount}/${backendResult.recordCount}.`
        )

        setSourceUploadSuccess(selected)
        await refreshBackendStatusAfterUpload()
        clearStaleCombinedData()

        return
      }

      if (selected === 'demographic' && (isCsv || isExcel || fileName.endsWith('.json'))) {
        const populationInitialResult = await validatePopulationFile(file)
        const validateResult = await waitForUploadJobResult(populationInitialResult, () => {
          setSourceUploadStates((current) => ({
            ...current,
            [selected]: {
              status: 'processing',
              message: 'File accepted. Saving population records in the background...',
            },
          }))
        })

        const rawBackendResult = buildBackendPopulationValidationResult({
          fileName: file.name,
          validateResult,
        })

        const backendResult = {
          ...rawBackendResult,
          previewRows: selectFullPreviewRows(rawBackendResult.previewRows, localValidationResult?.previewRows),
        }

        if (Number(backendResult.validCount || 0) <= 0) {
          throw new Error(
            `This file does not match the selected upload type. Please upload the correct ${selectedSource.title.toLowerCase()} file.`
          )
        }

        updateWorkspace((current) => ({
          ...current,
          [selectedSource.recordKey]: backendResult.validRecords,
          sourceStatus: {
            ...(current.sourceStatus || {}),
            [selectedSource.contextKey]: {
              uploadedName: file.name,
              badge: backendResult.validCount > 0 ? 'Checked' : 'Needs Review',
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

        const populationMappingNote = backendResult.mappingSummary
          ? ` Detected mapping: ${backendResult.mappingSummary}.`
          : ''

        setUploadMessage(
          `Upload successful. Population records were checked and are ready to use. ${backendResult.validCount} of ${backendResult.recordCount} records are valid.${populationMappingNote}`
        )

        addActivityLog(
          'Population file uploaded',
          `${selectedSource.title} uploaded from ${file.name}. Valid records: ${backendResult.validCount}/${backendResult.recordCount}.`
        )

        setSourceUploadSuccess(selected)
        await refreshBackendStatusAfterUpload()
        clearStaleCombinedData()

        return
      }

      if (selected === 'meteorological' && (isCsv || isExcel || fileName.endsWith('.json'))) {
        const weatherInitialResult = await validateWeatherFile(file)
        const validateResult = await waitForUploadJobResult(weatherInitialResult, () => {
          setSourceUploadStates((current) => ({
            ...current,
            [selected]: {
              status: 'processing',
              message: 'File accepted. Saving weather records in the background...',
            },
          }))
        })

        const rawBackendResult = buildBackendWeatherValidationResult({
          fileName: file.name,
          validateResult,
        })

        const backendResult = {
          ...rawBackendResult,
          previewRows: selectFullPreviewRows(rawBackendResult.previewRows, localValidationResult?.previewRows),
        }

        if (Number(backendResult.validCount || 0) <= 0) {
          throw new Error(
            `This file does not match the selected upload type. Please upload the correct ${selectedSource.title.toLowerCase()} file.`
          )
        }

        updateWorkspace((current) => ({
          ...current,
          [selectedSource.recordKey]: backendResult.validRecords,
          sourceStatus: {
            ...(current.sourceStatus || {}),
            [selectedSource.contextKey]: {
              uploadedName: file.name,
              badge: backendResult.validCount > 0 ? 'Checked' : 'Needs Review',
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

        const weatherMappingNote = backendResult.mappingSummary
          ? ` Detected mapping: ${backendResult.mappingSummary}.`
          : ''

        setUploadMessage(
          `Upload successful. Weather records were checked and are ready to use. ${backendResult.validCount} of ${backendResult.recordCount} records are valid.${weatherMappingNote}`
        )

        addActivityLog(
          'Weather file uploaded',
          `${selectedSource.title} uploaded from ${file.name}. Valid records: ${backendResult.validCount}/${backendResult.recordCount}.`
        )

        setSourceUploadSuccess(selected)
        await refreshBackendStatusAfterUpload()
        clearStaleCombinedData()

        return
      }

      if (selected === 'boundary' && isJson) {
        const boundaryInitialResult = await validateBoundaryFile(file)
        const validateResult = await waitForUploadJobResult(boundaryInitialResult, () => {
          setSourceUploadStates((current) => ({
            ...current,
            [selected]: {
              status: 'processing',
              message: 'File accepted. Saving boundary map in the background...',
            },
          }))
        })

        const rawBackendResult = buildBackendBoundaryValidationResult({
          fileName: file.name,
          validateResult,
        })

        const backendResult = {
          ...rawBackendResult,
          previewRows: selectFullPreviewRows(rawBackendResult.previewRows, localValidationResult?.previewRows),
        }

        if (Number(backendResult.validCount || 0) <= 0) {
          throw new Error(
            `This file does not match the selected upload type. Please upload the correct ${selectedSource.title.toLowerCase()} file.`
          )
        }

        updateWorkspace((current) => ({
          ...current,
          [selectedSource.recordKey]: backendResult.validRecords,
          sourceStatus: {
            ...(current.sourceStatus || {}),
            [selectedSource.contextKey]: {
              uploadedName: file.name,
              badge: backendResult.validCount > 0 ? 'Checked' : 'Needs Review',
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

        const boundaryMappingNote = backendResult.mappingSummary
          ? ` Detected mapping: ${backendResult.mappingSummary}.`
          : ''

        setUploadMessage(
          `Upload successful. Map boundary file was checked and is ready to use. ${backendResult.validCount} of ${backendResult.recordCount} map areas are valid.${boundaryMappingNote}`
        )

        addActivityLog(
          'Map boundary file uploaded',
          `${selectedSource.title} uploaded from ${file.name}. Valid map areas: ${backendResult.validCount}/${backendResult.recordCount}.`
        )

        setSourceUploadSuccess(selected)
        await refreshBackendStatusAfterUpload()
        clearStaleCombinedData()

        return
      }

      let parsed
      let result
      let usedSheetName = ''

      if (isExcel) {
        if (selected === 'boundary') {
          throw new Error('Excel files cannot be used for barangay map boundaries. Please upload the barangay boundary JSON/GeoJSON file.')
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
            throw new Error('JSON file must contain a list of records that the system can read.')
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

      if (Number(result.validCount || 0) <= 0) {
        throw new Error(
          `This file does not match the selected upload type. Please upload the correct ${selectedSource.title.toLowerCase()} file.`
        )
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
        ? ` Detected columns: ${finalMappingSummary}.`
        : ''

      setUploadMessage(
        `${file.name} was uploaded, auto-cleaned, and validated. ${result.validCount} of ${result.recordCount} records are valid.${mappingNote}`
      )

      setSourceUploadSuccess(selected)

      addActivityLog(
        'Dataset uploaded',
        `${selectedSource.title} uploaded from ${file.name}. Valid records: ${result.validCount}/${result.recordCount}.`
      )
    } catch (error) {
      const friendlyError = getSourceUploadErrorMessage(error, selectedSource.title)

      setUploadError(friendlyError)
      setSourceUploadError(selected, selectedSource.title, error)

      addActivityLog(
        'Dataset upload failed',
        `${selectedSource.title} upload failed. ${friendlyError}`
      )
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="upload-mobile-compact relative space-y-6 pb-10">
      <AutoProcessingModal
        visible={autoProcessing.visible}
        step={autoProcessing.step}
        detail={autoProcessing.detail}
      />

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
                Upload center
              </div>

              <h1 className="max-w-4xl text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
                Upload and Check Data
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-7 text-white/80 sm:text-base">
                Add the dengue, weather, population, and map files. The system checks the files, fixes common formatting issues, and tells you what still needs review before using the forecast.
              </p>
            </div>

            <div className="mobile-grid-3 mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] border border-white/20 bg-white/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/60">
                  Files uploaded
                </p>
                <p className="mt-3 text-2xl font-black text-white">
                  {loadedSourceCount}/{sources.length}
                </p>
                <p className="mt-1 text-xs leading-5 text-white/70">
                  Files that passed checking
                </p>
              </div>

              <div className="rounded-[22px] border border-white/20 bg-white/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/60">
                  Current file quality
                </p>
                <p className="mt-3 text-2xl font-black text-white">
                  {validPercent}%
                </p>
                <p className="mt-1 text-xs leading-5 text-white/70">
                  Good records in this file
                </p>
              </div>

              <div className="rounded-[22px] border border-white/20 bg-white/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/60">
                  Ready for forecast?
                </p>
                <p className="mt-3 text-2xl font-black text-white">
                  {readyChecklistCount}/{checklist.length}
                </p>
                <p className="mt-1 text-xs leading-5 text-white/70">
                  Checks completed
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
                  Selected file type
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

            <div className="mt-5 rounded-[24px] border border-white/15 bg-black/10 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/60">
                What to do next
              </p>
              <p className="mt-2 text-sm leading-6 text-white/75">
                Choose a file type below, upload the file, then review any warnings before continuing.
              </p>
            </div>
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
                  Files needed
                </div>
                <h3 className="text-xl font-black tracking-tight text-brand-text dark:text-slate-100">
                  Choose the file you want to upload
                </h3>
                <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                  Upload each file one at a time. The system will check if the file can be used for the forecast and map.
                </p>
              </div>

              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {loadedSourceCount} file{loadedSourceCount === 1 ? '' : 's'} ready
              </div>
            </div>

            <div className="mobile-upload-source-grid mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {sources.map((source) => {
                const isActive = selected === source.id
                const status = sourceStatus?.[source.contextKey] || {}
                const badge = status.badge || 'Not loaded'
                const SourceIcon = source.icon
                const validCount = Number(status.validCount || 0)
                const recordCount = Number(status.recordCount || 0)
                const sourcePercent = recordCount > 0 ? Math.round((validCount / recordCount) * 100) : 0
                const uploadState = sourceUploadStates[source.id]
                const isSourceProcessing = uploadState?.status === 'processing'
                const hasSourceError = uploadState?.status === 'error'
                const hasSourceSuccess = uploadState?.status === 'success'

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
                    className={`group relative overflow-hidden rounded-[30px] border p-5 text-left shadow-[0_18px_42px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01] dark:shadow-none ${
                      isSourceProcessing
                        ? 'border-cyan-300 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.28),transparent_38%),linear-gradient(135deg,#ecfeff,#ffffff_54%,#eff6ff)] ring-4 ring-cyan-300/30 shadow-[0_24px_58px_rgba(14,165,233,0.22)] dark:border-cyan-400/60 dark:bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.24),transparent_40%),linear-gradient(135deg,#082f49,#0f172a_58%,#111827)] dark:ring-cyan-400/20'
                        : isActive
                          ? 'border-brand-blue bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_36%),linear-gradient(135deg,#eff6ff,#ffffff_54%,#ecfeff)] ring-2 ring-brand-blue/20 dark:border-blue-500/50 dark:bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.22),transparent_38%),linear-gradient(135deg,#0f172a,#111827_58%,#082f49)] dark:ring-blue-500/20'
                          : hasSourceError
                            ? 'border-rose-300 bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.12),transparent_36%),linear-gradient(135deg,#fff1f2,#ffffff_54%,#fff7ed)] ring-2 ring-rose-200/60 dark:border-rose-500/40 dark:bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.18),transparent_38%),linear-gradient(135deg,#1e1b4b,#111827_58%,#450a0a)] dark:ring-rose-500/20'
                            : 'border-brand-line/70 bg-gradient-to-br from-white via-white to-slate-50 hover:border-brand-blue/40 hover:shadow-[0_24px_54px_rgba(15,23,42,0.12)] dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 dark:hover:border-blue-500/30 dark:hover:shadow-none'
                    }`}
                  >
                    <div className={`pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-gradient-to-br ${source.glow} blur-2xl opacity-70 transition group-hover:opacity-100`} />
                    <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-80 dark:via-white/20" />
                    {isActive && (
                      <div className="pointer-events-none absolute inset-y-5 left-0 w-1 rounded-r-full bg-brand-blue shadow-[0_0_24px_rgba(37,95,143,0.55)]" />
                    )}

                    {isSourceProcessing && (
                      <>
                        <div className="pointer-events-none absolute inset-0 z-10 bg-cyan-400/5" />
                        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1 bg-gradient-to-r from-cyan-300 via-blue-400 to-emerald-300 upload-card-processing-bar" />
                      </>
                    )}

                    <div className="relative z-20 flex items-start justify-between gap-3">
                      <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] border shadow-sm ${source.color}`}>
                        <SourceIcon className="h-6 w-6" strokeWidth={2.3} />
                      </div>

                      <span
                        className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-black ${
                          isSourceProcessing
                            ? 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300'
                            : hasSourceError
                              ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300'
                              : hasSourceSuccess
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                                : getStatusStyle(badge)
                        }`}
                      >
                        {isSourceProcessing ? 'Checking file...' : hasSourceError ? 'Wrong file' : hasSourceSuccess ? 'Checked' : badge}
                      </span>
                    </div>

                    <div className="relative z-20 mt-4">
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

                      {status.uploadedName && (
                        <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-950/60">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-brand-muted dark:text-slate-500">
                            Current file
                          </p>
                          <p className="mt-1 truncate text-xs font-bold text-brand-text dark:text-slate-300">
                            {status.uploadedName}
                          </p>
                        </div>
                      )}

                      {uploadState?.message && (
                        <div
                          className={`mt-3 flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-bold ${
                            isSourceProcessing
                              ? 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300'
                              : hasSourceError
                                ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                          }`}
                        >
                          {isSourceProcessing ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : hasSourceError ? (
                            <AlertTriangle className="h-3.5 w-3.5" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}

                          <span>{uploadState.message}</span>
                        </div>
                      )}

                      {isSourceProcessing && (
                        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-white/55 backdrop-blur-[2px] dark:bg-slate-950/50">
                          <div className="flex items-center gap-2 rounded-full border border-cyan-200 bg-white px-4 py-2 text-xs font-black text-cyan-700 shadow-[0_16px_34px_rgba(14,165,233,0.18)] dark:border-cyan-500/20 dark:bg-slate-950 dark:text-cyan-300">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Processing file
                          </div>
                        </div>
                      )}

                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-brand-blue to-cyan-400 transition-all duration-500"
                          style={{ width: `${sourcePercent}%` }}
                        />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="mt-5 rounded-[30px] border border-brand-blue/20 bg-gradient-to-br from-slate-50 via-white to-blue-50/70 p-4 shadow-[0_16px_38px_rgba(15,23,42,0.07)] dark:border-blue-500/20 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950/30 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${selectedSource.color}`}>
                    <ActiveSourceIcon className="h-5 w-5" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-brand-muted dark:text-slate-500">
                      Selected file type
                    </p>
                    <h4 className="mt-1 text-base font-black text-brand-text dark:text-slate-100">
                      {selectedSource.title}
                    </h4>
                    <p className="mt-1 break-words text-sm leading-6 text-brand-muted dark:text-slate-400">
                      Current file: <span className="font-bold text-brand-text dark:text-slate-200">{selectedFileName}</span>
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[390px]">
                  <label className="group flex min-h-[58px] cursor-pointer items-center justify-center gap-2 rounded-[22px] border border-brand-blue bg-brand-blue px-4 py-3 text-center text-sm font-black leading-5 text-white shadow-[0_14px_30px_rgba(37,95,143,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(37,95,143,0.34)] dark:border-blue-500/30">
                    <UploadCloud className="h-4 w-4 transition group-hover:-translate-y-0.5" />
                    {isProcessing ? 'Processing file...' : `Choose ${selectedSource.title} file`}
                    <input
                      type="file"
                      className="hidden"
                      accept={selectedSource?.accept}
                      onChange={handleFileUpload}
                      disabled={isProcessing}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={handleResetWorkspace}
                    disabled={isProcessing}
                    className="group flex min-h-[58px] items-center justify-center gap-2 rounded-[22px] border border-rose-200 bg-white px-4 py-3 text-center text-sm font-black leading-5 text-rose-600 shadow-[0_14px_30px_rgba(225,29,72,0.08)] transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-50 hover:shadow-[0_18px_38px_rgba(225,29,72,0.14)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/20 dark:bg-slate-950 dark:text-rose-300 dark:hover:bg-rose-500/10"
                  >
                    <RotateCcw className="h-4 w-4 transition group-hover:-rotate-45" />
                    Clear all uploaded files
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[32px] border border-brand-line/70 bg-white/90 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  File check results
                </div>
                <h3 className="text-xl font-black tracking-tight text-brand-text dark:text-slate-100">
                  File checking summary
                </h3>
                <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                  The system checks for missing values, invalid numbers, and duplicate rows before using the file.
                </p>
              </div>

              <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-right dark:border-slate-700 dark:bg-slate-800/70">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400">
                  File quality
                </p>
                <p className="mt-1 text-2xl font-black text-brand-text dark:text-slate-100">
                  {validPercent}%
                </p>
              </div>
            </div>

            <div className="mobile-grid-4 mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Missing values', currentStats.missingCount || 0, AlertTriangle, 'border-rose-100 bg-rose-50 text-brand-red dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300'],
                ['Invalid values', currentStats.invalidCount || 0, AlertTriangle, 'border-orange-100 bg-orange-50 text-brand-orange dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300'],
                ['Duplicate rows', currentStats.duplicateCount || 0, FileCheck2, 'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'],
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
                <span className="font-black">Detected columns:</span>{' '}
                {validationResult.mappingSummary}
              </div>
            )}
          </div>

          <div className="rounded-[32px] border border-brand-line/70 bg-white/90 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-brand-blue dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300">
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  Readiness check
                </div>
                <h3 className="text-xl font-black tracking-tight text-brand-text dark:text-slate-100">
                  Are the uploaded files ready to work together?
                </h3>
                <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                  Checks whether the dengue, weather, population, and map files match well enough to be used together.
                </p>
              </div>

              <div className="flex flex-col items-start gap-2 sm:items-end">
                <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${getStatusStyle(integrationStatus)}`}>
                  {integrationStatus}
                </span>
                <span className="text-xs font-bold text-brand-muted dark:text-slate-400">
                  {integrationScore}% ready
                </span>
              </div>
            </div>

            <div className="mobile-grid-4 mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Barangays connected', integrationSummary.sharedBarangayCount ?? 0, `${integrationSummary.dengueBarangayCount ?? 0} dengue barangays checked`],
                ['Population barangays', integrationSummary.populationBarangayCount ?? 0, 'Barangays in the population file'],
                ['Map barangays', integrationSummary.boundaryBarangayCount ?? 0, 'Barangays found in the map file'],
                ['Forecast areas', integrationSummary.riskRowCount ?? riskRows.length, 'Barangays ready for forecast results'],
              ].map(([label, value, detail]) => (
                <div
                  key={label}
                  className="rounded-[22px] border border-brand-line bg-gradient-to-b from-white to-slate-50 p-4 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-slate-900 dark:shadow-none"
                >
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                    {label}
                  </p>
                  <p className="mt-2 text-2xl font-black text-brand-text dark:text-slate-100">
                    {value}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-brand-muted dark:text-slate-400">
                    {detail}
                  </p>
                </div>
              ))}
            </div>

            <div className="mobile-grid-6 mt-5 grid gap-3">
              {integrationChecks.map((check) => (
                <div
                  key={check.id}
                  className="rounded-[24px] border border-brand-line bg-gradient-to-r from-slate-50 to-white p-4 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-slate-900 dark:shadow-none"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex gap-3">
                      <div
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                          check.ready
                            ? 'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                            : 'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
                        }`}
                      >
                        {check.ready ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <AlertTriangle className="h-4 w-4" />
                        )}
                      </div>

                      <div>
                        <p className="text-sm font-black text-brand-text dark:text-slate-100">
                          {check.label}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                          {check.detail}
                        </p>

                        {Array.isArray(check.missingPreview) && check.missingPreview.length > 0 && (
                          <p className="mt-2 text-xs leading-5 text-brand-orange dark:text-amber-300">
                            Review: {check.missingPreview.join(', ')}{check.missingPreview.length >= 8 ? '...' : ''}
                          </p>
                        )}
                      </div>
                    </div>

                    <span className={`w-fit shrink-0 rounded-full border px-3 py-1 text-[11px] font-black ${getStatusStyle(check.ready ? 'Ready' : 'Needs Review')}`}>
                      {check.value}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-brand-line/70 bg-white/90 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                  <Database className="h-3.5 w-3.5" />
                  Automatic data preparation
                </div>
                <h3 className="text-xl font-black tracking-tight text-brand-text dark:text-slate-100">
                  Automatic combined data for forecast and map
                </h3>
                <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                  Once all four files are uploaded, the system automatically combines them into one table for the forecast, map, and reports. No extra click is needed.
                </p>
              </div>

              <div className="flex flex-col items-start gap-2 sm:items-end">
                <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${getStatusStyle(backendComplete ? 'Ready' : backendStatusLabel)}`}>
                  {backendStatusLabel.toUpperCase()}
                </span>
                <span className="text-xs font-bold text-brand-muted dark:text-slate-400">
                  {backendLoadedSourceCount}/{backendRequiredSourceCount} file{backendRequiredSourceCount === 1 ? '' : 's'} ready
                </span>
              </div>
            </div>

            <div className="mobile-grid-4 mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {sources.map((source) => {
                const backendSource = backendSources[source.contextKey] || {}
                const databaseUpload = databaseUploads[source.contextKey] || {}
                const statusSource = sourceStatus?.[source.contextKey] || {}

                const loaded = Boolean(
                  backendSource.loaded ||
                    Number(databaseUpload.valid_row_count || 0) > 0 ||
                    Number(statusSource.validCount || 0) > 0
                )

                const sourceFilename =
                  backendSource.filename ||
                  databaseUpload.original_filename ||
                  statusSource.uploadedName ||
                  'No file checked yet'

                const sourceValidCount = Number(
                  backendSource.valid_count ??
                    databaseUpload.valid_row_count ??
                    statusSource.validCount ??
                    0
                )

                const sourceRecordCount = Number(
                  backendSource.record_count ??
                    databaseUpload.original_row_count ??
                    statusSource.recordCount ??
                    0
                )

                const SourceIcon = source.icon

                return (
                  <div
                    key={`backend-${source.id}`}
                    className="rounded-[24px] border border-brand-line bg-gradient-to-b from-white to-slate-50 p-4 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-slate-900 dark:shadow-none"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${source.color}`}>
                        <SourceIcon className="h-4 w-4" />
                      </div>

                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${getStatusStyle(loaded ? 'Ready' : 'Pending')}`}>
                        {loaded ? 'Loaded' : 'Pending'}
                      </span>
                    </div>

                    <p className="mt-3 text-sm font-black text-brand-text dark:text-slate-100">
                      {source.title}
                    </p>

                    <p className="mt-1 truncate text-xs leading-5 text-brand-muted dark:text-slate-400">
                      {sourceFilename}
                    </p>

                    <p className="mt-2 text-xs font-bold text-brand-muted dark:text-slate-500">
                      {sourceValidCount}/{sourceRecordCount} valid
                    </p>
                  </div>
                )
              })}
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              <button
                type="button"
                onClick={handleSyncBackendStatus}
                disabled={isProcessing || isBuildingBackendDataset}
                className="group flex min-h-[54px] items-center justify-center gap-2 rounded-[22px] border border-blue-200 bg-white px-4 py-3 text-center text-sm font-black text-brand-blue shadow-[0_14px_30px_rgba(37,95,143,0.08)] transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-500/20 dark:bg-slate-950 dark:text-blue-300 dark:hover:bg-blue-500/10"
              >
                <ShieldCheck className="h-4 w-4" />
                Refresh status
              </button>

              <button
                type="button"
                onClick={handleBuildBackendDataset}
                disabled={isProcessing || isBuildingBackendDataset || !backendCanBuildDataset}
                className="group flex min-h-[54px] items-center justify-center gap-2 rounded-[22px] bg-gradient-to-r from-brand-blue to-cyan-500 px-4 py-3 text-center text-sm font-black text-white shadow-[0_14px_30px_rgba(37,95,143,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(37,95,143,0.32)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Database className="h-4 w-4" />
                {isBuildingBackendDataset ? 'Preparing automatically...' : hasCombinedBackendData ? 'Run again' : 'Waiting for 4 files'}
              </button>

              <button
                type="button"
                onClick={handleResetBackendIntegration}
                disabled={isProcessing || isBuildingBackendDataset}
                className="group flex min-h-[54px] items-center justify-center gap-2 rounded-[22px] border border-rose-200 bg-white px-4 py-3 text-center text-sm font-black text-rose-600 shadow-[0_14px_30px_rgba(225,29,72,0.08)] transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/20 dark:bg-slate-950 dark:text-rose-300 dark:hover:bg-rose-500/10"
              >
                <RotateCcw className="h-4 w-4" />
                Clear combined data
              </button>
            </div>

            {backendBuildSummary && (
              <>
                <div className="mobile-grid-4 mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Combined dengue rows', backendBuildSummary.row_count ?? backendMergedRows.length],
                  ['Rows with weather', `${backendBuildSummary.weather_matched_rows ?? 0} (${backendBuildSummary.match_percentages?.weather ?? 0}%)`],
                  ['Rows with population', `${backendBuildSummary.population_matched_rows ?? 0} (${backendBuildSummary.match_percentages?.population ?? 0}%)`],
                  ['Rows found on map', `${backendBuildSummary.boundary_matched_rows ?? 0} (${backendBuildSummary.match_percentages?.boundary ?? 0}%)`],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-[22px] border border-brand-line bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
                  >
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                      {label}
                    </p>
                    <p className="mt-2 text-2xl font-black text-brand-text dark:text-slate-100">
                      {value}
                    </p>
                  </div>
                ))}
                </div>

                {(backendBuildSummary.integration_quality_label || backendBuildSummary.integration_quality_score !== undefined) && (
                <div className="mt-3 rounded-[22px] border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm leading-6 text-brand-blue shadow-sm dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                  <span className="font-black">Adaptive combination:</span>{' '}
                  {backendBuildSummary.integration_quality_label || 'Integration review ready'}
                  {backendBuildSummary.integration_quality_score !== undefined
                    ? ` • ${backendBuildSummary.integration_quality_score}% quality score`
                    : ''}
                  {backendBuildSummary.barangay_needs_review_rows
                    ? ` • ${backendBuildSummary.barangay_needs_review_rows} barangay row${backendBuildSummary.barangay_needs_review_rows === 1 ? '' : 's'} need name review`
                    : ''}
                </div>
                )}
              </>
            )}

            <div className="mt-5 overflow-hidden rounded-[28px] border border-brand-line/80 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_18px_44px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950 dark:shadow-none">
              <div className="records-preview-scroll max-h-[460px] max-w-full overflow-auto overscroll-contain">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="sticky top-0 z-20 bg-slate-50/95 text-[11px] uppercase tracking-[0.12em] text-brand-muted shadow-[0_1px_0_rgba(15,23,42,0.08)] backdrop-blur-xl dark:bg-slate-950/95 dark:text-slate-400 dark:shadow-[0_1px_0_rgba(148,163,184,0.12)]">
                    <tr>
                      {backendMergedHeaders.map((header) => (
                        <th key={header} className="whitespace-nowrap px-4 py-4 font-black">
                          {getFriendlyMergedHeader(header)}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                    {visibleBackendMergedRows.length > 0 ? (
                      visibleBackendMergedRows.map((row, index) => (
                        <tr key={`backend-merged-${index}`} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/60">
                          {backendMergedHeaders.map((header) => {
                            const cell = row?.[header]
                            const isStatusCell = header.includes('status')

                            return (
                              <td
                                key={`backend-merged-${index}-${header}`}
                                className="whitespace-nowrap px-4 py-4 text-sm text-brand-text dark:text-slate-300"
                              >
                                {isStatusCell ? (
                                  <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black ${getStatusStyle(String(cell || ''))}`}>
                                    {formatFriendlyStatusValue(cell)}
                                  </span>
                                ) : (
                                  formatMergedCellValue(cell)
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={backendMergedHeaders.length}
                          className="px-4 py-10 text-center text-sm text-brand-muted dark:text-slate-400"
                        >
                          No combined data yet. Upload all four files and the system will combine them automatically.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <TablePagination
                rows={backendMergedRows}
                page={backendMergedPage}
                onPageChange={setBackendMergedPage}
              />
            </div>

            <p className="mt-3 text-xs leading-5 text-brand-muted dark:text-slate-500">
              This table shows what the system created after combining the uploaded files. Rows are shown by page to keep the Upload page smooth. Review rows marked “Needs Review” before using the forecast or map.
            </p>
          </div>

          <div className="rounded-[32px] border border-brand-line/70 bg-white/90 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  Automatic barangay name check
                </div>
                <h3 className="text-xl font-black tracking-tight text-brand-text dark:text-slate-100">
                  Barangay names are checked automatically
                </h3>
                <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                  After the four files are ready, the system automatically checks whether barangay names in the dengue file match the population file and map file. This prevents missing population counts or missing map areas.
                </p>
              </div>

              <div className="flex flex-col items-start gap-2 sm:items-end">
                <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${getStatusStyle(activeAlignmentReport ? 'Ready' : 'Pending')}`}>
                  {activeAlignmentReport ? `${Number(activeAlignmentReport.alignment_score || 0)}% matched` : 'Not checked'}
                </span>
                <button
                  type="button"
                  onClick={handleCheckAlignmentReport}
                  disabled={isProcessing || isBuildingBackendDataset || isCheckingAlignment}
                  className="group flex min-h-[42px] items-center justify-center gap-2 rounded-[18px] border border-violet-200 bg-white px-4 py-2 text-center text-xs font-black text-violet-700 shadow-[0_12px_24px_rgba(109,40,217,0.08)] transition hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-500/20 dark:bg-slate-950 dark:text-violet-300 dark:hover:bg-violet-500/10"
                >
                  <ClipboardCheck className="h-4 w-4" />
                  {isCheckingAlignment ? 'Checking names...' : activeAlignmentReport ? 'Check again' : 'Runs automatically'}
                </button>
              </div>
            </div>

            <div className="mobile-grid-4 mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Overall name match', activeAlignmentReport ? `${Number(activeAlignmentReport.alignment_score || 0)}%` : 'N/A', 'How well the barangay names match across files'],
                ['Dengue names in population file', activeAlignmentReport ? `${denguePopulationAlignment.matchedCount}/${denguePopulationAlignment.sourceCount}` : 'N/A', `${denguePopulationAlignment.matchRate || 0}% found`],
                ['Dengue names on the map', activeAlignmentReport ? `${dengueBoundaryAlignment.matchedCount}/${dengueBoundaryAlignment.sourceCount}` : 'N/A', `${dengueBoundaryAlignment.matchRate || 0}% found`],
                ['Population names on the map', activeAlignmentReport ? `${populationBoundaryAlignment.matchedCount}/${populationBoundaryAlignment.sourceCount}` : 'N/A', `${populationBoundaryAlignment.matchRate || 0}% found`],
              ].map(([label, value, detail]) => (
                <div
                  key={label}
                  className="rounded-[22px] border border-brand-line bg-gradient-to-b from-white to-slate-50 p-4 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-slate-900 dark:shadow-none"
                >
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                    {label}
                  </p>
                  <p className="mt-2 text-2xl font-black text-brand-text dark:text-slate-100">
                    {value}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-brand-muted dark:text-slate-400">
                    {detail}
                  </p>
                </div>
              ))}
            </div>

            {activeAlignmentReport && (
              <div className="mobile-grid-3 mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-[22px] border border-brand-line bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                    Names needing review
                  </p>
                  <p className="mt-2 text-2xl font-black text-brand-text dark:text-slate-100">
                    {alignmentUnmatchedRows.length}
                  </p>
                </div>

                <div className="rounded-[22px] border border-brand-line bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                    Possible duplicate names
                  </p>
                  <p className="mt-2 text-2xl font-black text-brand-text dark:text-slate-100">
                    {alignmentDuplicateTotal}
                  </p>
                </div>

                <div className="rounded-[22px] border border-brand-line bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                    Items to review
                  </p>
                  <p className="mt-2 text-2xl font-black text-brand-text dark:text-slate-100">
                    {alignmentWarnings.length}
                  </p>
                </div>
              </div>
            )}

            {alignmentWarnings.length > 0 && (
              <div className="mt-5 rounded-[24px] border border-amber-100 bg-amber-50/75 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-100 bg-white text-brand-orange dark:border-amber-500/20 dark:bg-white/10 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-brand-orange dark:text-amber-300">
                      Please review these items
                    </p>
                    <div className="mt-2 space-y-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                      {alignmentWarnings.map((warning, index) => (
                        <p key={`alignment-warning-${index}`}>• {getFriendlyAlignmentWarning(warning)}</p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeAlignmentReport && (
              <div className="mt-5 overflow-hidden rounded-[28px] border border-brand-line/80 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_18px_44px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950 dark:shadow-none">
                <div className="records-preview-scroll max-h-[360px] max-w-full overflow-auto overscroll-contain">
                  <table className="w-full min-w-[920px] text-left text-sm">
                    <thead className="sticky top-0 z-20 bg-slate-50/95 text-[11px] uppercase tracking-[0.12em] text-brand-muted shadow-[0_1px_0_rgba(15,23,42,0.08)] backdrop-blur-xl dark:bg-slate-950/95 dark:text-slate-400 dark:shadow-[0_1px_0_rgba(148,163,184,0.12)]">
                      <tr>
                        <th className="px-4 py-4 font-black">Barangay name in dengue file</th>
                        <th className="px-4 py-4 font-black">Not found in</th>
                        <th className="px-4 py-4 font-black">System-read name</th>
                        <th className="px-4 py-4 font-black">Possible correct name</th>
                        <th className="px-4 py-4 font-black">Status</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                      {alignmentUnmatchedRows.length > 0 ? (
                        alignmentUnmatchedRows.map((row, index) => (
                          <tr key={`alignment-unmatched-${index}`} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/60">
                            <td className="whitespace-nowrap px-4 py-4 font-bold text-brand-text dark:text-slate-200">
                              {row.source_name || row.source_raw_name || 'Unnamed'}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 text-brand-text dark:text-slate-300">
                              {row.targetLabel}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 text-brand-muted dark:text-slate-400">
                              {row.source_key || 'N/A'}
                            </td>
                            <td className="min-w-[280px] px-4 py-4 text-brand-text dark:text-slate-300">
                              {formatAlignmentSuggestions(row)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black ${getStatusStyle('Needs Review')}`}>
                                Review Name
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-10 text-center text-sm text-brand-muted dark:text-slate-400"
                          >
                            All dengue barangay names were found in the population file and map file.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <p className="mt-3 text-xs leading-5 text-brand-muted dark:text-slate-500">
              Use this section to fix barangay names before relying on forecast results, map colors, population counts, and recommended actions.
            </p>
          </div>

          <div className="rounded-[32px] border border-brand-line/70 bg-white/90 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                  <Table2 className="h-3.5 w-3.5" />
                  Records preview
                </div>
                <h3 className="text-xl font-black tracking-tight text-brand-text dark:text-slate-100">
                  Checked records preview
                </h3>
                <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                 Review the rows after the system checks and organizes the file. The table shows all available rows. Scroll inside the table to review more records.
                </p>
              </div>

              <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Showing {getPageRangeLabel(previewRows, previewPage)} row{previewRows.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="mt-5 overflow-hidden rounded-[28px] border border-brand-line/80 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_18px_44px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950 dark:shadow-none">
              <div className="records-preview-scroll max-h-[560px] max-w-full overflow-auto overscroll-contain">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="sticky top-0 z-20 bg-slate-50/95 text-[11px] uppercase tracking-[0.12em] text-brand-muted shadow-[0_1px_0_rgba(15,23,42,0.08)] backdrop-blur-xl dark:bg-slate-950/95 dark:text-slate-400 dark:shadow-[0_1px_0_rgba(148,163,184,0.12)]">
                    <tr>
                      {previewHeaders.map((header) => (
                        <th key={header} className="px-4 py-4 font-black">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                    {visiblePreviewRows.length > 0 ? (
                      visiblePreviewRows.map((row, index) => {
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

              <TablePagination
                rows={previewRows}
                page={previewPage}
                onPageChange={setPreviewPage}
              />
            </div>

            <p className="mt-3 text-xs leading-5 text-brand-muted dark:text-slate-500">
              Records are shown by page to avoid lag. Use Previous and Next to review more rows, and swipe sideways on smaller screens to view all columns.
            </p>
          </div>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-[32px] border border-brand-line/70 bg-white/90 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Checklist
            </div>

            <h3 className="text-xl font-black tracking-tight text-brand-text dark:text-slate-100">
              Before using the forecast
            </h3>

            <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
              Complete these items before using the forecast, map, and recommendations.
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
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
              <Bot className="h-3.5 w-3.5" />
              AI forecast model
            </div>

            <h3 className="text-xl font-black tracking-tight text-brand-text dark:text-slate-100">
              Model selected by the system
            </h3>

            <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
              After the dengue file is checked, the system compares available forecasting models and keeps the best-performing one for the latest forecast.
            </p>

            <div className="mt-4 overflow-hidden rounded-[28px] border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-blue-50 p-4 shadow-sm dark:border-violet-500/20 dark:from-violet-500/10 dark:via-slate-950 dark:to-blue-950/20">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] border border-violet-200 bg-white text-violet-700 shadow-sm dark:border-violet-500/20 dark:bg-white/10 dark:text-violet-300">
                  <Bot className="h-6 w-6" strokeWidth={2.3} />
                </div>

                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300">
                    Model used
                  </p>

                  <p className="mt-1 break-words text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
                    {forecastModelMeta.displayName}
                  </p>

                  <p className="mt-1 text-xs font-bold leading-5 text-brand-muted dark:text-slate-400">
                    {forecastModelMeta.hasModel
                      ? forecastModelMeta.isMachineLearning
                        ? `Machine learning • ${forecastModelMeta.modelVersion}`
                        : `Baseline forecast • ${forecastModelMeta.modelVersion}`
                      : 'Upload a dengue case file to generate a model selection.'}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-[22px] border border-white/80 bg-white/75 px-4 py-3 text-sm leading-6 text-brand-muted shadow-sm dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-400">
                {forecastModelMeta.hasModel
                  ? `The selected model will also appear on the Forecast page. The user does not need to choose an algorithm manually.`
                  : 'The selected model will appear here after the first valid dengue forecast is generated.'}
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                Current source file
              </p>
              <p className="mt-2 break-words text-sm font-bold leading-6 text-brand-text dark:text-slate-200">
                {selectedFileName}
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

      <style>{`
        .upload-card-processing-bar {
          animation: upload-card-processing-shimmer 1.15s ease-in-out infinite;
          background-size: 220% 100%;
        }

        @keyframes upload-card-processing-shimmer {
          0% {
            background-position: 0% 50%;
            opacity: 0.72;
          }

          50% {
            background-position: 100% 50%;
            opacity: 1;
          }

          100% {
            background-position: 0% 50%;
            opacity: 0.72;
          }
        }

        .records-preview-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(37, 95, 143, 0.75) rgba(226, 232, 240, 0.7);
        }

        .records-preview-scroll::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }

        .records-preview-scroll::-webkit-scrollbar-track {
          background: rgba(226, 232, 240, 0.72);
          border-radius: 999px;
        }

        .records-preview-scroll::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(56, 189, 248, 0.95), rgba(37, 95, 143, 0.95));
          border: 2px solid rgba(226, 232, 240, 0.9);
          border-radius: 999px;
        }

        .records-preview-scroll::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, rgba(14, 165, 233, 1), rgba(30, 64, 175, 1));
        }

        .dark .records-preview-scroll {
          scrollbar-color: rgba(56, 189, 248, 0.75) rgba(15, 23, 42, 0.95);
        }

        .dark .records-preview-scroll::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.95);
        }

        .dark .records-preview-scroll::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(34, 211, 238, 0.9), rgba(37, 99, 235, 0.9));
          border: 2px solid rgba(15, 23, 42, 0.95);
        }

        @media (max-width: 639px) {
          .upload-mobile-compact {
            --upload-mobile-radius: 22px;
          }

          .upload-mobile-compact.space-y-6 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 0.85rem !important;
          }

          .upload-mobile-compact section {
            border-radius: 24px !important;
            padding: 1rem !important;
          }

          .upload-mobile-compact section .relative.grid {
            gap: 1rem !important;
          }

          .upload-mobile-compact section h1 {
            font-size: 1.75rem !important;
            line-height: 1.05 !important;
            letter-spacing: -0.04em !important;
          }

          .upload-mobile-compact section p {
            font-size: 0.82rem !important;
            line-height: 1.45 !important;
          }

          .upload-mobile-compact section .mt-6.grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 0.55rem !important;
            margin-top: 1rem !important;
          }

          .upload-mobile-compact section .mt-6.grid > div {
            border-radius: 16px !important;
            padding: 0.7rem !important;
            min-height: 88px !important;
          }

          .upload-mobile-compact section .mt-6.grid p:first-child {
            font-size: 0.52rem !important;
            line-height: 1.15 !important;
            letter-spacing: 0.08em !important;
          }

          .upload-mobile-compact section .mt-6.grid p:nth-child(2) {
            margin-top: 0.45rem !important;
            font-size: 1.25rem !important;
            line-height: 1 !important;
          }

          .upload-mobile-compact section .mt-6.grid p:last-child {
            font-size: 0.64rem !important;
            line-height: 1.25 !important;
          }

          .upload-mobile-compact section .rounded-\[30px\] {
            border-radius: 20px !important;
            padding: 0.9rem !important;
          }

          .upload-mobile-compact section .h-14.w-14 {
            height: 2.65rem !important;
            width: 2.65rem !important;
            border-radius: 16px !important;
          }

          .upload-mobile-compact #data-upload {
            gap: 0.85rem !important;
          }

          .upload-mobile-compact #data-upload > div.space-y-5 > :not([hidden]) ~ :not([hidden]),
          .upload-mobile-compact aside.space-y-5 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 0.85rem !important;
          }

          .upload-mobile-compact #data-upload .rounded-\[32px\] {
            border-radius: 22px !important;
            padding: 0.95rem !important;
          }

          .upload-mobile-compact #data-upload .rounded-\[30px\],
          .upload-mobile-compact #data-upload .rounded-\[28px\],
          .upload-mobile-compact #data-upload .rounded-\[24px\],
          .upload-mobile-compact #data-upload .rounded-\[22px\] {
            border-radius: 17px !important;
          }

          .upload-mobile-compact #data-upload h3 {
            font-size: 1.05rem !important;
            line-height: 1.15 !important;
            letter-spacing: -0.03em !important;
          }

          .upload-mobile-compact #data-upload h4 {
            font-size: 0.95rem !important;
            line-height: 1.18 !important;
          }

          .upload-mobile-compact #data-upload p {
            font-size: 0.78rem !important;
            line-height: 1.35 !important;
          }

          .upload-mobile-compact #data-upload .inline-flex {
            max-width: 100%;
          }

          .upload-mobile-compact #data-upload [class*="tracking-"] {
            letter-spacing: 0.08em !important;
          }

          .upload-mobile-compact #data-upload .mt-5 {
            margin-top: 0.8rem !important;
          }

          .upload-mobile-compact #data-upload .mt-4 {
            margin-top: 0.7rem !important;
          }

          .upload-mobile-compact #data-upload .mt-3 {
            margin-top: 0.55rem !important;
          }

          .upload-mobile-compact #data-upload .gap-5 {
            gap: 0.8rem !important;
          }

          .upload-mobile-compact #data-upload .gap-4 {
            gap: 0.7rem !important;
          }

          .upload-mobile-compact #data-upload .gap-3 {
            gap: 0.55rem !important;
          }

          .upload-mobile-compact #data-upload .grid.grid-cols-1.gap-3.sm\:grid-cols-2,
          .upload-mobile-compact #data-upload .grid.grid-cols-1.gap-3.sm\:grid-cols-2.xl\:grid-cols-4,
          .upload-mobile-compact #data-upload .grid.grid-cols-1.gap-3.sm\:grid-cols-2.lg\:grid-cols-4,
          .upload-mobile-compact #data-upload .grid.grid-cols-1.gap-3.sm\:grid-cols-3 {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .upload-mobile-compact #data-upload .grid.grid-cols-1.gap-3.sm\:grid-cols-2 > button {
            min-height: 168px !important;
            padding: 0.75rem !important;
          }

          .upload-mobile-compact #data-upload button .h-14.w-14,
          .upload-mobile-compact #data-upload .h-12.w-12,
          .upload-mobile-compact #data-upload .h-10.w-10,
          .upload-mobile-compact #data-upload .h-9.w-9 {
            height: 2.2rem !important;
            width: 2.2rem !important;
            border-radius: 13px !important;
          }

          .upload-mobile-compact #data-upload button svg,
          .upload-mobile-compact #data-upload label svg {
            height: 1rem !important;
            width: 1rem !important;
          }

          .upload-mobile-compact #data-upload button h3 {
            font-size: 0.88rem !important;
            line-height: 1.12 !important;
          }

          .upload-mobile-compact #data-upload button p {
            font-size: 0.68rem !important;
            line-height: 1.25 !important;
          }

          .upload-mobile-compact #data-upload button span {
            font-size: 0.58rem !important;
            line-height: 1.1 !important;
            padding: 0.28rem 0.48rem !important;
          }

          .upload-mobile-compact #data-upload button .mt-4.flex.flex-wrap {
            gap: 0.35rem !important;
          }

          .upload-mobile-compact #data-upload button .mt-4.h-2 {
            height: 0.35rem !important;
          }

          .upload-mobile-compact #data-upload label,
          .upload-mobile-compact #data-upload button[type="button"] {
            min-height: 46px !important;
          }

          .upload-mobile-compact #data-upload .lg\:min-w-\[390px\] {
            grid-template-columns: 1fr !important;
          }

          .upload-mobile-compact #data-upload .text-3xl {
            font-size: 1.45rem !important;
            line-height: 1 !important;
          }

          .upload-mobile-compact #data-upload .text-2xl {
            font-size: 1.25rem !important;
            line-height: 1.05 !important;
          }

          .upload-mobile-compact #data-upload .records-preview-scroll {
            max-height: 340px !important;
          }

          .upload-mobile-compact #data-upload table {
            font-size: 0.75rem !important;
          }

          .upload-mobile-compact #data-upload th,
          .upload-mobile-compact #data-upload td {
            padding: 0.65rem 0.75rem !important;
          }

          .upload-mobile-compact #data-upload thead {
            font-size: 0.62rem !important;
          }

          .upload-mobile-compact #data-upload aside {
            position: static !important;
          }

          .upload-mobile-compact #data-upload aside .rounded-\[32px\] {
            padding: 0.9rem !important;
          }

          .upload-mobile-compact #data-upload aside .mt-5.space-y-3 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 0.5rem !important;
          }

          .upload-mobile-compact #data-upload aside .flex.items-center.justify-between {
            padding: 0.65rem !important;
          }

          .upload-mobile-compact #data-upload aside .flex.items-center.justify-between span.text-sm {
            font-size: 0.75rem !important;
            line-height: 1.25 !important;
          }

          .upload-mobile-compact .fixed.inset-0 .max-w-\[520px\] {
            max-width: calc(100vw - 1.5rem) !important;
            border-radius: 24px !important;
            padding: 1rem !important;
          }

          .upload-mobile-compact .fixed.inset-0 .h-24.w-24 {
            height: 4.5rem !important;
            width: 4.5rem !important;
          }

          .upload-mobile-compact .fixed.inset-0 .h-16.w-16 {
            height: 3.25rem !important;
            width: 3.25rem !important;
            border-radius: 20px !important;
          }
        }


        /* Final mobile-only Upload page fit pass. Desktop is untouched. */
        @media (max-width: 639px) {
          .upload-mobile-compact,
          .upload-mobile-compact * {
            min-width: 0;
          }

          .upload-mobile-compact {
            width: 100%;
            max-width: 100vw;
            overflow-x: hidden;
            padding-bottom: 1.25rem !important;
          }

          .upload-mobile-compact > .pointer-events-none.absolute {
            display: none !important;
          }

          .upload-mobile-compact.space-y-6 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 0.75rem !important;
          }

          .upload-mobile-compact section {
            max-width: 100% !important;
            overflow: hidden !important;
            border-radius: 22px !important;
            padding: 0.85rem !important;
            box-shadow: 0 16px 40px rgba(15, 23, 42, 0.22) !important;
          }

          .upload-mobile-compact section .relative.grid {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 0.75rem !important;
          }

          .upload-mobile-compact section .mb-4.inline-flex {
            margin-bottom: 0.65rem !important;
            padding: 0.35rem 0.6rem !important;
            font-size: 0.58rem !important;
            letter-spacing: 0.13em !important;
          }

          .upload-mobile-compact section h1 {
            max-width: 100% !important;
            font-size: 1.55rem !important;
            line-height: 1.05 !important;
            letter-spacing: -0.045em !important;
          }

          .upload-mobile-compact section h1 + p {
            margin-top: 0.55rem !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
            font-size: 0.78rem !important;
            line-height: 1.35 !important;
          }

          .upload-mobile-compact section .mt-6.grid {
            margin-top: 0.75rem !important;
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.5rem !important;
          }

          .upload-mobile-compact section .mt-6.grid > div {
            min-height: 76px !important;
            border-radius: 16px !important;
            padding: 0.62rem !important;
          }

          .upload-mobile-compact section .mt-6.grid p:first-child {
            font-size: 0.5rem !important;
            line-height: 1.15 !important;
            letter-spacing: 0.08em !important;
          }

          .upload-mobile-compact section .mt-6.grid p:nth-child(2) {
            margin-top: 0.35rem !important;
            font-size: 1.22rem !important;
            line-height: 1 !important;
          }

          .upload-mobile-compact section .mt-6.grid p:last-child {
            margin-top: 0.2rem !important;
            font-size: 0.61rem !important;
            line-height: 1.2 !important;
          }

          .upload-mobile-compact section .rounded-\[30px\] {
            max-width: 100% !important;
            overflow: hidden !important;
            border-radius: 18px !important;
            padding: 0.72rem !important;
          }

          .upload-mobile-compact section .rounded-\[30px\] .flex.items-start.gap-4 {
            gap: 0.65rem !important;
          }

          .upload-mobile-compact section .rounded-\[30px\] .h-14.w-14 {
            height: 2.2rem !important;
            width: 2.2rem !important;
            border-radius: 13px !important;
          }

          .upload-mobile-compact section .rounded-\[30px\] h2 {
            margin-top: 0.25rem !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            font-size: 0.98rem !important;
            line-height: 1.15 !important;
          }

          .upload-mobile-compact section .rounded-\[30px\] p {
            font-size: 0.68rem !important;
            line-height: 1.3 !important;
          }

          .upload-mobile-compact section .rounded-\[30px\] .mt-5 {
            margin-top: 0.6rem !important;
          }

          .upload-mobile-compact section .rounded-\[30px\] .rounded-\[24px\] {
            max-width: 100% !important;
            overflow: hidden !important;
            border-radius: 14px !important;
            padding: 0.62rem !important;
          }

          .upload-mobile-compact section .rounded-\[30px\] .rounded-\[24px\] p:nth-child(2),
          .upload-mobile-compact section .rounded-\[30px\] .break-words {
            display: block !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            word-break: normal !important;
          }

          .upload-mobile-compact #data-upload {
            max-width: 100% !important;
            gap: 0.75rem !important;
            overflow: hidden !important;
          }

          .upload-mobile-compact #data-upload > div.space-y-5 > :not([hidden]) ~ :not([hidden]),
          .upload-mobile-compact #data-upload aside.space-y-5 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 0.75rem !important;
          }

          .upload-mobile-compact #data-upload .rounded-\[32px\] {
            max-width: 100% !important;
            overflow: hidden !important;
            border-radius: 20px !important;
            padding: 0.78rem !important;
          }

          .upload-mobile-compact #data-upload .rounded-\[30px\],
          .upload-mobile-compact #data-upload .rounded-\[28px\],
          .upload-mobile-compact #data-upload .rounded-\[24px\],
          .upload-mobile-compact #data-upload .rounded-\[22px\],
          .upload-mobile-compact #data-upload .rounded-2xl {
            border-radius: 15px !important;
          }

          .upload-mobile-compact #data-upload .inline-flex.items-center.gap-2 {
            padding: 0.32rem 0.58rem !important;
            font-size: 0.55rem !important;
            letter-spacing: 0.1em !important;
          }

          .upload-mobile-compact #data-upload h3 {
            font-size: 1rem !important;
            line-height: 1.12 !important;
            letter-spacing: -0.035em !important;
          }

          .upload-mobile-compact #data-upload h4 {
            font-size: 0.9rem !important;
            line-height: 1.15 !important;
          }

          .upload-mobile-compact #data-upload p {
            font-size: 0.74rem !important;
            line-height: 1.32 !important;
          }

          .upload-mobile-compact #data-upload .mt-5 { margin-top: 0.7rem !important; }
          .upload-mobile-compact #data-upload .mt-4 { margin-top: 0.55rem !important; }
          .upload-mobile-compact #data-upload .mt-3 { margin-top: 0.45rem !important; }
          .upload-mobile-compact #data-upload .mt-2 { margin-top: 0.35rem !important; }
          .upload-mobile-compact #data-upload .gap-5 { gap: 0.7rem !important; }
          .upload-mobile-compact #data-upload .gap-4 { gap: 0.6rem !important; }
          .upload-mobile-compact #data-upload .gap-3 { gap: 0.5rem !important; }

          .upload-mobile-compact #data-upload .grid.grid-cols-1.gap-3.sm\:grid-cols-2,
          .upload-mobile-compact #data-upload .grid.grid-cols-1.gap-3.sm\:grid-cols-2.xl\:grid-cols-4,
          .upload-mobile-compact #data-upload .grid.grid-cols-1.gap-3.sm\:grid-cols-2.lg\:grid-cols-4,
          .upload-mobile-compact #data-upload .grid.grid-cols-1.gap-3.sm\:grid-cols-3 {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.5rem !important;
          }

          .upload-mobile-compact #data-upload .grid.grid-cols-1.gap-3.sm\:grid-cols-2 > button {
            min-height: 132px !important;
            overflow: hidden !important;
            padding: 0.62rem !important;
          }

          .upload-mobile-compact #data-upload .grid.grid-cols-1.gap-3.sm\:grid-cols-2 > button .relative.z-20.flex {
            align-items: center !important;
            gap: 0.45rem !important;
          }

          .upload-mobile-compact #data-upload button .h-14.w-14,
          .upload-mobile-compact #data-upload .h-12.w-12,
          .upload-mobile-compact #data-upload .h-10.w-10,
          .upload-mobile-compact #data-upload .h-9.w-9,
          .upload-mobile-compact #data-upload .h-8.w-8 {
            height: 1.95rem !important;
            width: 1.95rem !important;
            border-radius: 11px !important;
          }

          .upload-mobile-compact #data-upload button svg,
          .upload-mobile-compact #data-upload label svg {
            height: 0.92rem !important;
            width: 0.92rem !important;
          }

          .upload-mobile-compact #data-upload button h3 {
            display: -webkit-box !important;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
            font-size: 0.8rem !important;
            line-height: 1.12 !important;
          }

          .upload-mobile-compact #data-upload button p {
            display: -webkit-box !important;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
            font-size: 0.62rem !important;
            line-height: 1.22 !important;
          }

          .upload-mobile-compact #data-upload button span {
            max-width: 100% !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            font-size: 0.52rem !important;
            line-height: 1.1 !important;
            padding: 0.24rem 0.42rem !important;
          }

          .upload-mobile-compact #data-upload button .mt-4.flex.flex-wrap {
            margin-top: 0.5rem !important;
            gap: 0.28rem !important;
          }

          .upload-mobile-compact #data-upload button .mt-4.flex.flex-wrap span:first-child {
            display: none !important;
          }

          .upload-mobile-compact #data-upload button .mt-4.rounded-2xl,
          .upload-mobile-compact #data-upload button .mt-3.flex.items-center.gap-2 {
            display: none !important;
          }

          .upload-mobile-compact #data-upload button .mt-4.h-2 {
            height: 0.3rem !important;
            margin-top: 0.5rem !important;
          }

          .upload-mobile-compact #data-upload .flex.min-w-0.items-start.gap-3 .break-words,
          .upload-mobile-compact #data-upload .flex.min-w-0.items-start.gap-3 span.font-bold,
          .upload-mobile-compact #data-upload aside .break-words {
            display: block !important;
            max-width: 100% !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            word-break: normal !important;
          }

          .upload-mobile-compact #data-upload .grid.gap-3.sm\:grid-cols-2.lg\:min-w-\[390px\] {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 0.5rem !important;
            min-width: 0 !important;
          }

          .upload-mobile-compact #data-upload label,
          .upload-mobile-compact #data-upload button[type="button"] {
            min-height: 42px !important;
            padding: 0.62rem 0.75rem !important;
            font-size: 0.76rem !important;
            line-height: 1.15 !important;
          }

          .upload-mobile-compact #data-upload .text-3xl {
            font-size: 1.35rem !important;
            line-height: 1 !important;
          }

          .upload-mobile-compact #data-upload .text-2xl {
            font-size: 1.16rem !important;
            line-height: 1.05 !important;
          }

          .upload-mobile-compact #data-upload .grid.grid-cols-1.gap-3.sm\:grid-cols-2.xl\:grid-cols-4 > div,
          .upload-mobile-compact #data-upload .grid.grid-cols-1.gap-3.sm\:grid-cols-2.lg\:grid-cols-4 > div,
          .upload-mobile-compact #data-upload .grid.grid-cols-1.gap-3.sm\:grid-cols-3 > div {
            min-height: 92px !important;
            padding: 0.62rem !important;
          }

          .upload-mobile-compact #data-upload .records-preview-scroll {
            max-height: 300px !important;
            max-width: 100% !important;
            overflow: auto !important;
            -webkit-overflow-scrolling: touch;
          }

          .upload-mobile-compact #data-upload table {
            width: max-content !important;
            font-size: 0.72rem !important;
          }

          .upload-mobile-compact #data-upload table.min-w-\[980px\] { min-width: 760px !important; }
          .upload-mobile-compact #data-upload table.min-w-\[920px\] { min-width: 720px !important; }
          .upload-mobile-compact #data-upload table.min-w-\[720px\] { min-width: 620px !important; }

          .upload-mobile-compact #data-upload th,
          .upload-mobile-compact #data-upload td {
            padding: 0.55rem 0.65rem !important;
            white-space: nowrap;
          }

          .upload-mobile-compact #data-upload thead {
            font-size: 0.58rem !important;
            letter-spacing: 0.08em !important;
          }

          .upload-mobile-compact #data-upload aside {
            position: static !important;
          }

          .upload-mobile-compact #data-upload aside .mt-5.space-y-3 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 0.45rem !important;
          }

          .upload-mobile-compact #data-upload aside .flex.items-center.justify-between {
            padding: 0.55rem !important;
          }

          .upload-mobile-compact #data-upload aside .flex.items-center.justify-between span.text-sm {
            font-size: 0.7rem !important;
            line-height: 1.2 !important;
          }

          .upload-mobile-compact .fixed.inset-0 .max-w-\[520px\] {
            max-width: calc(100vw - 1.25rem) !important;
            border-radius: 22px !important;
            padding: 0.9rem !important;
          }
        }

        @media (max-width: 639px) {

          /* Upload source cards: fixed 2 by 2 mobile grid only */
          .upload-mobile-compact .mobile-upload-source-grid {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.55rem !important;
          }

          .upload-mobile-compact .mobile-upload-source-grid > button {
            width: 100% !important;
            min-width: 0 !important;
            min-height: 132px !important;
            padding: 0.62rem !important;
            border-radius: 18px !important;
          }

          .upload-mobile-compact .mobile-upload-source-grid > button > .relative.z-20.flex {
            align-items: center !important;
            gap: 0.42rem !important;
          }

          .upload-mobile-compact .mobile-upload-source-grid > button .h-14.w-14 {
            height: 1.95rem !important;
            width: 1.95rem !important;
            border-radius: 12px !important;
          }

          .upload-mobile-compact .mobile-upload-source-grid > button h3 {
            display: -webkit-box !important;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
            font-size: 0.78rem !important;
            line-height: 1.12 !important;
          }

          .upload-mobile-compact .mobile-upload-source-grid > button p {
            display: -webkit-box !important;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
            font-size: 0.62rem !important;
            line-height: 1.2 !important;
          }

          .upload-mobile-compact .mobile-upload-source-grid > button span {
            max-width: 100% !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            font-size: 0.52rem !important;
            line-height: 1.1 !important;
            padding: 0.24rem 0.42rem !important;
          }

          .upload-mobile-compact .mobile-upload-source-grid > button .mt-4.flex.flex-wrap span:first-child,
          .upload-mobile-compact .mobile-upload-source-grid > button .mt-4.rounded-2xl,
          .upload-mobile-compact .mobile-upload-source-grid > button .mt-3.flex.items-center.gap-2 {
            display: none !important;
          }

          .upload-mobile-compact .mobile-upload-source-grid > button .mt-4.h-2 {
            height: 0.3rem !important;
            margin-top: 0.48rem !important;
          }

        }


        /* Phase 2 final mobile card grids only. Desktop remains untouched. */
        @media (max-width: 639px) {
          .upload-mobile-compact .mobile-grid-4 {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.5rem !important;
          }

          .upload-mobile-compact .mobile-grid-6 {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 0.45rem !important;
          }

          .upload-mobile-compact .mobile-grid-3 {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 0.45rem !important;
          }

          .upload-mobile-compact .mobile-grid-4 > div,
          .upload-mobile-compact .mobile-grid-6 > div,
          .upload-mobile-compact .mobile-grid-3 > div {
            min-width: 0 !important;
            min-height: 76px !important;
            overflow: hidden !important;
            border-radius: 15px !important;
            padding: 0.55rem !important;
          }

          .upload-mobile-compact .mobile-grid-6 > div {
            min-height: 92px !important;
            padding: 0.48rem !important;
          }

          .upload-mobile-compact .mobile-grid-4 .h-10.w-10,
          .upload-mobile-compact .mobile-grid-4 .h-9.w-9,
          .upload-mobile-compact .mobile-grid-6 .h-10.w-10,
          .upload-mobile-compact .mobile-grid-6 .h-9.w-9,
          .upload-mobile-compact .mobile-grid-3 .h-10.w-10,
          .upload-mobile-compact .mobile-grid-3 .h-9.w-9 {
            height: 1.72rem !important;
            width: 1.72rem !important;
            border-radius: 10px !important;
          }

          .upload-mobile-compact .mobile-grid-4 svg,
          .upload-mobile-compact .mobile-grid-6 svg,
          .upload-mobile-compact .mobile-grid-3 svg {
            height: 0.82rem !important;
            width: 0.82rem !important;
          }

          .upload-mobile-compact .mobile-grid-4 p,
          .upload-mobile-compact .mobile-grid-6 p,
          .upload-mobile-compact .mobile-grid-3 p {
            min-width: 0 !important;
            overflow-wrap: anywhere !important;
          }

          .upload-mobile-compact .mobile-grid-4 p[class*="uppercase"],
          .upload-mobile-compact .mobile-grid-6 p[class*="uppercase"],
          .upload-mobile-compact .mobile-grid-3 p[class*="uppercase"] {
            display: -webkit-box !important;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
            font-size: 0.5rem !important;
            line-height: 1.08 !important;
            letter-spacing: 0.07em !important;
          }

          .upload-mobile-compact .mobile-grid-4 .text-3xl,
          .upload-mobile-compact .mobile-grid-4 .text-2xl,
          .upload-mobile-compact .mobile-grid-3 .text-3xl,
          .upload-mobile-compact .mobile-grid-3 .text-2xl {
            margin-top: 0.35rem !important;
            font-size: 1.15rem !important;
            line-height: 1 !important;
          }

          .upload-mobile-compact .mobile-grid-6 .text-3xl,
          .upload-mobile-compact .mobile-grid-6 .text-2xl {
            margin-top: 0.25rem !important;
            font-size: 0.95rem !important;
            line-height: 1 !important;
          }

          .upload-mobile-compact .mobile-grid-4 p[class*="leading-5"],
          .upload-mobile-compact .mobile-grid-6 p[class*="leading-5"],
          .upload-mobile-compact .mobile-grid-3 p[class*="leading-5"],
          .upload-mobile-compact .mobile-grid-4 p[class*="leading-6"],
          .upload-mobile-compact .mobile-grid-6 p[class*="leading-6"],
          .upload-mobile-compact .mobile-grid-3 p[class*="leading-6"] {
            display: -webkit-box !important;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
            font-size: 0.58rem !important;
            line-height: 1.15 !important;
          }

          .upload-mobile-compact .mobile-grid-6 > div > .flex,
          .upload-mobile-compact .mobile-grid-3 > div > .flex {
            gap: 0.35rem !important;
          }

          .upload-mobile-compact .mobile-grid-6 span,
          .upload-mobile-compact .mobile-grid-3 span {
            max-width: 100% !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            font-size: 0.5rem !important;
            line-height: 1.05 !important;
            padding: 0.22rem 0.36rem !important;
          }

          .upload-mobile-compact .mobile-grid-6 .flex.flex-col.gap-3,
          .upload-mobile-compact .mobile-grid-6 .flex.gap-3 {
            gap: 0.35rem !important;
          }

          .upload-mobile-compact .mobile-grid-6 .flex.flex-col.gap-3.sm\:flex-row {
            flex-direction: column !important;
          }

          .upload-mobile-compact .mobile-grid-6 .flex.gap-3 > div:last-child {
            min-width: 0 !important;
          }

          .upload-mobile-compact .mobile-grid-6 .flex.gap-3 > div:last-child p:first-child {
            display: -webkit-box !important;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
            font-size: 0.58rem !important;
            line-height: 1.12 !important;
          }

          .upload-mobile-compact .mobile-grid-6 .flex.gap-3 > div:last-child p:not(:first-child) {
            display: none !important;
          }
        }

        @media (max-width: 374px) {
          .upload-mobile-compact #data-upload .grid.grid-cols-1.gap-3.sm\:grid-cols-2 > button {
            min-height: 124px !important;
            padding: 0.55rem !important;
          }

          .upload-mobile-compact .mobile-upload-source-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .upload-mobile-compact .mobile-upload-source-grid > button {
            min-height: 124px !important;
            padding: 0.55rem !important;
          }

          .upload-mobile-compact #data-upload button h3 {
            font-size: 0.72rem !important;
          }

          .upload-mobile-compact section .mt-6.grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </div>
  )
}