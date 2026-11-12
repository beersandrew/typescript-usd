// Ported from OpenUSD 26.11.1: pxr/usd/pcp/layerRelocatesEditBuilder.cpp,
//  pxr/usd/pcp/layerRelocatesEditBuilder.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/pcp/layerRelocatesEditBuilder.{h,cpp}: builds
// the layer relocates metadata edits that add or remove relocates in a layer
// stack while keeping its relocates valid.

import { Error as TfError, TfDiagnosticType } from 'typescript-usd/tf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { PcpErrorType, type PcpError } from './errors.ts'
import type { PcpLayer } from './layerStackIdentifier.ts'
import { pcpBuildRelocateMap, pcpIsValidRelocatesEntry, type PcpLayerStack } from './layerStack.ts'

export type PcpRelocates = Array<[source: string, target: string]>
export type PcpLayerRelocatesEdit = [layer: PcpLayer, relocates: PcpRelocates]

function hasPrefix(path: string, prefix: string): boolean {
  return SdfPath.fromString(path).hasPrefix(SdfPath.fromString(prefix))
}

function replacePrefix(path: string, oldPrefix: string, newPrefix: string): string {
  if (newPrefix === '') return ''
  return SdfPath.fromString(path).replacePrefix(SdfPath.fromString(oldPrefix), SdfPath.fromString(newPrefix))
    .pathString
}

function cannotRelocate(source: string, target: string, reason: string): string {
  return `Cannot relocate <${source}> to <${target}>: ${reason}`
}

export class PcpLayerRelocatesEditBuilder {
  private _relocatesMap: Map<string, string> | undefined
  private _layerRelocatesEdits: PcpLayerRelocatesEdit[] = []
  private readonly _layersWithRelocatesChanges = new Set<PcpLayer>()
  private _editForNewRelocatesIndex = -1

  constructor(layerStack: PcpLayerStack | undefined, addNewRelocatesLayer?: PcpLayer) {
    if (!layerStack) {
      throw new TfError('No layer stack provided to relocates edit builder.', TfDiagnosticType.CodingError)
    }
    // New relocates go in the layer stack's root layer unless a layer is given.
    const newRelocatesLayer = addNewRelocatesLayer ?? layerStack.identifier.rootLayer as PcpLayer
    if (!layerStack.hasLayer(newRelocatesLayer)) {
      throw new TfError('The layer for adding new relocates does not belong to the layer stack.',
        TfDiagnosticType.CodingError)
    }
    // The authored layer relocates of each layer, to track the metadata edits
    // that update the layer stack's relocates.
    for (const layer of layerStack.getLayers()) {
      const authored = layer.getField('/', 'layerRelocates')
      const layerRelocates: PcpRelocates = Array.isArray(authored)
        ? authored.map(([s, t]: [string, string]) => [s, t]) : []
      // Layers without relocates are skipped unless they receive new ones.
      if (layer === newRelocatesLayer) this._editForNewRelocatesIndex = this._layerRelocatesEdits.length
      else if (authored === undefined) continue
      this._layerRelocatesEdits.push([layer, layerRelocates])
    }
    if (this._editForNewRelocatesIndex < 0) this._layerRelocatesEdits = []

    // Build the relocates map now to collect the layer stack's current
    // relocates errors, and remove the relocates causing them so applying
    // the edits always produces a layer stack without relocates errors.
    const errors: PcpError[] = []
    this._relocatesMap = pcpBuildRelocateMap(this._layerRelocatesEdits, errors)
    this._removeRelocatesWithErrors(errors)
  }

  // _RemoveRelocatesWithErrors (layerRelocatesEditBuilder.cpp:83-178).
  private _removeRelocatesWithErrors(errors: readonly PcpError[]): void {
    if (errors.length === 0) return
    const relocateSourcePathsToDelete = new Set<string>()
    const relocatesToDeletePerLayer = new Map<PcpLayer, Set<string>>()
    const relocateKey = (source: string, target: string): string => `${source}\0${target}`
    for (const error of errors) {
      if (error.errorType === PcpErrorType.InvalidAuthoredRelocation) {
        // Always-invalid relocates are deleted from their layers.
        let set = relocatesToDeletePerLayer.get(error.layer as PcpLayer)
        if (!set) relocatesToDeletePerLayer.set(error.layer as PcpLayer, set = new Set())
        set.add(relocateKey(error.sourcePath, error.targetPath))
      } else if (error.errorType === PcpErrorType.InvalidConflictingRelocation) {
        // A conflicting relocate's source is removed from every layer, so a
        // relocate with the same source in another layer does not take over.
        relocateSourcePathsToDelete.add(error.sourcePath)
      } else if (error.errorType === PcpErrorType.InvalidSameTargetRelocations) {
        for (const source of error.sources) relocateSourcePathsToDelete.add(source.sourcePath)
      } else {
        throw new TfError(`Unexpected error type: ${PcpErrorType[error.errorType]}`,
          TfDiagnosticType.CodingError)
      }
    }
    for (const edit of this._layerRelocatesEdits) {
      const [layer, relocates] = edit
      const toDelete = relocatesToDeletePerLayer.get(layer)
      if (!toDelete) continue
      this._layersWithRelocatesChanges.add(layer)
      edit[1] = relocates.filter(([s, t]) => !toDelete.has(relocateKey(s, t)))
    }
    if (relocateSourcePathsToDelete.size > 0) {
      for (const edit of this._layerRelocatesEdits) {
        const kept = edit[1].filter(([s]) => !relocateSourcePathsToDelete.has(s))
        if (kept.length !== edit[1].length) {
          this._layersWithRelocatesChanges.add(edit[0])
          edit[1] = kept
        }
      }
    }
  }

  // GetEditedRelocatesMap: the relocates map the edits would produce.
  getEditedRelocatesMap(): ReadonlyMap<string, string> {
    if (!this._relocatesMap) {
      // The edits are maintained to never produce errors.
      this._relocatesMap = pcpBuildRelocateMap(this._layerRelocatesEdits)
    }
    return this._relocatesMap
  }

  // _UpdateExistingRelocates: existing relocates that the new relocate
  // ancestrally relocates are updated.
  private _updateExistingRelocates(source: string, target: string): void {
    for (const [layer, relocates] of this._layerRelocatesEdits) {
      if (pcpModifyRelocates(relocates, source, target)) this._layersWithRelocatesChanges.add(layer)
    }
  }

  // Relocate (layerRelocatesEditBuilder.cpp:330-412): returns undefined on
  // success, else why not.
  relocate(newSource: string | SdfPath, newTarget: string | SdfPath): string | undefined {
    const source = String(newSource instanceof SdfPath ? newSource.pathString : newSource)
    const target = String(newTarget instanceof SdfPath ? newTarget.pathString : newTarget)
    if (this._layerRelocatesEdits.length === 0) {
      throw new TfError('Relocates edit builder is invalid', TfDiagnosticType.CodingError)
    }
    const reason = pcpIsValidRelocatesEntry(source, target)
    if (reason !== null) return cannotRelocate(source, target, reason)

    // Validate against the current relocates, and find whether a new entry is
    // needed or only updates to existing relocates.
    let addNewRelocate = true
    for (const [existingSource, existingTarget] of this.getEditedRelocatesMap()) {
      const whyNot = validateAgainstExistingRelocate(source, target, existingSource, existingTarget)
      if (whyNot !== undefined) return whyNot
      // Moving an existing relocate's target only updates that relocate.
      if (source === existingTarget) addNewRelocate = false
    }

    // A new entry must not relocate a root prim.
    if (addNewRelocate && SdfPath.fromString(source).isRootPrimPath()) {
      return cannotRelocate(source, target,
        `Adding a relocate from <${source}> would result in a root prim being relocated.`)
    }

    this._updateExistingRelocates(source, target)
    // The new relocate is added after updating the existing ones, so it is
    // not relocated by itself.
    if (addNewRelocate) {
      const edit = this._layerRelocatesEdits[this._editForNewRelocatesIndex]!
      edit[1].push([source, target])
      this._layersWithRelocatesChanges.add(edit[0])
    }
    this._relocatesMap = undefined
    return undefined
  }

  // RemoveRelocate (layerRelocatesEditBuilder.cpp:414-462).
  removeRelocate(sourcePath: string | SdfPath): string | undefined {
    const source = sourcePath instanceof SdfPath ? sourcePath.pathString : sourcePath
    const target = this.getEditedRelocatesMap().get(source)
    if (target === undefined) {
      return `Cannot remove relocate for source path <${source}>: No relocate with the source path found.`
    }
    if (target === '') {
      // A deletion relocate: remove every entry using the source path.
      for (const edit of this._layerRelocatesEdits) {
        const kept = edit[1].filter(([s]) => s !== source)
        if (kept.length !== edit[1].length) {
          this._layersWithRelocatesChanges.add(edit[0])
          edit[1] = kept
        }
      }
    } else {
      // Relocating the target back to the source removes the relocate and
      // updates the relocates it changed.
      this._updateExistingRelocates(target, source)
    }
    this._relocatesMap = undefined
    return undefined
  }

  // GetEdits: the layer relocates edits of layers whose relocates change.
  getEdits(): PcpLayerRelocatesEdit[] {
    return this._layerRelocatesEdits
      .filter(([layer]) => this._layersWithRelocatesChanges.has(layer))
      .map(([layer, relocates]) => [layer, relocates.map(([s, t]) => [s, t] as [string, string])])
  }
}

// _ValidateAgainstExistingRelocate (layerRelocatesEditBuilder.cpp:211-283).
function validateAgainstExistingRelocate(
  newSource: string, newTarget: string, existingSource: string, existingTarget: string,
): string | undefined {
  // A descendant of an existing relocate's source cannot be relocated again.
  if (hasPrefix(newSource, existingSource)) {
    return cannotRelocate(newSource, newTarget,
      `A relocate from <${existingSource}> to <${existingTarget}> already exists; neither the ` +
      `source <${existingSource}> nor any of its descendants can be relocated again using their ` +
      'original paths.')
  }
  if (newTarget === '') return undefined
  // An existing relocate's target cannot be relocated to again.
  if (newTarget === existingTarget) {
    return cannotRelocate(newSource, newTarget,
      `A relocate from <${existingSource}> to <${existingTarget}> already exists and the same target ` +
      'cannot be relocated to again.')
  }
  // The target cannot be a relocated prim or its descendant, except that a
  // relocated prim can be relocated back to its source, removing the relocate.
  if (existingSource !== '' && hasPrefix(newTarget, existingSource)) {
    if (newTarget !== existingSource) {
      return cannotRelocate(newSource, newTarget,
        `Cannot relocate a prim to be a descendant of <${existingSource}> which is already ` +
        `relocated to <${existingTarget}>.`)
    }
    if (newSource !== existingTarget) {
      return cannotRelocate(newSource, newTarget,
        `The target of the relocate is the same as the source of an existing relocate from ` +
        `<${existingSource}> to <${existingTarget}>; the only prim that can be relocated to ` +
        `<${existingSource}> is the existing relocate's target <${existingTarget}>, which will ` +
        'remove the relocate.')
    }
  }
  return undefined
}

/**
 * Pcp_ModifyRelocates (layerRelocatesEditBuilder.cpp:300-328): applies the
 * relocate of oldPath to newPath to the relocates in place, removing
 * relocates it makes no-ops. Returns whether any changed.
 */
export function pcpModifyRelocates(relocates: PcpRelocates, oldPath: string, newPath: string): boolean {
  let modified = false
  for (const relocate of relocates) {
    if (hasPrefix(relocate[0], oldPath)) {
      relocate[0] = replacePrefix(relocate[0], oldPath, newPath)
      modified = true
    }
    if (relocate[1] !== '' && hasPrefix(relocate[1], oldPath)) {
      relocate[1] = replacePrefix(relocate[1], oldPath, newPath)
      modified = true
    }
  }
  if (modified) {
    const kept = relocates.filter(([s, t]) => s !== '' && s !== t)
    relocates.splice(0, relocates.length, ...kept)
  }
  return modified
}
