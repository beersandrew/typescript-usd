// Ported from OpenSubdiv 3.7.0: opensubdiv/far/topologyRefiner.h,
//  opensubdiv/far/topologyRefiner.cpp
// Copyright 2014 DreamWorks Animation LLC. Tomorrow Open Source Technology
//  License 1.0.
// With additions ported from OpenSubdiv 3.6.1:
//  opensubdiv/far/topologyRefiner.h, opensubdiv/far/topologyRefiner.cpp
// Copyright 2014 DreamWorks Animation LLC. Modified Apache 2.0 License.
// Translated to TypeScript and modified. See LICENSE,
//  LICENSE-OpenSubdiv-3.6.1.txt and NOTICE.

// Mirrors opensubdiv/far/topologyRefiner.{h,cpp} — Far::TopologyRefiner.
//
// Stores the stack of refinement Levels and the Refinements between them, and
// drives uniform refinement. Construction is performed by TopologyRefinerFactory.

import { Level } from '../vtr/level.ts'
import { TriRefinement } from '../vtr/triRefinement.ts'
import { QuadRefinement } from '../vtr/quadRefinement.ts'
import type { Refinement } from '../vtr/refinement.ts'
import { Options, type FVarLinearInterpolation } from '../sdc/options.ts'
import { SchemeType, SchemeTypeTraits, Split } from '../sdc/types.ts'
import { TopologyLevel } from './topologyLevel.ts'

// OpenSubdiv 3.6.1 far/topologyRefiner.h:150-189 -- Far::TopologyRefiner::AdaptiveOptions.
// Local addition (see PROVENANCE.md): only the options record is ported;
// RefineAdaptive itself is not, so these are read by PatchTableFactory and
// LimitStencilTableFactory as upstream does and never applied.
export class AdaptiveOptions {
  isolationLevel: number
  secondaryLevel = 0xf
  useSingleCreasePatch = false
  useInfSharpPatch = false
  considerFVarChannels = false
  orderVerticesFromFacesFirst = false

  constructor(level: number) {
    this.isolationLevel = level & 0xf
  }
  setIsolationLevel(level: number): void {
    this.isolationLevel = level & 0xf
  }
  setSecondaryLevel(level: number): void {
    this.secondaryLevel = level & 0xf
  }
}

export interface UniformOptions {
  refinementLevel: number
  /** Order child vertices from faces first (default false: verts-from-verts first). */
  orderVerticesFromFacesFirst?: boolean
}

export class TopologyRefiner {
  _subdivType: SchemeType
  _subdivOptions: Options
  _regFaceSize: number

  _levels: Level[] = []
  _refinements: Refinement[] = []

  // OpenSubdiv 3.6.1 far/topologyRefiner.cpp:47 initializes _isUniform to
  // true; a refiner with only its base level is uniform (local fix, see
  // PROVENANCE.md).
  _isUniform = true
  _maxLevel = 0
  _adaptiveOptions = new AdaptiveOptions(0)
  _hasHoles = false
  _hasIrregFaces = false

  constructor(schemeType: SchemeType, schemeOptions: Options) {
    this._subdivType = schemeType
    this._subdivOptions = schemeOptions
    this._regFaceSize = SchemeTypeTraits.getRegularFaceSize(schemeType)
    // Base level (level 0).
    this._levels.push(new Level())
  }

  getSchemeType(): SchemeType {
    return this._subdivType
  }
  getSchemeOptions(): Options {
    return this._subdivOptions
  }
  getMaxLevel(): number {
    return this._maxLevel
  }
  getNumLevels(): number {
    return this._levels.length
  }
  isUniform(): boolean {
    return this._isUniform
  }
  hasHoles(): boolean {
    return this._hasHoles
  }

  // Local additions (see PROVENANCE.md): OpenSubdiv 3.6.1
  // far/topologyRefiner.h:77-92 and topologyRefiner.cpp:130-163 keep running
  // totals updated per appended level; these sum the levels on demand, which
  // gives the same values.
  getMaxValence(): number {
    let maxValence = 0
    for (const level of this._levels) maxValence = Math.max(maxValence, level.getMaxValence())
    return maxValence
  }
  getNumVerticesTotal(): number {
    let sum = 0
    for (const level of this._levels) sum += level.getNumVertices()
    return sum
  }
  getNumEdgesTotal(): number {
    let sum = 0
    for (const level of this._levels) sum += level.getNumEdges()
    return sum
  }
  getNumFacesTotal(): number {
    let sum = 0
    for (const level of this._levels) sum += level.getNumFaces()
    return sum
  }
  getNumFaceVerticesTotal(): number {
    let sum = 0
    for (const level of this._levels) sum += level.getNumFaceVerticesTotal()
    return sum
  }
  // OpenSubdiv 3.6.1 far/topologyRefiner.h:196.
  getAdaptiveOptions(): AdaptiveOptions {
    return this._adaptiveOptions
  }
  // OpenSubdiv 3.6.1 far/topologyRefiner.h:292-301.
  getNumFVarChannels(): number {
    return this._levels[0]!.getNumFVarChannels()
  }
  getFVarLinearInterpolation(channel = 0): FVarLinearInterpolation {
    return this._levels[0]!.getFVarLevel(channel).getOptions().getFVarLinearInterpolation()
  }
  // OpenSubdiv 3.6.1 far/topologyRefiner.cpp:208-215.
  getNumFVarValuesTotal(channel = 0): number {
    let sum = 0
    for (const level of this._levels) sum += level.getNumFVarValues(channel)
    return sum
  }

  /** Internal access to the raw vtr Level for a refinement level. */
  getLevel(level: number): Level {
    const l = this._levels[level]
    if (l === undefined) throw new Error(`TopologyRefiner: no level ${level}`)
    return l
  }

  /** Internal access to the Refinement between level i and i+1. */
  getRefinement(i: number): Refinement {
    const r = this._refinements[i]
    if (r === undefined) throw new Error(`TopologyRefiner: no refinement ${i}`)
    return r
  }

  /** Public per-level topology readout. level 0 == coarse cage. */
  GetLevel(level: number): TopologyLevel {
    return new TopologyLevel(this.getLevel(level), level > 0 ? this.getRefinement(level - 1) : undefined)
  }

  refineUniform(options: UniformOptions): void {
    if (this._levels[0]!.getNumVertices() === 0) {
      throw new Error('TopologyRefiner.RefineUniform(): base level is uninitialized.')
    }
    if (this._refinements.length > 0) {
      throw new Error('TopologyRefiner.RefineUniform(): previous refinements already applied.')
    }

    this._isUniform = true
    this._maxLevel = options.refinementLevel

    const splitType = SchemeTypeTraits.getTopologicalSplitType(this._subdivType)
    // Face-varying channels refine for both split types, as upstream
    // (far/topologyRefiner.cpp:257-268 -> vtr/refinement.cpp:128,165-167):
    // the Vtr FVarRefinement is split-agnostic except for the child faces per
    // edge in propagateValueCreases (vtr/fvarRefinement.cpp:455-464).

    const faceVertsFirst = options.orderVerticesFromFacesFirst ?? false

    for (let i = 1; i <= options.refinementLevel; ++i) {
      const parentLevel = this.getLevel(i - 1)
      const childLevel = new Level()
      childLevel._depth = i

      const refinement = new (splitType === Split.TO_TRIS ? TriRefinement : QuadRefinement)(parentLevel, childLevel, this._subdivOptions)
      refinement._faceVertsFirst = faceVertsFirst
      refinement.refine()

      this._levels.push(childLevel)
      this._refinements.push(refinement)
    }
  }
}
