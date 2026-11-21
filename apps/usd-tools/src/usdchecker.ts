// usdchecker with an inspector: drop a USD file (or its folder, or pick a
// sample) and the inspector looks it over with his magnifying glass while
// TypeScript USD's usdchecker runs (pxr/usdValidation/bin/usdchecker), then
// stamps a report: PASSED, PASSED with warnings, or FAILED. The report is
// usdchecker's own output read back: one section per variant selection it
// validated, the findings grouped by the rule that raised them, with each
// rule's description from the validation registry. The log keeps exactly
// what usdchecker printed.
import './files'
import './plugins'
import './page.css'
import './playful.css'
import './usdchecker.css'
import { ValidationRegistry } from 'typescript-usd/usdValidation'
import { addFilesAt, loadSamples, sampleRootPath } from './files'
import { runTool } from './run-tool'
import { el } from './dom'
import { acceptDrops, cannotPickFolders, pickedFiles, rootsOf, type DroppedFile } from './drop'
import { pause, rememberedSettings, settingsGear } from './playful'
import { Inspector, type Verdict } from './inspector'

const { usdchecker } = await import('../../../packages/usd/pxr/usdValidation/bin/usdchecker/usdchecker.ts')

// ---------------------------------------------------------------- settings

const flags = [
  { key: 'skipVariants', arg: '--skipVariants', label: 'Only the variants as selected' },
  { key: 'rootPackageOnly', arg: '--rootPackageOnly', label: 'Only the root layer of a package' },
  { key: 'noAssetChecks', arg: '--noAssetChecks', label: 'Skip the asset checks' },
  { key: 'strict', arg: '--strict', label: 'Warnings fail too' },
] as const
type FlagKey = typeof flags[number]['key']
const { settings, save: saveSettings } = rememberedSettings<Record<FlagKey, boolean>>('usd-tools.usdchecker.settings',
  { skipVariants: false, rootPackageOnly: false, noAssetChecks: false, strict: false })

// ------------------------------------------------------- reading the output

type Severity = 'Error' | 'Warning' | 'Info' | 'None'
interface Finding { severity: Severity, rule: string, message: string }
interface Section { title: string, findings: Finding[], result: string }

/** usdchecker's printed report, read back: "Validation Result ..." starts a
 *  section, "Error: (rule) message" a finding whose message runs to the
 *  next blank line or finding, and "Success!", "Failed!" or "Success with
 *  warnings..." ends the section (usdchecker.cpp ReportValidationErrors). */
function readReport(stdout: string): Section[] {
  const sections: Section[] = []
  let section: Section | undefined
  let finding: Finding | undefined
  for (const line of stdout.split('\n')) {
    const header = /^Validation Result (.*)$/.exec(line)
    const item = /^(Error|Warning|Info|None): \(([^)]*)\) ?(.*)$/.exec(line)
    if (header) {
      section = { title: header[1]!, findings: [], result: '' }
      sections.push(section)
      finding = undefined
    } else if (item && section) {
      finding = { severity: item[1] as Severity, rule: item[2]!, message: item[3]! }
      section.findings.push(finding)
    } else if (/^(Success!|Failed!|Success with warnings\.\.\.)$/.test(line) && section) {
      section.result = line
      finding = undefined
    } else if (line.trim() === '') {
      finding = undefined
    } else if (finding) {
      finding.message += `\n${line}`
    }
  }
  return sections
}

/** "with no explicit variants set" / "for Variants: wrap:checks on Prim: /p". */
function sectionTitle(title: string): string {
  const variants = /^for Variants: (.*) on Prim: (.*)$/.exec(title)
  if (variants) return `With ${variants[1]!.split(', ').map(v => v.replace(':', ' = ')).join(', ')} on ${variants[2]}`
  if (/no explicit variants/.test(title)) return 'As authored'
  return title
}

/** A rule's validator and error names: "plugin:Validator.ErrorName". */
function splitRule(rule: string): { validator: string, error: string } {
  const m = /^(.*?:[^.]+)\.(.+)$/.exec(rule)
  return m ? { validator: m[1]!, error: m[2]! } : { validator: rule, error: '' }
}
function ruleDoc(validator: string): string {
  try { return ValidationRegistry.getInstance().getValidatorMetadata(validator)?.doc ?? '' } catch { return '' }
}

// ------------------------------------------------------------------ page

document.title = 'usdchecker — TypeScript USD'
const host = document.querySelector('main')!
host.classList.add('usdchecker')

const { gear, panel } = settingsGear('usdchecker settings')
panel.append(el('h2', {}, 'Settings'), ...flags.map(f => {
  const box = el('input', { type: 'checkbox', checked: settings[f.key] })
  box.addEventListener('change', () => { settings[f.key] = box.checked; saveSettings() })
  return el('label', { className: 'flag-row' }, box, ` ${f.label} `, el('code', {}, f.arg))
}), el('p', { className: 'hint' }, 'The inspector checks the stage your file opens, with every validator OpenUSD registers. Drop the whole folder so what it references is there.'))

const picker = el('input', { type: 'file', multiple: true, id: 'picker', hidden: true })
const folderPicker = el('input', { type: 'file', multiple: true, id: 'folder-picker', hidden: true, webkitdirectory: true })
const drop = el('div', { className: 'drop' },
  el('strong', {}, 'Drop a USD file for inspection'),
  el('span', {}, 'or its folder, so he can follow what it references'),
  el('span', { className: 'pick' },
    el('label', { htmlFor: 'picker', className: 'link' }, 'choose files'),
    ...(cannotPickFolders() ? [] : [' · ', el('label', { htmlFor: 'folder-picker', className: 'link' }, 'choose a folder')])))
const sampleSelect = el('select', { ariaLabel: 'Sample' }, el('option', { value: '', textContent: 'Try a sample…' }))

const office = el('div', { className: 'office' })
const scene = el('div', { className: 'scene' })
const inspector = new Inspector(scene)
const bench = el('div', { className: 'bench' })
const paper = el('div', { className: 'case-file', hidden: true })
bench.append(paper)
scene.append(bench)
const reports = el('div', { className: 'reports' }, el('p', { className: 'waiting' }, 'The inspector is waiting for a file.'))
office.append(scene, reports)

const log = el('div', { className: 'log' })
const logBox = el('details', { className: 'log-box' }, el('summary', {}, 'What usdchecker printed'), log)

host.append(
  el('header', { className: 'top' },
    el('a', { href: '../', className: 'home' }, 'USD tools'),
    el('h1', {}, 'usdchecker'),
    gear, panel),
  el('p', { className: 'about' }, 'Checks a USD file against OpenUSD’s validators. Runs TypeScript USD’s usdchecker right here; nothing leaves the device.'),
  drop, picker, folderPicker,
  el('div', { className: 'row samples' }, sampleSelect),
  office,
  logBox,
  el('p', { className: 'credit' }, 'Samples: USD Museum exhibits (CC0 1.0) and the witches’ heath from TypeScript USD’s Stagehand example.'))

// ------------------------------------------------------------- inspecting

let queue = Promise.resolve()
function inspect(path: string): void {
  queue = queue.then(() => inspectNow(path)).catch(error => {
    log.append(el('div', { className: 'run' }, el('span', { className: 'err' }, `${error instanceof Error ? error.message : String(error)}\n`)))
  })
}

async function inspectNow(path: string): Promise<void> {
  const name = path.split('/').at(-1)!
  inspector.idle()
  paper.hidden = false
  paper.className = 'case-file arriving'
  paper.replaceChildren(el('span', { className: 'case-name' }, name))
  await pause(350)
  paper.classList.remove('arriving')

  const argv = [...flags.filter(f => settings[f.key]).map(f => f.arg), path]
  let stdout = ''
  const run = el('div', { className: 'run' }, el('span', { className: 'cmd' }, `$ usdchecker ${argv.join(' ')}\n`))
  log.append(run)
  const code = await inspector.inspect(() => runTool(usdchecker, argv, {
    stdout: t => { stdout += t; run.append(el('span', { className: 'out' }, t)) },
    stderr: t => run.append(el('span', { className: 'err' }, t)),
  }))
  run.dataset.exit = String(code)

  const sections = readReport(stdout)
  const all = sections.flatMap(s => s.findings)
  const verdict: Verdict = code !== 0 ? 'fail' : all.some(f => f.severity === 'Warning') ? 'warn' : 'pass'
  await inspector.stamp(verdict)
  const stampText = verdict === 'pass' ? 'PASSED' : verdict === 'warn' ? 'PASSED' : 'FAILED'
  paper.append(el('span', { className: `case-stamp ${verdict}` }, stampText))
  if (code !== 0 && sections.length === 0) logBox.open = true
  reports.querySelector('.waiting')?.remove()
  reports.prepend(report(name, verdict, sections, code))
}

function report(name: string, verdict: Verdict, sections: Section[], code: number): HTMLElement {
  const stamp = el('div', { className: `stamp-mark ${verdict}` },
    verdict === 'pass' ? 'PASSED' : verdict === 'warn' ? 'PASSED' : 'FAILED',
    ...(verdict === 'warn' ? [el('small', {}, 'with warnings')] : []))
  const counts = sections.flatMap(s => s.findings).reduce((c, f) => { c[f.severity] = (c[f.severity] ?? 0) + 1; return c }, {} as Record<string, number>)
  const summary = Object.entries(counts).map(([s, n]) => `${n} ${s === 'Error' ? (n === 1 ? 'error' : 'errors') : s === 'Warning' ? (n === 1 ? 'warning' : 'warnings') : 'notes'}`).join(', ')
  const card = el('article', { className: `report ${verdict}` },
    el('div', { className: 'clip' }),
    el('h2', {}, 'Inspection report'),
    el('p', { className: 'report-file' }, name),
    el('p', { className: 'report-summary' }, sections.length === 0 && code !== 0
      ? 'usdchecker could not inspect this file; see what it printed below.'
      : summary || 'Nothing to report.'),
    stamp)
  for (const section of sections) {
    const groups = new Map<string, Finding[]>()
    for (const f of section.findings) groups.set(f.rule, [...groups.get(f.rule) ?? [], f])
    const body = el('section', { className: 'report-section' }, el('h3', {}, sectionTitle(section.title)))
    if (groups.size === 0) body.append(el('p', { className: 'clean' }, 'Nothing to report.'))
    for (const [rule, findings] of groups) {
      const { validator, error } = splitRule(rule)
      const worst = findings.some(f => f.severity === 'Error') ? 'error' : findings.some(f => f.severity === 'Warning') ? 'warning' : 'info'
      const doc = ruleDoc(validator)
      const shown = findings.slice(0, 40)
      body.append(el('details', { className: `rule ${worst}` },
        el('summary', {},
          el('span', { className: 'dot' }),
          el('span', { className: 'rule-name' }, validator.split(':').at(-1)!, ...(error ? [el('span', { className: 'rule-error' }, ` · ${error}`)] : [])),
          el('span', { className: 'rule-count' }, findings.length > 1 ? `×${findings.length}` : '')),
        el('p', { className: 'rule-id' }, rule),
        ...(doc ? [el('p', { className: 'rule-doc' }, doc)] : []),
        el('ol', { className: 'rule-findings' }, ...shown.map(f => el('li', {}, f.message))),
        ...(findings.length > shown.length ? [el('p', { className: 'more' }, `and ${findings.length - shown.length} more`)] : [])))
    }
    card.append(body)
  }
  return card
}

// ---------------------------------------------------------------- input

function accept(files: DroppedFile[]): void {
  if (!files.length) return
  const roots = rootsOf(addFilesAt(files))
  if (!roots.length) { reports.prepend(el('p', { className: 'waiting' }, 'That had no USD file to inspect.')); return }
  for (const root of roots) inspect(root)
}
picker.addEventListener('change', () => { accept(pickedFiles(picker)); picker.value = '' })
folderPicker.addEventListener('change', () => { accept(pickedFiles(folderPicker)); folderPicker.value = '' })
acceptDrops(accept, on => scene.classList.toggle('expecting', on))

const samples = await loadSamples()
for (const sample of samples) sampleSelect.append(el('option', { value: sampleRootPath(sample), textContent: sample.title }))
sampleSelect.addEventListener('change', () => {
  if (sampleSelect.value) inspect(sampleSelect.value)
  sampleSelect.value = ''
})
