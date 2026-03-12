import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`
}

function resolveBase(mode: string) {
  const env = loadEnv(mode, process.cwd(), '')
  const explicitBase = env.VITE_BASE_PATH?.trim()

  if (explicitBase) {
    return ensureTrailingSlash(explicitBase)
  }

  if (!process.env.GITHUB_ACTIONS) {
    return '/'
  }

  const [owner = '', repo = ''] = (process.env.GITHUB_REPOSITORY ?? '').split('/')

  if (!repo) {
    return '/'
  }

  if (repo.toLowerCase() === `${owner}.github.io`.toLowerCase()) {
    return '/'
  }

  return `/${repo}/`
}

export default defineConfig(({ mode }) => ({
  base: resolveBase(mode),
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
    watch: {
      ignored: ['**/.venv-whisperx/**'],
    },
  },
}))
