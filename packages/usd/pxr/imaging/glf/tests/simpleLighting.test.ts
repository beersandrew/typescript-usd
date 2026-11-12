// Ported from OpenUSD 26.11.1: pxr/imaging/glf/simpleLightingContext.cpp,
//  pxr/imaging/glf/simpleShadowArray.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// GlfSimpleLight / GlfSimpleMaterial defaults against the reference build
// (fixtures/simpleLighting.json, from its Python bindings), and the
// GlfSimpleLightingContext / GlfSimpleShadowArray behaviour stated in
// pxr/imaging/glf/simpleLightingContext.cpp and simpleShadowArray.cpp.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Matrix4d as GfMatrix4d, Vec2i as GfVec2i, Vec4f as GfVec4f } from 'typescript-usd/gf'
import { Token as TfToken } from 'typescript-usd/tf'
import { GlfSimpleLight } from '../src/simpleLight.ts'
import { GlfSimpleLightingContext } from '../src/simpleLightingContext.ts'
import { GlfSimpleMaterial } from '../src/simpleMaterial.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/simpleLighting.json', import.meta.url), 'utf8')).payload
const vec = (v: { get(i: number): number }, n: number) => Array.from({ length: n }, (_, i) => v.get(i))
const mat = (m: GfMatrix4d) => Array.from({ length: 4 }, (_, i) => Array.from({ length: 4 }, (_, j) => m.getElement(i, j)))

describe('GlfSimpleLight', () => {
  it('has the reference build defaults', () => {
    const l = new GlfSimpleLight()
    const e = fixture.defaultLight
    expect({
      ambient: vec(l.getAmbient(), 4), diffuse: vec(l.getDiffuse(), 4),
      specular: vec(l.getSpecular(), 4), position: vec(l.getPosition(), 4),
      spotDirection: vec(l.getSpotDirection(), 3), spotCutoff: l.getSpotCutoff(),
      spotFalloff: l.getSpotFalloff(), attenuation: vec(l.getAttenuation(), 3),
      isCameraSpaceLight: l.isCameraSpaceLight(), hasShadow: l.hasShadow(),
      shadowResolution: l.getShadowResolution(), shadowBias: l.getShadowBias(),
      shadowBlur: l.getShadowBlur(), shadowIndexStart: l.getShadowIndexStart(),
      shadowIndexEnd: l.getShadowIndexEnd(), transform: mat(l.getTransform()),
      shadowMatrices: l.getShadowMatrices().map(mat),
      isDomeLight: l.isDomeLight(), id: l.getID(),
    }).toEqual(e)
  })

  it('compares by value (simpleLight.cpp:327-353)', () => {
    const a = new GlfSimpleLight()
    const b = new GlfSimpleLight()
    expect(a.Equals(b)).toBe(true)
    b.setDiffuse(new GfVec4f(1, 0, 0, 1))
    expect(a.Equals(b)).toBe(false)
  })
})

describe('GlfSimpleMaterial', () => {
  it('has the reference build defaults', () => {
    const m = new GlfSimpleMaterial()
    expect({
      ambient: vec(m.getAmbient(), 4), diffuse: vec(m.getDiffuse(), 4),
      specular: vec(m.getSpecular(), 4), emission: vec(m.getEmission(), 4),
      shininess: m.getShininess(),
    }).toEqual(fixture.defaultMaterial)
  })
})

describe('GlfSimpleLightingContext', () => {
  it('uses shadows when a light has one (simpleLightingContext.cpp:57-74)', () => {
    const ctx = GlfSimpleLightingContext.new()
    const l = new GlfSimpleLight()
    ctx.setLights([l])
    expect(ctx.getUseShadows()).toBe(false)
    const s = new GlfSimpleLight()
    s.setHasShadow(true)
    s.setShadowIndexStart(1)
    s.setShadowIndexEnd(2)
    ctx.setLights([l, s])
    expect(ctx.getUseShadows()).toBe(true)
    expect(ctx.computeNumShadowsUsed()).toBe(3)
  })

  it('has no post-surface shader without post-surface lights (simpleLightingContext.cpp:429-456)', () => {
    const ctx = GlfSimpleLightingContext.new()
    ctx.setLights([new GlfSimpleLight()])
    expect(ctx.computeShaderSourceHash()).toBe(0n)
    expect(ctx.computeShaderSource('fragmentShader')).toBe('')
  })

  it('composes post-surface shader source (simpleLightingContext.cpp:295-394)', () => {
    const ctx = GlfSimpleLightingContext.new()
    const l = new GlfSimpleLight()
    l.setPostSurfaceParams(TfToken('Murk'), 'struct MurkParams { vec4 a; };\n', new Uint8Array(16))
    ctx.setLights([l, l])
    expect(ctx.computeShaderSourceHash()).not.toBe(0n)
    expect(ctx.computeShaderSource('vertexShader')).toBe('')
    expect(ctx.computeShaderSource('fragmentShader')).toBe(
      'struct MurkParams { vec4 a; };\n' +
      'layout(std140) uniform PostSurfaceShaderParams {\n' +
      '    MurkParams light1;\n' +
      '    MurkParams light2;\n' +
      '} postSurface;\n\n' +
      'MAT4 GetWorldToViewInverseMatrix();\n' +
      'vec4 postSurfaceShader(vec4 Peye, vec3 Neye, vec4 color)\n' +
      '{\n' +
      '    vec4 Pworld = vec4(GetWorldToViewInverseMatrix() * Peye);\n' +
      '    color.rgb /= color.a;\n' +
      '    color = ApplyMurkWorldSpace(postSurface.light1, color, Pworld.xyz);\n' +
      '    color = ApplyMurkWorldSpace(postSurface.light2, color, Pworld.xyz);\n' +
      '    color.rgb *= color.a;\n' +
      '    return color;\n' +
      '}\n\n')
  })

  it('sizes the shadow matrices with the resolutions (simpleShadowArray.cpp:69-161)', () => {
    const shadows = GlfSimpleLightingContext.new().getShadows()
    shadows.setShadowMapResolutions([new GfVec2i(64, 32), new GfVec2i(16, 16)])
    expect(shadows.getNumShadowMapPasses()).toBe(2)
    expect(vec(shadows.getShadowMapSize(0), 2)).toEqual([64, 32])
    // identity view and projection: scale 0.5 then translate 0.5
    expect(mat(shadows.getWorldToShadowMatrix(1))).toEqual(
      [[0.5, 0, 0, 0], [0, 0.5, 0, 0], [0, 0, 0.5, 0], [0.5, 0.5, 0.5, 1]])
  })
})
