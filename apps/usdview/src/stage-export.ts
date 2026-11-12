// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/appController.py, pxr/usd/usdUtils/authoring.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { Layer } from 'typescript-usd/sdf'
import type { Stage } from 'typescript-usd/usd'
import * as usd from 'typescript-usd'

export type StageExportKind = 'session' | 'flattened' | 'overrides'
export interface StageExport {
  kind: StageExportKind
  fileName: string
  text: string
  warnings: string[]
}

/** Read-only browser exports modeled on OpenUSD v26.11.1
 * usdviewq/appController.py:2859-2925. Raw session export remains separate
 * from Save Overrides As, which references the original root.
 */
export function exportStage(stage: Stage, kind: StageExportKind, range = {start:stage.startTimeCode, end:stage.endTimeCode}): StageExport {
  if (kind !== 'session' && kind !== 'flattened' && kind !== 'overrides') throw new Error('Choose overrides, session edits or a flattened stage.')
  const surface = usd.Stage.fromCore(stage)
  const root = stage.getRootLayer()
  let text: string
  if (kind === 'overrides' && !root.isAnonymous()) {
    // Adapted from OpenUSD v26.11.1 usdviewq/appController.py:2882-2913 and
    // usdUtils/authoring.cpp:27-88 (CopyLayerMetadata, skipSublayers=true).
    // Clone before authoring: saving must never change the live session layer.
    const layer = Layer.createAnonymous('overrides.usda')
    layer.transferContent(stage.getSessionLayer())
    const source = root.getPseudoRoot(), target = layer.getPseudoRoot()
    for (const key of source.listInfoKeys()) {
      if (key !== 'subLayers' && key !== 'subLayerOffsets') target.setInfo(key, source.getInfo(key))
    }
    if (range.start) layer.setField('/', 'startTimeCode', range.start)
    if (range.end) layer.setField('/', 'endTimeCode', range.end)
    // Each load resolves its HTTP layers to resolved paths of its own
    // (usdview-load:, http-resolver.ts). Their public HTTP identifier is the
    // portable address; never serialize a load's resolved path. Native
    // filesystem layers retain usdview's realPath behavior.
    const rootAddress = /^https?:\/\//i.test(root.identifier) ? root.identifier : root.realPath
    if (!rootAddress || /^(?:anon:|usdview-load:)/.test(rootAddress)) throw new Error('The original scene has no persistent address. Save a flattened stage instead.')
    layer.setSubLayerPaths([...layer.getSubLayerPaths(), rootAddress])
    layer.removeInertSceneDescription()
    text = layer.exportToString()
  } else {
    text = kind === 'session' ? surface.sessionLayer.exportToString()
      : kind === 'overrides' ? surface.rootLayer.exportToString() : surface.exportToString()
  }
  // A mounted local File is readable only by this viewer instance. Exporting
  // such an asset token would create a file that cannot reopen independently.
  // Inspect USDA asset tokens rather than documentation/source comments.
  if ([...text.matchAll(/@([^@]*)@/g)].some(match => /https:\/\/local-file\.invalid(?:\/|$)/i.test(match[1]!))) {
    throw new Error('This export contains dependencies from the selected local files or USDZ. They cannot be saved as a standalone USDA file yet. Source files are unchanged.')
  }
  if ([...text.matchAll(/@([^@]*)@/g)].some(match => match[1]!.startsWith('usdview-load:'))) {
    throw new Error('This export contains temporary resolver addresses that cannot reopen independently. Source files are unchanged.')
  }
  const displayName = surface.rootLayer.displayName.split(/[?#]/)[0]!
  const base = displayName.replace(/\.[^.]*$/, '').replace(/[^\p{L}\p{N}._-]+/gu, '_') || 'scene'
  return {
    kind, fileName: `${base}_${kind}.usda`, text,
    warnings: kind === 'overrides'
      ? [root.isAnonymous() ? 'Exports the anonymous root layer, matching native Save Overrides As.' : 'Overrides reference the original scene. Keep it and its dependencies available; HTTP URLs require a compatible resolver.', 'Viewer camera, selection, payload load rules and layer muting are not saved. External assets are not bundled.']
      : kind === 'session'
      ? ['Session edits must be composed over the original scene. This is not a standalone scene.', 'Viewer camera, selection, payload load rules and layer muting are not saved.']
      : ['Exports the current composed scene, including session edits. Unloaded payloads and muted layers are not included.', 'External assets are not bundled. HTTP asset URLs require a compatible resolver; viewer camera and selection are not saved.'],
  }
}
