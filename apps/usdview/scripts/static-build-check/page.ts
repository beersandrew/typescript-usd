// The browser half of run.mjs: in the built viewer (dist/, served as plain
// files), check what a static build has to provide on its own: the welcome
// note's example scenes, Window > TypeScript Interpreter, and Window > Python
// Interpreter with Pyodide and the pxr package loaded from the build's own
// files. Then open the first welcome example and post the report.
import type { UsdViewerElement } from '../../src/usd-viewer'

const post = (kind: string, body: unknown) => fetch(`/__check/${kind}`, { method: 'POST', body: JSON.stringify(body) })
addEventListener('error', e => void post('log', `error: ${e.message}`))
addEventListener('unhandledrejection', e => void post('log', `unhandledrejection: ${String(e.reason?.stack ?? e.reason)}`))
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const loaded = (viewer: UsdViewerElement, ms: number) =>
  Promise.race([new Promise(resolve => viewer.addEventListener('scene-loaded', () => resolve(true), { once: true })), sleep(ms).then(() => false)])

const TYPESCRIPT = ['usdviewApi.stageIdentifier', 'usdviewApi.stage.getDefaultPrim()', '1 + 2']
const PYTHON = [
  'usdviewApi.stageIdentifier',
  'prims = list(usdviewApi.stage.Traverse())',
  'len(prims), prims[0].GetPath()',
  'Gf.Vec3d(1, 2, 3) * 2',
  'Usd.TimeCode.Default()',
  'import sys; sys.version_info[:2]',
]

async function main() {
  let viewer: UsdViewerElement | null = null
  for (let n = 0; n < 600 && !viewer; n++) { viewer = document.querySelector('usd-viewer'); if (!viewer) await sleep(100) }
  if (!viewer) throw new Error('no usd-viewer element')
  await loaded(viewer, 60_000)
  await sleep(1000)
  const root = viewer.shadowRoot!
  const report: Record<string, unknown> = { userAgent: navigator.userAgent }
  const welcome = root.querySelector<HTMLElement>('.welcome')!
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('.welcome-example')]
  report.welcome = { shown: !welcome.hidden && getComputedStyle(welcome).display !== 'none', examples: buttons.map(b => b.textContent), text: welcome.textContent }
  report.examplesMenu = [...root.querySelectorAll<HTMLOptionElement>('.scene-select option')].map(o => o.textContent)
  const menu = (name: string) => { const b = root.querySelector<HTMLButtonElement>(`[data-window="${name}"]`)!; return { disabled: b.disabled, title: b.title } }
  report.menu = { python: menu('pythonInterpreter'), typescript: menu('typescriptInterpreter') }
  const session = async (language: 'typescript' | 'python', lines: readonly string[]) => {
    const t0 = performance.now()
    const console = await viewer!.openInterpreter(language)
    const loadMs = Math.round(performance.now() - t0), entries = []
    for (const line of lines) {
      const before = console.text.length
      await console.run(line)
      entries.push({ line, output: console.text.slice(before) })
    }
    return { loadMs, entries }
  }
  try { report.typescript = await session('typescript', TYPESCRIPT) } catch (error) { report.typescriptError = String((error as Error)?.stack ?? error) }
  try { report.python = await session('python', PYTHON) } catch (error) { report.pythonError = String((error as Error)?.stack ?? error) }
  // Both consoles editing one scene: TypeScript adds a sphere, Python
  // styles and moves it, TypeScript reads and changes it again. The prim
  // tree should list it and the stage view should redraw each time.
  const shot = async (name: string) => {
    await sleep(800)
    const blob = await viewer!.captureViewerImage()
    const data = await new Promise<string>(resolve => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsDataURL(blob) })
    await post(`image/${name}`, data)
    return data.length
  }
  try {
    const ts = await viewer.openInterpreter('typescript'), py = await viewer.openInterpreter('python')
    const steps: { lang: string, line: string, output: string }[] = []
    const step = async (lang: 'ts' | 'py', line: string) => {
      const c = lang === 'ts' ? ts : py, before = c.text.length
      await c.run(line)
      steps.push({ lang, line, output: c.text.slice(before) })
    }
    const sizes: Record<string, number> = { before: await shot('0-before') }
    await step('ts', "const ball = new UsdGeom.Sphere(usdviewApi.stage.definePrim('/Ball', 'Sphere'))")
    sizes.added = await shot('1-ts-added')
    const inTree = !!root.querySelector('[data-path="/Ball"]')
    await step('py', "ball = UsdGeom.Sphere.Get(usdviewApi.stage, '/Ball')")
    await step('py', 'ball.GetRadiusAttr().Set(0.4)')
    await step('py', 'ball.GetDisplayColorAttr().Set([Gf.Vec3f(1, 0.25, 0.1)])')
    await step('py', 'UsdGeom.XformCommonAPI(ball).SetTranslate(Gf.Vec3d(0, 1.2, 0))')
    sizes.styled = await shot('2-py-styled')
    await step('ts', 'ball.getRadiusAttr().get()')
    await step('ts', "String(ball.prim.getAttr('xformOp:translate').get())")
    await step('ts', 'ball.getRadiusAttr().set(0.8)')
    sizes.grown = await shot('3-ts-grown')
    await step('py', 'ball.GetRadiusAttr().Get()')
    // A material from Python, bound to the ball.
    await step('py', "mtl = UsdShade.Material.Define(usdviewApi.stage, '/Looks/Blue')")
    await step('py', "surf = UsdShade.Shader.Define(usdviewApi.stage, '/Looks/Blue/Surface')")
    await step('py', "surf.CreateIdAttr('UsdPreviewSurface')")
    await step('py', "surf.CreateInput('diffuseColor', Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(0.1, 0.4, 1.0))")
    await step('py', "mtl.CreateSurfaceOutput().ConnectToSource(surf.ConnectableAPI(), 'surface')")
    await step('py', 'UsdShade.MaterialBindingAPI.Apply(ball.GetPrim()).Bind(mtl)')
    sizes.material = await shot('4-py-material')
    // Animation: radius samples from Python, frames set from both.
    await step('py', 'ball.GetRadiusAttr().Set(0.3, 1); ball.GetRadiusAttr().Set(1.1, 10)')
    await step('ts', 'usdviewApi.dataModel.currentFrame = 10; await usdviewApi.dataModel.frameUpdated(); usdviewApi.frame')
    sizes.frame10 = await shot('5-ts-frame10')
    await step('py', 'usdviewApi.dataModel.currentFrame = Usd.TimeCode(1)')
    await step('py', 'usdviewApi.frame')
    sizes.frame1 = await shot('6-py-frame1')
    await step('py', "usdviewApi.stage.RemovePrim('/Ball'); usdviewApi.stage.RemovePrim('/Looks')")
    await step('ts', 'usdviewApi.dataModel.currentFrame = 0; await usdviewApi.dataModel.frameUpdated()')
    sizes.removed = await shot('7-py-removed')
    report.edit = { steps, inTree, removedFromTree: !root.querySelector('[data-path="/Ball"]'), sizes }
    // Shared variables: each console reads, sets and calls the other's.
    const shared = steps.length
    const shareSizes: Record<string, number> = {}
    await step('ts', 'const size = 0.6')
    await step('py', "ball = UsdGeom.Sphere.Define(usdviewApi.stage, '/Shared'); ball.GetRadiusAttr().Set(ts.size)")
    await step('ts', 'py.ball.getRadiusAttr().get()')
    await step('py', 'def paint(prim, r, g, b):\n    UsdGeom.Gprim(prim).GetDisplayColorAttr().Set([Gf.Vec3f(r, g, b)])\n')
    await step('ts', "py.paint(usdviewApi.stage.getPrim('/Shared'), 0.95, 0.8, 0.1)")
    shareSizes.painted = await shot('8-ts-calls-python')
    await step('ts', 'function lift(sphere, height) { new UsdGeom.XformCommonAPI(sphere.prim).setTranslate([0, height, 0]); return sphere.prim.path }')
    await step('py', 'ts.lift(ball, 1.5)')
    shareSizes.lifted = await shot('9-py-calls-typescript')
    await step('py', 'ts.size = ball.GetRadiusAttr().Get() * 2')
    await step('ts', 'py.ball.getRadiusAttr().set(size); size')
    shareSizes.grown = await shot('10-shared-grown')
    await step('py', "usdviewApi.stage.RemovePrim('/Shared')")
    shareSizes.removed = await shot('11-removed')
    report.share = { steps: steps.slice(shared), sizes: shareSizes }
  } catch (error) { report.editError = String((error as Error)?.stack ?? error) }
  if (buttons[0]) {
    const t0 = performance.now()
    const wait = loaded(viewer, 120_000)
    buttons[0].click()
    report.example = { label: buttons[0].textContent, loaded: await wait, ms: Math.round(performance.now() - t0), src: viewer.src, welcomeHidden: welcome.hidden }
  }
  await post('result', report)
}

main().catch(error => post('result', { fatal: String(error?.stack ?? error) }))
