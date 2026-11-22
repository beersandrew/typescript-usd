// usdzip both ways, on a conveyor belt: drop a folder (or its root layer)
// on the scene and it rides into the usdzip machine and comes out a wrapped
// .usdz; drop a .usdz and it comes out a folder.
//
// Folder in: `usdzip --asset <root> /out/<n>/<name>.usdz --list -`
// (pxr/bin/usdzip: --asset gathers the root layer and its dependencies,
// UsdUtilsCreateNewUsdzPackage; --list prints what went in). Package in:
// UsdUtilsExtractUsdzPackage (usdzUtils.py, the Python half of usdzip's
// toolset). The ride takes one base time (conveyor.ts BASE_MS, or
// ?pace=<ms>). Results come off the belt onto the Output pile (the newest
// three), to download, open in TypeScript usdview (a package) or drag back
// in. Everything runs through the page's in-memory filesystem (memfs.ts);
// the scene is conveyor.ts, drawn by Storm.
import './files'
import './memfs'
import './plugins'
import './page.css'
import './playful.css'
import './usdzip.css'
import { addFilesAt, filesUnder, forgetFiles, loadSamples, readFile, sampleRootPath } from './files'
import { makeMemDir, memFilesUnder, readMemFile, removeMemTree, writeMemFile } from './memfs'
import { runTool } from './run-tool'
import { el } from './dom'
import { SAMPLE_DRAG, acceptDrops, cannotPickFolders, isUsd, pickedFiles, pickRoot, stem, type DroppedFile } from './drop'
import { desktopOnlyNote, onDesktop, reducedMotion, rememberedSettings, saveFile, settingsGear } from './playful'
import { licensesUrl, openInUsdview } from './usdview-link'
import type { Conveyor } from './conveyor'

const { usdzip } = await import('../../../packages/usd/pxr/bin/usdzip/usdzip.ts')
const { UsdUtilsExtractUsdzPackage } = await import('typescript-usd/usdUtils')
const { ZipFileWriter } = await import('typescript-usd/sdf')

// ---------------------------------------------------------------- settings

const { settings, save: saveSettings } = rememberedSettings('usd-tools.usdzip.settings', { checkCompliance: false })

const base = (path: string) => path.split('/').at(-1)!
const size = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`
const frames = (n: number) => new Promise<void>(resolve => { const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step)); requestAnimationFrame(step) })
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// ------------------------------------------------------------------ page

document.title = 'usdzip — TypeScript USD'
const host = document.querySelector('main')!
host.classList.add('usdzip', 'desktop-page')

const { gear, panel } = settingsGear('usdzip settings')
const compliance = el('input', { type: 'checkbox', checked: settings.checkCompliance })
compliance.addEventListener('change', () => { settings.checkCompliance = compliance.checked; saveSettings() })
panel.append(
  el('h2', {}, 'Settings'),
  el('label', {}, compliance, ' Check compliance before zipping ', el('code', {}, '--checkCompliance')),
  el('p', { className: 'hint' }, 'A package holds the root layer and everything it references, as usdzip --asset gathers them. Drop the whole folder so those files are there; the root is the layer named after the folder, else the shallowest.'))
const picker = el('input', { type: 'file', multiple: true, id: 'picker', hidden: true })
const folderPicker = el('input', { type: 'file', multiple: true, id: 'folder-picker', hidden: true, webkitdirectory: true })

// The scene is where files are dropped; what waits is on the Input pile,
// what is done on the Output pile.
const hint = el('div', { className: 'reel-hint' },
  el('strong', {}, 'Drop a folder or a .usdz here'),
  el('span', {}, 'folder → .usdz · .usdz → folder · or ',
    el('label', { htmlFor: 'picker', className: 'link' }, 'choose files'),
    ...(cannotPickFolders() ? [] : [' · ', el('label', { htmlFor: 'folder-picker', className: 'link' }, 'a folder')])))
const note = el('div', { className: 'reel-note' })
const inbox = el('div', { className: 'pile inbox', ariaLabel: 'Waiting' })
const outbox = el('div', { className: 'pile outbox', ariaLabel: 'Done', role: 'list' })
const scene = el('div', { className: 'reel-stage', role: 'button', tabIndex: 0, ariaLabel: 'Drop a folder or a .usdz here, or choose files' },
  hint, note, inbox, outbox,
  el('div', { className: 'pile-label in' }, 'Input'),
  el('div', { className: 'pile-label out' }, 'Output', el('span', {}, 'drag it back in to reverse')))

// The one sample, in a card of its own: drag it onto the scene to pack it,
// click it to download its files.
const sampleTray = el('div', { className: 'sample-tray' })
const testCard = el('section', { className: 'test-card' },
  el('h2', {}, 'Test File for Testing!'),
  sampleTray,
  el('p', {}, 'Drag it onto the scene · click to download'))

const log = el('pre', { className: 'log' })
const logBox = el('details', { className: 'log-box' }, el('summary', {}, 'What usdzip printed'), log)

host.append(
  el('header', { className: 'top' }, el('h1', {}, 'usdzip'), gear, panel),
  el('p', { className: 'about' }, 'A folder of USD files to one .usdz and back, by ',
    el('a', { href: 'https://github.com/beersandrew/typescript-usd', target: '_blank', rel: 'noopener' }, 'typescript-usd'),
    '’s usdzip, in your browser. Nothing is uploaded.'),
  picker, folderPicker,
  desktopOnlyNote('belt'),
  scene,
  testCard,
  logBox,
  el('p', { className: 'credit' }, el('a', { href: licensesUrl, target: '_blank', rel: 'noopener' }, 'Licenses')))

/** The Storm scene where the browser has WebGPU; else results just land. */
let belt: Conveyor | undefined
try {
  if (!onDesktop()) throw new Error('a phone or tablet: the page shows its desktop-only note')
  if (!navigator.gpu) throw new Error('no WebGPU')
  const { Conveyor } = await import('./conveyor')
  belt = await Conveyor.create(scene, el('div', { className: 'machine-screen' }))
  scene.classList.add('three-d')
} catch (error) { console.info('usdzip: no 3D scene', error) }

// ----------------------------------------------------------------- jobs

/** Something to pack or unpack: a folder (with its root layer) or a .usdz. */
type Job =
  | { kind: 'folder', name: string, root: string, folder: string, files: string[], chip: HTMLElement }
  | { kind: 'package', name: string, path: string, chip: HTMLElement }

/** A finished result on the Output pile. */
interface Result { chip: HTMLElement, name: string, files: { name: string, bytes: Uint8Array }[], inputs: string[] }

const jobs: Job[] = []
const done: Result[] = []
const results = new Map<string, Result>()
/** How many results the Output pile keeps; older ones go. */
const KEEP = 3
let busy = false
let serial = 0

function chip(kind: string, name: string, detail: string): HTMLElement {
  return el('div', { className: `chip ${kind}` }, el('span', { className: 'chip-name' }, name), ...(detail ? [el('span', { className: 'chip-size' }, detail)] : []))
}

function queue(job: Job): void {
  inbox.append(job.chip)
  jobs.push(job)
  if (!busy) void work()
}

async function work(): Promise<void> {
  busy = true
  while (jobs.length) {
    const job = jobs.shift()!
    hint.classList.add('small')
    note.textContent = ''
    // The input leaves its pile for the middle of the scene.
    await flyTo(job.chip, sourceAt(), 300, true)
    job.chip.remove()
    try {
      const result = job.kind === 'folder' ? await packFolder(job) : await unpackPackage(job)
      if (result) await land(result)
    } catch (error) {
      log.append(el('span', { className: 'err' }, `${error instanceof Error ? error.message : String(error)}\n`))
      logBox.open = true
    }
  }
  busy = false
}

const middle = (): [number, number] => [scene.clientWidth / 2, scene.clientHeight / 2]
const sourceAt = (): [number, number] => belt?.startAt() ?? middle()
const destinationAt = (): [number, number] => belt?.endAt() ?? middle()

/** Flies `chip` (lifted out of its pile into the scene) to (x, y). */
async function flyTo(chip: HTMLElement, [x, y]: [number, number], ms: number, fade = false): Promise<void> {
  const r = chip.getBoundingClientRect(), s = scene.getBoundingClientRect()
  const fx = r.left - s.left + r.width / 2, fy = r.top - s.top + r.height / 2
  chip.classList.add('floating')
  scene.append(chip)
  chip.style.left = `${x}px`; chip.style.top = `${y}px`
  if (reducedMotion()) return
  await chip.animate([{ transform: `translate(${fx - x}px, ${fy - y}px)`, opacity: 1 }, { transform: 'translate(0, 0)', opacity: fade ? 0 : 1 }],
    { duration: ms, easing: 'cubic-bezier(.3,.1,.3,1)', fill: 'forwards' }).finished
}

/** The result stays on the belt's end with its tag (pushed off by the
 *  next one); without the scene, it goes on the Output pile. */
async function land(result: Result): Promise<void> {
  if (belt) belt.park(result.chip)
  else outbox.prepend(result.chip)
  done.push(result)
  while (done.length > (belt ? 1 : KEEP)) {
    const old = done.shift()!
    if (!belt) old.chip.remove()
    for (const [id, r] of results) if (r === old) results.delete(id)
    forgetFiles(old.inputs.filter(p => p.startsWith('/files/')))
  }
}

function action(label: string, title: string, run: () => void): HTMLButtonElement {
  const b = el('button', { type: 'button', className: 'chip-action', title }, label)
  b.addEventListener('click', e => { e.stopPropagation(); run() })
  return b
}

/** A result's tag: its name and size (on the item's face; drag it back
 *  onto the scene) and its buttons (above the item). */
function resultFor(name: string, files: Result['files'], inputs: string[], kind: string, detail: string, actions: HTMLElement[]): Result {
  const label = el('div', { className: `tag-label ${kind}`, draggable: true, title: 'Drag back onto the belt' },
    el('span', { className: 'tag-name' }, name), el('span', { className: 'tag-size' }, detail))
  const tag = el('div', { className: 'item-tag' }, label, el('div', { className: 'tag-actions' }, ...actions))
  const result: Result = { chip: tag, name, files, inputs }
  const id = `result:${++serial}`
  results.set(id, result)
  label.addEventListener('dragstart', e => {
    draggingOurs = kind === 'usdz' ? 'unzip' : 'zip'
    e.dataTransfer?.setData(SAMPLE_DRAG, id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
  })
  return result
}

/** Folder in, .usdz out. */
async function packFolder(job: Extract<Job, { kind: 'folder' }>): Promise<Result | undefined> {
  const { root, folder, files } = job
  await belt?.load('folder')
  for (const path of files) {
    const bytes = await readFile(path) ?? readMemFile(path)
    if (bytes) writeMemFile(path, bytes)
  }
  const n = ++serial
  const usdzName = `${stem(base(root))}.usdz`
  const out = `/out/${n}/${usdzName}`
  makeMemDir(`/out/${n}`)
  const argv = [...(settings.checkCompliance ? ['--checkCompliance'] : []), '--asset', root, out, '--list', '-']
  let stdout = ''
  const lines: string[] = []
  const started = performance.now()
  const code = await runTool(usdzip, argv, { stdout: t => { stdout += t; lines.push(t) }, stderr: t => lines.push(t) })
  log.append(el('span', { className: 'cmd' }, `$ usdzip ${argv.join(' ')}\n`), el('span', { className: code === 0 ? 'out' : 'err' }, lines.join('')),
    el('span', { className: 'time' }, `(${Math.round(performance.now() - started)} ms)\n`))
  const bytes = code === 0 ? readMemFile(out) : undefined
  removeMemTree(`/out/${n}`)
  if (!bytes) {
    logBox.open = true
    note.textContent = 'usdzip could not make a package; see what it printed below.'
    await belt?.unload()
    return undefined
  }
  // What went in, as usdzip --list printed it: paths relative to the root's folder.
  const packed = new Set(stdout.split('\n').map(s => s.trim()).filter(Boolean))
  const rootDir = root.slice(0, root.lastIndexOf('/') + 1)
  const unused = files.filter(f => !packed.has(f.slice(rootDir.length)))
  await belt?.ride('package')
  note.textContent = `${plural(packed.size, 'file')} packed into ${usdzName}` + (unused.length ? ` · ${unused.length} not used by ${base(root)} stayed in the folder` : '')
  const result = resultFor(usdzName, [{ name: usdzName, bytes }], files, 'usdz', size(bytes.byteLength), [
    action('↓ Download', `Download ${usdzName}`, () => void saveFile(usdzName, bytes, 'model/vnd.usdz+zip')),
    action('usdview', `Open ${usdzName} in TypeScript usdview`, () => {
      if (!openInUsdview(usdzName, bytes)) { log.append(el('span', { className: 'err' }, 'The browser blocked the new usdview tab.\n')); logBox.open = true }
    }),
  ])
  return result
}

/** .usdz in, folder out. */
async function unpackPackage(job: Extract<Job, { kind: 'package' }>): Promise<Result | undefined> {
  const bytes = await readFile(job.path) ?? readMemFile(job.path)
  if (!bytes) return undefined
  const n = ++serial
  const name = stem(job.name)
  const pkg = `/in/${n}/${job.name}`
  const dir = `/unzipped/${n}/${name}`
  writeMemFile(pkg, bytes)
  await belt?.load('package')
  const started = performance.now()
  const ok = await UsdUtilsExtractUsdzPackage(pkg, dir, false, true)
  log.append(el('span', { className: 'cmd' }, `$ unpacking ${job.name} → ${name}/ (UsdUtils ExtractUsdzPackage, usdzUtils.py)\n`),
    el('span', { className: ok ? 'out' : 'err' }, ok ? '' : 'The package could not be unpacked.\n'),
    el('span', { className: 'time' }, `(${Math.round(performance.now() - started)} ms)\n`))
  removeMemTree(`/in/${n}`)
  if (!ok) { logBox.open = true; note.textContent = `${job.name} could not be unpacked.`; await belt?.unload(); return undefined }
  const files = memFilesUnder(dir)
  await belt?.ride('folder')
  const out = files.map(path => ({ name: path.slice(dir.length + 1), bytes: readMemFile(path)! }))
  removeMemTree(`/unzipped/${n}`)
  note.textContent = `${job.name} unpacked: ${plural(out.length, 'file')} in ${name}/`
  const total = out.reduce((s, f) => s + f.bytes.byteLength, 0)
  const result = resultFor(`${name}/`, out, [job.path], 'folder', `${plural(out.length, 'file')} · ${size(total)}`, [
    action('↓ Download', `Download ${name}/ as ${name}.zip`, () => void downloadFolder(name, out)),
  ])
  result.chip.title = out.map(f => f.name).join('\n')
  return result
}

/** A folder's files as one .zip (written with Sdf's zip writer, which also
 *  writes .usdz packages; entries keep their paths under the folder). */
async function zipFolder(folder: string, files: { name: string, bytes: Uint8Array }[]): Promise<Uint8Array | undefined> {
  const dir = `/zips/${++serial}`
  for (const f of files) writeMemFile(`${dir}/${folder}/${f.name}`, f.bytes)
  const writer = await ZipFileWriter.createNew(`${dir}/${folder}.zip`)
  for (const f of files) writer.addFile(`${dir}/${folder}/${f.name}`, `${folder}/${f.name}`)
  const ok = await writer.save()
  const bytes = ok ? readMemFile(`${dir}/${folder}.zip`) : undefined
  removeMemTree(dir)
  return bytes
}

/** Downloads a folder as `<folder>.zip`. */
async function downloadFolder(folder: string, files: { name: string, bytes: Uint8Array }[]): Promise<void> {
  const bytes = await zipFolder(folder, files)
  if (bytes) await saveFile(`${folder}.zip`, bytes, 'application/zip')
  else { log.append(el('span', { className: 'err' }, `Could not make ${folder}.zip.\n`)); logBox.open = true }
}

// ---------------------------------------------------------------- input

/** Folders become packages and packages become folders. */
async function accept(entries: DroppedFile[]): Promise<void> {
  if (!entries.length) return
  const paths = addFilesAt(entries)
  const packages = paths.filter(p => p.toLowerCase().endsWith('.usdz'))
  const rest = paths.filter(p => !p.toLowerCase().endsWith('.usdz'))
  const root = pickRoot(rest.filter(isUsd))
  if (root) {
    const top = entries[0]!.path.split('/')[0]!
    const name = entries.every(e => e.path.includes('/')) ? `${top}/` : base(root)
    queue({ kind: 'folder', name, root, folder: '/files/', files: rest, chip: chip('folder', name, plural(rest.length, 'file')) })
  }
  // A package inside a dropped folder is one of that folder's files.
  if (!root) for (const path of packages) queue({ kind: 'package', name: base(path), path, chip: chip('usdz', base(path), '') })
  if (!root && !packages.length) note.textContent = 'That had no USD layer or package.'
}

/** A sample folder (by its root layer) or a result dragged back in. */
async function acceptDragged(data: string): Promise<void> {
  const result = results.get(data)
  if (result) {
    const folder = result.files.length > 1 || result.name.endsWith('/') ? result.name : ''
    return accept(result.files.map(f => ({ path: `${folder}${f.name}`, file: new File([f.bytes as Uint8Array<ArrayBuffer>], base(f.name)) })))
  }
  const root = data
  const folder = root.slice(0, root.lastIndexOf('/') + 1)
  const files = filesUnder(folder)
  const name = `${folder.split('/').at(-2)}/`
  queue({ kind: 'folder', name, root, folder, files, chip: chip('folder', name, plural(files.length, 'file')) })
}

picker.addEventListener('change', () => { void accept(pickedFiles(picker)); picker.value = '' })
folderPicker.addEventListener('change', () => { void accept(pickedFiles(folderPicker)); folderPicker.value = '' })
scene.addEventListener('click', e => { if (!(e.target as HTMLElement).closest('.chip, label, a, button')) picker.click() })
scene.addEventListener('keydown', e => { if (e.target === scene && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); picker.click() } })
// A drop on the scene keeps the hover's ZIP or UNZIP until the ride starts
// (a drop that starts nothing goes back to READY); leaving resets it.
let dropped = false
addEventListener('drop', e => {
  dropped = scene.contains(e.target as Node)
  if (dropped) setTimeout(() => { dropped = false; if (!busy) belt?.preview(null) }, 1000)
}, true)
acceptDrops(files => void accept(files), on => { if (!on && !dropped) belt?.preview(null) }, data => void acceptDragged(data), scene)

/** What a drag from this page carries (the test folder, or a result). */
let draggingOurs: 'zip' | 'unzip' | null = null
addEventListener('dragend', () => { draggingOurs = null })
/** While something hovers over the scene, the machine shows what it would
 *  do: a .usdz (its type says so) unzips; anything else zips. File names are
 *  hidden until the drop, so a drag from Finder is judged by type alone. */
const previewDrag = (e: DragEvent) => {
  if (busy || !belt) return
  if (!scene.contains(e.target as Node)) { belt.preview(null); return }
  const types = [...e.dataTransfer?.items ?? []].map(item => item.type)
  belt.preview(draggingOurs ?? (types.some(t => /usdz/i.test(t)) ? 'unzip' : 'zip'))
}
// Entering any element says where the drag is now (dragover only fires on movement).
addEventListener('dragenter', previewDrag)
addEventListener('dragover', previewDrag)

// usdzip's one sample: the museum's suitcase package, unpacked.
const suitcase = (await loadSamples()).find(sample => sample.name === 'suitcase')
if (suitcase) {
  const root = sampleRootPath(suitcase)
  const folder = root.slice(0, root.lastIndexOf('/') + 1)
  const files = filesUnder(folder)
  const sample = chip('folder sample-chip', 'suitcase/', plural(files.length, 'file'))
  Object.assign(sample, { draggable: true, role: 'button', tabIndex: 0, title: `Drag onto the belt to pack it; click to download it as suitcase.zip:\n${files.map(f => f.slice(folder.length)).join('\n')}` })
  sample.addEventListener('dragstart', e => { draggingOurs = 'zip'; e.dataTransfer?.setData(SAMPLE_DRAG, root); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy' })
  const download = async () => {
    const out = await Promise.all(files.map(async f => ({ name: f.slice(folder.length), bytes: await readFile(f) })))
    await downloadFolder('suitcase', out.filter((f): f is { name: string, bytes: Uint8Array } => !!f.bytes))
  }
  sample.addEventListener('click', () => void download())
  sample.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void download() } })
  sampleTray.append(sample)
}
