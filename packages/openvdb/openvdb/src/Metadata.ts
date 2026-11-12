// Ported from OpenVDB 13.0.1: openvdb/openvdb/Metadata.h,
//  openvdb/openvdb/Metadata.cc
// Copyright Contributors to the OpenVDB Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of openvdb/Metadata.h/.cc (read side). Serialized form per item:
// name string, typeName string, uint32 byte count, raw value bytes.
// Registered typed metadata decodes to a JS value; unknown types keep
// their raw bytes (upstream UnknownMetadata).

import { Stream } from './io/Stream.ts'

export type MetaValue = string | number | boolean | number[] | Uint8Array

export class Metadata {
  constructor(
    readonly typeName: string,
    readonly value: MetaValue,
  ) {}

  /** upstream Metadata::str() — the human-readable form vdb_print shows */
  str(): string {
    if (typeof this.value === 'string') return this.value
    if (typeof this.value === 'boolean') return this.value ? 'true' : 'false'
    if (typeof this.value === 'number') return formatNumber(this.value, this.typeName)
    if (this.value instanceof Uint8Array) return `<${this.value.byteLength} bytes>`
    return `[${this.value.map((v) => formatNumber(v, this.typeName)).join(', ')}]`
  }
}

function formatNumber(v: number, typeName: string): string {
  // std::ostream << double prints integral doubles without a decimal point
  if (Number.isInteger(v)) return String(v)
  if (typeName === 'float' || typeName === 'vec3s' || typeName === 'mat4s') {
    // mimic std::ostream float formatting (6 significant digits)
    return String(Number(v.toPrecision(6)))
  }
  return String(v)
}

function decode(typeName: string, bytes: Uint8Array): MetaValue {
  const s = new Stream(bytes)
  switch (typeName) {
    case 'string':
      return new TextDecoder().decode(bytes)
    case 'bool':
      return s.bool()
    case 'int32':
      return s.int32()
    case 'int64':
      return s.int64()
    case 'float':
      return s.float32()
    case 'double':
      return s.float64()
    case 'vec3i':
      return [s.int32(), s.int32(), s.int32()]
    case 'vec3s':
      return [s.float32(), s.float32(), s.float32()]
    case 'vec3d':
      return [s.float64(), s.float64(), s.float64()]
    case 'vec2i':
      return [s.int32(), s.int32()]
    case 'vec2s':
      return [s.float32(), s.float32()]
    case 'vec2d':
      return [s.float64(), s.float64()]
    case 'mat4s': {
      const m: number[] = []
      for (let i = 0; i < 16; ++i) m.push(s.float32())
      return m
    }
    case 'mat4d': {
      const m: number[] = []
      for (let i = 0; i < 16; ++i) m.push(s.float64())
      return m
    }
    default:
      return bytes.slice() // UnknownMetadata: keep raw bytes
  }
}

export function readMetadata(s: Stream): { name: string; metadata: Metadata } {
  const name = s.string()
  const typeName = s.string()
  const numBytes = s.uint32()
  const bytes = s.raw(numBytes)
  return { name, metadata: new Metadata(typeName, decode(typeName, bytes)) }
}
