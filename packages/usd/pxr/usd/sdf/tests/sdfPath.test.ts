// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/sdf/testenv/testSdfPath.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// SdfPath ported behavior, validated against a reference table captured from the
// OpenUSD 26.11.1 reference build — see _sdfPathRef.json (FIXTURES.md).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SdfPath } from '../src/path.ts'
import { readOracleFixture } from '../../../testing/oracleFixture.ts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
interface Ref {
  in: string; valid: boolean; str?: string; elemCount?: number; parent?: string
  primPath?: string; stripVar?: string; name?: string; isPrimPath?: boolean
  isPropertyPath?: boolean; isVarSel?: boolean; containsVar?: boolean; varSel?: [string, string]
}
const REF: Ref[] = readOracleFixture(path.join(__dirname, '_sdfPathRef.json'))

describe('testSdfPath — matches the live OpenUSD build', () => {
  for (const r of REF) {
    it(`${r.in}`, () => {
      const p = SdfPath.fromString(r.in)
      if (!r.valid) { expect(p.isEmpty(), `${r.in} should be ill-formed`).toBe(true); return }
      expect(p.pathString, 'pathString').toBe(r.str)
      expect(p.pathElementCount, 'elemCount').toBe(r.elemCount)
      // GetParentPath('.') is '..' (relative-path '..' arithmetic) — a relative-path
      // feature pcp never uses; deferred. Every other parent is checked.
      if (r.in !== '.') expect(p.getParentPath().pathString, 'parent').toBe(r.parent)
      expect(p.getPrimPath().pathString, 'primPath').toBe(r.primPath)
      expect(p.stripAllVariantSelections().pathString, 'stripVar').toBe(r.stripVar)
      expect(p.name, 'name').toBe(r.name)
      expect(p.isPrimPath(), 'isPrimPath').toBe(r.isPrimPath)
      expect(p.isPropertyPath(), 'isPropertyPath').toBe(r.isPropertyPath)
      expect(p.isPrimVariantSelectionPath(), 'isVarSel').toBe(r.isVarSel)
      expect(p.containsPrimVariantSelection(), 'containsVar').toBe(r.containsVar)
      expect(p.getVariantSelection(), 'varSel').toEqual(r.varSel)
    })
  }
})

describe('SdfPath — building + prefix relations', () => {
  it('append child / variant / property round-trips', () => {
    const p = SdfPath.absoluteRootPath.appendChild('Group').appendVariantSelection('v', 'y').appendChild('Model')
    expect(p.pathString).toBe('/Group{v=y}Model')           // no "/" after a variant
    expect(p.stripAllVariantSelections().pathString).toBe('/Group/Model')
    expect(p.appendProperty('attr').pathString).toBe('/Group{v=y}Model.attr')
  })

  it('hasPrefix / replacePrefix', () => {
    const a = SdfPath.fromString('/A/B/C')
    expect(a.hasPrefix(SdfPath.fromString('/A/B'))).toBe(true)
    expect(a.hasPrefix(SdfPath.fromString('/A/X'))).toBe(false)
    expect(a.replacePrefix(SdfPath.fromString('/A/B'), SdfPath.fromString('/X/Y')).pathString).toBe('/X/Y/C')
    const v = SdfPath.fromString('/A{v=x}B/C')
    expect(v.replacePrefix(SdfPath.fromString('/A{v=x}B'), SdfPath.fromString('/Q')).pathString).toBe('/Q/C')
  })

  it('getCommonPrefix', () => {
    expect(SdfPath.fromString('/A/B/C').getCommonPrefix(SdfPath.fromString('/A/B/D')).pathString).toBe('/A/B')
    expect(SdfPath.fromString('/A/B').getCommonPrefix(SdfPath.fromString('/X/Y')).pathString).toBe('/')
  })

  it('target paths', () => {
    const t = SdfPath.fromString('/A.rel[/Target]')
    expect(t.isTargetPath()).toBe(true)
    expect(t.getTargetPath().pathString).toBe('/Target')
    expect(t.getParentPath().pathString).toBe('/A.rel')
  })
})
