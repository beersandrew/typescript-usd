// Ported from OpenUSD 26.11.1: pxr/usd/sdf/relationshipSpec.cpp,
//  pxr/usd/sdf/relationshipSpec.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/sdf/relationshipSpec.{h,cpp}.

import { Error as TfError, TfDiagnosticType } from 'typescript-usd/tf'
import { sdfChangeBlock } from './changeManager.ts'
import { Sdf_AttributeChildPolicy, Sdf_RelationshipChildPolicy } from './childrenPolicies.ts'
import { Sdf_ChildrenUtils } from './childrenUtils.ts'
import type { Layer } from './layer.ts'
import { SdfListOp } from './listOp.ts'
import { SdfPath } from './path.ts'
import { _sdfUncheckedCreatePrimInLayer, type SdfPrimSpec } from './primSpec.ts'
import { SdfPropertySpec, type SdfVariability } from './propertySpec.ts'
import { sdfGetPathEditorProxy, type SdfPathEditorProxy } from './proxyTypes.ts'
import type { SdfSpec } from './spec.ts'

function codingError(message: string): never {
  throw new TfError(message, TfDiagnosticType.CodingError)
}

export class SdfRelationshipSpec extends SdfPropertySpec {
  // SdfRelationshipSpec::New (relationshipSpec.cpp:30-77).
  static new(
    owner: SdfPrimSpec | undefined, name: string, custom = true, variability: SdfVariability = 'uniform',
  ): SdfRelationshipSpec | undefined {
    if (!owner) codingError('NULL owner prim')
    if (!Sdf_ChildrenUtils.isValidName(Sdf_RelationshipChildPolicy, name)) {
      codingError(`Cannot create a relationship on ${owner.getPath().pathString} with invalid name: ${name}`)
    }
    const relPath = owner.getPath().appendProperty(name)
    if (!relPath.isPropertyPath()) {
      codingError(`Cannot create relationship at invalid path <${owner.getPath().pathString}.${name}>`)
    }
    return sdfChangeBlock(() => {
      // Relationship specs initially have only required fields unless custom.
      if (!Sdf_ChildrenUtils.createSpec(Sdf_RelationshipChildPolicy, owner.getLayer(), relPath,
        'relationship', !custom)) {
        return undefined
      }
      const spec = owner.getLayer().getRelationshipAtPath(relPath)!
      spec.setField('custom', custom)
      spec.setField('variability', variability)
      return spec
    })
  }

  // Relationship target paths are absolute; relative paths are relative to
  // the owning prim.
  private _canonicalizeTargetPath(path: string | SdfPath): SdfPath {
    const sdfPath = typeof path === 'string' ? SdfPath.fromString(path) : path
    return sdfPath.makeAbsolutePath(this.getPath().getPrimPath())
  }

  /** @internal The target spec of a target path. */
  _getTargetSpec(path: string | SdfPath): SdfSpec | undefined {
    return this.getLayer().getObjectAtPath(this.getPath().appendTarget(this._canonicalizeTargetPath(path)))
  }

  getTargetPathList(): SdfPathEditorProxy { return sdfGetPathEditorProxy(this, 'targetPaths') }
  hasTargetPathList(): boolean { return this.getTargetPathList().hasKeys() }
  clearTargetPathList(): void { this.getTargetPathList().clearEdits() }

  // SdfRelationshipSpec::ReplaceTargetPath (relationshipSpec.cpp:142-237).
  replaceTargetPath(oldPath: string | SdfPath, newPath: string | SdfPath): void {
    if (!this.permissionToEdit()) codingError('ReplaceTargetPath: Permission denied.')
    const relPath = this.getPath()
    const layer = this.getLayer()
    const oldTargetPath = this._canonicalizeTargetPath(oldPath)
    const newTargetPath = this._canonicalizeTargetPath(newPath)
    if (oldTargetPath.equals(newTargetPath)) return
    sdfChangeBlock(() => {
      const children = layer.getField(relPath.pathString, 'targetChildren')
      const siblingPaths = Array.isArray(children) ? children.map(String) : []
      const oldIndex = siblingPaths.indexOf(oldTargetPath.pathString)
      const newIndex = siblingPaths.indexOf(newTargetPath.pathString)
      // A target spec's children field is updated with the spec.
      if (oldIndex !== -1) {
        const oldTargetSpecPath = relPath.appendTarget(oldTargetPath)
        const newTargetSpecPath = relPath.appendTarget(newTargetPath)
        if (layer.hasSpec(newTargetSpecPath.pathString)) {
          // A target with child specs cannot be replaced.
          for (const field of layer.listFields(newTargetSpecPath.pathString)) {
            if (this.getSchema().holdsChildren(field)) {
              codingError(`Can't replace target ${String(oldPath)} with target ${String(newPath)} in ` +
                `relationship ${relPath.pathString}: Target already exists`)
            }
          }
          layer._deleteSpec(newTargetSpecPath.pathString)
        }
        if (!layer._moveSpec(oldTargetSpecPath.pathString, newTargetSpecPath.pathString)) {
          codingError(`Cannot move ${oldTargetPath.pathString} to ${newTargetPath.pathString}`)
        }
        siblingPaths[oldIndex] = newTargetPath.pathString
        if (newIndex !== -1) siblingPaths.splice(newIndex, 1)
        layer.setField(relPath.pathString, 'targetChildren', siblingPaths)
      }
      const targetsListOp = SdfListOp.fromValue<string>(
        layer.getField(relPath.pathString, 'targetPaths'), item => String(item))
      if (targetsListOp.hasItem(oldTargetPath.pathString)) {
        // Replace oldPath with newPath, removing any existing newPath entries.
        targetsListOp.modifyOperations(path =>
          path === oldTargetPath.pathString ? newTargetPath.pathString
            : path === newTargetPath.pathString ? undefined : path)
        layer.setField(relPath.pathString, 'targetPaths', targetsListOp.toValue())
      }
    })
  }

  // SdfRelationshipSpec::RemoveTargetPath (relationshipSpec.cpp:239-258).
  removeTargetPath(path: string | SdfPath, preserveTargetOrder = false): void {
    const targetSpecPath = this.getPath().appendTarget(this._canonicalizeTargetPath(path))
    const target = this._canonicalizeTargetPath(path).pathString
    sdfChangeBlock(() => {
      Sdf_ChildrenUtils.setChildren(Sdf_AttributeChildPolicy, this.getLayer(), targetSpecPath, [])
      // The targets proxy updates both the list edits and the target specs.
      if (preserveTargetOrder) this.getTargetPathList().erase(target)
      else this.getTargetPathList().removeItemEdits(target)
    })
  }

  getNoLoadHint(): boolean { return this._getValueWithDefault('noLoadHint') }
  setNoLoadHint(noload: boolean): void { this.setField('noLoadHint', noload) }
}

// SdfJustCreateRelationshipInLayer (relationshipSpec.cpp:290-330).
export function sdfJustCreateRelationshipInLayer(
  layer: Layer, relPath: string | SdfPath, variability: SdfVariability = 'varying', isCustom = false,
): boolean {
  const path = typeof relPath === 'string' ? SdfPath.fromString(relPath) : relPath
  if (!path.isPrimPropertyPath()) {
    codingError(`Cannot create prim relationship at path '${path.pathString}' because it is not a prim ` +
      'property path')
  }
  return sdfChangeBlock(() => {
    if (!_sdfUncheckedCreatePrimInLayer(layer, path.getParentPath())) return false
    if (!Sdf_ChildrenUtils.createSpec(Sdf_RelationshipChildPolicy, layer, path, 'relationship', !isCustom)) {
      throw new TfError(`Failed to create relationship at path '${path.pathString}' in layer ` +
        `@${layer.identifier}@`)
    }
    layer.setField(path.pathString, 'custom', isCustom)
    layer.setField(path.pathString, 'variability', variability)
    return true
  })
}

// SdfCreateRelationshipInLayer (relationshipSpec.cpp:276-288).
export function sdfCreateRelationshipInLayer(
  layer: Layer, relPath: string | SdfPath, variability: SdfVariability = 'varying', isCustom = false,
): SdfRelationshipSpec | undefined {
  return sdfJustCreateRelationshipInLayer(layer, relPath, variability, isCustom)
    ? layer.getRelationshipAtPath(relPath) : undefined
}
