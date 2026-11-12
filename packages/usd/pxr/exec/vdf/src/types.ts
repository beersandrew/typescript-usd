// Ported from OpenUSD 26.11.1: pxr/exec/vdf/types.cpp, pxr/exec/vdf/types.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/types.h and types.cpp.
//
// The C++ typedefs map to TS type aliases (openexec-x1.md 4.1 "Ids" and
// "Pointers"): VdfId, VdfIndex and VdfVersion are numbers; pointer-keyed hash
// sets and maps are JS Sets and Maps keyed by the object.

import { TfEnvSetting, TfGetEnvSetting } from 'typescript-usd/tf'
import type { VdfConnection } from './connection.ts'
import type { VdfInput } from './input.ts'
import type { VdfMask } from './mask.ts'
import type { VdfNode } from './node.ts'
import type { VdfOutput } from './output.ts'

// types.cpp:13-16. Upstream defaults to true; the parallel engine is not
// ported, so the TS default is false (openexec-x1.md section 5, decision D1).
// PLATFORM-DIVERGENCE(openexec-parallel): VDF_ENABLE_PARALLEL_EVALUATION_ENGINE
// default true (types.cpp:13) -> default true once the parallel executor
// engine is ported.
const VDF_ENABLE_PARALLEL_EVALUATION_ENGINE = new TfEnvSetting<boolean>(
  'VDF_ENABLE_PARALLEL_EVALUATION_ENGINE', false,
  'Enables parallel evaluation at the level of a single round of exec ' +
  'evaluation. This is distinct from other forms of evaluation parallelism ' +
  'where results for different times may be computed in parallel.')

/** Returns true if single-frame parallel evaluation is enabled (types.cpp:18-22). */
export function VdfIsParallelEvaluationEnabled(): boolean {
  return TfGetEnvSetting(VDF_ENABLE_PARALLEL_EVALUATION_ENGINE)
}

/** Type for an ordered collection of connections (types.h:34). */
export type VdfConnectionVector = VdfConnection[]

/** Type for an ordered collection of connections (types.h:37). */
export type VdfConnectionConstVector = readonly VdfConnection[]

/** Type for an unordered set of connections (types.h:40). */
export type VdfConnectionSet = Set<VdfConnection>

/** Type for an unordered set of connections (types.h:43). */
export type VdfConnectionConstSet = Set<VdfConnection>

/** Type for an unordered set of nodes pointers (types.h:46). */
export type VdfNodePtrSet = Set<VdfNode>

/** Type for an unordered set of output pointers (types.h:49). */
export type VdfOutputPtrSet = Set<VdfOutput>

/** Type for an unordered set of input pointers (types.h:52). */
export type VdfInputPtrSet = Set<VdfInput>

/** Type for an ordered collection of inputs (types.h:55). */
export type VdfInputPtrVector = VdfInput[]

/** Type for an ordered collection of outputs (types.h:58). */
export type VdfOutputPtrVector = VdfOutput[]

/** Type of callback used when processing nodes (types.h:61). */
export type VdfNodeCallback = (node: VdfNode) => void

/** Type of callback for building a node debug name (types.h:64). */
export type VdfNodeDebugNameCallback = () => string

/** Type of the timestamp of the most recent round of invalidation (types.h:67). */
export type VdfInvalidationTimestamp = number

/** A pair of connection and mask for sparse input dependency computation (types.h:70). */
export type VdfConnectionAndMask = [VdfConnection, VdfMask]

/** A vector of VdfConnectionAndMasks (types.h:73). */
export type VdfConnectionAndMaskVector = VdfConnectionAndMask[]

/** Function type to be used with ForEachScheduledOutput() (types.h:77-79). */
export type VdfScheduledOutputCallback = (output: VdfOutput, mask: VdfMask) => void

/** A map from node pointer to VdfOutputPtrSet (types.h:83-85). */
export type VdfNodeToOutputPtrSetMap = Map<VdfNode, VdfOutputPtrSet>

/** A map from node pointer to VdfInputPtrVector (types.h:88-89). */
export type VdfNodeToInputPtrVectorMap = Map<VdfNode, VdfInputPtrVector>

/** A map from node pointer to VdfOutputPtrVector (types.h:92-93). */
export type VdfNodeToOutputPtrVectorMap = Map<VdfNode, VdfOutputPtrVector>

/** A map from output pointer to mask (types.h:96-98). */
export type VdfOutputToMaskMap = Map<VdfOutput, VdfMask>

/** The unique identifier type for Vdf objects (types.h:101): version * 2**32 + index. */
export type VdfId = number

/** The index type for Vdf objects (types.h:104). */
export type VdfIndex = number

/** The version type for Vdf objects (types.h:107). */
export type VdfVersion = number

/** A vector of ids (types.h:110). */
export type VdfIdVector = VdfId[]

/**
 * Vdf_DefaultInitVector (types.h:116-117): a std::vector whose resize default-
 * initializes. A JS array; see defaultInitAllocator.ts.
 */
export type Vdf_DefaultInitVector<T> = T[]
