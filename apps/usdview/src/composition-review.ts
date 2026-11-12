// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/common.py,
//  pxr/usdImaging/usdviewq/appController.py,
//  pxr/usdImaging/usdviewq/primViewItem.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { Stage, InterpolationType as UsdInterpolationType, PrimIsActive, type Prim } from 'typescript-usd/usd'
import { Imageable, VisibilityAPI } from 'typescript-usd/usdGeom'
import { MaterialBindingAPI } from 'typescript-usd/usdShade'
import { Registry as KindRegistry } from 'typescript-usd/kind'
import { sdfChangeBlock, sdfCreatePrimInLayer } from 'typescript-usd/sdf'
import { editModelDrawMode } from './model-draw-mode'
import { compositionCommands } from './composition-types'
import { timedAsync } from './load-timing'
import type { CompositionCommand, CompositionState, EditMenuState, InterpolationType } from './composition-types'

const parentPath = (path: string) => path === '/' ? '' : path.slice(0, path.lastIndexOf('/')) || '/'
/** OpenUSD v26.11.1 usdviewq/common.py:639-669 GetPrimLoadability. */
export function primLoadability(prim: Prim): { loadable: boolean, loaded: boolean } {
  if (!(prim.isActive && (prim.isGroup() || prim.hasAuthoredPayloads()))) return { loadable: false, loaded: true }
  // Usd.PrimRange(prim, Usd.PrimIsActive) includes prim itself.
  for (const p of [prim, ...prim.getFilteredDescendants(PrimIsActive)]) if (!p.isLoaded) return { loadable: true, loaded: false }
  return { loadable: true, loaded: true }
}

/** Session-only review edits. The owner must serialize this with open/time/display work.
 * The owner validates retained updates or a candidate renderer; empty scenes are valid.
 */
export class CompositionReview {
  private knownLayers = new Set<string>()
  private pending = false
  constructor(private stage: Stage, private time: () => number | undefined) {}
  state(path: string | null): CompositionState {
    const stage = this.stage, prim = path ? stage.getPrim(path) : undefined
    for (const layer of stage.getUsedLayers()) this.knownLayers.add(layer.identifier)
    for (const id of stage.getMutedLayers()) this.knownLayers.add(id)
    const protectedIds = [stage.getRootLayer().identifier, stage.getSessionLayer().identifier]
    const imageable = !!prim?.isA('Imageable')
    return {
      path: prim ? path : null, imageable,
      visibility: imageable ? Imageable.computeVisibility(stage, path!, this.time()) : null,
      ...(prim ? primLoadability(prim) : { loadable: false, loaded: false }),
      variants: prim ? stage.getVariantSets(path!).getNames().map(name => {
        const set = stage.getVariantSets(path!).getVariantSet(name)
        return { name, selection: set.getVariantSelection(), choices: set.getVariantNames() }
      }) : [],
      layers: [...this.knownLayers].map(identifier => ({ identifier, muted: stage.isLayerMuted(identifier), canMute: !protectedIds.includes(identifier) })),
    }
  }
  /** Selection-derived enablement for the Edit menu and prim context menu. */
  editState(selection: string | null): EditMenuState {
    const stage = this.stage, path = selection ?? '/', prim = stage.getPrim(path)
    if (!prim) throw new Error(`Prim is no longer available: ${path}`)
    const imageable = path !== '/' && prim.isA('Imageable')
    // common.py:624-636 GetEnclosingModelPrim starts at the parent; walking past
    // the pseudo-root yields an invalid prim, which callers test against None.
    let enclosingModel = ''
    for (let p = parentPath(path); p; p = parentPath(p)) if (KindRegistry.isA(stage.getPrim(p)!.getKind(), 'model')) { enclosingModel = p; break }
    // primContextMenuItems.py:96-150: 'preview'/'full' in the binding rel's name, else generic.
    const bound = (purpose: string) => {
      const binding = path === '/' ? null : MaterialBindingAPI.computeBoundMaterial(stage, path, purpose)
      if (!binding) return null
      const relName = binding.bindingRelPath.slice(binding.bindingRelPath.lastIndexOf('.') + 1)
      return { path: binding.materialPath, name: binding.materialPath.slice(binding.materialPath.lastIndexOf('/') + 1), generic: !relName.split(':').includes(purpose) }
    }
    return {
      // UsdPrim::GetName() of the pseudo-root is '/'.
      path, name: path === '/' ? '/' : path.slice(path.lastIndexOf('/') + 1),
      interpolation: stage.getInterpolationType() === UsdInterpolationType.Held ? 'Held' : 'Linear',
      ...primLoadability(prim), active: prim.isActive, inPrototype: prim.isInPrototype(), imageable,
      visible: imageable && Imageable.computeVisibility(stage, path, this.time()) === 'inherited',
      sessionVisibility: imageable && !!stage.getSessionLayer().getAttributeAtPath(`${path}.visibility`),
      enclosingModel, boundPreviewMaterial: bound('preview'), boundFullMaterial: bound('full'),
      camera: path !== '/' && prim.isA('Camera'),
    }
  }
  private visibilityPaths() {
    const paths: string[] = []
    this.stage.getSessionLayer().traverse('/', path => { if (path.endsWith('.visibility')) paths.push(path) })
    return paths
  }
  private resetVisibility() {
    const layer = this.stage.getSessionLayer(), paths = this.visibilityPaths()
    // OpenUSD v26.11.1 usdviewq/common.py:610-613 batches raw session-layer
    // removals, so imaging observes only the completed visibility reset.
    sdfChangeBlock(() => {
      for (const path of paths) {
        const property = layer.getPropertyAtPath(path)
        if (property) layer.getPrimAtPath(path.slice(0, -11))?.removeProperty(property)
      }
    })
  }
  async apply(command: CompositionCommand, rebuild: () => Promise<void>): Promise<void> {
    if (this.pending) throw new Error('A scene review change is already in progress')
    if (command.kind === 'resetVisibility' && !this.visibilityPaths().length) return
    this.pending = true
    const stage = this.stage, session = stage.getSessionLayer(), text = session.exportToString()
    const rules = stage.getLoadRules(), muted = stage.getMutedLayers(), target = stage.getEditTarget()
    const interpolation = stage.getInterpolationType()
    try {
      stage.setEditTarget(session)
      const commands = compositionCommands(command)
      // appController.py:4912-4922: isolate resets and masks roots once, then
      // makes every selected imageable visible in the same session transaction.
      const isolate = commands.some(command => command.kind === 'visibility' && command.action === 'isolate')
      if (isolate) {
        this.resetVisibility()
        for (const path of stage.getChildPrimPaths('/')) new Imageable(stage.getPrim(path)!, stage).makeInvisible()
      }
      const activations = commands.filter(command => command.kind === 'activation')
      for(const command of activations){
        const prim=stage.getPrim(command.path)
        if(!prim)throw new Error(`Prim is no longer available: ${command.path}`)
        if(command.path==='/')throw new Error('Cannot change activation of pseudoroot.')
        if(prim.isInPrototype())throw new Error(`The prim <${command.path}> is in a prototype. Cannot change activation.`)
      }
      sdfChangeBlock(()=>{for(const command of activations)sdfCreatePrimInLayer(session,command.path)!.setActive(command.active)})
      for (const command of commands) {
      if(command.kind==='activation')continue
      if (command.kind === 'interpolation') {
        // appController.py:2596-2601 _changeInterpolationType.
        stage.setInterpolationType(command.interpolation === 'Held' ? UsdInterpolationType.Held : UsdInterpolationType.Linear)
      } else if (command.kind === 'layer') {
        const layer = this.state(null).layers.find(layer => layer.identifier === command.identifier)
        if (!layer?.canMute) throw new Error('This layer cannot be muted')
        if (command.muted) await stage.muteLayer(command.identifier)
        else await stage.unmuteLayer(command.identifier)
      } else if (command.kind === 'loadAndUnload') {
        for (const path of [...command.load, ...command.unload]) {
          const prim = stage.getPrim(path)
          if (!prim) throw new Error(`Prim is no longer available: ${path}`)
          if (prim.isPrototype()) throw new Error(`The prim <${path}> is a prototype prim. Cannot change load state.`)
        }
        await timedAsync('load-payloads', () => stage.loadAndUnload(command.load, command.unload))
      } else if (command.kind === 'resetVisibility') this.resetVisibility()
      else {
        const prim = stage.getPrim(command.path)
        if (!prim) throw new Error(`Prim is no longer available: ${command.path}`)
        if (command.kind === 'variant') {
          const variants = stage.getVariantSets(command.path)
          if (!variants.getNames().includes(command.set)) throw new Error(`Unknown variant set: ${command.set}`)
          const variant = variants.getVariantSet(command.set)
          if (command.selection && !variant.getVariantNames().includes(command.selection)) throw new Error(`Unknown variant: ${command.selection}`)
          await variant.setVariantSelection(command.selection)
        } else if (command.kind === 'payload') {
          // primViewItem.py:430-440 setLoaded: prototypes and inactive prims are skipped.
          if (!primLoadability(prim).loadable) throw new Error('Nothing beneath this prim can be loaded')
          if (prim.isPrototype()) throw new Error(`The prim <${command.path}> is a prototype prim. Cannot change load state.`)
          if (command.loaded) await stage.load(command.path)
          else await stage.unload(command.path)
        } else if(command.kind==='drawMode'){
          editModelDrawMode(stage,prim,command.value)
        } else if (command.kind === 'removeVisibility') {
          // appController.py:4931-4938: UsdAttribute.Clear() at the edit target.
          if (!prim.isA('Imageable')) throw new Error('Selected prim does not support visibility')
          new Imageable(prim, stage).getVisibilityAttr().clear()
        } else if (command.kind === 'guides') {
          // primViewItem.py:469-476: apply VisibilityAPI and flip guideVisibility at the edit target.
          if (!prim.isA('Camera')) throw new Error(`The prim <${command.path}> does not support guides.`)
          const attr = VisibilityAPI.apply(prim).getGuideVisibilityAttr()
          attr.set(attr.getValueAtTime(this.time() ?? 0) === 'visible' ? 'invisible' : 'visible')
        } else if (command.action === 'toggle') {
          // primViewItem.py:388-396,441-447,461-467: toggleVis on an active imageable prim
          // authors inherited/invisible (not MakeVisible) at the current frame's opposite.
          if (!prim.isA('Imageable')) throw new Error(`The prim <${command.path}> is not imageable. Cannot change visibility.`)
          if (prim.isInPrototype()) throw new Error(`The prim <${command.path}> is in a prototype. Cannot change visibility.`)
          if (!prim.isActive) throw new Error(`The prim <${command.path}> is inactive. Cannot change visibility.`)
          const attr = new Imageable(prim, stage).getVisibilityAttr()
          attr.set(attr.getValueAtTime(this.time() ?? 0) === 'invisible' ? 'inherited' : 'invisible')
        } else {
          if (!prim.isA('Imageable')) throw new Error('Selected prim does not support visibility')
          const imageable = new Imageable(prim, stage)
          if (command.action === 'hide') imageable.makeInvisible()
          else imageable.makeVisible()
        }
      }
      }
      await stage.flushChanges()
      await rebuild()
    } catch (error) {
      try {
        if (!session.importFromString(text)) throw new Error('Unable to restore the session layer')
        const current = stage.getMutedLayers()
        await stage.muteAndUnmuteLayers(muted.filter(id => !current.includes(id)), current.filter(id => !muted.includes(id)))
        await stage.setLoadRules(rules)
        stage.setInterpolationType(interpolation)
        await stage.flushChanges()
      } catch (rollback) { throw new AggregateError([error, rollback], 'Review change failed and rollback failed') }
      throw error
    } finally { stage.setEditTarget(target); this.pending = false }
  }
}
