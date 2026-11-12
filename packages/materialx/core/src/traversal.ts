// Ported from MaterialX 1.39.5: source/MaterialXCore/Traversal.h,
//  source/MaterialXCore/Traversal.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXCore/Traversal.h and Traversal.cpp
//
// Iterators implement the JavaScript iteration protocol: each class is both
// an Iterator and an Iterable, so `for (const elem of elem.traverseTree())`
// works, and keeping a reference to the iterator allows pruning mid-walk.
// As in C++, traversal includes the starting element (tree/inheritance) and
// begins with the first valid edge (graph).

import { Exception } from './exceptions.ts'
import { EMPTY_STRING } from './util.ts'
import type { Element } from './element.ts'

// An exception that is thrown when a traversal call encounters a cycle.
export class ExceptionFoundCycle extends Exception {}

// Stable per-object ids used to give edges value identity in sets.
const objectIds = new WeakMap<object, number>()
let nextObjectId = 1
function idOf(obj: object | null): number {
  if (!obj) return 0
  let id = objectIds.get(obj)
  if (id === undefined) {
    id = nextObjectId++
    objectIds.set(obj, id)
  }
  return id
}

// An edge between two connected Elements, returned during graph traversal.
//
// A valid Edge consists of a downstream element, an upstream element, and
// optionally a connecting element that binds them.
export class Edge {
  private _elemDown: Element | null
  private _elemConnect: Element | null
  private _elemUp: Element | null

  constructor(elemDown: Element | null, elemConnect: Element | null, elemUp: Element | null) {
    this._elemDown = elemDown
    this._elemConnect = elemConnect
    this._elemUp = elemUp
  }

  equals(rhs: Edge): boolean {
    return this._elemDown === rhs._elemDown && this._elemConnect === rhs._elemConnect && this._elemUp === rhs._elemUp
  }

  // Return the downstream element of the edge.
  getDownstreamElement(): Element | null {
    return this._elemDown
  }

  // Return the connecting element of the edge, if any.
  getConnectingElement(): Element | null {
    return this._elemConnect
  }

  // Return the upstream element of the edge.
  getUpstreamElement(): Element | null {
    return this._elemUp
  }

  // Return the name of this edge, if any.
  getName(): string {
    return this._elemConnect ? this._elemConnect.getName() : EMPTY_STRING
  }

  // A key giving the edge value identity within a set.
  key(): string {
    return `${idOf(this._elemDown)}|${idOf(this._elemConnect)}|${idOf(this._elemUp)}`
  }
}

// An iterator object representing the state of a tree traversal.
export class TreeIterator implements IterableIterator<Element> {
  private _elem: Element | null
  private _stack: Array<[Element, number]> = []
  private _prune = false
  private _started = false

  constructor(elem: Element | null) {
    this._elem = elem
  }

  // Return the current element in the traversal.
  getElement(): Element | null {
    return this._elem
  }

  // Return the element depth of the current traversal, where the starting
  // element represents a depth of zero.
  getElementDepth(): number {
    return this._stack.length
  }

  // Set the prune subtree flag, which controls whether the current subtree
  // is pruned from traversal.
  setPruneSubtree(prune: boolean): void {
    this._prune = prune
  }

  // Return the prune subtree flag.
  getPruneSubtree(): boolean {
    return this._prune
  }

  private advance(): void {
    if (!this._prune && this._elem && this._elem.getChildren().length > 0) {
      // Traverse to the first child of this element.
      this._stack.push([this._elem, 0])
      this._elem = this._elem.getChildren()[0]!
      return
    }
    this._prune = false

    for (;;) {
      if (this._stack.length === 0) {
        // Traversal is complete.
        this._elem = null
        return
      }

      // Traverse to our siblings.
      const parentFrame = this._stack[this._stack.length - 1]!
      const siblings = parentFrame[0].getChildren()
      if (parentFrame[1] + 1 < siblings.length) {
        parentFrame[1] += 1
        this._elem = siblings[parentFrame[1]]!
        return
      }

      // Traverse to our parent's siblings.
      this._stack.pop()
    }
  }

  next(): IteratorResult<Element> {
    if (!this._started) {
      this._started = true
    } else {
      this.advance()
    }
    return this._elem ? { value: this._elem, done: false } : { value: undefined, done: true }
  }

  [Symbol.iterator](): IterableIterator<Element> {
    return this
  }
}

// An iterator object representing the state of an upstream graph traversal.
export class GraphIterator implements IterableIterator<Edge> {
  private _upstreamElem: Element | null
  private _connectingElem: Element | null = null
  private _pathElems = new Set<Element>()
  private _stack: Array<[Element, number]> = []
  private _visitedEdges = new Set<string>()
  private _prune = false
  private _started = false

  constructor(elem: Element | null) {
    this._upstreamElem = elem
    if (elem) this._pathElems.add(elem)
  }

  // Return the downstream element of the current edge.
  getDownstreamElement(): Element | null {
    return this._stack.length > 0 ? this._stack[this._stack.length - 1]![0] : null
  }

  // Return the connecting element, if any, of the current edge.
  getConnectingElement(): Element | null {
    return this._connectingElem
  }

  // Return the upstream element of the current edge.
  getUpstreamElement(): Element | null {
    return this._upstreamElem
  }

  // Return the index of the current edge within the range of upstream edges
  // available to the downstream element.
  getUpstreamIndex(): number {
    return this._stack.length > 0 ? this._stack[this._stack.length - 1]![1] : 0
  }

  // Return the element depth of the current traversal, where a single edge
  // between two elements represents a depth of one.
  getElementDepth(): number {
    return this._stack.length
  }

  // Return the node depth of the current traversal, where a single edge
  // between two nodes represents a depth of one.
  getNodeDepth(): number {
    let nodeDepth = 0
    for (const elem of this._pathElems) {
      if (elem.isNode()) nodeDepth++
    }
    return nodeDepth
  }

  // Set the prune subgraph flag, which controls whether the current subgraph
  // is pruned from traversal.
  setPruneSubgraph(prune: boolean): void {
    this._prune = prune
  }

  // Return the prune subgraph flag.
  getPruneSubgraph(): boolean {
    return this._prune
  }

  private currentEdge(): Edge {
    return new Edge(this.getDownstreamElement(), this.getConnectingElement(), this.getUpstreamElement())
  }

  private advance(): boolean {
    if (!this._prune && this._upstreamElem && this._upstreamElem.getUpstreamEdgeCount() > 0) {
      // Traverse to the first upstream edge of this element.
      this._stack.push([this._upstreamElem, 0])
      const nextEdge = this._upstreamElem.getUpstreamEdge(0)
      if (nextEdge && nextEdge.getUpstreamElement() && !this.skipOrMarkAsVisited(nextEdge)) {
        this.extendPathUpstream(nextEdge.getUpstreamElement()!, nextEdge.getConnectingElement())
        return true
      }
    }
    this._prune = false

    for (;;) {
      if (this._upstreamElem) {
        this.returnPathDownstream(this._upstreamElem)
      }

      if (this._stack.length === 0) {
        // Traversal is complete.
        return false
      }

      // Traverse to our siblings.
      const parentFrame = this._stack[this._stack.length - 1]!
      if (parentFrame[1] + 1 < parentFrame[0].getUpstreamEdgeCount()) {
        parentFrame[1] += 1
        const nextEdge = parentFrame[0].getUpstreamEdge(parentFrame[1])
        if (nextEdge && nextEdge.getUpstreamElement() && !this.skipOrMarkAsVisited(nextEdge)) {
          this.extendPathUpstream(nextEdge.getUpstreamElement()!, nextEdge.getConnectingElement())
          return true
        }
        continue
      }

      // Traverse to our parent's siblings.
      this.returnPathDownstream(parentFrame[0])
      this._stack.pop()
    }
  }

  private extendPathUpstream(upstreamElem: Element, connectingElem: Element | null): void {
    // Check for cycles.
    if (this._pathElems.has(upstreamElem)) {
      throw new ExceptionFoundCycle('Encountered cycle at element: ' + upstreamElem.asString())
    }

    // Extend the current path to the new element.
    this._pathElems.add(upstreamElem)
    this._upstreamElem = upstreamElem
    this._connectingElem = connectingElem
  }

  private returnPathDownstream(upstreamElem: Element): void {
    this._pathElems.delete(upstreamElem)
    this._upstreamElem = null
    this._connectingElem = null
  }

  private skipOrMarkAsVisited(edge: Edge): boolean {
    const key = edge.key()
    if (this._visitedEdges.has(key)) return true
    this._visitedEdges.add(key)
    return false
  }

  next(): IteratorResult<Edge> {
    // The C++ begin() increments once to generate a valid edge.
    this._started = true
    if (!this.advance()) return { value: undefined, done: true }
    return { value: this.currentEdge(), done: false }
  }

  [Symbol.iterator](): IterableIterator<Edge> {
    return this
  }
}

// An iterator object representing the current state of an inheritance
// traversal; includes the starting element.
export class InheritanceIterator implements IterableIterator<Element> {
  private _elem: Element | null
  private _pathElems = new Set<Element>()
  private _started = false

  constructor(elem: Element | null) {
    this._elem = elem
    if (elem) this._pathElems.add(elem)
  }

  private advance(): void {
    if (!this._elem) return
    let superElem = this._elem.getInheritsFrom()
    if (superElem && superElem.getCategory() !== this._elem.getCategory()) {
      superElem = null
    }
    if (superElem) {
      // Check for cycles.
      if (this._pathElems.has(superElem)) {
        throw new ExceptionFoundCycle('Encountered cycle at element: ' + superElem.asString())
      }
      this._pathElems.add(superElem)
    }
    this._elem = superElem
  }

  next(): IteratorResult<Element> {
    if (!this._started) {
      this._started = true
    } else {
      this.advance()
    }
    return this._elem ? { value: this._elem, done: false } : { value: undefined, done: true }
  }

  [Symbol.iterator](): IterableIterator<Element> {
    return this
  }
}
