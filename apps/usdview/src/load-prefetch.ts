// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/textureObjectRegistry.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

/** Reading ahead the layers of a payload load schedule's next carriers
 * (docs/viewer-contracts.md, "Load schedule", read ahead).
 *
 * A web adaptation, not usdview behaviour: a usdview load-schedule plugin calls
 * UsdStage::LoadAndUnload on the frame change, and that call opens the
 * payloads' layers synchronously (SdfLayer::FindOrOpen through Pcp). Here a
 * layer open is a fetch and a parse, and composition that meets a layer not
 * yet open waits for it and computes the prim index again
 * (packages/usd/pxr/usd/pcp/src/cache.ts, PcpCacheLayerSource). So before a
 * carrier's window opens, the viewer opens the layers its payloads will bring
 * in (the payload layers, and the sublayers, references and payloads those
 * layers name, transitively) with SdfLayer::FindOrOpen under the stage's
 * resolver context, and holds them. The layer registry then hands them to the
 * load, which only composes. Nothing is loaded early: the stage's load rules,
 * prims and every drawn frame are what the schedule makes them; only when the
 * layers are read changes.
 *
 * The images those layers name are read ahead too. In usdview the load's
 * first draw opens the new materials' textures synchronously (Storm's texture
 * commit, hdSt/textureObjectRegistry.cpp:236-244); here each is a fetch and a
 * decode, and Storm draws nothing until they are done (hdSt/src/renderPass.ts),
 * so the image would stand still for as long as they take. They are read and
 * decoded ahead (typescript-usd/hio/_internal; the library's
 * PLATFORM-DIVERGENCE(hio-image-read-ahead)) and held until a little after
 * the window opens, so the load's first draw opens them from memory. */
import {ResolverContextBinder as ArResolverContextBinder, GetResolver as ArGetResolver} from 'typescript-usd/ar'
import {AssetPath as SdfAssetPath, Layer as SdfLayer, sdfNormalizeListOp} from 'typescript-usd/sdf'
import type {Stage} from 'typescript-usd/usd'
import type {LoadSchedule} from './load-schedule'

/** How many frames before a carrier's window opens its layers are read. */
export const defaultPrefetchFrames = 48

const arcFields = ['references', 'payload'] as const

/** The asset paths a list-op valued arc field names (SdfReference and
 *  SdfPayload items; internal arcs and expressions name none to read). */
function arcAssetPaths(value: unknown): string[] {
  const op = sdfNormalizeListOp<unknown>(value)
  if (!op) return []
  const paths: string[] = []
  for (const item of [...op.explicitItems, ...op.addedItems, ...op.prependedItems, ...op.appendedItems]) {
    const assetPath = typeof item === 'string' ? item : (item as {assetPath?: unknown} | null)?.assetPath
    if (typeof assetPath === 'string' && assetPath && !assetPath.startsWith('`')) paths.push(assetPath)
  }
  return paths
}

/** The layers a layer names: its sublayers and the assets of its specs'
 *  references and payloads, as identifiers anchored to it. */
function namedLayers(layer: SdfLayer): string[] {
  const out = new Set<string>()
  const add = (assetPath: string) => { if (assetPath && !assetPath.startsWith('`')) out.add(layer.resolveAsset(assetPath)) }
  for (const path of layer.getSubLayerPaths()) add(path)
  for (const spec of layer.getSpecPaths()) {
    for (const field of arcFields) for (const assetPath of arcAssetPaths(layer.getField(spec, field))) add(assetPath)
  }
  return [...out]
}

/** `start()` with the binder's context bound while it starts: an Ar call
 *  reads the bound context when it is made, and the asynchronous work it
 *  starts keeps the one it read. The binder's scope is synchronous, as
 *  upstream's ArResolverContextBinder is (ar/resolverContextBinder.h): a
 *  scope that spans awaits needs the host's AsyncContext, which Safari does
 *  not have (packages/usd/pxr/usd/ar/src/asyncState.ts), and binder.run
 *  rejects an asynchronous function there. */
function withContext<T>(binder: ArResolverContextBinder, start: () => Promise<T>): Promise<T> {
  return binder.run(() => ({ started: start() })).started
}

/** Opens the layers `carrier`'s payload children bring in, and the layers
 *  those name, under the stage's resolver context. Layers that do not open
 *  are skipped: the load reports them as it would have. */
export async function openCarrierLayers(stage: Stage, carrier: string): Promise<SdfLayer[]> {
  const prim = stage.getPrim(carrier)
  if (!prim) return []
  const seeds = new Set<string>()
  for (const child of prim.getAllChildren()) {
    // Unloaded children too (UsdPrim::GetAllChildren).
    if (!child.hasAuthoredPayloads()) continue
    for (const entry of stage.getPrimStack(child.path)) {
      const payloads = arcAssetPaths(entry.metadata.payload)
      if (!payloads.length) continue
      const authoring = SdfLayer.find(entry.layerIdentifier)
      if (authoring) for (const assetPath of payloads) seeds.add(authoring.resolveAsset(assetPath))
    }
  }
  const binder = new ArResolverContextBinder(stage.getPathResolverContext())
  const held: SdfLayer[] = []
  const seen = new Set<string>()
  const open = async (identifier: string): Promise<void> => {
    if (seen.has(identifier)) return
    seen.add(identifier)
    let layer: SdfLayer | undefined
    try { layer = await withContext(binder, () => SdfLayer.findOrOpen(identifier)) } catch { layer = undefined }
    if (!layer) return
    held.push(layer)
    await Promise.all(namedLayers(layer).map(open))
  }
  await Promise.all([...seeds].map(open))
  return held
}

/** Hio, loaded with the imaging code (outside the viewer's static entry
 *  graph, tests/code-splitting.test.ts). */
type Hio = typeof import('typescript-usd/hio/_internal')
let hio: Promise<Hio> | undefined
const loadHio = (): Promise<Hio> => hio ??= import('typescript-usd/hio/_internal')
const release = (paths: readonly string[]) => { if (paths.length) void loadHio().then(({_HioReleaseImageAhead}) => { for (const path of paths) _HioReleaseImageAhead(path) }) }

/** The image files a layer's attribute values name (defaults and time
 *  samples of asset-valued attributes), as identifiers anchored to it. UDIM
 *  patterns name no one file and are left to the texture's own open. */
function namedImages(layer: SdfLayer, isImage: (path: string) => boolean): string[] {
  const out = new Set<string>()
  const add = (value: unknown) => {
    // A text layer holds an asset value as its path, a crate file as an
    // SdfAssetPath.
    const assetPath = value instanceof SdfAssetPath ? value.getAuthoredPath() : typeof value === 'string' ? value : ''
    if (!assetPath || assetPath.includes('<UDIM>') || !isImage(assetPath)) return
    out.add(layer.resolveAsset(assetPath))
  }
  for (const spec of layer.getSpecPaths()) {
    if (!spec.includes('.') || String(layer.getField(spec, 'typeName')) !== 'asset') continue
    add(layer.getField(spec, 'default'))
    const samples = layer.getField(spec, 'timeSamples')
    if (samples instanceof Map) for (const value of samples.values()) add(value)
  }
  return [...out]
}

/** Reads and decodes ahead the images `layers` name, resolved under the
 *  stage's resolver context as the stage resolves asset values. Returns the
 *  resolved paths read ahead; images that do not resolve are skipped. */
export async function readCarrierImages(stage: Stage, layers: readonly SdfLayer[]): Promise<string[]> {
  const {_HioImage, _HioReadImageAhead} = await loadHio()
  const binder = new ArResolverContextBinder(stage.getPathResolverContext())
  const identifiers = new Set(layers.flatMap(layer => namedImages(layer, path => _HioImage.isSupportedImageFile(path))))
  const resolved = await Promise.all([...identifiers].map(async identifier => {
    try { const path = await withContext(binder, () => ArGetResolver().resolve(identifier)); return path.valid ? path.toString() : '' } catch { return '' }
  }))
  const paths = [...new Set(resolved.filter(Boolean))]
  await Promise.all(paths.map(path => withContext(binder, () => _HioReadImageAhead(path))))
  return paths
}

/** How many frames after a carrier's window opens its images stay held: the
 *  load's first draw opens them, and a follower can draw that frame a few
 *  frames late. */
export const imageHoldFrames = 24

/** Reads ahead, as the frame advances, the layers of the carriers whose
 *  window opens within the next `frames` frames, and holds them until the
 *  window opens (the stage holds them once loaded) or the frame leaves the
 *  read-ahead span. */
export class LoadPrefetcher {
  readonly #stage: Stage
  readonly #schedule: LoadSchedule
  readonly #frames: number
  readonly #held = new Map<string, Promise<SdfLayer[]>>()
  /** Per carrier, the images read ahead for it (readCarrierImages). */
  readonly #images = new Map<string, Promise<string[]>>()
  /** How many held carriers read each image ahead. */
  readonly #imageUses = new Map<string, number>()
  /** The image reads whose paths were counted in #imageUses. */
  readonly #counted = new WeakSet<Promise<string[]>>()

  constructor(stage: Stage, schedule: LoadSchedule, frames = defaultPrefetchFrames) {
    this.#stage = stage; this.#schedule = schedule; this.#frames = frames
  }

  /** The carriers read ahead (or being read) now. */
  get held(): string[] { return [...this.#held.keys()] }

  /** The carriers whose images are held now. */
  get imagesHeld(): string[] { return [...this.#images.keys()] }

  /** The images read ahead for `carrier` (empty when it is not held). */
  images(carrier: string): Promise<string[]> { return this.#images.get(carrier) ?? Promise.resolve([]) }

  /** Starts reading the carriers due within the span after `frame` and
   *  releases the others. Returns the reads started now. A carrier's images
   *  are read once its layers are, and held until `imageHoldFrames` after
   *  its window opens. */
  update(frame: number): Promise<SdfLayer[]>[] {
    const started: Promise<SdfLayer[]>[] = []
    for (const [carrier, [first]] of this.#schedule.carriers) {
      const imagesDue = first - this.#frames <= frame && frame <= first + imageHoldFrames
      if (!imagesDue) this.#releaseImages(carrier)
      const due = frame <= first && first <= frame + this.#frames
      if (!due) { this.#held.delete(carrier); continue }
      if (this.#held.has(carrier)) continue
      const reading = openCarrierLayers(this.#stage, carrier).catch(() => [])
      this.#held.set(carrier, reading)
      started.push(reading)
      if (!this.#images.has(carrier)) {
        // Counted once read; a carrier released before then releases its
        // reads itself.
        const images: Promise<string[]> = reading.then(layers => readCarrierImages(this.#stage, layers)).catch(() => []).then(paths => {
          if (this.#images.get(carrier) === images) {
            this.#counted.add(images)
            for (const path of paths) this.#imageUses.set(path, (this.#imageUses.get(path) ?? 0) + 1)
          } else release(paths.filter(path => !this.#imageUses.has(path)))
          return paths
        })
        this.#images.set(carrier, images)
      }
    }
    return started
  }

  #releaseImages(carrier: string): void {
    const images = this.#images.get(carrier)
    if (!images) return
    this.#images.delete(carrier)
    // Settled after the count above (or its release) ran.
    void images.then(paths => {
      if (!this.#counted.has(images)) return
      for (const path of paths) {
        const uses = (this.#imageUses.get(path) ?? 0) - 1
        if (uses > 0) { this.#imageUses.set(path, uses); continue }
        this.#imageUses.delete(path)
        release([path])
      }
    })
  }

  dispose(): void {
    this.#held.clear()
    for (const carrier of [...this.#images.keys()]) this.#releaseImages(carrier)
  }
}
