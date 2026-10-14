/**
 * Real-browser evidence for the Files rail on a project past the tree's
 * 10,000-row cap.
 *
 * Drives website/capture/files-rail-past-tree-cap.html, which mounts the REAL
 * `FileBrowserRail` with `/api/project/tree` and `/api/file-search` stubbed at
 * the fetch boundary. Every frame is reached by typing and clicking.
 *
 * Frames per theme:
 *   01-cut-tree          the whole listing, cut by the cap
 *   02-folder-loaded     `packages` expanded: its own listing brings the folders the cap hid
 *   03-name-search       a name query on a cut tree goes to the filename search
 *   04-folder-revealed   a folder hit, clicked: the tree opens on it
 *   05-search-this-folder  a folder still cut on its own: the row offers a folder search
 *   06-scoped-search     that row, clicked, then a query: the search runs in that folder
 *
 * Usage:
 *   npx vite --host 127.0.0.1 --port 6838 --strictPort   # in another shell (website/)
 *   node scripts/capture-files-rail-past-tree-cap.mjs http://127.0.0.1:6838 ../temp-screenshots/files-rail-past-tree-cap
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'http://127.0.0.1:6838'
const OUT = process.argv[3] || '../temp-screenshots/files-rail-past-tree-cap'
mkdirSync(OUT, { recursive: true })

const { LD_LIBRARY_PATH: _mise, ...browserEnv } = process.env
const browser = await chromium.launch({ env: browserEnv })
let failures = 0

for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 520, height: 640 } })
  page.on('pageerror', e => { console.error(`[${theme}] pageerror:`, e.message); failures++ })
  await page.goto(`${BASE}/capture/files-rail-past-tree-cap.html?theme=${theme}`, { waitUntil: 'networkidle', timeout: 120000 })
  const shot = async (name) => {
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/${theme}-${name}.png` })
    console.log(`${theme}-${name}.png`)
  }
  // Rows by path: Pierre splits a label around its truncation point, so the
  // visible text of a row is not its name.
  const row = (path) => page.locator(`[data-type="item"][data-item-path="${path}"]`).first()
  const under = (folder) => page.locator(`[data-type="item"][data-item-path^="${folder}/"]:not([data-item-path="${folder}/"])`).first()

  await row('packages/core/').waitFor({ timeout: 15000 })
  await shot('01-cut-tree')

  await row('packages/core/').click()
  await row('packages/zz-billing/').waitFor({ timeout: 15000 })
  await shot('02-folder-loaded')
  await row('packages/').click()

  await page.getByLabel('Filter files…').fill('billing')
  await page.getByTestId('rail-name-search').getByText('packages/zz-billing', { exact: true }).waitFor({ timeout: 15000 })
  await shot('03-name-search')

  await page.getByTestId('rail-name-search').getByText('packages/zz-billing', { exact: true }).click()
  await row('packages/zz-billing/invoice.ts').waitFor({ timeout: 15000 })
  await shot('04-folder-revealed')

  await row('huge-assets/').click()
  await under('huge-assets').waitFor({ timeout: 15000 })
  await shot('05-search-this-folder')

  await under('huge-assets').click()
  await page.getByTestId('rail-search-folder-scope').waitFor({ timeout: 15000 })
  await page.getByLabel('Filter files…').fill('billing')
  await page.getByTestId('rail-name-search').getByText('huge-assets/logo-billing.svg').waitFor({ timeout: 15000 })
  await shot('06-scoped-search')
  await page.close()
}

await browser.close()
if (failures) {
  console.error(`${failures} page error(s)`)
  process.exit(1)
}
