// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdsi/materialBindingResolvingSceneIndex.cpp,
//  pxr/imaging/hdsi/materialBindingResolvingSceneIndex.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdsi/materialBindingResolvingSceneIndex.{h,cpp}.

import {
  ContainerDataSource as HdContainerDataSource,
  MaterialBindingsSchema as HdMaterialBindingsSchema,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
} from 'typescript-usd/hd'
import type {
  AddedPrimEntry,
  DataSourceBase as HdDataSourceBase,
  DirtiedPrimEntry,
  RemovedPrimEntry,
  SceneIndexBase as HdSceneIndexBase,
  SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'

/** materialBindingResolvingSceneIndex.cpp:16-78 */
class _MaterialBindingsDataSource extends HdContainerDataSource {
  constructor(
    private readonly _input: HdContainerDataSource | undefined,
    private readonly _purposePriorityOrder: readonly string[],
    private readonly _dstPurpose: string,
  ) {
    super()
  }

  static new(
    input: HdContainerDataSource | undefined,
    purposePriorityOrder: readonly string[],
    dstPurpose: string,
  ): _MaterialBindingsDataSource {
    return new _MaterialBindingsDataSource(input, purposePriorityOrder, dstPurpose)
  }

  getNames(): string[] {
    if (!this._input) {
      return []
    }

    if (this._hasAny()) {
      return [
        this._dstPurpose,
      ]
    }
    return []
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (!this._input) {
      return undefined
    }

    if (name !== this._dstPurpose) {
      return undefined
    }

    for (const purpose of this._purposePriorityOrder) {
      const data = this._input.Get(purpose)
      if (data) {
        return data
      }
    }
    return undefined
  }

  private _hasAny(): boolean {
    const names = this._input!.getNames()
    for (const purpose of this._purposePriorityOrder) {
      if (names.includes(purpose)) {
        return true
      }
    }
    return false
  }
}

/** materialBindingResolvingSceneIndex.cpp:80-124 */
class _PrimDataSource extends HdContainerDataSource {
  constructor(
    private readonly _input: HdContainerDataSource | undefined,
    private readonly _purposePriorityOrder: readonly string[],
    private readonly _dstPurpose: string,
  ) {
    super()
  }

  static new(
    input: HdContainerDataSource | undefined,
    purposePriorityOrder: readonly string[],
    dstPurpose: string,
  ): _PrimDataSource {
    return new _PrimDataSource(input, purposePriorityOrder, dstPurpose)
  }

  getNames(): string[] {
    if (!this._input) {
      return []
    }
    return this._input.getNames()
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (!this._input) {
      return undefined
    }

    const data = this._input.Get(name)
    if (name === HdMaterialBindingsSchema.getSchemaToken()) {
      if (data instanceof HdContainerDataSource) {
        const materialBindingContainer = data
        return _MaterialBindingsDataSource.new(
          materialBindingContainer, this._purposePriorityOrder, this._dstPurpose)
      }
    }
    return data
  }
}

/**
 * Scene Index that resolves materialBindings that have multiple purposes into
 * a single purpose.  The first binding encountered in `purposePriorityOrder`
 * will be provided as `dstPurpose`.
 *
 * (materialBindingResolvingSceneIndex.h:18-58)
 */
export class HdsiMaterialBindingResolvingSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  private readonly _purposePriorityOrder: string[]
  private readonly _dstPurpose: string

  /** materialBindingResolvingSceneIndex.cpp:128-137 */
  static new(
    inputSceneIndex: HdSceneIndexBase,
    purposePriorityOrder: readonly string[],
    dstPurpose: string,
  ): HdsiMaterialBindingResolvingSceneIndex {
    return new HdsiMaterialBindingResolvingSceneIndex(
      inputSceneIndex, purposePriorityOrder, dstPurpose)
  }

  /** materialBindingResolvingSceneIndex.cpp:187-195 */
  protected constructor(
    inputSceneIndex: HdSceneIndexBase,
    purposePriorityOrder: readonly string[],
    dstPurpose: string,
  ) {
    super(inputSceneIndex)
    this._purposePriorityOrder = [...purposePriorityOrder]
    this._dstPurpose = dstPurpose
  }

  /** materialBindingResolvingSceneIndex.cpp:139-151 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const input = this._getInputSceneIndex()
    if (input) {
      const prim = input.getPrim(primPath)
      if (prim.dataSource) {
        return {
          primType: prim.primType,
          dataSource: _PrimDataSource.new(
            prim.dataSource, this._purposePriorityOrder, this._dstPurpose),
        }
      }
      return prim
    }
    return { primType: '', dataSource: undefined }
  }

  /** materialBindingResolvingSceneIndex.cpp:153-161 */
  getChildPrimPaths(primPath: string): string[] {
    const input = this._getInputSceneIndex()
    if (input) {
      return input.getChildPrimPaths(primPath)
    }
    return []
  }

  /** materialBindingResolvingSceneIndex.cpp:163-169 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    this._sendPrimsAdded(entries)
  }

  /** materialBindingResolvingSceneIndex.cpp:171-177 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    this._sendPrimsRemoved(entries)
  }

  /** materialBindingResolvingSceneIndex.cpp:179-185 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    this._sendPrimsDirtied(entries)
  }
}
