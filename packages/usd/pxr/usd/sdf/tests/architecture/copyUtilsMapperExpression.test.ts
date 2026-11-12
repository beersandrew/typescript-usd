// Ported from OpenUSD 26.11.1: pxr/usd/sdf/childrenPolicies.h,
//  pxr/usd/sdf/copyUtils.cpp
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// SdfCopySpec over mapper, mapper arg and expression children
// (copyUtils.cpp:202-222, 337-345, 388-399, 521-523) through
// Sdf_MapperChildPolicy, Sdf_MapperArgChildPolicy and
// Sdf_ExpressionChildPolicy (childrenPolicies.h:137-161, 238-256). OpenUSD
// v26.08 has no public authoring API for these specs (the text format no
// longer parses mappers), so the source is built through the child policies
// and every expectation is the source layer's own content.

import { describe, expect, it } from 'vitest'
import {
  Sdf_ExpressionChildPolicy, Sdf_MapperArgChildPolicy, Sdf_MapperChildPolicy,
} from '../../src/childrenPolicies.ts'
import { Sdf_ChildrenUtils } from '../../src/childrenUtils.ts'
import { Layer, ValueTypeNames, AttributeSpec, sdfCopySpec, sdfCreatePrimInLayer } from '../../src/index.ts'
import { SdfPath } from '../../src/path.ts'

function buildSource(layer: Layer, primPath: string): void {
  const prim = sdfCreatePrimInLayer(layer, primPath)
  AttributeSpec.new(prim, 'a', ValueTypeNames.Double)
  const attrPath = SdfPath.fromString(`${primPath}.a`)
  for (const target of [`${primPath}/B.x`, `${primPath}/B.y`]) {
    const mapperPath = attrPath.appendMapper(SdfPath.fromString(target))
    Sdf_ChildrenUtils.createSpec(Sdf_MapperChildPolicy, layer, mapperPath, 'mapper')
    layer.setField(mapperPath.pathString, 'typeName', 'TestMapper')
    for (const arg of ['i0', 'i1']) {
      const argPath = mapperPath.appendMapperArg(arg)
      Sdf_ChildrenUtils.createSpec(Sdf_MapperArgChildPolicy, layer, argPath, 'mapperArg')
      layer.setField(argPath.pathString, 'mapperArgValue', arg === 'i0' ? 0 : 1)
    }
  }
  const expressionPath = attrPath.appendExpression()
  Sdf_ChildrenUtils.createSpec(Sdf_ExpressionChildPolicy, layer, expressionPath, 'expression')
}

function specs(layer: Layer, root: string): Map<string, [string, Record<string, unknown>]> {
  const out = new Map<string, [string, Record<string, unknown>]>()
  layer.traverse(root, path => {
    const fields: Record<string, unknown> = {}
    for (const field of layer.listFields(path)) {
      const value = layer.getField(path, field)
      fields[field] = Array.isArray(value) ? value.map(String) : value
    }
    out.set(path.slice(root.length), [layer.getSpecType(path), fields])
  })
  return out
}

describe('SdfCopySpec mapper and expression children', () => {
  it('traverses mapper, mapper arg and expression specs through their policies', () => {
    const layer = Layer.createAnonymous('src.usda')
    buildSource(layer, '/A')
    const types = [...specs(layer, '/A')].map(([path, [type]]) => `${path} ${type}`)
    expect(types).toEqual(expect.arrayContaining([
      '.a.mapper[/A/B.x] mapper', '.a.mapper[/A/B.x].i0 mapperArg', '.a.mapper[/A/B.y].i1 mapperArg',
      '.a.expression expression', '.a attribute',
    ]))
  })

  it('copies the specs to another layer', () => {
    const src = Layer.createAnonymous('src.usda')
    buildSource(src, '/A')
    const dst = Layer.createAnonymous('dst.usda')
    sdfCreatePrimInLayer(dst, '/A')
    expect(sdfCopySpec(src, '/A', dst, '/A')).toBe(true)
    expect(specs(dst, '/A')).toEqual(specs(src, '/A'))
  })

  it('copies the specs within a layer through a temporary source of the same format', () => {
    const layer = Layer.createAnonymous('layer.usda')
    buildSource(layer, '/A')
    const before = specs(layer, '/A')
    expect(sdfCopySpec(layer, '/A.a', layer, '/A.a')).toBe(true)
    expect(specs(layer, '/A')).toEqual(before)
  })

  it('removes destination mapper children absent from the source', () => {
    const src = Layer.createAnonymous('src.usda')
    buildSource(src, '/A')
    const dst = Layer.createAnonymous('dst.usda')
    buildSource(dst, '/A')
    const extra = SdfPath.fromString('/A.a').appendMapper(SdfPath.fromString('/A/B.z'))
    Sdf_ChildrenUtils.createSpec(Sdf_MapperChildPolicy, dst, extra, 'mapper')
    expect(dst.hasSpec(extra.pathString)).toBe(true)
    expect(sdfCopySpec(src, '/A.a', dst, '/A.a')).toBe(true)
    expect(dst.hasSpec(extra.pathString)).toBe(false)
    expect(specs(dst, '/A')).toEqual(specs(src, '/A'))
  })

  it('rejects copying between mapper and non-mapper paths', () => {
    const layer = Layer.createAnonymous('layer.usda')
    buildSource(layer, '/A')
    expect(() => sdfCopySpec(layer, '/A.a.mapper[/A/B.x]', layer, '/A.a')).toThrow(
      'Incompatible source and destination paths')
  })
})
