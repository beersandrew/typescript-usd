// Ported from OpenUSD 26.11.1: pxr/base/trace/eventData.cpp,
//  pxr/base/trace/eventData.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/trace/eventData.h:28.
import { EventDataType, type TraceData } from './event.ts'

export class TraceEventData {
  constructor(readonly value?: TraceData) {}
  getType(): EventDataType {
    if (this.value === undefined) return EventDataType.Invalid
    if (typeof this.value === 'string') return EventDataType.String
    if (typeof this.value === 'boolean') return EventDataType.Boolean
    if (typeof this.value === 'bigint') {
      return this.value < 0n ? EventDataType.Int : EventDataType.UInt
    }
    return Number.isInteger(this.value) ? EventDataType.Int : EventDataType.Float
  }
  getInt(): number | undefined {
    return this.getType() === EventDataType.Int ? Number(this.value) : undefined
  }
  getUInt(): bigint | undefined {
    return this.getType() === EventDataType.UInt ? this.value as bigint : undefined
  }
  getFloat(): number | undefined {
    return this.getType() === EventDataType.Float ? this.value as number : undefined
  }
  getBool(): boolean | undefined {
    return this.getType() === EventDataType.Boolean ? this.value as boolean : undefined
  }
  GetString(): string | undefined {
    return this.getType() === EventDataType.String ? this.value as string : undefined
  }
  writeJson(): TraceData | null { return this.value ?? null }
}
