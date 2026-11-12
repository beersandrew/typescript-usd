// Ported from OpenUSD 26.11.1: pxr/imaging/hd/mergingSceneIndex.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HdMergingSceneIndex with five or more inputs looks inputs up through its
// path table (mergingSceneIndex.cpp:71-95, 109-127) instead of scanning them
// all. The lookup only narrows which inputs are asked: every query must
// answer as the full scan of the inputs, strongest first, does
// (mergingSceneIndex.cpp:355-433), which this checks against the same
// scene with the inputs consulted one by one.
import { describe, expect, it } from 'vitest'
import { HdRetainedSceneIndex } from '../src/retainedSceneIndex.ts'
import { HdMergingSceneIndex } from '../src/mergingSceneIndex.ts'
import { HdRetainedContainerDataSource } from '../src/dataSource.ts'

const roots = ['/', '/A', '/A/B', '/C/D', '/A/B', '/E/F/G']
const prims: [number, string, string][] = [
  [0, '/A', 'scope'], [0, '/A/B/x', ''], [0, '/Z', 'mesh'],
  [1, '/A', 'xform'], [1, '/A/B', 'xform'], [1, '/A/B/x', 'mesh'], [1, '/A/q', 'points'],
  [2, '/A/B/x', 'cube'], [2, '/A/B/y', 'sphere'],
  [3, '/C/D', 'xform'], [3, '/C/D/m', 'mesh'],
  [4, '/A/B/y', 'cone'], [4, '/A/B/z', 'capsule'],
  [5, '/E/F/G/h', 'mesh'],
]

function inputs(): HdRetainedSceneIndex[] {
  return roots.map((_, i) => {
    const scene = HdRetainedSceneIndex.new()
    const own = prims.filter(([n]) => n === i)
    const withAncestors = new Map<string, string>()
    for (const [, path, type] of own) {
      for (let p = path.slice(0, path.lastIndexOf('/')); p; p = p.slice(0, p.lastIndexOf('/'))) {
        if (!withAncestors.has(p)) withAncestors.set(p, '')
      }
      withAncestors.set(path, type)
    }
    scene.addPrims([...withAncestors].map(([primPath, primType]) => ({
      primPath, primType, dataSource: HdRetainedContainerDataSource.new([], []),
    })))
    return scene
  })
}

const hasPrefix = (path: string, prefix: string) => prefix === '/' || path === prefix || path.startsWith(`${prefix}/`)
const queried = ['/', '/A', '/A/B', '/A/B/x', '/A/B/y', '/A/B/z', '/A/q', '/C', '/C/D', '/C/D/m', '/E', '/E/F', '/E/F/G', '/E/F/G/h', '/Z', '/nothing']

describe('HdMergingSceneIndex path table', () => {
  it('answers getPrim and getChildPrimPaths as a scan of every input does', () => {
    const scenes = inputs()
    const merging = HdMergingSceneIndex.new()
    scenes.forEach((scene, i) => merging.addInputScene(scene, roots[i]))
    // The ancestors of every scene root, which exist in the merged scene.
    const tablePaths = new Set<string>()
    for (const root of roots) for (let p = root; p; p = p === '/' ? '' : p.slice(0, p.lastIndexOf('/')) || '/') tablePaths.add(p)
    for (const path of queried) {
      const contributing = scenes.filter((_, i) => hasPrefix(path, roots[i]!))
      const types = contributing.map(scene => scene.getPrim(path).primType).filter(Boolean)
      const sources = contributing.map(scene => scene.getPrim(path).dataSource).filter(Boolean)
      const prim = merging.getPrim(path)
      expect(prim.primType, path).toBe(types[0] ?? '')
      expect(prim.dataSource !== undefined, path).toBe(sources.length > 0 || tablePaths.has(path))
      const children = new Set(contributing.flatMap(scene => scene.getChildPrimPaths(path)))
      for (const p of tablePaths) if (p !== '/' && (p.slice(0, p.lastIndexOf('/')) || '/') === path) children.add(p)
      expect(new Set(merging.getChildPrimPaths(path)), path).toEqual(children)
    }
  })
})
