// Ported from OpenUSD 26.11.1: pxr/usd/sdf/identity.cpp,
//  pxr/usd/sdf/identity.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/sdf/identity.{h,cpp}: the identity a spec handle holds — a
// layer and a path that follows the spec when it moves in namespace.

import { SdfPath } from './path.ts'

export class Sdf_Identity {
  constructor(private _layer: unknown, private _path: SdfPath) {}

  getLayer<L>(): L | null { return this._layer as L | null }
  getPath(): SdfPath { return this._path }

  /** @internal Sdf_IdentityRegistry::MoveIdentity. */
  _setPath(path: SdfPath): void { this._path = path }

  /** @internal Sdf_Identity::_Forget: the identity no longer names a spec. */
  _forget(path: SdfPath): void {
    this._layer = null
    this._path = path
  }

  // Spec handles of each class made for this identity, so handles to the same
  // spec compare identical.
  /** @internal */ readonly _handles = new Map<Function, object>()
}

// Sdf_IdentityRegistry (identity.cpp:30-216). Identities are held weakly; a
// spec handle keeps its identity alive.
export class Sdf_IdentityRegistry {
  private readonly _ids = new Map<string, WeakRef<Sdf_Identity>>()
  private readonly _finalizer = new FinalizationRegistry<string>(key => {
    const ref = this._ids.get(key)
    if (ref && ref.deref() === undefined) this._ids.delete(key)
  })

  constructor(private readonly _layer: unknown) {}

  identify(path: SdfPath): Sdf_Identity {
    const key = path.pathString
    const existing = this._ids.get(key)?.deref()
    if (existing) return existing
    const identity = new Sdf_Identity(this._layer, path)
    this._ids.set(key, new WeakRef(identity))
    this._finalizer.register(identity, key)
    return identity
  }

  moveIdentity(oldPath: SdfPath, newPath: SdfPath): void {
    const oldKey = oldPath.pathString
    const identity = this._ids.get(oldKey)?.deref()
    if (!identity) return
    // An identity already at the new path is stomped.
    const newKey = newPath.pathString
    const stomped = this._ids.get(newKey)?.deref()
    if (stomped) stomped._forget(SdfPath.emptyPath)
    this._ids.delete(oldKey)
    identity._setPath(newPath)
    this._ids.set(newKey, new WeakRef(identity))
    this._finalizer.register(identity, newKey)
  }
}
