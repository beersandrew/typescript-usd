// Ported from OpenUSD 26.11.1: pxr/usd/sdr/shaderMetadataHelpers.cpp,
//  pxr/usd/sdr/shaderMetadataHelpers.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import type { SdrShaderProperty } from './shaderNode.ts'

// Typed item ownership follows shaderNodeMetadata.cpp:25-257; value parsing
// follows shaderMetadataHelpers.cpp:273-330.
export class SdrShaderNodeMetadata {
  private readonly items = new Map<string, unknown>()
  constructor(initial: Record<string, unknown> = { domain: 'rendering' }) {
    for (const [key, value] of Object.entries(initial)) if (value !== undefined) this.items.set(key, value)
  }
  hasItem(key: string): boolean { return this.items.has(key) }
  getItemValue(key: string): unknown { return this.items.get(key) }
  setItem(key: string, value: unknown): void { if (value === undefined) this.items.delete(key); else this.items.set(key, value) }
  clearItem(key: string): void { this.items.delete(key) }
  hasLabel(): boolean { return this.hasItem('label') }
  getLabel(): string { return String(this.items.get('label') ?? '') }
  clearLabel(): void { this.clearItem('label') }
  hasOpenPages(): boolean { return this.hasItem('openPages') }
  getOpenPages(): string[] { return this.items.get('openPages') as string[] ?? [] }
  hasDomain(): boolean { return this.hasItem('domain') }
  getDomain(): string { return String(this.items.get('domain') ?? '') }
}

export interface ParsedSdrValue { value: unknown, error: string }
export function parseSdfValue(text: string, property: SdrShaderProperty): ParsedSdrValue {
  if (property.isAssetIdentifier()) return { value: text, error: '' }
  if (property.getType() === 'string' || property.getType() === 'terminal') return { value: text, error: '' }
  const size = property.getArraySize()
  const components = size ? text.split(',').map(item => item.trim()) : [text.trim()]
  if (components.length !== (size || 1) || components.some(item => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(item))) return { value: undefined, error: `Could not parse '${text}'` }
  const numbers = components.map(Number)
  if (property.getType() === 'int' && numbers.some(number => !Number.isInteger(number))) return { value: undefined, error: `Could not parse '${text}' as int` }
  return { value: size ? numbers : numbers[0], error: '' }
}
