// Ported from OpenUSD 26.11.1: pxr/exec/execGeom/xformable.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The spotlight-rig gate (docs/openexec-x1.md section 2): a controller-driven
// spotlight rig, computed by ExecUsdSystem and compared at 1e-12 with the
// native OpenUSD 26.11.1 capture in fixtures/spotlightRig (FIXTURES.md).
// The request is the capture's: computeValue of the two
// IrFkControllers' out:space, then execGeom's computeLocalToWorldTransform
// (execGeom/xformable.cpp:23-57) of Rig/Lamp, Rig/Lamp/Bulb and Rig/Plate;
// ChangeTime(f) and Compute for every frame f in 1..48.
//
// UsdGeomXformCache only confirms that the fixture's non-exec baseline
// matches the capture's usdGeomLocalToWorld; the authored (non-exec)
// xformOp:transform of Plate carries the opposite sign in y translation,
// which exec's connected controller value corrects.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TfErrorMark } from 'typescript-usd/tf'
import { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Layer as SdfLayer } from 'typescript-usd/sdf'
import { Stage as UsdStage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { XformCache as UsdGeomXformCache } from 'typescript-usd/usdGeom'
import { ExecBuiltinComputations } from 'typescript-usd/exec'
import { _interim_ExecLoadPluginsAsync } from 'typescript-usd/exec/_internal'
import { ExecUsdSystem, ExecUsdValueKey } from 'typescript-usd/execUsd'
import 'typescript-usd/execGeom'
import 'typescript-usd/usdLux'
import 'typescript-usd/execIr'
import { readOracleFixture } from '../../../testing/oracleFixture.ts'

type Mat = number[]
interface Frame {
  frame: number
  outSpace: Record<string, Mat>
  localToWorld: Record<string, Mat | null>
  usdGeomLocalToWorld: Record<string, Mat>
}
interface Payload {
  stage: string
  request: { outSpace: string[], localToWorld: string[] }
  serialEqualsParallel: boolean
  frames: Frame[]
}

const fixtureDir = new URL('./fixtures/spotlightRig/', import.meta.url)
const expected = readOracleFixture<Payload>(new URL('expected.json', fixtureDir))

const TOLERANCE = 1e-12

function _Rows(m: GfMatrix4d): Mat {
  const out: Mat = []
  for (let r = 0; r < 4; ++r) {
    for (let c = 0; c < 4; ++c) {
      out.push(m.getElement(r, c))
    }
  }
  return out
}

function _ExpectClose(actual: Mat, wanted: Mat, label: string): void {
  expect(actual.length, label).toBe(16)
  for (let i = 0; i < 16; ++i) {
    const diff = Math.abs(actual[i]! - wanted[i]!)
    if (!(diff <= TOLERANCE)) {
      throw new Error(`${label}[${i}]: got ${actual[i]}, native ${wanted[i]} (|diff| ${diff})`)
    }
  }
}

function _MaxDiff(a: Mat, b: Mat): number {
  let max = 0
  for (let i = 0; i < 16; ++i) {
    max = Math.max(max, Math.abs(a[i]! - b[i]!))
  }
  return max
}

async function _OpenStage(): Promise<UsdStage> {
  const layer = SdfLayer.createAnonymous('.usda')
  layer.importFromString(readFileSync(new URL(expected.stage, fixtureDir), 'utf8'))
  return UsdStage.open(layer)
}

describe('spotlight rig (native capture)', () => {
  it('fixture was captured cleanly, with serial equal to parallel', () => {
    expect(expected.serialEqualsParallel).toBe(true)
    expect(expected.frames.map(f => f.frame)).toEqual(
      Array.from({ length: 48 }, (_, i) => i + 1))
  })

  it('ExecUsdSystem matches native out:space and computeLocalToWorldTransform at 1e-12', async () => {
    expect(await _interim_ExecLoadPluginsAsync()).toBe(true)
    const stage = await _OpenStage()
    const mark = new TfErrorMark()

    // One request: the controllers' out:space values, then the xformables'
    // local-to-world transforms, in the capture's order.
    const keys: ExecUsdValueKey[] = []
    for (const c of expected.request.outSpace) {
      keys.push(new ExecUsdValueKey(
        stage.getPrim(c)!.getAttr('out:space')!,
        ExecBuiltinComputations.computeValue))
    }
    for (const x of expected.request.localToWorld) {
      keys.push(new ExecUsdValueKey(stage.getPrim(x)!, 'computeLocalToWorldTransform'))
    }
    const system = new ExecUsdSystem(stage)
    const request = system.buildRequest(keys)
    system.prepareRequest(request)

    for (const f of expected.frames) {
      system.changeTime(new UsdTimeCode(f.frame))
      const cache = system.compute(request)
      let i = 0
      for (const c of expected.request.outSpace) {
        const v = cache.Get(i++)
        expect(v.IsHolding(VtValueTypes.GfMatrix4d), `${f.frame} ${c}`).toBe(true)
        _ExpectClose(_Rows(v.Get<GfMatrix4d>()), f.outSpace[c]!, `frame ${f.frame} ${c}.out:space`)
      }
      for (const x of expected.request.localToWorld) {
        const v = cache.Get(i++)
        expect(v.IsHolding(VtValueTypes.GfMatrix4d), `${f.frame} ${x}`).toBe(true)
        const wanted = f.localToWorld[x]
        expect(wanted, `${f.frame} ${x}`).not.toBeNull()
        _ExpectClose(_Rows(v.Get<GfMatrix4d>()), wanted!,
          `frame ${f.frame} ${x} computeLocalToWorldTransform`)
      }
    }
    expect(mark.isClean()).toBe(true)

    request.destroy()
    system.destroy()
  })

  it('UsdGeomXformCache baseline matches native, and differs from exec (the flipped sign)', async () => {
    const stage = await _OpenStage()
    let flippedSignDiffers = 0
    for (const f of expected.frames) {
      const xc = new UsdGeomXformCache(stage, f.frame)
      for (const x of expected.request.localToWorld) {
        const m = xc.getLocalToWorldTransform(stage.getPrim(x)!)
        _ExpectClose([...m], f.usdGeomLocalToWorld[x]!, `frame ${f.frame} ${x} UsdGeomXformCache`)
      }
      // The authored xformOp:transform of Plate is not the controller's
      // value: its translation has the opposite sign in y.
      const plate = '/Rig/Plate'
      if (_MaxDiff(f.usdGeomLocalToWorld[plate]!, f.localToWorld[plate]!) > 1) {
        flippedSignDiffers++
      }
    }
    expect(flippedSignDiffers).toBe(expected.frames.length)
  })
})
