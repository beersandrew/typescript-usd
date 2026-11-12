// Browser half of tests/browser/storm-image/tessellator/run.mjs: runs HgiWebGPU's
// tessellator kernels (pxr/imaging/hgiWebGPU/src/tessellatorWGSL.ts, through
// HgiWebGPUTessellation as patch draws use them) on many patches of
// half-float factors, and compares every patch's points and indices with
// the TypeScript port (src/tessellator.ts, itself checked against Apple's
// tessellator by tests/tessellator.test.ts): same points in the same order,
// same indices in the same order.
import { HgiWebGPU } from '../../../../pxr/imaging/hgiWebGPU/src/index.ts'
import { HgiWebGPUTessellation } from '../../../../pxr/imaging/hgiWebGPU/src/tessellation.ts'
import {
  HgiWebGPUTessellator, HgiWebGPUTessellatorOutputPrimitive as O, HgiWebGPUTessellatorPartitioning as P,
} from '../../../../pxr/imaging/hgiWebGPU/src/tessellator.ts'

const log = document.getElementById('log')!
const hgi = await HgiWebGPU.create()
if (!hgi) throw new Error('no WebGPU device')
const device = hgi.getPrimaryDevice()
const errors: string[] = []
device.addEventListener('uncapturederror', ev => errors.push((ev as GPUUncapturedErrorEvent).error.message))

const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer)
function toHalfBits(x: number): number { // round to nearest even (values here are exact halves)
  f32[0] = x; const b = u32[0]!; const e = ((b >> 23) & 0xff) - 112, m = b & 0x7fffff
  if (e <= 0) return 0
  return (e << 10) | (m >> 13)
}
function halfToFloat(h: number): number {
  const e = (h >> 10) & 0x1f, f = h & 0x3ff
  return e === 0 ? Math.pow(2, -14) * (f / 1024) : Math.pow(2, e - 15) * (1 + f / 1024)
}
let seed = 12345
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
const values = [0.25, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 7, 8, 9.5, 16, 31, 33, 63, 64, 70]
function randomFactor(): number {
  const v = rnd() < 0.5 ? values[Math.floor(rnd() * values.length)]! : 0.5 + rnd() * rnd() * 66
  return halfToFloat(toHalfBits(v))
}

const tess = new HgiWebGPUTessellation(device)
const results: { config: string, patches: number, mismatches: string[], attempts: number }[] = []
const PATCHES = 300
for (const domain of ['quad', 'tri'] as const) {
  for (const partitioning of [P.Integer, P.Pow2, P.FractionalOdd, P.FractionalEven]) {
    for (const outputPrimitive of [O.TriangleCW, O.TriangleCCW]) {
      const per = domain === 'quad' ? 6 : 4
      const factors: number[][] = []
      for (let i = 0; i < PATCHES; i++) {
        const uniform = rnd() < 0.2
        const v = randomFactor()
        factors.push(Array.from({ length: per }, () => uniform ? v : randomFactor()))
      }
      if (domain === 'quad') factors[0] = [1, 1, 1, 1, 0, 0]
      factors[1] = Array.from({ length: per }, () => 0) // culled
      const halves = new Uint16Array(factors.flat().map(toHalfBits))
      // two leading patches of padding: the draw starts at patch 2
      const padded = new Uint16Array(halves.length + 2 * per + 2)
      padded.set(halves, 2 * per)
      const factorBuffer = device.createBuffer({ size: padded.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
      device.queue.writeBuffer(factorBuffer, 0, padded)
      async function runOnce() {
        const params = device.createBuffer({ size: 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
        const encoder = device.createCommandEncoder()
        let pass: GPUComputePassEncoder | null = null
        const frame = tess.beginFrame()
        const drawn = tess.encode(frame, {
          pass: () => (pass ??= encoder.beginComputePass()),
          suspend: work => { pass?.end(); pass = null; work(encoder) },
          allocateParams: bytes => { device.queue.writeBuffer(params, 0, bytes); return { buffer: params, offset: 0, size: 48 } },
          factors: factorBuffer, factorsByteOffset: 0, patchStart: 2, patchCount: PATCHES, instanceCount: 1,
          config: { domain, partitioning, outputPrimitive },
        })!
        pass!.end()
        const t = tess as unknown as { _points: GPUBuffer, _indices: GPUBuffer, _counts: GPUBuffer }
        const read = (src: GPUBuffer, size: number) => {
          const b = device.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
          encoder.copyBufferToBuffer(src, 0, b, 0, size)
          return b
        }
        const stateB = read(frame.state, 64)
        const pointsB = read(t._points, t._points.size)
        const indicesB = read(t._indices, t._indices.size)
        const countsB = read(t._counts, PATCHES * 8)
        const after = tess.endFrame(frame, encoder)
        device.queue.submit([encoder.finish()])
        const grown = after?.() ?? Promise.resolve()
        await Promise.all([stateB, pointsB, indicesB, countsB].map(b => b.mapAsync(GPUMapMode.READ)))
        const copy = (b: GPUBuffer) => { const a = new Uint32Array(b.getMappedRange().slice(0)); b.destroy(); return a }
        return { state: copy(stateB), points: copy(pointsB), indices: copy(indicesB), counts: copy(countsB), drawn, grown }
      }
      let attempt = 0
      let run: Awaited<ReturnType<typeof runOnce>>
      // A first run can overflow the pools; HgiWebGPUTessellation.EndFrame
      // grows them (with a warning), as for a frame, and the run repeats.
      for (;;) {
        run = await runOnce()
        if (run.state[4] === 0 || attempt++ > 2) break
        await run.grown
      }
      const { state, points, indices, counts, drawn } = run
      const mismatches: string[] = []
      const args = state.subarray(drawn.argsOffset / 4, drawn.argsOffset / 4 + 5)
      let totalPoints = 0, totalIndices = 0
      const ref = new HgiWebGPUTessellator()
      ref.init(partitioning, outputPrimitive)
      for (let p = 0; p < PATCHES; p++) {
        const f = factors[p]!
        if (domain === 'quad') ref.tessellateQuadDomain(f[0]!, f[1]!, f[2]!, f[3]!, f[4]!, f[5]!)
        else ref.tessellateTriDomain(f[0]!, f[1]!, f[2]!, f[3]!)
        const rp = ref.getPointsFixed(), ri = ref.getIndices()
        const pb = counts[2 * p]!, ib = counts[2 * p + 1]!
        if (pb !== totalPoints || ib !== totalIndices) mismatches.push(`patch ${p}: offsets ${pb}/${ib} vs ${totalPoints}/${totalIndices}`)
        let bad = ''
        for (let k = 0; k < rp.length / 2 && !bad; k++) {
          const w = (state[5]! + pb + k) * 3
          if (points[w] !== p || points[w + 1] !== rp[2 * k] || points[w + 2] !== rp[2 * k + 1]) {
            bad = `point ${k}: (${points[w]}, ${points[w + 1]}, ${points[w + 2]}) vs (${p}, ${rp[2 * k]}, ${rp[2 * k + 1]}); ` +
              `${rp.length / 2} points, first ${Array.from(rp.slice(0, 8))} vs ` +
              `${Array.from({ length: 4 }, (_, j) => `${points[(state[5]! + pb + j) * 3 + 1]},${points[(state[5]! + pb + j) * 3 + 2]}`)}`
          }
        }
        for (let k = 0; k < ri.length && !bad; k++) {
          if (indices[state[6]! + ib + k] !== state[5]! + pb + ri[k]!) {
            bad = `index ${k}: ${Array.from(indices.slice(state[6]! + ib, state[6]! + ib + 6)).map(i => i - state[5]! - pb)} vs ${Array.from(ri.slice(0, 6))}`
          }
        }
        if (bad) mismatches.push(`patch ${p} [${f.join(', ')}]: ${bad}`)
        totalPoints += rp.length / 2
        totalIndices += ri.length
      }
      if (args[0] !== totalIndices || args[1] !== 1 || state[2] !== totalPoints) {
        mismatches.push(`draw args ${Array.from(args)} / needed ${state[2]} vs ${totalIndices} indices, ${totalPoints} points`)
      }
      const config = `${domain} ${P[partitioning]} ${O[outputPrimitive]}`
      results.push({ config, patches: PATCHES, mismatches: mismatches.slice(0, 20), attempts: attempt + 1 })
      log.textContent += `\n${config}: ${mismatches.length} mismatches`
    }
  }
}
await fetch('/__result', { method: 'POST', body: JSON.stringify({ results, errors, userAgent: navigator.userAgent }) })
log.textContent += '\ndone'
