// Ported from OpenUSD 26.11.1: pxr/usd/sdf/proxyTypes.cpp,
//  pxr/usd/sdf/proxyTypes.h, pxr/usd/sdf/proxyPolicies.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ports of pxr/usd/sdf/proxyTypes.{h,cpp} and proxyPolicies.h: the type
// policies of list editing proxies and the factories that make the proxies
// for a spec's fields.

import {
  Sdf_ListOpListEditor, Sdf_VectorListEditor, sdfAttributeConnectionListEditor,
  sdfRelationshipTargetListEditor, type SdfListTypePolicy,
} from './listEditor.ts'
import { SdfListEditorProxy, SdfListProxy } from './listProxy.ts'
import { SdfPath } from './path.ts'
import { SdfPayload, SdfReference } from './reference.ts'
import type { SdfSpec } from './spec.ts'

// SdfNameKeyPolicy / SdfNameTokenKeyPolicy: names as they are.
export const sdfNameKeyPolicy: SdfListTypePolicy<string> = {
  canonicalize: value => String(value),
  equals: (a, b) => a === b,
  fromStored: value => String(value),
}

// SdfPathKeyPolicy (proxyPolicies.h:66-107): paths made absolute against the
// owner's prim path. Paths are stored as strings.
export function sdfPathKeyPolicy(owner?: SdfSpec): SdfListTypePolicy<string> {
  const anchor = (): SdfPath => {
    if (!owner || owner.isDormant()) return SdfPath.absoluteRootPath
    const primPath = owner.getPath().getPrimPath()
    return primPath.isEmpty() ? SdfPath.absoluteRootPath : primPath
  }
  return {
    canonicalize: value => {
      const path = (value as unknown) instanceof SdfPath
        ? value as unknown as SdfPath : SdfPath.fromString(String(value))
      return path.isEmpty() ? '' : path.makeAbsolutePath(anchor()).pathString
    },
    equals: (a, b) => a === b,
    fromStored: value => (value instanceof SdfPath ? value.pathString : String(value)),
  }
}

// SdfReferenceTypePolicy / SdfPayloadTypePolicy.
export const sdfReferenceTypePolicy: SdfListTypePolicy<SdfReference> = {
  canonicalize: value => SdfReference._from(value),
  equals: (a, b) => SdfReference._from(a).equals(b),
  fromStored: value => SdfReference._from(value),
}

export const sdfPayloadTypePolicy: SdfListTypePolicy<SdfPayload> = {
  canonicalize: value => SdfPayload._from(value),
  equals: (a, b) => SdfPayload._from(a).equals(b),
  fromStored: value => SdfPayload._from(value),
}

// SdfSubLayerTypePolicy.
export const sdfSubLayerTypePolicy: SdfListTypePolicy<string> = sdfNameKeyPolicy

export type SdfNameEditorProxy = SdfListEditorProxy<string>
export type SdfPathEditorProxy = SdfListEditorProxy<string>
export type SdfReferenceEditorProxy = SdfListEditorProxy<SdfReference>
export type SdfPayloadEditorProxy = SdfListEditorProxy<SdfPayload>
export type SdfNameOrderProxy = SdfListProxy<string>

export function sdfGetNameEditorProxy(owner: SdfSpec | undefined, field: string): SdfNameEditorProxy {
  return new SdfListEditorProxy(new Sdf_ListOpListEditor(owner, field, sdfNameKeyPolicy))
}

export function sdfGetPathEditorProxy(owner: SdfSpec | undefined, field: string): SdfPathEditorProxy {
  const policy = sdfPathKeyPolicy(owner)
  if (field === 'targetPaths') return new SdfListEditorProxy(sdfRelationshipTargetListEditor(owner, policy))
  if (field === 'connectionPaths') return new SdfListEditorProxy(sdfAttributeConnectionListEditor(owner, policy))
  return new SdfListEditorProxy(new Sdf_ListOpListEditor(owner, field, policy))
}

export function sdfGetReferenceEditorProxy(owner: SdfSpec | undefined, field: string): SdfReferenceEditorProxy {
  return new SdfListEditorProxy(new Sdf_ListOpListEditor(owner, field, sdfReferenceTypePolicy))
}

export function sdfGetPayloadEditorProxy(owner: SdfSpec | undefined, field: string): SdfPayloadEditorProxy {
  return new SdfListEditorProxy(new Sdf_ListOpListEditor(owner, field, sdfPayloadTypePolicy))
}

// SdfGetNameOrderProxy (proxyTypes.cpp:135-146).
export function sdfGetNameOrderProxy(spec: SdfSpec | undefined, orderField: string): SdfNameOrderProxy {
  if (!spec) return new SdfListProxy<string>(undefined, 'ordered')
  return new SdfListProxy(new Sdf_VectorListEditor(spec, orderField, 'ordered', sdfNameKeyPolicy), 'ordered')
}
