function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

export const apiBaseUrl = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL?.trim() ?? '')

export function apiUrl(path: `/api/${string}`) {
  return apiBaseUrl ? `${apiBaseUrl}${path}` : path
}

export function assetUrl(path: string) {
  const normalizedPath = path.replace(/^\/+/, '')
  return `${import.meta.env.BASE_URL}${normalizedPath}`
}
