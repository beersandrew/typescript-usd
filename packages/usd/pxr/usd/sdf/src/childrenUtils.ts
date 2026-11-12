// Ported from OpenUSD 26.11.1: pxr/usd/sdf/childrenUtils.cpp,
//  pxr/usd/sdf/childrenUtils.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/sdf/childrenUtils.{h,cpp}: creating, reparenting,
// renaming and removing child specs, keeping each parent's children field
// in step with the specs in the layer.

import { Error as TfError, TfDiagnosticType } from 'typescript-usd/tf'
import type { SdfSpecType } from './abstractData.ts'
import { SdfAllowed } from './allowed.ts'
import { sdfChangeBlock } from './changeManager.ts'
import type { Sdf_ChildPolicy } from './childrenPolicies.ts'
import { Sdf_CleanupTracker } from './cleanupTracker.ts'
import type { Layer } from './layer.ts'
import { SdfPath } from './path.ts'
import type { SdfSpec } from './spec.ts'

// SdfNamespaceEdit::AtEnd and ::Same.
export const SDF_NAMESPACE_EDIT_AT_END = -1
export const SDF_NAMESPACE_EDIT_SAME = -2

function codingError(message: string): never {
  throw new TfError(message, TfDiagnosticType.CodingError)
}

function childNames(layer: Layer, path: SdfPath, childrenKey: string): string[] {
  const names = layer.getField(path.pathString, childrenKey)
  return Array.isArray(names) ? names.map(String) : []
}

// The key of a child spec (ChildPolicy::GetKey).
function keyOf(policy: Sdf_ChildPolicy, spec: SdfSpec): string {
  return policy.getFieldValue(spec.getPath())
}

// Sets the parent's children field, or erases it when empty.
function setChildNames(layer: Layer, path: SdfPath, childrenKey: string, names: string[]): void {
  if (names.length === 0) layer.eraseField(path.pathString, childrenKey)
  else layer.setField(path.pathString, childrenKey, names)
}

// _ComputeMovedPath: path with newName appended, or empty for an invalid name.
function computeMovedPath(policy: Sdf_ChildPolicy, path: SdfPath, newName: string): SdfPath {
  if (!policy.keyIsPath && !policy.isValidIdentifier(newName)) return SdfPath.emptyPath
  return policy.getChildPath(path, newName)
}

export const Sdf_ChildrenUtils = {
  // CreateSpec (childrenUtils.cpp:62-93).
  createSpec(
    policy: Sdf_ChildPolicy, layer: Layer, childPath: SdfPath, specType: SdfSpecType, inert = true,
  ): boolean {
    if (specType === 'unknown') codingError('Invalid object type')
    return sdfChangeBlock(() => {
      if (!layer._createSpec(childPath.pathString, specType, inert)) {
        codingError(`Failed to create spec of type '${specType}' at <${childPath.pathString}>`)
      }
      // _CreateSpec fails for a duplicate spec, so the child can be appended.
      const parentPath = policy.getParentPath(childPath)
      layer._primPushChild(parentPath.pathString, policy.childrenKey, policy.getFieldValue(childPath))
      return true
    })
  },

  // SetChildren (childrenUtils.cpp:120-259).
  setChildren(policy: Sdf_ChildPolicy, layer: Layer, path: SdfPath, origValues: readonly SdfSpec[]): boolean {
    const childrenKey = policy.childrenKey
    // Duplicate values that are already children of path are no-ops
    // (_FilterDuplicatePreexistingChildren).
    const keySet = new Set<string>()
    const values: SdfSpec[] = []
    for (const value of origValues) {
      const key = keyOf(policy, value)
      if (keySet.has(key) && value.getPath().getParentPath().equals(path)) continue
      keySet.add(key)
      values.push(value)
    }

    const names = childNames(layer, path, childrenKey)
    const newNamesSet = new Set<string>()
    const newNames: string[] = []
    for (const value of values) {
      const key = keyOf(policy, value)
      newNames.push(key)
      if (newNamesSet.has(key)) codingError('Duplicate child')
      newNamesSet.add(key)
      if (value.getLayer() !== layer) codingError('Cannot reparent to another layer')
      // Inserting a parent of the desired spec path is an error, unless the
      // value is already a child of path.
      if (!path.equals(value.getPath().getParentPath()) && path.hasPrefix(value.getPath())) {
        codingError('Cannot reparent child under itself')
      }
    }

    return sdfChangeBlock(() => {
      // Delete specs that aren't in the new set.
      for (const name of names) {
        if (!newNamesSet.has(name)) layer._deleteSpec(policy.getChildPath(path, name).pathString)
      }
      const oldKeys = new Set(names)
      for (const value of values) {
        const key = keyOf(policy, value)
        const newPath = policy.getChildPath(path, key)
        // A value already a child needs no edit.
        const oldParentPath = policy.getParentPath(value.getPath())
        if (oldParentPath.equals(path)) continue
        // Replace any spec previously at that path.
        if (oldKeys.has(key)) layer._deleteSpec(newPath.pathString)
        // Remove the spec from its old parent, then move it.
        const oldSiblings = childNames(layer, oldParentPath, policy.childrenKey)
        const index = oldSiblings.indexOf(key)
        if (index < 0) codingError("An object was not in its parent's list of children")
        oldSiblings.splice(index, 1)
        setChildNames(layer, oldParentPath, policy.childrenKey, oldSiblings)
        layer._moveSpec(value.getPath().pathString, newPath.pathString)
      }
      setChildNames(layer, path, childrenKey, newNames)
      return true
    })
  },

  // InsertChild (childrenUtils.cpp:261-358).
  insertChild(policy: Sdf_ChildPolicy, layer: Layer, path: SdfPath, value: SdfSpec, index = -1): boolean {
    const childrenKey = policy.childrenKey
    if (value.getLayer() !== layer) codingError('Cannot reparent to another layer')
    // Inserting a value that is already a child is a no-op, at any index.
    if (policy.getParentPath(value.getPath()).equals(path)) return true
    const key = keyOf(policy, value)
    const newPath = policy.getChildPath(path, key)
    if (newPath.hasPrefix(value.getPath())) codingError('Cannot reparent child under itself')
    const names = childNames(layer, path, childrenKey)
    if (index === -1) index = names.length
    if (index < 0 || index > names.length) {
      codingError(`Attempt to insert spec ${newPath.pathString} at an invalid index ${index}`)
    }
    if (names.includes(key)) codingError(`Attempt to insert duplicate spec ${newPath.pathString}`)
    const oldParentPath = policy.getParentPath(value.getPath())
    const oldSiblingNames = childNames(layer, oldParentPath, policy.childrenKey)
    const oldIndex = oldSiblingNames.indexOf(key)
    if (oldIndex < 0) codingError("An object was not in its parent's list of children")
    return sdfChangeBlock(() => {
      oldSiblingNames.splice(oldIndex, 1)
      setChildNames(layer, oldParentPath, policy.childrenKey, oldSiblingNames)
      layer._moveSpec(value.getPath().pathString, newPath.pathString)
      names.splice(index, 0, key)
      layer.setField(path.pathString, childrenKey, names)
      // The old parent may be left inert.
      const oldParent = layer.getObjectAtPath(oldParentPath)
      if (oldParent) Sdf_CleanupTracker.getInstance().addSpecIfTracking(oldParent)
      return true
    })
  },

  // RemoveChild (childrenUtils.cpp:360-395).
  removeChild(policy: Sdf_ChildPolicy, layer: Layer, path: SdfPath, key: string): boolean {
    const childrenKey = policy.childrenKey
    const names = childNames(layer, path, childrenKey)
    const index = names.indexOf(key)
    if (index < 0) return false
    return sdfChangeBlock(() => {
      layer._deleteSpec(policy.getChildPath(path, key).pathString)
      names.splice(index, 1)
      setChildNames(layer, path, childrenKey, names)
      // The parent may be left inert.
      const parent = layer.getObjectAtPath(path)
      if (parent) Sdf_CleanupTracker.getInstance().addSpecIfTracking(parent)
      return true
    })
  },

  // MoveChildForBatchNamespaceEdit (childrenUtils.cpp:397-490).
  moveChildForBatchNamespaceEdit(
    policy: Sdf_ChildPolicy, layer: Layer, path: SdfPath, value: SdfSpec, newName: string, index: number,
  ): boolean {
    const childrenKey = policy.childrenKey
    const newPath = computeMovedPath(policy, path, newName)
    if (newPath.equals(value.getPath()) && index === SDF_NAMESPACE_EDIT_SAME) return true
    const names = childNames(layer, path, childrenKey)
    const oldKey = keyOf(policy, value)
    const oldParentPath = policy.getParentPath(value.getPath())
    if (index === SDF_NAMESPACE_EDIT_SAME && oldParentPath.equals(path)) {
      index = names.indexOf(oldKey)
    } else if (index < 0 || index > names.length) {
      // This catches all negative indexes.
      index = names.length
    }
    const oldSiblingNames = childNames(layer, oldParentPath, policy.childrenKey)
    const oldIndex = oldSiblingNames.indexOf(oldKey)
    return sdfChangeBlock(() => {
      if (oldParentPath.equals(path)) {
        // Bail early if the child neither moves nor changes name.
        if (oldKey === newName && (oldIndex === index || oldIndex + 1 === index)) return true
        // Removing an earlier name shifts the index down.
        if (oldIndex < index) --index
        names.splice(names.indexOf(oldKey), 1)
      } else {
        oldSiblingNames.splice(oldIndex, 1)
        if (oldSiblingNames.length === 0) {
          layer.eraseField(oldParentPath.pathString, policy.childrenKey)
          // The old parent may be left inert.
          const oldParent = layer.getObjectAtPath(oldParentPath)
          if (oldParent) Sdf_CleanupTracker.getInstance().addSpecIfTracking(oldParent)
        } else {
          layer.setField(oldParentPath.pathString, policy.childrenKey, oldSiblingNames)
        }
      }
      layer._moveSpec(value.getPath().pathString, newPath.pathString)
      names.splice(index, 0, newName)
      layer.setField(path.pathString, childrenKey, names)
      return true
    })
  },

  // CanMoveChildForBatchNamespaceEdit (childrenUtils.cpp:492-597).
  canMoveChildForBatchNamespaceEdit(
    policy: Sdf_ChildPolicy, layer: Layer, path: SdfPath, value: SdfSpec | undefined,
    newName: string, index: number,
  ): SdfAllowed {
    if (!layer.permissionToEdit()) return new SdfAllowed('Layer is not editable')
    if (!value) return new SdfAllowed('Object does not exist')
    if (value.getLayer() !== layer) return new SdfAllowed('Cannot reparent to another layer')
    const newPath = computeMovedPath(policy, path, newName)
    if (newPath.isEmpty()) return new SdfAllowed('Invalid name')
    // Renaming to the same name or reordering will work.
    if (policy.getParentPath(value.getPath()).equals(path)) return SdfAllowed.allowed()
    if (newPath.hasPrefix(value.getPath())) return new SdfAllowed('Cannot reparent object under itself')
    const names = childNames(layer, path, policy.childrenKey)
    if (index === SDF_NAMESPACE_EDIT_AT_END) index = names.length
    if (index !== SDF_NAMESPACE_EDIT_SAME && (index < 0 || index > names.length)) {
      return new SdfAllowed('Invalid index')
    }
    // The invariant that a parent has its children.
    const oldParentPath = policy.getParentPath(value.getPath())
    if (!childNames(layer, oldParentPath, policy.childrenKey).includes(keyOf(policy, value))) {
      return new SdfAllowed("Coding error: Object is not in its parent's children")
    }
    return SdfAllowed.allowed()
  },

  // CanRemoveChildForBatchNamespaceEdit (childrenUtils.cpp:599-627).
  canRemoveChildForBatchNamespaceEdit(
    policy: Sdf_ChildPolicy, layer: Layer, path: SdfPath, key: string,
  ): SdfAllowed {
    if (!layer.permissionToEdit()) return new SdfAllowed('Layer is not editable')
    if (!childNames(layer, path, policy.childrenKey).includes(key)) {
      return new SdfAllowed('Object does not exist')
    }
    return SdfAllowed.allowed()
  },

  isValidName(policy: Sdf_ChildPolicy, name: string): boolean {
    return policy.isValidIdentifier(name)
  },

  // CanRename (childrenUtils.cpp:643-665).
  canRename(policy: Sdf_ChildPolicy, spec: SdfSpec, newName: string): SdfAllowed {
    if (policy.keyIsPath) codingError(cannotRenameMessage(policy))
    if (!spec.getLayer().permissionToEdit()) return new SdfAllowed('Layer is not editable')
    if (!policy.isValidIdentifier(newName)) {
      return new SdfAllowed(`Cannot rename ${spec.getPath().pathString} to invalid name '${newName}'`)
    }
    const newPath = policy.getChildPath(policy.getParentPath(spec.getPath()), newName)
    // Renaming to the same name is allowed.
    if (newPath.equals(spec.getPath())) return SdfAllowed.allowed()
    if (newPath.isEmpty() || spec.getLayer().hasSpec(newPath.pathString)) {
      return new SdfAllowed('An object with that name already exists')
    }
    return SdfAllowed.allowed()
  },

  // Rename (childrenUtils.cpp:667-720).
  rename(policy: Sdf_ChildPolicy, spec: SdfSpec, newName: string): boolean {
    if (policy.keyIsPath) codingError(cannotRenameMessage(policy))
    const oldPath = spec.getPath()
    if (!policy.isValidIdentifier(newName)) {
      codingError(`Cannot rename ${oldPath.pathString} to invalid name '${newName}'`)
    }
    const parentPath = policy.getParentPath(oldPath)
    const newPath = policy.getChildPath(parentPath, newName)
    if (newPath.isEmpty()) return false
    // Renaming to the same name is a no-op.
    if (newPath.equals(oldPath)) return true
    const layer = spec.getLayer()
    const names = childNames(layer, parentPath, policy.childrenKey)
    if (names.includes(newName)) {
      codingError(`Cannot rename ${oldPath.pathString} to ${newPath.pathString} because a sibling ` +
        'with that name already exists')
    }
    return sdfChangeBlock(() => {
      // Move the spec and all the fields under it, then update the parent's
      // children list.
      if (!layer._moveSpec(oldPath.pathString, newPath.pathString)) return false
      const oldName = policy.getFieldValue(oldPath)
      const index = names.indexOf(oldName)
      if (index >= 0) names[index] = newName
      layer.setField(parentPath.pathString, policy.childrenKey, names)
      return true
    })
  },
}

function cannotRenameMessage(policy: Sdf_ChildPolicy): string {
  return policy.childrenKey === 'connectionChildren' ? 'Cannot rename attribute connections'
    : 'Cannot rename relationship targets'
}
