// Ported from OpenUSD 26.11.1: pxr/usd/usd/stage.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Surface Stage: one call per member into the core's UsdStage
// (pxr/usd/usd/src/stage.ts Stage; OpenUSD pxr/usd/usd/stage.h).
import {
  EditContext as UsdEditContext, Notice as UsdNotice, PrimAllPrimsPredicate, PrimDefaultPredicate,
  Stage as CoreStage, StagePopulationMask, TraverseInstanceProxies,
} from 'typescript-usd/usd'
import { ChangeBlock as SdfChangeBlock, sdfChangeBlock } from 'typescript-usd/sdf'
import { Notice as TfNotice, type NoticeKey as TfNoticeKey } from 'typescript-usd/tf'
import { ensure, guard, guardAsync } from './error.ts'
import { Layer } from './layer.ts'
import { Prim } from './prim.ts'
import { identifierOf } from './values.ts'

/**
 * Which payloads a stage loads when it opens.
 *
 * @upstream UsdStage::InitialLoadSet
 */
export const InitialLoadSet = {
  /** Load all loadable prims. @upstream UsdStage::LoadAll */
  LoadAll: 'all',
  /** Load no loadable prims. @upstream UsdStage::LoadNone */
  LoadNone: 'none',
} as const

/**
 * `"all"` or `"none"`.
 *
 * @upstream UsdStage::InitialLoadSet
 */
export type InitialLoadSet = typeof InitialLoadSet[keyof typeof InitialLoadSet]

/**
 * Which prims a traversal visits.
 *
 * @upstream Usd_PrimFlagsPredicate
 */
export const PrimFlagsPredicate = {
  /** Active, loaded, defined, non-abstract prims. @upstream UsdPrimDefaultPredicate */
  UsdPrimDefaultPredicate: 'default',
  /** Every prim. @upstream UsdPrimAllPrimsPredicate */
  UsdPrimAllPrimsPredicate: 'all',
} as const

/**
 * `"default"` or `"all"`.
 *
 * @upstream Usd_PrimFlagsPredicate
 */
export type PrimFlagsPredicate = typeof PrimFlagsPredicate[keyof typeof PrimFlagsPredicate]

/**
 * Options for {@link Stage.open}.
 *
 * @upstream UsdStage::Open
 */
export interface OpenOptions {
  /**
   * Which payloads to load; default `"all"`.
   *
   * @upstream UsdStage::Open(load)
   */
  load?: InitialLoadSet
  /**
   * Compose only these prim paths and their descendants (and ancestors).
   *
   * @upstream UsdStage::OpenMasked(mask)
   */
  mask?: readonly string[]
  /**
   * Abandons the open. Checked before and after the core's open, which
   * itself runs to completion.
   *
   * @upstream none
   */
  signal?: AbortSignal
}

/**
 * Options for {@link Stage.traverse}.
 *
 * @upstream UsdStage::Traverse
 */
export interface TraverseOptions {
  /**
   * Which prims to visit; default `"default"`.
   *
   * @upstream UsdStage::Traverse(predicate)
   */
  predicate?: PrimFlagsPredicate
  /**
   * Also visit the prims beneath instances, as instance proxies.
   *
   * @upstream UsdTraverseInstanceProxies
   */
  instanceProxies?: boolean
}

/**
 * Options for {@link Stage.flatten}, {@link Stage.export} and
 * {@link Stage.exportToString}.
 *
 * @upstream UsdStage::Export
 */
export interface ExportOptions {
  /**
   * Add a `doc` comment naming the source stage; default true.
   *
   * @upstream UsdStage::Export(addSourceFileComment)
   */
  addSourceFileComment?: boolean
}

/**
 * Dispatched after scene description changes affect the stage.
 *
 * @upstream UsdNotice::ObjectsChanged
 */
export class ObjectsChangedEvent extends Event {
  readonly #notice: UsdNotice.ObjectsChanged

  /**
   * @upstream none
   */
  constructor(notice: UsdNotice.ObjectsChanged) {
    super('objectschanged')
    this.#notice = notice
  }

  /**
   * The core notice, for APIs the surface does not cover yet.
   *
   * @upstream none
   */
  get core(): UsdNotice.ObjectsChanged {
    return this.#notice
  }

  /**
   * Paths whose subtrees were recomposed.
   *
   * @upstream UsdNotice::ObjectsChanged::GetResyncedPaths
   */
  get resyncedPaths(): string[] {
    return [...this.#notice.getResyncedPaths()]
  }

  /**
   * Paths whose fields changed without a recomposition (attribute values,
   * metadata).
   *
   * @upstream UsdNotice::ObjectsChanged::GetChangedInfoOnlyPaths
   */
  get changedInfoOnlyPaths(): string[] {
    return [...this.#notice.getChangedInfoOnlyPaths()]
  }
}

/**
 * The events a {@link Stage} dispatches.
 *
 * @upstream UsdNotice
 */
export interface StageEventMap {
  /** @upstream UsdNotice::ObjectsChanged */
  objectschanged: ObjectsChangedEvent
}

// Module-private factories: the scope classes have private constructors and
// are opened only through Stage.
let openChangeBlock: () => ChangeBlock
let openEditContext: (stage: CoreStage, layer: Layer) => EditContext

/**
 * Batches change notification: notices are sent when the outermost block
 * closes. Like upstream's, a block is global, not per stage.
 *
 * @upstream SdfChangeBlock
 */
export class ChangeBlock {
  readonly #core: SdfChangeBlock

  private constructor(core: SdfChangeBlock) {
    this.#core = core
  }

  static {
    openChangeBlock = () => new ChangeBlock(new SdfChangeBlock())
  }

  /**
   * Closes the block; the outermost block sends the batched notices.
   *
   * @upstream SdfChangeBlock::~SdfChangeBlock
   */
  close(): void {
    this.#core.close()
  }

  /** @upstream SdfChangeBlock::~SdfChangeBlock */
  [Symbol.dispose](): void {
    this.#core.close()
  }
}

/**
 * Sets a stage's edit target until closed, then restores the previous one.
 *
 * @upstream UsdEditContext
 */
export class EditContext {
  readonly #core: UsdEditContext

  private constructor(core: UsdEditContext) {
    this.#core = core
  }

  static {
    openEditContext = (stage, layer) =>
      new EditContext(guard('Stage.editContext', () => new UsdEditContext(stage, layer.core)))
  }

  /**
   * Restores the stage's previous edit target.
   *
   * @upstream UsdEditContext::~UsdEditContext
   */
  close(): void {
    this.#core.close()
  }

  /** @upstream UsdEditContext::~UsdEditContext */
  [Symbol.dispose](): void {
    this.#core.close()
  }
}

const wrappers = new WeakMap<CoreStage, Stage>()

/**
 * A composed scene: a root layer, its sublayers and everything they
 * reference, as one prim hierarchy.
 *
 * ```ts
 * const stage = await Stage.open(new URL('./hero.usda', import.meta.url))
 * for (const prim of stage.traverse()) console.log(prim.path)
 * ```
 *
 * @upstream UsdStage
 */
export class Stage extends EventTarget {
  readonly #core: CoreStage
  #objectsChanged: TfNoticeKey | undefined

  private constructor(core: CoreStage) {
    super()
    this.#core = core
  }

  /**
   * The surface stage for a core stage (the same object each time).
   *
   * @upstream none
   */
  static fromCore(core: CoreStage): Stage {
    let stage = wrappers.get(core)
    if (!stage) wrappers.set(core, stage = new Stage(core))
    return stage
  }

  /**
   * Opens and composes the stage rooted at `filePath` (a URL, a resolver
   * identifier, or an already-open layer).
   *
   * @throws UsdError when the root layer cannot be opened or errors are
   *   posted while composing; the `signal`'s reason when aborted.
   * @upstream UsdStage::Open
   */
  static async open(filePath: URL | string | Layer, options: OpenOptions = {}): Promise<Stage> {
    options.signal?.throwIfAborted()
    const coreOptions = { loadPayloads: options.load !== 'none' }
    const mask = options.mask
    const root = filePath instanceof Layer ? filePath.core : identifierOf(filePath)
    const core = ensure('Stage.open', await guardAsync('Stage.open', () =>
      typeof root === 'string'
        ? mask ? CoreStage.openMasked(root, new StagePopulationMask(mask), coreOptions) : CoreStage.open(root, coreOptions)
        : mask ? CoreStage.openMasked(root, new StagePopulationMask(mask), coreOptions) : CoreStage.open(root, coreOptions)))
    if (options.signal?.aborted) {
      core.dispose()
      options.signal.throwIfAborted()
    }
    return Stage.fromCore(core)
  }

  /**
   * A new stage on an anonymous root layer, ready for authoring.
   *
   * @upstream UsdStage::CreateInMemory
   */
  static createInMemory(): Stage {
    return Stage.fromCore(guard('Stage.createInMemory', () => CoreStage.createNew()))
  }

  /**
   * The core stage this wraps, for APIs the surface does not cover yet.
   *
   * @upstream none
   */
  get core(): CoreStage {
    return this.#core
  }

  /**
   * The root layer.
   *
   * @upstream UsdStage::GetRootLayer
   */
  get rootLayer(): Layer {
    return Layer.fromCore(this.#core.getRootLayer())
  }

  /**
   * The session layer: the strongest layer, for edits not saved with the
   * scene.
   *
   * @upstream UsdStage::GetSessionLayer
   */
  get sessionLayer(): Layer {
    return Layer.fromCore(this.#core.getSessionLayer())
  }

  /**
   * The pseudo-root prim `/`, parent of the root prims.
   *
   * @upstream UsdStage::GetPseudoRoot
   */
  get pseudoRoot(): Prim {
    return ensure('Stage.pseudoRoot', Prim.fromCore(this.#core.getPrim('/')))
  }

  /**
   * The root layer's `defaultPrim`, if it names a prim on the stage.
   *
   * @upstream UsdStage::GetDefaultPrim
   */
  get defaultPrim(): Prim | undefined {
    return Prim.fromCore(this.#core.getDefaultPrim())
  }

  /**
   * The stage's start time code, if authored.
   *
   * @upstream UsdStage::GetStartTimeCode
   */
  get startTimeCode(): number | undefined {
    return this.#core.startTimeCode
  }

  /**
   * The stage's end time code, if authored.
   *
   * @upstream UsdStage::GetEndTimeCode
   */
  get endTimeCode(): number | undefined {
    return this.#core.endTimeCode
  }

  /**
   * Time codes per second (24 when not authored).
   *
   * @upstream UsdStage::GetTimeCodesPerSecond
   */
  get timeCodesPerSecond(): number {
    return this.#core.timeCodesPerSecond
  }

  /**
   * The prim at `path`, including instance proxies; undefined if none.
   *
   * @upstream UsdStage::GetPrimAtPath
   */
  prim(path: string): Prim | undefined {
    return Prim.fromCore(this.#core.getPrim(path))
  }

  /**
   * The stage's prims in depth-first order, beginning below the pseudo-root.
   *
   * ```ts
   * const meshes = [...stage.traverse()].filter(prim => prim.isA('Mesh'))
   * ```
   *
   * @upstream UsdStage::Traverse
   */
  *traverse(options: TraverseOptions = {}): IterableIterator<Prim> {
    const flags = options.predicate === 'all' ? PrimAllPrimsPredicate : PrimDefaultPredicate
    for (const path of this.#core.traverse(options.instanceProxies ? TraverseInstanceProxies(flags) : flags)) {
      yield ensure('Stage.traverse', Prim.fromCore(this.#core.getPrim(path)))
    }
  }

  /**
   * Defines a prim at `path` (and `def` ancestors as needed) on the edit
   * target.
   *
   * @throws UsdError when the path is invalid or the prim cannot be defined.
   * @upstream UsdStage::DefinePrim
   */
  definePrim(path: string, typeName = ''): Prim {
    return ensure('Stage.definePrim', Prim.fromCore(guard('Stage.definePrim', () => this.#core.definePrim(path, typeName))))
  }

  /**
   * The layer edits are authored to. (A variant edit target's path mapping
   * is not exposed yet; use `stage.core.getEditTarget()`.)
   *
   * @upstream UsdStage::GetEditTarget
   */
  get editTarget(): Layer | undefined {
    const layer = this.#core.getEditTarget().getLayer()
    return layer ? Layer.fromCore(layer) : undefined
  }

  /**
   * Authors subsequent edits to `layer`, which must be in the stage's layer
   * stack.
   *
   * @throws UsdError when the layer is not in the layer stack.
   * @upstream UsdStage::SetEditTarget
   */
  setEditTarget(layer: Layer): void {
    guard('Stage.setEditTarget', () => this.#core.setEditTarget(layer.core))
  }

  /**
   * Makes `layer` the edit target until the returned context is closed.
   *
   * ```ts
   * using _ = stage.editContext(stage.sessionLayer)
   * ```
   *
   * @upstream UsdEditContext::UsdEditContext
   */
  editContext(layer: Layer): EditContext {
    return openEditContext(this.#core, layer)
  }

  /**
   * Runs `edit` (synchronous) with `layer` as the edit target, then
   * restores the previous one.
   *
   * @upstream UsdEditContext::UsdEditContext
   */
  withEditTarget<T>(layer: Layer, edit: () => T): T {
    const context = openEditContext(this.#core, layer)
    try {
      return edit()
    } finally {
      context.close()
    }
  }

  /**
   * Opens a change block (see {@link ChangeBlock}); with a callback, runs it
   * (synchronously) inside one and returns its result.
   *
   * ```ts
   * using _ = stage.changeBlock()
   * stage.changeBlock(() => { a.set(1); b.set(2) })
   * ```
   *
   * @upstream SdfChangeBlock::SdfChangeBlock
   */
  changeBlock(): ChangeBlock
  changeBlock<T>(edit: () => T): T
  changeBlock<T>(edit?: () => T): ChangeBlock | T {
    return edit ? sdfChangeBlock(edit) : openChangeBlock()
  }

  /**
   * The composed stage as one new anonymous layer.
   *
   * @upstream UsdStage::Flatten
   */
  flatten(options: ExportOptions = {}): Layer {
    return Layer.fromCore(guard('Stage.flatten', () => this.#core.flatten(options.addSourceFileComment ?? true)))
  }

  /**
   * The composed stage, flattened, as USDA text.
   *
   * @upstream UsdStage::ExportToString
   */
  exportToString(options: ExportOptions = {}): string {
    return guard('Stage.exportToString', () => this.#core.flatten(options.addSourceFileComment ?? true).exportToString())
  }

  /**
   * Writes the composed stage, flattened, to a new file; the format follows
   * the extension.
   *
   * @throws UsdError when the write fails.
   * @upstream UsdStage::Export
   */
  async export(filename: URL | string, options: ExportOptions = {}): Promise<void> {
    const path = identifierOf(filename)
    ensure('Stage.export', await guardAsync('Stage.export', () => this.#core.export(path, options.addSourceFileComment ?? true)))
  }

  /**
   * Saves the root layer to its file.
   *
   * @throws UsdError when the root layer is anonymous or the write fails.
   * @upstream UsdStage::Save
   */
  async save(): Promise<void> {
    ensure('Stage.save', await guardAsync('Stage.save', () => this.#core.save()))
  }

  /**
   * Listens for stage events; removal through `options.signal` or
   * `removeEventListener`.
   *
   * ```ts
   * stage.addEventListener('objectschanged', e => console.log(e.resyncedPaths), { signal })
   * ```
   *
   * @upstream TfNotice::Register
   */
  override addEventListener<K extends keyof StageEventMap>(
    type: K, listener: (this: Stage, event: StageEventMap[K]) => unknown, options?: boolean | AddEventListenerOptions): void
  override addEventListener(
    type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void
  override addEventListener(
    type: string, listener: EventListenerOrEventListenerObject | ((event: never) => unknown) | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (type === 'objectschanged') {
      this.#objectsChanged ??= TfNotice.Register(UsdNotice.ObjectsChanged,
        (notice: UsdNotice.ObjectsChanged) => this.dispatchEvent(new ObjectsChangedEvent(notice)), this.#core)
    }
    super.addEventListener(type, listener as EventListenerOrEventListenerObject | null, options)
  }

  /**
   * Closes the stage: stops notices and releases its prims. The surface
   * objects for it must not be used afterwards.
   *
   * @upstream UsdStage::~UsdStage
   */
  close(): void {
    this.#objectsChanged?.revoke()
    this.#objectsChanged = undefined
    this.#core.dispose()
  }

  /** @upstream UsdStage::~UsdStage */
  [Symbol.dispose](): void {
    this.close()
  }
}
