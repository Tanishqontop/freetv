import { chromium } from 'playwright'

const URL = 'http://localhost:5173/'

async function enterTextChat(page, label) {
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.getByText('Loading FreeTV', { exact: false }).waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})
  const age = page.getByRole('checkbox')
  await age.waitFor({ timeout: 20000 })
  if (!(await age.isChecked())) await age.click()
  const textBtn = page.getByRole('button', { name: /Text/ })
  await textBtn.waitFor({ state: 'visible' })
  await page.waitForFunction(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Text'))
    return btn && !btn.disabled
  }, null, { timeout: 15000 })
  await textBtn.click()
  await page.waitForURL('**/chat', { timeout: 15000 })
  console.log(`${label}: in chat`)
}

async function waitConnected(page, label) {
  await page.getByPlaceholder('Type a message', { timeout: 25000 })
  console.log(`${label}: matched`)
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const a = await browser.newContext()
const b = await browser.newContext()
const pageA = await a.newPage()
const pageB = await b.newPage()

try {
  await enterTextChat(pageA, 'A')
  await enterTextChat(pageB, 'B')
  await Promise.all([waitConnected(pageA, 'A'), waitConnected(pageB, 'B')])

  const box = pageA.locator('textarea')
  await box.fill('hello from A')
  await box.press('Enter')
  await pageB.getByText('hello from A', { timeout: 10000 })
  console.log('B received message from A')

  await pageB.locator('textarea').fill('hi back from B')
  await pageB.locator('textarea').press('Enter')
  await pageA.getByText('hi back from B', { timeout: 10000 })
  console.log('A received message from B')
  console.log('MATCH_TEST_OK')
} catch (err) {
  console.error('MATCH_TEST_FAIL')
  console.error(err)
  await pageA.screenshot({ path: 'match-a.png', fullPage: true }).catch(() => {})
  await pageB.screenshot({ path: 'match-b.png', fullPage: true }).catch(() => {})
  const textA = await pageA.locator('body').innerText().catch(() => '')
  const textB = await pageB.locator('body').innerText().catch(() => '')
  console.error('--- A ---\n' + textA.slice(0, 1500))
  console.error('--- B ---\n' + textB.slice(0, 1500))
  process.exitCode = 1
} finally {
  await browser.close()
}
