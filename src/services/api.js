const configuredApiUrl = import.meta.env.VITE_API_BASE_URL?.trim()

const API_BASE_URL = (
  configuredApiUrl ||
  `${window.location.protocol}//${window.location.hostname}:8000`
).replace(/\/+$/, '')

function getAuthToken() {
  try {
    const session = JSON.parse(localStorage.getItem('dengue-auth-session') || '{}')
    return session?.accessToken || session?.access_token || ''
  } catch {
    return ''
  }
}

function withAuthHeaders(options = {}) {
  const token = getAuthToken()
  const headers = { ...(options.headers || {}) }

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`
  }

  return {
    ...options,
    headers,
  }
}

function apiFetch(url, options = {}) {
  return fetch(url, withAuthHeaders(options))
}

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



function fetchWithTimeout(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)

  return fetch(url, withAuthHeaders({
    ...options,
    signal: controller.signal,
  })).finally(() => {
    window.clearTimeout(timer)
  })
}

function buildFileFormData(file) {
  const formData = new FormData()
  formData.append('file', file)
  return formData
}

export async function checkBackendHealth() {
  const response = await apiFetch(`${API_BASE_URL}/health`)
  return handleApiResponse(response)
}

export async function inspectUploadedFile(file) {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/uploads/inspect`,
    {
      method: 'POST',
      body: buildFileFormData(file),
    },
    180000
  )

  return handleApiResponse(response)
}

export async function cleanDengueFile(file) {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/uploads/clean-dengue`,
    {
      method: 'POST',
      body: buildFileFormData(file),
    },
    180000
  )

  return handleApiResponse(response)
}

export async function summarizeDengueFile(file) {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/uploads/summarize-dengue`,
    {
      method: 'POST',
      body: buildFileFormData(file),
    },
    180000
  )

  return handleApiResponse(response)
}

export async function forecastDengueFile(file) {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/uploads/forecast-dengue`,
    {
      method: 'POST',
      body: buildFileFormData(file),
    },
    180000
  )

  return handleApiResponse(response)
}

export async function validatePopulationFile(file) {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/uploads/validate-population`,
    {
      method: 'POST',
      body: buildFileFormData(file),
    },
    180000
  )

  return handleApiResponse(response)
}

export async function validateWeatherFile(file) {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/uploads/validate-weather`,
    {
      method: 'POST',
      body: buildFileFormData(file),
    },
    180000
  )

  return handleApiResponse(response)
}

export async function validateBoundaryFile(file) {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/uploads/validate-boundary`,
    {
      method: 'POST',
      body: buildFileFormData(file),
    },
    180000
  )

  return handleApiResponse(response)
}


export async function getUploadJobStatus(jobId) {
  const response = await apiFetch(`${API_BASE_URL}/uploads/jobs/${jobId}`)
  return handleApiResponse(response)
}

export async function getUploadDatabaseStatus() {
  const response = await apiFetch(`${API_BASE_URL}/uploads/database-status`)
  return handleApiResponse(response)
}

export async function getUploadDatabasePreview(limit = 100) {
  const response = await apiFetch(`${API_BASE_URL}/uploads/database-preview?limit=${limit}`)
  return handleApiResponse(response)
}

export async function getBackendIntegrationStatus() {
  const response = await apiFetch(`${API_BASE_URL}/integration/status`)
  return handleApiResponse(response)
}

export async function buildBackendIntegrationDataset() {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/integration/build-dataset`,
    { method: 'POST' },
    180000
  )

  return handleApiResponse(response)
}

export async function resetBackendIntegrationWorkspace() {
  const response = await apiFetch(`${API_BASE_URL}/integration/reset`, {
    method: 'DELETE',
  })

  return handleApiResponse(response)
}

export async function getLatestBackendIntegrationDataset() {
  const response = await apiFetch(`${API_BASE_URL}/integration/latest-dataset`)
  return handleApiResponse(response)
}


export async function getBackendAlignmentReport() {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/integration/alignment-report`,
    {},
    90000
  )
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

  const response = await apiFetch(`${API_BASE_URL}/geospatial/hotspots?${params.toString()}`)
  return handleApiResponse(response)
}

export async function getBackendNotifications() {
  const response = await apiFetch(`${API_BASE_URL}/notifications`)
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
  const response = await apiFetch(`${API_BASE_URL}/notifications/events`, {
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
  const response = await apiFetch(`${API_BASE_URL}/decision-actions${query ? `?${query}` : ''}`)
  return handleApiResponse(response)
}

export async function createDecisionAction(payload) {
  const response = await apiFetch(`${API_BASE_URL}/decision-actions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return handleApiResponse(response)
}

export async function updateDecisionAction(actionId, payload) {
  const response = await apiFetch(`${API_BASE_URL}/decision-actions/${actionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return handleApiResponse(response)
}

export async function deleteDecisionAction(actionId) {
  const response = await apiFetch(`${API_BASE_URL}/decision-actions/${actionId}`, {
    method: 'DELETE',
  })

  return handleApiResponse(response)
}

export async function getLatestSavedForecast() {
  const response = await apiFetch(`${API_BASE_URL}/forecast/latest`)
  return handleApiResponse(response)
}

export async function getLatestSavedBoundaryGeoJson() {
  const response = await apiFetch(`${API_BASE_URL}/uploads/latest-boundary-geojson`)
  return handleApiResponse(response)
}


export async function saveGeneratedReport(payload) {
  const response = await apiFetch(`${API_BASE_URL}/reports/generated`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return handleApiResponse(response)
}

export async function getGeneratedReports({ limit = 20 } = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
  })

  const response = await apiFetch(`${API_BASE_URL}/reports/generated?${params.toString()}`)
  return handleApiResponse(response)
}



export async function getSavedWorkspaceState({ userKey = 'default_user' } = {}) {
  const params = new URLSearchParams({ user_key: userKey })
  const response = await apiFetch(`${API_BASE_URL}/workspace?${params.toString()}`)
  return handleApiResponse(response)
}

export async function saveWorkspaceState(workspace, { userKey = 'default_user' } = {}) {
  const response = await apiFetch(`${API_BASE_URL}/workspace`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_key: userKey,
      workspace,
    }),
  })

  return handleApiResponse(response)
}

export async function clearSavedWorkspaceState({ userKey = 'default_user' } = {}) {
  const params = new URLSearchParams({ user_key: userKey })
  const response = await apiFetch(`${API_BASE_URL}/workspace?${params.toString()}`, {
    method: 'DELETE',
  })
  return handleApiResponse(response)
}

export async function getNotificationReads({ userKey = 'default_user' } = {}) {
  const params = new URLSearchParams({ user_key: userKey })
  const response = await apiFetch(`${API_BASE_URL}/notifications/reads?${params.toString()}`)
  return handleApiResponse(response)
}

export async function markNotificationRead(notificationId, { userKey = 'default_user' } = {}) {
  const params = new URLSearchParams({ user_key: userKey })
  const response = await apiFetch(`${API_BASE_URL}/notifications/reads/${encodeURIComponent(notificationId)}?${params.toString()}`, {
    method: 'POST',
  })
  return handleApiResponse(response)
}

export async function markNotificationsRead(notificationIds, { userKey = 'default_user' } = {}) {
  const response = await apiFetch(`${API_BASE_URL}/notifications/reads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_key: userKey,
      notification_ids: notificationIds,
    }),
  })
  return handleApiResponse(response)
}


export async function loginUser({ email, password }) {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/auth/login`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    },
    10000
  ).catch((error) => {
    if (error?.name === 'AbortError') {
      throw new Error('Login request timed out. Please make sure the backend server is running.')
    }
    throw error
  })

  return handleApiResponse(response)
}

export async function logoutUser() {
  const response = await apiFetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
  })
  return handleApiResponse(response)
}

export async function getCurrentUser() {
  const response = await apiFetch(`${API_BASE_URL}/auth/me`)
  return handleApiResponse(response)
}

export async function createUserAccount(payload) {
  const response = await apiFetch(`${API_BASE_URL}/auth/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  return handleApiResponse(response)
}

export async function getUserAccounts() {
  const response = await apiFetch(`${API_BASE_URL}/auth/users`)
  return handleApiResponse(response)
}

export async function updateUserAccount(userId, payload) {
  const response = await apiFetch(`${API_BASE_URL}/auth/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  return handleApiResponse(response)
}

export async function resetUserPassword(userId, password) {
  const response = await apiFetch(`${API_BASE_URL}/auth/users/${encodeURIComponent(userId)}/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  })
  return handleApiResponse(response)
}

export async function deleteUserAccount(userId) {
  const response = await apiFetch(`${API_BASE_URL}/auth/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  })
  return handleApiResponse(response)
}

export async function getUserAuditLogs() {
  const response = await apiFetch(`${API_BASE_URL}/auth/users/audit`)
  return handleApiResponse(response)
}

export async function getAuthBarangays() {
  const response = await apiFetch(`${API_BASE_URL}/auth/barangays`)
  return handleApiResponse(response)
}

export async function createDemoSession(payload) {
  const response = await apiFetch(`${API_BASE_URL}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  return handleApiResponse(response)
}

export async function deleteDemoSession(sessionId) {
  const response = await apiFetch(`${API_BASE_URL}/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  })
  return handleApiResponse(response)
}


export { API_BASE_URL }
export async function trainModel() {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/models/train`,
    { method: 'POST' },
    180000
  )

  return handleApiResponse(response)
}

export async function evaluateModel() {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/models/evaluate`,
    { method: 'POST' },
    180000
  )

  return handleApiResponse(response)
}

export async function forecastModel() {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/models/forecast`,
    { method: 'POST' },
    180000
  )

  return handleApiResponse(response)
}

export async function getLatestModelMetrics() {
  const response = await apiFetch(`${API_BASE_URL}/models/latest-metrics`)
  return handleApiResponse(response)
}

export async function autoRunModel() {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/models/auto-run`,
    { method: 'POST' },
    180000
  )

  return handleApiResponse(response)
}