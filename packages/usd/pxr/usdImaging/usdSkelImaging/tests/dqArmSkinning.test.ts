// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/extCompGpuComputation.cpp,
//  pxr/usd/usdSkel/utils.cpp,
//  pxr/usdImaging/usdSkelImaging/extComputations.cpp,
//  pxr/usdImaging/usdSkelImaging/shaders/skinning.glslfx
// Copyright 2016, 2017, 2019, 2025 Pixar. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Controller test: the usdSkelImaging skinning computation of a two-joint
// arm skinned with dual quaternions (primvars:skel:skinningMethod =
// "dualQuaternion") and with linear blending, through
// UsdImagingCreateSceneIndices. The skinning computation's CPU callback
// (pxr/usdImaging/usdSkelImaging/extComputations.cpp) must produce, per
// mesh and per time, the reference build's UsdSkel-skinned points
// (UsdSkelSkinningQuery::ComputeSkinnedPoints, which dispatches to
// UsdSkelSkinPointsDQS or UsdSkelSkinPointsLBS, pxr/usd/usdSkel/utils.cpp),
// captured into fixtures/dqArm (FIXTURES.md). The fixture's time 3 twists the
// forearm 150 degrees, where linear blending collapses the tube and dual
// quaternions keep it round; time 5 authors the time 2 bend as the negated
// quaternion.
//
// The same points must reach Storm: committed by HdStExtCompCpuComputation
// with USDSKELIMAGING_FORCE_CPU_COMPUTE=1, and, on the default GPU path,
// produced by the skinPointsDQSKernel / skinPointsLBSKernel compute program
// (extComputations.cpp:539-580) from the buffers and constant parameters
// HdStExtCompGpuComputation::Execute binds (extCompGpuComputation.cpp:
// 96-276). The test Hgi records GPU work without executing it, so the
// GPU-path test evaluates Compute.SkinPointsDQS of skinning.glslfx on the
// recorded inputs.
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HgiShaderStageBits, type HgiResourceBindings, type HgiShaderFunctionDesc } from 'typescript-usd/hgi'
import { Stage as UsdStage } from 'typescript-usd/usd'
import { UsdImagingCreateSceneIndices } from 'typescript-usd/usdImaging'
import 'typescript-usd/usdSkelImaging'
import { UsdSkelImagingExtComputationGlslKernel } from 'typescript-usd/usdSkelImaging'
import type { BufferTestBuffer } from '../../../imaging/hdSt/tests/bufferTestHgi.ts'
import { DumpSkinning } from './skinningDump.ts'
import { StormArmScene } from './stormSkinningHarness.ts'

const usda = new URL('fixtures/dqArm/dqArm.usda', import.meta.url).pathname
const reference = JSON.parse(readFileSync(
  new URL('fixtures/dqArm/dqArmSkinnedPoints.json', import.meta.url), 'utf8')).payload as {
  pointsTolerance: number,
  meshes: Record<string, { skinningMethod: string, samples: Record<string, number[][]> }>
}

/** The skinnedPoints of each skinning computation in a DumpSkinning
 *  printout, keyed by the computation's prim path. */
function _ComputedPoints(dump: string[]): Map<string, number[][]> {
  const result = new Map<string, number[][]>()
  let prim = ''
  for (let i = 0; i < dump.length; ++i) {
    const line = dump[i]!
    if (!line.startsWith('\t')) prim = line.split(' ')[0]!
    if (!line.startsWith('\tcomputed skinnedPoints ')) continue
    const n = Number(line.split(' ').at(-1))
    result.set(prim, dump.slice(i + 1, i + 1 + n).map(l => l.trim().split(' ').map(Number)))
  }
  return result
}

function _MaxError(actual: number[][] | undefined, expected: number[][]): number {
  if (!actual || actual.length !== expected.length) return Infinity
  let err = 0
  for (let i = 0; i < expected.length; ++i) {
    for (let c = 0; c < 3; ++c) err = Math.max(err, Math.abs(actual[i]![c]! - expected[i]![c]!))
  }
  return err
}

describe('usdSkelImaging dual quaternion and linear skinning of dqArm.usda', () => {
  for (const time of [1, 2, 3, 4, 5]) {
    for (const [meshPath, { skinningMethod, samples }] of Object.entries(reference.meshes)) {
      it(`skins ${meshPath} (${skinningMethod}) at time ${time} as UsdSkel does`, async () => {
        const stage = await UsdStage.open(usda)
        const sis = UsdImagingCreateSceneIndices({ stage: stage! })
        sis.stageSceneIndex.SetTime(time)
        const computed = _ComputedPoints(DumpSkinning(sis.finalSceneIndex, '/Model'))
        const points = [...computed].find(([path]) => path.startsWith(`${meshPath}/`))?.[1]
        expect(_MaxError(points, samples[String(time)]!)).toBeLessThanOrEqual(reference.pointsTolerance)
      })
    }
  }
})

const sequence = [1, 3, 2, 5, 4]

describe('dqArm.usda skinned by Storm on the CPU (HdStExtCompCpuComputation)', () => {
  const ENV = 'USDSKELIMAGING_FORCE_CPU_COMPUTE'
  let saved: string | undefined
  beforeAll(() => { saved = process.env[ENV]; process.env[ENV] = '1' })
  afterAll(() => { if (saved === undefined) delete process.env[ENV]; else process.env[ENV] = saved })

  for (const [meshPath, { skinningMethod, samples }] of Object.entries(reference.meshes)) {
    it(`commits the reference points of ${meshPath} (${skinningMethod}) at times ${sequence}`, async () => {
      const arm = await StormArmScene(usda, meshPath)
      for (const time of sequence) {
        arm.syncAt(time)
        expect(_MaxError(arm.armPoints(), samples[String(time)]!), `time ${time}`)
          .toBeLessThanOrEqual(reference.pointsTolerance)
      }
    })
  }
})

/** The inputs one recorded ExtComputation dispatch reads: its compute
 *  function, constant parameters and bound storage buffers. */
interface _Dispatch { desc: HgiShaderFunctionDesc, constants: Int32Array<ArrayBufferLike>, buffers: Map<string, Uint8Array>, count: number }

function _ExtCompDispatches(hgi: Awaited<ReturnType<typeof StormArmScene>>['hgi']): _Dispatch[] {
  const computeDescs = hgi.shaderFunctionDescs.filter(d =>
    d.shaderStage === HgiShaderStageBits.HgiShaderStageCompute && (d.shaderCode ?? '').includes('HdSet_skinnedPoints'))
  const result: _Dispatch[] = []
  let inExtComp = false
  let bindings: HgiResourceBindings | undefined
  let constants: Int32Array<ArrayBufferLike> = new Int32Array()
  for (const c of hgi.calls) {
    if (c.call === 'compute.PushDebugGroup') inExtComp = c.args[0] === 'ExtComputation'
    if (!inExtComp) continue
    if (c.call === 'compute.BindResources') bindings = (c.args[0] as { Get(): HgiResourceBindings }).Get()
    if (c.call === 'compute.SetConstantValues') {
      const bytes = c.args.at(-1) as Uint8Array
      constants = new Int32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    }
    if (c.call !== 'compute.Dispatch') continue
    // The program whose constant block has this many parameters.
    const desc = computeDescs.find(d => d.constantParams.length === constants.length)!
    const buffers = new Map<string, Uint8Array>()
    for (const b of bindings!.getDescriptor().buffers) {
      const name = desc.buffers.find(x => x.bindIndex === b.bindingIndex)!.nameInShader
      buffers.set(name, (b.buffers[0]!.Get() as unknown as BufferTestBuffer).bytes)
    }
    result.push({ desc, constants, buffers, count: c.args[0] as number })
  }
  return result
}

/** Compute.SkinPointsDQS of skinning.glslfx (with HD_HAS_skinningScaleXforms
 *  and no blend shapes) on a recorded dispatch's inputs, read through the
 *  HdGet_ accessors' offset/stride constants. */
function _EvaluateSkinPointsDQS(d: _Dispatch): number[][] {
  const u = new Map(d.desc.constantParams.map((p, i) => [p.nameInShader, d.constants[i]!]))
  const view = (name: string) => new DataView(d.buffers.get(name)!.buffer, d.buffers.get(name)!.byteOffset)
  const get = (name: string, i: number, n: number) => {
    const v = view(name), base = i * u.get(`${name}Stride`)! + u.get(`${name}Offset`)!
    return Array.from({ length: n }, (_, j) => v.getFloat32(4 * (base + j), true))
  }
  const getInt = (name: string) => view(name).getInt32(4 * u.get(`${name}Offset`)!, true)
  // GLSL mat4 * vec4 on column-major data.
  const mul4 = (m: number[], v: number[]) =>
    [0, 1, 2, 3].map(r => v[0]! * m[r]! + v[1]! * m[4 + r]! + v[2]! * m[8 + r]! + v[3]! * m[12 + r]!)
  const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0)
  const numInfluences = getInt('numInfluencesPerComponent')
  const constant = getInt('hasConstantInfluences') !== 0
  const result: number[][] = []
  for (let index = 0; index < d.count; ++index) {
    const initP = mul4(get('geomBindXform', 0, 16), [...get('restPoints', index, 3), 1])
    const offset = constant ? 0 : numInfluences * index
    const influences = Array.from({ length: numInfluences }, (_, i) => get('influences', offset + i, 2))
    let pivotQuat = [0, 0, 0, 0], pivotIdx = -1, maxw = -1
    for (const [joint, weight] of influences) {
      if (pivotIdx < 0 || maxw < weight!) { maxw = weight!; pivotIdx = Math.trunc(joint!) }
    }
    if (pivotIdx >= 0) pivotQuat = get('skinningDualQuats', pivotIdx * 2, 4)
    let scaledP = [0, 0, 0], real = [0, 0, 0, 0], dual = [0, 0, 0, 0]
    for (const [joint, w] of influences) {
      let weight = w!
      if (!(weight > 1e-5)) continue
      const j = Math.trunc(joint!), s = get('skinningScaleXforms', j, 9)
      scaledP = scaledP.map((x, r) => x + (initP[0]! * s[r]! + initP[1]! * s[3 + r]! + initP[2]! * s[6 + r]!) * weight)
      const dqReal = get('skinningDualQuats', j * 2, 4), dqDual = get('skinningDualQuats', j * 2 + 1, 4)
      if (dot(dqReal, pivotQuat) < 0) weight = -weight
      real = real.map((x, c) => x + dqReal[c]! * weight)
      dual = dual.map((x, c) => x + dqDual[c]! * weight)
    }
    const length = Math.hypot(...real)
    if (length < 1e-10) {
      real = [0, 0, 0, 1]; dual = [0, 0, 0, 0]
    } else {
      real = real.map(x => x / length); dual = dual.map(x => x / length)
      const rd = dot(real, dual)
      dual = dual.map((x, c) => x - rd * real[c]!)
    }
    // TransformByQuaternion + GetDualQuaternionTranslation.
    const [i0, i1, i2, r1] = real as [number, number, number, number]
    const v = scaledP as [number, number, number]
    const t = [r1 * v[0] + (i1 * v[2] - i2 * v[1]), r1 * v[1] + (i2 * v[0] - i0 * v[2]), r1 * v[2] + (i0 * v[1] - i1 * v[0])]
    const [di0, di1, di2, dw] = dual as [number, number, number, number]
    const p = [
      v[0] + 2 * (i1 * t[2]! - i2 * t[1]!) - 2 * (dw * i0 - r1 * di0 + di1 * i2 - di2 * i1),
      v[1] + 2 * (i2 * t[0]! - i0 * t[2]!) - 2 * (dw * i1 - r1 * di1 + di2 * i0 - di0 * i2),
      v[2] + 2 * (i0 * t[1]! - i1 * t[0]!) - 2 * (dw * i2 - r1 * di2 + di0 * i1 - di1 * i0),
    ]
    const skelToPrimLocal = (q: number[]) =>
      mul4(get('primWorldToLocal', 0, 16), mul4(get('skelLocalToWorld', 0, 16), q))
    result.push(skelToPrimLocal([...p, 1]).slice(0, 3))
  }
  return result
}

describe('dqArm.usda skinned by Storm on the GPU (HdStExtCompGpuComputation)', () => {
  it('compiles skinPointsDQSKernel for the dual quaternion mesh and skinPointsLBSKernel for the other', async () => {
    const arm = await StormArmScene(usda, '/Model/ArmDQ')
    arm.syncAt(3)
    const sources = arm.hgi.shaderFunctionDescs.filter(d =>
      d.shaderStage === HgiShaderStageBits.HgiShaderStageCompute && (d.shaderCode ?? '').includes('HdSet_skinnedPoints'))
      .map(d => d.shaderCode!)
    for (const method of ['dualQuaternion', 'classicLinear']) {
      const kernel = UsdSkelImagingExtComputationGlslKernel(method, 'points')!.getTypedValue(0)
      const body = kernel.slice(kernel.indexOf('void compute(int index)')).trim()
      expect(sources.filter(s => s.includes(body)).length, method).toBe(1)
    }
  })

  it(`binds the inputs from which skinPointsDQSKernel yields the reference points at times ${sequence}`, async () => {
    const arm = await StormArmScene(usda, '/Model/ArmDQ')
    const samples = reference.meshes['/Model/ArmDQ']!.samples
    for (const time of sequence) {
      arm.hgi.calls.length = 0
      arm.syncAt(time)
      const dq = _ExtCompDispatches(arm.hgi).filter(d => d.buffers.has('skinningDualQuats'))
      expect(dq.length, `time ${time}`).toBe(1)
      expect(_MaxError(_EvaluateSkinPointsDQS(dq[0]!), samples[String(time)]!), `time ${time}`)
        .toBeLessThanOrEqual(reference.pointsTolerance)
    }
  })
})
