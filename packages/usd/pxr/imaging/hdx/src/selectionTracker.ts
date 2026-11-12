// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/selectionTracker.cpp,
//  pxr/imaging/hdx/selectionTracker.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/selectionTracker.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - GetSelectionOffsetBuffer returns the offsets through an out-object
//   ({ value: number[] }) for VtIntArray *offsets; the VtIntArray is a
//   number[] (the selection task wraps it in a VtArray of int).
// - WorkParallelForN in _GetSelectionOffsets is a serial loop.
// - TfAutoMallocTag / TRACE_FUNCTION are not ported; _DebugPrintArray prints
//   with console.log under the HDX_SELECTION_SETUP debug code.

import { Debug as TfDebug } from 'typescript-usd/tf'
import { Vec4f as GfVec4f } from 'typescript-usd/gf'
import {
  MeshEdgeIndexTable as HdMeshEdgeIndexTable,
  Selection as HdSelection,
  SelectionHighlightMode as HdSelectionHighlightMode,
  type RenderIndex as HdRenderIndex,
} from 'typescript-usd/hd'
import { HdxDebugCodes } from './debugCodes.ts'
import { HdxSelectionSceneIndexObserver } from './selectionSceneIndexObserver.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'

/** selectionTracker.cpp:26-89. A helper class to obtain the union of the
 *  selection computed by querying the scene indices (with the
 *  HdxSelectionSceneIndexObserver) and the selection set with
 *  SetSelection. */
class _MergedSelection {
  // Cache the computed union. The version of the selection cached here
  // is stored as _lastVersion.
  private _selection: HdSelection | undefined = undefined
  private _lastVersion = 0
  private _observer = new HdxSelectionSceneIndexObserver()
  private _legacySelection: HdSelection | undefined = undefined
  private _legacySelectionVersion = 0

  /** selectionTracker.cpp:35-50. Returns the union of the selection from
   *  the scene index and from the legacy selection set with
   *  HdxSelectionTracker::SetSelection. */
  computeSelection(index: HdRenderIndex): HdSelection | undefined {
    // Tell scene index observer what scene index to observe
    this._observer.setSceneIndex(index.getTerminalSceneIndex())

    // Recompute if changed since last time it was computed.
    if (this._lastVersion !== this.getVersion()) {
      this._selection = HdSelection.merge(
        this._observer.getSelection(), this._legacySelection)
      this._lastVersion = this.getVersion()
    }
    return this._selection
  }

  /** selectionTracker.cpp:52-56. Version number for union of the two
   *  selections. */
  getVersion(): number {
    return this._observer.getVersion() + this._legacySelectionVersion
  }

  /** selectionTracker.cpp:58-63 */
  incrementLegacyVersion(): void {
    ++this._legacySelectionVersion
  }

  /** selectionTracker.cpp:65-70 */
  getLegacySelection(): HdSelection | undefined {
    return this._legacySelection
  }

  /** selectionTracker.cpp:72-77 */
  setLegacySelection(legacySelection: HdSelection | undefined): void {
    this._legacySelection = legacySelection
    this.incrementLegacyVersion()
  }
}

/** selectionTracker.cpp:128-154 */
function _DebugPrintArray(name: string, array: readonly number[], withIndex = true): void {
  if (TfDebug.isEnabled(HdxDebugCodes.HDX_SELECTION_SETUP)) {
    let out = `${name}: [ `
    for (const i of array) {
      out += `${String(i).padStart(3, ' ')} `
    }
    out += '] (offsets)\n'

    if (withIndex) {
      // Print the indices
      out += `${name}: [ `
      for (let i = 0; i < array.length; i++) {
        out += `${String(i).padStart(3, ' ')} `
      }
      out += '] (indices)\n'
      out += '\n'
      console.log(out)
    }
  }
}

/** selectionTracker.cpp:292-307. Helper methods to fill the selection
 *  buffer. */
function _GetMinMax(vecIndices: readonly (readonly number[])[]): [number, number] {
  let min = 2147483647
  let max = -2147483648

  for (const indices of vecIndices) {
    for (const id of indices) {
      min = Math.min(min, id)
      max = Math.max(max, id)
    }
  }

  return [min, max]
}

/** selectionTracker.cpp:309-325. The selection offsets in the buffer
 *  encode two pieces of information:
 *  (a) isSelected (bit 0): whether whatever we're encoding
 *      (prim/instance/subprim) is selected.
 *  (b) offset (bits 31:1): the offset to jump to, which may in turn encode
 *      either instance/subprim selection state. If the offset is 0, there
 *      is nothing more to decode. For points alone, the offset is
 *      overloaded to represent the point color index for customized
 *      highlighting (or -1 if a color isn't specified). */
function _EncodeSelOffset(offset: number, isSelected: boolean): number {
  return (offset << 1) | (isSelected ? 1 : 0)
}

/** selectionTracker.cpp:327-373. Encodes subprim selection offsets.
 *  Returns true if output was filled, and false if not. */
function _FillSubprimSelOffsets(type: number,
  vecIndices: readonly (readonly number[])[],
  nextSubprimOffset: number,
  output: number[]): boolean {
  // Nothing to do if we have no indices arrays.
  // Also worth noting that the HdxSelection::Add<Subprim> methods ensure
  // empty indices arrays aren't inserted.
  if (vecIndices.length === 0) return false

  const [min, max] = _GetMinMax(vecIndices)

  // Each subprims offsets' buffer encoding is:
  // [subprim-type][min][max][     selOffsets     ]
  // <----------3 ----------><--- max - min + 1 -->
  const SUBPRIM_SELOFFSETS_HEADER_SIZE = 3
  const SELECT_ALL = 1
  const SELECT_NONE = false
  const numOffsetsToInsert = SUBPRIM_SELOFFSETS_HEADER_SIZE + (max - min + 1)
  const startOutputSize = output.length

  // Grow by the total size and then fill the header (to avoid an additional
  // insert operation)
  const fill = _EncodeSelOffset(nextSubprimOffset, SELECT_NONE)
  for (let i = 0; i < numOffsetsToInsert; i++) output.push(fill)

  output[startOutputSize] = type
  output[startOutputSize + 1] = min
  output[startOutputSize + 2] = max + 1

  // For those subprim indices that are selected, set their LSB to 1.
  const selOffsetsStart = startOutputSize + SUBPRIM_SELOFFSETS_HEADER_SIZE
  for (const indices of vecIndices) {
    for (const id of indices) {
      if (id >= 0) {
        output[selOffsetsStart + (id - min)]! |= SELECT_ALL
      }
    }
  }

  return true
}

/** selectionTracker.cpp:375-411. Encode subprim selection offsets for
 *  points, with the offset representing the index of the point color to be
 *  used for custom point selection highlighting. */
function _FillPointSelOffsets(type: number,
  pointIndices: readonly (readonly number[])[],
  pointColorIndices: readonly number[],
  output: number[]): boolean {
  const startOutputSize = output.length
  const hasSelectedPoints = _FillSubprimSelOffsets(type,
    pointIndices,
    /*nextSubprimOffset=*/0,
    output)
  if (hasSelectedPoints) {
    // Update the 'offset' part of selOffset for each of the selected
    // points to represent the point color index for customized point
    // selection highlighting.
    const [min] = _GetMinMax(pointIndices)
    const SUBPRIM_SELOFFSETS_HEADER_SIZE = 3
    const SELECT_ALL = 1
    const selOffsetsStart = startOutputSize + SUBPRIM_SELOFFSETS_HEADER_SIZE
    let vtIndex = 0
    for (const indices of pointIndices) {
      const pointColorId = pointColorIndices[vtIndex++]!
      const selOffset = (pointColorId << 1) | SELECT_ALL
      for (const id of indices) {
        output[selOffsetsStart + (id - min)] = selOffset
      }
    }
  }

  return hasSelectedPoints
}

/** selectionTracker.cpp:413-442. Returns the element edges (mesh edge
 *  indices) for all mesh edges incident on selected elements (mesh
 *  faces). */
function _GetElementEdges(index: HdRenderIndex, objPath: string,
  elementIndices: readonly (readonly number[])[]): (readonly number[])[] {
  if (elementIndices.length === 0) {
    return [...elementIndices]
  }

  const result: number[][] = []

  const mesh = index.getRprim(objPath) as { GetTopology?: () => unknown } | undefined
  const topology = mesh && typeof mesh.GetTopology === 'function' ? mesh.GetTopology() : null
  if (topology) {
    const edgeIndexTable = new HdMeshEdgeIndexTable(
      topology as ConstructorParameters<typeof HdMeshEdgeIndexTable>[0])

    for (const elements of elementIndices) {
      if (elements.length > 0) {
        result.push([...edgeIndexTable.collectFaceEdgeIndices(elements).toArray()])
      }
    }
  }

  return result
}

/** selectionTracker.cpp:444-448 */
const INVALID = -1

/** selectionTracker.h:27-130. HdxSelectionTracker takes HdSelection and
 *  generates a GPU buffer to be used by the selection shaders. */
export class HdxSelectionTracker {
  private _mergedSelection = new _MergedSelection()

  /** selectionTracker.cpp:91-94 */
  constructor() {}

  /** selectionTracker.cpp:98-102. Optional override to update the
   *  selection (_selection) before GetSelectionOffsetBuffer is called. */
  updateSelection(_index: HdRenderIndex): void {
  }

  /** selectionTracker.cpp:104-108. Returns a monotonically increasing
   *  version number, which increments whenever the result of
   *  GetSelectionOffsetBuffer will change. */
  getVersion(): number {
    return this._mergedSelection.getVersion()
  }

  /** selectionTracker.cpp:110-114. The collection of selected objects is
   *  expected to be created externally and set via SetSelection. */
  setSelection(selection: HdSelection | undefined): void {
    this._mergedSelection.setLegacySelection(selection)
  }

  /** selectionTracker.cpp:116-120. XXX: Rename to GetSelection. */
  getSelectionMap(): HdSelection | undefined {
    return this._mergedSelection.getLegacySelection()
  }

  /** selectionTracker.cpp:122-126. Increments the internal selection
   *  state version, used for invalidation via GetVersion(). */
  protected _incrementVersion(): void {
    this._mergedSelection.incrementLegacyVersion()
  }

  /** selectionTracker.cpp:156-270. Encodes the selection state as an
   *  integer array in `offsets`; returns true if anything is selected. */
  getSelectionOffsetBuffer(index: HdRenderIndex,
    enableSelectionHighlight: boolean,
    enableLocateHighlight: boolean,
    offsets: { value: number[] }): boolean {
    // XXX: Set minimum size for UBO/SSBO requirements. Seems like this should
    // be handled by Hydra. Update all uses of minSize below when resolved.
    const minSize = 8
    offsets.value = new Array<number>(minSize).fill(0)
    const out = offsets.value

    // Populate a selection offset buffer that holds offset data per selection
    // highlight mode. See 'Buffer Layout' for the per-mode layout.
    //
    // The full layout is:
    // [# modes] [per-mode offsets] [seloffsets mode0] ... [seloffsets modeM]
    // [--------  header  --------]
    //
    // Index 0 holds the number of selection highlight modes; the following
    // indices hold the start index for each mode's data. If a mode doesn't
    // have any selected items, we use 0 to encode this. See
    // hdx/shaders/selection.glslfx (ApplySelectionColor) for the shader
    // readback of this buffer.

    let hasSelection = false
    const numHighlightModes = HdSelectionHighlightMode.HighlightModeCount as number
    // 1 for num modes, plus one per each mode for mode offset.
    const headerSize = numHighlightModes + 1
    const SELECT_NONE = 0

    if (numHighlightModes >= minSize) {
      // allocate enough to hold the header
      out.length = headerSize
    }

    out[0] = numHighlightModes

    const highlights = enableSelectionHighlight || enableLocateHighlight
      ? this._mergedSelection.computeSelection(index)
      : undefined

    // We expect the collection of highlighted items to be created externally
    // and set via SetSelection. Exit early if the tracker doesn't have one set,
    // or it's empty. Likewise if both enableSelectionHighlight and
    // enableLocateHighlight are false (in which case highlights is nullptr).
    if (!highlights || highlights.IsEmpty()) {
      for (let mode = HdSelectionHighlightMode.HighlightModeSelect as number;
        mode < HdSelectionHighlightMode.HighlightModeCount;
        mode++) {
        out[mode + 1] = SELECT_NONE
      }
      _DebugPrintArray('nothing selected', out)
      return false
    }

    let copyOffset = headerSize

    // XXX: This must match the order of the HdSelection::HighlightMode enum.
    const modeEnabled = [
      enableSelectionHighlight,
      enableLocateHighlight,
    ]

    TF_VERIFY(modeEnabled.length === HdSelectionHighlightMode.HighlightModeCount)

    for (let mode = HdSelectionHighlightMode.HighlightModeSelect as number;
      mode < HdSelectionHighlightMode.HighlightModeCount;
      mode++) {
      const output: number[] = []
      const modeHasSelection = modeEnabled[mode]! && this._getSelectionOffsets(
        highlights,
        mode as HdSelectionHighlightMode,
        index, copyOffset, output)

      hasSelection = hasSelection || modeHasSelection

      out[mode + 1] = modeHasSelection ? copyOffset : SELECT_NONE

      if (modeHasSelection) {
        // append the offset buffer for the highlight mode
        out.length = output.length + copyOffset
        for (let i = 0; i < output.length; i++) {
          out[i + copyOffset] = output[i]!
        }

        copyOffset += output.length
      }
    }

    // std::vector::resize value-initializes new elements.
    for (let i = 0; i < out.length; i++) out[i] ??= 0

    _DebugPrintArray('final output', out)
    return hasSelection
  }

  /** selectionTracker.cpp:272-290. Returns a vector of custom colors used
   *  for point selection highlighting. */
  getSelectedPointColors(index: HdRenderIndex): GfVec4f[] {
    const selection = this._mergedSelection.computeSelection(index)

    if (!selection) {
      return []
    }

    return selection.getSelectedPointColors().map(c =>
      c instanceof GfVec4f ? c : new GfVec4f(c[0], c[1], c[2], c[3]))
  }

  /** selectionTracker.cpp:450-653 */
  private _getSelectionOffsets(selection: HdSelection,
    mode: HdSelectionHighlightMode,
    index: HdRenderIndex,
    modeOffset: number,
    output: number[]): boolean {
    const selectedPrims = selection.getSelectedPrimPaths(mode)
    const numPrims = selection ? selectedPrims.length : 0
    if (numPrims === 0) {
      return false
    }

    const ids = new Array<number>(numPrims)

    for (let i = 0; i < numPrims; i++) {
      const rprim = index.getRprim(selectedPrims[i]!)
      if (rprim) {
        ids[i] = rprim.getPrimId()
      } else {
        // silently ignore non-existing prim
        ids[i] = INVALID
      }
    }

    let min = 2147483647
    let max = -2147483648

    for (const id of ids) {
      if (id === INVALID) continue
      min = Math.min(id, min)
      max = Math.max(id, max)
    }

    if (max < min) {
      return false
    }

    // Buffer layout (selectionTracker.cpp:498-543):
    // [ prims | points | edges | elementEdges | elements | instances ]
    //          <----------- subprims ------------------->
    //          <------------------ per prim ------------------------>
    // Prim: [ start index | end index | (selection offsets per prim) ]
    // Subprim: [ type | start index | end index | (selection offsets) ]

    // Start with individual arrays. Splice arrays once finished.
    const PRIM_SELOFFSETS_HEADER_SIZE = 2
    const SELECT_NONE = false

    const ELEMENT = 0
    const ELEMENT_EDGE = 1
    const EDGE = 2
    const POINT = 3
    const INSTANCE = 4

    _DebugPrintArray('ids', ids)
    // For initialization, use offset=0 in the seloffset encoding.
    // This will be updated as need be once we process subprims and instances.
    const init = _EncodeSelOffset(/*offset=*/0, SELECT_NONE)
    for (let i = 0; i < PRIM_SELOFFSETS_HEADER_SIZE + (max - min + 1); i++) output.push(init)
    output[0] = min
    output[1] = max + 1

    _DebugPrintArray('prims', output)

    for (let primIndex = 0; primIndex < ids.length; primIndex++) {
      const id = ids[primIndex]!
      if (id === INVALID) continue

      const objPath = selectedPrims[primIndex]!

      const primSelState = selection.getPrimSelectionState(mode, objPath)

      if (!primSelState) continue

      // netSubprimOffset tracks the "net" offset to the start of each
      // subprim's range-offsets encoding; it allows us to handle selection of
      // multiple subprims per prim (XXX: not per instance of a prim) by
      // backpointing from elements to edges to points.
      // We process subprims in the reverse order to allow for this.

      let netSubprimOffset = 0
      // Subprimitives: Points
      let curOffset = output.length
      if (_FillPointSelOffsets(POINT,
        primSelState.pointIndices,
        primSelState.pointColorIndices,
        output)) {
        netSubprimOffset = curOffset + modeOffset
        _DebugPrintArray('points', output)
      }

      // Subprimitives: Edges
      curOffset = output.length
      if (_FillSubprimSelOffsets(EDGE, primSelState.edgeIndices,
        netSubprimOffset, output)) {
        netSubprimOffset = curOffset + modeOffset
        _DebugPrintArray('edges', output)
      }

      // Subprimitives: Edges incident on elements (mesh faces).
      curOffset = output.length
      if (_FillSubprimSelOffsets(ELEMENT_EDGE,
        _GetElementEdges(
          index, objPath,
          primSelState.elementIndices),
        netSubprimOffset,
        output)) {
        netSubprimOffset = curOffset + modeOffset
        _DebugPrintArray('elementEdges', output)
      }

      // Subprimitives: Elements (coarse/authored face(s) for meshes,
      //                          individual curve(s) for basis curves)
      curOffset = output.length
      if (_FillSubprimSelOffsets(ELEMENT, primSelState.elementIndices,
        netSubprimOffset, output)) {
        netSubprimOffset = curOffset + modeOffset
        _DebugPrintArray('elements', output)
      }

      // Instances
      curOffset = output.length
      if (_FillSubprimSelOffsets(INSTANCE, primSelState.instanceIndices,
        netSubprimOffset, output)) {
        netSubprimOffset = curOffset + modeOffset
        _DebugPrintArray('instances', output)
      }

      // Finally, put the prim selection state in.
      output[id - min + 2] = _EncodeSelOffset(netSubprimOffset,
        primSelState.fullySelected)
    }

    _DebugPrintArray('final output', output)

    return true
  }
}
