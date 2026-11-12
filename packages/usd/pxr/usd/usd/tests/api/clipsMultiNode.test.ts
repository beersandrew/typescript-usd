// Ported from OpenUSD 26.11.1: pxr/usd/usd/clip.cpp, pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native expectations: ../fixtures/clipsMultiNode (FIXTURES.md).
// A clip set applies at every node of a prim index whose layer stack is the
// clip set's source layer stack and whose path lies under the source prim
// path (_ClipsApplyToNode, stage.cpp:7183-7190; _GetClipsThatApplyToNode
// :7192-7209), at the introducing layer, queried at that node's own spec
// path translated into the clip (Usd_Clip::TranslatePathToClip,
// clip.cpp:606-609; stage.cpp:9420-9467) — e.g. a child's inherit,
// specializes or internal reference nodes under the clips' prim.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ResolveInfoSource, Stage } from 'typescript-usd/usd'

const fixture = fileURLToPath(new URL('../fixtures/clipsMultiNode/', import.meta.url))
const native = JSON.parse(readFileSync(fixture + 'expected.json', 'utf8')).payload as Record<string, {
  default: number | null
  values: [number, number | null][]
  timeSamples: number[]
  source: string
  nodePath: string | null
  mightBeTimeVarying: boolean
}>

const sourceName = (source: ResolveInfoSource): string => `Usd.ResolveInfoSource${ResolveInfoSource[source]}`
const num = (value: unknown): number | null =>
  value === undefined || value === null ? null : Number(value)

describe('value clips applying at several prim-index nodes match OpenUSD', () => {
  for (const [path, row] of Object.entries(native)) {
    it(path, async () => {
      const stage = (await Stage.open(`${fixture}root.usda`))!
      try {
        const attr = stage.get(path)!
        expect(num(attr.getValue()), 'default').toBe(row.default)
        for (const [time, value] of row.values) {
          expect(num(attr.getValueAtTime(time)), `t=${time}`).toBe(value)
        }
        expect(attr.getTimeSampleKeys()).toEqual(row.timeSamples)
        const info = attr.getResolveInfo(5)
        expect(sourceName(info.getSource())).toBe(row.source)
        expect(info.getNode()?.path.pathString ?? null).toBe(row.nodePath)
        expect(attr.valueMightBeTimeVarying()).toBe(row.mightBeTimeVarying)
      } finally {
        stage.dispose()
      }
    })
  }
})
