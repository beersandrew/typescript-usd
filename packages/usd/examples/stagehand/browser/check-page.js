// Browser half of check.mjs: waits for the heath to open in typescript-usdview,
// sets frames 0, 24 and 48 through the TypeScript interpreter (usdviewApi), and
// posts a stage view image of each, plus what Hydra holds for the cauldron.
const post = (kind, body) => fetch(`/__check/${kind}`, { method: 'POST', body: JSON.stringify(body) })
addEventListener('error', e => void post('log', `error: ${e.message}`))
addEventListener('unhandledrejection', e => void post('log', `unhandledrejection: ${String(e.reason?.stack ?? e.reason)}`))
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function main() {
  let viewer = null
  for (let n = 0; n < 600 && !viewer; n++) { viewer = document.querySelector('usd-viewer'); if (!viewer) await sleep(100) }
  const loaded = await Promise.race([new Promise(r => viewer.addEventListener('scene-loaded', () => r(true), { once: true })), sleep(60000).then(() => false)])
  await post('log', `scene-loaded ${loaded}; warnings ${JSON.stringify(viewer.startupWarnings ?? [])}`)
  await sleep(1500)
  const ts = await viewer.openInterpreter('typescript')
  const run = async line => { const before = ts.text.length; await ts.run(line); return ts.text.slice(before) }
  await post('log', await run('usdviewApi.stage.getPrimAtPath("/Heath/Cauldron").getAppliedSchemas()'))
  for (const f of [0, 24, 48]) {
    await post('log', await run(`usdviewApi.dataModel.currentFrame = ${f}; await usdviewApi.dataModel.frameUpdated(); usdviewApi.frame`))
    await sleep(1200)
    const blob = await viewer.captureViewerImage()
    const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result)); fr.readAsDataURL(blob) })
    await post(`image/frame${f}`, data)
  }
  await post('done', { ok: true })
}
main().catch(e => post('done', { fatal: String(e?.stack ?? e) }))
