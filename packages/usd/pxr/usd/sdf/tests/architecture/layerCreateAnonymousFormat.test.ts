// Ported from OpenUSD 26.11.1: pxr/usd/sdf/layer.cpp, pxr/usd/sdf/layer.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// SdfLayer::CreateAnonymous(tag, args) and (tag, format, args)
// (layer.h:277-285; layer.cpp:392-451). Expected values captured from the
// OpenUSD v26.08 build's Sdf.Layer.CreateAnonymous.

import { describe, expect, it } from 'vitest'
import { Layer } from '../../src/index.ts'
import { SdfFileFormat } from '../../src/fileFormat.ts'

describe('SdfLayer::CreateAnonymous file format and arguments', () => {
  it('creates the layer with the given format and arguments', () => {
    const layer = Layer.createAnonymous('tmp', SdfFileFormat.findById('usdc'), new Map([['a', 'b']]))
    expect(layer.getFileFormat()?.formatId).toBe('usdc')
    expect(layer.getFileFormatArguments()).toEqual(new Map([['a', 'b']]))
    expect(layer.getDisplayName()).toBe('tmp')
    expect(layer.isAnonymous()).toBe(true)
  })

  it('defaults an untagged layer to usda with no arguments', () => {
    const layer = Layer.createAnonymous()
    expect(layer.getFileFormat()?.formatId).toBe('usda')
    expect(layer.getFileFormatArguments()).toEqual(new Map())
  })

  it('finds the format by the tag extension and keeps the arguments', () => {
    const layer = Layer.createAnonymous('x.usdc', new Map([['k', 'v']]))
    expect(layer.getFileFormat()?.formatId).toBe('usdc')
    expect(layer.getFileFormatArguments()).toEqual(new Map([['k', 'v']]))
  })

  it('refuses a package format', () => {
    expect(() => Layer.createAnonymous('t', SdfFileFormat.findById('usdz'))).toThrow(
      'Cannot create anonymous layer: creating package usdz layer is not allowed through this API.')
  })
})
