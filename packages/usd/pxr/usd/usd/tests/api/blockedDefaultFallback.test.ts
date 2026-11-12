// Ported from OpenUSD 26.11.1: pxr/usd/usd/attributeQuery.cpp,
//  pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native expectations: ../fixtures/blockedDefaultFallback (FIXTURES.md).
// A value block as the strongest default opinion: UsdAttribute::Get at
// default time reads the composed default and clears the block
// (stage.cpp:7261-7292); at a numeric time the resolve-info walk records the
// block and falls back to the schema fallback (stage.cpp:9086-9091 ->
// ProcessFallback :8951-8962), which _GetValueFromResolveInfoImpl returns
// (stage.cpp:8040-8059). UsdAttributeQuery::Get resolves from its resolve
// info, so at default time it returns the fallback too
// (attributeQuery.cpp:132-160).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { AttributeQuery, ResolveInfoSource, Stage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import 'typescript-usd/usdGeom'

const fixture = fileURLToPath(new URL('../fixtures/blockedDefaultFallback/', import.meta.url))
type ByTime<T> = Record<string, T>
const native = JSON.parse(readFileSync(fixture + 'expected.json', 'utf8')).payload as Record<string, {
  get: ByTime<number | null>
  queryGet: ByTime<number | null>
  source: ByTime<string>
  valueIsBlocked: ByTime<boolean>
  anyTimeSource: string
  anyTimeValueIsBlocked: boolean
  hasValue: boolean
  hasAuthoredValue: boolean
}>

const times: Record<string, 'default' | number | UsdTimeCode> = {
  default: 'default', 0: 0, 1: 1, 2: 2, pre1: UsdTimeCode.PreTime(1),
}
const sourceName = (source: ResolveInfoSource): string => `Usd.ResolveInfoSource${ResolveInfoSource[source]}`
const num = (value: unknown): number | null =>
  value === undefined || value === null ? null : Number(value)

describe('blocked default value resolution matches OpenUSD', () => {
  for (const [path, row] of Object.entries(native)) {
    it(path, async () => {
      const stage = (await Stage.open(`${fixture}root.usda`))!
      try {
        const attr = stage.get(path)!
        const query = new AttributeQuery(attr)
        for (const [label, time] of Object.entries(times)) {
          const get = time === 'default' ? attr.getValue() : attr.getValueAtTime(time)
          expect(num(get), `Get(${label})`).toBe(row.get[label])
          expect(num(query.get(time)), `AttributeQuery.Get(${label})`).toBe(row.queryGet[label])
          const info = attr.getResolveInfo(typeof time === 'object' ? time.GetValue() : time)
          expect(sourceName(info.getSource()), `GetResolveInfo(${label}).GetSource()`).toBe(row.source[label])
          expect(info.valueIsBlocked(), `GetResolveInfo(${label}).ValueIsBlocked()`).toBe(row.valueIsBlocked[label])
        }
        const info = attr.getResolveInfo()
        expect(sourceName(info.getSource())).toBe(row.anyTimeSource)
        expect(info.valueIsBlocked()).toBe(row.anyTimeValueIsBlocked)
        expect(attr.hasValue()).toBe(row.hasValue)
        expect(attr.hasAuthoredValue()).toBe(row.hasAuthoredValue)
      } finally {
        stage.dispose()
      }
    })
  }
})
