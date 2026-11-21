// Dev-only Python example runner (beside Window > Python Interpreter, whose
// page Pyodide it shares: src/py-interpreter.ts). Loaded on
// demand by ?pythonExample=thumbnail|cards[&pythonInput=<file>]: it starts
// Pyodide with the library's pxr forwarding layer (packages/usd/python),
// runs one of the API-only example scripts (python/examples) on an example
// input, opens the camera stage the script built and lists its cameras, so
// each generated camera's framing can be checked in the viewport.
//
// The scripts run in memory (no --output-dir): in a page typescript-usd
// reads assets by URL, so the input is opened from the dev server
// (/pxr-examples/, scripts/pxr-python.ts), and the camera stage is handed to
// the viewer as a local file holding its root layer, which sublayers the
// input by URL as the script authored it.
import type { UsdViewerElement } from './usd-viewer'
import { loadPagePython } from './py-interpreter'

const EXAMPLES = {
  thumbnail: {
    script: 'generate_thumbnail_api.py',
    argv: (input: string) => ['--usd-file', input, '--apply-thumbnail', '--width', '512'],
    layerName: 'default_thumbnail.usda',
  },
  cards: {
    script: 'generate_cards_api.py',
    argv: (input: string) => [input, '--apply-cards', '--image-width', '512'],
    layerName: 'cameras.usda',
  },
} as const

export type PythonExample = keyof typeof EXAMPLES

interface CoreLayer { exportToString(): string, isAnonymous(): boolean, getSubLayerPaths(): string[], identifier: string }
interface CoreStage { getRootLayer(): CoreLayer }
interface PyGet { get(key: string): unknown, has?(key: string): boolean }

function panel(): { log(line: string): void, cameras(paths: string[], pick: (path: string) => void): void, layer(text: string): void, image(label: string, blob: Blob): void } {
  const box = document.createElement('section')
  box.className = 'python-runner'
  box.setAttribute('aria-label', 'Python example runner')
  Object.assign(box.style, {
    position: 'fixed', right: '12px', bottom: '12px', zIndex: '1000', width: 'min(420px, calc(100vw - 32px))',
    maxHeight: '60vh', overflow: 'auto', padding: '10px 12px', borderRadius: '8px',
    background: 'Canvas', color: 'CanvasText', border: '1px solid GrayText',
    font: '12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace', boxShadow: '0 4px 16px rgb(0 0 0 / 0.25)',
  })
  const title = document.createElement('strong')
  title.textContent = 'Python example (Pyodide)'
  const log = document.createElement('pre')
  Object.assign(log.style, { whiteSpace: 'pre-wrap', margin: '6px 0' })
  const buttons = document.createElement('div')
  Object.assign(buttons.style, { display: 'flex', flexWrap: 'wrap', gap: '4px' })
  const details = document.createElement('details')
  const summary = document.createElement('summary')
  summary.textContent = 'Camera layer'
  const layer = document.createElement('pre')
  Object.assign(layer.style, { whiteSpace: 'pre', overflow: 'auto', maxHeight: '30vh' })
  details.append(summary, layer)
  const gallery = document.createElement('div')
  Object.assign(gallery.style, { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', marginTop: '6px' })
  box.append(title, log, buttons, gallery, details)
  document.body.append(box)
  return {
    log(line) { log.textContent += `${line}\n` },
    cameras(paths, pick) {
      buttons.replaceChildren(...paths.map(path => {
        const b = document.createElement('button')
        b.type = 'button'
        b.textContent = path.split('/').pop()!
        b.title = path
        b.dataset.camera = path
        b.addEventListener('click', () => pick(path))
        return b
      }))
    },
    layer(text) { layer.textContent = text },
    image(label, blob) {
      const figure = document.createElement('figure')
      Object.assign(figure.style, { margin: '0' })
      const img = document.createElement('img')
      img.src = URL.createObjectURL(blob)
      img.alt = `View through ${label}`
      Object.assign(img.style, { width: '100%', display: 'block', background: '#000' })
      const caption = document.createElement('figcaption')
      caption.textContent = label
      figure.append(img, caption)
      gallery.append(figure)
    },
  }
}

export async function runPythonExample(viewer: UsdViewerElement, example: PythonExample, input: string): Promise<void> {
  const ui = panel()
  const spec = EXAMPLES[example]
  try {
    const py = await import('virtual:pxr-python')
    const jspi = py.jspiSupported()
    ui.log(`JSPI (WebAssembly.Suspending): ${jspi ? 'available' : 'NOT available'}`)
    if (!jspi) throw new Error('run_sync needs JSPI; this browser does not provide WebAssembly.Suspending')
    const t0 = performance.now()
    const pxr = await loadPagePython().then(page => page.pxr)
    ui.log(`Pyodide loaded in ${pxr.loadMs.toFixed(0)} ms`)
    const inputUrl = new URL(`/pxr-examples/${input}`, location.href).href
    const argv = spec.argv(inputUrl)
    ui.log(`$ python ${spec.script} ${argv.join(' ')}`)
    const t1 = performance.now()
    const result = await pxr.run(`${py.examplesDir}/${spec.script}`, argv)
    ui.log(result.output.trim())
    ui.log(`exit ${result.exitCode} in ${(performance.now() - t1).toFixed(0)} ms (total ${(performance.now() - t0).toFixed(0)} ms)`)
    if (result.exitCode !== 0) throw new Error('the script failed')
    const outputs = result.outputs as PyGet
    const stage = (outputs.get('cameraStage') as { _js: CoreStage })._js
    const paths = example === 'cards'
      ? [...(outputs.get('cameraPaths') as Iterable<string>)]
      : [outputs.get('cameraPath') as string]
    let text = stage.getRootLayer().exportToString()
    // A usdz input's subject is an in-memory wrapper layer (anonymous: the
    // original app saves it as <name>_Cards.usda). The viewer cannot open an
    // anonymous layer by name, so the camera layer views the wrapper's own
    // sublayer, the usdz, as the original app's render did (its wrapper on
    // disk held the sublayer, not the card edits).
    const subject = (outputs.get('subjectStage') as { _js: CoreStage })._js.getRootLayer()
    if (subject.isAnonymous()) {
      const target = [...subject.getSubLayerPaths()][0]
      if (target) {
        text = text.split(subject.identifier).join(target)
        ui.log(`camera layer views ${target} (the in-memory wrapper's sublayer)`)
      }
    }
    ui.layer(text)
    const loaded = new Promise<void>(resolve => viewer.addEventListener('scene-loaded', () => resolve(), { once: true }))
    viewer.openLocalFile(new File([text], spec.layerName, { type: 'text/plain' }))
    await loaded
    const pick = (path: string) => { viewer.followCamera(path); ui.log(`viewing through ${path}`) }
    ui.cameras(paths, pick)
    // The view through each generated camera, for checking its framing.
    for (const path of paths) {
      viewer.followCamera(path)
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const blob = await viewer.captureViewerImage()
      const name = path.split('/').pop()!
      ui.image(name, blob)
      void fetch(`/pxr-capture/${example}-${input.replace(/[^\w.-]/g, '_')}-${name}.png`, { method: 'POST', body: blob }).catch(() => undefined)
    }
    pick(paths[0]!)
    document.body.dataset.pythonExample = 'ready'
  } catch (error) {
    ui.log(`error: ${error instanceof Error ? error.message : String(error)}`)
    document.body.dataset.pythonExample = 'failed'
  }
}
