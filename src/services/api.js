const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

async function handleApiResponse(response) {
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      data?.detail?.message ||
      data?.detail ||
      data?.message ||
      `Request failed with status ${response.status}`

    throw new Error(typeof message === 'string' ? message : JSON.stringify(message))
  }

  return data
}

function buildFileFormData(file) {
  const formData = new FormData()
  formData.append('file', file)
  return formData
}

export async function checkBackendHealth() {
  const response = await fetch(`${API_BASE_URL}/health`)
  return handleApiResponse(response)
}

export async function inspectUploadedFile(file) {
  const response = await fetch(`${API_BASE_URL}/uploads/inspect`, {
    method: 'POST',
    body: buildFileFormData(file),
  })

  return handleApiResponse(response)
}

export async function cleanDengueFile(file) {
  const response = await fetch(`${API_BASE_URL}/uploads/clean-dengue`, {
    method: 'POST',
    body: buildFileFormData(file),
  })

  return handleApiResponse(response)
}

export async function summarizeDengueFile(file) {
  const response = await fetch(`${API_BASE_URL}/uploads/summarize-dengue`, {
    method: 'POST',
    body: buildFileFormData(file),
  })

  return handleApiResponse(response)
}

export async function forecastDengueFile(file) {
  const response = await fetch(`${API_BASE_URL}/uploads/forecast-dengue`, {
    method: 'POST',
    body: buildFileFormData(file),
  })

  return handleApiResponse(response)
}

export async function validatePopulationFile(file) {
  const response = await fetch(`${API_BASE_URL}/uploads/validate-population`, {
    method: 'POST',
    body: buildFileFormData(file),
  })

  return handleApiResponse(response)
}

export async function validateWeatherFile(file) {
  const response = await fetch(`${API_BASE_URL}/uploads/validate-weather`, {
    method: 'POST',
    body: buildFileFormData(file),
  })

  return handleApiResponse(response)
}

export async function validateBoundaryFile(file) {
  const response = await fetch(`${API_BASE_URL}/uploads/validate-boundary`, {
    method: 'POST',
    body: buildFileFormData(file),
  })

  return handleApiResponse(response)
}

export async function getUploadDatabaseStatus() {
  const response = await fetch(`${API_BASE_URL}/uploads/database-status`)
  return handleApiResponse(response)
}

export async function getBackendIntegrationStatus() {
  const response = await fetch(`${API_BASE_URL}/integration/status`)
  return handleApiResponse(response)
}

export async function buildBackendIntegrationDataset() {
  const response = await fetch(`${API_BASE_URL}/integration/build-dataset`, {
    method: 'POST',
  })

  return handleApiResponse(response)
}

export async function resetBackendIntegrationWorkspace() {
  const response = await fetch(`${API_BASE_URL}/integration/reset`, {
    method: 'DELETE',
  })

  return handleApiResponse(response)
}

export async function getLatestBackendIntegrationDataset() {
  const response = await fetch(`${API_BASE_URL}/integration/latest-dataset`)
  return handleApiResponse(response)
}


export async function getBackendAlignmentReport() {
  const response = await fetch(`${API_BASE_URL}/integration/alignment-report`)
  return handleApiResponse(response)
}




export async function getGeospatialHotspots({
  radiusKm = 3,
  fallbackNearestCount = 3,
} = {}) {
  const params = new URLSearchParams({
    radius_km: String(radiusKm),
    fallback_nearest_count: String(fallbackNearestCount),
  })

  const response = await fetch(`${API_BASE_URL}/geospatial/hotspots?${params.toString()}`)
  return handleApiResponse(response)
}

export async function getBackendNotifications() {
  const response = await fetch(`${API_BASE_URL}/notifications`)
  return handleApiResponse(response)
}

export async function createBackendNotificationEvent({
  title,
  message,
  severity = 'info',
  category = 'system_event',
  to = '/dashboard',
  hash = 'dashboard-summary',
  meta = {},
}) {
  const response = await fetch(`${API_BASE_URL}/notifications/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      message,
      severity,
      category,
      to,
      hash,
      meta,
    }),
  })

  return handleApiResponse(response)
}

export async function getDecisionActions({ status = '', barangay = '' } = {}) {
  const params = new URLSearchParams()

  if (status) params.set('status', status)
  if (barangay) params.set('barangay', barangay)

  const query = params.toString()
  const response = await fetch(`${API_BASE_URL}/decision-actions${query ? `?${query}` : ''}`)
  return handleApiResponse(response)
}

export async function createDecisionAction(payload) {
  const response = await fetch(`${API_BASE_URL}/decision-actions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return handleApiResponse(response)
}

export async function updateDecisionAction(actionId, payload) {
  const response = await fetch(`${API_BASE_URL}/decision-actions/${actionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return handleApiResponse(response)
}

export async function deleteDecisionAction(actionId) {
  const response = await fetch(`${API_BASE_URL}/decision-actions/${actionId}`, {
    method: 'DELETE',
  })

  return handleApiResponse(response)
}

export async function getLatestSavedForecast() {
  const response = await fetch(`${API_BASE_URL}/forecast/latest`)
  return handleApiResponse(response)
}

export async function getLatestSavedBoundaryGeoJson() {
  const response = await fetch(`${API_BASE_URL}/uploads/latest-boundary-geojson`)
  return handleApiResponse(response)
}

export { API_BASE_URL }