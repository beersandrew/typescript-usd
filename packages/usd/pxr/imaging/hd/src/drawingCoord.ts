// Ported from OpenUSD 26.11.1: pxr/imaging/hd/drawingCoord.cpp,
//  pxr/imaging/hd/drawingCoord.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/drawingCoord.h — HdDrawingCoord.
//
// A tiny set of integers providing an indirection mapping from the conceptual
// space of an HdRprim's resources (topological, primvar & instancing) to the
// index within the HdBufferArrayRangeContainer where the resource is stored.
// Each HdDrawItem owns one HdDrawingCoord; the shared data's barContainer is
// indexed through it. This is a 1:1 port of the C++ struct, including the
// default slot assignments.

export class HdDrawingCoord {
  static readonly CustomSlotsBegin = 8
  static readonly DefaultNumSlots = 3 /* Constant, Vertex, Topology */
  static readonly Unassigned = -1

  // default slots (see the C++ ctor initializer list)
  private _topology = 2
  private _instancePrimvar: number = HdDrawingCoord.Unassigned
  private _constantPrimvar = 0
  private _vertexPrimvar = 1
  private _elementPrimvar = 3
  private _instanceIndex = 4
  private _faceVaryingPrimvar = 5
  private _topologyVisibility = 6
  private _varyingPrimvar = 7

  getConstantPrimvarIndex(): number { return this._constantPrimvar }
  setConstantPrimvarIndex(slot: number): void { this._constantPrimvar = slot }
  getVertexPrimvarIndex(): number { return this._vertexPrimvar }
  setVertexPrimvarIndex(slot: number): void { this._vertexPrimvar = slot }
  getTopologyIndex(): number { return this._topology }
  setTopologyIndex(slot: number): void { this._topology = slot }
  getElementPrimvarIndex(): number { return this._elementPrimvar }
  setElementPrimvarIndex(slot: number): void { this._elementPrimvar = slot }
  getInstanceIndexIndex(): number { return this._instanceIndex }
  setInstanceIndexIndex(slot: number): void { this._instanceIndex = slot }
  getFaceVaryingPrimvarIndex(): number { return this._faceVaryingPrimvar }
  setFaceVaryingPrimvarIndex(slot: number): void { this._faceVaryingPrimvar = slot }
  getTopologyVisibilityIndex(): number { return this._topologyVisibility }
  setTopologyVisibilityIndex(slot: number): void { this._topologyVisibility = slot }
  getVaryingPrimvarIndex(): number { return this._varyingPrimvar }
  setVaryingPrimvarIndex(slot: number): void { this._varyingPrimvar = slot }

  // instance primvars take up a range of slots.
  setInstancePrimvarBaseIndex(slot: number): void { this._instancePrimvar = slot }
  getInstancePrimvarIndex(level: number): number {
    if (this._instancePrimvar === HdDrawingCoord.Unassigned) {
      throw new Error('HdDrawingCoord: instance primvar base index unassigned')
    }
    return this._instancePrimvar + level
  }
}
