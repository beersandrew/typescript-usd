// usdresolve with a homing pigeon: the files of a sample or a dropped folder
// are houses in a little town; the asset paths a layer names are letters.
// Send one and TypeScript USD's usdresolve (pxr/usd/bin/usdresolve) resolves
// it, anchored to the layer that names it (--anchorPath) or with the root
// layer's folder as the search context (--createContextForAsset); the
// pigeon carries the letter from that layer's house to the house it resolves
// to, or circles and comes back when it resolves to nothing.
import './files'
import './plugins'
import './page.css'
import './playful.css'
import './usdresolve.css'
import { UsdUtilsExtractExternalReferences } from 'typescript-usd/usdUtils'
import { addFilesAt, filesUnder, loadSamples, sampleRootPath } from './files'
import { runTool } from './run-tool'
import { el } from './dom'
import { acceptDrops, cannotPickFolders, isUsd, pickedFiles, rootsOf, type DroppedFile } from './drop'
import { reducedMotion, rememberedSettings, settingsGear } from './playful'

const { usdresolve } = await import('../../../packages/usd/pxr/usd/bin/usdresolve/usdresolve.ts')

const { settings, save: saveSettings } = rememberedSettings('usd-tools.usdresolve.settings', { mode: 'anchor' as 'anchor' | 'context' })

// ------------------------------------------------------------------ page

document.title = 'usdresolve — TypeScript USD'
const host = document.querySelector('main')!
host.classList.add('usdresolve')

const { gear, panel } = settingsGear('usdresolve settings')
const modeRadio = (value: 'anchor' | 'context', label: string, arg: string) => {
  const input = el('input', { type: 'radio', name: 'mode', value, checked: settings.mode === value })
  input.addEventListener('change', () => { if (input.checked) { settings.mode = value; saveSettings() } })
  return el('label', { className: 'flag-row' }, input, ` ${label} `, el('code', {}, arg))
}
panel.append(el('h2', {}, 'Settings'),
  el('fieldset', {}, el('legend', {}, 'Resolve an address'),
    modeRadio('anchor', 'From the layer that names it', '--anchorPath'),
    modeRadio('context', 'With the root layer’s folder as the search path', '--createContextForAsset')),
  el('p', { className: 'hint' }, 'As a layer reads it, a path is anchored to that layer. A path without ./ is also looked for along the search path.'))

const picker = el('input', { type: 'file', multiple: true, id: 'picker', hidden: true })
const folderPicker = el('input', { type: 'file', multiple: true, id: 'folder-picker', hidden: true, webkitdirectory: true })
const drop = el('div', { className: 'drop' },
  el('strong', {}, 'Drop a USD folder'),
  el('span', {}, 'its files become a town, the paths its layers name become letters'),
  el('span', { className: 'pick' },
    el('label', { htmlFor: 'picker', className: 'link' }, 'choose files'),
    ...(cannotPickFolders() ? [] : [' · ', el('label', { htmlFor: 'folder-picker', className: 'link' }, 'choose a folder')])))
const sampleSelect = el('select', { ariaLabel: 'Sample' }, el('option', { value: '', textContent: 'Try a sample…' }))

const layerSelect = el('select', { ariaLabel: 'Letters from' })
const letters = el('div', { className: 'letters' })
const address = el('input', { type: 'text', placeholder: 'write an address, e.g. ./payload.usda', spellcheck: false, autocapitalize: 'off', ariaLabel: 'Asset path' })
const send = el('button', { type: 'button', className: 'send' }, 'Send')
const mailbag = el('section', { className: 'mailbag' },
  el('h2', {}, 'Letters'),
  el('label', { className: 'from' }, 'from ', layerSelect),
  letters,
  el('div', { className: 'write' }, address, send))

const town = el('div', { className: 'town' })
const pigeon = el('div', { className: 'pigeon', ariaHidden: 'true' })
pigeon.innerHTML = PIGEON_SVG()
const result = el('p', { className: 'result' }, 'Pick a sample or drop a folder, then send a letter.')

const log = el('div', { className: 'log' })
const logBox = el('details', { className: 'log-box' }, el('summary', {}, 'What usdresolve printed'), log)

host.append(
  el('header', { className: 'top' },
    el('a', { href: '../', className: 'home' }, 'USD tools'),
    el('h1', {}, 'usdresolve'),
    gear, panel),
  el('p', { className: 'about' }, 'Finds the file an asset path means. Runs TypeScript USD’s usdresolve right here; nothing leaves the device.'),
  drop, picker, folderPicker,
  el('div', { className: 'row samples' }, sampleSelect),
  el('div', { className: 'post' }, mailbag, el('div', { className: 'town-box' }, town, result)),
  logBox,
  el('p', { className: 'credit' }, 'Samples: USD Museum exhibits (CC0 1.0) and the witches’ heath from TypeScript USD’s Stagehand example.'))

function PIGEON_SVG(): string {
  return `<svg viewBox="0 0 64 48">
    <g class="pg-wing-back"><path d="M28 22 Q20 4 6 6 Q16 16 22 26 Z"/></g>
    <path class="pg-tail" d="M12 30 L2 36 L4 28 Z"/>
    <ellipse class="pg-body" cx="28" cy="29" rx="18" ry="11"/>
    <path class="pg-neck" d="M38 22 Q46 22 47 30 Q42 34 36 30 Z"/>
    <circle class="pg-head" cx="47" cy="19" r="7"/>
    <circle class="pg-eye" cx="49" cy="18" r="1.6"/>
    <path class="pg-beak" d="M53 19 L60 21 L53 22 Z"/>
    <g class="pg-wing"><path d="M26 24 Q18 8 4 10 Q14 20 22 30 Z"/></g>
    <rect class="pg-letter" x="22" y="34" width="14" height="9" rx="1.5"/>
    <path class="pg-letter-flap" d="M22 34 L29 39 L36 34"/>
    <path class="pg-feet" d="M26 39 v5 M31 39 v5"/>
  </svg>`
}

// ------------------------------------------------------------------ town

let root = ''
let folder = ''
const houses = new Map<string, HTMLElement>()

function houseFor(path: string): HTMLElement {
  const name = path.slice(folder.length)
  const kind = isUsd(name) ? (name.toLowerCase().endsWith('.usdz') ? 'package' : 'layer') : /\.(png|jpe?g|exr|hdr|tga|tiff?|bmp)$/i.test(name) ? 'image' : 'other'
  const house = el('div', { className: `house ${kind}${path === root ? ' root' : ''}`, title: path },
    el('span', { className: 'roof' }), el('span', { className: 'walls' }, el('span', { className: 'door' })),
    el('span', { className: 'house-name' }, name.split('/').at(-1)!))
  return house
}

function buildTown(files: string[]): void {
  town.replaceChildren()
  houses.clear()
  // Streets: one per folder, the root's first.
  const streets = new Map<string, string[]>()
  for (const f of files) {
    const dir = f.slice(folder.length, f.lastIndexOf('/') + 1) || './'
    streets.set(dir, [...streets.get(dir) ?? [], f])
  }
  for (const [dir, list] of [...streets].sort(([a], [b]) => (a === './' ? -1 : b === './' ? 1 : a.localeCompare(b)))) {
    const street = el('div', { className: 'street' }, el('span', { className: 'street-name' }, dir === './' ? 'Main Street' : `${dir.replace(/\/$/, '')} Lane`))
    for (const f of list.sort()) {
      const house = houseFor(f)
      houses.set(f, house)
      street.append(house)
    }
    town.append(street)
  }
  town.append(pigeon)
  pigeon.classList.remove('flying', 'lost')
  requestAnimationFrame(() => perch(houses.get(root)))
}

const centerOf = (house: HTMLElement) => {
  const t = town.getBoundingClientRect(), h = house.getBoundingClientRect()
  return { x: h.left - t.left + h.width / 2 + town.scrollLeft, y: h.top - t.top + town.scrollTop }
}
let at = { x: 0, y: 0 }
function perch(house: HTMLElement | undefined): void {
  if (!house) return
  at = centerOf(house)
  pigeon.style.transform = `translate(${at.x - 28}px, ${at.y - 38}px)`
}

/** Flies from where the pigeon is to `house` (or out and back when there is
 *  none), in an arc. */
async function fly(to: HTMLElement | undefined, from: HTMLElement | undefined): Promise<void> {
  if (from) perch(from)
  const start = { ...at }
  pigeon.classList.add('flying')
  if (reducedMotion()) { perch(to ?? from); pigeon.classList.remove('flying'); return }
  if (to) {
    const end = centerOf(to)
    pigeon.classList.toggle('left', end.x < start.x)
    const top = Math.max(-6, Math.min(start.y, end.y) - 70)
    const mid = { x: (start.x + end.x) / 2, y: top }
    const tr = (p: { x: number, y: number }) => `translate(${p.x - 28}px, ${p.y - 38}px)`
    await pigeon.animate([{ transform: tr(start) }, { transform: tr(mid) }, { transform: tr(end) }],
      { duration: Math.max(900, Math.hypot(end.x - start.x, end.y - start.y) * 2.2), easing: 'ease-in-out' }).finished
    at = end
    pigeon.style.transform = tr(end)
  } else {
    // Nowhere to go: a loop over town and back home.
    pigeon.classList.add('lost')
    const tr = (dx: number, dy: number) => `translate(${start.x - 28 + dx}px, ${Math.max(-6, start.y - 38 + dy)}px)`
    await pigeon.animate([{ transform: tr(0, 0) }, { transform: tr(60, -80) }, { transform: tr(-50, -110) }, { transform: tr(-70, -40) }, { transform: tr(0, 0) }],
      { duration: 1800, easing: 'ease-in-out' }).finished
  }
  pigeon.classList.remove('flying', 'left')
}

// --------------------------------------------------------------- letters

/** The asset paths `layer` names: sublayers, references and payloads, and
 *  asset-valued attributes (UsdUtilsExtractExternalReferences). */
async function lettersIn(layer: string): Promise<{ kind: string, path: string }[]> {
  const subLayers: string[] = [], references: string[] = [], payloads: string[] = []
  await runTool(async () => { await UsdUtilsExtractExternalReferences(layer, subLayers, references, payloads); return 0 }, [], { stdout: () => {}, stderr: () => {} })
  const seen = new Set<string>()
  const out: { kind: string, path: string }[] = []
  for (const [kind, list] of [['sublayer', subLayers], ['payload', payloads], ['reference or asset', references]] as const) {
    for (const path of list) if (!seen.has(path)) { seen.add(path); out.push({ kind, path }) }
  }
  return out
}

async function showLetters(): Promise<void> {
  const layer = layerSelect.value
  letters.replaceChildren(el('p', { className: 'hint' }, 'Reading the layer…'))
  const list = await lettersIn(layer)
  letters.replaceChildren(...(list.length ? list.map(({ kind, path }) => {
    const letter = el('button', { type: 'button', className: `letter ${kind.split(' ')[0]}`, title: `Send @${path}@` },
      el('span', { className: 'stamp' }), el('span', { className: 'addr' }, `@${path}@`), el('span', { className: 'kind' }, kind))
    letter.addEventListener('click', () => void deliver(path, layer))
    return letter
  }) : [el('p', { className: 'hint' }, 'This layer names no other files. Write an address below.')]))
}

// ------------------------------------------------------------- delivering

let busy = Promise.resolve()
function deliver(path: string, from: string): Promise<void> {
  busy = busy.then(() => deliverNow(path, from))
  return busy
}

async function deliverNow(path: string, from: string): Promise<void> {
  for (const h of houses.values()) h.classList.remove('delivered')
  const argv = settings.mode === 'anchor' ? ['--anchorPath', from, path] : ['--createContextForAsset', root, path]
  let stdout = '', stderr = ''
  const run = el('div', { className: 'run' }, el('span', { className: 'cmd' }, `$ usdresolve ${argv.map(a => /[\s'"]/.test(a) ? `'${a}'` : a).join(' ')}\n`))
  log.append(run)
  result.textContent = `Sending @${path}@…`
  const code = await runTool(usdresolve, argv, {
    stdout: t => { stdout += t; run.append(el('span', { className: 'out' }, t)) },
    stderr: t => { stderr += t; run.append(el('span', { className: 'err' }, t)) },
  })
  run.dataset.exit = String(code)
  const resolved = stdout.trim()
  // A path inside a package lands on the package's house.
  const house = resolved ? houses.get(resolved) ?? houses.get(resolved.replace(/\[.*\]$/, '')) : undefined
  await fly(house, houses.get(from) ?? houses.get(root))
  if (code === 0 && resolved) {
    house?.classList.add('delivered')
    result.replaceChildren(el('code', {}, `@${path}@`), ' → ', el('code', { className: 'resolved' }, resolved),
      ...(house ? [] : [el('span', { className: 'hint' }, ' (outside this town)')]))
  } else {
    result.replaceChildren(el('code', {}, `@${path}@`), ' → ', el('span', { className: 'unresolved' }, 'no such address'),
      ...(stderr ? [el('span', { className: 'hint' }, ` — ${stderr.trim()}`)] : []))
  }
}

send.addEventListener('click', () => { if (address.value.trim()) void deliver(address.value.trim(), layerSelect.value) })
address.addEventListener('keydown', e => { if (e.key === 'Enter') send.click() })
layerSelect.addEventListener('change', () => void showLetters())

// ---------------------------------------------------------------- input

async function open(rootLayer: string, folderPath: string, files: string[]): Promise<void> {
  root = rootLayer
  folder = folderPath
  buildTown(files)
  const layers = files.filter(f => isUsd(f) && !f.toLowerCase().endsWith('.usdz'))
  layerSelect.replaceChildren(...layers.map(l => el('option', { value: l, textContent: l.slice(folder.length), selected: l === root })))
  result.textContent = 'Send a letter: the pigeon takes it to the file it means.'
  await showLetters()
}

function accept(files: DroppedFile[]): void {
  const paths = addFilesAt(files)
  const [first] = rootsOf(paths)
  if (!first) return
  void open(first, '/files/', paths)
}
picker.addEventListener('change', () => { accept(pickedFiles(picker)); picker.value = '' })
folderPicker.addEventListener('change', () => { accept(pickedFiles(folderPicker)); folderPicker.value = '' })
acceptDrops(accept)

const samples = await loadSamples()
for (const sample of samples) sampleSelect.append(el('option', { value: sampleRootPath(sample), textContent: sample.title }))
sampleSelect.addEventListener('change', () => {
  const rootLayer = sampleSelect.value
  sampleSelect.value = ''
  if (!rootLayer) return
  const dir = rootLayer.slice(0, rootLayer.indexOf('/', '/samples/'.length) + 1)
  void open(rootLayer, dir, filesUnder(dir))
})
addEventListener('resize', () => perch(houses.get(root)))
