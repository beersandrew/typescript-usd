// Ported from OpenUSD 26.11.1: pxr/exec/vdf/sparseInputPathFinder.cpp,
//  pxr/exec/vdf/sparseInputPathFinder.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/sparseInputPathFinder.h and
// sparseInputPathFinder.cpp.
//
// Sparse traversal in the output-to-input direction that finds all paths
// from a start output to a target output. Paths are split at "relevant"
// inputs (as decided by the input callback); paths meeting a previously
// traversed connection are recorded as potential results and finalized
// after the traversal.
//
// Mapping choices:
// - Hash maps keyed by unsigned path ids are Maps; _pathToResultMap iterates
//   in insertion order (upstream's TfHashMap order is unspecified), so the
//   order of the directly found paths may differ from native. Callers that
//   compare results compare sets, as the upstream test does.
// - The maps keyed by VdfMask and by _PotentialResult use canonical string
//   keys; std::set<unsigned int> picks its smallest element.
// - paths (std::vector<VdfConnectionConstVector> *) is a mutated array.

import { Debug as TfDebug, TF_VERIFY } from 'typescript-usd/tf'

import type { VdfConnection } from './connection.ts'
import { VdfDebugCodes, VdfIsDebugEnabled } from './debugCodes.ts'
import type { VdfInput } from './input.ts'
import { VdfMask } from './mask.ts'
import { VdfMaskedOutput } from './maskedOutput.ts'
import type { VdfOutput } from './output.ts'

/** InputCallback (sparseInputPathFinder.h:51). */
export type VdfSparseInputPathFinder_InputCallback = (input: VdfInput) => boolean

const _DEBUG = VdfDebugCodes.VDF_SPARSE_INPUT_PATH_FINDER

function _Debug(msg: () => string): void {
  if (VdfIsDebugEnabled(_DEBUG)) TfDebug.msg(_DEBUG, msg())
}

// _PathSegment (sparseInputPathFinder.h:95-113).
class _PathSegment {
  constructor(public id = 0, public len = 0) {}

  Equals(rhs: _PathSegment): boolean {
    return this.id === rhs.id && this.len === rhs.len
  }

  getAsString(): string {
    return `{#${this.id} / ${this.len}}`
  }
}

// _StackFrame (sparseInputPathFinder.h:117-126).
class _StackFrame extends _PathSegment {
  constructor(public readonly maskedOutput: VdfMaskedOutput, segment: _PathSegment) {
    super(segment.id, segment.len)
  }
}

// _PotentialResult (sparseInputPathFinder.h:138-168).
interface _PotentialResult {
  ending: _PathSegment
  encountered: _PathSegment
}

const _PotentialResultKey = (p: _PotentialResult): string =>
  `${p.ending.id}/${p.ending.len}/${p.encountered.id}/${p.encountered.len}`

const _MaskKey = (mask: VdfMask): string => `${mask.getSize()}:${mask.getRLEString()}`

export class VdfSparseInputPathFinder {
  private readonly _targetOutput: VdfOutput | null
  private readonly _inputCallback: VdfSparseInputPathFinder_InputCallback | null
  private readonly _paths: VdfConnection[][] = []
  private readonly _pathToRelevanceMap = new Map<number, VdfInput>()
  private readonly _visitedConnectionsInfoMap =
    new Map<VdfConnection, Map<string, _PathSegment>>()
  private readonly _pathToParentSegmentMap = new Map<number, _PathSegment>()
  private readonly _pathToPathChildrenMap = new Map<number, number[]>()
  private readonly _pathToResultMap = new Map<number, VdfConnection[]>()
  private readonly _stack: _StackFrame[] = []
  private readonly _potentialResults = new Map<string, _PotentialResult>()

  /**
   * Traverse (sparseInputPathFinder.cpp:19-27): finds all paths from start
   * into target, appending them to paths.
   */
  static traverse(
    start: VdfMaskedOutput,
    target: VdfMaskedOutput,
    inputCallback: VdfSparseInputPathFinder_InputCallback | null,
    paths: VdfConnection[][]): void {
    new VdfSparseInputPathFinder(start, target, inputCallback, paths)
  }

  /** FindAllCyclePaths (sparseInputPathFinder.cpp:29-36): Traverse with start == target. */
  static findAllCyclePaths(
    start: VdfMaskedOutput,
    inputCallback: VdfSparseInputPathFinder_InputCallback | null,
    paths: VdfConnection[][]): void {
    new VdfSparseInputPathFinder(start, start, inputCallback, paths)
  }

  // VdfSparseInputPathFinder(...) (sparseInputPathFinder.cpp:38-107).
  private constructor(
    start: VdfMaskedOutput,
    target: VdfMaskedOutput,
    inputCallback: VdfSparseInputPathFinder_InputCallback | null,
    paths: VdfConnection[][]) {
    this._targetOutput = target.GetOutput()
    this._inputCallback = inputCallback

    TF_VERIFY(this._targetOutput && paths && inputCallback,
      '_targetOutput && paths && inputCallback')

    _Debug(() =>
      '\n[VdfSparseInputPathFinder] Starting sparse input path find ' +
      `traversal at "${start.GetOutput()!.getDebugName()} 0b${start.GetMask().getRLEString()}" ` +
      `looking for "${this._targetOutput!.getDebugName()}".\n`)

    // Set up the initial path.
    this._paths.push([])
    this._stack.push(new _StackFrame(start, new _PathSegment(0, 0)))

    let isStartFrame = true

    while (this._stack.length) {
      // Popping from the back implements a DFS.
      const frame = this._stack.pop()!
      this._traverseFrame(frame, isStartFrame)
      isStartFrame = false
    }

    // Copy the directly found paths.
    for (const result of this._pathToResultMap.values()) {
      paths.push([...result])
    }

    this._finalizePendingResults(paths)

    _Debug(() =>
      '\n[VdfSparseInputPathFinder] Stats:\n' +
      ` # of paths:                          ${this._paths.length}\n` +
      ` # of visited connections:            ${this._visitedConnectionsInfoMap.size}\n` +
      ` # of path to parent segments:        ${this._pathToParentSegmentMap.size}\n` +
      ` # of path to children paths vectors: ${this._pathToPathChildrenMap.size}\n` +
      ` # of directly found results:         ${this._pathToResultMap.size}\n` +
      ` # of potential results found:        ${this._potentialResults.size}\n` +
      ` # of total results found:            ${paths.length}\n\n`)
  }

  // _AppendChildPathsToWorkingSet (sparseInputPathFinder.cpp:109-176).
  private _appendChildPathsToWorkingSet(
    pathToLookup: Set<number>,
    pathId: number,
    encounteredSegment: _PathSegment,
    endingId: number): void {
    const children = this._pathToPathChildrenMap.get(pathId)
    if (!children) return

    for (const childPathId of children) {
      // childPathId is a child of path; check that it begins after
      // encounteredSegment.
      const j = this._pathToParentSegmentMap.get(childPathId)

      TF_VERIFY(j !== undefined && j.id === pathId,
        'j != _pathToParentSegmentMap.end() && j->second.id == pathId')

      const childStartInParentPath = j!.len

      // Sibling paths are not added anymore.
      TF_VERIFY(childStartInParentPath, 'childStartInParentPath')

      if (pathId === encounteredSegment.id) {
        if (childStartInParentPath <= encounteredSegment.len) {
          _Debug(() =>
            `[VdfSparseInputPathFinder] ...... ignoring child path ${childPathId} ` +
            `starting at ${childStartInParentPath} because it does not include ` +
            `connection ${encounteredSegment.getAsString()}.\n`)
          continue
        }
      }

      // Ignore cycles.
      if (childPathId === endingId) {
        _Debug(() =>
          `[VdfSparseInputPathFinder] ...... ignoring child path ${childPathId} ` +
          'because it is a cycle.\n')
        continue
      }

      _Debug(() =>
        `[VdfSparseInputPathFinder] ...... path ${pathId} has child-path ` +
        `${childPathId} starting at ${childStartInParentPath}, queuing lookup.\n`)

      pathToLookup.add(childPathId)
    }
  }

  // _FinalizePendingResults (sparseInputPathFinder.cpp:178-278).
  private _finalizePendingResults(paths: VdfConnection[][]): void {
    _Debug(() => '\n[VdfSparseInputPathFinder] Finalizing Pending Results:\n')

    for (const potentialResult of this._potentialResults.values()) {
      const ending = potentialResult.ending
      const encountered = potentialResult.encountered

      _Debug(() =>
        `[VdfSparseInputPathFinder] ... segment ${ending.getAsString()} ` +
        `(final len= ${this._paths[ending.id]!.length}) ` +
        `leads into ${encountered.getAsString()} (which is the first index to be incl. into ` +
        'result path).\n')

      // Be lazy about the common prefix path.
      let prefixPathBuilt = false
      let prefix: VdfConnection[] = []

      // Find all children of encountered.id (std::set: smallest first).
      const pathToLookup = new Set<number>([encountered.id])

      while (pathToLookup.size) {
        const pathId = Math.min(...pathToLookup)
        pathToLookup.delete(pathId)

        this._appendChildPathsToWorkingSet(pathToLookup, pathId, encountered, ending.id)

        // If path doesn't lead to the target ignore it.
        if (!this._pathToResultMap.has(pathId)) {
          _Debug(() =>
            `[VdfSparseInputPathFinder] ... path ${pathId} doesn't reach ` +
            'target, ignoring.\n')
          continue
        }

        _Debug(() => `[VdfSparseInputPathFinder] ... path ${pathId} reaches target.\n`)

        if (!prefixPathBuilt) {
          _Debug(() =>
            `[VdfSparseInputPathFinder] ... building prefix path ${ending.getAsString()}.\n`)
          // The prefix is the segment that encountered the merge point.
          prefix = this._buildFullPath(ending, null /* start */)
          prefixPathBuilt = true
        }

        _Debug(() =>
          `[VdfSparseInputPathFinder] ... building postfix path ${pathId}, ` +
          `starting at ${encountered.getAsString()}.\n`)

        const postfix = this._buildFullPath(
          new _PathSegment(pathId, this._paths[pathId]!.length), encountered)

        const result = [...prefix, ...postfix]

        // Added directly to the result set: it has no path id.
        paths.push(result)

        if (VdfIsDebugEnabled(_DEBUG)) {
          TfDebug.msg(_DEBUG,
            `[VdfSparseInputPathFinder] ... added result no. ${paths.length} ` +
            `as path of len ${result.length}:\n`)
          for (const c of result) {
            TfDebug.msg(_DEBUG, `[VdfSparseInputPathFinder] ...... ${c.getDebugName()}\n`)
          }
        }
      }
    }
  }

  // _BuildFullPath (sparseInputPathFinder.cpp:280-363): the full path to end,
  // including parent paths, optionally starting at start.
  private _buildFullPath(end: _PathSegment, start: _PathSegment | null): VdfConnection[] {
    const result: VdfConnection[] = []

    _Debug(() =>
      `[VdfSparseInputPathFinder] BuildFullPath() for end ${end.getAsString()}, ` +
      `start ${start ? '(explicit) ' : ''}#${start ? start.id : end.id} at ` +
      `${start ? start.len : 0}:\n`)

    // Gather the segments of the path and its parents.
    const segments: _PathSegment[] = []

    let segment = end

    for (;;) {
      TF_VERIFY(
        segment.id < this._paths.length &&
        segment.len <= this._paths[segment.id]!.length,
        'segment.id < _paths.size() && segment.len <= _paths[segment.id].size()',
        `segment: id ${segment.id}, len ${segment.len}, ` +
        `sz ${this._paths[segment.id]?.length ?? 0}`)

      segments.push(segment)

      const s = segment
      _Debug(() => `[VdfSparseInputPathFinder] ... discovered ${s.getAsString()}\n`)

      const parent = this._pathToParentSegmentMap.get(segment.id)
      if (!parent) break

      segment = parent
    }

    // The end of the path is segments[0], followed by earlier parts.
    let includeSegment = !start

    for (let k = segments.length - 1; k >= 0; --k) {
      const i = segments[k]!
      const path = this._paths[i.id]!

      let startIndex = 0

      // Ignore elements and segments before the start point.
      if (start && i.id === start.id) {
        includeSegment = true
        startIndex = start.len
      }

      const inc = includeSegment
      _Debug(() =>
        `[VdfSparseInputPathFinder] ... segment ${i.getAsString()}: includeSegment ` +
        `${inc ? 1 : 0}, startIndex ${startIndex}\n`)

      if (!includeSegment) continue

      result.push(...path.slice(startIndex, i.len))
    }

    if (VdfIsDebugEnabled(_DEBUG)) {
      for (const c of result) {
        TfDebug.msg(_DEBUG, `[VdfSparseInputPathFinder] ...... ${c.getDebugName()}\n`)
      }
    }

    return result
  }

  // _TraverseSeenConnection (sparseInputPathFinder.cpp:365-414).
  private _traverseSeenConnection(ending: _PathSegment, encountered: _PathSegment): void {
    // encountered includes the connection itself, so its length is > 0.
    TF_VERIFY(encountered.len > 0, 'encountered.len > 0')

    _Debug(() =>
      `[VdfSparseInputPathFinder] ... encountered ${encountered.getAsString()} while ` +
      `traversing with ending ${ending.getAsString()}.\n`)

    // Two paths merge. A potential result is tracked when the ending path is
    // relevant and its relevance differs from encountered's.
    const relEnding = this._pathToRelevanceMap.get(ending.id) ?? null

    if (relEnding) {
      const relEncountered = this._pathToRelevanceMap.get(encountered.id) ?? null

      if (relEnding !== relEncountered) {
        _Debug(() =>
          '[VdfSparseInputPathFinder] ... queued potential result ' +
          `for ending ${ending.getAsString()} leading into encountered ` +
          `${encountered.getAsString()}.\n`)

        // len-1: the found connection is already included in encountered.
        const potentialResult: _PotentialResult = {
          ending: new _PathSegment(ending.id, ending.len),
          encountered: new _PathSegment(encountered.id, encountered.len - 1),
        }
        const key = _PotentialResultKey(potentialResult)
        if (!this._potentialResults.has(key)) {
          this._potentialResults.set(key, potentialResult)
        }
      }
    }
  }

  // _TraverseFrame (sparseInputPathFinder.cpp:416-661).
  private _traverseFrame(frame: _StackFrame, isStartFrame: boolean): void {
    const maskedOutput = frame.maskedOutput
    const output = maskedOutput.GetOutput()!

    _Debug(() =>
      `[VdfSparseInputPathFinder] Visiting via ${frame.getAsString()}: ` +
      `"${output.getDebugName()}" '${maskedOutput.GetMask().getRLEString()}':\n`)

    const node = output.getNode()

    // The target is only reached if the affects mask overlaps the frame mask.
    const affectsMask = output.getAffectsMask()
    const isAffective = affectsMask ? affectsMask.overlaps(maskedOutput.GetMask()) : true

    if (!isStartFrame && isAffective && output === this._targetOutput) {
      _Debug(() =>
        '[VdfSparseInputPathFinder] ... ! found target output via ' +
        `pathId= ${frame.id}.\n`)

      // frame has the correct length at this point.
      const result = this._buildFullPath(frame, null /* start */)
      TF_VERIFY(result.length, '!result.empty()')

      this._pathToResultMap.set(frame.id, result)

      if (VdfIsDebugEnabled(_DEBUG)) {
        TfDebug.msg(_DEBUG,
          `[VdfSparseInputPathFinder] ... added result path ${frame.id}, len ` +
          `${result.length}:\n`)
        for (const c of result) {
          TfDebug.msg(_DEBUG, `[VdfSparseInputPathFinder] ...... ${c.getDebugName()}\n`)
        }
      }

      return
    }

    // The first dependent connection extends the frame's path; others spawn
    // new paths. A re-traversing frame always spawns new paths.
    let continueFramePath = true

    if (this._paths[frame.id]!.length !== frame.len) continueFramePath = false

    for (const [, input] of node.getInputsIterator()) {
      const isRelevantInput = this._inputCallback ? this._inputCallback(input) : false

      for (const c of input.getConnections()) {
        const dependencyMaskBits = node.computeInputDependencyMask(maskedOutput, c)

        if (dependencyMaskBits.areAllUnset()) continue

        const dependencyMask = new VdfMask(dependencyMaskBits)

        _Debug(() =>
          `[VdfSparseInputPathFinder] ... traversing "${c.getDebugName()}" ` +
          `'${dependencyMask.getRLEString()}':\n`)

        // Already visited with the same dependency mask?
        const d = this._visitedConnectionsInfoMap.get(c)
        if (d) {
          const encountered = d.get(_MaskKey(dependencyMask))
          if (encountered) {
            this._traverseSeenConnection(frame, encountered)
            continue
          }
        }

        let visitedSegment = new _PathSegment()
        let relevance: VdfInput | null = null

        if (continueFramePath) {
          continueFramePath = false

          // Continue the current path frame.id.
          visitedSegment = new _PathSegment(frame.id, frame.len + 1)

          const vs = visitedSegment
          _Debug(() =>
            `[VdfSparseInputPathFinder] ...... continuing as segment ${vs.getAsString()}.\n`)

          // Only the first relevant input of a path is recorded.
          if (isRelevantInput && !this._pathToRelevanceMap.has(frame.id)) {
            relevance = input
          }
        } else {
          // Allocate a new path, a child of the current path.
          const newPathId = this._paths.length
          this._paths.push([])

          // No parent/child relationship for an empty parent.
          if (frame.len) {
            this._pathToParentSegmentMap.set(newPathId, new _PathSegment(frame.id, frame.len))
            let children = this._pathToPathChildrenMap.get(frame.id)
            if (!children) {
              children = []
              this._pathToPathChildrenMap.set(frame.id, children)
            }
            children.push(newPathId)

            _Debug(() =>
              '[VdfSparseInputPathFinder] ...... branched as new ' +
              `child ${newPathId} at ${frame.getAsString()}.\n`)
          } else {
            // Siblings appear when the start node has several connections.
            _Debug(() =>
              '[VdfSparseInputPathFinder] ...... branched as new ' +
              `sibling ${newPathId} at ${frame.id}.\n`)
          }

          visitedSegment = new _PathSegment(newPathId, 1)

          if (isRelevantInput) relevance = input
        }

        if (relevance) {
          const vs = visitedSegment
          _Debug(() =>
            '[VdfSparseInputPathFinder] ... is relevant: marking ' +
            `path #${vs.id} with relevance.\n`)

          this._pathToRelevanceMap.set(visitedSegment.id, relevance)
        }

        TF_VERIFY(visitedSegment.len >= 1, 'visitedSegment.len >= 1')

        {
          const vs = visitedSegment
          _Debug(() =>
            `[VdfSparseInputPathFinder] ... visited via ${vs.getAsString()}: ` +
            `"${c.getDebugName()}" '${dependencyMask.getRLEString()}'\n`)
        }

        // Mark the connection: it is visited for the first time or expanded.
        let visited = this._visitedConnectionsInfoMap.get(c)
        if (!visited) {
          visited = new Map()
          this._visitedConnectionsInfoMap.set(c, visited)
        }
        const maskKey = _MaskKey(dependencyMask)
        const res = !visited.has(maskKey)
        if (res) visited.set(maskKey, visitedSegment)

        TF_VERIFY(
          res && visitedSegment.id < this._paths.length &&
          this._paths[visitedSegment.id]!.length === visitedSegment.len - 1,
          'res && visitedSegment.id < _paths.size() && ' +
          '_paths[visitedSegment.id].size() == visitedSegment.len - 1')

        // Append the connection to the current path.
        this._paths[visitedSegment.id]!.push(c)

        this._stack.push(new _StackFrame(
          new VdfMaskedOutput(c.getNonConstSourceOutput(), dependencyMask),
          visitedSegment))
      }
    }

    if (continueFramePath) {
      _Debug(() =>
        `[VdfSparseInputPathFinder] ... - path ${frame.id} ended here because no ` +
        'new relevant connections have been found.\n')
    }
  }
}

export declare namespace VdfSparseInputPathFinder {
  type InputCallback = VdfSparseInputPathFinder_InputCallback
}
