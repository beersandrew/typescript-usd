// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// testHdStDepthBias's code-generator text under HgiWebGPU's capabilities
// (pxr/imaging/hgiWebGPU/src/capabilities.ts). There is no native oracle for
// this text; it is what HgiWebGPU's shader generator would receive.
//
// The capabilities are computed by HgiWebGPUCapabilities from a device
// description: by default the WebGPU specification's default limits and no
// optional features (so PrimitiveIdEmulation is set, as on a device without
// 'primitive-index').

import { HgiWebGPUCapabilities, HgiWebGPUTokens } from 'typescript-usd/hgiWebGPU'
import type { Hgi } from 'typescript-usd/hgi'
import type { HdStResourceRegistry } from '../src/resourceRegistry.ts'
import { HgiCodegenTest } from './codegenTestHgi.ts'
import {
  DepthBiasCodegenPrograms,
  type DepthBiasCodegenPrograms as Programs,
} from './depthBiasCodegenPrograms.ts'

/** WebGPU specification default limits ("Limits" table, GPUSupportedLimits),
 *  the members HgiWebGPUCapabilities reads. */
export const WEBGPU_DEFAULT_LIMITS = {
  maxUniformBufferBindingSize: 65536,
  maxStorageBufferBindingSize: 134217728,
  minUniformBufferOffsetAlignment: 256,
  minStorageBufferOffsetAlignment: 256,
  maxComputeWorkgroupsPerDimension: 65535,
  maxSamplersPerShaderStage: 16,
}

/** An Hgi reporting HgiWebGPU's API name and the capabilities
 *  HgiWebGPUCapabilities derives from `features` and `limits`. */
export function HgiCodegenTestWebGPU(
  features: readonly string[] = [],
  limits: typeof WEBGPU_DEFAULT_LIMITS = WEBGPU_DEFAULT_LIMITS,
): HgiCodegenTest {
  const device = { features: new Set(features), limits } as unknown as GPUDevice
  return new HgiCodegenTest(HgiWebGPUTokens.WebGPU, new HgiWebGPUCapabilities(device))
}

/** testHdStDepthBias's programs' stage texts under HgiWebGPU capabilities. */
export function DepthBiasCodegenProgramsWebGPU(
  makeRegistry: (hgi: Hgi) => HdStResourceRegistry,
  features: readonly string[] = [],
  limits: typeof WEBGPU_DEFAULT_LIMITS = WEBGPU_DEFAULT_LIMITS,
): Programs {
  return DepthBiasCodegenPrograms(HgiCodegenTestWebGPU(features, limits), makeRegistry)
}
