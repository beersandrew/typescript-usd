// usddiff side by side, with an owl: put a USD file in each slot (drop, tap,
// or pick a sample pair) and the owl looks from one to the other while
// TypeScript USD's usddiff compares them (pxr/usd/bin/usddiff: both as usda
// text through usdcat, then a unified diff, built in here as no $USD_DIFF is
// set). Its hunks are laid out side by side, the changed part of each
// changed line highlighted. usddiff reads its inputs and writes its
// temporary files through the page's in-memory filesystem (memfs.ts).
import './files'
import './memfs'
import './plugins'
import './page.css'
import './playful.css'
import './usddiff.css'
import { addFilesAt, loadSamples, readFile } from './files'
import { writeMemFile } from './memfs'
import { runTool } from './run-tool'
import { el } from './dom'
import { acceptDrops, pickedFiles, rootsOf, type DroppedFile } from './drop'
import { rememberedSettings, saveFile, settingsGear } from './playful'
import { Owl } from './owl'
import { readDiff, renderHunk } from './diffview'

const { usddiff } = await import('../../../packages/usd/pxr/usd/bin/usddiff/usddiff.ts')

// ---------------------------------------------------------------- settings

const { settings, save: saveSettings } = rememberedSettings('usd-tools.usddiff.settings', { flatten: false, brief: false })

await loadSamples()

// Sample pairs: before and after.
const pairs = [
  { title: 'The witches’ heath, before and after its framing pass', left: '/samples/heath/heath-before.usda', right: '/samples/heath/heath.usda' },
  { title: 'Suitcase A (text, metres) and suitcase B (binary, centimetres)', left: '/samples/formats/assets/case_a.usda', right: '/samples/formats/assets/case_b.usdc' },
  { title: 'Two museum forgeries of the variants exhibit', left: '/samples/variants/forgeries/nodefault.usda', right: '/samples/variants/forgeries/nofallback.usda' },
  { title: 'The heath and itself', left: '/samples/heath/heath.usda', right: '/samples/heath/heath.usda' },
]

// ------------------------------------------------------------------ page

document.title = 'usddiff — TypeScript USD'
const host = document.querySelector('main')!
host.classList.add('usddiff')

const { gear, panel } = settingsGear('usddiff settings')
const check = (key: 'flatten' | 'brief', label: string, arg: string) => {
  const box = el('input', { type: 'checkbox', checked: settings[key] })
  box.addEventListener('change', () => { settings[key] = box.checked; saveSettings(); void compare() })
  return el('label', { className: 'flag-row' }, box, ` ${label} `, el('code', {}, arg))
}
panel.append(el('h2', {}, 'Settings'),
  check('flatten', 'Compare the composed stages', '--flatten'),
  check('brief', 'Only say whether they differ', '--brief'),
  el('p', { className: 'hint' }, 'usddiff compares both files as usda text, so a .usda and a .usdc with the same content are the same, and reordered text that means the same is no difference.'))

interface Side { path: string, name: string }
let pendingSide: 'left' | 'right' | undefined
const sides: { left?: Side, right?: Side } = {}

function slot(side: 'left' | 'right', label: string) {
  const input = el('input', { type: 'file', hidden: true, id: `pick-${side}` })
  const name = el('span', { className: 'slot-name' }, 'drop a file or tap')
  const box = el('label', { className: `slot slot-${side} empty`, htmlFor: `pick-${side}` }, el('span', { className: 'slot-label' }, label), name, input)
  input.addEventListener('change', () => { void put(side, pickedFiles(input)); input.value = '' })
  box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('over') })
  box.addEventListener('dragleave', () => box.classList.remove('over'))
  // The page's drop handler (acceptDrops, on window) reads the files, folders
  // included; a drop here only says which slot they are for, before it
  // bubbles there.
  box.addEventListener('drop', () => { box.classList.remove('over'); pendingSide = side })
  return { box, name }
}
const left = slot('left', 'Before')
const right = slot('right', 'After')
const swap = el('button', { className: 'swap', type: 'button', title: 'Swap the files', ariaLabel: 'Swap the files' }, '⇄')
const perch = el('div', { className: 'perch' })
const owl = new Owl(perch)
perch.append(swap)

const pairSelect = el('select', { ariaLabel: 'Sample pair' }, el('option', { value: '', textContent: 'Try a sample pair…' }),
  ...pairs.map((p, i) => el('option', { value: String(i), textContent: p.title })))
const saveDiff = el('button', { className: 'save-all', type: 'button', hidden: true }, 'Save as .diff')
const summary = el('p', { className: 'diff-summary' })
const diffView = el('div', { className: 'diff' })
const log = el('div', { className: 'log' })
const logBox = el('details', { className: 'log-box' }, el('summary', {}, 'What usddiff printed'), log)

host.append(
  el('header', { className: 'top' },
    el('a', { href: '../', className: 'home' }, 'USD tools'),
    el('h1', {}, 'usddiff'),
    gear, panel),
  el('p', { className: 'about' }, 'Compares two USD files, text or binary, line by line as USD sees them. Runs TypeScript USD’s usddiff right here; nothing leaves the device.'),
  el('div', { className: 'pair' }, left.box, perch, right.box),
  el('div', { className: 'row samples' }, pairSelect, saveDiff),
  summary,
  diffView,
  logBox,
  el('p', { className: 'credit' }, 'Samples: USD Museum exhibits (CC0 1.0) and the witches’ heath from TypeScript USD’s Stagehand example, before and after commit 4ffd2bcd.'))

function show(side: 'left' | 'right', value: Side): void {
  sides[side] = value
  const s = side === 'left' ? left : right
  s.name.textContent = value.name
  s.box.classList.remove('empty')
  s.box.title = value.path
  owl.glance(side)
}

async function put(side: 'left' | 'right', files: DroppedFile[]): Promise<void> {
  const [root] = rootsOf(addFilesAt(files))
  if (!root) return
  show(side, { path: root, name: root.split('/').at(-1)! })
  void compare()
}


acceptDrops(files => {
  const roots = rootsOf(addFilesAt(files))
  if (!roots.length) return
  if (pendingSide) {
    show(pendingSide, { path: roots[0]!, name: roots[0]!.split('/').at(-1)! })
  } else if (roots.length >= 2) {
    show('left', { path: roots[0]!, name: roots[0]!.split('/').at(-1)! })
    show('right', { path: roots[1]!, name: roots[1]!.split('/').at(-1)! })
  } else {
    show(sides.left ? 'right' : 'left', { path: roots[0]!, name: roots[0]!.split('/').at(-1)! })
  }
  pendingSide = undefined
  void compare()
})
swap.addEventListener('click', () => {
  const { left: l, right: r } = sides
  if (!l || !r) return
  show('left', r)
  show('right', l)
  void compare()
})
pairSelect.addEventListener('change', () => {
  const pair = pairs[Number(pairSelect.value)]
  pairSelect.value = ''
  if (!pair) return
  show('left', { path: pair.left, name: pair.left.split('/').at(-1)! })
  show('right', { path: pair.right, name: pair.right.split('/').at(-1)! })
  void compare()
})

// -------------------------------------------------------------- comparing

let running = Promise.resolve()
function compare(): Promise<void> {
  running = running.then(compareNow).catch(error => {
    log.append(el('div', { className: 'run' }, el('span', { className: 'err' }, `${error instanceof Error ? error.message : String(error)}\n`)))
  })
  return running
}

async function compareNow(): Promise<void> {
  const l = sides.left, r = sides.right
  if (!l || !r) return
  // usddiff reads its inputs from the filesystem.
  for (const path of new Set([l.path, r.path])) {
    const bytes = await readFile(path)
    if (bytes) writeMemFile(path, bytes)
  }
  const argv = [...(settings.flatten ? ['--flatten'] : []), ...(settings.brief ? ['--brief'] : []), l.path, r.path]
  let stdout = ''
  const run = el('div', { className: 'run' }, el('span', { className: 'cmd' }, `$ usddiff ${argv.join(' ')}\n`))
  log.append(run)
  diffView.replaceChildren()
  summary.textContent = ''
  saveDiff.hidden = true
  const code = await owl.compare(() => runTool(usddiff, argv, {
    stdout: t => { stdout += t; run.append(el('span', { className: 'out' }, t)) },
    stderr: t => run.append(el('span', { className: 'err' }, t)),
    env: {},
  }))
  run.dataset.exit = String(code)

  if (code === 0) {
    owl.verdict('same', 'Same!')
    summary.textContent = `${l.name} and ${r.name} say the same thing.`
    return
  }
  if (code !== 1) {
    owl.verdict('error', 'Hoo?')
    summary.textContent = 'usddiff could not compare these; see what it printed below.'
    logBox.open = true
    return
  }
  const { hunks, notes } = readDiff(stdout)
  const removed = hunks.reduce((n, h) => n + h.removed.length, 0)
  const added = hunks.reduce((n, h) => n + h.added.length, 0)
  owl.verdict('different', hunks.length ? `${hunks.length} change${hunks.length === 1 ? '' : 's'}!` : 'Different!')
  summary.replaceChildren(
    hunks.length ? `${hunks.length} change${hunks.length === 1 ? '' : 's'}: ` : 'They differ.',
    ...(hunks.length ? [el('span', { className: 'del-count' }, `−${removed}`), ' ', el('span', { className: 'add-count' }, `+${added}`), ' lines'] : []))
  for (const note of notes) if (note.trim()) diffView.append(el('p', { className: 'diff-note' }, note))
  if (hunks.length) {
    diffView.append(el('div', { className: 'diff-head' }, el('span', {}, l.name), el('span', {}, r.name)))
    for (const hunk of hunks) diffView.append(renderHunk(hunk))
    saveDiff.hidden = false
    saveDiff.onclick = () => void saveFile(`${l.name.replace(/\.[^.]+$/, '')}-vs-${r.name.replace(/\.[^.]+$/, '')}.diff`, stdout, 'text/x-diff')
  }
}
