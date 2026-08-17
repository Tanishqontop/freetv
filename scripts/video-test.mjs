import { chromium } from 'playwright'

const URL = 'http://localhost:5173/'

function launchContext(browser) {
  return browser.newContext({
    permissions: ['camera', 'microphone'],
  })
}

async function enterVideo(page, label) {
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.getByText('Loading FreeTV', { exact: false }).waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})
  const age = page.getByRole('checkbox')
  await age.waitFor({ timeout: 20000 })
  if (!(await age.isChecked())) await age.click()
  const videoBtn = page.getByRole('button', { name: /Video/ })
  await page.waitForFunction(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Video'))
    return btn && !btn.disabled
  }, null, { timeout: 15000 })
  await videoBtn.click()
  await page.waitForURL('**/video', { timeout: 15000 })
  await page.locator('[data-match]').waitFor({ timeout: 20000 })
  console.log(`${label}: on video page`)
}

async function waitCall(page, label) {
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-match][data-connection]')
    return el?.getAttribute('data-match') === 'connected' && el.getAttribute('data-connection') === 'connected'
  }, null, { timeout: 40000 })
  console.log(`${label}: video connected`)
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})

const a = await launchContext(browser)
const b = await launchContext(browser)
const pageA = await a.newPage()
const pageB = await b.newPage()

try {
  await enterVideo(pageA, 'A')
  await enterVideo(pageB, 'B')
  await Promise.all([waitCall(pageA, 'A'), waitCall(pageB, 'B')])
  console.log('VIDEO_TEST_OK')
} catch (err) {
  console.error('VIDEO_TEST_FAIL')
  console.error(err)
  const textA = await pageA.locator('body').innerText().catch(() => '')
  const textB = await pageB.locator('body').innerText().catch(() => '')
  const attrA = await pageA.locator('[data-match]').getAttribute('data-match').catch(() => null)
  const connA = await pageA.locator('[data-connection]').getAttribute('data-connection').catch(() => null)
  const attrB = await pageB.locator('[data-match]').getAttribute('data-match').catch(() => null)
  const connB = await pageB.locator('[data-connection]').getAttribute('data-connection').catch(() => null)
  console.error({ attrA, connA, attrB, connB })
  console.error('--- A ---\n' + textA.slice(0, 1500))
  console.error('--- B ---\n' + textB.slice(0, 1500))
  process.exitCode = 1
} finally {
  await browser.close()
}
