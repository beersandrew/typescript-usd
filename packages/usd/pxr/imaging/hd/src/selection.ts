// Ported from OpenUSD 26.11.1: pxr/imaging/hd/selection.cpp,
//  pxr/imaging/hd/selection.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/selection.{h,cpp}.

export enum HdSelectionHighlightMode {
  HighlightModeSelect = 0,
  HighlightModeLocate,
  HighlightModeCount,
}

export interface HdPrimSelectionState {
  fullySelected: boolean
  instanceIndices: number[][]
  elementIndices: number[][]
  edgeIndices: number[][]
  pointIndices: number[][]
  pointColorIndices: number[]
}

type Color = [number, number, number, number]

function _newState(): HdPrimSelectionState {
  return {
    fullySelected: false,
    instanceIndices: [],
    elementIndices: [],
    edgeIndices: [],
    pointIndices: [],
    pointColorIndices: [],
  }
}

export class HdSelection {
  static readonly HighlightModeSelect = HdSelectionHighlightMode.HighlightModeSelect
  static readonly HighlightModeLocate = HdSelectionHighlightMode.HighlightModeLocate
  static readonly HighlightModeCount = HdSelectionHighlightMode.HighlightModeCount

  private _selMap = [new Map<string, HdPrimSelectionState>(),
    new Map<string, HdPrimSelectionState>()]
  private _selectedPointColors: Color[] = []

  addRprim(mode: HdSelectionHighlightMode, path: string): void {
    if (!this._validMode(mode)) return
    this._state(mode, path).fullySelected = true
  }

  addInstance(mode: HdSelectionHighlightMode, path: string, indices: number[] = []): void {
    if (!this._validMode(mode)) return
    const state = this._state(mode, path)
    if (!indices.length) state.fullySelected = true
    state.instanceIndices.push([...indices])
  }

  addElements(mode: HdSelectionHighlightMode, path: string, indices: number[]): void {
    if (!this._validMode(mode)) return
    const state = this._state(mode, path)
    if (!indices.length) state.fullySelected = true
    else state.elementIndices.push([...indices])
  }

  addEdges(mode: HdSelectionHighlightMode, path: string, indices: number[]): void {
    if (!this._validMode(mode)) return
    if (indices.length) this._state(mode, path).edgeIndices.push([...indices])
  }

  addPoints(
    mode: HdSelectionHighlightMode,
    path: string,
    indices: number[],
    pointColor?: Color,
  ): void {
    if (!this._validMode(mode)) return
    let colorIndex = -1
    if (pointColor) {
      colorIndex = this._selectedPointColors.findIndex(color =>
        color.every((value, index) => value === pointColor[index]))
      if (colorIndex < 0) {
        colorIndex = this._selectedPointColors.length
        this._selectedPointColors.push([...pointColor])
      }
    }
    if (!indices.length) return
    const state = this._state(mode, path)
    state.pointIndices.push([...indices])
    state.pointColorIndices.push(colorIndex)
  }

  getPrimSelectionState(
    mode: HdSelectionHighlightMode,
    path: string,
  ): HdPrimSelectionState | undefined {
    return this._selMap[mode]?.get(path)
  }

  getAllSelectedPrimPaths(): string[] {
    return this._selMap.flatMap(map => [...map.keys()])
  }

  getSelectedPrimPaths(mode: HdSelectionHighlightMode): string[] {
    return [...(this._selMap[mode]?.keys() ?? [])]
  }

  getSelectedPointColors(): readonly Color[] { return this._selectedPointColors }
  IsEmpty(): boolean { return this._selMap.every(map => map.size === 0) }

  static merge(a?: HdSelection, b?: HdSelection): HdSelection | undefined {
    if (!a || a.IsEmpty()) return b
    if (!b || b.IsEmpty()) return a
    const result = new HdSelection()
    result._copyFrom(a)
    const pointOffset = result._selectedPointColors.length
    result._selectedPointColors.push(...b._selectedPointColors.map(color => [...color] as Color))
    for (let mode = 0; mode < HdSelectionHighlightMode.HighlightModeCount; mode++) {
      for (const [path, source] of b._selMap[mode]!) {
        const target = result._state(mode, path)
        target.fullySelected ||= source.fullySelected
        target.instanceIndices.push(...source.instanceIndices.map(values => [...values]))
        target.elementIndices.push(...source.elementIndices.map(values => [...values]))
        target.edgeIndices.push(...source.edgeIndices.map(values => [...values]))
        target.pointIndices.push(...source.pointIndices.map(values => [...values]))
        target.pointColorIndices.push(...source.pointColorIndices.map(index => index + pointOffset))
      }
    }
    return result
  }

  private _state(mode: number, path: string): HdPrimSelectionState {
    const map = this._selMap[mode]
    if (!map) throw new RangeError(`invalid highlight mode ${mode}`)
    let state = map.get(path)
    if (!state) {
      state = _newState()
      map.set(path, state)
    }
    return state
  }

  private _validMode(mode: number): boolean {
    return mode >= 0 && mode < HdSelectionHighlightMode.HighlightModeCount
  }

  private _copyFrom(source: HdSelection): void {
    this._selectedPointColors = source._selectedPointColors.map(color => [...color] as Color)
    for (let mode = 0; mode < HdSelectionHighlightMode.HighlightModeCount; mode++) {
      for (const [path, state] of source._selMap[mode]!) {
        const target = this._state(mode, path)
        target.fullySelected = state.fullySelected
        target.instanceIndices = state.instanceIndices.map(values => [...values])
        target.elementIndices = state.elementIndices.map(values => [...values])
        target.edgeIndices = state.edgeIndices.map(values => [...values])
        target.pointIndices = state.pointIndices.map(values => [...values])
        target.pointColorIndices = [...state.pointColorIndices]
      }
    }
  }
}
