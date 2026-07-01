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

export { API_BASE_URL }