// Ported from OpenUSD 26.11.1: pxr/exec/vdf/connectorMap.h,
//  pxr/exec/vdf/output.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/connectorMap.h.
//
// VdfConnectorMap<Connector> maps TfToken names to VdfInput or VdfOutput
// objects on behalf of VdfNode, constructs them and owns them
// (connectorMap.h:22-144). Lookup is a linear search over a small vector.
//
// Mapping choices:
// - The template argument Connector becomes the connector class, passed to
//   the constructor; try_emplace(k, ...args) constructs `new Connector(...args)`
//   as upstream's forwarding constructor does (connectorMap.h:161-172).
// - Iterators: find() and try_emplace() return the stored (key, connector)
//   pair, or undefined for end(). The map is a JS iterable over its pairs in
//   insertion order (begin()/end()); rbegin()/rend() are a reversed copy,
//   Reversed().
// - Ownership: clear() and destruction "delete" the connectors. A connector
//   whose destructor has observable effects (VdfOutput releases its id,
//   output.cpp:31-34) implements _Destruct(), which clear() calls.

// TfToken is a string (docs/openexec-x1.md 4, rule 3).
type TfToken = string

/** A connector destructor with observable effects (see file header). */
interface _Destructible {
  _destruct?(): void
}

/** The (key, connector) pair stored in the map (connectorMap.h:37). */
export type VdfConnectorMapPair<Connector> = readonly [TfToken, Connector]

export class VdfConnectorMap<Connector extends object, Args extends unknown[] = unknown[]>
implements Iterable<VdfConnectorMapPair<Connector>> {
  private readonly _connectorClass: new (...args: Args) => Connector
  private _vec: Array<VdfConnectorMapPair<Connector>> = []

  /**
   * VdfConnectorMap() / VdfConnectorMap(size_t n) (connectorMap.h:56-63). The
   * reservation size has no observable effect.
   */
  constructor(connectorClass: new (...args: Args) => Connector, _n?: number) {
    this._connectorClass = connectorClass
  }

  /** begin()/end() (connectorMap.h:71-78). */
  [Symbol.iterator](): Iterator<VdfConnectorMapPair<Connector>> {
    return this._vec[Symbol.iterator]()
  }

  /** rbegin()/rend() (connectorMap.h:81-88): the pairs in reverse order. */
  Reversed(): Array<VdfConnectorMapPair<Connector>> {
    return [...this._vec].reverse()
  }

  /** size (connectorMap.h:91). */
  size(): number {
    return this._vec.length
  }

  /** empty (connectorMap.h:96). */
  empty(): boolean {
    return this._vec.length === 0
  }

  /** swap (connectorMap.h:101) and the friend swap (connectorMap.h:106). */
  swap(x: VdfConnectorMap<Connector, Args>): void {
    const vec = this._vec
    this._vec = x._vec
    x._vec = vec
  }

  /** clear (connectorMap.h:174-182): destroys the owned connectors. */
  clear(): void {
    for (const [, connector] of this._vec) {
      (connector as _Destructible)._destruct?.()
    }
    this._vec = []
  }

  /** find (connectorMap.h:147-159): the pair for k, or undefined (end()). */
  find(k: TfToken): VdfConnectorMapPair<Connector> | undefined {
    for (const pair of this._vec) {
      if (pair[0] === k) return pair
    }
    return undefined
  }

  /** operator== (connectorMap.h:120): same keys and the same connectors. */
  Equals(x: VdfConnectorMap<Connector, Args>): boolean {
    if (this._vec.length !== x._vec.length) return false
    for (let i = 0; i < this._vec.length; ++i) {
      const a = this._vec[i]!
      const b = x._vec[i]!
      if (a[0] !== b[0] || a[1] !== b[1]) return false
    }
    return true
  }

  /** operator!= (connectorMap.h:124). */
  notEquals(x: VdfConnectorMap<Connector, Args>): boolean {
    return !this.Equals(x)
  }

  /**
   * try_emplace (connectorMap.h:161-172): inserts a new connector constructed
   * from args if k is not present. Returns (pair, inserted).
   */
  try_emplace(k: TfToken, ...args: Args): [VdfConnectorMapPair<Connector>, boolean] {
    const i = this.find(k)
    if (i) return [i, false]
    const pair: VdfConnectorMapPair<Connector> = [k, new this._connectorClass(...args)]
    this._vec.push(pair)
    return [pair, true]
  }
}
