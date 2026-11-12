// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/dependencySceneIndexPlugin.cpp,
//  pxr/imaging/hdSt/dependencySceneIndexPlugin.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdSt/dependencySceneIndexPlugin.{h,cpp}:
// declares the dependencies Storm needs (a volume's volumeFieldBinding on
// its fields' volumeField; a mesh's materialBindings on its material).
//
// The two TF_REGISTRY_FUNCTION blocks run at the end of this module: the
// TfType one defines the plugin type, the HdSceneIndexPlugin one is a
// TfRegistryManager function HdSceneIndexPluginRegistry runs
// (sceneIndexPluginRegistry.ts).

import { TfRegistryManager } from 'typescript-usd/tf'
import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocator as HdDataSourceLocator,
  DependenciesSchema as HdDependenciesSchema,
  DependencySchema as HdDependencySchema,
  InsertionOrder as HdSceneIndexPluginRegistryInsertionOrder,
  MapContainerDataSource as HdMapContainerDataSource,
  MaterialBindingsSchema as HdMaterialBindingsSchema,
  MaterialSchema as HdMaterialSchema,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  PrimTypeTokens as HdPrimTypeTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SceneIndexPlugin as HdSceneIndexPlugin,
  SceneIndexPluginRegistry as HdSceneIndexPluginRegistry,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  VolumeFieldBindingSchema as HdVolumeFieldBindingSchema,
  VolumeFieldSchema as HdVolumeFieldSchema,
  type AddedPrimEntry as HdAddedPrimEntry,
  type DataSourceBase as HdDataSourceBase,
  type DirtiedPrimEntry as HdDirtiedPrimEntry,
  type PathDataSource as HdPathDataSource,
  type RemovedPrimEntry as HdRemovedPrimEntry,
  type SceneIndexBase as HdSceneIndexBase,
  type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'

// dependencySceneIndexPlugin.cpp:26-34
const _tokens = {
  sceneIndexPluginName: 'HdSt_DependencySceneIndexPlugin',

  storm_volumeFieldBindingToDependency: 'storm_volumeFieldBindingToDependency',

  storm_materialToMaterialBindings: 'storm_materialToMaterialBindings',
  storm_materialBindingsToDependency: 'storm_materialBindingsToDependency',
} as const

// dependencySceneIndexPlugin.cpp:36
const _pluginDisplayName = 'GL'


/** dependencySceneIndexPlugin.cpp:61-66 */
function _AddIfNecessary(name: string, names: string[]): void {
  if (!names.includes(name)) {
    names.push(name)
  }
}

const _locator = (locator: HdDataSourceLocator) =>
  HdRetainedTypedSampledDataSource.new<HdDataSourceLocator>(locator)

let _materialLocDs: HdDataSourceBase | undefined
let _materialBindingsLocDs: HdDataSourceBase | undefined
let _materialBindingsDependencyDs: HdDataSourceBase | undefined

/** dependencySceneIndexPlugin.cpp:68-121 */
function _ComputeMaterialBindingsDependency(
  inputDs: HdContainerDataSource | undefined,
): HdContainerDataSource {
  const materialBindings =
    HdMaterialBindingsSchema.getFromParent(inputDs)

  const names: string[] = []
  const dataSources: HdDataSourceBase[] = []

  const materialLocDs = _materialLocDs ??= _locator(HdMaterialSchema.getDefaultLocator())
  const materialBindingsLocDs = _materialBindingsLocDs ??=
    _locator(HdMaterialBindingsSchema.getDefaultLocator())

  // HdsiMaterialBindingResolvingSceneIndex already ran, so we can just
  // call GetMaterialBinding here (which uses the allPurpose binding).
  const pathDs = materialBindings.getMaterialBinding().getPath()
  if (pathDs) {
    if (pathDs.getTypedValue(0.0) !== '') {
      const dependencyDs =
        new HdDependencySchema.Builder()
          .setDependedOnPrimPath(pathDs)
          .setDependedOnDataSourceLocator(materialLocDs as never)
          .setAffectedDataSourceLocator(materialBindingsLocDs as never)
          .build()
      names.push(_tokens.storm_materialToMaterialBindings)
      dataSources.push(dependencyDs)
    }
  }

  {
    const dependencyDs = _materialBindingsDependencyDs ??=
      new HdDependencySchema.Builder()
        // Prim depends on itself.
        .setDependedOnDataSourceLocator(materialBindingsLocDs as never)
        .setAffectedDataSourceLocator(_locator(
          HdDependenciesSchema.getDefaultLocator().append(
            _tokens.storm_materialToMaterialBindings)) as never)
        .build()
    names.push(_tokens.storm_materialBindingsToDependency)
    dataSources.push(dependencyDs)
  }

  return HdRetainedContainerDataSource.new(names, dataSources)
}

let _volumeFieldLocDs: HdDataSourceBase | undefined
let _volumeFieldBindingLocDs: HdDataSourceBase | undefined

/** dependencySceneIndexPlugin.cpp:123-141. Given a prim path data source,
 *  returns a dependency of volumeFieldBinding on volumeField of that given
 *  prim. */
function _ComputeVolumeFieldDependency(pathDs: HdDataSourceBase): HdDataSourceBase {
  const dependedOnLocatorDataSource = _volumeFieldLocDs ??=
    _locator(HdVolumeFieldSchema.getDefaultLocator())
  const affectedLocatorDataSource = _volumeFieldBindingLocDs ??=
    _locator(HdVolumeFieldBindingSchema.getDefaultLocator())

  return new HdDependencySchema.Builder()
    .setDependedOnPrimPath(pathDs as HdPathDataSource)
    .setDependedOnDataSourceLocator(dependedOnLocatorDataSource as never)
    .setAffectedDataSourceLocator(affectedLocatorDataSource as never)
    .build()
}

/** dependencySceneIndexPlugin.cpp:143-152 */
function _ComputeVolumeFieldBindingDependencies(
  primSource: HdContainerDataSource | undefined,
): HdContainerDataSource {
  return HdMapContainerDataSource.new(
    _ComputeVolumeFieldDependency,
    HdVolumeFieldBindingSchema.getFromParent(primSource).getContainer())
}

let _volumeFieldBindingDependencyDependencies: HdContainerDataSource | undefined

/** dependencySceneIndexPlugin.cpp:154-174. Returns a dependency of
 *  __dependencies on volumeFieldBinding of the prim. */
function _ComputeVolumeFieldBindingDependencyDependencies(): HdContainerDataSource {
  return _volumeFieldBindingDependencyDependencies ??=
    HdRetainedContainerDataSource.new(
      [_tokens.storm_volumeFieldBindingToDependency],
      [new HdDependencySchema.Builder()
        .setDependedOnDataSourceLocator(
          _locator(HdVolumeFieldBindingSchema.getDefaultLocator()) as never)
        .setAffectedDataSourceLocator(
          _locator(HdDependenciesSchema.getDefaultLocator()) as never)
        .build()])
}

/** dependencySceneIndexPlugin.cpp:177-255 */
class _PrimDataSource extends HdContainerDataSource {
  constructor(private readonly _inputPrim: HdSceneIndexPrim) { super() }

  static new(inputPrim: HdSceneIndexPrim): _PrimDataSource {
    return new _PrimDataSource(inputPrim)
  }

  getNames(): string[] {
    const result = [...(this._inputPrim.dataSource?.getNames() ?? [])]
    if (this._inputPrim.primType === HdPrimTypeTokens.volume ||
        HdMaterialBindingsSchema.getFromParent(this._inputPrim.dataSource).isDefined()) {
      _AddIfNecessary(HdDependenciesSchema.getSchemaToken(), result)
    }
    return result
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdDependenciesSchema.getSchemaToken()) {
      return this._getDependencies()
    }
    return this._inputPrim.dataSource?.Get(name)
  }

  private _getDependencies(): HdContainerDataSource | undefined {
    const dataSources: HdContainerDataSource[] = []

    const ds = HdDependenciesSchema.getFromParent(this._inputPrim.dataSource).getContainer()
    if (ds) {
      dataSources.push(ds)
    }

    if (this._inputPrim.primType === HdPrimTypeTokens.mesh) {
      // TODO: We need to add dependencies on the material's
      // bound by geomSubset's since geomSubset's could bind a
      // material with a ptex.
      dataSources.push(
        _ComputeMaterialBindingsDependency(
          this._inputPrim.dataSource))
    }

    if (this._inputPrim.primType === HdPrimTypeTokens.volume) {
      dataSources.push(
        _ComputeVolumeFieldBindingDependencies(
          this._inputPrim.dataSource))
      dataSources.push(
        _ComputeVolumeFieldBindingDependencyDependencies())
    }

    switch (dataSources.length) {
      case 0: return undefined
      case 1: return dataSources[0]
      default: return HdOverlayContainerDataSource.new(...dataSources)
    }
  }
}

/** dependencySceneIndexPlugin.cpp:259-317. The scene index that adds
 *  dependencies for volume prims. */
class _SceneIndex extends HdSingleInputFilteringSceneIndexBase {
  static new(inputSceneIndex: HdSceneIndexBase): _SceneIndex {
    return new _SceneIndex(inputSceneIndex)
  }

  protected constructor(inputSceneIndex: HdSceneIndexBase) {
    super(inputSceneIndex)
    this.setDisplayName('HdSt: declare Storm dependencies')
  }

  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)
    if (prim.dataSource) {
      return { primType: prim.primType, dataSource: _PrimDataSource.new(prim) }
    }
    return prim
  }

  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  protected _primsAdded(_sender: HdSceneIndexBase, entries: HdAddedPrimEntry[]): void {
    this._sendPrimsAdded(entries)
  }

  protected _primsRemoved(_sender: HdSceneIndexBase, entries: HdRemovedPrimEntry[]): void {
    this._sendPrimsRemoved(entries)
  }

  protected _primsDirtied(_sender: HdSceneIndexBase, entries: HdDirtiedPrimEntry[]): void {
    this._sendPrimsDirtied(entries)
  }
}

/** dependencySceneIndexPlugin.h */
export class HdSt_DependencySceneIndexPlugin extends HdSceneIndexPlugin {
  /** dependencySceneIndexPlugin.cpp:326-332 */
  protected override _appendSceneIndex(
    inputScene: HdSceneIndexBase,
    _inputArgs: HdContainerDataSource | undefined,
  ): HdSceneIndexBase {
    return _SceneIndex.new(inputScene)
  }
}

// dependencySceneIndexPlugin.cpp:38-56: TF_REGISTRY_FUNCTION(TfType).
HdSceneIndexPluginRegistry.define(_tokens.sceneIndexPluginName, HdSt_DependencySceneIndexPlugin)

// dependencySceneIndexPlugin.cpp:38-56: TF_REGISTRY_FUNCTION(HdSceneIndexPlugin).
TfRegistryManager.add(HdSceneIndexPlugin, () => {
  // This scene index should be added *before*
  // HdSt_DependencyForwardingSceneIndexPlugin (which currently uses 1000).
  const insertionPhase = 100

  HdSceneIndexPluginRegistry.GetInstance().registerSceneIndexForRenderer(
    _pluginDisplayName,
    _tokens.sceneIndexPluginName,
    /* inputArgs = */ null,
    insertionPhase,
    HdSceneIndexPluginRegistryInsertionOrder.InsertionOrderAtStart)
})
