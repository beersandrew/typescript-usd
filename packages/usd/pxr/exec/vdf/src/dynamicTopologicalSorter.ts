// Ported from OpenUSD 26.11.1: pxr/exec/vdf/dynamicTopologicalSorter.cpp,
//  pxr/exec/vdf/dynamicTopologicalSorter.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/dynamicTopologicalSorter.h and
// dynamicTopologicalSorter.cpp.
//
// Maintains a topological ordering of a DAG while edges are inserted and
// removed: "Algorithm PK" (excluding cycle detection) from Pierce & Kelly,
// "A dynamic topological sort algorithm for directed acyclic graphs", ACM
// JEA 11, 2007 (dynamicTopologicalSorter.h:56-67).
//
// Vertex must be usable as a JS Map key (numbers and object identities, as
// upstream hashes ints and pointers). The unordered_multimap of edges is a
// Map from vertex to an array of adjacent vertices; the traversal order of
// equal keys does not affect the resulting priorities.

import { TF_DEV_AXIOM } from 'typescript-usd/tf'

/** Vdf_TopologicalPriorityAllocator (dynamicTopologicalSorter.h:30-53). */
export class Vdf_TopologicalPriorityAllocator {
  private _next = 0
  private _reusablePriorities: number[] = []

  /** Allocate (dynamicTopologicalSorter.cpp:18-28): the next unused priority. */
  allocate(): number {
    if (this._reusablePriorities.length) {
      return this._reusablePriorities.pop()!
    }
    return this._next++
  }

  /** Free (dynamicTopologicalSorter.cpp:30-34). */
  Free(priority: number): void {
    this._reusablePriorities.push(priority)
  }

  /** Clear (dynamicTopologicalSorter.cpp:36-41). */
  clear(): void {
    this._next = 0
    this._reusablePriorities = []
  }
}

// _PrioritizedVertex (dynamicTopologicalSorter.h:101-117).
interface _PrioritizedVertex<Vertex> {
  priority: number
  vertex: Vertex
}

// _Rep (dynamicTopologicalSorter.h:143-152).
interface _Rep {
  priority: number
  refCount: number
}

// _Direction (dynamicTopologicalSorter.h:120).
const _Outgoing = 0
const _Incoming = 1

export class VdfDynamicTopologicalSorter<Vertex> {
  /** InvalidPriority (dynamicTopologicalSorter.h:73). */
  static readonly InvalidPriority = -1

  /** LastPriority (dynamicTopologicalSorter.h:74): INT_MAX. */
  static readonly LastPriority = 2147483647

  private _priorities = new Map<Vertex, _Rep>()
  private readonly _priorityAllocator = new Vdf_TopologicalPriorityAllocator()
  private _edges: [Map<Vertex, Vertex[]>, Map<Vertex, Vertex[]>] = [new Map(), new Map()]

  /** GetPriority (dynamicTopologicalSorter.h:164-174). */
  getPriority(v: Vertex): number {
    const rep = this._priorities.get(v)
    return rep ? rep.priority : VdfDynamicTopologicalSorter.InvalidPriority
  }

  /** AddEdge (dynamicTopologicalSorter.h:177-215). */
  addEdge(source: Vertex, target: Vertex): void {
    _Emplace(this._edges[_Outgoing], source, target)
    _Emplace(this._edges[_Incoming], target, source)

    const sourcePriority = this._insertVertex(source)
    const targetPriority = this._insertVertex(target)

    // Only reorder if the edge violates the existing ordering.
    if (sourcePriority > targetPriority) {
      // Forward search from target, bounded above by source's priority.
      const deltaForward = this._dfsWithBoundary(
        _Outgoing, target, sourcePriority, (p, b) => p < b)
      // Backward search from source, bounded below by target's priority.
      const deltaBackward = this._dfsWithBoundary(
        _Incoming, source, targetPriority, (p, b) => p > b)

      this._reorder(deltaBackward, deltaForward)
    }

    TF_DEV_AXIOM(this.getPriority(source) < this.getPriority(target),
      'GetPriority(source) < GetPriority(target)')
  }

  /**
   * RemoveEdge (dynamicTopologicalSorter.h:218-262): removes one instance of
   * the edge; duplicate edges must be removed as many times as added.
   */
  removeEdge(source: Vertex, target: Vertex): void {
    const foundOutgoing = _EraseOne(this._edges[_Outgoing], source, target)
    const foundIncoming = _EraseOne(this._edges[_Incoming], target, source)

    TF_DEV_AXIOM(foundOutgoing === foundIncoming, 'foundOutgoing == foundIncoming')

    if (!foundOutgoing && !foundIncoming) return

    this._removeVertex(source)
    this._removeVertex(target)
  }

  /** Clear (dynamicTopologicalSorter.h:265-273). */
  clear(): void {
    this._priorities = new Map()
    this._priorityAllocator.clear()
    this._edges = [new Map(), new Map()]
  }

  // _InsertVertex (dynamicTopologicalSorter.h:276-291).
  private _insertVertex(v: Vertex): number {
    let rep = this._priorities.get(v)
    const inserted = !rep
    if (!rep) {
      rep = { priority: VdfDynamicTopologicalSorter.InvalidPriority, refCount: 0 }
      this._priorities.set(v, rep)
    }
    ++rep.refCount
    if (inserted) {
      rep.priority = this._priorityAllocator.allocate()
    }
    return rep.priority
  }

  // _RemoveVertex (dynamicTopologicalSorter.h:294-309).
  private _removeVertex(v: Vertex): void {
    const rep = this._priorities.get(v)
    if (!rep) return
    if (--rep.refCount === 0) {
      this._priorityAllocator.Free(rep.priority)
      this._priorities.delete(v)
    }
  }

  // _DFSWithBoundary (dynamicTopologicalSorter.h:312-363).
  private _dfsWithBoundary(
    direction: number,
    v: Vertex,
    boundary: number,
    boundaryComp: (priority: number, boundary: number) => boolean,
  ): Array<_PrioritizedVertex<Vertex>> {
    const delta: Array<_PrioritizedVertex<Vertex>> = [
      { priority: this.getPriority(v), vertex: v },
    ]

    const pending: Vertex[] = [v]
    const visited = new Set<Vertex>([v])

    while (pending.length) {
      const u = pending.pop()!

      for (const w of this._edges[direction]!.get(u) ?? []) {
        // Skip already visited vertices.
        if (visited.has(w)) continue
        visited.add(w)

        const priority = this.getPriority(w)

        // Skip vertices whose priority is beyond our boundary.
        if (!boundaryComp(priority, boundary)) continue

        delta.push({ priority, vertex: w })
        pending.push(w)
      }
    }

    return delta
  }

  // _Reorder (dynamicTopologicalSorter.h:366-416): pools the priorities of
  // both sets and redistributes them, backward set first.
  private _reorder(
    deltaBackward: Array<_PrioritizedVertex<Vertex>>,
    deltaForward: Array<_PrioritizedVertex<Vertex>>): void {
    const byPriority = (a: _PrioritizedVertex<Vertex>, b: _PrioritizedVertex<Vertex>): number =>
      a.priority - b.priority

    deltaBackward.sort(byPriority)
    deltaForward.sort(byPriority)

    const availablePriorities = [
      ...deltaBackward.map(v => v.priority),
      ...deltaForward.map(v => v.priority),
    ].sort((a, b) => a - b)

    let p = 0
    for (const v of deltaBackward) {
      this._priorities.get(v.vertex)!.priority = availablePriorities[p++]!
    }
    for (const v of deltaForward) {
      this._priorities.get(v.vertex)!.priority = availablePriorities[p++]!
    }
  }
}

// unordered_multimap::emplace.
function _Emplace<Vertex>(map: Map<Vertex, Vertex[]>, key: Vertex, value: Vertex): void {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

// Erases one (key, value) entry; returns whether one was found.
function _EraseOne<Vertex>(map: Map<Vertex, Vertex[]>, key: Vertex, value: Vertex): boolean {
  const list = map.get(key)
  if (!list) return false
  const i = list.indexOf(value)
  if (i < 0) return false
  list.splice(i, 1)
  if (!list.length) map.delete(key)
  return true
}
