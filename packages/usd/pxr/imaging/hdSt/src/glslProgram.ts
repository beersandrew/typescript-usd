// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/glslProgram.cpp,
//  pxr/imaging/hdSt/glslProgram.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/glslProgram.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences (each also noted at its site):
// - std::cout output (the HDST_DUMP_* dumps) goes through TfDebug.Msg under
//   the enabling debug code, i.e. to TfDebug's output. The dump text itself
//   is byte-identical; HdStGLSLProgram_DumpShaderSourceText returns it.
// - HDST_DUMP_SHADER_SOURCEFILE / HDST_DUMP_FAILING_SHADER_SOURCEFILE: see
//   FAITHFULNESS-DEBT(hdst-dump-sourcefile) at _ValidateCompilation.
// - TF_DESCRIBE_SCOPE (glslProgram.cpp:299,338,404) is omitted: it only
//   labels crash reports.
// - The GetComputeProgram overloads (glslProgram.h:58-90) are one static
//   method dispatching on its arguments.
// - ID is a bigint; _ComputeHash's ArchHash (glslProgram.cpp:268-279) is a
//   registry cache key only, so TfHash of the same inputs is used.

import { Token as TfToken, Hash as TfHash, Debug as TfDebug } from 'typescript-usd/tf'
import { Tokens as HdTokens } from 'typescript-usd/hd'
import {
  HgiShaderFunctionDesc,
  HgiHandle,
  HgiShaderProgramDesc,
  HgiShaderStageBits,
  type HgiShaderProgram,
  type HgiShaderProgramHandle,
  type HgiShaderCodeOut,
  type HgiShaderFunctionHandle,
  type HgiShaderStage,
} from 'typescript-usd/hgi'
import { HioGlslfx, HioGlslfxTokens } from 'typescript-usd/hio'
import { HdStDebugCodes } from './debugCodes.ts'
import { HdStPackageComputeShader } from './package.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/** glslProgram.cpp:25-50. Get the line number from the compilation error
 *  message, and return a boolean indicating success/failure of parsing.
 *  Note: This has been tested only on nVidia. */
function _ParseLineNumberOfError(error: string, lineNum: { value: number }): boolean {
  // sample error on nVidia:
  // 0(279) : error C1031: swizzle mask element not present in operand "xyz"
  // 279 is the line number here.
  const start = error.indexOf('(')
  const end = error.indexOf(')')
  if (start !== -1 && end !== -1) {
    // error.substr(start+1, end-1), parsed with strtoul.
    const lineNumStr = error.substr(start + 1, end - 1)
    const m = /^\s*\+?(\d+)/.exec(lineNumStr)
    const num = m ? Number(m[1]) : 0
    lineNum.value = num >>> 0
    if (num === 0 || num > 0xffffffff) {
      // Out of range, or no valid conversion could be performed.
      return false
    }
    return true
  } else {
    // Error message isn't formatted as expected.
    return false
  }
}

/** glslProgram.cpp:52-62. Return the substring for the inclusive range
 *  given the start and end indices. */
function _GetSubstring(str: string, startPos: number, endPos: number): string {
  if (endPos === -1) {
    return str.substring(startPos)
  }
  return str.substr(startPos, endPos - startPos + 1)
}

/** glslProgram.cpp:64-102. It's helpful to have a few more lines around the
 *  erroring line when logging compiler error messages. */
function _GetCompileErrorCodeContext(shader: string, lineNum: number,
  contextSize: number): string {
  // unsigned arithmetic: lineNum - contextSize - 1 wraps upstream.
  const numLinesToSkip = Math.max(0, (lineNum - contextSize - 1) >>> 0)
  let i = 0
  for (let line = 0; line < numLinesToSkip && i !== -1; line++) {
    i = shader.indexOf('\n', i + 1) // find the next occurrance
  }

  if (i === -1) return ''

  // Copy context before the error line.
  let start = i
  for (let line = 0; line < contextSize && i !== -1; line++) {
    i = shader.indexOf('\n', i + 1)
  }

  let context = _GetSubstring(shader, start, i)

  // Copy error line with annotation.
  start = i + 1
  i = shader.indexOf('\n', start)
  context += _GetSubstring(shader, start, i - 1) + ' <<< ERROR!\n'

  // Copy context after error line.
  start = i + 1
  for (let line = 0; line < contextSize && i !== -1; line++) {
    i = shader.indexOf('\n', i + 1)
  }
  context += _GetSubstring(shader, start, i)

  return context
}

/** glslProgram.cpp:104-127 */
function _GetShaderType(stage: HgiShaderStage): string | null {
  switch (stage) {
    case HgiShaderStageBits.HgiShaderStageCompute:
      return 'COMPUTE_SHADER'
    case HgiShaderStageBits.HgiShaderStageVertex:
      return 'VERTEX_SHADER'
    case HgiShaderStageBits.HgiShaderStageFragment:
      return 'FRAGMENT_SHADER'
    case HgiShaderStageBits.HgiShaderStageGeometry:
      return 'GEOMETRY_SHADER'
    case HgiShaderStageBits.HgiShaderStageTessellationControl:
      return 'TESS_CONTROL_SHADER'
    case HgiShaderStageBits.HgiShaderStageTessellationEval:
      return 'TESS_EVALUATION_SHADER'
    case HgiShaderStageBits.HgiShaderStagePostTessellationControl:
      return 'POST_TESS_CONTROL_SHADER'
    case HgiShaderStageBits.HgiShaderStagePostTessellationVertex:
      return 'POST_TESS_VERTEX_SHADER'
    default:
      return null
  }
}

/** The text the first _DumpShaderSource overload (glslProgram.cpp:129-137)
 *  writes to std::cout. */
function _DumpShaderSourceText(shaderType: string, shaderSource: string): string {
  return '--------- ' + shaderType + ' ----------\n' +
    shaderSource +
    '---------------------------\n'
}

/** glslProgram.cpp:129-137 */
function _DumpShaderSource(debugCode: string, shaderType: string, shaderSource: string): void {
  TfDebug.msg(debugCode, _DumpShaderSourceText(shaderType, shaderSource))
}

/** The text the second _DumpShaderSource overload (glslProgram.cpp:139-160)
 *  writes to std::cout for one HgiShaderFunctionDesc: the code generator's
 *  output as the HDST_DUMP_SHADER_SOURCE debug code prints it. */
export function HdStGLSLProgram_DumpShaderSourceText(desc: HgiShaderFunctionDesc): string {
  const shaderType = _GetShaderType(desc.shaderStage)

  let out = '--------- ' + String(shaderType) + ' ----------\n'

  if (desc.shaderCodeDeclarations !== null) {
    out += desc.shaderCodeDeclarations
  } else {
    out += '(shaderCodeDeclarations empty)\n'
  }

  if (TF_VERIFY(desc.shaderCode !== null)) {
    out += desc.shaderCode
  } else {
    out += '(shaderCode empty)\n'
  }

  out += '---------------------------\n'
  return out
}

/** glslProgram.cpp:162-217 */
function _ValidateCompilation(
  shaderFn: HgiShaderFunctionHandle,
  shaderType: string,
  shaderSource: string,
  debugID: number,
): boolean {
  let fname = ''
  const fn = shaderFn.Get()
  const valid = fn !== null && fn.isValid()
  if (TfDebug.isEnabled(HdStDebugCodes.HDST_DUMP_SHADER_SOURCEFILE) ||
    (TfDebug.isEnabled(HdStDebugCodes.HDST_DUMP_FAILING_SHADER_SOURCEFILE) &&
      !valid)) {
    fname = 'program' + debugID + '_shader' + _debugShaderID++ +
      '_' + shaderType + '.glsl'
    // FAITHFULNESS-DEBT(hdst-dump-sourcefile): upstream writes shaderSource
    // to the file `fname` in the working directory (glslProgram.cpp:173-178);
    // the library has no file output. Only the "Write ..." line is printed.
    // Replace with a file write once the library has an output-file seam.
    const code = TfDebug.isEnabled(HdStDebugCodes.HDST_DUMP_SHADER_SOURCEFILE)
      ? HdStDebugCodes.HDST_DUMP_SHADER_SOURCEFILE
      : HdStDebugCodes.HDST_DUMP_FAILING_SHADER_SOURCEFILE
    TfDebug.msg(code, 'Write ' + fname +
      ' (size=' + _Utf8Size(shaderSource) + ')\n')
  }

  if (!valid) {
    let logString = fn ? fn.getCompileErrors() : ''
    const lineNum = { value: 0 }
    if (_ParseLineNumberOfError(logString, lineNum)) {
      // Get lines surrounding the erroring line for context.
      const errorContext =
        _GetCompileErrorCodeContext(shaderSource, lineNum.value, 3)
      if (errorContext.length !== 0) {
        // erase the \0 if present.
        if (logString.endsWith('\0')) {
          logString = logString.slice(0, -1)
        }
        logString += '\nError Context:\n'
        logString += errorContext
      }
    }

    const programName = fname.length === 0 ? shaderType : fname
    TF_WARN(`Failed to compile shader (${programName}): ${logString}`)

    if (TfDebug.isEnabled(HdStDebugCodes.HDST_DUMP_FAILING_SHADER_SOURCE)) {
      _DumpShaderSource(HdStDebugCodes.HDST_DUMP_FAILING_SHADER_SOURCE,
        shaderType, shaderSource)
    }

    return false
  }
  return true
}
// glslProgram.cpp:170 (function-local static).
let _debugShaderID = 0

/** std::string::size() of a UTF-8 string. */
function _Utf8Size(s: string): number {
  return new TextEncoder().encode(s).length
}

/** glslProgram.cpp:219-227 */
function _GetScopeDescriptionLabel(desc: HgiShaderProgramDesc): string {
  if (desc.debugName.length === 0) {
    return ''
  } else {
    return ` (${desc.debugName})`
  }
}

/** glslProgram.cpp:258-279 */
function _ComputeHash(sourceFile: TfToken, defines = ''): bigint {
  return TfHash([sourceFile, defines])
}

/** glslProgram.cpp:395-417 */
function _DebugLinkSource(program: HgiShaderProgramHandle): string {
  let result = `==== Source Program ID=${program.getId()}\nBEGIN_DUMP\n`

  for (const fn of program.Get()!.getShaderFunctions()) {
    const desc = fn.Get()!.getDescriptor()
    result += '--------'
    result += String(_GetShaderType(desc.shaderStage))
    result += '--------\n'
    if (TF_VERIFY(desc.shaderCode !== null)) {
      result += desc.shaderCode
    } else {
      result += '(shaderCode empty)\n'
    }
  }

  result += 'END DUMP\n'

  return result
}

// glslProgram.cpp:237 (function-local static).
let _globalDebugID = 0

/** HdStGLSLProgram::PopulateDescriptorCallback (glslProgram.h:70-71) */
export type HdStGLSLProgramPopulateDescriptorCallback =
  (computeDesc: HgiShaderFunctionDesc) => void

/** HdInstance<HdStGLSLProgramSharedPtr> (hd/instanceRegistry.h) */
interface _ProgramInstance {
  isFirstInstance(): boolean
  setValue(value: HdStGLSLProgram): void
  GetValue(): HdStGLSLProgram | null
}

/** glslProgram.h:30-113. An instance of a GLSL program. */
export class HdStGLSLProgram {
  private readonly _registry: HdStResourceRegistry
  private _role: TfToken
  private _programDesc = new HgiShaderProgramDesc()
  private _program: HgiShaderProgramHandle = new HgiHandle<HgiShaderProgram>()

  // An identifier for uniquely identifying the program, for debugging
  // purposes - programs that fail to compile for one reason or another
  // will get deleted, and their GL program IDs reused, so we can't use
  // that to identify it uniquely
  private _debugID: number

  /** glslProgram.cpp:229-238 */
  constructor(role: TfToken, registry: HdStResourceRegistry) {
    this._registry = registry
    this._role = role
    this._debugID = _globalDebugID++
  }

  /** ~HdStGLSLProgram (glslProgram.cpp:240-253). Call to release the Hgi
   *  objects; JS has no destructors. */
  destroy(): void {
    const hgi = this._registry.getHgi()

    for (const fn of this._programDesc.shaderFunctions) {
      hgi.destroyShaderFunction(fn)
    }

    if (this._program.isSet()) {
      hgi.destroyShaderProgram(this._program)
    }
  }

  /**
   * Both CompileShader overloads:
   * - (stage, source): compile shader source for a shader stage
   *   (glslProgram.cpp:281-332);
   * - (desc): compile shader source for a shader stage from an
   *   HgiShaderFunctionDesc (glslProgram.cpp:334-393).
   */
  compileShader(stageOrDesc: HgiShaderStage | HgiShaderFunctionDesc,
    shaderSource = ''): boolean {
    if (typeof stageOrDesc === 'number') {
      return this._compileShaderSource(stageOrDesc, shaderSource)
    }
    return this._compileShaderDesc(stageOrDesc)
  }

  /** glslProgram.cpp:281-332 */
  private _compileShaderSource(stage: HgiShaderStage, shaderSource: string): boolean {
    // early out for empty source.
    // this may not be an error, since glslfx gives empty string
    // for undefined shader stages (i.e. null geometry shader)
    if (shaderSource.length === 0) {
      return false
    }

    const shaderType = _GetShaderType(stage)
    if (!shaderType) {
      TF_CODING_ERROR(`Invalid shader type ${stage}\n`)
      return false
    }

    if (TfDebug.isEnabled(HdStDebugCodes.HDST_DUMP_SHADER_SOURCE)) {
      _DumpShaderSource(HdStDebugCodes.HDST_DUMP_SHADER_SOURCE,
        shaderType, shaderSource)
    }

    const hgi = this._registry.getHgi()

    // Create a shader, compile it
    const shaderFnDesc = new HgiShaderFunctionDesc()
    shaderFnDesc.shaderCode = shaderSource
    shaderFnDesc.shaderStage = stage

    const generatedCode: HgiShaderCodeOut = { value: '' }
    shaderFnDesc.generatedShaderCodeOut = generatedCode

    const shaderFn = hgi.CreateShaderFunction(shaderFnDesc)

    if (!_ValidateCompilation(shaderFn, shaderType, generatedCode.value,
      this._debugID)) {
      // shader is no longer needed.
      hgi.destroyShaderFunction(shaderFn)

      return false
    }

    // Store the shader function in the program descriptor so it can be used
    // during Link time.
    this._programDesc.shaderFunctions.push(shaderFn)

    return true
  }

  /** glslProgram.cpp:334-393 */
  private _compileShaderDesc(desc: HgiShaderFunctionDesc): boolean {
    // early out for empty source.
    // this may not be an error, since glslfx gives empty string
    // for undefined shader stages (i.e. null geometry shader)
    if (desc.shaderCode === null) return false

    const shaderType = _GetShaderType(desc.shaderStage)
    if (!shaderType) {
      TF_CODING_ERROR(`Invalid shader type ${desc.shaderStage}\n`)
      return false
    }

    if (TfDebug.isEnabled(HdStDebugCodes.HDST_DUMP_SHADER_SOURCE)) {
      TfDebug.msg(HdStDebugCodes.HDST_DUMP_SHADER_SOURCE,
        HdStGLSLProgram_DumpShaderSourceText(desc))
    }

    // Create a shader, compile it
    const hgi = this._registry.getHgi()

    // Optionally, capture generated shader code for diagnostic output.
    // (Dereferenced unconditionally upstream; null here reads as empty.)
    const generatedCode = desc.generatedShaderCodeOut

    const shaderFn = hgi.CreateShaderFunction(desc)

    if (!_ValidateCompilation(shaderFn, shaderType,
      generatedCode ? generatedCode.value : '', this._debugID)) {
      // shader is no longer needed.
      hgi.destroyShaderFunction(shaderFn)

      return false
    }

    // Store the shader function in the program descriptor so it can be used
    // during Link time.
    this._programDesc.shaderFunctions.push(shaderFn)

    return true
  }

  /** glslProgram.cpp:419-450. Link the compiled shaders together. */
  link(): boolean {
    if (this._programDesc.shaderFunctions.length === 0) {
      TF_CODING_ERROR('At least one shader has to be compiled before linking.')
      return false
    }

    void _GetScopeDescriptionLabel(this._programDesc)

    const hgi = this._registry.getHgi()

    // Create the shader program.
    if (this._program.isSet()) {
      hgi.destroyShaderProgram(this._program)
    }
    this._program = hgi.createShaderProgram(this._programDesc)

    const success = this._program.Get()!.isValid()
    if (!success) {
      const logString = this._program.Get()!.getCompileErrors()
      TF_WARN(`Failed to link shader: ${logString}`)

      if (TfDebug.isEnabled(HdStDebugCodes.HDST_DUMP_FAILING_SHADER_SOURCE)) {
        TfDebug.msg(HdStDebugCodes.HDST_DUMP_FAILING_SHADER_SOURCE,
          _DebugLinkSource(this._program))
      }
    }

    return success
  }

  /** glslProgram.cpp:452-460. Validate if this program is a valid progam in
   *  the current context. */
  validate(): boolean {
    const program = this._program.Get()
    if (!program || !program.isValid()) {
      return false
    }

    return true
  }

  /** glslProgram.h:52. Returns HgiShaderProgramHandle for the shader
   *  program. */
  getProgram(): HgiShaderProgramHandle {
    return this._program
  }

  /** glslProgram.h:93. Returns the role of the GPU data in this resource. */
  getRole(): TfToken {
    return this._role
  }

  /**
   * Convenience method to get a shared compute shader program. The
   * overloads (glslProgram.h:55-90):
   * - (shaderToken, resourceRegistry) (glslProgram.cpp:462-469);
   * - (shaderFileName, shaderToken, resourceRegistry)
   *   (glslProgram.cpp:471-521);
   * - (shaderToken, resourceRegistry, populateDescriptor)
   *   (glslProgram.cpp:523-534);
   * - (shaderToken, defines, resourceRegistry, populateDescriptor)
   *   (glslProgram.cpp:536-549);
   * - (shaderFileName, shaderToken, defines, resourceRegistry,
   *   populateDescriptor) (glslProgram.cpp:551-617).
   */
  static getComputeProgram(
    shaderToken: TfToken, resourceRegistry: HdStResourceRegistry): HdStGLSLProgram | null
  static getComputeProgram(
    shaderFileName: TfToken, shaderToken: TfToken,
    resourceRegistry: HdStResourceRegistry): HdStGLSLProgram | null
  static getComputeProgram(
    shaderToken: TfToken, resourceRegistry: HdStResourceRegistry,
    populateDescriptor: HdStGLSLProgramPopulateDescriptorCallback): HdStGLSLProgram | null
  static getComputeProgram(
    shaderToken: TfToken, defines: string, resourceRegistry: HdStResourceRegistry,
    populateDescriptor: HdStGLSLProgramPopulateDescriptorCallback): HdStGLSLProgram | null
  static getComputeProgram(
    shaderFileName: TfToken, shaderToken: TfToken, defines: string,
    resourceRegistry: HdStResourceRegistry,
    populateDescriptor: HdStGLSLProgramPopulateDescriptorCallback): HdStGLSLProgram | null
  static getComputeProgram(...args: unknown[]): HdStGLSLProgram | null {
    switch (args.length) {
      case 2:
        return HdStGLSLProgram._getComputeProgramFile(HdStPackageComputeShader(),
          args[0] as TfToken, args[1] as HdStResourceRegistry)
      case 3:
        if (typeof args[2] === 'function') {
          return HdStGLSLProgram._getComputeProgramDesc(HdStPackageComputeShader(),
            args[0] as TfToken, '', args[1] as HdStResourceRegistry,
            args[2] as HdStGLSLProgramPopulateDescriptorCallback)
        }
        return HdStGLSLProgram._getComputeProgramFile(args[0] as TfToken,
          args[1] as TfToken, args[2] as HdStResourceRegistry)
      case 4:
        return HdStGLSLProgram._getComputeProgramDesc(HdStPackageComputeShader(),
          args[0] as TfToken, args[1] as string, args[2] as HdStResourceRegistry,
          args[3] as HdStGLSLProgramPopulateDescriptorCallback)
      default:
        return HdStGLSLProgram._getComputeProgramDesc(args[0] as TfToken,
          args[1] as TfToken, args[2] as string, args[3] as HdStResourceRegistry,
          args[4] as HdStGLSLProgramPopulateDescriptorCallback)
    }
  }

  /** glslProgram.cpp:471-521 */
  private static _getComputeProgramFile(
    shaderFileName: TfToken,
    shaderToken: TfToken,
    resourceRegistry: HdStResourceRegistry,
  ): HdStGLSLProgram | null {
    const hash = _ComputeHash(shaderToken)

    // Find the program from registry
    const programInstance: _ProgramInstance =
      resourceRegistry.registerGLSLProgram(hash)

    if (programInstance.isFirstInstance()) {
      TfDebug.msg(HdStDebugCodes.HDST_LOG_COMPUTE_SHADER_PROGRAM_MISSES,
        `(MISS) First compute program instance for ${shaderFileName} (hash = ${hash})\n`)

      // if not exists, create new one
      const newProgram = new HdStGLSLProgram(
        HdTokens.computeShader, resourceRegistry)

      const glslfx = new HioGlslfx(shaderFileName)
      const errorString = { value: '' }
      if (!glslfx.isValid(errorString)) {
        TF_CODING_ERROR('Failed to parse ' + shaderFileName +
          ': ' + errorString.value)
        return null
      }
      if (!newProgram.compileShader(
        HgiShaderStageBits.HgiShaderStageCompute, glslfx.getSource(shaderToken))) {
        TF_CODING_ERROR('Fail to compile ' + shaderToken)
        return null
      }
      if (!newProgram.link()) {
        TF_CODING_ERROR('Fail to link ' + shaderToken)
        return null
      }
      programInstance.setValue(newProgram)
    } else {
      TfDebug.msg(HdStDebugCodes.HDST_LOG_COMPUTE_SHADER_PROGRAM_HITS,
        `(HIT) Found compute program instance for ${shaderFileName} (hash = ${hash})\n`)
    }
    return programInstance.GetValue()
  }

  /** glslProgram.cpp:551-617 */
  private static _getComputeProgramDesc(
    shaderFileName: TfToken,
    shaderToken: TfToken,
    defines: string,
    resourceRegistry: HdStResourceRegistry,
    populateDescriptor: HdStGLSLProgramPopulateDescriptorCallback,
  ): HdStGLSLProgram | null {
    const hash = _ComputeHash(shaderToken, defines)
    // Find the program from registry
    const programInstance: _ProgramInstance =
      resourceRegistry.registerGLSLProgram(hash)

    if (programInstance.isFirstInstance()) {
      TfDebug.msg(HdStDebugCodes.HDST_LOG_COMPUTE_SHADER_PROGRAM_MISSES,
        `(MISS) First compute program instance for ${shaderFileName} (hash = ${hash})\n`)

      // If program does not exist, create new one
      const glslfx = new HioGlslfx(shaderFileName, HioGlslfxTokens.defVal)
      const errorString = { value: '' }
      if (!glslfx.isValid(errorString)) {
        TF_CODING_ERROR('Failed to parse ' + shaderFileName +
          ': ' + errorString.value)
        return null
      }

      const hgi = resourceRegistry.getHgi()

      const computeDesc = new HgiShaderFunctionDesc()
      populateDescriptor(computeDesc)

      const sourceCode = defines + glslfx.getSource(shaderToken)
      computeDesc.shaderCode = sourceCode

      const generatedCode: HgiShaderCodeOut = { value: '' }
      computeDesc.generatedShaderCodeOut = generatedCode

      const computeFn = hgi.CreateShaderFunction(computeDesc)

      const shaderType = 'GL_COMPUTE_SHADER'

      if (!_ValidateCompilation(computeFn, shaderType, generatedCode.value, 0)) {
        // shader is no longer needed.
        hgi.destroyShaderFunction(computeFn)
        return null
      }

      const newProgram = new HdStGLSLProgram(
        HdTokens.computeShader, resourceRegistry)

      newProgram._programDesc.shaderFunctions.push(computeFn)
      if (!newProgram.link()) {
        TF_CODING_ERROR('Fail to link ' + shaderToken)
        return null
      }
      programInstance.setValue(newProgram)
    } else {
      TfDebug.msg(HdStDebugCodes.HDST_LOG_COMPUTE_SHADER_PROGRAM_HITS,
        `(HIT) Found compute program instance for ${shaderFileName} (hash = ${hash})\n`)
    }
    return programInstance.GetValue()
  }
}
export type HdStGLSLProgramSharedPtr = HdStGLSLProgram
