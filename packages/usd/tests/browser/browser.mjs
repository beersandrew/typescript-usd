// The browser the image runners open their pages in. Tooling only (no
// upstream OpenUSD counterpart).
//
//   --browser safari (default): `open -a Safari <url>`, exactly as before.
//   --browser chrome: a separate Google Chrome instance with a fresh profile
//     (CHROME_USER_DATA_DIR, default usd-image-chrome-profile under the OS
//     temp folder, emptied at launch) and its own DevTools port (chosen by
//     Chrome, read from the profile's DevToolsActivePort), driven over the
//     DevTools protocol with Node's WebSocket. WebGPU stays at Chrome's
//     defaults: the only switches are a separate profile without first-run
//     UI or keychain prompts, and no throttling of a tab or window that is
//     hidden behind other windows (scheduling, not rendering). Each page
//     opened replaces the one before it (one page in flight, as the runners
//     expect). The first page also records the Chrome version, the GPU the
//     browser reports and the page's WebGPU adapter (info, features, limits)
//     into <out>/chrome-info.json. closeBrowser() quits only this instance;
//     a runner killed with its process group takes Chrome with it.
//     CHROME_PATH moves the executable.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const BROWSERS = ['safari', 'chrome']
export const browserLabel = browser => browser === 'chrome' ? 'Chrome' : 'Safari'

/** The --browser argument of a runner's argv (default safari). */
export function browserOption(argv) {
  const i = argv.indexOf('--browser')
  const browser = i < 0 ? 'safari' : argv[i + 1]
  if (!BROWSERS.includes(browser)) throw new Error(`--browser must be one of ${BROWSERS.join(', ')} (got ${browser})`)
  return browser
}

/** Opens url in the browser. Safari: synchronous `open -a Safari`. */
export function openPage(browser, url, { out } = {}) {
  if (browser === 'safari') { execFileSync('open', ['-a', 'Safari', url]); return undefined }
  return chromeOpen(url, out)
}

/** Quits the Chrome instance this process started (nothing for Safari). */
export async function closeBrowser() {
  if (!chrome) return
  const c = chrome
  chrome = null
  try { await Promise.race([c.send('Browser.close'), sleep(3000)]) } catch {}
  if (!(await Promise.race([c.exited, sleep(10_000).then(() => false)]))) { try { c.child.kill('SIGKILL') } catch {} ; await Promise.race([c.exited, sleep(3000)]) }
  try { c.ws.close() } catch {}
  rmSync(c.profile, { recursive: true, force: true })
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
let chrome = null

async function launchChrome() {
  const exe = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const profile = path.resolve(process.env.CHROME_USER_DATA_DIR ?? path.join(os.tmpdir(), 'usd-image-chrome-profile'))
  rmSync(profile, { recursive: true, force: true })
  mkdirSync(profile, { recursive: true })
  const child = spawn(exe, [
    `--user-data-dir=${profile}`, '--remote-debugging-port=0',
    '--no-first-run', '--no-default-browser-check', '--use-mock-keychain', '--password-store=basic',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    'about:blank',
  ], { stdio: 'ignore' })
  const exited = new Promise(r => child.once('exit', () => r(true)))
  // A runner that ends without closeBrowser() (an exception) still quits it.
  process.once('exit', () => { try { child.kill('SIGKILL') } catch {} })
  const portFile = path.join(profile, 'DevToolsActivePort')
  for (let t = 0; !existsSync(portFile) || readFileSync(portFile, 'utf8').split('\n').length < 2; t++) {
    if (t > 300) throw new Error(`Chrome wrote no ${portFile} in 30 s`)
    if (child.exitCode != null) throw new Error(`Chrome exited (${child.exitCode}) before its DevTools port was open`)
    await sleep(100)
  }
  const [port, wsPath] = readFileSync(portFile, 'utf8').split('\n')
  const ws = new WebSocket(`ws://127.0.0.1:${port.trim()}${wsPath.trim()}`)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('DevTools WebSocket failed')) })
  let nextId = 1
  const pending = new Map()
  ws.onmessage = event => {
    const m = JSON.parse(event.data)
    if (m.id == null || !pending.has(m.id)) return
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    if (m.error) reject(new Error(`${m.error.message} (${m.error.code})`)); else resolve(m.result)
  }
  ws.onclose = () => { for (const { reject } of pending.values()) reject(new Error('DevTools connection closed')); pending.clear() }
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
  // The startup tab, closed when the first page opens.
  const { targetInfos } = await send('Target.getTargets')
  return { child, exited, profile, ws, send, pages: targetInfos.filter(t => t.type === 'page').map(t => t.targetId), recorded: false }
}

async function chromeOpen(url, out) {
  chrome ??= await launchChrome()
  const c = chrome
  const { targetId } = await c.send('Target.createTarget', { url })
  for (const old of c.pages) await c.send('Target.closeTarget', { targetId: old }).catch(() => {})
  c.pages = [targetId]
  if (!c.recorded) {
    c.recorded = true
    const info = await chromeInfo(c, targetId).catch(error => ({ error: String(error) }))
    if (out) writeFileSync(path.join(out, 'chrome-info.json'), JSON.stringify(info, null, 1))
    const a = info.webgpu?.info
    console.log(`Chrome ${info.version?.product ?? '?'}; WebGPU adapter: ${a ? [a.vendor, a.architecture, a.device, a.description].filter(Boolean).join(' / ') : info.webgpu?.error ?? info.error ?? 'none'}`)
  }
}

// The browser's version and GPU (Browser.getVersion, SystemInfo.getInfo) and
// the WebGPU adapter the page gets (navigator.gpu.requestAdapter() with no
// options, as the pages request theirs), read once the page is at its URL.
async function chromeInfo(c, targetId) {
  const version = await c.send('Browser.getVersion')
  const system = await c.send('SystemInfo.getInfo').catch(error => ({ error: String(error) }))
  const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true })
  const expression = `(async () => {
    if (!location.href.startsWith('http') || document.readyState === 'loading') return { notReady: true }
    if (!navigator.gpu) return { error: 'navigator.gpu is undefined' }
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) return { error: 'requestAdapter() returned null' }
    const i = adapter.info ?? {}
    const limits = {}
    for (const k in adapter.limits) limits[k] = adapter.limits[k]
    return { info: { vendor: i.vendor, architecture: i.architecture, device: i.device, description: i.description, isFallbackAdapter: i.isFallbackAdapter,
      subgroupMinSize: i.subgroupMinSize, subgroupMaxSize: i.subgroupMaxSize }, features: [...adapter.features].sort(), limits,
      preferredCanvasFormat: navigator.gpu.getPreferredCanvasFormat(), wgslLanguageFeatures: [...(navigator.gpu.wgslLanguageFeatures ?? [])].sort(), userAgent: navigator.userAgent }
  })()`
  let webgpu = null
  for (let t = 0; t < 120; t++) {
    const r = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId).catch(error => ({ result: { value: { notReady: true, why: String(error) } } }))
    webgpu = r.exceptionDetails ? { error: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text } : r.result?.value
    if (!webgpu?.notReady) break
    await sleep(250)
  }
  await c.send('Target.detachFromTarget', { sessionId }).catch(() => {})
  const gpu = system.gpu
  return {
    version, webgpu,
    gpu: gpu ? { devices: gpu.devices, driverBugWorkarounds: gpu.driverBugWorkarounds, featureStatus: gpu.featureStatus, auxAttributes: gpu.auxAttributes } : system,
    switches: c.child.spawnargs.slice(1).filter(a => a.startsWith('--') && !a.startsWith('--user-data-dir')),
  }
}
