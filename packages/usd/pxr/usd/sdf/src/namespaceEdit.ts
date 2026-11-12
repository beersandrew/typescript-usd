// Ported from OpenUSD 26.11.1: pxr/usd/sdf/namespaceEdit.cpp,
//  pxr/usd/sdf/namespaceEdit.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/sdf/namespaceEdit.{h,cpp}: namespace edits, their
// validation details, and batches of edits that are checked against a
// simulated namespace before any is applied.

import { SdfPath } from './path.ts'

export type SdfNamespaceEditIndex = number

// SdfNamespaceEdit: the object at currentPath moves to newPath (an empty
// newPath removes it) at index among its new siblings.
export class SdfNamespaceEdit {
  static readonly AtEnd: SdfNamespaceEditIndex = -1
  static readonly Same: SdfNamespaceEditIndex = -2

  readonly currentPath: SdfPath
  readonly newPath: SdfPath
  readonly index: SdfNamespaceEditIndex

  constructor(
    currentPath: SdfPath | string = SdfPath.emptyPath, newPath: SdfPath | string = SdfPath.emptyPath,
    index: SdfNamespaceEditIndex = SdfNamespaceEdit.AtEnd,
  ) {
    this.currentPath = typeof currentPath === 'string' ? SdfPath.fromString(currentPath) : currentPath
    this.newPath = typeof newPath === 'string' ? SdfPath.fromString(newPath) : newPath
    this.index = index
  }

  static remove(currentPath: SdfPath | string): SdfNamespaceEdit {
    return new SdfNamespaceEdit(currentPath, SdfPath.emptyPath)
  }

  static rename(currentPath: SdfPath | string, name: string): SdfNamespaceEdit {
    const path = typeof currentPath === 'string' ? SdfPath.fromString(currentPath) : currentPath
    return new SdfNamespaceEdit(path, path.replaceName(name), SdfNamespaceEdit.Same)
  }

  static reorder(currentPath: SdfPath | string, index: SdfNamespaceEditIndex): SdfNamespaceEdit {
    return new SdfNamespaceEdit(currentPath, currentPath, index)
  }

  static reparent(
    currentPath: SdfPath | string, newParentPath: SdfPath | string, index: SdfNamespaceEditIndex,
  ): SdfNamespaceEdit {
    const path = typeof currentPath === 'string' ? SdfPath.fromString(currentPath) : currentPath
    const parent = typeof newParentPath === 'string' ? SdfPath.fromString(newParentPath) : newParentPath
    return new SdfNamespaceEdit(path, path.replacePrefix(path.getParentPath(), parent), index)
  }

  static reparentAndRename(
    currentPath: SdfPath | string, newParentPath: SdfPath | string, name: string,
    index: SdfNamespaceEditIndex,
  ): SdfNamespaceEdit {
    const path = typeof currentPath === 'string' ? SdfPath.fromString(currentPath) : currentPath
    const parent = typeof newParentPath === 'string' ? SdfPath.fromString(newParentPath) : newParentPath
    return new SdfNamespaceEdit(path,
      path.replacePrefix(path.getParentPath(), parent).replaceName(name), index)
  }

  equals(rhs: SdfNamespaceEdit): boolean {
    return this.currentPath.equals(rhs.currentPath) && this.newPath.equals(rhs.newPath) &&
      this.index === rhs.index
  }

  toString(): string {
    if (this.equals(new SdfNamespaceEdit())) return '()'
    return `(${this.currentPath.pathString},${this.newPath.pathString},${this.index})`
  }
}

export enum SdfNamespaceEditDetailResult {
  Error, // Edit will fail.
  Unbatched, // Edit will succeed but not batched.
  Okay, // Edit will succeed as a batch.
}

export class SdfNamespaceEditDetail {
  static readonly Error = SdfNamespaceEditDetailResult.Error
  static readonly Unbatched = SdfNamespaceEditDetailResult.Unbatched
  static readonly Okay = SdfNamespaceEditDetailResult.Okay

  constructor(
    readonly result: SdfNamespaceEditDetailResult = SdfNamespaceEditDetailResult.Okay,
    readonly edit: SdfNamespaceEdit = new SdfNamespaceEdit(),
    readonly reason = '',
  ) {}

  equals(rhs: SdfNamespaceEditDetail): boolean {
    return this.result === rhs.result && this.edit.equals(rhs.edit) && this.reason === rhs.reason
  }
}

export function sdfCombineResult(
  lhs: SdfNamespaceEditDetailResult, rhs: SdfNamespaceEditDetailResult,
): SdfNamespaceEditDetailResult {
  return lhs < rhs ? lhs : rhs
}

export function sdfCombineError(_other: SdfNamespaceEditDetailResult): SdfNamespaceEditDetailResult {
  return SdfNamespaceEditDetailResult.Error
}

export function sdfCombineUnbatched(other: SdfNamespaceEditDetailResult): SdfNamespaceEditDetailResult {
  return sdfCombineResult(other, SdfNamespaceEditDetailResult.Unbatched)
}

// ---- SdfNamespaceEdit_Namespace (namespaceEdit.cpp:23-722) ----
//
// Tracks edits to a namespace without modifying it, mapping paths in the
// edited namespace back to the original namespace.

// A node key: '' for the root, 'N:' + name for prim and property children
// (and 'set=selection' for variant selections), 'T:' + path for target
// children.
function keyOf(path: SdfPath): string {
  if (path.isTargetPath()) return `T:${path.getTargetPath().pathString}`
  if (path.isPrimVariantSelectionPath()) {
    const [variantSet, variant] = path.getVariantSelection()
    return `N:${variantSet}=${variant}`
  }
  return `N:${path.name}`
}

class NamespaceNode {
  readonly children = new Map<string, NamespaceNode>()

  constructor(
    public key: string,
    public parent: NamespaceNode | null,
    readonly originalPath: SdfPath,
  ) {}

  getChild(path: SdfPath): NamespaceNode | undefined { return this.children.get(keyOf(path)) }

  findOrCreateChild(path: SdfPath): NamespaceNode {
    const key = keyOf(path)
    let child = this.children.get(key)
    if (!child) {
      child = new NamespaceNode(key, this,
        path.replacePrefix(path.getParentPath(), this.originalPath))
      this.children.set(key, child)
    }
    return child
  }

  findOrCreateTargetChild(target: SdfPath, originalTarget: SdfPath): [NamespaceNode, boolean] {
    const key = `T:${target.pathString}`
    let child = this.children.get(key)
    const created = !child
    if (!child) {
      child = new NamespaceNode(key, this, this.originalPath.appendTarget(originalTarget))
      this.children.set(key, child)
    }
    return [child, created]
  }

  // Whether the node was removed (key nodes are never in the tree).
  isRemoved(): boolean { return !this.parent && this.key !== '' }

  remove(): void {
    if (this.isRemoved()) throw new Error('Coding error: Node has no parent')
    if (!this.parent) throw new Error('Coding error: Removing root')
    if (this.parent.children.get(this.key) !== this) throw new Error('Coding error: Found wrong node by key')
    this.parent.children.delete(this.key)
    this.parent = null
  }

  reparent(node: NamespaceNode, path: SdfPath): void {
    const key = keyOf(path)
    if (this.children.has(key)) throw new Error('Coding error: Object with new path already exists')
    if (node.isRemoved()) throw new Error('Coding error: Object at path has been removed')
    node.remove()
    node.key = key
    this.children.set(key, node)
    node.parent = this
  }
}

class SdfNamespaceEdit_Namespace {
  private readonly _root = new NamespaceNode('', null, SdfPath.absoluteRootPath)
  // Paths removed and not reoccupied; no path in the set prefixes another.
  private readonly _deadspace = new Map<string, SdfPath>()
  // Back pointers to each target node keyed by its target path.
  private readonly _nodesWithPath = new Map<string, { path: SdfPath; nodes: Set<NamespaceNode> }>()

  constructor(private readonly _fixBackpointers: boolean) {}

  // The original path of the object now at path, creating nodes as needed;
  // the empty path in removed namespace.
  findOrCreateOriginalPath(path: SdfPath): SdfPath {
    return this._findOrCreateNodeAtPath(path)?.originalPath ?? SdfPath.emptyPath
  }

  getOriginalPath(path: SdfPath): SdfPath {
    return this._isDeadspace(path) ? SdfPath.emptyPath : this._uneditPath(path)
  }

  // Apply: removes, moves, or (for a reorder) ignores the edit.
  apply(edit: SdfNamespaceEdit): string | undefined {
    try {
      if (edit.newPath.isEmpty()) this._remove(edit.currentPath)
      else if (!edit.currentPath.equals(edit.newPath)) this._move(edit.currentPath, edit.newPath)
      return undefined
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  }

  private _uneditPath(path: SdfPath): SdfPath {
    let node = this._root
    for (const prefix of path.getPrefixes()) {
      const child = node.getChild(prefix)
      if (!child) return path.replacePrefix(prefix.getParentPath(), node.originalPath)
      node = child
    }
    return node.originalPath
  }

  private _getNodeAtPath(path: SdfPath): NamespaceNode | undefined {
    let node: NamespaceNode | undefined = this._root
    for (const prefix of path.getPrefixes()) {
      node = node.getChild(prefix)
      if (!node) break
    }
    return node
  }

  private _findOrCreateNodeAtPath(path: SdfPath): NamespaceNode | undefined {
    if (this._isDeadspace(path)) return undefined
    let node = this._root
    for (const prefix of path.getPrefixes()) {
      if (prefix.isTargetPath()) {
        const target = prefix.getTargetPath()
        const [child, created] = node.findOrCreateTargetChild(target, this._uneditPath(target))
        node = child
        if (created && this._fixBackpointers) this._addBackpointer(target, node)
      } else {
        node = node.findOrCreateChild(prefix)
      }
    }
    return node
  }

  private _remove(path: SdfPath): void {
    const node = this._getNodeAtPath(path)
    if (!node) throw new Error("Coding error: Object at path doesn't exist")
    node.remove()
    if (this._fixBackpointers) this._removeBackpointers(path)
    this._addDeadspace(path)
  }

  private _move(currentPath: SdfPath, newPath: SdfPath): void {
    const node = this._getNodeAtPath(currentPath)
    if (!node) throw new Error("Coding error: Object at path doesn't exist")
    const newParent = this._getNodeAtPath(newPath.getParentPath())
    if (!newParent) throw new Error("Coding error: New parent object doesn't exist")
    newParent.reparent(node, newPath)
    if (this._fixBackpointers) this._fixBackpointersFor(currentPath, newPath)
    this._moveDeadspaceDescendants(currentPath, newPath)
    // Add before removing in case this is a no-op move.
    this._addDeadspace(currentPath)
    this._removeDeadspace(newPath)
  }

  // _FixBackpointers: target nodes keyed by paths under currentPath follow
  // the move.
  private _fixBackpointersFor(currentPath: SdfPath, newPath: SdfPath): void {
    const moved = [...this._nodesWithPath.values()].filter(({ path }) => path.hasPrefix(currentPath))
    for (const { nodes } of moved) {
      for (const node of nodes) {
        const target = SdfPath.fromString(node.key.slice(2)).replacePrefix(currentPath, newPath, false)
        if (node.parent) {
          node.parent.children.delete(node.key)
          node.key = `T:${target.pathString}`
          node.parent.children.set(node.key, node)
        } else {
          node.key = `T:${target.pathString}`
        }
      }
    }
    for (const { path } of moved) this._nodesWithPath.delete(path.pathString)
    for (const { path, nodes } of moved) {
      const newKeyPath = path.replacePrefix(currentPath, newPath)
      this._nodesWithPath.set(newKeyPath.pathString, { path: newKeyPath, nodes })
    }
  }

  private _addBackpointer(path: SdfPath, node: NamespaceNode): void {
    let entry = this._nodesWithPath.get(path.pathString)
    if (!entry) {
      entry = { path, nodes: new Set() }
      this._nodesWithPath.set(path.pathString, entry)
    }
    entry.nodes.add(node)
  }

  private _removeBackpointers(path: SdfPath): void {
    for (const [key, { path: p }] of [...this._nodesWithPath]) {
      if (p.hasPrefix(path)) this._nodesWithPath.delete(key)
    }
  }

  private _addDeadspace(path: SdfPath): void {
    if (path.isAbsoluteRootPath()) return
    this._deadspace.set(path.pathString, path)
  }

  // Only the given path is removed; descendant deadspace remains.
  private _removeDeadspace(path: SdfPath): void {
    if (path.isAbsoluteRootPath()) return
    this._deadspace.delete(path.pathString)
  }

  private _moveDeadspaceDescendants(from: SdfPath, to: SdfPath): void {
    if (from.isAbsoluteRootPath() || to.isAbsoluteRootPath()) return
    const moved = [...this._deadspace.values()].filter(path => path.hasPrefix(from))
    for (const path of moved) this._deadspace.delete(path.pathString)
    for (const path of moved) {
      const newPath = path.replacePrefix(from, to)
      this._deadspace.set(newPath.pathString, newPath)
    }
  }

  private _isDeadspace(path: SdfPath): boolean {
    for (const dead of this._deadspace.values()) if (path.hasPrefix(dead)) return true
    return false
  }
}

export type SdfHasObjectAtPath = (path: SdfPath) => boolean
// Returns undefined when the edit is allowed, else the reason it is not.
export type SdfCanEdit = (edit: SdfNamespaceEdit) => string | undefined

// SdfBatchNamespaceEdit: a sequence of namespace edits.
export class SdfBatchNamespaceEdit {
  private readonly _edits: SdfNamespaceEdit[]

  constructor(edits: Iterable<SdfNamespaceEdit> = []) {
    this._edits = [...edits]
  }

  add(edit: SdfNamespaceEdit): void
  add(currentPath: SdfPath | string, newPath: SdfPath | string, index?: SdfNamespaceEditIndex): void
  add(
    editOrPath: SdfNamespaceEdit | SdfPath | string, newPath?: SdfPath | string,
    index: SdfNamespaceEditIndex = SdfNamespaceEdit.AtEnd,
  ): void {
    this._edits.push(editOrPath instanceof SdfNamespaceEdit
      ? editOrPath : new SdfNamespaceEdit(editOrPath, newPath ?? SdfPath.emptyPath, index))
  }

  getEdits(): readonly SdfNamespaceEdit[] { return this._edits }

  // SdfBatchNamespaceEdit::Process (namespaceEdit.cpp:818-1070): validates
  // the edits in sequence against a simulated namespace. Returns the
  // processed edits, or undefined with the failure appended to details.
  process(
    hasObjectAtPath: SdfHasObjectAtPath | undefined, canEdit: SdfCanEdit | undefined,
    details?: SdfNamespaceEditDetail[], fixBackpointers = true,
  ): SdfNamespaceEdit[] | undefined {
    const processed: SdfNamespaceEdit[] = []
    const ns = new SdfNamespaceEdit_Namespace(fixBackpointers)
    const fail = (edit: SdfNamespaceEdit, reason: string): undefined => {
      details?.push(new SdfNamespaceEditDetail(SdfNamespaceEditDetailResult.Error, edit, reason))
      return undefined
    }
    for (const edit of this._edits) {
      // Make sure paths are compatible.
      let mismatch: boolean
      if (edit.currentPath.isPrimPath()) mismatch = !edit.newPath.isPrimPath()
      else if (edit.currentPath.isPropertyPath()) mismatch = !edit.newPath.isPropertyPath()
      else return fail(edit, 'Unsupported object type')
      if (mismatch && !edit.newPath.isEmpty()) return fail(edit, 'Path type mismatch')

      // The original path of the object now at edit.currentPath.
      const from = ns.findOrCreateOriginalPath(edit.currentPath)
      // Removed namespace can't be edited, except to remove it again.
      if (from.isEmpty()) {
        if (edit.newPath.isEmpty()) continue
        return fail(edit, 'Object was removed')
      }
      if (hasObjectAtPath && !hasObjectAtPath(from)) return fail(edit, 'Object does not exist')

      let to = SdfPath.emptyPath
      if (!edit.newPath.isEmpty()) {
        // Ignore no-ops.
        if (edit.currentPath.equals(edit.newPath) && edit.index === SdfNamespaceEdit.Same) continue
        const newParent = edit.newPath.getParentPath()
        const toParent = ns.findOrCreateOriginalPath(newParent)
        if (toParent.isEmpty()) return fail(edit, 'New parent was removed')
        if (hasObjectAtPath && !hasObjectAtPath(toParent)) return fail(edit, 'New parent does not exist')
        if (edit.currentPath.equals(edit.newPath)) {
          // Ignore reordering.
        } else if (edit.currentPath.hasPrefix(edit.newPath)) {
          return fail(edit, 'Object cannot be an ancestor of itself')
        } else if (edit.newPath.hasPrefix(edit.currentPath)) {
          return fail(edit, 'Object cannot be a descendant of itself')
        } else {
          // Can't move over an existing object.
          const existing = ns.getOriginalPath(edit.newPath)
          if (!existing.isEmpty() && hasObjectAtPath && hasObjectAtPath(existing)) {
            return fail(edit, 'Object already exists')
          }
        }
        to = edit.newPath.replacePrefix(newParent, toParent)
      }

      if (!fixBackpointers) {
        for (const targetPath of edit.currentPath.getAllTargetPathsRecursively()) {
          const originalPath = ns.getOriginalPath(targetPath)
          if (!originalPath.isEmpty() && !originalPath.equals(targetPath)) {
            return fail(edit, 'Current target was edited')
          }
        }
        for (const targetPath of edit.newPath.getAllTargetPathsRecursively()) {
          const originalPath = ns.getOriginalPath(targetPath)
          if (!originalPath.isEmpty() && !originalPath.equals(targetPath)) {
            return fail(edit, 'New target was edited')
          }
        }
      }

      // Check that the actual edit is allowed.
      const whyNot = canEdit?.(new SdfNamespaceEdit(from, to, edit.index))
      if (whyNot !== undefined) return fail(edit, whyNot)

      const applyError = ns.apply(edit)
      if (applyError !== undefined) return fail(edit, applyError)
      processed.push(edit)
    }
    return processed
  }
}
