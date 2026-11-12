// Ported from OpenUSD 26.11.1: pxr/usd/sdf/layerStateDelegate.cpp,
//  pxr/usd/sdf/layerStateDelegate.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/sdf/layerStateDelegate.h — the layer-mutation observation
// hook DCCs build undo systems on. Every authoring write on a layer routes
// through its state delegate, and the _On* callbacks fire BEFORE the data
// changes, so a recording delegate can read the outgoing value through
// _GetLayer() and store an invertible edit. typescript-usd ships only the hook and
// the default dirty-tracking delegate (SdfSimpleLayerStateDelegate); undo
// stacks, grouping, and UX are application code.
//
// Deviation from upstream noted: upstream's public Set*/Create* methods also
// perform the data write through _GetLayerData(); here the write stays in
// the Layer (the notification order is identical), so the delegate never
// touches layer internals.

import type { SdfSpecType } from './abstractData.ts'

export type { SdfSpecType } from './abstractData.ts'

// The slice of the layer the delegate can see — SdfLayer itself lives in
// typescript-usd/usd, which depends on this package. Enumeration methods mirror
// SdfLayer::ListFields / Traverse, which recording delegates need to
// snapshot a spec subtree before it is deleted.
export interface SdfLayerAccess {
  readonly filePath: string
  getField(specPath: string, fieldName: string): unknown
  getFieldNames(specPath: string): string[]
  getSpecPaths(): string[]
  // Spec removal — privileged delegate-surface access (upstream keeps
  // _DeleteSpec private and grants it to the state delegate); undo systems
  // applying inverse edits are the intended caller.
  _deleteSpec(specPath: string): void
}

export class SdfLayerStateDelegateBase {
  private _layer: SdfLayerAccess | null = null

  // ---- Public API (called by the layer's write path) ----

  isDirty(): boolean {
    return this._isDirty()
  }

  markCurrentStateAsClean(): void {
    this._markCurrentStateAsClean()
  }

  markCurrentStateAsDirty(): void {
    this._markCurrentStateAsDirty()
  }

  /** @internal Invoked by Layer.setStateDelegate. */
  _setLayer(layer: SdfLayerAccess | null): void {
    this._layer = layer
    this._onSetLayer(layer)
  }

  /** @internal Fired by the layer immediately BEFORE each write. */
  setField(path: string, fieldName: string, value: unknown): void {
    this._onSetField(path, fieldName, value)
  }

  /** @internal */
  setTimeSample(path: string, time: number, value: unknown): void {
    this._onSetTimeSample(path, time, value)
  }

  /** @internal */
  createSpec(path: string, specType: SdfSpecType): void {
    this._onCreateSpec(path, specType)
  }

  /** @internal */
  deleteSpec(path: string): void {
    this._onDeleteSpec(path)
  }

  /** @internal */
  moveSpec(oldPath: string, newPath: string): void {
    this._onMoveSpec(oldPath, newPath)
  }

  /** @internal */
  pushChild(parentPath: string, fieldName: string, value: string): void {
    this._onPushChild(parentPath, fieldName, value)
  }

  /** @internal */
  popChild(parentPath: string, fieldName: string, oldValue: string): void {
    this._onPopChild(parentPath, fieldName, oldValue)
  }

  // ---- Subclass interface (mirrors upstream's protected virtuals) ----

  // The layer associated with this delegate (null when detached).
  protected _getLayer(): SdfLayerAccess | null {
    return this._layer
  }

  // True if the layer has been authored to since it was last marked clean.
  protected _isDirty(): boolean {
    return false
  }

  protected _markCurrentStateAsClean(): void {}
  protected _markCurrentStateAsDirty(): void {}

  // Invoked when the delegate is associated with (or removed from) a layer.
  protected _onSetLayer(_layer: SdfLayerAccess | null): void {}

  // Invoked when a field is being changed on the associated layer.
  protected _onSetField(_path: string, _fieldName: string, _value: unknown): void {}

  // Invoked when a time sample is being changed on the associated layer.
  protected _onSetTimeSample(_path: string, _time: number, _value: unknown): void {}

  // Invoked when a new spec is created on the associated layer.
  protected _onCreateSpec(_path: string, _specType: SdfSpecType): void {}

  // Invoked when a spec and its children are deleted.
  protected _onDeleteSpec(_path: string): void {}

  // Invoked when a spec and its children are moved.
  protected _onMoveSpec(_oldPath: string, _newPath: string): void {}

  // Invoked when a child is pushed onto a parent's children list
  // (primChildren / properties).
  protected _onPushChild(_parentPath: string, _fieldName: string, _value: string): void {}

  // Invoked when a child is popped off a parent's children list.
  protected _onPopChild(_parentPath: string, _fieldName: string, _oldValue: string): void {}
}

// Mirrors SdfSimpleLayerStateDelegate — the default delegate every layer
// gets: pure dirty-state tracking.
export class SdfSimpleLayerStateDelegate extends SdfLayerStateDelegateBase {
  private _dirty = false

  protected override _isDirty(): boolean { return this._dirty }
  protected override _markCurrentStateAsClean(): void { this._dirty = false }
  protected override _markCurrentStateAsDirty(): void { this._dirty = true }

  protected override _onSetField(): void { this._dirty = true }
  protected override _onSetTimeSample(): void { this._dirty = true }
  protected override _onCreateSpec(): void { this._dirty = true }
  protected override _onDeleteSpec(): void { this._dirty = true }
  protected override _onMoveSpec(): void { this._dirty = true }
  protected override _onPushChild(): void { this._dirty = true }
  protected override _onPopChild(): void { this._dirty = true }
}
