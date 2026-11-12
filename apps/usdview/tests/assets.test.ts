// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdImaging/sceneIndices.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import 'typescript-usd/usdGeom'
import type { ContainerDataSource, SampledDataSource } from 'typescript-usd/hd'
import { UsdImagingCreateSceneIndices } from 'typescript-usd/usdImaging'
// usdVolImaging's field asset adapters, registered before the adapter registry is built.
import 'typescript-usd/usdVolImaging'
import { createHttpResolverContext } from '../src/http-resolver'

const assetDir = new URL('../public/assets/', import.meta.url)
const base = 'https://viewer-assets.example/assets/'
async function openAsset(name: string) {
  const url = new URL(name, base).href
  const fetchAsset: typeof fetch = async input => {
    const u = new URL(String(input))
    if (u.origin !== new URL(base).origin || !u.pathname.startsWith('/assets/')) return new Response('', { status: 404 })
    try { return new Response(await readFile(new URL(u.pathname.slice('/assets/'.length), assetDir), 'utf8')) }
    catch { return new Response('', { status: 404 }) }
  }
  return (await Stage.open(url, { resolverContext: createHttpResolverContext(url, undefined, fetchAsset) }))!
}
/** The faithful UsdImaging chain (usdImaging/sceneIndices.cpp) the viewer's
 *  Storm engine observes; SetStage feeds its stage scene index. */
function sceneIndices() {
  const chain = UsdImagingCreateSceneIndices({ addDrawModeSceneIndex: true })
  const si = chain.finalSceneIndex
  return Object.assign(si, { SetStage: (stage: Parameters<typeof chain.stageSceneIndex.SetStage>[0]) => chain.stageSceneIndex.SetStage(stage) })
}
function sample(root: ContainerDataSource | undefined, ...path: string[]): unknown {
  let source: unknown = root
  for (const name of path) source = (source as ContainerDataSource).Get(name)
  let value: unknown = (source as SampledDataSource).GetValue(0)
  if (value && typeof (value as {UncheckedGet?: unknown}).UncheckedGet === 'function') value = (value as {UncheckedGet(): unknown}).UncheckedGet()
  if (value && typeof (value as {toArray?: unknown}).toArray === 'function') value = (value as {toArray(): unknown}).toArray()
  if (value && typeof (value as {GetArray?: unknown}).GetArray === 'function') value = Array.from((value as {GetArray(): ArrayLike<number>}).GetArray())
  return value
}

describe('bundled viewer assets (CPU, no rendering claims)', () => {
  it('lists every standalone bundled USD scene for Auto Test', async () => {
    async function usdFiles(directory: URL, prefix = ''): Promise<string[]> {
      const found: string[] = []
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const name = prefix + entry.name
        if (entry.isDirectory()) found.push(...await usdFiles(new URL(entry.name + '/', directory), name + '/'))
        else if (/\.(usd|usda|usdc)$/i.test(name)) found.push(name)
      }
      return found
    }
    // These layers are dependencies of their corresponding standalone root scenes.
    const dependencies = new Set(['previewSurface/nested/material.usda', 'inspectionControls/weak.usda', 'inspectionControls/reference.usda', 'volumes/vdbVolumeFallbackMaterial.usda'])
    const standalone = (await usdFiles(assetDir)).filter(path => !dependencies.has(path)).sort()
    const manifest: {url: string}[] = JSON.parse(await readFile(new URL('scenes.json', assetDir), 'utf8'))
    expect(manifest.map(scene => scene.url.replace('./assets/', '')).sort()).toEqual(standalone)
  })

  it('lists every bundled asset in provenance.json under one licence and preserves every OpenUSD byte', async () => {
    async function files(directory: URL, prefix = ''): Promise<string[]> {
      const found: string[] = []
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const name = prefix + entry.name
        if (entry.isDirectory()) found.push(...await files(new URL(entry.name + '/', directory), name + '/'))
        else if (entry.name !== '.DS_Store') found.push(name)
      }
      return found
    }
    const provenance: {openusd: {commit: string}, files: {file: string, license: string, source?: string, sha256?: string}[]} =
      JSON.parse(await readFile(new URL('provenance.json', assetDir), 'utf8'))
    expect(provenance.files.map(f => f.file).sort()).toEqual((await files(assetDir)).filter(f => f !== 'provenance.json').sort())
    for (const f of provenance.files) {
      expect(f.license).toBe('TOST-1.0')
      if (f.source === undefined) continue
      expect(f.source).toContain(provenance.openusd.commit)
      expect(createHash('sha256').update(await readFile(new URL(f.file, assetDir))).digest('hex')).toBe(f.sha256)
    }
    const manifest = JSON.parse(await readFile(new URL('scenes.json', assetDir), 'utf8'))
    for (const scene of manifest) expect((await readFile(fileURLToPath(new URL(scene.url.replace('./assets/', ''), assetDir)))).length).toBeGreaterThan(0)
  })

  it('composes referenced meshes and passes transforms, colors and inherited visibility to Hydra', async () => {
    const stage = await openAsset('composed_cubes.usda')
    const si = sceneIndices()
    try {
      si.SetStage(stage)
      expect(si.getChildPrimPaths('/World')).toEqual(['/World/Blue', '/World/Group', '/World/Hidden'])
      const blue = si.getPrim('/World/Blue')
      expect(blue.primType).toBe('mesh')
      expect([...sample(blue.dataSource, 'mesh', 'topology', 'faceVertexCounts') as number[]]).toEqual([4,4,4,4,4,4])
      expect(sample(blue.dataSource, 'primvars', 'points', 'primvarValue')).toHaveLength(8)
      expect((sample(blue.dataSource, 'xform', 'matrix') as number[]).slice(12,15)).toEqual([-2,0,0])
      const color = (sample(blue.dataSource, 'primvars', 'displayColor', 'primvarValue') as {get(i: number): number}[])[0]!
      expect(sample(blue.dataSource, 'primvars', 'displayColor', 'interpolation')).toBe('constant')
      for (const [i, expected] of [0.05, 0.3, 0.8].entries()) expect(color.get(i)).toBeCloseTo(expected, 6)
      const orange = si.getPrim('/World/Group/Orange')
      expect((sample(orange.dataSource, 'xform', 'matrix') as number[]).slice(12,15)).toEqual([2,0,0])
      expect(sample(si.getPrim('/World/Hidden/Cube').dataSource, 'visibility', 'visibility')).toBe(false)
    } finally { si.SetStage(undefined); stage.dispose() }
  })
  it('draws the default scene as a green wireframe: closed linear curves around a torus', async () => {
    const stage = await openAsset('torus.usda')
    const si = sceneIndices()
    try {
      si.SetStage(stage)
      expect(stage.getRootLayer().getDefaultPrim()).toBe('torus')
      const wire = si.getPrim('/torus/wire')
      expect(wire.primType).toBe('basisCurves')
      expect(sample(wire.dataSource, 'basisCurves', 'topology', 'type')).toBe('linear')
      expect(sample(wire.dataSource, 'basisCurves', 'topology', 'wrap')).toBe('nonperiodic')
      const counts = sample(wire.dataSource, 'basisCurves', 'topology', 'curveVertexCounts') as number[]
      const points = sample(wire.dataSource, 'primvars', 'points', 'primvarValue') as {get(i: number): number}[]
      expect(counts.reduce((a, b) => a + b, 0)).toBe(points.length)
      // Each curve ends on its first point, and every point lies on the torus (R 1, r 0.4).
      let start = 0
      for (const count of counts) {
        for (const i of [0, 1, 2]) expect(points[start + count - 1]!.get(i)).toBeCloseTo(points[start]!.get(i), 5)
        start += count
      }
      for (const p of points) expect(Math.hypot(Math.hypot(p.get(0), p.get(2)) - 1, p.get(1))).toBeCloseTo(0.4, 4)
      const color = (sample(wire.dataSource, 'primvars', 'displayColor', 'primvarValue') as {get(i: number): number}[])[0]!
      expect(color.get(1)).toBeGreaterThan(Math.max(color.get(0), color.get(2)) + 0.5)
    } finally { si.SetStage(undefined); stage.dispose() }
  })
})

describe('pinned OpenUSD volume fixture (CPU, no rendering claims)', () => {
  const volumes = new URL('volumes/', assetDir)
  it('preserves every pinned OpenUSD byte', async () => {
    const provenance = JSON.parse(await readFile(new URL('provenance.json', volumes), 'utf8'))
    expect(provenance.files.length).toBe(5)
    for (const f of provenance.files) {
      expect(createHash('sha256').update(await readFile(new URL(f.file, volumes))).digest('hex')).toBe(f.sha256)
      expect(f.source).toContain(provenance.commit)
    }
  })
  it('composes the volume and its field and leaves the glslfx background inactive', async () => {
    const stage = await openAsset('volumes/vdbVolume.usda')
    const si = sceneIndices()
    try {
      si.SetStage(stage)
      expect(stage.getPrim('/Background')?.isActive).toBe(false)
      expect([stage.startTimeCode, stage.endTimeCode]).toEqual([1, 3])
      expect(si.getPrim('/VdbVolume').primType).toBe('volume')
      expect(sample(si.getPrim('/VdbVolume').dataSource, 'volumeFieldBinding', 'density')).toBe('/VdbVolume/Density')
      expect(si.getPrim('/VdbVolume/Density').primType).toBe('openvdbAsset')
    } finally { si.SetStage(undefined); stage.dispose() }
  })
})
