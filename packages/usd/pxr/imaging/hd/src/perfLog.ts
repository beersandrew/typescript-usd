// Ported from OpenUSD 26.11.1: pxr/imaging/hd/perfLog.cpp,
//  pxr/imaging/hd/perfLog.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/perfLog.h — HdPerfLog (the subset used by the unit
// tests: an enableable singleton of named value counters plus cache hit/miss
// tracking).
//
// The C++ macros (HD_PERF_COUNTER_INCR / HD_PERF_CACHE_HIT / ...) just forward
// to the matching methods. Mutations only take effect while the perf log is
// enabled; reads work regardless of the enabled state.

// Tracks number of hits and misses for a named cache (perfLog.h _CacheEntry).
class _CacheEntry {
  private _hits = 0
  private _misses = 0

  addHit(): void { ++this._hits }
  getHits(): number { return this._hits }

  addMiss(): void { ++this._misses }
  getMisses(): number { return this._misses }

  getTotal(): number { return this._hits + this._misses }
  getHitRatio(): number { return this._hits / this.getTotal() }

  Reset(): void { this._hits = 0; this._misses = 0 }
}

export class HdPerfLog {
  private static _instance: HdPerfLog | null = null
  private _enabled = false
  private _counters = new Map<string, number>()
  private _cacheMap = new Map<string, _CacheEntry>()

  static GetInstance(): HdPerfLog {
    if (!HdPerfLog._instance) HdPerfLog._instance = new HdPerfLog()
    return HdPerfLog._instance
  }

  enable(): void { this._enabled = true }
  disable(): void { this._enabled = false }
  isEnabled(): boolean { return this._enabled }

  // -- Counters ------------------------------------------------------------

  incrementCounter(token: string): void {
    if (!this._enabled) return
    this._counters.set(token, (this._counters.get(token) ?? 0) + 1)
  }

  decrementCounter(token: string): void {
    if (!this._enabled) return
    this._counters.set(token, (this._counters.get(token) ?? 0) - 1)
  }

  setCounter(token: string, value: number): void {
    if (!this._enabled) return
    this._counters.set(token, value)
  }

  addCounter(token: string, value: number): void {
    if (!this._enabled) return
    this._counters.set(token, (this._counters.get(token) ?? 0) + value)
  }

  subtractCounter(token: string, value: number): void {
    if (!this._enabled) return
    this._counters.set(token, (this._counters.get(token) ?? 0) - value)
  }

  getCounter(token: string): number {
    return this._counters.get(token) ?? 0
  }

  getCounterNames(): string[] {
    return Array.from(this._counters.keys()).sort()
  }

  // Reset all counter values. Note that this doesn't reset cache counters.
  resetCounters(): void { this._counters.clear() }

  // -- Cache hit/miss ------------------------------------------------------

  // The id is accepted (reported only when debug logging is enabled in
  // upstream) but only the name aggregates counts.
  addCacheHit(name: string, _id: string): void {
    if (!this._enabled) return
    this._getOrCreateCacheEntry(name).addHit()
  }

  addCacheMiss(name: string, _id: string): void {
    if (!this._enabled) return
    this._getOrCreateCacheEntry(name).addMiss()
  }

  resetCache(name: string): void {
    const entry = this._cacheMap.get(name)
    if (entry) entry.Reset()
  }

  getCacheHits(name: string): number {
    const entry = this._cacheMap.get(name)
    return entry ? entry.getHits() : 0
  }

  getCacheMisses(name: string): number {
    const entry = this._cacheMap.get(name)
    return entry ? entry.getMisses() : 0
  }

  getCacheHitRatio(name: string): number {
    const entry = this._cacheMap.get(name)
    if (!entry || entry.getTotal() === 0) return 0
    return entry.getHitRatio()
  }

  getCacheNames(): string[] {
    return Array.from(this._cacheMap.keys()).sort()
  }

  private _getOrCreateCacheEntry(name: string): _CacheEntry {
    let entry = this._cacheMap.get(name)
    if (!entry) {
      entry = new _CacheEntry()
      this._cacheMap.set(name, entry)
    }
    return entry
  }
}
