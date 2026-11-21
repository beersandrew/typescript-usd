// The browser half of run.mjs: in the real viewer page (src/main.ts on the
// dev server), open Window > Python Interpreter from the menu, enter a
// usdview-style session line by line through the console (as Return does),
// try Tab completion and the I shortcut, and post the transcript back.
import type { UsdViewerElement } from '../../src/usd-viewer'
import type { InterpreterConsole } from '../../src/interpreter-console'

const post = (kind: string, body: unknown) => fetch(`/__pycheck/${kind}`, { method: 'POST', body: JSON.stringify(body) })
addEventListener('error', e => void post('log', `error: ${e.message}`))
addEventListener('unhandledrejection', e => void post('log', `unhandledrejection: ${String(e.reason?.stack ?? e.reason)}`))
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Each entry is one Return in the console; '' ends a block. */
export const SESSION: readonly string[] = [
  'usdviewApi.stage',
  'usdviewApi.stageIdentifier',
  'usdviewApi.prim',
  'usdviewApi.frame',
  'usdviewApi.selectedPaths',
  'usdviewApi.selectedPrims',
  'usdviewApi.stage.GetDefaultPrim()',
  'UsdGeom.GetStageUpAxis(usdviewApi.stage)',
  'prims = list(usdviewApi.stage.Traverse())',
  'len(prims)',
  'for p in prims[:4]:',
  '    print(p.GetPath(), p.GetTypeName())',
  '',
  'usdviewApi.cameraPrim',
  'usdviewApi.currentGfCamera',
  'usdviewApi.viewportSize',
  'usdviewApi.dataModel.currentFrame',
  'usdviewApi.ComputeModelsFromSelection()',
  'usdviewApi.GetViewportRendererNames()',
  'usdviewApi.GetViewportCurrentRendererId()',
  'usdviewApi.ClearPrimSelection()',
  'usdviewApi.AddPrimToSelection(prims[-1])',
  'usdviewApi.selectedPaths',
  "usdviewApi.PrintStatus('hello from Python')",
  'usdviewApi.viewerMode = True',
  'usdviewApi.viewerMode',
  'usdviewApi.viewerMode = False',
  'Gf.Vec3d(1, 2, 3) * 2',
  'shot = usdviewApi.GrabViewportShot()',
  'shot',
  'help(usdviewApi.PrintStatus)',
  'import sys; sys.version_info[:2]',
  '1 / 0',
  '1 +* 2',
  'input()',
]

async function main() {
  let viewer: UsdViewerElement | null = null
  for (let n = 0; n < 600 && !viewer; n++) { viewer = document.querySelector('usd-viewer'); if (!viewer) await sleep(100) }
  if (!viewer) throw new Error('no usd-viewer element')
  await Promise.race([new Promise(resolve => viewer!.addEventListener('scene-loaded', resolve, { once: true })), sleep(60_000)])
  await sleep(1000)
  const root = viewer.shadowRoot!
  const item = root.querySelector<HTMLButtonElement>('[data-window="pythonInterpreter"]')!
  const report: Record<string, unknown> = {
    userAgent: navigator.userAgent,
    jspi: typeof (WebAssembly as unknown as { Suspending?: unknown }).Suspending === 'function',
    menuItem: { disabled: item.disabled, title: item.title, shortcut: item.querySelector('kbd')?.textContent ?? null },
  }
  const t0 = performance.now()
  item.click()
  let panel: HTMLElement | null = null
  for (let n = 0; n < 50 && !panel; n++) { panel = root.querySelector('.python-interpreter'); if (!panel) await sleep(100) }
  let console: InterpreterConsole
  try {
    console = await viewer.openInterpreter('python')
  } catch (error) {
    report.loadError = String((error as Error)?.stack ?? error)
    report.panelText = panel?.textContent ?? null
    await post('result', report)
    return
  }
  report.loadMs = Math.round(performance.now() - t0)
  report.panelShown = panel ? !panel.hidden : false
  report.banner = console.text
  const entries: { line: string, output: string, ms: number }[] = []
  for (const line of SESSION) {
    const before = console.text.length, t = performance.now()
    await console.run(line)
    entries.push({ line, output: console.text.slice(before), ms: Math.round(performance.now() - t) })
  }
  report.entries = entries
  report.status = root.querySelector('.status-message, .status, [role="status"]')?.textContent ?? null
  // Tab completion of the input line (pythonInterpreter.py _CompleteSlot).
  const tab = async (text: string) => {
    const before = console.text.length
    console.input.value = text
    console.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    await sleep(200)
    return { text, input: console.input.value, listed: console.text.slice(before) }
  }
  report.completion = [await tab('usdviewApi.PrintSt'), await tab('usdviewApi.sel'), await tab('Usd.Sta')]
  console.input.value = ''
  // The I shortcut (mainWindowUI.ui showInterpreter) reopens the Python panel.
  panel!.querySelector<HTMLButtonElement>('.tool-close')!.click()
  const hidden = panel!.hidden
  console.input.blur()
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI', key: 'i', bubbles: true, cancelable: true }))
  await sleep(500)
  report.shortcutI = { hiddenAfterClose: hidden, shownAfterI: !panel!.hidden, typescriptPanel: !!root.querySelector('.typescript-interpreter:not([hidden])') }
  report.transcript = console.text
  await post('result', report)
}

main().catch(error => post('result', { fatal: String(error?.stack ?? error) }))
