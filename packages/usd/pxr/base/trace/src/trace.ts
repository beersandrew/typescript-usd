// Ported from OpenUSD 26.11.1: pxr/base/trace/trace.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/trace/trace.h:126-187.
import { Collector, type SpanIdentity } from './collector.ts'
import { TraceDynamicKey } from './dynamicKey.ts'
import { TraceStaticKeyData } from './staticKeyData.ts'

function now(): number {
  const runtime = globalThis as typeof globalThis & { performance?: { now(): number } }
  return runtime.performance?.now() ?? Date.now()
}

type KeyLike = string | TraceStaticKeyData | TraceDynamicKey
function keyString(key: KeyLike): string {
  return typeof key === 'string'
    ? key
    : key instanceof TraceDynamicKey ? key.getData().GetString() : key.GetString()
}

export class TraceScopeHolder {
  readonly key: string
  readonly start: number
  readonly #active: boolean
  readonly #span: (SpanIdentity & { time: number }) | undefined
  #closed = false
  constructor(
    key: KeyLike,
    readonly collector = Collector.GetInstance(),
    readonly category = 0,
  ) {
    this.key = keyString(key)
    this.start = now()
    this.#active = collector.enabled
    this.#span = this.#active
      // Upstream nests a scope's Timespan inside every scope whose span
      // contains it (eventTreeBuilder.cpp:179-200); lexically nested
      // scopes are exactly those, so the open scope is the parent.
      ? collector._beginTimespan(
        this.key, 'Main Thread', collector._currentSpanId('Main Thread'), this.start, category)
      : undefined
  }
  close(stop = now()): void {
    if (this.#closed) return
    this.#closed = true
    if (this.#span) this.collector._endTimespan(this.#span, stop)
  }
  storeData(key: string, value: string | boolean | number | bigint): void {
    if (this.#span) this.collector._storeData(this.#span, key, value)
  }
}

export class TraceScope extends TraceScopeHolder {}
export class TraceScopeAuto extends TraceScopeHolder {}
export { TraceScopeAuto as TraceScopeAuto_ }

export class TraceAuto {
  readonly key: string
  readonly #collector: Collector
  readonly #started: boolean
  #closed = false
  constructor(key: KeyLike)
  constructor(functionName: string, prettyFunctionName: string, scopeName: string)
  constructor(
    first: KeyLike,
    prettyFunctionName?: string,
    scopeName?: string,
  ) {
    this.key = prettyFunctionName === undefined
      ? keyString(first)
      : new TraceStaticKeyData(String(first), prettyFunctionName, scopeName).GetString()
    this.#collector = Collector.GetInstance()
    this.#started = this.#collector.enabled
    if (this.#started) this.#collector.beginEvent(this.key)
  }
  close(): void {
    if (this.#closed) return
    this.#closed = true
    if (this.#started) this.#collector.endEvent(this.key)
  }
}
export { TraceAuto as TraceAuto_ }

export class TraceCounterHolder {
  constructor(
    readonly key: KeyLike,
    readonly collector = Collector.GetInstance(),
    readonly category = 0,
  ) {}
  isEnabled(): boolean { return this.collector.enabled }
  record(value: number, isDelta: boolean): void {
    if (isDelta) this.recordDelta(value)
    else this.recordValue(value)
  }
  recordDelta(value: number): void {
    this.collector.recordCounterDelta(keyString(this.key), value, this.category)
  }
  recordValue(value: number): void {
    this.collector.recordCounterValue(keyString(this.key), value, this.category)
  }
}
export { TraceCounterHolder as TraceCounterHolder_ }

export class TraceKeyData_ extends TraceStaticKeyData {}
