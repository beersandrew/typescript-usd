// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/light.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HdStLight (pxr/imaging/hdSt/light.cpp) against the reference build: the
// GlfSimpleLight each light sprim derives from its scene delegate's
// parameters (fixtures/lights, captured with the same lights by lights.cpp).
// Controller (Node) test on a GPU-less Hgi.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Matrix4d as GfMatrix4d, Vec3d as GfVec3d, Vec3f as GfVec3f, Vec4f as GfVec4f, makeRotation as GfMakeRotation } from 'typescript-usd/gf'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import { Type as TfType, type Token as TfToken } from 'typescript-usd/tf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  Engine as HdEngine,
  LightTokens as HdLightTokens,
  PrimTypeTokens as HdPrimTypeTokens,
  RenderIndex as HdRenderIndex,
  SceneDelegate as HdSceneDelegate,
} from 'typescript-usd/hd'
import { HgiTokens } from 'typescript-usd/hgi'
import { SimpleLight as GlfSimpleLight, SimpleLightType as GlfSimpleLightType } from 'typescript-usd/glf'
import type { HdStLight } from '../../src/light.ts'
import { HdStRenderDelegate } from '../../src/renderDelegate.ts'
import { PipelineDrawBatchTestHgi } from '../pipelineDrawBatchTestHgi.ts'

// The capture prints floats with %.9g, which identifies each float32 value.
// Signed zeros compare equal (+ 0): GfMatrix4d::SetRotate's zero signs are
// not part of what HdStLight computes.
const _fround = (v: unknown): unknown => typeof v === 'number' ? Math.fround(v) + 0
  : Array.isArray(v) ? v.map(_fround)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, _fround(x)])) : v
const expected = _fround(JSON.parse(readFileSync(new URL('../fixtures/lights/lights.json', import.meta.url), 'utf8')).payload) as Record<string, unknown>

/** lights.cpp, LightDelegate */
class LightDelegate extends HdSceneDelegate {
  readonly params = new Map<string, Map<string, VtValue>>()
  readonly transforms = new Map<string, GfMatrix4d>()
  readonly visible = new Map<string, boolean>()
  Set(id: string, key: TfToken | string, v: VtValue): void {
    let p = this.params.get(id)
    if (!p) this.params.set(id, p = new Map())
    p.set(key, v)
  }
  override Get(id: string, key: TfToken | string): VtValue {
    return this.params.get(id)?.get(key) ?? VtValue.getEmpty()
  }
  override getLightParamValue(id: string, n: TfToken | string): VtValue { return this.Get(id, n) }
  override getTransform(id: string): GfMatrix4d { return this.transforms.get(id) ?? new GfMatrix4d(1) }
  override getVisible(id: string): boolean { return this.visible.get(id) ?? true }
}

const f = (x: number) => VtValue.create(Math.fround(x), VtValueTypes.float)
const b = (x: boolean) => VtValue.create(x, VtValueTypes.bool)
const v3 = (x: number, y: number, z: number) => VtValue.create(new GfVec3f(x, y, z), VtValueTypes.GfVec3f)
const rot = (axis: [number, number, number], deg: number) => new GfMatrix4d().setRotate(GfMakeRotation(axis, deg))

describe('HdStLight (hdSt/light.cpp) against the reference build', () => {
  const hgi = new PipelineDrawBatchTestHgi()
  const renderDelegate = new HdStRenderDelegate()
  renderDelegate.setDrivers([{ name: HgiTokens.renderDriver, driver: hgi }])
  const index = HdRenderIndex.new(renderDelegate)!
  const d = new LightDelegate(index, '/lights')
  const lights: [string, string][] = []
  const common = (p: string, c: [number, number, number], i: number, e: number) => {
    d.Set(p, HdLightTokens.color, v3(...c))
    d.Set(p, HdLightTokens.intensity, f(i))
    d.Set(p, HdLightTokens.exposure, f(e))
  }

  common('/lights/distant', [1, 0.9, 0.7], 2.0, 0.5)
  d.Set('/lights/distant', HdLightTokens.angle, f(10.0))
  d.transforms.set('/lights/distant', rot([0, 1, 0], 30).getMultiply(rot([1, 0, 0], -20)))
  lights.push(['/lights/distant', HdPrimTypeTokens.distantLight])

  common('/lights/sphere', [0.4, 0.6, 1.0], 3.0, 1.0)
  d.Set('/lights/sphere', HdLightTokens.radius, f(0.5))
  d.Set('/lights/sphere', HdLightTokens.enableColorTemperature, b(true))
  d.Set('/lights/sphere', HdLightTokens.colorTemperature, f(1300))
  d.Set('/lights/sphere', HdLightTokens.ambient, f(0.25))
  d.Set('/lights/sphere', HdLightTokens.hasShadow, b(true))
  d.transforms.set('/lights/sphere', new GfMatrix4d().setTranslate(new GfVec3d(-2, 2, 2)))
  lights.push(['/lights/sphere', HdPrimTypeTokens.sphereLight])

  common('/lights/rect', [1, 1, 1], 5.0, 0.0)
  d.Set('/lights/rect', HdLightTokens.width, f(2.0))
  d.Set('/lights/rect', HdLightTokens.height, f(0.5))
  d.Set('/lights/rect', HdLightTokens.shapingConeAngle, f(35.0))
  d.Set('/lights/rect', HdLightTokens.shapingFocus, f(-1.0))
  d.Set('/lights/rect', HdLightTokens.enableColorTemperature, b(true))
  d.Set('/lights/rect', HdLightTokens.colorTemperature, f(9000))
  d.Set('/lights/rect', HdLightTokens.specular, f(0.5))
  d.transforms.set('/lights/rect', rot([1, 0, 0], 45).getMultiply(new GfMatrix4d().setTranslate(new GfVec3d(1, 3, -1))))
  lights.push(['/lights/rect', HdPrimTypeTokens.rectLight])

  common('/lights/disk', [0.2, 1, 0.2], 4.0, -1.0)
  d.Set('/lights/disk', HdLightTokens.radius, f(2.0))
  d.Set('/lights/disk', HdLightTokens.normalize, b(true))
  d.Set('/lights/disk', HdLightTokens.shapingFocus, f(3.0))
  lights.push(['/lights/disk', HdPrimTypeTokens.diskLight])

  common('/lights/cylinder', [1, 0.5, 0.25], 1.5, 2.0)
  d.Set('/lights/cylinder', HdLightTokens.length, f(3.0))
  d.Set('/lights/cylinder', HdLightTokens.radius, f(0.25))
  d.Set('/lights/cylinder', HdLightTokens.enableColorTemperature, b(true))
  d.Set('/lights/cylinder', HdLightTokens.colorTemperature, f(4321))
  lights.push(['/lights/cylinder', HdPrimTypeTokens.cylinderLight])

  common('/lights/hidden', [1, 1, 1], 1.0, 0.0)
  d.visible.set('/lights/hidden', false)
  lights.push(['/lights/hidden', HdPrimTypeTokens.sphereLight])

  common('/lights/dome', [0.9, 0.9, 1.0], 0.8, 0.25)
  d.Set('/lights/dome', HdLightTokens.diffuse, f(0.5))
  d.Set('/lights/dome', HdLightTokens.textureFile,
    VtValue.create(new SdfAssetPath('sky.hdr', '/abs/sky.hdr'), TfType.declare('SdfAssetPath')))
  d.Set('/lights/dome', HdLightTokens.domeOffset, VtValue.create(rot([0, 0, 1], 90), VtValueTypes.GfMatrix4d))
  d.transforms.set('/lights/dome', new GfMatrix4d().setTranslate(new GfVec3d(0, 1, 0)))
  lights.push(['/lights/dome', HdPrimTypeTokens.domeLight])

  const s = new GlfSimpleLight()
  s.setPosition(new GfVec4f(3, 2, 3, 1))
  s.setDiffuse(new GfVec4f(0.3, 0.25, 0.2, 1))
  s.setSpecular(new GfVec4f(0.2, 0.2, 0.2, 1))
  d.Set('/lights/simple', HdLightTokens.params, VtValue.create(s, GlfSimpleLightType))
  lights.push(['/lights/simple', HdPrimTypeTokens.simpleLight])

  for (const [path, type] of lights) index.insertSprim(type, d, path)
  new HdEngine().Execute(index, [])

  const vec = (v: { get(i: number): number }, n: number) => Array.from({ length: n }, (_, i) => v.get(i))
  for (const [path, type] of lights) {
    it(`${type} ${path}`, () => {
      const light = index.getSprim(type, path) as HdStLight
      const g = light.Get(HdLightTokens.params).Get<GlfSimpleLight>()
      const t = g.getTransform()
      expect(_fround({
        ambient: vec(g.getAmbient(), 4), diffuse: vec(g.getDiffuse(), 4),
        specular: vec(g.getSpecular(), 4), position: vec(g.getPosition(), 4),
        spotDirection: vec(g.getSpotDirection(), 3),
        spotCutoff: g.getSpotCutoff(), spotFalloff: g.getSpotFalloff(),
        attenuation: vec(g.getAttenuation(), 3),
        hasIntensity: g.hasIntensity(), hasShadow: g.hasShadow(), isDomeLight: g.isDomeLight(),
        domeLightTextureFile: g.getDomeLightTextureFile().getAssetPath(),
        transform: Array.from({ length: 16 }, (_, i) => Math.fround(t.getElement(i >> 2, i & 3))),
      })).toEqual(expected[path])
    })
  }
})
