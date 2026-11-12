// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdsi/materialPrimvarTransferSceneIndex.cpp,
//  pxr/imaging/hdsi/materialPrimvarTransferSceneIndex.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdsi/materialPrimvarTransferSceneIndex.{h,cpp}.

import {
  ContainerDataSource as HdContainerDataSource,
  DependenciesSchema as HdDependenciesSchema,
  DependencySchema as HdDependencySchema,
  MaterialBindingsSchema as HdMaterialBindingsSchema,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  PrimvarsSchema as HdPrimvarsSchema,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
} from 'typescript-usd/hd'
import type {
  AddedPrimEntry,
  DataSourceBase as HdDataSourceBase,
  DataSourceLocator as HdDataSourceLocator,
  DirtiedPrimEntry,
  LocatorDataSource as HdLocatorDataSource,
  RemovedPrimEntry,
  SceneIndexBase as HdSceneIndexBase,
  SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'

// materialPrimvarTransferSceneIndex.cpp:16-21
const _tokens = {
  materialPrimvarTransfer_materialBindingsToPrimvars: 'materialPrimvarTransfer_materialBindingsToPrimvars',
  materialPrimvarTransfer_materialPrimvarsToPrimvars: 'materialPrimvarTransfer_materialPrimvarsToPrimvars',
  materialPrimvarTransfer_materialBindingsToDependency: 'materialPrimvarTransfer_materialBindingsToDependency',
} as const

/**
 * Type signature for function used to compose a single primvar
 * using the primvars from geometry and a bound material.
 * The first argument is the container data source for the
 * geometry primvars, the second is the container data source
 * for the material primvars, and the third is the primvar name.
 * Note that this composes just the single named primvar,
 * returning a data source for that primvar.
 *
 * (materialPrimvarTransferSceneIndex.h:40-51)
 */
export type HdsiMaterialPrimvarTransferSceneIndexComposeFn = (
  dsStrong: HdContainerDataSource | undefined,
  dsWeak: HdContainerDataSource | undefined,
  name: string,
) => HdDataSourceBase | undefined

/** materialPrimvarTransferSceneIndex.cpp:26-31 */
function _AddIfNecessary(name: string, names: string[]): void {
  if (!names.includes(name)) {
    names.push(name)
  }
}

/** materialPrimvarTransferSceneIndex.cpp:33-43 */
function _GetMaterialPath(materialBindings: HdMaterialBindingsSchema): string {
  const ds =
    materialBindings
      .getMaterialBinding()
      .getPath()
  if (!ds) {
    return ''
  }
  return ds.getTypedValue(0)
}

/** materialPrimvarTransferSceneIndex.cpp:45-136 */
class _PrimvarsDataSource extends HdContainerDataSource {
  private _materialPrimvarsDs: HdContainerDataSource | undefined

  private constructor(
    private readonly _inputScene: HdSceneIndexBase,
    private readonly _primDs: HdContainerDataSource | undefined,
    private readonly _primvarsDs: HdContainerDataSource | undefined,
    private readonly _composeFn: HdsiMaterialPrimvarTransferSceneIndexComposeFn | undefined,
  ) {
    super()
  }

  static new(
    inputScene: HdSceneIndexBase,
    primDs: HdContainerDataSource | undefined,
    primvarsDs: HdContainerDataSource | undefined,
    composeFn: HdsiMaterialPrimvarTransferSceneIndexComposeFn | undefined,
  ): _PrimvarsDataSource {
    return new _PrimvarsDataSource(inputScene, primDs, primvarsDs, composeFn)
  }

  getNames(): string[] {
    const mpds = this._getPrimvarsFromMaterial()
    // Null checks.
    if (!this._primvarsDs && !mpds) {
      return []
    } else if (!mpds) {
      return this._primvarsDs!.getNames()
    } else if (!this._primvarsDs) {
      return mpds.getNames()
    }

    const primvarsNames = this._primvarsDs.getNames()
    const mpdsNames = mpds.getNames()

    // If one or the other is empty.
    if (mpdsNames.length === 0) {
      return primvarsNames
    } else if (primvarsNames.length === 0) {
      return mpdsNames
    }

    // Otherwise, union them.
    const names = new Set<string>()
    for (const n of primvarsNames) names.add(n)
    for (const n of mpdsNames) names.add(n)
    return [...names]
  }

  Get(name: string): HdDataSourceBase | undefined {
    // Use the compose function if provided.
    // If not provided, we use the code path below, which avoids
    // calling _GetPrimvarsFromMaterial() until necessary.
    if (this._composeFn) {
      return this._composeFn(this._primvarsDs, this._getPrimvarsFromMaterial(), name)
    }
    const primvar = this._primvarsDs ? this._primvarsDs.Get(name) : undefined
    if (primvar) {
      return primvar
    }
    const mpds = this._getPrimvarsFromMaterial()
    if (mpds) {
      return mpds.Get(name)
    }
    return undefined
  }

  private _getPrimvarsFromMaterial(): HdContainerDataSource | undefined {
    let mpds = this._materialPrimvarsDs
    if (mpds) {
      return mpds
    }

    const materialPath = _GetMaterialPath(
      HdMaterialBindingsSchema.getFromParent(this._primDs))
    if (materialPath === '') {
      return undefined
    }
    const materialPrim =
      this._inputScene.getPrim(materialPath)
    mpds = HdPrimvarsSchema.getFromParent(materialPrim.dataSource)
      .getContainer()

    this._materialPrimvarsDs = mpds
    return mpds
  }
}

let _materialBindingsLocDs: HdLocatorDataSource | undefined
let _primvarsLocDs: HdLocatorDataSource | undefined
let _materialBindingsToPrimvarsDependencyDs: HdDataSourceBase | undefined
let _dependencyLocDs: HdLocatorDataSource | undefined
let _materialBindingsToDependencyDependencyDs: HdDataSourceBase | undefined

/** materialPrimvarTransferSceneIndex.cpp:138-275 */
class _PrimDataSource extends HdContainerDataSource {
  private constructor(
    private readonly _inputScene: HdSceneIndexBase,
    private readonly _inputDs: HdContainerDataSource,
    private readonly _composeFn: HdsiMaterialPrimvarTransferSceneIndexComposeFn | undefined,
  ) {
    super()
  }

  static new(
    inputScene: HdSceneIndexBase,
    inputDs: HdContainerDataSource,
    composeFn: HdsiMaterialPrimvarTransferSceneIndexComposeFn | undefined,
  ): _PrimDataSource {
    return new _PrimDataSource(inputScene, inputDs, composeFn)
  }

  getNames(): string[] {
    const result = this._inputDs.getNames()
    const materialBindings =
      HdMaterialBindingsSchema.getFromParent(this._inputDs)
    if (materialBindings.isDefined()) {
      _AddIfNecessary(HdDependenciesSchema.getSchemaToken(), result)
      if (_GetMaterialPath(materialBindings) !== '') {
        _AddIfNecessary(HdPrimvarsSchema.getSchemaToken(), result)
      }
    }
    return result
  }

  Get(name: string): HdDataSourceBase | undefined {
    const ds = this._inputDs.Get(name)

    if (name === HdPrimvarsSchema.getSchemaToken()) {
      // Note that the "primvars" container we pass in might be null...
      return _PrimvarsDataSource.new(this._inputScene, this._inputDs,
        ds instanceof HdContainerDataSource ? ds : undefined, this._composeFn)
    }
    if (name === HdDependenciesSchema.getSchemaToken()) {
      return HdOverlayContainerDataSource.overlayedContainerDataSources(
        ds instanceof HdContainerDataSource ? ds : undefined,
        this._getDependencies())
    }
    return ds
  }

  private _getDependencies(): HdContainerDataSource | undefined {
    const materialBindings =
      HdMaterialBindingsSchema.getFromParent(this._inputDs)
    if (!materialBindings.isDefined()) {
      // Note: while we support the case that the content of the
      // container data source at materialBindings change, we do
      // not support the case where a prim started with no
      // data source for materialBindings and adds that data source
      // later.
      return undefined
    }

    // We need to create three dependencies here:
    // 1) Our primvars potentially depend on the value of the
    //    material binding changing
    // 2) Our primvars depend on the primvars of the bound material
    //    prim.
    // 3) Dependency 2) itself depends on the value of the bound
    //    material prim!

    const names: string[] = []
    const dataSources: HdDataSourceBase[] = []

    const materialBindingsLocDs = _materialBindingsLocDs ??=
      HdRetainedTypedSampledDataSource.new<HdDataSourceLocator>(
        HdMaterialBindingsSchema.getDefaultLocator())
    const primvarsLocDs = _primvarsLocDs ??=
      HdRetainedTypedSampledDataSource.new<HdDataSourceLocator>(
        HdPrimvarsSchema.getDefaultLocator())

    {
      const dependencyDs = _materialBindingsToPrimvarsDependencyDs ??=
        new HdDependencySchema.Builder()
          // Prim depends on itself.
          .setDependedOnDataSourceLocator(materialBindingsLocDs)
          .setAffectedDataSourceLocator(primvarsLocDs)
          .build()
      names.push(
        _tokens.materialPrimvarTransfer_materialBindingsToPrimvars)
      dataSources.push(
        dependencyDs)
    }

    const pathDs = materialBindings.getMaterialBinding().getPath()
    if (pathDs) {
      if (pathDs.getTypedValue(0) !== '') {
        const dependencyDs =
          new HdDependencySchema.Builder()
            .setDependedOnPrimPath(pathDs)
            .setDependedOnDataSourceLocator(primvarsLocDs)
            .setAffectedDataSourceLocator(primvarsLocDs)
            .build()
        names.push(
          _tokens.materialPrimvarTransfer_materialPrimvarsToPrimvars)
        dataSources.push(
          dependencyDs)
      }
    }

    {
      const dependencyLocDs = _dependencyLocDs ??=
        HdRetainedTypedSampledDataSource.new<HdDataSourceLocator>(
          HdDependenciesSchema.getDefaultLocator().append(
            _tokens
              .materialPrimvarTransfer_materialPrimvarsToPrimvars,
          ))

      const dependencyDs = _materialBindingsToDependencyDependencyDs ??=
        new HdDependencySchema.Builder()
          // Prim depends on itself.
          .setDependedOnDataSourceLocator(materialBindingsLocDs)
          .setAffectedDataSourceLocator(dependencyLocDs)
          .build()
      names.push(
        _tokens.materialPrimvarTransfer_materialBindingsToDependency)
      dataSources.push(
        dependencyDs)
    }

    return HdRetainedContainerDataSource.new(names, dataSources)
  }
}

/**
 * Transfers primvars present on the locally bound material. Any matching
 * primvar already present will have a stronger opinion.
 *
 * As it's expected that primvars inherited by the destination location
 * should have a stronger opinion than those transfered here, inherited
 * primvars must be flattened in advance of this scene index.
 *
 * This is in support of shading workflows.
 *
 * This also declares dependencies to ensure invalidation if a
 * HdDependencyForwardingSceneIndex is present downstream. (Because those
 * dependencies are computed on demand, no meaningful additional work is done
 * otherwise.)
 *
 * Some renderers have special syntax and semantics for how attributes
 * may be combined.  To accommmodate this, an optional ComposeFn may be
 * provided to implement this behavior.
 *
 * (materialPrimvarTransferSceneIndex.h:18-91)
 */
export class HdsiMaterialPrimvarTransferSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  private readonly _composeFn: HdsiMaterialPrimvarTransferSceneIndexComposeFn | undefined

  /** materialPrimvarTransferSceneIndex.cpp:281-288 */
  private constructor(
    inputSceneIndex: HdSceneIndexBase,
    composeFn: HdsiMaterialPrimvarTransferSceneIndexComposeFn | undefined,
  ) {
    super(inputSceneIndex)
    this._composeFn = composeFn
  }

  /** The default compose function used if none is provided.
   * (materialPrimvarTransferSceneIndex.cpp:293-310) */
  static defaultComposeFn(
    geometryPrimvarDs: HdContainerDataSource | undefined,
    materialPrimvarDs: HdContainerDataSource | undefined,
    name: string,
  ): HdDataSourceBase | undefined {
    if (geometryPrimvarDs) {
      const v = geometryPrimvarDs.Get(name)
      if (v) {
        return v
      }
    }
    if (materialPrimvarDs) {
      const v = materialPrimvarDs.Get(name)
      if (v) {
        return v
      }
    }
    return undefined
  }

  /** materialPrimvarTransferSceneIndex.cpp:312-319 */
  static new(
    inputSceneIndex: HdSceneIndexBase,
    composeFn?: HdsiMaterialPrimvarTransferSceneIndexComposeFn,
  ): HdsiMaterialPrimvarTransferSceneIndex {
    return new HdsiMaterialPrimvarTransferSceneIndex(
      inputSceneIndex, composeFn)
  }

  /** materialPrimvarTransferSceneIndex.cpp:321-332 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)
    // won't have any bindings if we don't have a data source
    if (prim.dataSource) {
      return {
        primType: prim.primType,
        dataSource:
          _PrimDataSource.new(this._getInputSceneIndex(), prim.dataSource,
            this._composeFn),
      }
    }
    return prim
  }

  /** materialPrimvarTransferSceneIndex.cpp:334-339 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** materialPrimvarTransferSceneIndex.cpp:341-347 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    this._sendPrimsAdded(entries)
  }

  /** materialPrimvarTransferSceneIndex.cpp:349-355 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    this._sendPrimsRemoved(entries)
  }

  /** materialPrimvarTransferSceneIndex.cpp:357-363 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    this._sendPrimsDirtied(entries)
  }
}
