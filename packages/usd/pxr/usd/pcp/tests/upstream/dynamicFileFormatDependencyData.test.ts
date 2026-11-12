// Ported from OpenUSD 26.11.1:
//  pxr/usd/pcp/dynamicFileFormatDependencyData.cpp,
//  pxr/usd/pcp/dynamicFileFormatDependencyData.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of PcpDynamicFileFormatDependencyData's public storage/change contract
// from dynamicFileFormatDependencyData.{h,cpp}.

import { describe, expect, it } from 'vitest'
import type { FileFormatArguments as SdfFileFormatArguments } from 'typescript-usd/sdf'
import {
  DynamicFileFormatDependencyData as PcpDynamicFileFormatDependencyData,
  DynamicFileFormatContext as PcpDynamicFileFormatContext,
  DynamicFileFormatInterface as PcpDynamicFileFormatInterface,
} from '../../src/index.ts'

function format(
  fieldResult: (context: unknown) => boolean,
  attributeResult: (context: unknown) => boolean,
): PcpDynamicFileFormatInterface {
  return {
    composeFieldsForFileFormatArguments: (
      _assetPath: string, _context: PcpDynamicFileFormatContext,
      _args: SdfFileFormatArguments,
    ) => undefined,
    canFieldChangeAffectFileFormatArguments: (_name, _old, _next, context) =>
      fieldResult(context),
    canAttributeDefaultValueChangeAffectFileFormatArguments:
      (_name, _old, _next, context) => attributeResult(context),
  }
}

describe('PcpDynamicFileFormatDependencyData', () => {
  it('defaults empty and rejects changes with no relevant name', () => {
    const data = new PcpDynamicFileFormatDependencyData()
    expect(data.isEmpty()).toBe(true)
    expect([...data.getRelevantFieldNames()]).toEqual([])
    expect([...data.getRelevantAttributeNames()]).toEqual([])
    expect(data.canFieldChangeAffectFileFormatArguments('depth', 1, 2)).toBe(false)
    expect(data.canAttributeDefaultValueChangeAffectFileFormatArguments(
      'radius', 1, 2)).toBe(false)
  })

  it('aggregates names and asks every matching dependency context', () => {
    const data = new PcpDynamicFileFormatDependencyData()
    data.addDependencyContext(format(() => false, () => false), 'first',
      ['depth'], ['radius'])
    data.addDependencyContext(format(context => context === 'second', () => false),
      'second', ['depth', 'height'], [])

    expect(data.isEmpty()).toBe(false)
    expect([...data.getRelevantFieldNames()]).toEqual(['depth', 'height'])
    expect([...data.getRelevantAttributeNames()]).toEqual(['radius'])
    expect(data.canFieldChangeAffectFileFormatArguments('depth', 1, 2)).toBe(true)
    expect(data.canFieldChangeAffectFileFormatArguments('height', 1, 2)).toBe(true)
    expect(data.canFieldChangeAffectFileFormatArguments('other', 1, 2)).toBe(false)
    expect(data.canAttributeDefaultValueChangeAffectFileFormatArguments(
      'radius', 1, 2)).toBe(false)
  })

  it('appends another aggregate and preserves default-true interface behavior', () => {
    const left = new PcpDynamicFileFormatDependencyData()
    const right = new PcpDynamicFileFormatDependencyData()
    right.addDependencyContext({
      composeFieldsForFileFormatArguments: () => undefined,
    }, undefined, ['kind'], ['size'])
    left.appendDependencyData(right)

    expect([...left.getRelevantFieldNames()]).toEqual(['kind'])
    expect([...left.getRelevantAttributeNames()]).toEqual(['size'])
    expect(left.canFieldChangeAffectFileFormatArguments('kind', 'a', 'b')).toBe(true)
    expect(left.canAttributeDefaultValueChangeAffectFileFormatArguments(
      'size', 1, 2)).toBe(true)
  })

  it('copy construction isolates later mutations', () => {
    const original = new PcpDynamicFileFormatDependencyData()
    original.addDependencyContext({
      composeFieldsForFileFormatArguments: () => undefined,
    }, undefined, ['depth'], [])
    const copy = new PcpDynamicFileFormatDependencyData(original)
    copy.addDependencyContext({
      composeFieldsForFileFormatArguments: () => undefined,
    }, undefined, ['height'], [])

    expect([...original.getRelevantFieldNames()]).toEqual(['depth'])
    expect([...copy.getRelevantFieldNames()]).toEqual(['depth', 'height'])
  })
})
