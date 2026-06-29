import { useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  MapPin,
  Presentation,
  Printer,
  Send,
  ShieldAlert,
  Sparkles,
  Users,
} from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import pptxgen from 'pptxgenjs'
import SectionTitle from '../components/SectionTitle'
import { useData } from '../context/DataContext'
import { riskStyles } from '../utils/analytics'

const exportFormats = [
  {
    id: 'pdf',
    label: 'PDF report',
    desc: 'Downloads a PDF decision-support report',
    icon: FileText,
    style:
      'border-rose-100 bg-rose-50 text-brand-red dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
  },
  {
    id: 'excel',
    label: 'Excel workbook',
    desc: 'Downloads an XLSX workbook with DSS sheets',
    icon: FileSpreadsheet,
    style:
      'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  {
    id: 'powerpoint',
    label: 'PowerPoint deck',
    desc: 'Generates a designed PPTX briefing deck',
    icon: Presentation,
    style:
      'border-blue-100 bg-blue-50 text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
  },
  {
    id: 'print',
    label: 'Print view',
    desc: 'Opens a browser print-ready DSS report',
    icon: Printer,
    style:
      'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
  },
]

const distributionItems = [
  {
    label: 'City Health Office',
    icon: Users,
  },
  {
    label: 'Barangay health workers',
    icon: ShieldAlert,
  },
  {
    label: 'Weekly decision briefing',
    icon: ClipboardList,
  },
  {
    label: 'Map snapshot and action checklist',
    icon: MapPin,
  },
]

function formatNumber(value) {
  return new Intl.NumberFormat('en-PH').format(Number(value || 0))
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function getCurrentDateTime() {
  return new Date().toLocaleString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function getGenericRecommendedAction(risk) {
  if (risk === 'High') {
    return 'Conduct source reduction, coordinate immediate cleanup, and issue a barangay-level dengue alert within 24 to 48 hours.'
  }

  if (risk === 'Moderate') {
    return 'Continue close weekly monitoring, strengthen preventive messaging, and inspect common mosquito breeding areas.'
  }

  if (risk === 'Low') {
    return 'Maintain routine monitoring, public advisories, and regular environmental sanitation activities.'
  }

  return 'Upload and validate dengue records first before generating a complete response recommendation.'
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
  }
}

function getRiskCounts(riskRows = []) {
  return {
    highRiskCount: riskRows.filter((row) => row.risk === 'High').length,
    moderateRiskCount: riskRows.filter((row) => row.risk === 'Moderate').length,
    lowRiskCount: riskRows.filter((row) => row.risk === 'Low').length,
  }
}

function getRiskSortValue(risk) {
  if (risk === 'High') return 3
  if (risk === 'Moderate') return 2
  if (risk === 'Low') return 1
  return 0
}

function getPrioritySortValue(priority) {
  const value = String(priority || '').toLowerCase()

  if (value.includes('immediate')) return 7
  if (value.includes('high priority')) return 6
  if (value.includes('escalated')) return 5
  if (value.includes('preventive')) return 4
  if (value.includes('monitoring')) return 3
  if (value.includes('early')) return 2
  if (value.includes('routine')) return 1

  return 0
}

function getDecisionCounts(riskRows = []) {
  return riskRows.reduce(
    (acc, row) => {
      const decision = getDecisionSupport(row)
      const priority = String(decision.priority || '').toLowerCase()

      if (
        priority.includes('immediate') ||
        priority.includes('high priority') ||
        priority.includes('escalated')
      ) {
        acc.urgent += 1
      } else if (priority.includes('preventive')) {
        acc.preventive += 1
      } else if (
        priority.includes('monitoring') ||
        priority.includes('early')
      ) {
        acc.watch += 1
      } else if (priority.includes('routine')) {
        acc.routine += 1
      } else {
        acc.pending += 1
      }

      return acc
    },
    {
      urgent: 0,
      preventive: 0,
      watch: 0,
      routine: 0,
      pending: 0,
    }
  )
}

function getPriorityDistribution(riskRows = []) {
  const priorityMap = new Map()

  riskRows.forEach((row) => {
    const decision = getDecisionSupport(row)
    const priority = decision.priority || 'Pending Dataset'

    priorityMap.set(priority, toNumber(priorityMap.get(priority)) + 1)
  })

  return Array.from(priorityMap.entries())
    .map(([priority, count]) => ({
      priority,
      count,
    }))
    .sort((a, b) => {
      const priorityDifference =
        getPrioritySortValue(b.priority) - getPrioritySortValue(a.priority)

      if (priorityDifference !== 0) return priorityDifference

      return b.count - a.count
    })
}

function getSortedRiskRows(riskRows = []) {
  return [...riskRows].sort((a, b) => {
    const decisionA = getDecisionSupport(a)
    const decisionB = getDecisionSupport(b)

    const priorityDifference =
      getPrioritySortValue(decisionB.priority) -
      getPrioritySortValue(decisionA.priority)

    if (priorityDifference !== 0) {
      return priorityDifference
    }

    const scoreDifference =
      Number(decisionB.score || 0) - Number(decisionA.score || 0)

    if (scoreDifference !== 0) {
      return scoreDifference
    }

    const riskDifference = getRiskSortValue(b.risk) - getRiskSortValue(a.risk)

    if (riskDifference !== 0) {
      return riskDifference
    }

    return Number(b.forecast || 0) - Number(a.forecast || 0)
  })
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

function getStatusStyle(badge = '') {
  const value = String(badge || '').toLowerCase()

  if (value.includes('uploaded') || value.includes('ready') || value.includes('sample')) {
    return 'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
  }

  if (value.includes('review') || value.includes('pending') || value.includes('missing')) {
    return 'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
  }

  return 'border-slate-200 bg-slate-50 text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

function getTopDecisionText(topBarangay) {
  if (!topBarangay) {
    return 'No barangay decision support output is available yet.'
  }

  const decision = getDecisionSupport(topBarangay)

  return `${topBarangay.barangay} is the top DSS priority with ${decision.priority}, ${formatNumber(topBarangay.forecast)} projected cases, and a decision score of ${formatNumber(decision.score)}.`
}

function getReportSummary({ sortedRiskRows, dashboardStats }) {
  if (!sortedRiskRows.length) {
    return [
      'No barangay risk ranking is available yet.',
      'Upload or load dengue case records before generating a complete decision-support report.',
      'Use mock data only for prototype demonstration while waiting for the official DOH dataset.',
    ]
  }

  const decisionCounts = getDecisionCounts(sortedRiskRows)
  const topBarangay = sortedRiskRows[0]
  const topDecision = getDecisionSupport(topBarangay)

  return [
    decisionCounts.urgent > 0
      ? `${decisionCounts.urgent} barangay${decisionCounts.urgent === 1 ? '' : 's'} require immediate, high-priority, or escalated response planning.`
      : 'No barangay currently requires immediate or escalated response planning.',
    topBarangay
      ? `${topBarangay.barangay} is the highest DSS priority with ${topDecision.priority} and ${formatNumber(topBarangay.forecast)} projected cases.`
      : 'No top priority barangay is available.',
    `The current workspace has a data quality score of ${dashboardStats?.dataQuality || 0}%.`,
  ]
}

function buildPrintableActionList(actions = []) {
  if (!actions.length) {
    return '<li>No action plan available yet.</li>'
  }

  return actions
    .slice(0, 6)
    .map((action) => `<li>${escapeHtml(action)}</li>`)
    .join('')
}

function buildPrintableRationaleList(rationale = []) {
  if (!rationale.length) {
    return '<li>No rationale available yet.</li>'
  }

  return rationale
    .slice(0, 5)
    .map((reason) => `<li>${escapeHtml(reason)}</li>`)
    .join('')
}

function openPrintableReport({ dashboardStats = {}, riskRows, sourceStatus, generatedAt, title }) {
  const sortedRiskRows = getSortedRiskRows(riskRows)
  const { highRiskCount, moderateRiskCount, lowRiskCount } = getRiskCounts(sortedRiskRows)
  const decisionCounts = getDecisionCounts(sortedRiskRows)
  const priorityDistribution = getPriorityDistribution(sortedRiskRows)
  const topBarangay = sortedRiskRows[0]
  const topDecision = getDecisionSupport(topBarangay)

  const rowsHtml = sortedRiskRows
    .map((row, index) => {
      const decision = getDecisionSupport(row)

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(row.barangay)}</td>
          <td>${escapeHtml(row.risk || 'Unknown')}</td>
          <td>${escapeHtml(decision.priority)}</td>
          <td>${formatNumber(decision.score)}</td>
          <td>${formatNumber(row.forecast)}</td>
          <td>${formatNumber(row.totalCases)}</td>
          <td>${escapeHtml(decision.primaryAction)}</td>
        </tr>
      `
    })
    .join('')

  const priorityHtml = priorityDistribution
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.priority)}</td>
        <td>${formatNumber(item.count)}</td>
      </tr>
    `
    )
    .join('')

  const sourcesHtml = Object.entries(sourceStatus || {})
    .map(([key, item = {}]) => {
      return `
        <tr>
          <td>${escapeHtml(key)}</td>
          <td>${escapeHtml(item.uploadedName || 'No file uploaded')}</td>
          <td>${escapeHtml(item.badge || 'No status')}</td>
          <td>${formatNumber(item.validCount || 0)} / ${formatNumber(item.recordCount || 0)}</td>
        </tr>
      `
    })
    .join('')

  const html = `
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(title)}</title>

        <style>
          body {
            font-family: Arial, sans-serif;
            color: #172033;
            margin: 32px;
            line-height: 1.5;
            background: #ffffff;
          }

          h1, h2, h3 {
            margin-bottom: 8px;
          }

          .muted {
            color: #64748b;
          }

          .cards {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin: 20px 0;
          }

          .card {
            border: 1px solid #dbe4ee;
            border-radius: 14px;
            padding: 14px;
            background: #f8fafc;
          }

          .card small {
            color: #64748b;
            text-transform: uppercase;
            font-weight: 700;
            letter-spacing: 0.08em;
          }

          .card strong {
            display: block;
            font-size: 24px;
            margin-top: 6px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
            font-size: 12px;
          }

          th, td {
            border: 1px solid #dbe4ee;
            padding: 8px;
            text-align: left;
            vertical-align: top;
          }

          th {
            background: #eef6ff;
          }

          .note {
            margin-top: 20px;
            border: 1px solid #fde68a;
            background: #fffbeb;
            padding: 14px;
            border-radius: 14px;
          }

          .decision {
            margin-top: 20px;
            border: 1px solid #bfdbfe;
            background: #eff6ff;
            padding: 14px;
            border-radius: 14px;
          }

          .decision strong {
            color: #1e4e75;
          }

          li {
            margin-bottom: 6px;
          }

          @media print {
            button {
              display: none;
            }
          }

          @media (max-width: 900px) {
            .cards {
              grid-template-columns: repeat(2, 1fr);
            }
          }

          @media (max-width: 520px) {
            body {
              margin: 18px;
            }

            .cards {
              grid-template-columns: 1fr;
            }

            table {
              font-size: 11px;
            }

            th, td {
              padding: 6px;
            }
          }
        </style>
      </head>

      <body>
        <button onclick="window.print()" style="padding: 10px 16px; border: 0; background: #2563eb; color: white; border-radius: 8px; font-weight: 700;">
          Print Report
        </button>

        <h1>${escapeHtml(title)}</h1>
        <p class="muted">Generated: ${escapeHtml(generatedAt)}</p>

        <div class="cards">
          <div class="card">
            <small>Total Cases</small>
            <strong>${formatNumber(dashboardStats.totalCases)}</strong>
          </div>

          <div class="card">
            <small>DSS Alerts</small>
            <strong>${formatNumber(decisionCounts.urgent)}</strong>
          </div>

          <div class="card">
            <small>Forecast Total</small>
            <strong>${formatNumber(dashboardStats.fourWeekForecast)}</strong>
          </div>

          <div class="card">
            <small>Data Quality</small>
            <strong>${escapeHtml(dashboardStats.dataQuality)}%</strong>
          </div>
        </div>

        <h2>Risk Distribution</h2>
        <p>High risk barangays: ${formatNumber(highRiskCount)}</p>
        <p>Moderate risk barangays: ${formatNumber(moderateRiskCount)}</p>
        <p>Low risk barangays: ${formatNumber(lowRiskCount)}</p>

        <h2>DSS Priority Distribution</h2>
        <table>
          <thead>
            <tr>
              <th>Priority Level</th>
              <th>Barangay Count</th>
            </tr>
          </thead>
          <tbody>
            ${priorityHtml || '<tr><td colspan="2">No DSS priority data available.</td></tr>'}
          </tbody>
        </table>

        <h2>Barangay Decision Support Ranking</h2>
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Barangay</th>
              <th>Risk</th>
              <th>DSS Priority</th>
              <th>Score</th>
              <th>Forecast</th>
              <th>Historical Cases</th>
              <th>Primary Action</th>
            </tr>
          </thead>

          <tbody>
            ${rowsHtml || '<tr><td colspan="8">No barangay decision-support data available.</td></tr>'}
          </tbody>
        </table>

        <div class="decision">
          <h3>Top Response Plan</h3>
          <p><strong>${escapeHtml(topBarangay?.barangay || 'No barangay selected')}</strong></p>
          <p>${escapeHtml(topDecision.summary || 'No top response recommendation available yet.')}</p>

          <h4>Action Plan</h4>
          <ol>
            ${buildPrintableActionList(topDecision.actions)}
          </ol>

          <h4>Decision Rationale</h4>
          <ul>
            ${buildPrintableRationaleList(topDecision.rationale)}
          </ul>
        </div>

        <h2>Data Source Readiness</h2>
        <table>
          <thead>
            <tr>
              <th>Dataset</th>
              <th>Source/File</th>
              <th>Status</th>
              <th>Valid Records</th>
            </tr>
          </thead>

          <tbody>
            ${sourcesHtml || '<tr><td colspan="4">No source status available.</td></tr>'}
          </tbody>
        </table>

        <div class="note">
          <h3>Prototype Note</h3>
          <p>This report is generated from the current frontend prototype workspace. Final model testing and official reporting should be performed after the official DOH dengue dataset is available and validated.</p>
        </div>
      </body>
    </html>
  `

  const reportWindow = window.open('', '_blank')

  if (!reportWindow) {
    alert('Popup blocked. Please allow popups to open the printable report.')
    return
  }

  reportWindow.document.write(html)
  reportWindow.document.close()
}

function downloadPdfReport({ dashboardStats = {}, riskRows, sourceStatus, generatedAt, title }) {
  const sortedRiskRows = getSortedRiskRows(riskRows)
  const { highRiskCount, moderateRiskCount, lowRiskCount } = getRiskCounts(sortedRiskRows)
  const decisionCounts = getDecisionCounts(sortedRiskRows)
  const priorityDistribution = getPriorityDistribution(sortedRiskRows)
  const topBarangay = sortedRiskRows[0]
  const topDecision = getDecisionSupport(topBarangay)

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  })

  const margin = 36
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(title, margin, 42)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Generated: ${generatedAt}`, margin, 62)

  doc.setFontSize(11)
  doc.text('Barangay-Level Dengue Outbreak Prevention System', margin, 84)

  autoTable(doc, {
    startY: 106,
    head: [['Metric', 'Value']],
    body: [
      ['Total recorded cases', formatNumber(dashboardStats.totalCases)],
      ['DSS alerts', formatNumber(decisionCounts.urgent)],
      ['High-risk barangays', formatNumber(highRiskCount)],
      ['Moderate-risk barangays', formatNumber(moderateRiskCount)],
      ['Low-risk barangays', formatNumber(lowRiskCount)],
      ['Four-week forecast total', formatNumber(dashboardStats.fourWeekForecast)],
      ['Data quality score', `${dashboardStats.dataQuality}%`],
      ['Top DSS barangay', topBarangay?.barangay || 'No data'],
      ['Top DSS priority', topDecision.priority || 'No data'],
    ],
    theme: 'grid',
    styles: {
      fontSize: 9,
      cellPadding: 6,
    },
    headStyles: {
      fillColor: [37, 95, 143],
      textColor: [255, 255, 255],
    },
    margin: {
      left: margin,
      right: margin,
    },
  })

  const rankingStartY = doc.lastAutoTable.finalY + 22

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('Barangay Decision Support Ranking', margin, rankingStartY)

  autoTable(doc, {
    startY: rankingStartY + 12,
    head: [[
      'Rank',
      'Barangay',
      'Risk',
      'DSS Priority',
      'Score',
      'Forecast',
      'Historical',
      'Primary Action',
    ]],
    body:
      sortedRiskRows.length > 0
        ? sortedRiskRows.map((row, index) => {
            const decision = getDecisionSupport(row)

            return [
              index + 1,
              row.barangay,
              row.risk || 'Unknown',
              decision.priority,
              formatNumber(decision.score),
              formatNumber(row.forecast),
              formatNumber(row.totalCases),
              decision.primaryAction,
            ]
          })
        : [['-', 'No barangay decision-support data available', '-', '-', '-', '-', '-', '-']],
    theme: 'grid',
    styles: {
      fontSize: 7,
      cellPadding: 4,
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 36 },
      1: { cellWidth: 92 },
      2: { cellWidth: 52 },
      3: { cellWidth: 96 },
      4: { cellWidth: 44 },
      5: { cellWidth: 54 },
      6: { cellWidth: 58 },
      7: { cellWidth: 300 },
    },
    headStyles: {
      fillColor: [37, 95, 143],
      textColor: [255, 255, 255],
    },
    margin: {
      left: margin,
      right: margin,
    },
  })

  doc.addPage()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('Top Response Plan', margin, 42)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  const topText = topBarangay
    ? `${topBarangay.barangay}: ${topDecision.summary}`
    : 'No top response recommendation is available yet.'

  const wrappedTopText = doc.splitTextToSize(topText, pageWidth - margin * 2)
  doc.text(wrappedTopText, margin, 62)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Action Plan', margin, 110)

  autoTable(doc, {
    startY: 124,
    head: [['No.', 'Recommended Action']],
    body:
      topDecision.actions?.length > 0
        ? topDecision.actions.slice(0, 6).map((action, index) => [
            index + 1,
            action,
          ])
        : [['-', 'No action plan available.']],
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 5,
    },
    headStyles: {
      fillColor: [37, 95, 143],
      textColor: [255, 255, 255],
    },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 720 },
    },
    margin: {
      left: margin,
      right: margin,
    },
  })

  const rationaleStartY = doc.lastAutoTable.finalY + 22

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Decision Rationale', margin, rationaleStartY)

  autoTable(doc, {
    startY: rationaleStartY + 12,
    head: [['Reason']],
    body:
      topDecision.rationale?.length > 0
        ? topDecision.rationale.slice(0, 6).map((reason) => [reason])
        : [['No rationale available.']],
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 5,
    },
    headStyles: {
      fillColor: [4, 120, 87],
      textColor: [255, 255, 255],
    },
    margin: {
      left: margin,
      right: margin,
    },
  })

  const priorityStartY = doc.lastAutoTable.finalY + 22

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('DSS Priority Distribution', margin, priorityStartY)

  autoTable(doc, {
    startY: priorityStartY + 12,
    head: [['Priority Level', 'Barangay Count']],
    body:
      priorityDistribution.length > 0
        ? priorityDistribution.map((item) => [
            item.priority,
            formatNumber(item.count),
          ])
        : [['No data', '-']],
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 5,
    },
    headStyles: {
      fillColor: [37, 95, 143],
      textColor: [255, 255, 255],
    },
    margin: {
      left: margin,
      right: margin,
    },
  })

  const sources = Object.entries(sourceStatus || {})

  doc.addPage()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('Data Source Readiness', margin, 42)

  autoTable(doc, {
    startY: 58,
    head: [['Dataset', 'Source/File', 'Status', 'Valid Records']],
    body:
      sources.length > 0
        ? sources.map(([key, item = {}]) => [
            key,
            item.uploadedName || 'No file uploaded',
            item.badge || 'No status',
            `${formatNumber(item.validCount || 0)} / ${formatNumber(item.recordCount || 0)}`,
          ])
        : [['-', 'No source status available', '-', '-']],
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 5,
    },
    headStyles: {
      fillColor: [37, 95, 143],
      textColor: [255, 255, 255],
    },
    margin: {
      left: margin,
      right: margin,
    },
  })

  const prototypeY = doc.lastAutoTable.finalY + 24

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Prototype Note', margin, prototypeY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  const prototypeText =
    'This report is generated from the current frontend prototype workspace. Final model testing and official reporting should be performed after the official DOH dengue dataset is available and validated.'

  const wrappedPrototype = doc.splitTextToSize(prototypeText, pageWidth - margin * 2)
  doc.text(wrappedPrototype, margin, prototypeY + 18)

  doc.save('weekly-dengue-decision-support-report.pdf')
}

function downloadExcelWorkbook({ dashboardStats = {}, riskRows, sourceStatus, generatedAt }) {
  const sortedRiskRows = getSortedRiskRows(riskRows)
  const { highRiskCount, moderateRiskCount, lowRiskCount } = getRiskCounts(sortedRiskRows)
  const decisionCounts = getDecisionCounts(sortedRiskRows)
  const priorityDistribution = getPriorityDistribution(sortedRiskRows)
  const topBarangay = sortedRiskRows[0]
  const topDecision = getDecisionSupport(topBarangay)

  const workbook = XLSX.utils.book_new()

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ['Weekly Dengue Decision Support Report'],
    ['Generated', generatedAt],
    [],
    ['Metric', 'Value'],
    ['Total recorded cases', Number(dashboardStats.totalCases || 0)],
    ['DSS alerts', decisionCounts.urgent],
    ['Preventive priority barangays', decisionCounts.preventive],
    ['Watch or monitoring barangays', decisionCounts.watch],
    ['Routine monitoring barangays', decisionCounts.routine],
    ['High-risk barangays', highRiskCount],
    ['Moderate-risk barangays', moderateRiskCount],
    ['Low-risk barangays', lowRiskCount],
    ['Four-week forecast total', Number(dashboardStats.fourWeekForecast || 0)],
    ['Data quality score', `${dashboardStats.dataQuality}%`],
    ['Top DSS barangay', topBarangay?.barangay || 'No data'],
    ['Top DSS priority', topDecision.priority || 'No data'],
    ['Top DSS summary', topDecision.summary || 'No recommendation available'],
    [],
    ['Prototype Note'],
    [
      'This workbook is generated from the current prototype workspace. Final reporting should use validated official dengue records.',
    ],
  ])

  summarySheet['!cols'] = [{ wch: 34 }, { wch: 110 }]
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')

  const rankingSheet = XLSX.utils.aoa_to_sheet([
    [
      'Rank',
      'Barangay',
      'Risk Level',
      'DSS Priority',
      'Decision Score',
      'Projected Cases',
      'Historical Total Cases',
      'Current Cases',
      'Previous Cases',
      'Trend',
      'Trend Direction',
      'Forecast Pressure',
      'Population Exposure',
      'Density Level',
      'Primary Action',
      'Recommendation Summary',
    ],
    ...sortedRiskRows.map((row, index) => {
      const decision = getDecisionSupport(row)

      return [
        index + 1,
        row.barangay,
        row.risk,
        decision.priority,
        Number(decision.score || 0),
        Number(row.forecast || 0),
        Number(row.totalCases || 0),
        Number(row.currentCases || 0),
        Number(row.previousCases || 0),
        row.trend || 'Not available',
        decision.trendDirection,
        decision.forecastPressure,
        decision.populationExposure,
        decision.densityLevel,
        decision.primaryAction,
        decision.summary,
      ]
    }),
  ])

  rankingSheet['!cols'] = [
    { wch: 8 },
    { wch: 30 },
    { wch: 16 },
    { wch: 26 },
    { wch: 16 },
    { wch: 18 },
    { wch: 24 },
    { wch: 16 },
    { wch: 16 },
    { wch: 24 },
    { wch: 22 },
    { wch: 26 },
    { wch: 30 },
    { wch: 24 },
    { wch: 70 },
    { wch: 90 },
  ]

  XLSX.utils.book_append_sheet(workbook, rankingSheet, 'DSS Ranking')

  const actionRows = []

  sortedRiskRows.forEach((row) => {
    const decision = getDecisionSupport(row)

    if (!decision.actions.length) {
      actionRows.push([
        row.barangay,
        decision.priority,
        '',
        'No action plan available.',
      ])

      return
    }

    decision.actions.forEach((action, index) => {
      actionRows.push([
        row.barangay,
        decision.priority,
        index + 1,
        action,
      ])
    })
  })

  const actionSheet = XLSX.utils.aoa_to_sheet([
    ['Barangay', 'DSS Priority', 'Action No.', 'Recommended Action'],
    ...actionRows,
  ])

  actionSheet['!cols'] = [
    { wch: 30 },
    { wch: 26 },
    { wch: 12 },
    { wch: 100 },
  ]

  XLSX.utils.book_append_sheet(workbook, actionSheet, 'Action Plan')

  const rationaleRows = []

  sortedRiskRows.forEach((row) => {
    const decision = getDecisionSupport(row)

    if (!decision.rationale.length) {
      rationaleRows.push([
        row.barangay,
        decision.priority,
        'No rationale available.',
      ])

      return
    }

    decision.rationale.forEach((reason) => {
      rationaleRows.push([
        row.barangay,
        decision.priority,
        reason,
      ])
    })
  })

  const rationaleSheet = XLSX.utils.aoa_to_sheet([
    ['Barangay', 'DSS Priority', 'Decision Rationale'],
    ...rationaleRows,
  ])

  rationaleSheet['!cols'] = [
    { wch: 30 },
    { wch: 26 },
    { wch: 100 },
  ]

  XLSX.utils.book_append_sheet(workbook, rationaleSheet, 'Rationale')

  const prioritySheet = XLSX.utils.aoa_to_sheet([
    ['DSS Priority', 'Barangay Count'],
    ...priorityDistribution.map((item) => [
      item.priority,
      item.count,
    ]),
  ])

  prioritySheet['!cols'] = [
    { wch: 34 },
    { wch: 18 },
  ]

  XLSX.utils.book_append_sheet(workbook, prioritySheet, 'Priority Distribution')

  const sourceRows = Object.entries(sourceStatus || {}).map(([key, item = {}]) => [
    key,
    item.uploadedName || 'No file uploaded',
    item.badge || 'No status',
    Number(item.validCount || 0),
    Number(item.recordCount || 0),
  ])

  const sourceSheet = XLSX.utils.aoa_to_sheet([
    ['Dataset', 'Source/File', 'Status', 'Valid Records', 'Total Records'],
    ...sourceRows,
  ])

  sourceSheet['!cols'] = [
    { wch: 20 },
    { wch: 45 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
  ]

  XLSX.utils.book_append_sheet(workbook, sourceSheet, 'Source Readiness')

  XLSX.writeFile(workbook, 'weekly-dengue-decision-support-report.xlsx')
}

async function downloadPowerPointDeck({ dashboardStats = {}, riskRows, sourceStatus, generatedAt }) {
  const sortedRiskRows = getSortedRiskRows(riskRows)
  const { highRiskCount, moderateRiskCount, lowRiskCount } = getRiskCounts(sortedRiskRows)
  const decisionCounts = getDecisionCounts(sortedRiskRows)
  const priorityDistribution = getPriorityDistribution(sortedRiskRows)
  const topBarangays = sortedRiskRows.slice(0, 5)
  const topBarangay = sortedRiskRows[0]
  const topDecision = getDecisionSupport(topBarangay)
  const sources = Object.entries(sourceStatus || {}).slice(0, 8)

  const pptx = new pptxgen()

  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'Barangay-Level Dengue Outbreak Prevention System'
  pptx.subject = 'Weekly Dengue Decision Support Report'
  pptx.title = 'Weekly Dengue Decision Support Report'
  pptx.company = 'Caraga State University'
  pptx.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
    lang: 'en-US',
  }

  const COLORS = {
    navy: '172033',
    blue: '255F8F',
    blueDark: '1E4E75',
    lightBlue: 'EFF6FF',
    paleBlue: 'DBEAFE',
    red: 'C2410C',
    rose: 'FFF1F2',
    green: '047857',
    emerald: 'ECFDF5',
    amber: 'B45309',
    yellow: 'FFFBEB',
    slate: '64748B',
    line: 'DBE4EE',
    white: 'FFFFFF',
    bg: 'F8FAFC',
  }

  function getRiskPptColor(risk) {
    if (risk === 'High') return COLORS.red
    if (risk === 'Moderate') return COLORS.amber
    if (risk === 'Low') return COLORS.green
    return COLORS.slate
  }

  function getRiskPptFill(risk) {
    if (risk === 'High') return COLORS.rose
    if (risk === 'Moderate') return COLORS.yellow
    if (risk === 'Low') return COLORS.emerald
    return COLORS.bg
  }

  function getPriorityPptColor(priority) {
    const value = String(priority || '').toLowerCase()

    if (value.includes('immediate') || value.includes('high priority')) return COLORS.red
    if (value.includes('escalated') || value.includes('preventive')) return COLORS.amber
    if (value.includes('routine')) return COLORS.green

    return COLORS.blue
  }

  function getPriorityPptFill(priority) {
    const value = String(priority || '').toLowerCase()

    if (value.includes('immediate') || value.includes('high priority')) return COLORS.rose
    if (value.includes('escalated') || value.includes('preventive')) return COLORS.yellow
    if (value.includes('routine')) return COLORS.emerald

    return COLORS.lightBlue
  }

  function addTopBar(slide) {
    slide.addText('', {
      x: 0,
      y: 0,
      w: 13.33,
      h: 0.16,
      margin: 0,
      fill: { color: COLORS.blue },
      line: { color: COLORS.blue },
    })
  }

  function addFooter(slide) {
    slide.addText(generatedAt, {
      x: 9.2,
      y: 7.05,
      w: 3.4,
      h: 0.25,
      fontSize: 8,
      color: COLORS.slate,
      align: 'right',
      margin: 0,
    })
  }

  function addSlideTitle(slide, title, subtitle = '') {
    slide.background = { color: COLORS.bg }
    addTopBar(slide)

    slide.addText(title, {
      x: 0.6,
      y: 0.42,
      w: 8.8,
      h: 0.42,
      fontSize: 25,
      bold: true,
      color: COLORS.navy,
      margin: 0,
    })

    if (subtitle) {
      slide.addText(subtitle, {
        x: 0.62,
        y: 0.9,
        w: 9.8,
        h: 0.28,
        fontSize: 10.5,
        color: COLORS.slate,
        margin: 0,
      })
    }

    addFooter(slide)
  }

  function addMetricCard(slide, label, value, x, y, fill, accent) {
    slide.addText(label.toUpperCase(), {
      x,
      y,
      w: 2.55,
      h: 0.3,
      fontSize: 8.5,
      bold: true,
      color: accent,
      margin: 0.12,
      fill: { color: fill },
      line: { color: fill },
    })

    slide.addText(String(value), {
      x,
      y: y + 0.34,
      w: 2.55,
      h: 0.62,
      fontSize: 24,
      bold: true,
      color: COLORS.navy,
      margin: 0.14,
      fill: { color: COLORS.white },
      line: { color: COLORS.line },
      fit: 'shrink',
    })
  }

  const titleSlide = pptx.addSlide()
  titleSlide.background = { color: COLORS.lightBlue }

  titleSlide.addText('', {
    x: 0,
    y: 0,
    w: 13.33,
    h: 7.5,
    margin: 0,
    fill: { color: COLORS.lightBlue },
    line: { color: COLORS.lightBlue },
  })

  titleSlide.addText('', {
    x: 0,
    y: 0,
    w: 13.33,
    h: 0.18,
    margin: 0,
    fill: { color: COLORS.blue },
    line: { color: COLORS.blue },
  })

  titleSlide.addText('DENGUE DECISION SUPPORT', {
    x: 0.8,
    y: 1.15,
    w: 10.5,
    h: 0.38,
    fontSize: 17,
    bold: true,
    color: COLORS.blue,
    margin: 0,
    charSpace: 1.5,
  })

  titleSlide.addText('Weekly Response Briefing', {
    x: 0.8,
    y: 1.7,
    w: 11.2,
    h: 0.85,
    fontSize: 42,
    bold: true,
    color: COLORS.navy,
    margin: 0,
    fit: 'shrink',
  })

  titleSlide.addText('Barangay-Level Dengue Outbreak Prevention System', {
    x: 0.82,
    y: 2.72,
    w: 10.8,
    h: 0.4,
    fontSize: 16,
    color: COLORS.slate,
    margin: 0,
  })

  titleSlide.addText(`Generated: ${generatedAt}`, {
    x: 0.82,
    y: 3.22,
    w: 7.5,
    h: 0.32,
    fontSize: 11.5,
    color: COLORS.slate,
    margin: 0,
  })

  titleSlide.addText('CHO Review  •  Barangay Coordination  •  Response Planning', {
    x: 0.82,
    y: 5.82,
    w: 8.8,
    h: 0.34,
    fontSize: 12.5,
    bold: true,
    color: COLORS.blueDark,
    margin: 0,
  })

  titleSlide.addText('', {
    x: 9.8,
    y: 1.12,
    w: 2.55,
    h: 4.9,
    margin: 0,
    fill: { color: COLORS.white, transparency: 10 },
    line: { color: COLORS.paleBlue },
  })

  titleSlide.addText('DSS\nReport', {
    x: 10.1,
    y: 2.35,
    w: 1.95,
    h: 0.9,
    fontSize: 24,
    bold: true,
    align: 'center',
    color: COLORS.blue,
    margin: 0.05,
    fit: 'shrink',
  })

  const summarySlide = pptx.addSlide()
  addSlideTitle(
    summarySlide,
    'Decision Summary',
    'Key monitoring and decision-support indicators from the current workspace.'
  )

  addMetricCard(
    summarySlide,
    'Total cases',
    formatNumber(dashboardStats.totalCases),
    0.7,
    1.45,
    COLORS.lightBlue,
    COLORS.blue
  )

  addMetricCard(
    summarySlide,
    'DSS alerts',
    formatNumber(decisionCounts.urgent),
    3.55,
    1.45,
    COLORS.rose,
    COLORS.red
  )

  addMetricCard(
    summarySlide,
    'Forecast total',
    formatNumber(dashboardStats.fourWeekForecast),
    6.4,
    1.45,
    COLORS.yellow,
    COLORS.amber
  )

  addMetricCard(
    summarySlide,
    'Data quality',
    `${dashboardStats.dataQuality}%`,
    9.25,
    1.45,
    COLORS.emerald,
    COLORS.green
  )

  summarySlide.addText('Risk Distribution', {
    x: 0.72,
    y: 3.18,
    w: 4.5,
    h: 0.3,
    fontSize: 17,
    bold: true,
    color: COLORS.navy,
    margin: 0,
  })

  summarySlide.addTable(
    [
      ['Risk Level', 'Barangay Count'],
      ['High', highRiskCount],
      ['Moderate', moderateRiskCount],
      ['Low', lowRiskCount],
    ],
    {
      x: 0.72,
      y: 3.66,
      w: 5.4,
      h: 1.55,
      fontSize: 12,
      color: COLORS.navy,
      border: { color: COLORS.line, pt: 1 },
      fill: { color: COLORS.white },
      margin: 0.08,
    }
  )

  summarySlide.addText('Decision Guidance', {
    x: 6.72,
    y: 3.18,
    w: 4.5,
    h: 0.3,
    fontSize: 17,
    bold: true,
    color: COLORS.navy,
    margin: 0,
  })

  summarySlide.addText(
    getTopDecisionText(topBarangay),
    {
      x: 6.72,
      y: 3.66,
      w: 5.72,
      h: 1.55,
      fontSize: 13.2,
      bold: true,
      color: COLORS.navy,
      margin: 0.2,
      fill: { color: COLORS.yellow },
      line: { color: 'FDE68A' },
      fit: 'shrink',
    }
  )

  const prioritySlide = pptx.addSlide()
  addSlideTitle(
    prioritySlide,
    'DSS Priority Barangays',
    'Top barangays ranked by DSS priority, decision score, risk level, and projected dengue cases.'
  )

  prioritySlide.addTable(
    [
      ['Rank', 'Barangay', 'Risk', 'DSS Priority', 'Score', 'Projected'],
      ...(topBarangays.length > 0
        ? topBarangays.map((row, index) => {
            const decision = getDecisionSupport(row)

            return [
              index + 1,
              row.barangay,
              row.risk,
              decision.priority,
              formatNumber(decision.score),
              formatNumber(row.forecast),
            ]
          })
        : [['-', 'No barangay DSS data available', '-', '-', '-', '-']]),
    ],
    {
      x: 0.65,
      y: 1.35,
      w: 12,
      h: 2.85,
      fontSize: 10,
      color: COLORS.navy,
      border: { color: COLORS.line, pt: 1 },
      fill: { color: COLORS.white },
      margin: 0.08,
    }
  )

  prioritySlide.addText('Priority Snapshot', {
    x: 0.65,
    y: 4.65,
    w: 4,
    h: 0.3,
    fontSize: 17,
    bold: true,
    color: COLORS.navy,
    margin: 0,
  })

  topBarangays.forEach((row, index) => {
    const decision = getDecisionSupport(row)

    prioritySlide.addText(row.risk || 'Unknown', {
      x: 0.65 + index * 2.42,
      y: 5.1,
      w: 2.05,
      h: 0.34,
      fontSize: 9.5,
      bold: true,
      align: 'center',
      color: getRiskPptColor(row.risk),
      margin: 0.05,
      fill: { color: getRiskPptFill(row.risk) },
      line: { color: getRiskPptColor(row.risk) },
      fit: 'shrink',
    })

    prioritySlide.addText(decision.priority || 'Decision pending', {
      x: 0.65 + index * 2.42,
      y: 5.48,
      w: 2.05,
      h: 0.44,
      fontSize: 8.5,
      bold: true,
      align: 'center',
      color: getPriorityPptColor(decision.priority),
      margin: 0.04,
      fill: { color: getPriorityPptFill(decision.priority) },
      line: { color: getPriorityPptColor(decision.priority) },
      fit: 'shrink',
    })

    prioritySlide.addText(row.barangay || 'Unknown', {
      x: 0.65 + index * 2.42,
      y: 5.98,
      w: 2.05,
      h: 0.52,
      fontSize: 10,
      bold: true,
      align: 'center',
      color: COLORS.navy,
      margin: 0.08,
      fill: { color: COLORS.white },
      line: { color: COLORS.line },
      fit: 'shrink',
    })
  })

  const actionSlide = pptx.addSlide()
  addSlideTitle(
    actionSlide,
    'Top Response Plan',
    topBarangay
      ? `${topBarangay.barangay} is currently the top DSS priority.`
      : 'No top response plan is available yet.'
  )

  actionSlide.addText(topDecision.summary || 'No DSS recommendation available yet.', {
    x: 0.78,
    y: 1.25,
    w: 11.85,
    h: 0.8,
    fontSize: 15,
    bold: true,
    color: COLORS.navy,
    margin: 0.16,
    fill: { color: COLORS.yellow },
    line: { color: 'FDE68A' },
    fit: 'shrink',
  })

  const actions =
    topDecision.actions?.length > 0
      ? topDecision.actions.slice(0, 5)
      : ['No action plan available yet.']

  actions.forEach((action, index) => {
    actionSlide.addText(String(index + 1), {
      x: 0.85,
      y: 2.35 + index * 0.78,
      w: 0.42,
      h: 0.42,
      fontSize: 14,
      bold: true,
      align: 'center',
      color: COLORS.white,
      margin: 0.05,
      fill: { color: COLORS.blue },
      line: { color: COLORS.blue },
    })

    actionSlide.addText(action, {
      x: 1.45,
      y: 2.28 + index * 0.78,
      w: 10.55,
      h: 0.56,
      fontSize: 12.5,
      color: COLORS.navy,
      margin: 0.12,
      fill: { color: COLORS.white },
      line: { color: COLORS.line },
      fit: 'shrink',
    })
  })

  const sourceSlide = pptx.addSlide()
  addSlideTitle(
    sourceSlide,
    'Data Source Readiness',
    'Validation status of uploaded or available datasets.'
  )

  sourceSlide.addTable(
    [
      ['Dataset', 'Source/File', 'Status', 'Valid Records'],
      ...(sources.length > 0
        ? sources.map(([key, item = {}]) => [
            key,
            item.uploadedName || 'No file uploaded',
            item.badge || 'No status',
            `${formatNumber(item.validCount || 0)} / ${formatNumber(item.recordCount || 0)}`,
          ])
        : [['-', 'No source status available', '-', '-']]),
    ],
    {
      x: 0.65,
      y: 1.35,
      w: 12,
      h: 4.4,
      fontSize: 10,
      color: COLORS.navy,
      border: { color: COLORS.line, pt: 1 },
      fill: { color: COLORS.white },
      margin: 0.08,
    }
  )

  sourceSlide.addText('DSS Priority Distribution', {
    x: 0.65,
    y: 6.04,
    w: 3.5,
    h: 0.3,
    fontSize: 15,
    bold: true,
    color: COLORS.navy,
    margin: 0,
  })

  sourceSlide.addText(
    priorityDistribution.length > 0
      ? priorityDistribution
          .map((item) => `${item.priority}: ${item.count}`)
          .join('  •  ')
      : 'No DSS priority data available yet.',
    {
      x: 4.05,
      y: 5.96,
      w: 8.15,
      h: 0.6,
      fontSize: 10.5,
      color: COLORS.slate,
      margin: 0.08,
      fill: { color: COLORS.white },
      line: { color: COLORS.line },
      fit: 'shrink',
    }
  )

  await pptx.writeFile({
    fileName: 'weekly-dengue-decision-support-report.pptx',
  })
}

function StatCard({ label, value, helper, icon: Icon, tone = 'blue' }) {
  const toneMap = {
    blue: {
      iconWrap:
        'border-blue-100 bg-blue-50 text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
      glow: 'from-blue-50/90 to-white dark:from-blue-500/10 dark:to-slate-900',
    },
    rose: {
      iconWrap:
        'border-rose-100 bg-rose-50 text-brand-red dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
      glow: 'from-rose-50/90 to-white dark:from-rose-500/10 dark:to-slate-900',
    },
    emerald: {
      iconWrap:
        'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
      glow: 'from-emerald-50/90 to-white dark:from-emerald-500/10 dark:to-slate-900',
    },
    amber: {
      iconWrap:
        'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
      glow: 'from-amber-50/90 to-white dark:from-amber-500/10 dark:to-slate-900',
    },
  }

  const style = toneMap[tone] || toneMap.blue

  return (
    <div
      className={`group relative overflow-hidden rounded-[26px] border border-brand-line/70 bg-gradient-to-br ${style.glow} p-5 shadow-[0_16px_36px_rgba(15,23,42,0.07)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_22px_46px_rgba(15,23,42,0.11)] dark:border-slate-800 dark:bg-slate-900`}
    >
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/60 blur-2xl dark:bg-white/5" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-muted dark:text-slate-400">
            {label}
          </p>

          <h3 className="mt-3 break-words text-3xl font-black tracking-tight text-brand-text dark:text-slate-100">
            {value}
          </h3>

          <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
            {helper}
          </p>
        </div>

        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border shadow-sm ${style.iconWrap}`}
        >
          <Icon className="h-6 w-6" strokeWidth={2.2} />
        </div>
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const [format, setFormat] = useState('pdf')
  const [showAllPriorityBarangays, setShowAllPriorityBarangays] = useState(false)
  const [expandedPriorityBarangay, setExpandedPriorityBarangay] = useState(null)

  const {
    dashboardStats = {},
    riskRows = [],
    sourceStatus = {},
    activityLogs = [],
    addActivityLog,
  } = useData()

  const generatedAt = getCurrentDateTime()

  const sortedRiskRows = useMemo(() => {
    return getSortedRiskRows(riskRows)
  }, [riskRows])

  const decisionCounts = getDecisionCounts(sortedRiskRows)
  const priorityDistribution = getPriorityDistribution(sortedRiskRows)
  const topBarangays = sortedRiskRows.slice(0, 5)
  const visibleTopBarangays = showAllPriorityBarangays
    ? topBarangays
    : topBarangays.slice(0, 3)

  const topBarangay = sortedRiskRows[0]
  const topDecision = getDecisionSupport(topBarangay)

  const selectedExport = exportFormats.find((item) => item.id === format) || exportFormats[0]
  const SelectedExportIcon = selectedExport.icon

  const reportSummary = useMemo(() => {
    return getReportSummary({
      sortedRiskRows,
      dashboardStats,
    })
  }, [sortedRiskRows, dashboardStats])

  async function handleExport() {
    const title = 'Weekly Dengue Decision Support Report'
    const exportedAt = getCurrentDateTime()

    if (format === 'pdf') {
      downloadPdfReport({
        dashboardStats,
        riskRows: sortedRiskRows,
        sourceStatus,
        generatedAt: exportedAt,
        title,
      })

      addActivityLog?.('Report exported', 'PDF decision-support report downloaded directly.')
      return
    }

    if (format === 'excel') {
      downloadExcelWorkbook({
        dashboardStats,
        riskRows: sortedRiskRows,
        sourceStatus,
        generatedAt: exportedAt,
      })

      addActivityLog?.('Report exported', 'Excel decision-support workbook downloaded as an XLSX file.')
      return
    }

    if (format === 'powerpoint') {
      await downloadPowerPointDeck({
        dashboardStats,
        riskRows: sortedRiskRows,
        sourceStatus,
        generatedAt: exportedAt,
      })

      addActivityLog?.(
        'Report exported',
        'PowerPoint decision-support briefing deck generated and downloaded as a PPTX file.'
      )

      return
    }

    openPrintableReport({
      dashboardStats,
      riskRows: sortedRiskRows,
      sourceStatus,
      generatedAt: exportedAt,
      title,
    })

    addActivityLog?.('Print view opened', 'Printable decision-support report opened for manual printing.')
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Reports and Export"
        subtitle="Decision-ready outputs for CHO review, barangay coordination, and response planning."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total cases"
          value={formatNumber(dashboardStats.totalCases)}
          helper="Recorded cases in workspace"
          icon={Database}
          tone="blue"
        />

        <StatCard
          label="DSS alerts"
          value={formatNumber(decisionCounts.urgent)}
          helper="Immediate, high, or escalated priorities"
          icon={ShieldAlert}
          tone="rose"
        />

        <StatCard
          label="Forecast total"
          value={formatNumber(dashboardStats.fourWeekForecast)}
          helper="Projected four-week cases"
          icon={BarChart3}
          tone="amber"
        />

        <StatCard
          label="Data quality"
          value={`${dashboardStats.dataQuality || 0}%`}
          helper="Validated data readiness score"
          icon={CheckCircle2}
          tone="emerald"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_0.85fr]">
        <div className="rounded-[30px] border border-brand-line/70 bg-white/90 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                <Sparkles className="h-3.5 w-3.5" />
                Decision brief
              </div>

              <h3 className="text-xl font-black tracking-tight text-brand-text dark:text-slate-100">
                Weekly decision-support brief
              </h3>

              <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                Planning-ready report based on forecast, risk level, DSS priority, and recommended actions.
              </p>
            </div>

            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
              <CalendarDays className="h-3.5 w-3.5" />
              {generatedAt}
            </span>
          </div>

          <div className="mt-5 rounded-[24px] border border-brand-line bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-slate-900">
            <h4 className="flex items-center gap-2 text-lg font-black text-brand-text dark:text-slate-100">
              <ClipboardList className="h-5 w-5 text-brand-blue" />
              Decision summary
            </h4>

            <div className="mt-4 space-y-3">
              {reportSummary.map((item, index) => (
                <div
                  key={item}
                  className="flex items-start gap-3 rounded-[18px] border border-slate-100 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-blue text-xs font-bold text-white">
                    {index + 1}
                  </div>

                  <p className="text-sm leading-6 text-brand-text dark:text-slate-300">
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div
  id="priority-barangays"
  className="scroll-mt-28 mt-5 rounded-[24px] border border-brand-line bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
>
  <h4 className="flex items-center gap-2 text-lg font-black text-brand-text dark:text-slate-100">
    <MapPin className="h-5 w-5 text-brand-red" />
    Priority barangays
  </h4>

            <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
              Showing the most important decision indicators first. Open details only when needed.
            </p>

            <div className="mt-4 space-y-3">
              {visibleTopBarangays.length > 0 ? (
                <>
                  {visibleTopBarangays.map((row, index) => {
                    const decision = getDecisionSupport(row)
                    const isExpanded = expandedPriorityBarangay === row.barangay

                    return (
                      <div
                        key={`${row.barangay}-${index}`}
                        className="group rounded-[22px] border border-brand-line bg-gradient-to-r from-slate-50 to-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:from-slate-950 dark:to-slate-900"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-sm font-black text-brand-text shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700">
                              #{index + 1}
                            </div>

                            <div className="min-w-0">
                              <p className="break-words font-bold text-brand-text dark:text-slate-100">
                                {row.barangay}
                              </p>

                              <p className="text-xs leading-5 text-brand-muted dark:text-slate-400">
                                {formatNumber(row.forecast)} projected cases
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <span className={`w-fit rounded-full border px-3 py-1 text-xs font-bold ${getRiskBadgeStyle(row.risk)}`}>
                              {row.risk || 'Unknown'}
                            </span>

                            <span className={`w-fit rounded-full border px-3 py-1 text-xs font-bold ${getPriorityBadgeStyle(decision.priority)}`}>
                              {decision.priority}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs font-semibold text-brand-muted dark:text-slate-500">
                            DSS score: {formatNumber(decision.score)} points
                          </p>

                          <button
                            type="button"
                            onClick={() => {
                              setExpandedPriorityBarangay(isExpanded ? null : row.barangay)
                            }}
                            className="inline-flex w-fit items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-brand-text shadow-sm transition hover:border-brand-blue/30 hover:text-brand-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-blue-300"
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
                          <div className="mt-4 rounded-[20px] border border-slate-100 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-950/70">
                            <div className="grid gap-2 sm:grid-cols-2">
                              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-brand-muted dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                Historical: {formatNumber(row.totalCases)} cases
                              </span>

                              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-brand-muted dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                Current: {formatNumber(row.currentCases || 0)} cases
                              </span>
                            </div>

                            <div className="mt-4 rounded-[18px] border border-blue-100 bg-blue-50 px-4 py-3 dark:border-blue-500/20 dark:bg-blue-500/10">
                              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-blue dark:text-blue-300">
                                DSS recommendation
                              </p>

                              <p className="mt-1 text-sm leading-6 text-brand-text dark:text-slate-300">
                                {decision.summary}
                              </p>
                            </div>

                            {decision.actions.length > 0 && (
                              <div className="mt-3 rounded-[18px] border border-amber-100 bg-amber-50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10">
                                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-orange dark:text-amber-300">
                                  Action plan
                                </p>

                                <div className="mt-3 space-y-2">
                                  {decision.actions.slice(0, 3).map((action, actionIndex) => (
                                    <div
                                      key={`${action}-${actionIndex}`}
                                      className="flex gap-2 text-sm leading-6 text-brand-text dark:text-slate-300"
                                    >
                                      <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-black text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                                        {actionIndex + 1}
                                      </span>

                                      <span>{action}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {decision.rationale.length > 0 && (
                              <div className="mt-3 rounded-[18px] border border-emerald-100 bg-emerald-50 px-4 py-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-green dark:text-emerald-300">
                                  Why this priority
                                </p>

                                <div className="mt-3 space-y-2">
                                  {decision.rationale.slice(0, 3).map((reason, reasonIndex) => (
                                    <div
                                      key={`${reason}-${reasonIndex}`}
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
                        )}
                      </div>
                    )
                  })}

                  {topBarangays.length > 3 && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAllPriorityBarangays((current) => !current)
                        setExpandedPriorityBarangay(null)
                      }}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-brand-line bg-white px-4 py-3 text-sm font-bold text-brand-text shadow-sm transition hover:border-brand-blue/30 hover:text-brand-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-blue-300"
                    >
                      {showAllPriorityBarangays
                        ? 'Show less barangays'
                        : `Show all ${topBarangays.length} barangays`}

                      {showAllPriorityBarangays ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </>
              ) : (
                <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm leading-6 text-brand-muted dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                  No priority barangay data available.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-[30px] border border-brand-line/70 bg-white/90 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
            <Download className="h-3.5 w-3.5" />
            Export center
          </div>

          <h3 className="text-xl font-black tracking-tight text-brand-text dark:text-slate-100">
            Export options
          </h3>

          <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
            Select the output format, then generate the decision-support report.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {exportFormats.map((item) => {
              const Icon = item.icon

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFormat(item.id)}
                  className={`group rounded-[22px] border p-4 text-left text-sm font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                    format === item.id
                      ? 'ring-2 ring-brand-blue ring-offset-2 dark:ring-offset-slate-900'
                      : ''
                  } ${item.style}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/70 shadow-sm dark:bg-white/10">
                      <Icon className="h-5 w-5" />
                    </div>

                    <div>
                      <span>{item.label}</span>

                      <span className="mt-1 block text-xs font-medium leading-5 opacity-75">
                        {item.desc}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-5 rounded-[22px] border border-brand-line bg-gradient-to-r from-slate-50 to-white p-4 text-sm text-brand-muted shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-slate-900 dark:text-slate-400">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${selectedExport.style}`}
              >
                <SelectedExportIcon className="h-5 w-5" />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                  Selected output
                </p>

                <p className="font-bold text-brand-text dark:text-slate-100">
                  {selectedExport.label}
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExport}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[22px] bg-brand-blue px-4 py-3.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(37,95,143,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#255f8f] hover:shadow-[0_16px_34px_rgba(37,95,143,0.34)]"
          >
            <Download className="h-4 w-4" />
            Generate selected output
          </button>

          <div className="mt-5 rounded-[24px] border border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm dark:border-amber-500/20 dark:from-amber-500/10 dark:to-slate-900">
            <p className="flex items-center gap-2 text-sm font-bold text-brand-orange dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              Export note
            </p>

            <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
              PDF, Excel, PowerPoint, and print reports now include DSS priority, decision score, recommended action plan, and decision rationale.
            </p>
          </div>

          <div className="mt-5 rounded-[24px] border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
            <p className="text-sm font-bold text-brand-text dark:text-slate-100">
              DSS priority distribution
            </p>

            <div className="mt-3 space-y-2">
              {priorityDistribution.length > 0 ? (
                priorityDistribution.map((item) => (
                  <div
                    key={item.priority}
                    className="flex items-center justify-between gap-3 rounded-[18px] border border-slate-100 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${getPriorityBadgeStyle(item.priority)}`}>
                      {item.priority}
                    </span>

                    <span className="text-xs font-black text-brand-text dark:text-slate-100">
                      {formatNumber(item.count)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-brand-muted dark:text-slate-400">
                  DSS priority distribution will appear after dengue records are loaded.
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 rounded-[24px] border border-amber-100 bg-amber-50/80 p-5 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/10">
            <h4 className="flex items-center gap-2 text-lg font-black text-brand-orange dark:text-amber-300">
              <ShieldAlert className="h-5 w-5" />
              Top response plan
            </h4>

            {topBarangay ? (
              <div className="mt-4 space-y-3">
                <div>
                  <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${getPriorityBadgeStyle(topDecision.priority)}`}>
                    {topDecision.priority}
                  </span>

                  <p className="mt-3 text-sm font-semibold leading-6 text-brand-text dark:text-slate-200">
                    {topDecision.summary}
                  </p>
                </div>

                {topDecision.actions.length > 0 && (
                  <div className="rounded-[18px] border border-white/70 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-950/70">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400">
                      Action plan
                    </p>

                    <div className="mt-3 space-y-2">
                      {topDecision.actions.slice(0, 5).map((action, index) => (
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

                {topDecision.rationale.length > 0 && (
                  <div className="rounded-[18px] border border-white/70 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-950/70">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400">
                      Why this recommendation
                    </p>

                    <div className="mt-3 space-y-2">
                      {topDecision.rationale.slice(0, 4).map((reason, index) => (
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
                The response plan will appear after dengue records are uploaded and risk rows are computed.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.7fr_1fr]">
        <div className="rounded-[30px] border border-brand-line/70 bg-white/90 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
            <Send className="h-3.5 w-3.5" />
            Distribution
          </div>

          <h3 className="text-xl font-black tracking-tight text-brand-text dark:text-slate-100">
            Distribution list
          </h3>

          <div className="mt-4 space-y-3">
            {distributionItems.map((item) => {
              const Icon = item.icon

              return (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-3 rounded-[22px] border border-brand-line bg-gradient-to-r from-slate-50 to-white px-4 py-3.5 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-slate-900"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-blue shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:text-blue-300 dark:ring-slate-700">
                      <Icon className="h-5 w-5" />
                    </div>

                    <span className="text-sm font-semibold text-brand-text dark:text-slate-100">
                      {item.label}
                    </span>
                  </div>

                  <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-bold text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                    Included
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-[30px] border border-brand-line/70 bg-white/90 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <Database className="h-3.5 w-3.5" />
            Source readiness
          </div>

          <h3 className="text-xl font-black tracking-tight text-brand-text dark:text-slate-100">
            Data source readiness
          </h3>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
  {Object.entries(sourceStatus || {}).length > 0 ? (
    Object.entries(sourceStatus || {}).map(([key, item = {}]) => (
      <div
        key={key}
        className="min-w-0 rounded-[22px] border border-brand-line bg-gradient-to-r from-slate-50 to-white p-4 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-slate-900"
      >
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold capitalize text-brand-text dark:text-slate-100">
              {key}
            </p>

            <p className="mt-2 max-w-full break-all text-xs leading-5 text-brand-muted dark:text-slate-400">
              {item.uploadedName || 'No file uploaded'}
            </p>
          </div>

          <span
            className={`w-fit shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${getStatusStyle(item.badge)}`}
          >
            {item.badge || 'No status'}
          </span>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-100 bg-white px-3 py-2 text-xs font-semibold text-brand-muted dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          {formatNumber(item.validCount || 0)} valid of {formatNumber(item.recordCount || 0)} records
        </div>
      </div>
    ))
  ) : (
    <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-brand-muted dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 lg:col-span-2">
      No source status available yet.
    </div>
  )}
</div>
        </div>
      </div>

      <div className="rounded-[30px] border border-brand-line/70 bg-white/90 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <Activity className="h-3.5 w-3.5" />
          Activity
        </div>

        <h3 className="text-xl font-black tracking-tight text-brand-text dark:text-slate-100">
          Recent report activity
        </h3>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {(activityLogs || []).slice(0, 3).length > 0 ? (
            (activityLogs || []).slice(0, 3).map((log) => (
              <div
                key={log.id}
                className="rounded-[22px] border border-slate-100 bg-gradient-to-r from-slate-50 to-white p-4 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-slate-900"
              >
                <p className="text-sm font-bold text-brand-text dark:text-slate-100">
                  {log.action}
                </p>

                <p className="mt-1 text-xs text-brand-muted dark:text-slate-500">
                  {new Date(log.timestamp).toLocaleString()}
                </p>

                <p className="mt-2 text-sm leading-6 text-brand-muted dark:text-slate-400">
                  {log.details}
                </p>
              </div>
            ))
          ) : (
            <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-brand-muted dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 lg:col-span-3">
              No recent report activity yet.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}