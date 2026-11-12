// Ported from OpenUSD 26.11.1: pxr/usd/sdf/notice.cpp, pxr/usd/sdf/notice.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// SdfNotice from OpenUSD v26.08 pxr/usd/sdf/notice.{h,cpp}: the notices Sdf
// sends when layers change.

import { Notice as TfNotice } from 'typescript-usd/tf'
import type { SdfLayerChangeListVec } from './changeList.ts'
import type { Layer } from './layer.ts'

export namespace SdfNotice {
  /** Base notification class for scene. Only useful for type hierarchy purposes. */
  export class Base extends TfNotice {}

  // BaseLayersDidChange: the shared payload of the LayersDidChange notices.
  export interface BaseLayersDidChange {
    getLayers(): Layer[]
    getChangeListVec(): SdfLayerChangeListVec<Layer>
    getSerialNumber(): number
  }

  abstract class LayersDidChangeBase extends Base implements BaseLayersDidChange {
    constructor(
      private readonly _vec: SdfLayerChangeListVec<Layer>,
      private readonly _serialNumber: number,
    ) { super() }

    getLayers(): Layer[] { return this._vec.map(([layer]) => layer) }
    getChangeListVec(): SdfLayerChangeListVec<Layer> { return this._vec }
    getSerialNumber(): number { return this._serialNumber }
  }

  /**
   * Notice sent per-layer indicating all layers whose contents have changed
   * within a single round of change processing. If more than one layer
   * changes in a single round of change processing, we send this notice once
   * per layer with the same changeVec and serialNumber.
   */
  export class LayersDidChangeSentPerLayer extends LayersDidChangeBase {}

  /** Global notice sent to indicate that layer contents have changed. */
  export class LayersDidChange extends LayersDidChangeBase {}

  /** Sent when the (scene spec) info of a layer have changed. */
  export class LayerInfoDidChange extends Base {
    constructor(private readonly _key: string) { super() }
    key(): string { return this._key }
  }

  /** Sent when the identifier of a layer has changed. */
  export class LayerIdentifierDidChange extends Base {
    constructor(private readonly _oldId: string, private readonly _newId: string) { super() }
    getOldIdentifier(): string { return this._oldId }
    getNewIdentifier(): string { return this._newId }
  }

  /** Sent after a layer has been loaded from a file. */
  export class LayerDidReplaceContent extends Base {}

  /** Sent after a layer is reloaded. */
  export class LayerDidReloadContent extends LayerDidReplaceContent {}

  /** Sent after a layer is saved to file. */
  export class LayerDidSaveLayerToFile extends Base {}

  /** Similar behavior to LayersDidChange, but only gets sent if a change in
   * the dirty status of a layer occurs. */
  export class LayerDirtinessChanged extends Base {}

  /** Sent after a layer has been added or removed from the set of muted
   * layers. */
  export class LayerMutenessChanged extends Base {
    constructor(private readonly _layerPath: string, private readonly _wasMuted: boolean) {
      super()
    }
    getLayerPath(): string { return this._layerPath }
    wasMuted(): boolean { return this._wasMuted }
  }
}
