// Ported from OpenUSD 26.11.1: pxr/exec/vdf/indexedWeights.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/indexedWeights.h.
//
// VdfIndexedWeights is VdfIndexedData<float> (indexedWeights.h:16). As a
// value type flowing through execution it is named by its C++ class name
// with TfType (openexec-x1.md 4.1 "TfType identity").

import { Type as TfType } from 'typescript-usd/tf'
import { VdfIndexedData } from './indexedData.ts'

/** VdfIndexedWeights (indexedWeights.h:16): indexed float weights. */
export class VdfIndexedWeights extends VdfIndexedData<number> {}

/** The TfType of VdfIndexedWeights. */
export const VdfIndexedWeightsType: TfType = TfType.define('VdfIndexedWeights')
