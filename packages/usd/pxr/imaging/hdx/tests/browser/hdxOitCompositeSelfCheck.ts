// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/shaders/fallbackMaterialNetwork.glslfx,
//  pxr/imaging/hdx/oitResolveTask.cpp,
//  pxr/imaging/hdx/shaders/oitResolveImageShader.glslfx,
//  pxr/imaging/hdx/shaders/renderPass.glslfx,
//  pxr/imaging/hdx/testenv/testHdxOitShaderRetention.cpp
// Copyright 2016, 2018, 2019, 2026 Pixar. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Browser self-check (not an upstream comparison) of order-independent
// transparency on a real GPU: an Hdx_UnitTestDelegate grid with
// displayOpacity 0.5 (Storm gives it the translucent material tag) drawn by
// HdxOitRenderTask and composited by HdxOitResolveTask (AddOitRenderTask /
// AddOitResolveTask, as testHdxOitShaderRetention sets them up).
//
// The expectation is derived from the shaders this run uses: Storm's
// fallback surface (hdSt/shaders/fallbackMaterialNetwork.glslfx,
// Fallback.Surface) returns the unlit grid color (1, 1, 0) with alpha 0.5,
// not premultiplied; HdxRenderPass.WriteOitLayersToBufferTranslucent
// (hdx/shaders/renderPass.glslfx) stores it as is; the resolve
// (oitResolveImageShader.glslfx) accumulates one layer to (1, 1, 0, 0.5) and
// blends it over the color AOV's clear value (0.1, 0.1, 0.1, 1) with One /
// OneMinusSrcAlpha (oitResolveTask.cpp:131-137), giving (1.05, 1.05, 0.05,
// 1) at the grid's center, compared within 1/255. It checks this
// repository's OIT chain against itself and the shaders' formulas; it is
// not a native capture comparison.
//
// Run: node tests/browser/hdx-image/run.mjs --test hdxOitCompositeSelfCheck

import { Matrix4d as GfMatrix4d, Vec3f as GfVec3f } from 'typescript-usd/gf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  Engine as HdEngine,
  Interpolation as HdInterpolation,
  PrimTypeTokens as HdPrimTypeTokens,
  RenderIndex as HdRenderIndex,
  type Task as HdTask,
} from 'typescript-usd/hd'
import { HgiTokens, type Hgi } from 'typescript-usd/hgi'
import { SubdivTags as PxOsdSubdivTags } from 'typescript-usd/pxOsd'
import { RenderDelegate as HdStRenderDelegate, type RenderBuffer as HdStRenderBuffer } from 'typescript-usd/hdSt'
import { Hdx_UnitTestDelegate } from '../../src/unitTestDelegate.ts'

function halfToFloat(h: number): number {
  const s = (h & 0x8000) ? -1 : 1
  const e = (h >> 10) & 0x1f
  const f = h & 0x3ff
  if (e === 0) return s * Math.pow(2, -14) * (f / 1024)
  if (e === 31) return f ? NaN : s * Infinity
  return s * Math.pow(2, e - 15) * (1 + f / 1024)
}

export async function main(hgi: Hgi): Promise<{ status: number, stdout: string }> {
  const driver = { name: HgiTokens.renderDriver, driver: hgi }
  const renderDelegate = new HdStRenderDelegate()
  const index = HdRenderIndex.new(renderDelegate, [driver])!
  const delegate = new Hdx_UnitTestDelegate(index)
  const engine = new HdEngine()

  delegate.addOitRenderTask('/OitRenderTask')
  delegate.addOitResolveTask('/OitResolveTask')

  // A 2x2 grid quad with constant color (1,1,0) and opacity 0.5.
  const points = [new GfVec3f(-1, -1, 0), new GfVec3f(1, -1, 0), new GfVec3f(1, 1, 0), new GfVec3f(-1, 1, 0)]
  delegate.addMesh('/Grid', new GfMatrix4d(1), points, [4], [0, 1, 2, 3],
    new PxOsdSubdivTags(),
    VtValue.create(new GfVec3f(1, 1, 0), VtValueTypes.GfVec3f), HdInterpolation.HdInterpolationConstant,
    VtValue.create(Math.fround(0.5), VtValueTypes.float), HdInterpolation.HdInterpolationConstant)

  const tasks: HdTask[] = [index.getTask('/OitRenderTask')!, index.getTask('/OitResolveTask')!]
  engine.Execute(index, tasks)
  await delegate.writeRenderBufferToFile('/aov_color', 'oitComposite.png')

  const rb = index.getBprim(HdPrimTypeTokens.renderBuffer, '/aov_color') as HdStRenderBuffer
  const data = await rb.MapAsync()
  rb.unmap()
  const w = rb.getWidth(), h = rb.getHeight()
  const halves = new Uint16Array(data!.buffer, data!.byteOffset, w * h * 4)
  const at = (x: number, y: number) => [0, 1, 2, 3].map(c => halfToFloat(halves[(y * w + x) * 4 + c]!))
  const center = at(w >> 1, h >> 1)
  const corner = at(2, 2)
  const expected = [1.05, 1.05, 0.05, 1]
  const ok = center.every((v, i) => Math.abs(v - expected[i]!) <= 1 / 255)
  const fmt = (v: number[]) => v.map(x => x.toFixed(4)).join(', ')
  return {
    status: ok ? 0 : 1,
    stdout: `center (${fmt(center)}) expected (${fmt(expected)}); corner (${fmt(corner)})\n${ok ? 'OK' : 'FAILED'}\n`,
  }
}
