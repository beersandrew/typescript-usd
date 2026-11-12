// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/materialBindingsResolvingSceneIndex.cpp,
//  pxr/usdImaging/usdImaging/materialBindingsResolvingSceneIndex.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/materialBindingsResolvingSceneIndex.{h,cpp}
// (OpenUSD 26.11.1).
//
// Not ported: the TF_DEBUG(USDIMAGING_MATERIAL_BINDING_RESOLUTION) messages
// (TfDebug is not ported); the comments at their sites are kept.

import {
  CollectionExpressionEvaluator as HdCollectionExpressionEvaluator,
  CollectionsSchema as HdCollectionsSchema,
  ContainerDataSource as HdContainerDataSource,
  MaterialBindingSchema as HdMaterialBindingSchema,
  MaterialBindingsSchema as HdMaterialBindingsSchema,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  type AddedPrimEntry,
  type DataSourceBase as HdDataSourceBase,
  type DirtiedPrimEntry,
  type RemovedPrimEntry,
  type SceneIndexBase as HdSceneIndexBase,
  type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import type { PathExpression as SdfPathExpression } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { Type as TfType } from 'typescript-usd/tf'
import type {
  UsdImagingCollectionMaterialBindingVectorSchema,
  UsdImagingMaterialBindingSchema,
} from './materialBindingSchema.ts'
import type { UsdImagingDirectMaterialBindingSchema } from './directMaterialBindingSchema.ts'
import { UsdImagingMaterialBindingsSchema, type UsdImagingMaterialBindingVectorSchema } from './materialBindingsSchema.ts'

const _SdfPathType = TfType.declare('SdfPath')

// UsdShadeTokens->strongerThanDescendants
const _strongerThanDescendants = 'strongerThanDescendants'

/** materialBindingsResolvingSceneIndex.cpp:97-102 */
interface _ResolveInfo {
  materialPath: string
  strongerThanDescendants: boolean
  collectionPrimPathAndName: [string, string] | undefined
}

/** materialBindingsResolvingSceneIndex.cpp:33-281. Container that computes
 *  the resolved material binding from the flattened direct material
 *  bindings. */
class _HdMaterialBindingsDataSource extends HdContainerDataSource {
  constructor(
    private readonly _primContainer: HdContainerDataSource,
    private readonly _si: HdSceneIndexBase,
    private readonly _primPath: string,
  ) { super() }

  static new(
    primContainer: HdContainerDataSource, si: HdSceneIndexBase, primPath: string,
  ): _HdMaterialBindingsDataSource {
    return new _HdMaterialBindingsDataSource(primContainer, si, primPath)
  }

  /** materialBindingsResolvingSceneIndex.cpp:52-62 */
  getNames(): string[] {
    return UsdImagingMaterialBindingsSchema.getFromParent(
      this._primContainer).getPurposes()

    // Note: We don't check for collection membership here since it can be
    //       expensive and would involve pulling on bindings for purposes
    //       the renderer may not be interested in.
  }

  /** materialBindingsResolvingSceneIndex.cpp:64-93 */
  Get(name: string): HdDataSourceBase | undefined {
    const purpose = name

    const bindingVecSchema =
      UsdImagingMaterialBindingsSchema.getFromParent(
        this._primContainer).getMaterialBindings(purpose)

    const winningBindingPath = this._computeResolvedMaterialBinding(bindingVecSchema)

    // TF_DEBUG(USDIMAGING_MATERIAL_BINDING_RESOLUTION): resolved material
    // binding for purpose (not ported, see the header).

    return _HdMaterialBindingsDataSource._buildHdMaterialBindingDataSource(winningBindingPath)

    // Note: If the resolved path is the empty path, we don't fallback to
    //       checking/returning the binding for the empty (allPurpose)
    //       token, with the rationale being that a downstream scene index
    //       plugin enumerates the strength of the material binding purposes
    //       using for e.g. HdsiMaterialBindingResolvingSceneIndex.
  }

  /** materialBindingsResolvingSceneIndex.cpp:104-164 */
  private _computeCollectionResolveInfo(
    colVecSchema: UsdImagingCollectionMaterialBindingVectorSchema,
  ): _ResolveInfo | undefined {
    // Return the first collection binding that affects the prim.
    //
    for (let j = 0; j < colVecSchema.getNumElements(); j++) {
      const colBindingSchema = colVecSchema.getElement(j)

      const colPrimPathDs = colBindingSchema.getCollectionPrimPath()
      const colNameDs = colBindingSchema.getCollectionName()
      const matPathDs = colBindingSchema.getMaterialPath()
      const strengthDs = colBindingSchema.getBindingStrength()

      if (!(colPrimPathDs && colNameDs && matPathDs && strengthDs)) {
        continue
      }

      const collectionPrimPath = colPrimPathDs.getTypedValue(0.0)
      const collectionName = colNameDs.getTypedValue(0.0)

      // Query scene index to get collection path expression.
      const exprOpt = this._getCollectionPathExpression(collectionPrimPath, collectionName)
      if (!exprOpt) {
        continue
      }

      const evaluator = new HdCollectionExpressionEvaluator(this._si, exprOpt)
      // XXX This does not handle instance proxy paths yet.
      if (!evaluator.match(SdfPath.fromString(this._primPath)).GetValue()) {
        // TF_DEBUG: prim is NOT affected by the collection material binding.
        continue
      }

      // TF_DEBUG: prim IS affected by the collection material binding.

      return {
        materialPath: matPathDs.getTypedValue(0.0),
        strongerThanDescendants: strengthDs.getTypedValue(0.0) === _strongerThanDescendants,
        collectionPrimPathAndName: [collectionPrimPath, collectionName],
      }
    }

    return undefined
  }

  /** materialBindingsResolvingSceneIndex.cpp:166-185 */
  private _computeDirectResolveInfo(
    dirBindingSchema: UsdImagingDirectMaterialBindingSchema,
  ): _ResolveInfo | undefined {
    const dirBindingMatPathDs = dirBindingSchema.getMaterialPath()
    const dirBindingStrengthDs = dirBindingSchema.getBindingStrength()

    if (dirBindingMatPathDs && dirBindingStrengthDs) {
      return {
        materialPath: dirBindingMatPathDs.getTypedValue(0.0),
        strongerThanDescendants:
          dirBindingStrengthDs.getTypedValue(0.0) === _strongerThanDescendants,
        /* collectionPath */ collectionPrimPathAndName: undefined,
      }
    }

    return undefined
  }

  /** materialBindingsResolvingSceneIndex.cpp:187-267 */
  private _computeResolvedMaterialBinding(
    bindingVecSchema: UsdImagingMaterialBindingVectorSchema,
  ): string {
    // The input is a vector of {direct, collection} binding pairs.
    // The elements are ordered as in a DFS traversal with ancestors
    // appearing before descendants. So, if we find a binding with a
    // strongerThanDescendants strength, we can skip the rest of the
    // bindings.
    //
    let winningBindingPath = ''

    for (let i = 0; i < bindingVecSchema.getNumElements(); i++) {
      const bindingSchema: UsdImagingMaterialBindingSchema = bindingVecSchema.getElement(i)

      const colBindInfo = this._computeCollectionResolveInfo(
        bindingSchema.getCollectionMaterialBindings())

      if (colBindInfo && colBindInfo.strongerThanDescendants) {
        winningBindingPath = colBindInfo.materialPath

        // TF_DEBUG: binding strength for collection binding is
        // strongerThanDescendants. Skipping the rest of the bindings.

        break
      }

      const dirBindInfo = this._computeDirectResolveInfo(
        bindingSchema.getDirectMaterialBinding())

      if (dirBindInfo && dirBindInfo.strongerThanDescendants) {
        winningBindingPath = dirBindInfo.materialPath

        // TF_DEBUG: binding strength for direct binding is
        // strongerThanDescendants. Skipping the rest of the bindings.

        break
      }

      if (colBindInfo) {
        // Neither of the bindings is stronger than descendants.
        // The collection binding is considered stronger than the direct
        // binding at any namespace level.
        //
        winningBindingPath = colBindInfo.materialPath

        // TF_DEBUG: current winning material set for collection binding.

        continue
      }

      if (dirBindInfo) {
        // No collection binding was found, so the direct binding
        // wins. We still need to iterate over the rest of the
        // bindings.
        //
        winningBindingPath = dirBindInfo.materialPath

        // TF_DEBUG: current winning material set because the direct
        // binding is more local.
      }
    }

    return winningBindingPath
  }

  /** materialBindingsResolvingSceneIndex.cpp:269-284 */
  private _getCollectionPathExpression(
    primPath: string, collectionName: string,
  ): SdfPathExpression | undefined {
    const primDs = this._si.getPrim(primPath).dataSource
    const colSchema = HdCollectionsSchema.getFromParent(primDs).getCollection(collectionName)

    const exprDs = colSchema.getMembershipExpression()
    if (!exprDs) {
      return undefined
    }

    return exprDs.getTypedValue(0.0) as SdfPathExpression
  }

  /** materialBindingsResolvingSceneIndex.cpp:286-296 */
  private static _buildHdMaterialBindingDataSource(materialPath: string): HdDataSourceBase | undefined {
    return materialPath === ''
      ? undefined
      : new HdMaterialBindingSchema.Builder()
        .setPath(new HdRetainedTypedSampledDataSource(materialPath, _SdfPathType))
        .build()
  }
}

/** materialBindingsResolvingSceneIndex.cpp:303-358. Prim container override
 *  that provides the resolved hydra material bindings if direct or
 *  collection USD material bindings are present. */
class _PrimDataSource extends HdContainerDataSource {
  constructor(
    private readonly _primContainer: HdContainerDataSource,
    private readonly _si: HdSceneIndexBase,
    private readonly _primPath: string,
  ) { super() }

  static new(
    primContainer: HdContainerDataSource, si: HdSceneIndexBase, primPath: string,
  ): _PrimDataSource {
    return new _PrimDataSource(primContainer, si, primPath)
  }

  /** materialBindingsResolvingSceneIndex.cpp:318-324 */
  getNames(): string[] {
    const names = this._primContainer.getNames()
    names.push(HdMaterialBindingsSchema.getSchemaToken())
    return names
  }

  /** materialBindingsResolvingSceneIndex.cpp:326-350 */
  Get(name: string): HdDataSourceBase | undefined {
    const result = this._primContainer.Get(name)

    // Material bindings on the prim.
    if (name === HdMaterialBindingsSchema.getSchemaToken()) {
      // Check if we have USD material bindings on the prim to
      // avoid returning an empty non-null container.
      if (UsdImagingMaterialBindingsSchema.getFromParent(this._primContainer).isDefined()) {
        // We don't expect to have hydra material bindings on the
        // prim container. Use an overlay just in case such that the
        // existing opinion wins.
        return HdOverlayContainerDataSource.new(
          result instanceof HdContainerDataSource ? result : undefined,
          _HdMaterialBindingsDataSource.new(this._primContainer, this._si, this._primPath))
      }
    }

    return result
  }
}

// -----------------------------------------------------------------------------
// UsdImagingMaterialBindingsResolvingSceneIndex
// -----------------------------------------------------------------------------

/** materialBindingsResolvingSceneIndex.h:16-56. Scene index that computes
 *  the resolved material binding for a given purpose from the flattened
 *  direct material bindings and collection material bindings.
 *
 *  \note Current support does not factor in collection bindings. */
export class UsdImagingMaterialBindingsResolvingSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  /** materialBindingsResolvingSceneIndex.cpp:364-372 */
  static new(
    inputSceneIndex: HdSceneIndexBase,
    inputArgs?: HdContainerDataSource | undefined,
  ): UsdImagingMaterialBindingsResolvingSceneIndex {
    return new UsdImagingMaterialBindingsResolvingSceneIndex(inputSceneIndex, inputArgs)
  }

  /** materialBindingsResolvingSceneIndex.cpp:374-380 */
  protected constructor(
    inputSceneIndex: HdSceneIndexBase,
    _inputArgs: HdContainerDataSource | undefined,
  ) {
    super(inputSceneIndex)
  }

  /** materialBindingsResolvingSceneIndex.cpp:385-401 */
  getPrim(primPath: string): HdSceneIndexPrim {
    // Wrap the prim container to provide the resolved hydra bindings via
    // the "materialBindings" locator.
    const prim = this._getInputSceneIndex().getPrim(primPath)
    if (prim.dataSource) {
      return {
        primType: prim.primType,
        dataSource: _PrimDataSource.new(
          prim.dataSource, this._getInputSceneIndex(), primPath),
      }
    }

    return prim
  }

  /** materialBindingsResolvingSceneIndex.cpp:403-409 */
  getChildPrimPaths(primPath: string): string[] {
    // This scene index does not mutate the topology.
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** materialBindingsResolvingSceneIndex.cpp:411-421 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    // For now, just forward the notices. We could suppress notices
    // for USD material bindings schemata locators since scene indices
    // downstream shouldn't be interested in these notices.
    //
    this._sendPrimsAdded(entries)
  }

  /** materialBindingsResolvingSceneIndex.cpp:423-430 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    // Comments above in _PrimsAdded are relevant here.
    this._sendPrimsRemoved(entries)
  }

  /** materialBindingsResolvingSceneIndex.cpp:432-475 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    // Check if the notice entries can be forwarded as-is.
    let hasDirtyUsdMaterialBindings = false
    for (const entry of entries) {
      if (entry.dirtyLocators.intersects(
        UsdImagingMaterialBindingsSchema.getDefaultLocator())) {
        hasDirtyUsdMaterialBindings = true
        break
      }
    }

    if (!hasDirtyUsdMaterialBindings) {
      this._sendPrimsDirtied(entries)
      return
    }

    // Transform dirty notices for USD material bindings into ones for
    // Hydra material bindings. This effectively suppresses the former notices,
    // which is fine because downstream consumers should work off the
    // Hydra material binding notices.
    //
    const newEntries: DirtiedPrimEntry[] = []
    for (const entry of entries) {
      if (entry.dirtyLocators.intersects(
        UsdImagingMaterialBindingsSchema.getDefaultLocator())) {
        let newLocators = new HdDataSourceLocatorSet(entry.dirtyLocators)
        newLocators = newLocators.replacePrefix(
          UsdImagingMaterialBindingsSchema.getDefaultLocator(),
          HdMaterialBindingsSchema.getDefaultLocator())

        newEntries.push({ primPath: entry.primPath, dirtyLocators: newLocators })
      } else {
        newEntries.push(entry)
      }
    }

    this._sendPrimsDirtied(newEntries)
  }
}
