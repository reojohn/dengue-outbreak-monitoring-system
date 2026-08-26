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

// Small in-memory GET cache. It survives route changes for the current browser
// session, but never writes large API responses to localStorage. The auth token
// is part of the cache key so data cannot leak between signed-in users.
const readResponseCache = new Map()

function getReadCacheNamespace() {
  const token = getAuthToken()
  return token ? token.slice(-24) : 'public'
}

async function cachedJsonGet(cacheKey, url, { ttlMs = 90_000, force = false } = {}) {
  const namespacedKey = `${getReadCacheNamespace()}:${cacheKey}`
  const now = Date.now()
  const cached = readResponseCache.get(namespacedKey)

  if (!force && cached?.value !== undefined && Number(cached.expiresAt || 0) > now) {
    return cached.value
  }

  if (!force && cached?.promise) {
    return cached.promise
  }

  const promise = apiFetch(url)
    .then(handleApiResponse)
    .then((value) => {
      readResponseCache.set(namespacedKey, {
        value,
        expiresAt: Date.now() + ttlMs,
        promise: null,
      })
      return value
    })
    .catch((error) => {
      readResponseCache.delete(namespacedKey)
      throw error
    })

  readResponseCache.set(namespacedKey, {
    value: cached?.value,
    expiresAt: cached?.expiresAt || 0,
    promise,
  })

  return promise
}

function clearReadResponseCache(prefix = '') {
  const namespace = `${getReadCacheNamespace()}:`
  for (const key of readResponseCache.keys()) {
    if (!key.startsWith(namespace)) continue
    if (!prefix || key.slice(namespace.length).startsWith(prefix)) {
      readResponseCache.delete(key)
    }
  }
}

async function handleApiResponse(response) {
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const isLoginRequest = String(response.url || '').includes('/auth/login')

    if (response.status === 401 && !isLoginRequest) {
      throw new Error('Your session has expired. Please sign in again to continue.')
    }

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

export async function validateDengueFile(file) {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/uploads/validate-dengue`,
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

export async function startFreshUploadCycle() {
  clearReadResponseCache('analytics:')
  const response = await apiFetch(`${API_BASE_URL}/uploads/fresh-cycle`, {
    method: 'POST',
  })
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

export async function downloadCurrentSourceFile(datasetType) {
  const response = await apiFetch(`${API_BASE_URL}/uploads/source-file/${encodeURIComponent(datasetType)}`)

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    if (response.status === 401) {
      throw new Error('Your session has expired. Please sign in again to continue.')
    }

    const message =
      data?.detail?.message ||
      data?.detail ||
      data?.message ||
      `Download failed with status ${response.status}`
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message))
  }

  const disposition = response.headers.get('content-disposition') || ''
  let filename = ''
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  const plainMatch = disposition.match(/filename="?([^";]+)"?/i)
  if (utf8Match?.[1]) {
    try {
      filename = decodeURIComponent(utf8Match[1])
    } catch {
      filename = utf8Match[1]
    }
  } else if (plainMatch?.[1]) {
    filename = plainMatch[1]
  }

  return {
    blob: await response.blob(),
    filename,
  }
}

export async function getBackendIntegrationStatus() {
  const response = await apiFetch(`${API_BASE_URL}/integration/status`)
  return handleApiResponse(response)
}

export async function buildBackendIntegrationDataset() {
  clearReadResponseCache('analytics:')
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/integration/build-dataset`,
    { method: 'POST' },
    180000
  )

  return handleApiResponse(response)
}

export async function resetBackendIntegrationWorkspace() {
  clearReadResponseCache('analytics:')
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

export async function getTrendAnalyticsBarangays() {
  return cachedJsonGet(
    'analytics:barangays',
    `${API_BASE_URL}/analytics/barangays`,
    { ttlMs: 5 * 60_000 }
  )
}

export async function getCityTrendAnalytics({ year, quarter, month, includeClassification = false } = {}) {
  const params = new URLSearchParams()

  if (year) params.set('year', String(year))
  if (quarter) params.set('quarter', String(quarter))
  if (month) params.set('month', String(month))
  if (includeClassification) params.set('include_classification', 'true')

  const query = params.toString()
  const url = `${API_BASE_URL}/analytics/city-trends${query ? `?${query}` : ''}`
  return cachedJsonGet(`analytics:city-trends:${query || 'default'}`, url, { ttlMs: 2 * 60_000 })
}

export async function getBarangayTrendAnalytics({
  barangay,
  year = null,
  quarter = null,
  month = null,
} = {}) {
  const params = new URLSearchParams({
    barangay: String(barangay || ''),
  })

  if (year !== null && year !== undefined && year !== '') {
    params.set('year', String(year))
  }

  if (quarter !== null && quarter !== undefined && quarter !== '') {
    params.set('quarter', String(quarter))
  }

  if (month !== null && month !== undefined && month !== '') {
    params.set('month', String(month))
  }

  const query = params.toString()
  const url = `${API_BASE_URL}/analytics/barangay-trends?${query}`
  return cachedJsonGet(`analytics:barangay-trends:${query}`, url, { ttlMs: 2 * 60_000 })
}




export async function getGeospatialHotspots({
  radiusKm = 3,
  fallbackNearestCount = 3,
  forceRefresh = false,
  cachedOnly = false,
} = {}) {
  const params = new URLSearchParams({
    radius_km: String(radiusKm),
    fallback_nearest_count: String(fallbackNearestCount),
    force_refresh: String(Boolean(forceRefresh)),
    cached_only: String(Boolean(cachedOnly)),
  })

  const response = await apiFetch(`${API_BASE_URL}/geospatial/hotspots?${params.toString()}`)
  return handleApiResponse(response)
}

export async function getBackendNotifications() {
  const response = await apiFetch(`${API_BASE_URL}/notifications`)
  return handleApiResponse(response)
}

export async function getNotificationPreferences() {
  const response = await apiFetch(`${API_BASE_URL}/notifications/preferences`)
  return handleApiResponse(response)
}

export async function updateNotificationPreferences(notificationsEnabled) {
  const response = await apiFetch(`${API_BASE_URL}/notifications/preferences`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      notifications_enabled: Boolean(notificationsEnabled),
    }),
  })

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
  recipientRole = null,
  recipientUserId = null,
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
      recipient_role: recipientRole,
      recipient_user_id: recipientUserId,
    }),
  })

  return handleApiResponse(response)
}

export async function getCurrentFieldUpdate({ barangay, reportingDate }) {
  const params = new URLSearchParams({
    barangay: String(barangay || ''),
    reporting_date: String(reportingDate || ''),
  })
  const response = await apiFetch(`${API_BASE_URL}/field-updates/current?${params.toString()}`)
  return handleApiResponse(response)
}

export async function getFieldUpdates({ status = '', barangay = '', reportingDate = '', limit = 100 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (status) params.set('status', status)
  if (barangay) params.set('barangay', barangay)
  if (reportingDate) params.set('reporting_date', reportingDate)
  const response = await apiFetch(`${API_BASE_URL}/field-updates?${params.toString()}`)
  return handleApiResponse(response)
}

export async function getFieldUpdate(fieldUpdateId) {
  const response = await apiFetch(`${API_BASE_URL}/field-updates/${fieldUpdateId}`)
  return handleApiResponse(response)
}

export async function saveFieldUpdateDraft(payload) {
  const response = await apiFetch(`${API_BASE_URL}/field-updates/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleApiResponse(response)
}

export async function submitFieldUpdate(payload) {
  const response = await apiFetch(`${API_BASE_URL}/field-updates/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleApiResponse(response)
}

export async function reviewFieldUpdate(fieldUpdateId, { status, supervisorComment = '' }) {
  const response = await apiFetch(`${API_BASE_URL}/field-updates/${fieldUpdateId}/review`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status,
      supervisor_comment: supervisorComment,
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

export async function getSharedSystemStatus() {
  const response = await apiFetch(`${API_BASE_URL}/forecast/system-status`)
  return handleApiResponse(response)
}

export async function getLatestSavedBoundaryGeoJson({ scope = '' } = {}) {
  const params = new URLSearchParams()
  if (scope) params.set('scope', scope)

  const query = params.toString()
  const response = await apiFetch(`${API_BASE_URL}/geospatial/boundary${query ? `?${query}` : ''}`)
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



export async function getSavedWorkspaceState(_options = {}) {
  const response = await apiFetch(`${API_BASE_URL}/workspace`)
  return handleApiResponse(response)
}

export async function saveWorkspaceState(workspace, _options = {}) {
  const response = await apiFetch(`${API_BASE_URL}/workspace`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ workspace }),
  })

  return handleApiResponse(response)
}

export async function clearSavedWorkspaceState(_options = {}) {
  const response = await apiFetch(`${API_BASE_URL}/workspace`, {
    method: 'DELETE',
  })
  return handleApiResponse(response)
}

export async function getNotificationReads(_options = {}) {
  const response = await apiFetch(`${API_BASE_URL}/notifications/reads`)
  return handleApiResponse(response)
}

export async function markNotificationRead(notificationId, _options = {}) {
  const response = await apiFetch(`${API_BASE_URL}/notifications/reads/${encodeURIComponent(notificationId)}`, {
    method: 'POST',
  })
  return handleApiResponse(response)
}

export async function markNotificationsRead(notificationIds, _options = {}) {
  const response = await apiFetch(`${API_BASE_URL}/notifications/reads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      notification_ids: notificationIds,
    }),
  })
  return handleApiResponse(response)
}


export async function loginUser({ email, password }) {
  readResponseCache.clear()
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
  readResponseCache.clear()
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