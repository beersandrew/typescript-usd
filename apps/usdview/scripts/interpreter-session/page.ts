// The browser half of run.mjs: in the built viewer, wait for the scene,
// open both interpreter windows, enter each step of the session in its
// console (timing it), capture the stage view where a step asks, and post
// the transcript back.
import type { UsdViewerElement } from '../../src/usd-viewer'

interface Step { lang: 'ts' | 'py', line: string, shot?: string, settle?: number }
const post = (kind: string, body: unknown) => fetch(`/__session/${kind}`, { method: 'POST', body: JSON.stringify(body) })
addEventListener('error', e => void post('log', `error: ${e.message}`))
addEventListener('unhandledrejection', e => void post('log', `unhandledrejection: ${String(e.reason?.stack ?? e.reason)}`))
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function main() {
  const steps = await (await fetch('/__session/steps.json')).json() as Step[]
  let viewer: UsdViewerElement | null = null
  for (let n = 0; n < 600 && !viewer; n++) { viewer = document.querySelector('usd-viewer'); if (!viewer) await sleep(100) }
  if (!viewer) throw new Error('no usd-viewer element')
  const t0 = performance.now()
  await Promise.race([new Promise(resolve => viewer!.addEventListener('scene-loaded', resolve, { once: true })), sleep(120_000)])
  const report: Record<string, unknown> = { userAgent: navigator.userAgent, sceneMs: Math.round(performance.now() - t0) }
  await sleep(1500)
  const shot = async (name: string, settle = 800) => {
    await sleep(settle)
    const blob = await viewer!.captureViewerImage()
    const data = await new Promise<string>(resolve => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsDataURL(blob) })
    await post(`image/${name}`, data)
  }
  await shot('00-start')
  const t1 = performance.now()
  const consoles = { ts: await viewer.openInterpreter('typescript'), py: await viewer.openInterpreter('python') }
  report.openMs = Math.round(performance.now() - t1)
  const out: { lang: string, line: string, output: string, ms: number, shot?: string }[] = []
  for (const step of steps) {
    const c = consoles[step.lang], before = c.text.length, t = performance.now()
    await c.run(step.line)
    out.push({ lang: step.lang, line: step.line, output: c.text.slice(before), ms: Math.round(performance.now() - t), ...step.shot ? { shot: step.shot } : {} })
    if (step.shot) await shot(step.shot, step.settle)
  }
  report.steps = out
  report.treeRows = viewer.shadowRoot!.querySelectorAll('[data-path]').length
  await post('result', report)
}

main().catch(error => post('result', { fatal: String(error?.stack ?? error) }))
