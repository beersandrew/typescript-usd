// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/drawBatch.cpp,
//  pxr/imaging/hdSt/drawBatch.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/drawBatch.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - HDST_DEBUG_SHADER_PROGRAM_FOR_PRIM is read with TfGetenv upstream
//   (drawBatch.cpp:60-61); there is no TfGetenv here, so it is a string
//   TfEnvSetting, which reads the same environment variable.
// - Shader hashes are TfHashCombine's bigint (upstream size_t).
// - The fallback / invalid material network shaders are created lazily on
//   first use, as upstream's std::call_once does.

import {
  type Token as TfToken,
  Debug as TfDebug,
  HashCombine as TfHashCombine,
  TfEnvSetting,
  TfGetEnvSetting,
} from 'typescript-usd/tf'
import type { BufferArrayRange as HdBufferArrayRange } from 'typescript-usd/hd'
import type { HgiGraphicsCmds } from 'typescript-usd/hgi'
import { HioGlslfx } from 'typescript-usd/hio'
import { HdStBindingRequest } from './binding.ts'
import { HdSt_CodeGen } from './codeGen.ts'
import { HdStDebugCodes } from './debugCodes.ts'
import type { HdStDrawItem } from './drawItem.ts'
import type { HdStDrawItemInstance } from './drawItemInstance.ts'
import type { HdSt_GeometricShader } from './geometricShader.ts'
import { HdStGLSLFXShader } from './glslfxShader.ts'
import type { HdStGLSLProgram } from './glslProgram.ts'
import type { HdSt_MaterialNetworkShader } from './materialNetworkShader.ts'
import {
  HdStPackageFallbackMaterialNetworkShader,
  HdStPackageInvalidMaterialNetworkShader,
} from './package.ts'
import type { HdStRenderPassState } from './renderPassState.ts'
import { HdSt_ResourceBinder, HdSt_ResourceBinderMetaData } from './resourceBinder.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import type { HdStShaderCode } from './shaderCode.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/** drawBatch.cpp:36-38 */
export const HDST_ENABLE_BROKEN_SHADER_VISUAL_FEEDBACK = new TfEnvSetting<boolean>(
  'HDST_ENABLE_BROKEN_SHADER_VISUAL_FEEDBACK', false,
  'Provide visual feedback for prims when the composed shader fails to ' +
  'compile or link by using the invalid material shader.')

/** drawBatch.cpp:54-62 (TfGetenv("HDST_DEBUG_SHADER_PROGRAM_FOR_PRIM")) */
const HDST_DEBUG_SHADER_PROGRAM_FOR_PRIM = new TfEnvSetting<string>(
  'HDST_DEBUG_SHADER_PROGRAM_FOR_PRIM', '',
  'Prim path substring limiting shader program cache logging.')

/** drawBatch.cpp:43-49 */
function _ProvideVisualFeedbackForBrokenShaders(): boolean {
  return TfGetEnvSetting(HDST_ENABLE_BROKEN_SHADER_VISUAL_FEEDBACK)
}

/** drawBatch.cpp:51-63 */
function _GetPrimPathSubstringForDebugLogging(): string {
  return TfGetEnvSetting(HDST_DEBUG_SHADER_PROGRAM_FOR_PRIM)
}

/** drawBatch.cpp:65-86 */
function _LogShaderCacheLookupForDrawBatch(
  drawItemInstances: readonly HdStDrawItemInstance[]): boolean {
  const substring = _GetPrimPathSubstringForDebugLogging()
  if (substring.length === 0) {
    return true // log all batches.
  }
  for (const drawItemInstance of drawItemInstances) {
    const drawItem = drawItemInstance.getDrawItem()
    if (TF_VERIFY(drawItem)) {
      if (String(drawItem.getRprimID()).includes(substring)) {
        return true
      }
    }
  }
  return false
}

/** drawBatch.cpp:134-146 */
function isAggregated(rangeA: HdBufferArrayRange | null, rangeB: HdBufferArrayRange | null): boolean {
  if (rangeA) {
    return rangeB !== null && rangeA.isAggregatedWith(rangeB)
  } else {
    if (!rangeB) {
      // can batch together if both ranges are empty.
      return true
    }
  }
  return false
}

/** drawBatch.cpp:301-317 */
let _fallbackMaterialNetworkShader: HdSt_MaterialNetworkShader | null = null
function _GetFallbackMaterialNetworkShader(): HdSt_MaterialNetworkShader {
  if (!_fallbackMaterialNetworkShader) {
    const glslfx = new HioGlslfx(HdStPackageFallbackMaterialNetworkShader())
    _fallbackMaterialNetworkShader = new HdStGLSLFXShader(glslfx)
  }
  return _fallbackMaterialNetworkShader
}

/** drawBatch.cpp:319-335 */
let _invalidMaterialNetworkShader: HdSt_MaterialNetworkShader | null = null
function _GetInvalidMaterialNetworkShader(): HdSt_MaterialNetworkShader {
  if (!_invalidMaterialNetworkShader) {
    const glslfx = new HioGlslfx(HdStPackageInvalidMaterialNetworkShader())
    _invalidMaterialNetworkShader = new HdStGLSLFXShader(glslfx)
  }
  return _invalidMaterialNetworkShader
}

/** drawBatch.h:56-61 */
export enum HdSt_DrawBatchValidationResult {
  ValidBatch = 0,
  RebuildBatch,
  RebuildAllBatches,
}

type DrawingCoordBufferBinding = HdSt_ResourceBinderMetaData['drawingCoordBufferBinding']

/** drawBatch.h:126-237 (HdSt_DrawBatch::_DrawingProgram) */
export class HdSt_DrawBatchDrawingProgram {
  private _glslProgram: HdStGLSLProgram | null = null
  private _resourceBinder = new HdSt_ResourceBinder()
  private _drawingCoordBufferBinding: DrawingCoordBufferBinding =
    new HdSt_ResourceBinderMetaData().drawingCoordBufferBinding
  private _shaders: HdStShaderCode[] = []
  private _geometricShader: HdSt_GeometricShader | null = null
  private _materialNetworkShader: HdSt_MaterialNetworkShader | null = null

  /** drawBatch.cpp:418-422 */
  isValid(): boolean {
    return this._glslProgram !== null && this._glslProgram.validate()
  }

  /** drawBatch.cpp:424-510 */
  compileShader(
    drawItem: HdStDrawItem,
    resourceRegistry: HdStResourceRegistry,
    logCacheLookup = false,
  ): boolean {
    if (!this._geometricShader) {
      TF_CODING_ERROR('Can not compile a shader without a geometric shader')
      return false
    }

    // determine binding points and populate metaData
    const customBindings: HdStBindingRequest[] = []
    const instanceDraw = { value: true }
    this._getCustomBindings(customBindings, instanceDraw)

    // also (surface, renderPass) shaders use their bindings
    const shaders = this.getComposedShaders()

    for (const shader of shaders) {
      shader.addBindings(customBindings)
    }

    const metaData = new HdSt_ResourceBinderMetaData()

    // let resourcebinder resolve bindings and populate metadata
    // which is owned by codegen.
    this._resourceBinder.resolveBindings(drawItem,
      shaders,
      metaData,
      this._drawingCoordBufferBinding,
      instanceDraw.value,
      customBindings,
      resourceRegistry.getHgi().getCapabilities()!)

    const codeGen = new HdSt_CodeGen(this._geometricShader, shaders,
      drawItem.getMaterialTag() as TfToken, metaData)

    const hash = codeGen.computeHash()

    {
      // ask registry to see if there's already compiled program
      const programInstance = resourceRegistry.registerGLSLProgram(hash)

      if (programInstance.isFirstInstance()) {
        if (TfDebug.isEnabled(HdStDebugCodes.HDST_LOG_DRAWING_SHADER_PROGRAM_MISSES) &&
          logCacheLookup) {
          TfDebug.msg(HdStDebugCodes.HDST_LOG_DRAWING_SHADER_PROGRAM_MISSES,
            `(MISS) First program instance for batch with head draw ` +
            `item ${drawItem.getRprimID()} (hash = ${hash})\n`)
        }

        const glslProgram = codeGen.Compile(resourceRegistry)
        if (glslProgram && this._link(glslProgram)) {
          // store the program into the program registry.
          programInstance.setValue(glslProgram)
        }
      } else {
        if (TfDebug.isEnabled(HdStDebugCodes.HDST_LOG_DRAWING_SHADER_PROGRAM_HITS) &&
          logCacheLookup) {
          TfDebug.msg(HdStDebugCodes.HDST_LOG_DRAWING_SHADER_PROGRAM_HITS,
            `(HIT) Found program instance with hash = ${hash} for batch ` +
            `with head draw item ${drawItem.getRprimID()}\n`)
        }
      }

      this._glslProgram = programInstance.GetValue() ?? null

      if (!this._glslProgram) {
        // Failed to compile and link a valid glsl program.
        return false
      }
    }
    return true
  }

  /** drawBatch.h:142-144 */
  getGLSLProgram(): HdStGLSLProgram | null {
    return this._glslProgram
  }

  /** drawBatch.h:146 */
  getBinder(): HdSt_ResourceBinder {
    return this._resourceBinder
  }

  /** drawBatch.h:148-154 */
  Reset(): void {
    this._glslProgram = null
    this._materialNetworkShader = null
    this._geometricShader = null
    this._resourceBinder = new HdSt_ResourceBinder()
    this._shaders = []
  }

  /** drawBatch.h:156-160 */
  setDrawingCoordBufferBinding(drawingCoordBufferBinding: DrawingCoordBufferBinding): void {
    this._drawingCoordBufferBinding = drawingCoordBufferBinding
  }

  /** drawBatch.h:162-165 */
  getDrawingCoordBufferBinding(): DrawingCoordBufferBinding {
    return this._drawingCoordBufferBinding
  }

  /** drawBatch.h:167-170 */
  setMaterialNetworkShader(shader: HdSt_MaterialNetworkShader | null): void {
    this._materialNetworkShader = shader
  }

  /** drawBatch.h:172-175 */
  getMaterialNetworkShader(): HdSt_MaterialNetworkShader | null {
    return this._materialNetworkShader
  }

  /** drawBatch.h:177-179 */
  setGeometricShader(shader: HdSt_GeometricShader | null): void {
    this._geometricShader = shader
  }

  /** drawBatch.h:181-183 */
  getGeometricShader(): HdSt_GeometricShader | null {
    return this._geometricShader
  }

  /** drawBatch.h:186-188 */
  setShaders(shaders: HdStShaderCode[]): void {
    this._shaders = shaders
  }

  /** drawBatch.h:191-193 */
  getShaders(): HdStShaderCode[] {
    return this._shaders
  }

  /** drawBatch.h:196-202 */
  getComposedShaders(): HdStShaderCode[] {
    const shaders = [...this._shaders]
    if (this._materialNetworkShader) {
      shaders.push(this._materialNetworkShader)
    }
    return shaders
  }

  /** drawBatch.cpp:512-524. Overrides populate customBindings and
   *  enableInstanceDraw. */
  protected _getCustomBindings(
    _customBindings: HdStBindingRequest[],
    enableInstanceDraw: { value: boolean },
  ): void {
    // set enableInstanceDraw true by default, which means the shader is
    // expected to be invoked by instanced-draw call.
    // XFB culling is an exception, which uses glDrawArrays.
    enableInstanceDraw.value = true
  }

  /** drawBatch.cpp:526-534 */
  protected _link(glslProgram: HdStGLSLProgram): boolean {
    if (!TF_VERIFY(glslProgram)) return false
    return glslProgram.link()
  }
}

/** drawBatch.h:46-259. A drawing batch: draw items sharing a program. */
export abstract class HdSt_DrawBatch {
  protected _drawItemInstances: HdStDrawItemInstance[] = []
  protected readonly _allowTextureResourceRebinding: boolean

  private _program: HdSt_DrawBatchDrawingProgram
  private _shaderHash: bigint = 0n

  /** drawBatch.cpp:98-104. Subclasses call _Init(drawItemInstance) from
   *  their constructors, as upstream's do. */
  constructor(_drawItemInstance: HdStDrawItemInstance, allowTextureResourceRebinding = false) {
    this._allowTextureResourceRebinding = allowTextureResourceRebinding
    this._program = this._createDrawingProgram()
  }

  /** The _DrawingProgram member's type: upstream's subclasses own their own
   *  _DrawingProgram subclasses; HdSt_DrawBatch's holds the base one. */
  protected _createDrawingProgram(): HdSt_DrawBatchDrawingProgram {
    return new HdSt_DrawBatchDrawingProgram()
  }

  /** drawBatch.cpp:106-117 */
  protected _init(drawItemInstance: HdStDrawItemInstance): void {
    this._drawItemInstances.push(drawItemInstance)

    // Force shader to refresh.
    // XXX: Why is this necessary? If the draw item state changes in a
    // significant way such that the shader needs to be recompiled, that value
    // should be part of the shader hash and this shouldn't be required.
    this._shaderHash = 0n
  }

  /** drawBatch.cpp:149-173 */
  append(drawItemInstance: HdStDrawItemInstance): boolean {
    if (!TF_VERIFY(this._drawItemInstances.length > 0)) {
      return false
    }

    // XXX: we'll soon refactor this function out and centralize batch
    // bucketing and reordering logic in HdStCommandBuffer.

    const drawItem = drawItemInstance.getDrawItem()
    const batchItem = this._drawItemInstances[0]!.getDrawItem()
    TF_VERIFY(batchItem)

    if (this._isAggregated(drawItem, batchItem)) {
      drawItemInstance.setBatchIndex(this._drawItemInstances.length)
      drawItemInstance.setBatch(this)
      this._drawItemInstances.push(drawItemInstance)
      return true
    } else {
      return false
    }
  }

  /** drawBatch.cpp:263-299 */
  rebuild(): boolean {
    const instances = this._drawItemInstances
    this._drawItemInstances = []

    // Ensure all batch state initialized from items/instances is refreshed.
    const batchItem = instances[0]!
    if (!TF_VERIFY(batchItem.getDrawItem().getGeometricShader())) {
      return false
    }
    this._init(batchItem)
    if (!TF_VERIFY(this._drawItemInstances.length > 0)) {
      return false
    }

    // Start this loop at i=1 because the 0th element was pushed via _Init
    for (let i = 1; i < instances.length; ++i) {
      const item = instances[i]!
      if (!TF_VERIFY(item.getDrawItem().getGeometricShader())) {
        return false
      }
      if (!this.append(item)) {
        TfDebug.msg(HdStDebugCodes.HDST_DRAW_BATCH, '   Rebuild failed for batch\n')
        return false
      }
    }

    TfDebug.msg(HdStDebugCodes.HDST_DRAW_BATCH, '   Rebuild success for batch\n')
    return true
  }

  /** drawBatch.h:73 */
  abstract validate(deepValidation: boolean): HdSt_DrawBatchValidationResult

  /** drawBatch.h:77-80 */
  abstract prepareDraw(
    gfxCmds: HgiGraphicsCmds | null,
    renderPassState: HdStRenderPassState,
    resourceRegistry: HdStResourceRegistry): void

  /** drawBatch.h:84-87 */
  abstract encodeDraw(
    renderPassState: HdStRenderPassState,
    resourceRegistry: HdStResourceRegistry,
    firstDrawBatch: boolean): void

  /** drawBatch.h:90-94 */
  abstract executeDraw(
    gfxCmds: HgiGraphicsCmds,
    renderPassState: HdStRenderPassState,
    resourceRegistry: HdStResourceRegistry,
    firstDrawBatch: boolean): void

  /** drawBatch.h:96-99 */
  getDrawItemInstances(): readonly HdStDrawItemInstance[] {
    return this._drawItemInstances
  }

  /** drawBatch.cpp:123-126 */
  drawItemInstanceChanged(_instance: HdStDrawItemInstance): void {}

  /** drawBatch.cpp:128-131 */
  setEnableTinyPrimCulling(_tinyPrimCulling: boolean): void {}

  /** drawBatch.cpp:119-121 (~HdSt_DrawBatch). JavaScript has no destructors;
   *  the command buffer calls this when it drops a batch so subclasses can
   *  release their resources as their destructors do. */
  destroy(): void {}

  /** drawBatch.cpp:337-416 */
  protected _getDrawingProgram(
    state: HdStRenderPassState,
    resourceRegistry: HdStResourceRegistry,
  ): HdSt_DrawBatchDrawingProgram {
    const firstDrawItem = this._drawItemInstances[0]!.getDrawItem()

    // Calculate unique hash to detect if the shader (composed) has changed
    // recently and we need to recompile it.
    let shaderHash = TfHashCombine(state.getShaderHash(),
      firstDrawItem.getGeometricShader()!.computeHash())

    const materialNetworkShader = firstDrawItem.getMaterialNetworkShader()

    const materialNetworkShaderHash =
      materialNetworkShader ? materialNetworkShader.computeHash() : 0
    shaderHash = TfHashCombine(shaderHash, materialNetworkShaderHash)

    const shaderChanged = this._shaderHash !== shaderHash

    // Set shaders (lighting and renderpass) to the program.
    // We need to do this before checking if the shaderChanged because
    // it is possible that the shader does not need to
    // be recompiled but some of the parameters have changed.
    const shaders = state.getShaders()
    this._program.setShaders(shaders)
    this._program.setGeometricShader(firstDrawItem.getGeometricShader())

    // XXX: if this function appears to be expensive, we might consider caching
    //      programs by shaderHash.
    if (!this._program.getGLSLProgram() || shaderChanged) {
      this._program.setMaterialNetworkShader(materialNetworkShader)

      const logCacheLookup = this._logShaderCacheLookup()

      // Try to compile the shader and if it fails to compile we go back
      // to use the specified fallback material network shader.
      if (!this._program.compileShader(firstDrawItem, resourceRegistry, logCacheLookup)) {
        // While the code should gracefully handle shader compilation
        // failures, it is also undesirable for shaders to silently fail.
        TF_WARN(`Failed to compile shader for prim ${firstDrawItem.getRprimID()}.`)

        // If we failed to compile the material network, replace it
        // either with the invalid material network shader OR the
        // fallback material network shader and try again.
        const shader = _ProvideVisualFeedbackForBrokenShaders()
          ? _GetInvalidMaterialNetworkShader()
          : _GetFallbackMaterialNetworkShader()

        this._program.setMaterialNetworkShader(shader)

        const res = this._program.compileShader(firstDrawItem, resourceRegistry, logCacheLookup)

        // We expect the invalid/fallback shader to always compile.
        TF_VERIFY(res, 'Failed to compile with the invalid/fallback ' +
          'material network shader.')
      }

      this._shaderHash = shaderHash
    }

    return this._program
  }

  /** PLATFORM-DIVERGENCE(hdst-compile-ahead): compiles this batch's drawing
   *  program for `state` now, as its next draw would (_getDrawingProgram,
   *  drawBatch.cpp:337-416), so that a batch whose items are all culled
   *  does not compile it on the frame they first come into view. Returns
   *  whether a program was compiled or looked up. HdStCommandBuffer
   *  compileDrawingProgramsAhead has the reason. */
  compileDrawingProgramAhead(state: HdStRenderPassState, resourceRegistry: HdStResourceRegistry, _firstDrawBatch = false): boolean {
    if (this._drawItemInstances.length === 0) return false
    const hash = this._shaderHash
    const program = this._program.getGLSLProgram()
    this._getDrawingProgram(state, resourceRegistry)
    return this._shaderHash !== hash || this._program.getGLSLProgram() !== program
  }

  /** drawBatch.cpp:219-261 */
  protected _isAggregated(drawItem0: HdStDrawItem, drawItem1: HdStDrawItem): boolean {
    if (!HdSt_DrawBatch._canAggregateMaterials(drawItem0, drawItem1)) {
      return false
    }

    if (!this._canAggregateTextures(drawItem0, drawItem1)) {
      return false
    }

    if (drawItem0.getGeometricShader() === drawItem1.getGeometricShader() &&
      drawItem0.getInstancePrimvarNumLevels() === drawItem1.getInstancePrimvarNumLevels() &&
      isAggregated(drawItem0.getTopologyRange(), drawItem1.getTopologyRange()) &&
      isAggregated(drawItem0.getTopologyVisibilityRange(), drawItem1.getTopologyVisibilityRange()) &&
      isAggregated(drawItem0.getVertexPrimvarRange(), drawItem1.getVertexPrimvarRange()) &&
      isAggregated(drawItem0.getVaryingPrimvarRange(), drawItem1.getVaryingPrimvarRange()) &&
      isAggregated(drawItem0.getElementPrimvarRange(), drawItem1.getElementPrimvarRange()) &&
      isAggregated(drawItem0.getFaceVaryingPrimvarRange(), drawItem1.getFaceVaryingPrimvarRange()) &&
      isAggregated(drawItem0.getConstantPrimvarRange(), drawItem1.getConstantPrimvarRange()) &&
      isAggregated(drawItem0.getInstanceIndexRange(), drawItem1.getInstanceIndexRange())) {
      const numLevels = drawItem0.getInstancePrimvarNumLevels()
      for (let i = 0; i < numLevels; ++i) {
        if (!isAggregated(drawItem0.getInstancePrimvarRange(i), drawItem1.getInstancePrimvarRange(i))) {
          return false
        }
      }
      return true
    }

    return false
  }

  /** drawBatch.cpp:90-96 */
  protected _logShaderCacheLookup(): boolean {
    return (TfDebug.isEnabled(HdStDebugCodes.HDST_LOG_DRAWING_SHADER_PROGRAM_MISSES) ||
      TfDebug.isEnabled(HdStDebugCodes.HDST_LOG_DRAWING_SHADER_PROGRAM_HITS)) &&
      _LogShaderCacheLookupForDrawBatch(this._drawItemInstances)
  }

  /** drawBatch.cpp:175-208 */
  private static _canAggregateMaterials(drawItem0: HdStDrawItem, drawItem1: HdStDrawItem): boolean {
    if (drawItem0.getMaterialIsFinal() !== drawItem1.getMaterialIsFinal()) {
      return false
    }

    const shaderA = drawItem0.getMaterialNetworkShader()
    const shaderB = drawItem1.getMaterialNetworkShader()

    // Can aggregate if the shaders are identical.
    if (shaderA === shaderB) {
      return true
    }

    const dataA = shaderA!.getShaderData()
    const dataB = shaderB!.getShaderData()

    const dataIsAggregated = (dataA === dataB) ||
      (dataA !== null && dataB !== null && dataA.isAggregatedWith(dataB))

    // We can't aggregate if the shaders have data buffers that aren't
    // aggregated or if the shaders don't match.
    if (!dataIsAggregated || shaderA!.computeHash() !== shaderB!.computeHash()) {
      return false
    }

    return true
  }

  /** drawBatch.cpp:210-217 */
  private _canAggregateTextures(drawItem0: HdStDrawItem, drawItem1: HdStDrawItem): boolean {
    return this._allowTextureResourceRebinding ||
      (drawItem0.getMaterialNetworkShader()!.computeTextureSourceHash() ===
        drawItem1.getMaterialNetworkShader()!.computeTextureSourceHash())
  }
}
