// Ported from OpenUSD 26.11.1: pxr/imaging/hd/aov.cpp, pxr/imaging/hd/aov.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/aov.{h,cpp}.

import { HdFormat } from './types.ts'

export type HdAovSettingsMap = Map<string, unknown>

export class HdAovDescriptor {
  constructor(
    public format: HdFormat = HdFormat.HdFormatInvalid,
    public multiSampled = false,
    public clearValue?: unknown,
    public aovSettings: HdAovSettingsMap = new Map(),
  ) {}
}

export class HdRenderBufferDescriptor {
  constructor(
    public dimensions: [number, number, number] = [0, 0, 0],
    public format: HdFormat = HdFormat.HdFormatInvalid,
    public multiSampled = false,
  ) {}

  /** The struct's copy (VtValue copies held values with Clone()). */
  Clone(): HdRenderBufferDescriptor {
    return new HdRenderBufferDescriptor([...this.dimensions], this.format, this.multiSampled)
  }

  Equals(rhs: HdRenderBufferDescriptor): boolean {
    return this.dimensions.every((value, index) => value === rhs.dimensions[index]) &&
      this.format === rhs.format && this.multiSampled === rhs.multiSampled
  }
}

export class HdRenderPassAovBinding {
  aovName = ''
  renderBuffer?: unknown
  renderBufferId = ''
  clearValue?: unknown
  aovSettings: HdAovSettingsMap = new Map()

  Equals(rhs: HdRenderPassAovBinding): boolean {
    return this.aovName === rhs.aovName &&
      this.renderBuffer === rhs.renderBuffer &&
      this.renderBufferId === rhs.renderBufferId &&
      _valuesEqual(this.clearValue, rhs.clearValue) &&
      _mapsEqual(this.aovSettings, rhs.aovSettings)
  }

  ToString(): string {
    const settings = [...this.aovSettings]
      .map(([key, value]) => `${key}: ${String(value)}, `).join('')
    return `RenderPassAovBinding: {${this.aovName}, ${String(this.renderBuffer)}, ` +
      `${this.renderBufferId}, ${String(this.clearValue)}, aovSettings: { ${settings}}}`
  }
}

function _mapsEqual(a: HdAovSettingsMap, b: HdAovSettingsMap): boolean {
  if (a.size !== b.size) return false
  for (const [key, value] of a) {
    if (!b.has(key) || !_valuesEqual(value, b.get(key))) return false
  }
  return true
}

function _valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => _valuesEqual(value, b[index]))
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const aRecord = a as Record<string, unknown>
    const bRecord = b as Record<string, unknown>
    const keys = Object.keys(aRecord)
    return keys.length === Object.keys(bRecord).length &&
      keys.every(key => key in bRecord && _valuesEqual(aRecord[key], bRecord[key]))
  }
  return false
}

export function HdAovHasDepthSemantic(aovName: string): boolean {
  return aovName.toLowerCase().endsWith('depth')
}

export function HdAovHasDepthStencilSemantic(aovName: string): boolean {
  return aovName.toLowerCase().endsWith('depthstencil')
}

export class HdParsedAovToken {
  name = ''
  isPrimvar = false
  isLpe = false
  isShader = false

  constructor(aovName = '') {
    for (const [prefix, flag] of [
      ['primvars:', 'isPrimvar'],
      ['lpe:', 'isLpe'],
      ['shader:', 'isShader'],
    ] as const) {
      if (aovName.length > prefix.length && aovName.startsWith(prefix)) {
        this.name = aovName.slice(prefix.length)
        this[flag] = true
        return
      }
    }
    this.name = aovName
  }
}
