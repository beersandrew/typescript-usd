// Ported from OpenUSD 26.11.1: pxr/usd/usd/clipCache.cpp,
//  pxr/usd/usd/clipSetDefinition.cpp, pxr/usd/usd/instanceKey.cpp,
//  pxr/usd/usd/stage.cpp
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native expectations: ../fixtures/instanceKeyAncestralClips (FIXTURES.md).
// Usd_InstanceKey hashes only the clip sets found at the instance prim
// index's own node sites (instanceKey.cpp:84-89,
// clipSetDefinition.cpp:406-416, 537-562): instances that differ only in
// clips authored on an ancestor share one prototype. Clips are looked up by
// stage namespace (Usd_ClipCache::PopulateClipsForPrim,
// clipCache.cpp:191-240; stage.cpp:3487-3494 passes a prototype prim's empty
// prim index), so no clips from above the prototype root reach its
// descendants, while the instance prim itself and non-instanced prims still
// resolve them.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ResolveInfoSource, Stage } from 'typescript-usd/usd'
import 'typescript-usd/usdGeom'

const fixture = fileURLToPath(new URL('../fixtures/instanceKeyAncestralClips/', import.meta.url))
const native = JSON.parse(readFileSync(fixture + 'expected.json', 'utf8')).payload as Record<string, {
  prototypeCount: number
  prims: Record<string, { isInstance: boolean; prototype: string | null }>
  attrs: Record<string, {
    default: number | null
    values: [number, number | null][]
    timeSamples: number[]
    source: string
  }>
}>

const sourceName = (source: ResolveInfoSource): string => `Usd.ResolveInfoSource${ResolveInfoSource[source]}`
const num = (value: unknown): number | null =>
  value === undefined || value === null ? null : Number(value)

describe('instance keys and clips authored above instances match OpenUSD', () => {
  for (const [name, row] of Object.entries(native)) {
    it(name, async () => {
      const stage = (await Stage.open(`${fixture}${name}.usda`))!
      try {
        expect(stage.getPrototypes()).toHaveLength(row.prototypeCount)
        // Prototype names are not compared, only which instances share one.
        const nativeProtos = Object.values(row.prims).map(p => p.prototype)
        const protos = Object.keys(row.prims).map(path => stage.getPrim(path)!.getPrototype()?.path ?? null)
        for (const [path, prim] of Object.entries(row.prims)) {
          expect(stage.getPrim(path)!.isInstance(), `${path} isInstance`).toBe(prim.isInstance)
        }
        for (let i = 0; i < protos.length; i++) {
          for (let j = 0; j < protos.length; j++) {
            expect(protos[i] !== null && protos[i] === protos[j], `prototype sharing ${i},${j}`)
              .toBe(nativeProtos[i] !== null && nativeProtos[i] === nativeProtos[j])
          }
        }
        for (const [path, attrRow] of Object.entries(row.attrs)) {
          const attr = stage.get(path)!
          expect(num(attr.getValue()), `${path} default`).toBe(attrRow.default)
          for (const [time, value] of attrRow.values) {
            expect(num(attr.getValueAtTime(time)), `${path} t=${time}`).toBe(value)
          }
          expect(attr.getTimeSampleKeys(), `${path} time samples`).toEqual(attrRow.timeSamples)
          expect(sourceName(attr.getResolveInfo(5).getSource()), `${path} source`).toBe(attrRow.source)
        }
      } finally {
        stage.dispose()
      }
    })
  }
})
