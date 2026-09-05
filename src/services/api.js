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


function getWorkflowClientId() {
  try {
    const storageKey = 'dengue-workflow-client-id'
    const existing = sessionStorage.getItem(storageKey)
    if (existing) return existing

    const created = globalThis.crypto?.randomUUID?.() || `client-${Date.now()}-${Math.random().toString(36).slice(2)}`
    sessionStorage.setItem(storageKey, created)
    return created
  } catch {
    return ''
  }
}

function withAuthHeaders(options = {}) {
  // X-Workflow-Client-ID is opt-in. Sending it on every ordinary GET caused
  // unnecessary CORS preflights and made local Supervisor reads fragile when
  // the Vite dev server moved to another port. Only realtime/mutation requests
  // that benefit from origin-tab suppression should carry the custom header.
  const { workflowClient = false, ...fetchOptions } = options
  const token = getAuthToken()
  const headers = { ...(fetchOptions.headers || {}) }

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`
  }

  if (workflowClient) {
    const workflowClientId = getWorkflowClientId()
    if (workflowClientId && !headers['X-Workflow-Client-ID']) {
      headers['X-Workflow-Client-ID'] = workflowClientId
    }
  }

  return {
    ...fetchOptions,
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

const forcedReadRefreshes = new Map()

async function cachedJsonGet(cacheKey, url, { ttlMs = 90_000, force = false } = {}) {
  const namespacedKey = `${getReadCacheNamespace()}:${cacheKey}`
  const now = Date.now()

  // A realtime event must never be satisfied by a request that started before
  // the database mutation. Keep one authoritative forced refresh per cache key
  // and let sibling widgets share that newer request instead.
  if (force) {
    const existingForcedRefresh = forcedReadRefreshes.get(namespacedKey)
    if (existingForcedRefresh) return existingForcedRefresh

    const forcedRefresh = (async () => {
      const current = readResponseCache.get(namespacedKey)
      if (current?.promise) {
        try {
          await current.promise
        } catch {
          // The authoritative request below is still allowed to recover.
        }
      }

      const value = await apiFetch(url, {
        cache: 'no-store',
      }).then(handleApiResponse)

      readResponseCache.set(namespacedKey, {
        value,
        expiresAt: Date.now() + ttlMs,
        promise: null,
      })
      return value
    })().finally(() => {
      forcedReadRefreshes.delete(namespacedKey)
    })

    forcedReadRefreshes.set(namespacedKey, forcedRefresh)
    return forcedRefresh
  }

  const forcedRefresh = forcedReadRefreshes.get(namespacedKey)
  if (forcedRefresh) return forcedRefresh

  const cached = readResponseCache.get(namespacedKey)
  if (cached?.value !== undefined && Number(cached.expiresAt || 0) > now) {
    return cached.value
  }

  if (cached?.promise) return cached.promise

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

export function subscribeWorkflowRealtime({ onEvent, onStatus } = {}) {
  const controller = new AbortController()
  let stopped = false
  let retryMs = 1000
  let hasConnectedOnce = false
  let fieldRevision = null
  let revisionCheckInFlight = false
  let revisionFallbackUnavailable = false
  const FIELD_REVISION_RECONCILE_MS = 4_000

  function emitStatus(status, detail = '') {
    try {
      onStatus?.({ status, detail })
    } catch {
      // UI status callbacks must never interrupt the realtime connection.
    }
  }

  function invalidateTopic(topic) {
    if (topic === 'decision_actions') clearReadResponseCache('decision-actions:')
    if (topic === 'field_updates') clearReadResponseCache('field-updates:')
  }

  function emitWorkflowEvent(payload) {
    if (!payload || payload.topic === 'connection') return
    invalidateTopic(payload.topic)
    try {
      onEvent?.(payload)
    } catch {
      // A component refresh failure should not terminate the realtime stream.
    }
  }

  function parseEventBlock(block) {
    if (!block || block.startsWith(':')) return null
    const lines = block.split(/\r?\n/)
    const dataLines = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
    if (!dataLines.length) return null

    try {
      return JSON.parse(dataLines.join('\n'))
    } catch {
      return null
    }
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  async function reconcileFieldUpdateRevision({ notify = true } = {}) {
    if (stopped || revisionCheckInFlight || revisionFallbackUnavailable) return
    revisionCheckInFlight = true

    try {
      const response = await apiFetch(`${API_BASE_URL}/field-updates/revision`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
        signal: controller.signal,
      })

      // Keep compatibility during a rolling deployment where the frontend may
      // briefly reach an older backend that does not have this endpoint yet.
      if (response.status === 404 || response.status === 405) {
        revisionFallbackUnavailable = true
        return
      }
      if (response.status === 401) {
        emitStatus('auth-error', 'Session expired')
        return
      }
      if (!response.ok) return

      const data = await response.json().catch(() => null)
      const nextRevision = String(data?.revision || '')
      if (!nextRevision) return

      if (fieldRevision === null) {
        fieldRevision = nextRevision
        if (notify) {
          // One authoritative reconciliation on mount closes the small race
          // between a component's initial GET and this revision snapshot.
          emitWorkflowEvent({
            topic: 'field_updates',
            event: 'reconcile-initial',
            revision: nextRevision,
            timestamp: new Date().toISOString(),
          })
        }
        return
      }

      if (nextRevision !== fieldRevision) {
        const previousRevision = fieldRevision
        fieldRevision = nextRevision
        if (notify) {
          emitWorkflowEvent({
            topic: 'field_updates',
            event: 'reconcile',
            revision: nextRevision,
            previous_revision: previousRevision,
            timestamp: new Date().toISOString(),
          })
        }
      }
    } catch (error) {
      if (stopped || error?.name === 'AbortError') return
      // The revision check is only a fallback. SSE remains the primary path,
      // so a transient polling failure should not change the page state.
    } finally {
      revisionCheckInFlight = false
    }
  }

  function handleWindowFocus() {
    reconcileFieldUpdateRevision()
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') reconcileFieldUpdateRevision()
  }

  const revisionTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') reconcileFieldUpdateRevision()
  }, FIELD_REVISION_RECONCILE_MS)

  window.addEventListener('focus', handleWindowFocus)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  reconcileFieldUpdateRevision()

  async function connectLoop() {
    while (!stopped) {
      try {
        emitStatus('connecting')
        const response = await apiFetch(`${API_BASE_URL}/workflow-realtime/stream`, {
          method: 'GET',
          headers: { Accept: 'text/event-stream' },
          cache: 'no-store',
          signal: controller.signal,
          workflowClient: true,
        })

        if (!response.ok) {
          if (response.status === 401) {
            emitStatus('auth-error', 'Session expired')
            return
          }
          throw new Error(`Realtime stream failed with status ${response.status}`)
        }

        if (!response.body) {
          throw new Error('Realtime streaming is not supported by this browser.')
        }

        retryMs = 1000
        emitStatus('connected')

        if (hasConnectedOnce) {
          // A reconnect may have missed changes while the stream was down.
          // Trigger one authoritative refresh per workflow topic, once.
          for (const topic of ['decision_actions', 'field_updates']) {
            emitWorkflowEvent({ topic, event: 'resync', timestamp: new Date().toISOString() })
          }
        }
        hasConnectedOnce = true

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (!stopped) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const blocks = buffer.split(/\r?\n\r?\n/)
          buffer = blocks.pop() || ''

          for (const block of blocks) {
            const payload = parseEventBlock(block.trim())
            if (!payload || payload.topic === 'connection') continue
            emitWorkflowEvent(payload)

            // Refresh the tiny revision snapshot after a successful SSE event.
            // This normally prevents the fallback poll from repeating the same
            // full-data refresh a few seconds later.
            if (payload.topic === 'field_updates') {
              reconcileFieldUpdateRevision({ notify: false })
            }
          }
        }

        try {
          reader.releaseLock()
        } catch {
          // Reader may already be released by the browser after disconnect.
        }

        if (!stopped) throw new Error('Realtime stream disconnected.')
      } catch (error) {
        if (stopped || error?.name === 'AbortError') return
        emitStatus('reconnecting', error?.message || 'Realtime connection interrupted')
        await wait(retryMs)
        retryMs = Math.min(retryMs * 2, 10_000)
      }
    }
  }

  connectLoop()

  return () => {
    stopped = true
    window.clearInterval(revisionTimer)
    window.removeEventListener('focus', handleWindowFocus)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    controller.abort()
    emitStatus('disconnected')
  }
}

export async function checkBackendHealth() {
  const response = await apiFetch(`${API_BASE_URL}/health`)
  return handleApiResponse(response)
}

export async function getPublicSystemSummary() {
  const response = await fetch(`${API_BASE_URL}/public/system-summary`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  })
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

export async function getCityTrendAnalytics({ year, quarter, month, includeClassification = false, includeBarangayBreakdown = false } = {}) {
  const params = new URLSearchParams()

  if (year) params.set('year', String(year))
  if (quarter) params.set('quarter', String(quarter))
  if (month) params.set('month', String(month))
  if (includeClassification) params.set('include_classification', 'true')
  if (includeBarangayBreakdown) params.set('include_barangay_breakdown', 'true')

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

export async function getFieldUpdates({ status = '', barangay = '', reportingDate = '', limit = 100, force = false } = {}) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (status) params.set('status', status)
  if (barangay) params.set('barangay', barangay)
  if (reportingDate) params.set('reporting_date', reportingDate)
  const cacheKey = `field-updates:${status || 'all'}:${String(barangay || '').trim().toLowerCase() || 'all'}:${reportingDate || 'all'}:${limit}`
  return cachedJsonGet(
    cacheKey,
    `${API_BASE_URL}/field-updates?${params.toString()}`,
    { ttlMs: 30_000, force }
  )
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
    workflowClient: true,
  })
  const result = await handleApiResponse(response)
  clearReadResponseCache('field-updates:')
  return result
}

export async function submitFieldUpdate(payload) {
  const response = await apiFetch(`${API_BASE_URL}/field-updates/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    workflowClient: true,
  })
  const result = await handleApiResponse(response)
  clearReadResponseCache('field-updates:')
  return result
}

export async function reviewFieldUpdate(fieldUpdateId, { status, supervisorComment = '' }) {
  const response = await apiFetch(`${API_BASE_URL}/field-updates/${fieldUpdateId}/review`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status,
      supervisor_comment: supervisorComment,
    }),
    workflowClient: true,
  })
  const result = await handleApiResponse(response)
  clearReadResponseCache('field-updates:')
  return result
}

export async function getDecisionActions({ status = '', barangay = '', force = false } = {}) {
  const params = new URLSearchParams()

  if (status) params.set('status', status)
  if (barangay) params.set('barangay', barangay)

  const query = params.toString()
  const cacheKey = `decision-actions:${status || 'all'}:${String(barangay || '').trim().toLowerCase() || 'all'}`
  return cachedJsonGet(
    cacheKey,
    `${API_BASE_URL}/decision-actions${query ? `?${query}` : ''}`,
    { ttlMs: 30_000, force }
  )
}

export async function createDecisionAction(payload) {
  const response = await apiFetch(`${API_BASE_URL}/decision-actions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    workflowClient: true,
  })

  const result = await handleApiResponse(response)
  clearReadResponseCache('decision-actions:')
  return result
}

export async function startDecisionActionProgress(actionId) {
  const response = await apiFetch(`${API_BASE_URL}/decision-actions/${actionId}/bhw-start`, {
    method: 'PATCH',
    workflowClient: true,
  })

  const result = await handleApiResponse(response)
  clearReadResponseCache('decision-actions:')
  return result
}

export async function updateDecisionAction(actionId, payload) {
  const response = await apiFetch(`${API_BASE_URL}/decision-actions/${actionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    workflowClient: true,
  })

  const result = await handleApiResponse(response)
  clearReadResponseCache('decision-actions:')
  return result
}

export async function deleteDecisionAction(actionId) {
  const response = await apiFetch(`${API_BASE_URL}/decision-actions/${actionId}`, {
    method: 'DELETE',
    workflowClient: true,
  })

  const result = await handleApiResponse(response)
  clearReadResponseCache('decision-actions:')
  return result
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

export async function reEvaluateModel() {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/models/re-evaluate`,
    { method: 'POST' },
    180000
  )

  return handleApiResponse(response)
}
