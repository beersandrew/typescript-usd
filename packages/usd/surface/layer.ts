// Ported from OpenUSD 26.11.1: pxr/usd/sdf/layer.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Surface Layer: one call per member into the core's SdfLayer
// (pxr/usd/sdf/src/layer.ts; OpenUSD pxr/usd/sdf/layer.h).
import { Layer as CoreLayer } from 'typescript-usd/sdf'
import { ensure, guard, guardAsync } from './error.ts'
import { identifierOf } from './values.ts'

const wrappers = new WeakMap<CoreLayer, Layer>()

/**
 * A layer: one file (or anonymous in-memory document) of scene description.
 *
 * @upstream SdfLayer
 */
export class Layer {
  readonly #core: CoreLayer

  private constructor(core: CoreLayer) {
    this.#core = core
  }

  /**
   * The surface layer for a core layer (the same object each time).
   *
   * @upstream none
   */
  static fromCore(core: CoreLayer): Layer {
    let layer = wrappers.get(core)
    if (!layer) wrappers.set(core, layer = new Layer(core))
    return layer
  }

  /**
   * A new empty anonymous layer.
   *
   * @param tag - Text included in the anonymous identifier.
   * @upstream SdfLayer::CreateAnonymous
   */
  static createAnonymous(tag?: string): Layer {
    return Layer.fromCore(guard('Layer.createAnonymous', () => CoreLayer.createAnonymous(tag)))
  }

  /**
   * The core SdfLayer this wraps, for APIs the surface does not cover yet.
   *
   * @upstream none
   */
  get core(): CoreLayer {
    return this.#core
  }

  /**
   * The layer's identifier.
   *
   * @upstream SdfLayer::GetIdentifier
   */
  get identifier(): string {
    return this.#core.identifier
  }

  /**
   * The layer's name for display: its file name.
   *
   * @upstream SdfLayer::GetDisplayName
   */
  get displayName(): string {
    return this.#core.getDisplayName()
  }

  /**
   * Whether the layer is anonymous (in memory, never saved).
   *
   * @upstream SdfLayer::IsAnonymous
   */
  get isAnonymous(): boolean {
    return this.#core.isAnonymous()
  }

  /**
   * Replaces the layer's content with USDA text.
   *
   * @throws UsdError when the text does not parse.
   * @upstream SdfLayer::ImportFromString
   */
  importFromString(text: string): void {
    ensure('Layer.importFromString', guard('Layer.importFromString', () => this.#core.importFromString(text)))
  }

  /**
   * The layer as USDA text.
   *
   * @upstream SdfLayer::ExportToString
   */
  exportToString(): string {
    return guard('Layer.exportToString', () => this.#core.exportToString())
  }

  /**
   * Writes the layer back to its own file.
   *
   * @throws UsdError when the layer is anonymous or the write fails.
   * @upstream SdfLayer::Save
   */
  async save(): Promise<void> {
    ensure('Layer.save', await guardAsync('Layer.save', () => this.#core.save()))
  }

  /**
   * Writes the layer to a new file; the format follows the extension.
   *
   * @throws UsdError when the write fails.
   * @upstream SdfLayer::Export
   */
  async export(filename: URL | string): Promise<void> {
    const path = identifierOf(filename)
    ensure('Layer.export', await guardAsync('Layer.export', () => this.#core.export(path)))
  }
}
