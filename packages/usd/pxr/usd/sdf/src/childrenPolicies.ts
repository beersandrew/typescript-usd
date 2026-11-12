// Ported from OpenUSD 26.11.1: pxr/usd/sdf/childrenPolicies.cpp,
//  pxr/usd/sdf/childrenPolicies.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/sdf/childrenPolicies.h: how each kind of child spec is
// keyed, where it lives in namespace, and which children field of its parent
// lists it. Children fields hold names (prims, properties, variant sets,
// variants) or target paths (relationship targets, connections) as strings.

import { SdfPath } from './path.ts'
import { SdfSchema } from './schema.ts'

export interface Sdf_ChildPolicy {
  // The children field of the parent (GetChildrenToken).
  readonly childrenKey: string
  // Whether children are keyed by path (targets, connections, mappers).
  readonly keyIsPath: boolean
  getChildPath(parentPath: SdfPath, key: string): SdfPath
  getParentPath(childPath: SdfPath): SdfPath
  // The child's entry in its parent's children field (GetFieldValue).
  getFieldValue(childPath: SdfPath): string
  isValidIdentifier(name: string): boolean
}

// Sdf_TokenChildPolicy: children keyed by name.
function tokenChildPolicy(
  childrenKey: string,
  getChildPath: (parentPath: SdfPath, key: string) => SdfPath,
  isValidIdentifier: (name: string) => boolean = name => SdfSchema.isValidIdentifier(name).isAllowed(),
): Sdf_ChildPolicy {
  return {
    childrenKey,
    keyIsPath: false,
    getChildPath,
    getParentPath: childPath => childPath.getParentPath(),
    getFieldValue: childPath => childPath.name,
    isValidIdentifier,
  }
}

const isValidNamespacedIdentifier = (name: string): boolean =>
  SdfSchema.isValidNamespacedIdentifier(name).isAllowed()

// A property beneath a relationship target is a relational attribute.
const propertyChildPath = (parentPath: SdfPath, key: string): SdfPath =>
  parentPath.appendProperty(key)

export const Sdf_PrimChildPolicy: Sdf_ChildPolicy = tokenChildPolicy(
  'primChildren', (parentPath, key) => parentPath.appendChild(key))

export const Sdf_PropertyChildPolicy: Sdf_ChildPolicy = tokenChildPolicy(
  'properties', propertyChildPath, isValidNamespacedIdentifier)

export const Sdf_AttributeChildPolicy: Sdf_ChildPolicy = tokenChildPolicy(
  'properties', propertyChildPath, isValidNamespacedIdentifier)

export const Sdf_RelationshipChildPolicy: Sdf_ChildPolicy = tokenChildPolicy(
  'properties', propertyChildPath, isValidNamespacedIdentifier)

export const Sdf_VariantSetChildPolicy: Sdf_ChildPolicy = tokenChildPolicy(
  'variantSetChildren', (parentPath, key) => parentPath.appendVariantSelection(key, ''))

// Sdf_MapperArgChildPolicy (childrenPolicies.h:137-149): mapper args are
// children of their mapper spec, keyed by name.
export const Sdf_MapperArgChildPolicy: Sdf_ChildPolicy = tokenChildPolicy(
  'mapperArgChildren', (parentPath, key) => parentPath.appendMapperArg(key))

// Sdf_ExpressionChildPolicy (childrenPolicies.h:151-161): an attribute's one
// expression child, whose key is ignored.
export const Sdf_ExpressionChildPolicy: Sdf_ChildPolicy = tokenChildPolicy(
  'expressionChildren', parentPath => parentPath.appendExpression())

// Variants are children of their variant set spec /A{set=}, and live at
// /A{set=variant}.
export const Sdf_VariantChildPolicy: Sdf_ChildPolicy = {
  childrenKey: 'variantChildren',
  keyIsPath: false,
  getChildPath: (parentPath, key) => {
    const [variantSet] = parentPath.getVariantSelection()
    return parentPath.getParentPath().appendVariantSelection(variantSet, key)
  },
  getParentPath: childPath => {
    const [variantSet] = childPath.getVariantSelection()
    return childPath.getParentPath().appendVariantSelection(variantSet, '')
  },
  getFieldValue: childPath => childPath.getVariantSelection()[1],
  isValidIdentifier: name => SdfSchema.isValidIdentifier(name).isAllowed(),
}

// Sdf_PathChildPolicy: children keyed by target path.
function pathChildPolicy(childrenKey: string): Sdf_ChildPolicy {
  return {
    childrenKey,
    keyIsPath: true,
    getChildPath: (parentPath, key) => parentPath.appendTarget(SdfPath.fromString(key)),
    getParentPath: childPath => childPath.getParentPath(),
    getFieldValue: childPath => childPath.getTargetPath().pathString,
    isValidIdentifier: path => SdfPath.isValidPathString(path),
  }
}

// Sdf_MapperChildPolicy (childrenPolicies.h:238-256): mappers are keyed by
// their connection target path, made absolute against the owning prim.
export const Sdf_MapperChildPolicy: Sdf_ChildPolicy = {
  ...pathChildPolicy('mapperChildren'),
  getChildPath: (parentPath, key) => {
    const targetPath = SdfPath.fromString(key).makeAbsolutePath(parentPath.getPrimPath())
    return parentPath.appendMapper(targetPath)
  },
  getFieldValue: childPath => {
    const targetPath = childPath.getTargetPath()
    return targetPath.makeAbsolutePath(childPath.getPrimPath()).pathString
  },
}

export const Sdf_AttributeConnectionChildPolicy: Sdf_ChildPolicy = pathChildPolicy('connectionChildren')

export const Sdf_RelationshipTargetChildPolicy: Sdf_ChildPolicy = pathChildPolicy('targetChildren')

/** @internal The policy SdfLayer::Traverse uses for a children field (layer.cpp:4920-4944). */
export function sdfChildPolicyForField(fieldName: string): Sdf_ChildPolicy | undefined {
  switch (fieldName) {
    case 'primChildren': return Sdf_PrimChildPolicy
    case 'properties': return Sdf_PropertyChildPolicy
    case 'mapperChildren': return Sdf_MapperChildPolicy
    case 'mapperArgChildren': return Sdf_MapperArgChildPolicy
    case 'variantChildren': return Sdf_VariantChildPolicy
    case 'variantSetChildren': return Sdf_VariantSetChildPolicy
    case 'connectionChildren': return Sdf_AttributeConnectionChildPolicy
    case 'targetChildren': return Sdf_RelationshipTargetChildPolicy
    case 'expressionChildren': return Sdf_ExpressionChildPolicy
    default: return undefined
  }
}
