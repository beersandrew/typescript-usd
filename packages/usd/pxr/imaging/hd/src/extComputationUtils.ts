// Ported from OpenUSD 26.11.1: pxr/imaging/hd/extComputationUtils.cpp,
//  pxr/imaging/hd/extComputationUtils.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/extComputationUtils.{h,cpp} — the dependency-sort
// slice of HdExtComputationUtils.
//
// The directed graph of a computation (vertex) and its dependencies (edges) is
// represented via the ComputationDependencyMap. DependencySort produces a
// topological ordering wherein any dependencies of a given computation come
// before it, using Kahn's algorithm exactly as upstream does (deque of
// independent comps: emplace_back for the initial independents, pop_back to
// process, emplace_front for newly-resolved ones). Returns false if a cycle is
// detected (the graph isn't empty once the queue drains), clearing sortedComps.

import {
  HdExtComputation,
  type HdExtComputationInputDescriptor,
  type HdExtComputationOutputDescriptor,
} from './extComputation.ts'
import { HdTimeSampleArray } from './timeSampleArray.ts'

export type HdExtComputationConstPtr = HdExtComputation
export type HdExtComputationConstPtrVector = HdExtComputation[]

// Maps a computation to the vector of computations it depends on.
export type ComputationDependencyMap = Map<HdExtComputation, HdExtComputation[]>

// -- Sampled computation evaluation (SampleComputedPrimvarValues) --
//
// Mirrors the templated SampleComputedPrimvarValues / _ExecuteSampled
// computations slice of extComputationUtils.h. The execution drives everything
// through scene-delegate methods, so we model the delegate as an interface
// rather than reconstructing the HdRenderIndex / Sprim-sync machinery.

// Describes a "computation primvar": a primvar whose value is sourced from the
// named output of a computation. Mirrors HdExtComputationPrimvarDescriptor.
export interface HdExtComputationPrimvarDescriptor {
  name: string
  interpolation?: string
  role?: string
  sourceComputationId: string
  sourceComputationOutputName: string
  valueType?: unknown
}

// The time-sampled input values returned by the scene delegate for a single
// (computation, input) pair. Mirrors the (sampleTimes, sampleValues) buffers
// filled by HdSceneDelegate::SampleExtComputationInput, in struct-of-arrays
// form. The scalar (number) value path is modeled, matching timeSampleArray.
export interface HdExtComputationInputSamples {
  times: number[]
  values: number[]
}

// The execution environment passed to a computation kernel. Mirrors
// HdExtComputationContext (and the internal HdExtComputationContextInternal
// that backs it during execution): inputs are populated before invocation, the
// kernel reads them via GetInputValue and writes results via SetOutputValue.
export class HdExtComputationContext {
  private readonly _inputs: Map<string, number> = new Map()
  private readonly _outputs: Map<string, number> = new Map()
  private _error: boolean = false

  setInputValue(name: string, value: number): void {
    this._inputs.set(name, value)
  }

  // Obtains the value of a named input. Mirrors GetInputValue (which issues a
  // coding error and returns an empty value when the input is missing); here a
  // missing input returns 0.
  getInputValue(name: string): number {
    const v = this._inputs.get(name)
    return v === undefined ? 0 : v
  }

  getOptionalInputValue(name: string): number | undefined {
    return this._inputs.get(name)
  }

  setOutputValue(name: string, value: number): void {
    this._outputs.set(name, value)
  }

  // Retrieve a computed output. Returns undefined if absent (mirrors the bool
  // out-param of HdExtComputationContextInternal::GetOutputValue).
  getOutputValue(name: string): number | undefined {
    return this._outputs.get(name)
  }

  raiseComputationError(): void {
    this._error = true
  }

  hasComputationError(): boolean {
    return this._error
  }
}

// The set of scene-delegate methods exercised by the sampled-evaluation slice.
// Mirrors the corresponding HdSceneDelegate virtuals.
export interface HdExtComputationSceneDelegate {
  getExtComputationSceneInputNames(computationId: string): string[]
  getExtComputationInputDescriptors(
    computationId: string,
  ): HdExtComputationInputDescriptor[]
  getExtComputationOutputDescriptors(
    computationId: string,
  ): HdExtComputationOutputDescriptor[]
  sampleExtComputationInput(
    computationId: string,
    input: string,
    maxSampleCount: number,
  ): HdExtComputationInputSamples
  invokeExtComputation(
    computationId: string,
    context: HdExtComputationContext,
  ): void
}

// A map containing the (token, samples) pairs for each computation primvar.
// Mirrors HdExtComputationUtils::SampledValueStore<CAPACITY> (the CAPACITY
// template parameter is threaded as the `capacity` argument instead).
export type SampledValueStore = Map<string, HdTimeSampleArray<number>>

// Limits a list of input time samples to the specified maximum number of
// (unique) samples: sort, dedupe, then truncate. Mirrors _LimitTimeSamples.
function _LimitTimeSamples(maxSampleCount: number, times: number[]): number[] {
  const sorted = times.slice().sort((a, b) => a - b)
  const unique: number[] = []
  for (const t of sorted) {
    if (unique.length === 0 || unique[unique.length - 1] !== t) {
      unique.push(t)
    }
  }
  unique.length = Math.min(unique.length, maxSampleCount)
  return unique
}

// Invoke a computation with the specified resampled input values, storing the
// output values in compOutputValues. Mirrors _InvokeComputation: the value
// arrays correspond to GetSceneInputNames(), GetComputationInputs() and
// GetComputationOutputs(), respectively. Returns false on error.
function _InvokeComputation(
  sceneDelegate: HdExtComputationSceneDelegate,
  comp: HdExtComputation,
  sceneInputValues: number[],
  compInputValues: number[],
  compOutputValues: number[],
): boolean {
  const sceneInputNames = comp.getSceneInputNames()
  const compInputs = comp.getComputationInputs()
  const compOutputs = comp.getComputationOutputs()

  // Populate the context with all the inputs (scene, computed).
  const context = new HdExtComputationContext()
  for (let i = 0; i < sceneInputValues.length; ++i) {
    context.setInputValue(sceneInputNames[i]!, sceneInputValues[i]!)
  }
  for (let i = 0; i < compInputValues.length; ++i) {
    context.setInputValue(compInputs[i]!.name, compInputValues[i]!)
  }

  sceneDelegate.invokeExtComputation(comp.getId(), context)

  if (context.hasComputationError()) {
    return false
  }

  // Retrieve the computed output values from the context.
  for (let i = 0; i < compOutputs.length; ++i) {
    const value = context.getOutputValue(compOutputs[i]!.name)
    if (value === undefined) {
      return false
    }
    compOutputValues[i] = value
  }

  return true
}

// Discover the computation tied to each computation primvar and traverse the
// dependency graph, building the ComputationDependencyMap. Computations are
// created lazily from the scene delegate's descriptors (keyed by id), mirroring
// the render-index Sprim lookups in _GenerateDependencyMap.
function _GenerateDependencyMap(
  compPrimvars: HdExtComputationPrimvarDescriptor[],
  sceneDelegate: HdExtComputationSceneDelegate,
  getComputation: (computationId: string) => HdExtComputation,
): ComputationDependencyMap {
  const computations: HdExtComputation[] = []

  // First discover the computation tied to the computation primvars.
  for (const pv of compPrimvars) {
    computations.push(getComputation(pv.sourceComputationId))
  }

  // Traverse the computation graph. At each step pop a node, exit early if it
  // has already been processed, discover its dependent comps and queue them.
  const cdm: ComputationDependencyMap = new Map()
  while (computations.length > 0) {
    const curComp = computations.shift()!
    if (cdm.has(curComp)) {
      continue
    }

    const entry: HdExtComputation[] = []
    cdm.set(curComp, entry)

    // Get unique dependent computation ids.
    const dependentCompIds = new Set<string>()
    for (const input of curComp.getComputationInputs()) {
      dependentCompIds.add(input.sourceComputationId)
    }

    // Update the dependency map entry and queue the dependent comps.
    for (const depCompId of dependentCompIds) {
      const depComp = getComputation(depCompId)
      entry.push(depComp)
      computations.push(depComp)
    }
  }

  return cdm
}

// Execute the (dependency-ordered) computations, sampling their scene inputs,
// computing the union of contributing sample times (capped at maxSampleCount),
// resampling inputs to each union time, and recording the outputs. Mirrors
// _ExecuteSampledComputations.
function _ExecuteSampledComputations(
  computations: HdExtComputationConstPtrVector,
  sceneDelegate: HdExtComputationSceneDelegate,
  maxSampleCount: number,
  capacity: number,
  valueStore: SampledValueStore,
): void {
  for (const comp of computations) {
    const compId = comp.getId()
    const compInputs = comp.getComputationInputs()
    const compOutputs = comp.getComputationOutputs()

    // Add all the scene inputs to the value store.
    const times: number[] = []
    for (const input of comp.getSceneInputNames()) {
      const samples = new HdTimeSampleArray<number>()
      const sampled = sceneDelegate.sampleExtComputationInput(
        compId,
        input,
        capacity,
      )
      samples.times = sampled.times.slice()
      samples.values = sampled.values.slice()
      samples.count = sampled.times.length
      valueStore.set(input, samples)

      for (let i = 0; i < samples.count; ++i) {
        times.push(samples.times[i]!)
      }
    }

    if (comp.isInputAggregation()) {
      // An aggregator computation produces no output, and thus doesn't need to
      // be executed.
      continue
    }

    // Also find all the time samples from the computed inputs.
    for (const computedInput of compInputs) {
      const samples = valueStore.get(computedInput.sourceComputationOutputName)!
      for (let i = 0; i < samples.count; ++i) {
        times.push(samples.times[i]!)
      }
    }

    // Determine the time samples to evaluate the computation at.
    const evalTimes = _LimitTimeSamples(maxSampleCount, times)

    // Allocate enough space for the evaluated outputs.
    for (const name of comp.getOutputNames()) {
      const outputSamples = new HdTimeSampleArray<number>()
      outputSamples.resize(evalTimes.length)
      outputSamples.count = 0
      valueStore.set(name, outputSamples)
    }

    // Evaluate the computation for each time sample.
    for (const t of evalTimes) {
      // Retrieve all the inputs (scene, computed) resampled to time t.
      const sceneInputValues: number[] = []
      for (const sceneInput of comp.getSceneInputNames()) {
        sceneInputValues.push(valueStore.get(sceneInput)!.resample(t))
      }

      const compInputValues: number[] = []
      for (const computedInput of compInputs) {
        const samples = valueStore.get(
          computedInput.sourceComputationOutputName,
        )!
        compInputValues.push(samples.resample(t))
      }

      const compOutputValues: number[] = new Array(compOutputs.length).fill(0)
      if (
        !_InvokeComputation(
          sceneDelegate,
          comp,
          sceneInputValues,
          compInputValues,
          compOutputValues,
        )
      ) {
        // We could bail here; choose instead to execute other computations.
        continue
      }

      // Add outputs to the value store (subsequent computations may need them
      // as computation inputs).
      for (let i = 0; i < compOutputValues.length; ++i) {
        const outputSamples = valueStore.get(compOutputs[i]!.name)!
        outputSamples.times[outputSamples.count] = t
        outputSamples.values[outputSamples.count] = compOutputValues[i]!
        ++outputSamples.count
      }
    }
  }
}

export const HdExtComputationUtils = {
  // Returns true if an ordering of the computations wherein any dependencies
  // of a given computation come before it is possible, and fills sortedComps
  // with the ordering. Returns false otherwise (i.e. a cycle exists).
  dependencySort(
    cdm: ComputationDependencyMap,
    sortedComps: HdExtComputationConstPtrVector,
  ): boolean {
    // DependencySort takes cdm by value upstream and mutates it; clone so we
    // don't disturb the caller's map (and copy the dependency vectors).
    const graph: ComputationDependencyMap = new Map()
    for (const [comp, deps] of cdm) {
      graph.set(comp, deps.slice())
    }

    sortedComps.length = 0

    // -- Kahn's topological sorting algorithm --
    const independentComps: HdExtComputation[] = []

    // Add independent comps to the queue and remove them from the graph.
    for (const [comp, dependencies] of [...graph]) {
      if (dependencies.length === 0) {
        independentComps.push(comp)
        graph.delete(comp)
      }
    }

    // On each iteration, pop a computation from the queue, and remove it from
    // the dependency list for each computation in the graph (if it exists).
    // On removal, if the latter has no remaining dependencies, add it to the
    // queue and remove it from the graph.
    while (independentComps.length > 0) {
      const indComp = independentComps.pop()!
      sortedComps.push(indComp)

      // Remove dependency edge from computations that depend on indComp.
      for (const [comp, dependencies] of [...graph]) {
        const depIdx = dependencies.indexOf(indComp)
        if (depIdx !== -1) {
          dependencies.splice(depIdx, 1)
        }

        if (dependencies.length === 0) {
          // Its dependencies have been resolved; queue it and remove it from
          // the graph so we don't revisit it.
          independentComps.unshift(comp)
          graph.delete(comp)
        }
      }
    }

    // If the graph isn't empty, there are computations whose dependencies were
    // never resolved. This can happen only when there are cycles.
    if (graph.size > 0) {
      sortedComps.length = 0
      return false
    }

    return true
  },

  // Fills computedPrimvarValueStore with the (token, samples) pairs for each
  // computation primvar, with up to maxSampleCount samples. The participating
  // computations are ordered by dependency, then the CPU kernel is executed for
  // each computation at the union of contributing input sample times. Mirrors
  // HdExtComputationUtils::SampleComputedPrimvarValues<CAPACITY> (capacity is
  // the per-input sample cap, the C++ CAPACITY template parameter).
  sampleComputedPrimvarValues(
    compPrimvars: HdExtComputationPrimvarDescriptor[],
    sceneDelegate: HdExtComputationSceneDelegate,
    maxSampleCount: number,
    computedPrimvarValueStore: SampledValueStore,
    capacity: number = maxSampleCount,
  ): void {
    // Lazily create/memoize the HdExtComputation for an id, populating its
    // descriptors from the scene delegate (mirrors the Sprim Sync the render
    // index performs before _GenerateDependencyMap runs).
    const compRegistry = new Map<string, HdExtComputation>()
    const getComputation = (computationId: string): HdExtComputation => {
      let comp = compRegistry.get(computationId)
      if (!comp) {
        comp = new HdExtComputation(computationId)
        comp._setDescriptors(
          sceneDelegate.getExtComputationSceneInputNames(computationId),
          sceneDelegate.getExtComputationInputDescriptors(computationId),
          sceneDelegate.getExtComputationOutputDescriptors(computationId),
        )
        compRegistry.set(computationId, comp)
      }
      return comp
    }

    // Directed graph representation of the participating computations.
    const cdm = _GenerateDependencyMap(compPrimvars, sceneDelegate, getComputation)

    // Topological ordering of the computations.
    const sortedComputations: HdExtComputationConstPtrVector = []
    if (!this.dependencySort(cdm, sortedComputations)) {
      return
    }

    // Execution.
    const valueStore: SampledValueStore = new Map()
    _ExecuteSampledComputations(
      sortedComputations,
      sceneDelegate,
      maxSampleCount,
      capacity,
      valueStore,
    )

    // Output extraction.
    for (const pv of compPrimvars) {
      const samples = valueStore.get(pv.sourceComputationOutputName)
      if (samples) {
        computedPrimvarValueStore.set(pv.name, samples)
      }
    }
  },
}
