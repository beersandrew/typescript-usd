// usdcat as a converter: drop a USD file on the yard and the black cat
// draws it over by telekinesis, converted to the other format. .usda becomes
// .usdc, .usdc becomes .usda, and a .usd file is read to see which it is and
// becomes the other; a .usdz package's root layer comes out as .usda. The
// file glows in front of the cat for as long as usdcat runs. The gear holds
// usdcat's other options (pxr/usd/bin/usdcat: --flatten, --flattenLayerStack,
// --mask, --skipSourceFileComment, --usdFormat). Every conversion is a real
// usdcat run, `usdcat [options] -o <output> <input>`, and what it printed
// (and how long it took) is kept in the log below the yard.
import './files'
import './plugins'
import './page.css'
import './playful.css'
import './usdcat.css'
import { addFilesAt, forgetFiles, loadSamples, readFile, sampleRootPath, takeOutput } from './files'
import { runTool } from './run-tool'
import { el } from './dom'
import { Cat } from './cat'
import type { CatActor } from './cat3d'
import { SAMPLE_DRAG, acceptDrops, pickedFiles, rootsOf, stem, type DroppedFile } from './drop'
import { reducedMotion, saveFile, settingsGear } from './playful'

const { usdcat } = await import('../../../packages/usd/pxr/usd/bin/usdcat/usdcat.ts')

// ---------------------------------------------------------------- settings

type Flatten = 'none' | 'stage' | 'layerStack'
type Target = 'other' | 'usda' | 'usdc'
interface Settings {
  flatten: Flatten
  mask: string
  skipSourceFileComment: boolean
  keepUsd: boolean
  target: Target
}
const defaults: Settings = { flatten: 'none', mask: '', skipSourceFileComment: false, keepUsd: false, target: 'other' }
const storageKey = 'usd-tools.usdcat.settings'
function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<Settings>
    return { ...defaults, ...saved }
  } catch { return { ...defaults } }
}
const settings = loadSettings()
function saveSettings(): void {
  try { localStorage.setItem(storageKey, JSON.stringify(settings)) } catch { /* private mode */ }
}

// ------------------------------------------------------------- formats

type Format = 'usda' | 'usdc' | 'usdz' | 'unknown'
const ascii = (bytes: Uint8Array, n: number) => String.fromCharCode(...bytes.subarray(0, n))
/** What the bytes are, by their magic: "#usda", "PXR-USDC" or a zip's "PK". */
function sniff(bytes: Uint8Array): Format {
  if (ascii(bytes, 5) === '#usda') return 'usda'
  if (ascii(bytes, 8) === 'PXR-USDC') return 'usdc'
  if (ascii(bytes, 2) === 'PK') return 'usdz'
  return 'unknown'
}
const extensionOf = (name: string) => /\.([^./]+)$/.exec(name)?.[1]?.toLowerCase() ?? ''

interface Plan { output: string, format: 'usda' | 'usdc', usdFormat?: 'usda' | 'usdc' }
/** The output's name and format for an input, under the settings. */
function plan(name: string, format: Format): Plan {
  const ext = extensionOf(name)
  const other = format === 'usda' ? 'usdc' : 'usda' // usdc, usdz and unknown come out as text
  const target = settings.target === 'other' ? other : settings.target
  if (ext === 'usd' && settings.keepUsd) return { output: name, format: target, usdFormat: target }
  return { output: `${stem(name)}.${target}`, format: target }
}

// ------------------------------------------------------------------ page

document.title = 'usdcat — TypeScript USD'
const host = document.querySelector('main')!
host.classList.add('usdcat')

const { gear, panel } = settingsGear('usdcat settings')

const picker = el('input', { type: 'file', multiple: true, id: 'picker', hidden: true })
// The one sample: a file chip to drag onto the yard (or tap).
// The one sample, in a card of its own at the bottom: drag it onto the
// yard to convert it, click it to download it.
const sampleTray = el('div', { className: 'sample-tray' })
const testCard = el('section', { className: 'test-card' },
  el('h2', {}, 'Test File for Testing!'),
  sampleTray,
  el('p', {}, 'Drag it onto the yard · click to download'))

// The yard is where files are dropped: the cat lives in it, takes what
// lands in the inbox on the left and leaves the result on the right.
const hint = el('div', { className: 'yard-hint' },
  el('strong', {}, 'Drop USD files here'),
  el('span', {}, '.usda ⇄ .usdc · or tap to choose'))
const yard = el('div', { className: 'yard', role: 'button', tabIndex: 0, ariaLabel: 'Drop USD files here, or choose files' })
const inbox = el('div', { className: 'box inbox', ariaLabel: 'Waiting' })
const outbox = el('div', { className: 'box outbox', ariaLabel: 'Converted', role: 'list' })
yard.append(hint, inbox, outbox,
  el('div', { className: 'pile-label in' }, 'Input'),
  el('div', { className: 'pile-label out' }, 'Output', el('span', {}, 'download, or open in usdview')))
yard.addEventListener('click', e => { if (!(e.target as HTMLElement).closest('.chip')) picker.click() })
yard.addEventListener('keydown', e => { if (e.target === yard && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); picker.click() } })
/** How many converted files the yard keeps; older ones go. */
const KEEP = 3

/** The 3D cat (Storm in WebGPU) where the browser can draw it, else the
 *  2D one, both moved by the middle of the cat in yard pixels. */
async function makeCat(): Promise<CatActor> {
  try {
    if (!navigator.gpu) throw new Error('no WebGPU')
    const { Cat3D, INBOX_AT, OUTBOX_AT } = await import('./cat3d')
    const cat = await Cat3D.create(yard)
    yard.classList.add('three-d')
    yard.style.setProperty('--inbox-at', `${INBOX_AT * 100}%`)
    yard.style.setProperty('--outbox-at', `${OUTBOX_AT * 100}%`)
    return cat
  } catch (error) {
    console.info('usdcat: drawing the 2D cat', error)
    const flat = new Cat(yard)
    const middle = () => yard.clientWidth / 2
    requestAnimationFrame(() => flat.place(middle() - flat.width / 2))
    addEventListener('resize', () => flat.place(middle() - flat.width / 2))
    return {
      holdPoint: () => [middle(), yard.clientHeight - flat.element.offsetHeight - 40],
      telekinesis: on => flat.element.classList.toggle('telekinesis', on),
      watch: () => {},
      perk: on => flat.perk(on), puzzle: () => flat.puzzle(),
    }
  }
}
const saveAll = el('button', { className: 'save-all', type: 'button', hidden: true }, 'Save all')

const log = el('pre', { className: 'log' })
const logBox = el('details', { className: 'log-box' }, el('summary', {}, 'What usdcat printed'), log)

host.append(
  el('header', { className: 'top' },
    el('a', { href: '../', className: 'home' }, 'USD tools'),
    el('h1', {}, 'usdcat'),
    gear,
    panel),
  el('p', { className: 'about' }, 'Text USD to binary and back, by TypeScript USD’s usdcat, in your browser. Nothing is uploaded.'),
  picker,
  yard,
  el('div', { className: 'row results' }, saveAll),
  logBox,
  testCard,
  el('p', { className: 'credit' }, 'The cat and its yard are a USD stage drawn by TypeScript USD’s Storm. shapes.usda is CC0 1.0.'))

// The gear's panel: usdcat's options.
function radio(name: string, value: string, label: string, checked: boolean, onPick: () => void) {
  const input = el('input', { type: 'radio', name, value, checked })
  input.addEventListener('change', () => { if (input.checked) { onPick(); saveSettings(); refreshPanel() } })
  return el('label', {}, input, ` ${label}`)
}
function check(label: string, checked: boolean, onChange: (on: boolean) => void, arg?: string) {
  const input = el('input', { type: 'checkbox', checked })
  input.addEventListener('change', () => { onChange(input.checked); saveSettings(); refreshPanel() })
  return el('label', {}, input, ` ${label}`, ...(arg ? [' ', el('code', {}, arg)] : []))
}
function refreshPanel(): void {
  const mask = el('input', { type: 'text', value: settings.mask, placeholder: '/Root/Prim, /Other', spellcheck: false, autocapitalize: 'off' })
  mask.addEventListener('change', () => { settings.mask = mask.value.trim(); saveSettings() })
  const flattening = settings.flatten !== 'none'
  panel.replaceChildren(
    el('h2', {}, 'Settings'),
    el('fieldset', {}, el('legend', {}, 'Convert to'),
      radio('target', 'other', 'The other format', settings.target === 'other', () => { settings.target = 'other' }),
      radio('target', 'usda', 'Always .usda (text)', settings.target === 'usda', () => { settings.target = 'usda' }),
      radio('target', 'usdc', 'Always .usdc (binary)', settings.target === 'usdc', () => { settings.target = 'usdc' }),
      check('Keep the .usd extension for .usd files', settings.keepUsd, on => { settings.keepUsd = on }, '--usdFormat')),
    el('fieldset', {}, el('legend', {}, 'Flatten'),
      radio('flatten', 'none', 'No, just this layer', settings.flatten === 'none', () => { settings.flatten = 'none' }),
      el('label', {}, radioInput('stage'), ' The composed stage ', el('code', {}, '--flatten')),
      el('label', {}, radioInput('layerStack'), ' The root layer stack ', el('code', {}, '--flattenLayerStack')),
      ...(flattening ? [check('Skip the source file comment', settings.skipSourceFileComment, on => { settings.skipSourceFileComment = on }, '--skipSourceFileComment')] : []),
      ...(settings.flatten === 'stage' ? [el('label', { className: 'mask' }, 'Only these prims ', el('code', {}, '--mask'), mask)] : [])),
    el('p', { className: 'hint' }, 'Flattening a file that references others needs them too: drop them together, or a whole folder.'))
}
function radioInput(value: Flatten) {
  const input = el('input', { type: 'radio', name: 'flatten', value, checked: settings.flatten === value })
  input.addEventListener('change', () => { if (input.checked) { settings.flatten = value; saveSettings(); refreshPanel() } })
  return input
}
refreshPanel()
// --------------------------------------------------------------- the yard

const cat = await makeCat()

/** The middle of `chip` in yard pixels. */
function centerOf(chip: HTMLElement): [number, number] {
  const r = chip.getBoundingClientRect(), y = yard.getBoundingClientRect()
  return [r.left - y.left + r.width / 2, r.top - y.top + r.height / 2]
}
/** Lifts `chip` out of its stack to float in the yard where it is. */
function lift(chip: HTMLElement): void {
  const [x, y] = centerOf(chip)
  chip.classList.add('floating')
  yard.append(chip)
  chip.style.left = `${x}px`
  chip.style.top = `${y}px`
}
/** Flies a floating chip to (x, y) in the yard. */
async function flyTo(chip: HTMLElement, x: number, y: number, ms: number): Promise<void> {
  const [fx, fy] = centerOf(chip)
  chip.style.left = `${x}px`
  chip.style.top = `${y}px`
  if (reducedMotion()) return
  await chip.animate([{ transform: `translate(${fx - x}px, ${fy - y}px)` }, { transform: 'translate(0, 0)' }],
    { duration: ms, easing: 'cubic-bezier(.3,.1,.3,1)' }).finished
}
/** Where the next result lands: on top of the right-hand stack. */
function outboxLanding(chip: HTMLElement): [number, number] {
  const top = outbox.firstElementChild as HTMLElement | null
  const box = outbox.getBoundingClientRect(), y = yard.getBoundingClientRect()
  const h = chip.offsetHeight
  const x = box.left - y.left + box.width / 2
  if (top) { const [, ty] = centerOf(top); return [x, ty - h - 6] }
  return [x, box.bottom - y.top - h / 2 - 2]
}
/** `point` moved just enough that `chip`, glowing and bobbing around it,
 *  stays inside the yard (the 3D hover point can project near an edge). */
function insideYard(chip: HTMLElement, [x, y]: [number, number]): [number, number] {
  const glow = 24 // the glow's spread plus the bob's scale
  const hw = chip.offsetWidth * 0.56 + glow, hh = chip.offsetHeight * 0.56 + glow
  const w = yard.clientWidth, h = yard.clientHeight
  return [Math.min(Math.max(x, hw), w - hw), Math.min(Math.max(y, hh), h - hh)]
}
const frames = (n: number) => new Promise<void>(resolve => { const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step)); requestAnimationFrame(step) })

interface Job {
  name: string
  input: string
  chip: HTMLElement
  /** Runs usdcat (when the file reaches the cat). */
  run: () => Promise<{ code: number, bytes: Uint8Array | undefined, output: string, format: 'usda' | 'usdc' }>
}
const jobs: Job[] = []
let busy = false
let serial = 0
const done: { name: string, bytes: Uint8Array, chip: HTMLElement, input: string }[] = []

/** Keeps the newest KEEP results: older chips leave the yard, and their
 *  bytes and the files they came from are let go. */
function cycle(): void {
  while (done.length > KEEP) {
    const old = done.shift()!
    old.chip.classList.add('leaving')
    setTimeout(() => old.chip.remove(), reducedMotion() ? 0 : 450)
    if (old.input.startsWith('/files/') && !done.some(d => d.input === old.input) && !jobs.some(j => j.input === old.input)) forgetFiles([old.input])
  }
  saveAll.hidden = done.length < 2
}

function chipFor(name: string, format: Format | 'usdc' | 'usda'): HTMLElement {
  return el('div', { className: `chip ${format}` }, el('span', { className: 'chip-name' }, name))
}

/** Queues `input` for the cat; usdcat runs when the file reaches it. */
async function convert(input: string, name: string): Promise<void> {
  const bytes = await readFile(input)
  const format = bytes ? sniff(bytes) : 'unknown'
  const { output: outName, format: outFormat, usdFormat } = plan(name, format)
  const output = `/out/${++serial}/${outName}`
  const argv = [
    ...(settings.flatten === 'stage' ? ['--flatten'] : settings.flatten === 'layerStack' ? ['--flattenLayerStack'] : []),
    ...(settings.flatten !== 'none' && settings.skipSourceFileComment ? ['--skipSourceFileComment'] : []),
    ...(settings.flatten === 'stage' && settings.mask ? ['--mask', settings.mask] : []),
    ...(usdFormat ? ['--usdFormat', usdFormat] : []),
    '-o', output, input,
  ]
  const chip = chipFor(name, format)
  inbox.append(chip)
  const run = async () => {
    const lines: string[] = []
    const started = performance.now()
    const code = await runTool(usdcat, argv, { stdout: t => lines.push(t), stderr: t => lines.push(t) })
    const ms = Math.round(performance.now() - started)
    log.append(el('span', { className: 'cmd' }, `$ usdcat ${argv.map(a => /[\s'"]/.test(a) ? `'${a}'` : a).join(' ')}\n`),
      el('span', { className: code === 0 ? 'out' : 'err' }, lines.join('') || (code === 0 ? `wrote ${outName}\n` : '')),
      el('span', { className: 'time' }, `(${ms} ms)\n`))
    if (code !== 0) logBox.open = true
    return { code, bytes: code === 0 ? takeOutput(output) : undefined, output: outName, format: outFormat }
  }
  jobs.push({ name, input, chip, run })
  if (!busy) void work()
}

/** A file always glows at least this long, so even an instant conversion
 *  shows; otherwise the show lasts as long as usdcat does. */
const MIN_GLOW = 350

async function work(): Promise<void> {
  busy = true
  while (jobs.length) {
    const job = jobs.shift()!
    // The cat lifts the file out of the inbox and draws it in front of itself.
    lift(job.chip)
    cat.watch(job.chip)
    cat.telekinesis(true)
    job.chip.classList.add('levitating')
    await flyTo(job.chip, ...insideYard(job.chip, cat.holdPoint()), 450)
    // Paint the glowing state, then convert: a usdcat run holds the page's
    // main thread, so this frame stays up while it runs.
    await frames(2)
    const started = performance.now()
    const result = await job.run()
    const left = MIN_GLOW - (performance.now() - started)
    if (left > 0 && !reducedMotion()) await new Promise(resolve => setTimeout(resolve, left))
    job.chip.classList.remove('levitating')
    if (result.code !== 0 || !result.bytes) {
      job.chip.classList.add('failed')
      job.chip.title = 'usdcat could not convert this file; see “What usdcat printed”.'
      if (!jobs.length) cat.telekinesis(false)
      await cat.puzzle()
    } else {
      job.chip.className = `chip ${result.format} floating`
      job.chip.querySelector('.chip-name')!.textContent = result.output
      job.chip.append(el('span', { className: 'chip-size' }, size(result.bytes.byteLength)))
    }
    if (!jobs.length) cat.telekinesis(false)
    await flyTo(job.chip, ...outboxLanding(job.chip), 500)
    job.chip.classList.remove('floating')
    job.chip.style.left = job.chip.style.top = ''
    outbox.prepend(job.chip)
    if (!jobs.length) setTimeout(() => { if (!busy) cat.watch(null) }, 900)
    if (result.bytes) {
      const bytes = result.bytes
      done.push({ name: result.output, bytes, chip: job.chip, input: job.input })
      job.chip.classList.add('result')
      const download = el('button', { type: 'button', className: 'chip-action', title: `Download ${result.output}`, ariaLabel: `Download ${result.output}` }, '↓')
      const view = el('button', { type: 'button', className: 'chip-action', title: `Open ${result.output} in TypeScript usdview`, ariaLabel: `Open ${result.output} in usdview` }, 'usdview')
      download.addEventListener('click', () => void saveFile(result.output, bytes))
      view.addEventListener('click', () => openInUsdview(result.output, bytes))
      job.chip.append(download, view)
      cycle()
    } else setTimeout(() => job.chip.remove(), 6000)
  }
  busy = false
}

/** TypeScript usdview, next to the tool pages as on andrew.beer (/s/usdview
 *  beside /s/usd-tools), or where ?usdview= says. */
const usdviewUrl = new URL(new URLSearchParams(location.search).get('usdview') ?? '../../usdview/', location.href)

/** Opens usdview in a new tab and hands it the file: usdview (?open=handoff)
 *  says when it is ready, then is sent the bytes (usdview's main.ts). */
function openInUsdview(name: string, bytes: Uint8Array): void {
  const url = new URL(usdviewUrl)
  url.searchParams.set('open', 'handoff')
  const tab = window.open(url, '_blank')
  if (!tab) { log.append(el('span', { className: 'err' }, 'The browser blocked the new usdview tab.\n')); logBox.open = true; return }
  const timer = setTimeout(() => { removeEventListener('message', ready) }, 60_000)
  function ready(event: MessageEvent): void {
    if (event.source !== tab || (event.data as { type?: unknown } | null)?.type !== 'usdview.ready') return
    removeEventListener('message', ready)
    clearTimeout(timer)
    const copy = bytes.slice().buffer
    tab!.postMessage({ type: 'usdview.open-file', name, bytes: copy }, usdviewUrl.origin, [copy])
  }
  addEventListener('message', ready)
}

const size = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`

saveAll.addEventListener('click', async () => { for (const f of done) await saveFile(f.name, f.bytes) })

// ------------------------------------------------------------- input

/** Mounts dropped or picked files and converts their USD layers. A folder
 *  converts its root layer (the one named after it, else the shallowest);
 *  its other files are there for what the root references. */
async function accept(entries: DroppedFile[]): Promise<void> {
  if (!entries.length) return
  for (const path of rootsOf(addFilesAt(entries))) await convert(path, path.split('/').at(-1)!)
}

picker.addEventListener('change', () => { void accept(pickedFiles(picker)); picker.value = '' })
const convertSample = (path: string) => void convert(path, path.split('/').at(-1)!)
acceptDrops(files => void accept(files), on => cat.perk(on), convertSample, yard)

// usdcat offers only shapes.usda: a flattened layer big enough that text
// against binary size shows.
const shapes = (await loadSamples()).find(sample => sample.name === 'shapes')
if (shapes) {
  const path = sampleRootPath(shapes)
  const bytes = (await readFile(path))?.byteLength
  const chip = el('div', { className: 'chip usda sample-chip', draggable: true, role: 'button', tabIndex: 0,
    title: 'Drag onto the yard to convert; click to download' },
    el('span', { className: 'chip-name' }, path.split('/').at(-1)!), ...(bytes ? [el('span', { className: 'chip-size' }, size(bytes))] : []))
  chip.addEventListener('dragstart', e => { e.dataTransfer?.setData(SAMPLE_DRAG, path); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy' })
  const download = async () => { const data = await readFile(path); if (data) await saveFile(path.split('/').at(-1)!, data) }
  chip.addEventListener('click', () => void download())
  chip.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void download() } })
  sampleTray.append(chip)
}
