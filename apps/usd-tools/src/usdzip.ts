// usdzip as a pencil case: drop a USD file or a folder and its files land on
// the desk; the ones the root layer uses fly into an open pencil case, the
// zipper closes, and the case is the .usdz, tagged with its name to save.
// Each package is a real run of TypeScript USD's usdzip,
// `usdzip --asset <root> /out/<n>/<name>.usdz --list -` (pxr/bin/usdzip):
// --asset gathers the root layer and its dependencies
// (UsdUtilsCreateNewUsdzPackage), --list prints what went in. It writes
// through the page's in-memory filesystem (memfs.ts).
import './files'
import './memfs'
import './plugins'
import './page.css'
import './playful.css'
import './usdzip.css'
import { addFilesAt, filesUnder, loadSamples, readFile, sampleRootPath } from './files'
import { makeMemDir, readMemFile, removeMemTree, writeMemFile } from './memfs'
import { runTool } from './run-tool'
import { el } from './dom'
import { acceptDrops, cannotPickFolders, isUsd, pickedFiles, pickRoot, stem, type DroppedFile } from './drop'
import { pause, reducedMotion, rememberedSettings, saveFile, settingsGear } from './playful'

const { usdzip } = await import('../../../packages/usd/pxr/bin/usdzip/usdzip.ts')

// ---------------------------------------------------------------- settings

const { settings, save: saveSettings } = rememberedSettings('usd-tools.usdzip.settings', { checkCompliance: false })

const base = (path: string) => path.split('/').at(-1)!
const size = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`
const wait = pause

// ------------------------------------------------------------------ page

document.title = 'usdzip — TypeScript USD'
const host = document.querySelector('main')!
host.classList.add('usdzip')

const { gear, panel } = settingsGear('usdzip settings')
const compliance = el('input', { type: 'checkbox', checked: settings.checkCompliance })
compliance.addEventListener('change', () => { settings.checkCompliance = compliance.checked; saveSettings() })
panel.append(
  el('h2', {}, 'Settings'),
  el('label', {}, compliance, ' Check compliance before zipping ', el('code', {}, '--checkCompliance')),
  el('p', { className: 'hint' }, 'The package holds the root layer and everything it references, as usdzip --asset gathers them. Drop the whole folder so those files are there.'))
const picker = el('input', { type: 'file', multiple: true, id: 'picker', hidden: true })
const folderPicker = el('input', { type: 'file', multiple: true, id: 'folder-picker', hidden: true, webkitdirectory: true })
const drop = el('div', { className: 'drop' },
  el('strong', {}, 'Drop a USD file or its folder'),
  el('span', {}, 'Everything the root layer uses gets zipped into a .usdz'),
  el('span', { className: 'pick' },
    el('label', { htmlFor: 'picker', className: 'link' }, 'choose files'),
    ' · ',
    el('label', { htmlFor: 'folder-picker', className: 'link folder' }, 'choose a folder')))
if (cannotPickFolders()) {
  drop.querySelector('.folder')!.previousSibling!.remove()
  drop.querySelector('.folder')!.remove()
}
const sampleSelect = el('select', { ariaLabel: 'Sample' }, el('option', { value: '', textContent: 'Try a sample…' }))
const rootSelect = el('select', { ariaLabel: 'Root layer', hidden: true })

const desk = el('div', { className: 'desk' })
const papers = el('div', { className: 'papers' })
const caseBox = el('div', { className: 'case-box' })
caseBox.innerHTML = CASE_SVG()
const tag = el('button', { className: 'case-tag', type: 'button', hidden: true })
caseBox.append(tag)
const deskNote = el('p', { className: 'desk-note' }, 'The pencil case is empty.')
desk.append(papers, caseBox, deskNote)
const pencilCase = caseBox.querySelector('svg')!

const log = el('pre', { className: 'log' })
const logBox = el('details', { className: 'log-box' }, el('summary', {}, 'What usdzip printed'), log)

host.append(
  el('header', { className: 'top' },
    el('a', { href: '../', className: 'home' }, 'USD tools'),
    el('h1', {}, 'usdzip'),
    gear, panel),
  el('p', { className: 'about' }, 'Packs a USD file and everything it uses into one .usdz. Runs TypeScript USD’s usdzip right here; nothing leaves the device.'),
  drop, picker, folderPicker,
  el('div', { className: 'row samples' }, sampleSelect, rootSelect),
  desk,
  logBox,
  el('p', { className: 'credit' }, 'Samples: USD Museum exhibits (CC0 1.0) and the witches’ heath from TypeScript USD’s Stagehand example.'))

// --------------------------------------------------------- the pencil case

function CASE_SVG(): string {
  return `
<svg class="pencil-case open" viewBox="0 0 320 170" aria-label="Pencil case">
  <defs>
    <linearGradient id="fabric" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5d86d6"/><stop offset="1" stop-color="#3e64b3"/>
    </linearGradient>
  </defs>
  <ellipse class="case-shadow" cx="160" cy="158" rx="128" ry="8"/>
  <g class="case-body">
    <g class="case-mouth"><path d="M42 60 Q160 6 278 60 Q160 74 42 60 Z" class="mouth-dark"/></g>
    <rect x="22" y="56" width="276" height="96" rx="44" fill="url(#fabric)"/>
    <rect x="34" y="66" width="252" height="76" rx="36" class="stitch"/>
    <g class="case-patch" transform="translate(160 106) rotate(-4)">
      <rect x="-38" y="-15" width="76" height="30" rx="7"/>
      <text y="6" text-anchor="middle">USDZ</text>
    </g>
    <line x1="44" y1="58" x2="276" y2="58" class="teeth"/>
    <line x1="44" y1="58" x2="276" y2="58" class="teeth-closed" pathLength="100"/>
    <g class="slider"><rect x="-9" y="51" width="18" height="13" rx="4"/><path d="M0 64 v12" class="pull-cord"/><rect x="-5" y="74" width="10" height="16" rx="5" class="pull"/></g>
  </g>
</svg>`
}

function setOpen(open: boolean): void {
  pencilCase.classList.toggle('open', open)
  pencilCase.classList.toggle('closed', !open)
}

/** Slides the zipper across, closing the case. */
async function zip(): Promise<void> {
  pencilCase.classList.add('zipping')
  setOpen(false)
  await wait(1100)
  pencilCase.classList.remove('zipping')
}

/** Flies a paper on the desk into the case's mouth. */
async function flyIn(paper: HTMLElement): Promise<void> {
  const from = paper.getBoundingClientRect()
  const svg = pencilCase.getBoundingClientRect()
  const to = { x: svg.left + svg.width * (0.3 + Math.random() * 0.4), y: svg.top + svg.height * 0.28 }
  const dx = to.x - (from.left + from.width / 2), dy = to.y - (from.top + from.height / 2)
  if (!reducedMotion()) {
    const flight = paper.animate([
      { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 70}px) rotate(${(Math.random() - 0.5) * 50}deg) scale(.85)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${(Math.random() - 0.5) * 90}deg) scale(.25)`, opacity: 0 },
    ], { duration: 650, easing: 'cubic-bezier(.3,.1,.4,1)', fill: 'forwards' })
    await flight.finished
    pencilCase.classList.remove('gulp')
    void pencilCase.getBoundingClientRect()
    pencilCase.classList.add('gulp')
  }
  paper.classList.add('packed')
}

// ----------------------------------------------------------------- jobs

let serial = 0
let working = Promise.resolve()

function paperFor(path: string, folder: string): HTMLElement {
  const name = path.slice(folder.length)
  const kind = /\.(png|jpe?g|exr|hdr|tga|tiff?|bmp)$/i.test(name) ? 'image' : isUsd(name) ? 'layer' : 'other'
  return el('div', { className: `paper ${kind}`, title: name }, el('span', {}, name))
}

/** Lays `files` (all under `folder`) on the desk and zips `root`. */
function pack(root: string, folder: string, files: string[]): void {
  working = working.then(() => packNow(root, folder, files)).catch(error => {
    log.append(el('span', { className: 'err' }, `${error instanceof Error ? error.message : String(error)}\n`))
  })
}

async function packNow(root: string, folder: string, files: string[]): Promise<void> {
  // A fresh desk and an open, empty case.
  tag.hidden = true
  setOpen(true)
  papers.replaceChildren()
  deskNote.textContent = 'Zipping…'
  const paperByPath = new Map<string, HTMLElement>()
  for (const path of files) {
    const paper = paperFor(path, folder)
    paper.classList.toggle('root', path === root)
    paperByPath.set(path, paper)
    papers.append(paper)
  }
  for (const [i, paper] of [...paperByPath.values()].entries()) {
    paper.style.setProperty('--tilt', `${((i * 37) % 11) - 5}deg`)
  }

  // The files must be on the filesystem usdzip reads them from.
  for (const path of files) {
    const bytes = await readFile(path)
    if (bytes) writeMemFile(path, bytes)
  }
  const n = ++serial
  const usdzName = `${stem(base(root))}.usdz`
  const out = `/out/${n}/${usdzName}`
  makeMemDir(`/out/${n}`)
  const argv = [...(settings.checkCompliance ? ['--checkCompliance'] : []), '--asset', root, out, '--list', '-']
  let stdout = ''
  const lines: string[] = []
  const code = await runTool(usdzip, argv, {
    stdout: t => { stdout += t; lines.push(t) },
    stderr: t => lines.push(t),
  })
  log.append(el('span', { className: 'cmd' }, `$ usdzip ${argv.join(' ')}\n`), el('span', { className: code === 0 ? 'out' : 'err' }, lines.join('')))
  const bytes = code === 0 ? readMemFile(out) : undefined
  if (!bytes) {
    logBox.open = true
    deskNote.textContent = 'usdzip could not make a package; see what it printed below.'
    pencilCase.classList.add('sad')
    await wait(900)
    pencilCase.classList.remove('sad')
    return
  }
  removeMemTree(`/out/${n}`)

  // What went in, as usdzip --list printed it: paths inside the package,
  // relative to the root layer's folder.
  const packed = stdout.split('\n').map(s => s.trim()).filter(Boolean)
  const rootDir = root.slice(0, root.lastIndexOf('/') + 1)
  const order = packed.map(inside => paperByPath.get(rootDir + inside)).filter((p): p is HTMLElement => !!p)
  for (const paper of order) await flyIn(paper)
  for (const [, paper] of paperByPath) if (!paper.classList.contains('packed')) paper.classList.add('left-out')
  // Packed files that were not on the desk (none usually) still count.
  await wait(200)
  await zip()

  const leftOut = files.length - order.length
  deskNote.textContent = `${packed.length} file${packed.length === 1 ? '' : 's'} zipped` +
    (leftOut > 0 ? `; ${leftOut} not used by ${base(root)} stayed on the desk.` : '.')
  tag.replaceChildren(el('span', { className: 'tag-name' }, usdzName), el('span', { className: 'tag-size' }, size(bytes.byteLength)))
  tag.title = `Save ${usdzName}`
  tag.hidden = false
  tag.onclick = () => void saveFile(usdzName, bytes, 'model/vnd.usdz+zip')
  caseBox.onclick = e => { if (e.target !== tag && !tag.contains(e.target as Node)) void saveFile(usdzName, bytes, 'model/vnd.usdz+zip') }
}

// ---------------------------------------------------------------- input

function offerRoots(layers: string[], root: string, folder: string, files: string[]): void {
  rootSelect.replaceChildren(...layers.map(l => el('option', { value: l, textContent: `Root: ${l.slice(folder.length)}`, selected: l === root })))
  rootSelect.hidden = layers.length < 2
  rootSelect.onchange = () => pack(rootSelect.value, folder, files)
}

async function accept(entries: DroppedFile[]): Promise<void> {
  if (!entries.length) return
  const paths = addFilesAt(entries)
  const layers = paths.filter(isUsd).filter(p => !p.toLowerCase().endsWith('.usdz'))
  const root = pickRoot(layers)
  if (!root) {
    deskNote.textContent = 'That had no USD layer to package.'
    return
  }
  const folder = '/files/'
  offerRoots(layers, root, folder, paths)
  pack(root, folder, paths)
}

picker.addEventListener('change', () => { void accept(pickedFiles(picker)); picker.value = '' })
folderPicker.addEventListener('change', () => { void accept(pickedFiles(folderPicker)); folderPicker.value = '' })

acceptDrops(files => void accept(files), on => { if (on) setOpen(true) })

const samples = await loadSamples()
for (const sample of samples) sampleSelect.append(el('option', { value: sampleRootPath(sample), textContent: sample.title }))
sampleSelect.addEventListener('change', () => {
  const root = sampleSelect.value
  sampleSelect.value = ''
  if (!root) return
  const folder = root.slice(0, root.indexOf('/', '/samples/'.length) + 1)
  const files = filesUnder(folder)
  offerRoots(files.filter(isUsd), root, folder, files)
  pack(root, folder, files)
})
