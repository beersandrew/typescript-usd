// Ported from OpenUSD 26.11.1: pxr/usd/usd/variantSets.cpp,
//  pxr/usd/usd/variantSets.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { pcpComposeSiteVariantSelections, pcpComposeSiteVariantSetOptions, pcpComposeSiteVariantSets } from 'typescript-usd/pcp'
// Mirrors pxr/usd/usd/variantSets.{h,cpp} — UsdVariantSet / UsdVariantSets,
// variant-selection authoring handles over the stage's edit target.

import type { Stage } from './stage.ts'
import { VariantSetSpec as SdfVariantSetSpec, VariantSpec as SdfVariantSpec, sdfChangeBlock, type Layer } from 'typescript-usd/sdf'
import { ListPositionBackOfPrependList, type UsdListPosition } from './common.ts'
import { SdfPath } from 'typescript-usd/sdf/path'
import { TfDiagnosticMgr, TfDiagnosticType, Error as TfError } from 'typescript-usd/tf'
import { UsdEditTarget } from './editTarget.ts'
import { UsdEditContext } from './editContext.ts'

export class UsdVariantSet {
  constructor(
    private readonly _stage: Stage,
    private readonly _primPath: string,
    readonly name: string,
  ) {}

  // UsdVariantSet::GetVariantNames (variantSets.cpp:54-65): the union of
  // the set's variant names over the prim index's prim and variant
  // selection sites, sorted.
  getVariantNames(): string[] {
    const prim = this._stage.getPrim(this._primPath)
    if (!prim) return []
    const names = new Set<string>()
    for (const node of [...prim.getPrimIndex().getNodeRange()].reverse()) {
      if (!node.getPath().isPrimOrPrimVariantSelectionPath()) continue
      for (const name of pcpComposeSiteVariantSetOptions(node.getLayerStack(), node.getPath(), this.name)) {
        names.add(name)
      }
    }
    return [...names].sort()
  }

  getVariantSelection(): string {
    return this._stage._variantSelection(this._primPath, this.name)
  }

  // UsdVariantSet::AddVariant (variantSets.cpp:38-52): add the variant
  // set to the prim spec at the edit target, then the variant spec, if it
  // does not exist.
  async addVariant(
    variantName: string, position: UsdListPosition = ListPositionBackOfPrependList,
  ): Promise<boolean> {
    let added = false
    await this._stage._ownAuthoringAsync(async () => {
      sdfChangeBlock(() => {
        const varSet = this._addVariantSet(position)
        if (!varSet) return
        added = varSet.getVariants().get(variantName) !== undefined ||
          SdfVariantSpec.new(varSet, variantName) !== undefined
      })
      await this._stage._recomposeForEdit(this._primPath)
    })
    return added
  }

  // UsdVariantSet::_AddVariantSet (variantSets.cpp:189-209): the variant set
  // spec under the prim spec at the edit target, created if needed, and the
  // name inserted into the prim's variantSetNames list op.
  /** @internal */
  _addVariantSet(position: UsdListPosition): SdfVariantSetSpec | undefined {
    const layer = this._stage.getEditTarget().getLayer()!
    const specPath = this._stage._createPrimSpecForEditing(this._primPath)
    const primSpec = layer.getPrimAtPath(specPath)
    if (!primSpec) return undefined
    const varSetPath = SdfPath.fromString(specPath).appendVariantSelection(this.name, '')
    if (varSetPath.isEmpty()) return undefined
    const existing = layer.getObjectAtPath(varSetPath)
    const result = existing instanceof SdfVariantSetSpec ? existing
      : SdfVariantSetSpec.new(primSpec, this.name)
    this._stage._addNameListItem(this._primPath, 'variantSetNames', this.name, position)
    return result
  }

  // UsdVariantSet::SetVariantSelection (variantSets.cpp:115-124): author
  // the selection on the prim spec at the edit target (mapped through the
  // edit target, created if needed) and recompose. An empty string clears
  // the selection (SdfPrimSpec::SetVariantSelection).
  async setVariantSelection(variantName: string): Promise<void> {
    await this._stage._ownAuthoringAsync(async () => {
      const layer = this._stage.getEditTarget().getLayer()!
      const specPath = this._stage._createPrimSpecForEditing(this._primPath)
      layer.getPrimAtPath(specPath)?.setVariantSelection(this.name, variantName)
      await this._stage._recomposeForEdit(this._primPath)
    })
  }

  // UsdVariantSet::ClearVariantSelection (variantSets.cpp:126-132).
  async clearVariantSelection(): Promise<void> {
    await this.setVariantSelection('')
  }

  // UsdVariantSet::BlockVariantSelection (variantSets.cpp:134-143): author
  // an empty selection, which blocks weaker selections, and recompose.
  async blockVariantSelection(): Promise<boolean> {
    let blocked = false
    await this._stage._ownAuthoringAsync(async () => {
      const layer = this._stage.getEditTarget().getLayer()!
      const specPath = this._stage._createPrimSpecForEditing(this._primPath)
      const spec = layer.getPrimAtPath(specPath)
      if (spec) {
        spec.blockVariantSelection(this.name)
        blocked = true
      }
      await this._stage._recomposeForEdit(this._primPath)
    })
    return blocked
  }

  // UsdVariantSet::GetName.
  getName(): string { return this.name }

  // UsdVariantSet::GetVariantEditTarget (variantSets.cpp:145-174): an edit
  // target for the current selection's variant in a local layer (the edit
  // target's layer by default); a null target when there is no selection.
  getVariantEditTarget(layer?: Layer): UsdEditTarget {
    // Obtain the current VariantSet name & selection.  If there is no
    // selection, there is no context to pursue
    const selection = this.getVariantSelection()
    if (selection === '') return new UsdEditTarget()
    const lyr = layer ?? this._stage.getEditTarget().getLayer()!
    if (!this._stage.getLayerStack(true).includes(lyr)) {
      TfDiagnosticMgr.GetInstance().postError(new TfError(
        `Layer ${lyr.identifier} is not a local layer of stage rooted at layer ` +
        `${this._stage.getRootLayer().identifier}`, TfDiagnosticType.CodingError))
      return new UsdEditTarget()
    }
    const varSpecPath = SdfPath.fromString(
      this._stage.getEditTarget().mapToSpecPath(this._primPath))
      .appendVariantSelection(this.name, selection)
    return UsdEditTarget.forLocalDirectVariant(lyr, varSpecPath.pathString)
  }

  // UsdVariantSet::GetVariantEditContext (variantSets.cpp:175-181): Python's
  // `with` context, as a UsdEditContext to close.
  getVariantEditContext(layer?: Layer): UsdEditContext {
    return new UsdEditContext(this._stage, this.getVariantEditTarget(layer))
  }
}

export class UsdVariantSets {
  constructor(
    private readonly _stage: Stage,
    private readonly _primPath: string,
  ) {}

  // UsdVariantSets::GetNames (variantSets.cpp:246-264): each node's
  // composed variantSetNames list op, strongest node first, first
  // occurrence kept.
  getNames(): string[] {
    const prim = this._stage.getPrim(this._primPath)
    if (!prim) return []
    const names: string[] = []
    const seen = new Set<string>()
    for (const node of prim.getPrimIndex().getNodeRange()) {
      for (const name of pcpComposeSiteVariantSets(node.getLayerStack(), node.getPath())) {
        if (!seen.has(name)) { seen.add(name); names.push(name) }
      }
    }
    return names
  }

  hasVariantSet(name: string): boolean {
    return this.getNames().includes(name)
  }

  // UsdVariantSets::AddVariantSet (variantSets.cpp:226-237).
  async addVariantSet(
    name: string, position: UsdListPosition = ListPositionBackOfPrependList,
  ): Promise<UsdVariantSet> {
    const varSet = this.getVariantSet(name)
    await this._stage._ownAuthoringAsync(async () => {
      sdfChangeBlock(() => { varSet._addVariantSet(position) })
      await this._stage._recomposeForEdit()
    })
    return varSet
  }

  getVariantSet(name: string): UsdVariantSet {
    return new UsdVariantSet(this._stage, this._primPath, name)
  }

  // UsdVariantSets::GetVariantSelection (variantSets.cpp:278-282).
  getVariantSelection(variantSetName: string): string {
    return this.getVariantSet(variantSetName).getVariantSelection()
  }

  getAllVariantSelections(): Record<string, string> {
    const out: Record<string, string> = {}
    // UsdVariantSets::GetAllVariantSelections (v26.11.1 variantSets.cpp:293-302):
    // compose opinions in cached node strength order, including setless/empty
    // selections, rather than enumerating only named variant sets.
    const prim = this._stage.getPrim(this._primPath)
    if (!prim) return out
    for (const node of prim.getPrimIndex().getNodeRange()) {
      const selections = pcpComposeSiteVariantSelections(node.getLayerStack(), node.getPath())
      for (const [name, selection] of Object.entries(selections)) {
        if (!(name in out)) out[name] = selection
      }
    }
    return out
  }
}
