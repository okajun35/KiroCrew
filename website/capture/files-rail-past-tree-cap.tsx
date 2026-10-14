/**
 * Isolated capture entry for the Files rail on a project past the tree's
 * 10,000-row cap.
 *
 * WHY ISOLATED: the subject is a project with more than 10,000 items, which a
 * live gateway reproduces only by seeding one. Stubbing `/api/project/tree`
 * (whole and `?dir=`) and `/api/file-search` at the fetch boundary makes the
 * frames deterministic, and each payload is the endpoint's own response shape.
 *
 * WHAT IS FAITHFUL: the REAL `FileBrowserRail`, the real Pierre tree, the real
 * theme provider and the real i18n catalogs. The driver types, clicks and
 * expands; nothing is seeded into component state.
 *
 * Query string: ?theme=dark|light
 */
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Provider } from 'react-redux'
import { initI18n } from '../src/i18n/all'
import '../src/index.css'
import { ThemeProvider } from '../src/hooks/useTheme'
import { store } from '../src/store'
import FileBrowserRail from '../src/pages/chat/FileBrowserRail'

initI18n()

const params = new URLSearchParams(location.search)
const theme = params.get('theme') === 'light' ? 'light' : 'dark'
localStorage.setItem('mc-theme', theme)
document.documentElement.setAttribute('data-theme', theme === 'light' ? 'kiro-light' : 'kiro-dark')

const PROJECT = '/home/dev/monorepo'

/** The whole listing, cut: `packages` lost rows to the cap, and `huge-assets`
 *  is cut even inside its own listing (a single folder over the cap). */
const WHOLE = {
  root: PROJECT,
  paths: ['README.md', 'package.json', 'packages/core/index.ts', 'packages/core/util.ts'],
  directories: ['packages', 'packages/core', 'huge-assets'],
  repo: false,
  truncated: true,
  truncatedDirectories: ['packages', 'huge-assets'],
  hiddenOnlyDirectories: [],
  unreadableDirectories: [],
  linkedDirectories: [],
}

/** `?dir=packages`: the folders the cap hid, now listed. */
const PACKAGES = {
  root: PROJECT,
  dir: 'packages',
  paths: ['packages/core/index.ts', 'packages/zz-billing/invoice.ts', 'packages/zz-billing/tax.ts', 'packages/zz-search/query.ts'],
  directories: ['packages/core', 'packages/zz-billing', 'packages/zz-search'],
  repo: false,
  truncated: false,
  truncatedDirectories: [],
  hiddenOnlyDirectories: [],
  unreadableDirectories: [],
  linkedDirectories: [],
}

/** `?dir=huge-assets`: one folder over the cap on its own, still cut. */
const HUGE = {
  root: PROJECT,
  dir: 'huge-assets',
  paths: [],
  directories: [],
  repo: false,
  truncated: true,
  truncatedDirectories: ['huge-assets'],
  hiddenOnlyDirectories: [],
  unreadableDirectories: [],
  linkedDirectories: [],
}

/** `/api/file-search` for "billing", project-wide: a folder past the cap and its files. */
const SEARCH = {
  root: PROJECT,
  results: [
    { path: `${PROJECT}/packages/zz-billing`, name: 'zz-billing', size: 0, mtime: 0, kind: 'dir' },
    { path: `${PROJECT}/packages/zz-billing/invoice.ts`, name: 'invoice.ts', size: 812, mtime: 0, kind: 'file' },
    { path: `${PROJECT}/packages/zz-billing/tax.ts`, name: 'tax.ts', size: 401, mtime: 0, kind: 'file' },
  ],
}

/** The same search scoped to `huge-assets`. */
const SCOPED = {
  root: `${PROJECT}/huge-assets`,
  results: [
    { path: `${PROJECT}/huge-assets/logo-billing.svg`, name: 'logo-billing.svg', size: 2048, mtime: 0, kind: 'file' },
  ],
}

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), {
  status: 200, headers: { 'Content-Type': 'application/json' },
}))
const realFetch = window.fetch.bind(window)
window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!raw.includes('/api/')) return realFetch(input, init)
  const url = new URL(raw, location.origin)
  if (url.pathname === '/api/project/tree') {
    const dir = url.searchParams.get('dir')
    return json(dir === 'packages' ? PACKAGES : dir === 'huge-assets' ? HUGE : WHOLE)
  }
  if (url.pathname === '/api/file-search') {
    return json((url.searchParams.get('project') || '').endsWith('/huge-assets') ? SCOPED : SEARCH)
  }
  if (url.pathname === '/api/project/git/status') return json({ repo: false, files: [] })
  return json({})
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={qc}>
    <Provider store={store}>
      <ThemeProvider>
        <MemoryRouter>
          <div style={{ height: '100vh', display: 'flex', justifyContent: 'flex-end' }} className="bg-bg text-text">
            <FileBrowserRail projectDir={PROJECT} onFileOpen={() => {}} />
          </div>
        </MemoryRouter>
      </ThemeProvider>
    </Provider>
  </QueryClientProvider>,
)
