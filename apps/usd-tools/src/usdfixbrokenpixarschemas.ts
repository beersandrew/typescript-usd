// usdfixbrokenpixarschemas with a fix-it robot: drop a USD file or .usdz
// (or pick a sample) and the robot tinkers while TypeScript USD's
// usdfixbrokenpixarschemas (pxr/bin/usdfixbrokenpixarschemas) applies the
// fixes UsdUtils.FixBrokenPixarSchemas defines: MaterialBindingAPI and
// SkelBindingAPI where they are missing, upAxis, CoordSysAPI and
// RenderSettings terminals. The tool fixes the file in place and keeps a
// backup; the page runs it on a copy in /work/<n>/ (the in-memory
// filesystem), then runs usddiff between the backup and the fixed file to
// show what changed, side by side.
import './files'
import './memfs'
import './plugins'
import './page.css'
import './playful.css'
import './usddiff.css'
import './usdfixbrokenpixarschemas.css'
import { addFilesAt, loadSamples, readFile } from './files'
import { makeMemDir, readMemFile, writeMemFile } from './memfs'
import { runTool } from './run-tool'
import { el } from './dom'
import { acceptDrops, pickedFiles, rootsOf, type DroppedFile } from './drop'
import { rememberedSettings, saveFile, settingsGear } from './playful'
import { readDiff, renderHunk } from './diffview'
import { Robot } from './robot'

const { usdfixbrokenpixarschemas } = await import('../../../packages/usd/pxr/bin/usdfixbrokenpixarschemas/usdfixbrokenpixarschemas.ts')
const { usddiff } = await import('../../../packages/usd/pxr/usd/bin/usddiff/usddiff.ts')
await loadSamples()

const { settings, save: saveSettings } = rememberedSettings('usd-tools.usdfixbrokenpixarschemas.settings', { verbose: false })

const samples = [
  { title: 'Several things to fix (bindings, skeleton binding, up axis)', path: '/samples/broken/several_fixes.usda' },
  { title: 'Material bindings inside variants', path: '/samples/broken/variant_bindings.usda' },
  { title: 'A package with packages inside', path: '/samples/broken/nested_package.usdz' },
  { title: 'Render settings that need nothing', path: '/samples/broken/render_settings.usda' },
  { title: 'The witches’ heath (nothing broken)', path: '/samples/heath/heath.usda' },
]

// ------------------------------------------------------------------ page

document.title = 'usdfixbrokenpixarschemas — TypeScript USD'
const host = document.querySelector('main')!
host.classList.add('usdfix')

const { gear, panel } = settingsGear('usdfixbrokenpixarschemas settings')
const verbose = el('input', { type: 'checkbox', checked: settings.verbose })
verbose.addEventListener('change', () => { settings.verbose = verbose.checked; saveSettings() })
panel.append(el('h2', {}, 'Settings'),
  el('label', { className: 'flag-row' }, verbose, ' Say what it unpacks in a package ', el('code', {}, '--verbose')),
  el('p', { className: 'hint' }, 'The robot fixes a copy; your file is untouched until you save the fixed one.'))

const picker = el('input', { type: 'file', id: 'picker', hidden: true, accept: '.usd,.usda,.usdc,.usdz' })
const drop = el('label', { className: 'drop', htmlFor: 'picker' },
  el('strong', {}, 'Drop a USD file or .usdz to fix'),
  el('span', {}, 'missing binding schemas, up axis, coordinate systems, render terminals'),
  el('span', { className: 'tap' }, 'or tap to choose'))
const sampleSelect = el('select', { ariaLabel: 'Sample' }, el('option', { value: '', textContent: 'Try a sample…' }),
  ...samples.map((s, i) => el('option', { value: String(i), textContent: s.title })))

const workshop = el('div', { className: 'workshop' })
const bench = el('div', { className: 'workbench' })
const robot = new Robot(bench)
const part = el('div', { className: 'part', hidden: true })
bench.append(part)
const results = el('div', { className: 'results' })
const summary = el('p', { className: 'diff-summary' })
const remaining = el('div', { className: 'remaining', hidden: true })
const diffView = el('div', { className: 'diff' })
workshop.append(bench, results)
const log = el('div', { className: 'log' })
const logBox = el('details', { className: 'log-box' }, el('summary', {}, 'What usdfixbrokenpixarschemas printed'), log)

host.append(
  el('header', { className: 'top' },
    el('a', { href: '../', className: 'home' }, 'USD tools'),
    el('h1', {}, 'usdfixbrokenpixarschemas'),
    gear, panel),
  el('p', { className: 'about' }, 'Fixes the schema mistakes older USD files make with Pixar’s schemas, and shows what it changed. Runs TypeScript USD’s usdfixbrokenpixarschemas right here; nothing leaves the device.'),
  drop, picker,
  el('div', { className: 'row samples' }, sampleSelect),
  workshop, summary, remaining, diffView, logBox,
  el('p', { className: 'credit' }, 'Samples: the inputs of OpenUSD’s own tests for usdfixbrokenpixarschemas (Pixar, Tomorrow Open Source Technology License 1.0) and the witches’ heath.'))

// ---------------------------------------------------------------- fixing

let serial = 0
let queue = Promise.resolve()
function fix(path: string, extra: { path: string }[] = []): void {
  queue = queue.then(() => fixNow(path, extra)).catch(error => {
    log.append(el('div', { className: 'run' }, el('span', { className: 'err' }, `${error instanceof Error ? error.message : String(error)}\n`)))
  })
}

async function fixNow(path: string, extra: { path: string }[]): Promise<void> {
  const name = path.split('/').at(-1)!
  const dot = name.lastIndexOf('.')
  const dir = `/work/${++serial}`
  makeMemDir(dir)
  // The file (and, for a dropped folder, what is beside it) on the
  // filesystem the tool fixes it in.
  const folder = path.slice(0, path.lastIndexOf('/') + 1)
  for (const f of [{ path }, ...extra]) {
    const bytes = await readFile(f.path)
    if (bytes) writeMemFile(`${dir}/${f.path.slice(folder.length)}`, bytes)
  }
  const target = `${dir}/${name}`
  const backup = `${dir}/${name.slice(0, dot)}.bck${name.slice(dot)}`

  part.hidden = false
  part.className = 'part arriving'
  part.textContent = name
  results.replaceChildren()
  summary.textContent = ''
  remaining.hidden = true
  diffView.replaceChildren()
  requestAnimationFrame(() => part.classList.remove('arriving'))

  const argv = [...(settings.verbose ? ['--verbose'] : []), target]
  let stderr = ''
  const run = el('div', { className: 'run' }, el('span', { className: 'cmd' }, `$ usdfixbrokenpixarschemas ${argv.join(' ')}\n`))
  log.append(run)
  const code = await robot.tinker(() => runTool(usdfixbrokenpixarschemas, argv, {
    stdout: t => run.append(el('span', { className: 'out' }, t)),
    stderr: t => { stderr += t; run.append(el('span', { className: 'err' }, t)) },
  }))
  run.dataset.exit = String(code)

  const fixed = readMemFile(target)
  if (code !== 0) {
    if (/Unable to fix or no fixes required/.test(stderr)) {
      robot.outcome('nothing', 'Nothing to fix!')
      part.classList.add('fine')
      summary.textContent = `${name} needs none of these fixes.`
    } else {
      robot.outcome('failed', 'Can’t fix that')
      part.classList.add('broken')
      summary.textContent = 'usdfixbrokenpixarschemas could not work on this file; see what it printed below.'
      logBox.open = true
    }
    return
  }

  // What changed, as usddiff sees it.
  let diffOut = ''
  const diffArgv = [backup, target]
  const diffRun = el('div', { className: 'run' }, el('span', { className: 'cmd' }, `$ usddiff ${diffArgv.join(' ')}\n`))
  log.append(diffRun)
  const diffCode = await runTool(usddiff, diffArgv, { stdout: t => { diffOut += t; diffRun.append(el('span', { className: 'out' }, t)) }, stderr: t => diffRun.append(el('span', { className: 'err' }, t)), env: {} })
  diffRun.dataset.exit = String(diffCode)
  const { hunks, notes } = readDiff(diffOut)
  const changes = hunks.length
  robot.outcome('fixed', changes ? `Fixed! ${changes} change${changes === 1 ? '' : 's'}` : 'Fixed!')
  part.classList.add('mended')
  summary.textContent = changes ? `What the robot changed in ${name}:` : `The robot rewrote ${name}.`
  for (const note of notes) if (note.trim()) diffView.append(el('p', { className: 'diff-note' }, note))
  if (changes) {
    diffView.append(el('div', { className: 'diff-head' }, el('span', {}, 'before'), el('span', {}, 'fixed')))
    for (const hunk of hunks) diffView.append(renderHunk(hunk))
  }
  // Problems the tool's validation still reports.
  const left = stderr.split('\n').filter(l => /^(Error|Warning): /.test(l))
  if (left.length) {
    remaining.hidden = false
    remaining.replaceChildren(el('h3', {}, 'Still worth a look'), el('ul', {}, ...left.map(l => el('li', { className: l.startsWith('Error') ? 'err' : 'warn' }, l))))
  }
  if (fixed) {
    const tag = el('button', { type: 'button', className: 'result-tag' }, el('span', { className: 'tag-name' }, name), el('span', { className: 'tag-size' }, 'fixed'))
    tag.addEventListener('click', () => void saveFile(name, fixed))
    results.append(tag)
  }
}

// ---------------------------------------------------------------- input

function accept(files: DroppedFile[]): void {
  const paths = addFilesAt(files)
  for (const root of rootsOf(paths)) {
    const folder = root.slice(0, root.lastIndexOf('/') + 1)
    fix(root, paths.filter(p => p !== root && p.startsWith(folder)).map(p => ({ path: p })))
  }
}
picker.addEventListener('change', () => { accept(pickedFiles(picker)); picker.value = '' })
acceptDrops(accept)
sampleSelect.addEventListener('change', () => {
  const sample = samples[Number(sampleSelect.value)]
  sampleSelect.value = ''
  if (sample) fix(sample.path)
})
