// usdstitch and usdstitchclips in a sewing room: a tailor mouse sews files
// together. usdstitch (pxr/usd/bin/usdstitch) sews layers into one, the
// first the strongest, time samples merged: the files are patches and the
// result a quilt. usdstitchclips (pxr/usd/bin/usdstitchclips) sews clip
// files into value clips on one prim: the files are film frames and the
// result a reel of three layers (result, topology, manifest). The page is
// one module for both; the HTML's data-mode picks.
//
// Each run works in its own folder, /work/<n>/, on the page's in-memory
// filesystem (memfs.ts) through the default resolver: usdstitchclips writes
// its result naming the clips and its other layers relative to it, so the
// clips are copied there first and the saved files keep working side by
// side.
import './files'
import './memfs'
import './plugins'
import './page.css'
import './playful.css'
import './usdstitch.css'
import { addFilesAt, loadSamples, readFile } from './files'
import { makeMemDir, readMemFile, writeMemFile } from './memfs'
import { runTool } from './run-tool'
import { el } from './dom'
import { acceptDrops, isUsd, pickedFiles, type DroppedFile } from './drop'
import { pause, rememberedSettings, saveFile, settingsGear } from './playful'
import { Mouse } from './mouse'

const clipsMode = document.body.dataset.mode === 'clips'
const tool = clipsMode ? 'usdstitchclips' : 'usdstitch'
const { usdstitch } = await import('../../../packages/usd/pxr/usd/bin/usdstitch/usdstitch.ts')
const { usdstitchclips } = await import('../../../packages/usd/pxr/usd/bin/usdstitchclips/usdstitchclips.ts')
await loadSamples()

// ---------------------------------------------------------------- settings

const { settings, save: saveSettings } = rememberedSettings(`usd-tools.${tool}.settings`, {
  out: clipsMode ? 'result.usda' : 'stitched.usda',
  clipPath: '', startTimeCode: '', endTimeCode: '', clipSet: '', noComment: false,
})

const sets = clipsMode ? [
  { title: 'A bouncing ball in four clips', files: [1, 2, 3, 4].map(i => `/samples/clips/ball.00${i}.usda`), clipPath: '/World/Ball' },
] : [
  { title: 'The heath over its earlier self', files: ['/samples/heath/heath.usda', '/samples/heath/heath-before.usda'] },
  { title: 'Suitcase A over suitcase B (text over binary)', files: ['/samples/formats/assets/case_a.usda', '/samples/formats/assets/case_b.usdc'] },
  { title: 'Two forgeries of the variants exhibit', files: ['/samples/variants/forgeries/nodefault.usda', '/samples/variants/forgeries/nofallback.usda'] },
]

// ------------------------------------------------------------------ page

document.title = `${tool} — TypeScript USD`
const host = document.querySelector('main')!
host.classList.add('usdstitch', clipsMode ? 'clips' : 'layers')

const { gear, panel } = settingsGear(`${tool} settings`)
const text = (key: 'out' | 'clipPath' | 'startTimeCode' | 'endTimeCode' | 'clipSet', label: string, arg: string, placeholder = '') => {
  const input = el('input', { type: 'text', value: settings[key], placeholder, spellcheck: false, autocapitalize: 'off' })
  input.addEventListener('change', () => { settings[key] = input.value.trim(); saveSettings(); if (key === 'clipPath') clipPathInput.value = settings.clipPath })
  return el('label', { className: 'field' }, el('span', {}, label, ' ', el('code', {}, arg)), input)
}
const noComment = el('input', { type: 'checkbox', checked: settings.noComment })
noComment.addEventListener('change', () => { settings.noComment = noComment.checked; saveSettings() })
panel.append(el('h2', {}, 'Settings'), text('out', 'Result file name', '--out'),
  ...(clipsMode ? [
    text('startTimeCode', 'Clips start at', '--startTimeCode', 'first clip’s start'),
    text('endTimeCode', 'Clips end at', '--endTimeCode', 'last clip’s end'),
    text('clipSet', 'Clip set name', '--clipSet', 'default'),
    el('label', { className: 'flag-row' }, noComment, ' Leave out the “Generated with” comment ', el('code', {}, '--noComment')),
  ] : []),
  el('p', { className: 'hint' }, clipsMode
    ? 'The clips are sewn in the order shown, onto the prim at the clip path.'
    : 'The first file is the strongest: its opinions win, and time samples from all of them are merged.'))

const picker = el('input', { type: 'file', multiple: true, id: 'picker', hidden: true, accept: '.usd,.usda,.usdc,.usdz' })
const drop = el('label', { className: 'drop', htmlFor: 'picker' },
  el('strong', {}, clipsMode ? 'Drop the clip files' : 'Drop the USD files to stitch'),
  el('span', {}, clipsMode ? 'one per stretch of time, in order' : 'strongest first; reorder them below'),
  el('span', { className: 'tap' }, 'or tap to choose'))
const setSelect = el('select', { ariaLabel: 'Sample set' }, el('option', { value: '', textContent: 'Try a sample…' }),
  ...sets.map((s, i) => el('option', { value: String(i), textContent: s.title })))
const clipPathInput = el('input', { type: 'text', value: settings.clipPath, placeholder: '/World/Prim', spellcheck: false, autocapitalize: 'off', ariaLabel: 'Clip path' })
clipPathInput.addEventListener('change', () => { settings.clipPath = clipPathInput.value.trim(); saveSettings() })
const sewButton = el('button', { type: 'button', className: 'sew' }, 'Sew')

const room = el('div', { className: 'room' })
const patches = el('div', { className: 'patches' })
const floor = el('div', { className: 'floor' })
const mouse = new Mouse(floor)
const results = el('div', { className: 'results' })
const note = el('p', { className: 'note' }, clipsMode ? 'Pick the sample or drop clips, then sew.' : 'Pick a sample or drop files, then sew.')
room.append(patches, floor, results, note)
const preview = el('pre', { className: 'preview' })
const previewBox = el('details', { className: 'log-box', hidden: true }, el('summary', {}, 'What the result says'), preview)
const log = el('div', { className: 'log' })
const logBox = el('details', { className: 'log-box' }, el('summary', {}, `What ${tool} printed`), log)

host.append(
  el('header', { className: 'top' },
    el('a', { href: '../', className: 'home' }, 'USD tools'),
    el('h1', {}, tool),
    gear, panel),
  el('p', { className: 'about' }, clipsMode
    ? 'Sews clip files into value clips on one prim: a result layer, its topology and its manifest. Runs TypeScript USD’s usdstitchclips right here; nothing leaves the device.'
    : 'Sews several USD files into one, the first the strongest, time samples merged. Runs TypeScript USD’s usdstitch right here; nothing leaves the device.'),
  drop, picker,
  el('div', { className: 'row samples' }, setSelect,
    ...(clipsMode ? [el('label', { className: 'clip-path' }, 'Clip path ', clipPathInput)] : []), sewButton),
  room,
  previewBox,
  logBox,
  el('p', { className: 'credit' }, clipsMode
    ? 'Sample: a bouncing ball in four clips, generated for these pages.'
    : 'Samples: USD Museum exhibits (CC0 1.0) and the witches’ heath from TypeScript USD’s Stagehand example.'))

// ------------------------------------------------------------- the patches

let files: string[] = []

function showPatches(): void {
  patches.replaceChildren(...files.map((path, i) => {
    const name = path.split('/').at(-1)!
    const patch = el('div', { className: `patch p${i % 6}` },
      el('span', { className: 'patch-name' }, name),
      el('span', { className: 'patch-rank' }, clipsMode ? `clip ${i + 1}` : i === 0 ? 'strongest' : i === files.length - 1 ? 'weakest' : `${i + 1}`),
      el('span', { className: 'patch-tools' },
        button('↑', `Move ${name} earlier`, () => move(i, -1), i === 0),
        button('↓', `Move ${name} later`, () => move(i, 1), i === files.length - 1),
        button('✕', `Remove ${name}`, () => { files.splice(i, 1); reset() })))
    return patch
  }))
  sewButton.disabled = files.length < (clipsMode ? 1 : 2)
}
function button(label: string, title: string, onClick: () => void, disabled = false) {
  const b = el('button', { type: 'button', title, ariaLabel: title, disabled }, label)
  b.addEventListener('click', onClick)
  return b
}
function move(i: number, by: number): void {
  const j = i + by
  if (j < 0 || j >= files.length) return
  ;[files[i], files[j]] = [files[j]!, files[i]!]
  reset()
}
function reset(): void {
  room.classList.remove('quilted')
  results.replaceChildren()
  previewBox.hidden = true
  showPatches()
  requestAnimationFrame(() => mouse.place(0))
}

// ---------------------------------------------------------------- sewing

let serial = 0
let busy = false

async function sewNow(): Promise<void> {
  if (busy || files.length === 0) return
  if (clipsMode && !settings.clipPath) { note.textContent = 'Give the clip path: the prim the clips animate.'; clipPathInput.focus(); return }
  busy = true
  sewButton.disabled = true
  room.classList.remove('quilted')
  results.replaceChildren()
  previewBox.hidden = true
  note.textContent = 'Sewing…'
  try {
    // The mouse sews along the row, a seam after each patch.
    const els = [...patches.children] as HTMLElement[]
    for (const p of els) p.classList.remove('sewn')
    for (const [i, p] of els.entries()) {
      const r = p.getBoundingClientRect(), f = floor.getBoundingClientRect()
      await mouse.scurry(Math.max(0, Math.min(f.width - mouse.element.offsetWidth, r.left + r.width / 2 - f.left - mouse.element.offsetWidth / 2)))
      await mouse.sew(undefined, 260)
      if (i < els.length - 1) p.classList.add('sewn')
    }

    const n = ++serial
    const dir = `/work/${n}`
    makeMemDir(dir)
    const outName = settings.out || (clipsMode ? 'result.usda' : 'stitched.usda')
    const out = `${dir}/${outName}`
    let inputs = files
    if (clipsMode) {
      // The clips beside the result, so it names them ./<name>.
      inputs = []
      for (const f of files) {
        const bytes = await readFile(f)
        const copy = `${dir}/${f.split('/').at(-1)}`
        if (bytes) writeMemFile(copy, bytes)
        inputs.push(copy)
      }
    }
    const argv = clipsMode ? [
      '--out', out, '--clipPath', settings.clipPath,
      ...(settings.startTimeCode ? ['--startTimeCode', settings.startTimeCode] : []),
      ...(settings.endTimeCode ? ['--endTimeCode', settings.endTimeCode] : []),
      ...(settings.clipSet ? ['--clipSet', settings.clipSet] : []),
      ...(settings.noComment ? ['--noComment'] : []),
      ...inputs,
    ] : ['--out', out, ...inputs]
    const run = el('div', { className: 'run' }, el('span', { className: 'cmd' }, `$ ${tool} ${argv.join(' ')}\n`))
    log.append(run)
    const code = await mouse.sew(() => runTool(clipsMode ? usdstitchclips : usdstitch, argv, {
      stdout: t => run.append(el('span', { className: 'out' }, t)),
      stderr: t => run.append(el('span', { className: 'err' }, t)),
    }), 300)
    run.dataset.exit = String(code)

    const base = outName.replace(/\.[^.]+$/, ''), ext = outName.slice(base.length)
    const names = clipsMode ? [outName, `${base}.topology${ext}`, `${base}.manifest${ext}`] : [outName]
    const outputs = names.map(name => ({ name, bytes: readMemFile(`${dir}/${name}`) })).filter((o): o is { name: string, bytes: Uint8Array } => !!o.bytes)
    if (code !== 0 || outputs.length === 0 || /Failed to complete/.test(run.textContent ?? '')) {
      mouse.puzzled()
      note.textContent = `${tool} could not sew these; see what it printed below.`
      logBox.open = true
      return
    }
    room.classList.add('quilted')
    await pause(500)
    mouse.proud()
    results.replaceChildren(...outputs.map(({ name, bytes }) => {
      const tag = el('button', { type: 'button', className: 'result-tag' },
        el('span', { className: 'tag-name' }, name), el('span', { className: 'tag-size' }, size(bytes.byteLength)))
      tag.addEventListener('click', () => void saveFile(name, bytes))
      return tag
    }), ...(outputs.length > 1 ? [(() => {
      const all = el('button', { type: 'button', className: 'save-all' }, 'Save all')
      all.addEventListener('click', async () => { for (const o of outputs) await saveFile(o.name, o.bytes) })
      return all
    })()] : []))
    note.textContent = clipsMode
      ? `${files.length} clip${files.length === 1 ? '' : 's'} sewn onto ${settings.clipPath}. Keep the three files beside the clips.`
      : `${files.length} files sewn into one.`
    preview.textContent = new TextDecoder().decode(outputs[0]!.bytes.subarray(0, 60_000))
    previewBox.hidden = !/^#usda/.test(preview.textContent)
  } finally {
    busy = false
    sewButton.disabled = files.length < (clipsMode ? 1 : 2)
  }
}
const size = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`

sewButton.addEventListener('click', () => void sewNow())
setSelect.addEventListener('change', () => {
  const set = sets[Number(setSelect.value)]
  setSelect.value = ''
  if (!set) return
  files = [...set.files]
  if ('clipPath' in set && set.clipPath) { settings.clipPath = set.clipPath; clipPathInput.value = set.clipPath; saveSettings() }
  reset()
  void sewNow()
})

function accept(dropped: DroppedFile[]): void {
  const paths = addFilesAt(dropped).filter(isUsd)
  if (!paths.length) return
  files = [...files, ...paths.sort((a, b) => a.localeCompare(b))]
  reset()
}
picker.addEventListener('change', () => { accept(pickedFiles(picker)); picker.value = '' })
acceptDrops(accept)
showPatches()
