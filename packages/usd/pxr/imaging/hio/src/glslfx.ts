// Ported from OpenUSD 26.11.1: pxr/imaging/hio/glslfx.cpp,
//  pxr/imaging/hio/glslfx.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hio/glslfx.{h,cpp} (OpenUSD 26.11.1).
//
// Deliberate divergences:
// - Files and assets. Upstream checks and reads a glslfx file with
//   TfPathExists / TfIsFile + std::ifstream when it is a file, else through
//   ArGetResolver().OpenAsset, and resolves non-$TOOLS paths with
//   ArGetResolver().CreateIdentifier + Resolve (glslfx.cpp:119-170,232-250).
//   Here the files are those of Ar's filesystem seam, which includes the
//   plugin resource files of plugins registered with their resources
//   attached (ar/src/platformFilesystem.ts; e.g. Storm's shaders,
//   hdSt/src/shaderResources.ts), read synchronously as upstream reads
//   files. Every other asset (a glslfx file a scene ships, served over HTTP)
//   can only be read asynchronously in a browser, while this constructor is
//   synchronous: HioGlslfx_PrefetchAsync (glslfxPrefetch.ts) reads such a
//   file and the files it imports through Ar ahead of time, registered as
//   Ar's asset prefetcher for .glslfx assets (ar/src/prefetchedAssets.ts) so
//   that a UsdStage reads ahead the glslfx files its asset-valued attributes
//   name; Resolve and OpenAsset here are then Ar's synchronous reads of what
//   was read ahead (_ArResolveSync, _ArOpenAssetSync). A file nothing read
//   ahead is missing, with upstream's diagnostics for a missing file.
// - ShaderResourceRegistry (glslfx.cpp:64-117) is built from the plugins
//   registered when it is first used, as upstream's TfStaticData is; because
//   plugins here register incrementally as their modules load, it also adds
//   plugins registered afterwards (PlugRegistry DidRegisterPlugins).
// - The std::istream constructor takes an HioGlslfxInputStream (the text of a
//   std::istringstream). C++ out-params (std::string *reason) are
//   `{ value: string }` boxes.
// - GetHash() is TfHash's size_t as an unsigned 64-bit bigint.

import {
  Debug as TfDebug,
  HashCombine as TfHashCombine,
  MakeTokens as TfMakeTokens,
  Token as TfToken,
  TfDiagnosticMgr,
  TfDiagnosticType,
  Error as TfError,
  TfStringCatPaths,
  TfStringJoin,
  TfStringStartsWith,
  TfStringToDouble,
  TfStringTokenize,
  TfStringTrim,
  TfStringTrimRight,
} from 'typescript-usd/tf'
import { GetResolver as ArGetResolver, ResolvedPath as ArResolvedPath } from 'typescript-usd/ar'
import {
  _ArOpenAssetSync,
  _ArResolveSync,
  _pathExists,
  _readFileSync,
} from 'typescript-usd/ar/_internal'
import { Registry as PlugRegistry, type Plugin as PlugPlugin } from 'typescript-usd/plug'
import { Dictionary as VtDictionary } from 'typescript-usd/vt'
import { HioDebugCodes } from './debugCodes.ts'
import { Hio_GetDictionaryFromInput } from './dictionary.ts'
import {
  HioGlslfxConfig,
  type HioGlslfxConfigAttributes,
  type HioGlslfxConfigMetadataDictionary,
  type HioGlslfxConfigParameters,
  type HioGlslfxConfigTextures,
} from './glslfxConfig.ts'

// Registers the read ahead of glslfx assets (see the header).
export { HioGlslfx_PrefetchAsync } from './glslfxPrefetch.ts'

/** HIO_GLSLFX_API_VERSION (glslfx.h:29). */
export const HIO_GLSLFX_API_VERSION = 1

/** HIO_GLSLFX_TOKENS (glslfx.h:31-50), TF_DEFINE_PUBLIC_TOKENS
 *  (glslfx.cpp:36). */
export const HioGlslfxTokens = TfMakeTokens({
  glslfx: 'glslfx',

  fragmentShader: 'fragmentShader',
  geometryShader: 'geometryShader',
  geometryShaderInjection: 'geometryShaderInjection',
  preamble: 'preamble',
  tessControlShader: 'tessControlShader',
  tessEvalShader: 'tessEvalShader',
  postTessControlShader: 'postTessControlShader',
  postTessVertexShader: 'postTessVertexShader',
  vertexShader: 'vertexShader',
  vertexShaderInjection: 'vertexShaderInjection',

  surfaceShader: 'surfaceShader',
  displacementShader: 'displacementShader',
  volumeShader: 'volumeShader',
  defVal: 'default',
})

// glslfx.cpp:47-58
const _tokens = TfMakeTokens({
  sectionDelimiter: '--',
  commentDelimiter: '---',
  version: 'version',
  configuration: 'configuration',
  glsl: 'glsl',
  layout: 'layout',
  import: '#import',
  shaderResources: 'ShaderResources',
  toolSubst: '$TOOLS',
})

/** The text a std::istream reads (the HioGlslfx(std::istream&) constructor). */
export class HioGlslfxInputStream {
  constructor(readonly text: string) {}
}

// TF_RUNTIME_ERROR / TF_WARN / TF_AXIOM (tf/diagnostic.h).
function TF_RUNTIME_ERROR(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.RuntimeError))
}
function TF_WARN(message: string): void {
  TfDiagnosticMgr.GetInstance().postWarning(message)
}
function TF_AXIOM(cond: boolean, expr: string): void {
  if (!cond) throw new Error(`Failed axiom: ' ${expr} '`)
}

/** TfGetBaseName (tf/pathUtils.cpp): the component after the last '/'. */
function TfGetBaseName(fileName: string): string {
  const i = fileName.lastIndexOf('/')
  return i < 0 ? fileName : fileName.slice(i + 1)
}

/** std::printf("%2.2f") */
function _Fixed2(value: number): string {
  return value.toFixed(2)
}

// ---------------------------------------------------------------------------
// Files and assets (see the header).
// ---------------------------------------------------------------------------

/** TfPathExists (tf/fileUtils.cpp) over Ar's filesystem seam (see the
 *  header). */
function _PathExists(path: string): boolean {
  return path.length !== 0 && _pathExists(path)
}

// This is a private registry of paths to shader resources installed
// within package bundles. Packages which install glslfx shader source
// files must register the resource subdir where these files will be
// installed within the package bundle using the "ShaderResources"
// metadata key.
// glslfx.cpp:64-113
class ShaderResourceRegistry {
  readonly #resourceMap = new Map<string, string>()

  constructor() {
    const plugReg = PlugRegistry.GetInstance()
    for (const plugin of plugReg.getAllPlugins()) this.#addPlugin(plugin)
    plugReg.addDidRegisterPluginsListener((plugins) => {
      for (const plugin of plugins) this.#addPlugin(plugin)
    })
  }

  #addPlugin(plugin: PlugPlugin): void {
    const packageName = plugin.getName()
    const metadata = plugin.getMetadata()
    const value = metadata[_tokens.shaderResources]
    if (typeof value === 'string') {
      const shaderPath = TfStringCatPaths(plugin.GetResourcePath(), value)
      this.#resourceMap.set(packageName, shaderPath)
    }
  }

  getShaderResourcePath(packageName: string, shaderAssetPath: string): string {
    const resourcePath = this.#resourceMap.get(packageName)
    if (resourcePath === undefined) return ''
    return TfStringCatPaths(resourcePath, shaderAssetPath)
  }
}

// glslfx.cpp:115 TfStaticData<const ShaderResourceRegistry>
let _shaderResourceRegistryInstance: ShaderResourceRegistry | undefined
function _shaderResourceRegistry(): ShaderResourceRegistry {
  return (_shaderResourceRegistryInstance ??= new ShaderResourceRegistry())
}

// glslfx.cpp:119-149
function _ResolveResourcePath(importFile: string, errorStr: { value: string } | null): string {
  const pathTokens = TfStringTokenize(importFile, '/')
  if (pathTokens.length < 3) {
    if (errorStr) {
      errorStr.value = `Expected line of the form ${_tokens.toolSubst}/<packageName>/path`
    }
    return ''
  }

  const packageName = pathTokens[1]!

  const assetPath = TfStringJoin(pathTokens.slice(3), '/')

  const resourcePath = _shaderResourceRegistry().getShaderResourcePath(packageName, assetPath)
  if (resourcePath.length === 0 && errorStr) {
    errorStr.value = `Can't find resource dir to resolve tools path substitution on ${packageName}`
  }

  return _PathExists(resourcePath) ? resourcePath : ''
}

// glslfx.cpp:151-170
function _ComputeResolvedPath(
  containingFile: string,
  filename: string,
  errorStr: { value: string } | null,
): string {
  // Resolve $TOOLS-prefixed paths.
  if (TfStringStartsWith(filename, `${_tokens.toolSubst}/`)) {
    return _ResolveResourcePath(filename, errorStr)
  }

  const resolver = ArGetResolver()

  // Create an identifier for the specified .glslfx file by combining
  // the containing file and the new file to accommodate relative paths,
  // then resolve it.
  const assetPath =
    resolver.createIdentifier(filename, new ArResolvedPath(containingFile))
  return assetPath.length === 0 ? '' : _ArResolveSync(assetPath).toString()
}

/** std::getline over the whole input: lines split at '\n', with no final
 *  empty line after a trailing newline. */
function _GetLines(text: string): string[] {
  if (text.length === 0) return []
  const lines = text.split('\n')
  if (text.endsWith('\n')) lines.pop()
  return lines
}

// glslfx.cpp:232-250
function _CreateStreamForFile(filePath: string): HioGlslfxInputStream | null {
  const file = _readFileSync(filePath)
  if (file) {
    return new HioGlslfxInputStream(new TextDecoder().decode(file))
  }

  const asset = _ArOpenAssetSync(new ArResolvedPath(filePath))
  if (asset) {
    const buffer = asset.getBuffer()
    if (buffer) {
      return new HioGlslfxInputStream(new TextDecoder().decode(buffer))
    }
  }

  return null
}

/** HioGlslfx::_ParseContext (glslfx.h:211-225). */
class _ParseContext {
  filename: string
  lineNo = 0
  version = -1.0
  currentLine = ''
  currentSectionType = ''
  currentSectionId = ''
  imports: string[] = []

  constructor(filePath = '') {
    this.filename = filePath
  }
}

/**
 * HioGlslfx (glslfx.h:52-279): a class representing the config and shader
 * source of a glslfx file.
 */
export class HioGlslfx {
  #globalContext: _ParseContext
  // std::map<std::string, std::string>
  readonly #sourceMap = new Map<string, string>()
  readonly #layoutMap = new Map<string, string>()
  readonly #configMap = new Map<string, string>()
  readonly #configOrder: string[] = []
  readonly #seenFiles = new Set<string>()
  #config: HioGlslfxConfig | null = null
  readonly #technique: TfToken
  #valid: boolean
  #invalidReason = ''
  #hash = 0n

  /**
   * HioGlslfx() creates an invalid glslfx object (glslfx.cpp:172-176);
   * HioGlslfx(filePath, technique) a glslfx object from a file
   * (glslfx.cpp:178-206); HioGlslfx(stream, technique) a glslfx object from a
   * stream (glslfx.cpp:208-221).
   */
  constructor(
    input?: string | HioGlslfxInputStream,
    technique: TfToken = HioGlslfxTokens.defVal,
  ) {
    if (input === undefined) {
      this.#globalContext = new _ParseContext()
      this.#technique = TfToken()
      this.#valid = false
      return
    }

    if (input instanceof HioGlslfxInputStream) {
      this.#globalContext = new _ParseContext('istream')
      this.#technique = technique
      this.#valid = true

      TfDebug.msg(HioDebugCodes.HIO_DEBUG_GLSLFX, 'Creating GLSLFX data from istream\n')

      this.#valid = this._processInput(input, this.#globalContext)

      if (this.#valid) {
        this.#valid = this._composeConfiguration(this.#reasonBox())
      }
      return
    }

    const filePath = input
    this.#globalContext = new _ParseContext()
    this.#technique = technique
    this.#valid = true

    const errorStr = { value: '' }
    const resolvedPath = _ComputeResolvedPath('', filePath, errorStr)
    if (resolvedPath.length === 0) {
      if (errorStr.value.length !== 0) {
        TF_RUNTIME_ERROR(errorStr.value)
      } else {
        TF_WARN(`File doesn't exist: "${filePath}"\n`)
      }
      this.#valid = false
      return
    }

    this.#globalContext = new _ParseContext(resolvedPath)

    TfDebug.msg(HioDebugCodes.HIO_DEBUG_GLSLFX, `Creating GLSLFX data from ${filePath}\n`)

    this.#valid = this._processFile(this.#globalContext.filename, this.#globalContext)

    if (this.#valid) {
      this.#valid = this._composeConfiguration(this.#reasonBox())
    }
  }

  #reasonBox(): { value: string } {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    return {
      get value() { return self.#invalidReason },
      set value(v: string) { self.#invalidReason = v },
    }
  }

  /** Return the parameters specified in the configuration
   *  (glslfx.cpp:604-612). */
  getParameters(): HioGlslfxConfigParameters {
    return this.#config ? this.#config.getParameters() : []
  }

  /** Return the textures specified in the configuration
   *  (glslfx.cpp:614-622). */
  getTextures(): HioGlslfxConfigTextures {
    return this.#config ? this.#config.getTextures() : []
  }

  /** Return the attributes specified in the configuration
   *  (glslfx.cpp:624-632). */
  getAttributes(): HioGlslfxConfigAttributes {
    return this.#config ? this.#config.getAttributes() : []
  }

  /** Return the metadata specified in the configuration
   *  (glslfx.cpp:634-642). */
  getMetadata(): HioGlslfxConfigMetadataDictionary {
    return this.#config ? this.#config.getMetadata() : new VtDictionary()
  }

  /** Returns true if this is a valid glslfx file (glslfx.cpp:223-230). */
  isValid(reason: { value: string } | null = null): boolean {
    if (reason && !this.#valid) reason.value = this.#invalidReason
    return this.#valid
  }

  /** Get the surface source string (glslfx.cpp:726-730). */
  getSurfaceSource(): string {
    return this._getSource(HioGlslfxTokens.surfaceShader)
  }

  /** Get the displacement source string (glslfx.cpp:732-736). */
  getDisplacementSource(): string {
    return this._getSource(HioGlslfxTokens.displacementShader)
  }

  /** Get the volume source string (glslfx.cpp:738-742). */
  getVolumeSource(): string {
    return this._getSource(HioGlslfxTokens.volumeShader)
  }

  /**
   * Get the layout config as a VtDictionary parsed from the JSON layout
   * config corresponding to the shader source associated with the given
   * keys (glslfx.cpp:689-695).
   */
  getLayoutAsDictionary(shaderStageKeys: readonly TfToken[], errorStr: { value: string } | null): VtDictionary {
    return Hio_GetDictionaryFromInput(
      this._getLayoutAsString(shaderStageKeys), 'no filename', errorStr)
  }

  /** Get the shader source associated with given key (glslfx.cpp:744-748). */
  getSource(shaderStageKey: TfToken): string {
    return this._getSource(shaderStageKey)
  }

  /** Get the original file name passed to the constructor (glslfx.h:186). */
  getFilePath(): string {
    return this.#globalContext.filename
  }

  /**
   * Return set of all files processed for this glslfx object, including the
   * original file given to the constructor and any imported files
   * (glslfx.h:188-192). Sorted, as the std::set upstream returns.
   */
  getFiles(): ReadonlySet<string> {
    return new Set([...this.#seenFiles].sort())
  }

  /** Return the computed hash value based on the string (glslfx.h:195). */
  getHash(): bigint {
    return this.#hash
  }

  /**
   * Extract imported files from the specified glslfx file. The returned
   * paths are as-authored, in the order of declaration, with possible
   * duplicates. Not recursive (glslfx.cpp:273-292).
   */
  static extractImports(filename: string): string[] {
    const input = _CreateStreamForFile(filename)
    if (!input) return []

    const imports: string[] = []
    for (const line of _GetLines(input.text)) {
      if (line.indexOf(_tokens.import) === 0) {
        imports.push(TfStringTrim(line.slice(_tokens.import.length)))
      }
    }
    return imports
  }

  // glslfx.cpp:252-271
  private _processFile(filePath: string, context: _ParseContext): boolean {
    if (this.#seenFiles.has(filePath)) {
      // for now, just ignore files that have already been included
      TfDebug.msg(HioDebugCodes.HIO_DEBUG_GLSLFX, `Multiple import of ${filePath}\n`)
      return true
    }

    this.#seenFiles.add(filePath)

    const str = _CreateStreamForFile(filePath)
    if (!str) {
      TF_RUNTIME_ERROR(`Could not open ${filePath}`)
      return false
    }

    return this._processInput(str, context)
  }

  // glslfx.cpp:294-370
  private _processInput(input: HioGlslfxInputStream, context: _ParseContext): boolean {
    for (const rawLine of _GetLines(input.text)) {
      // trim to avoid issues with cross-platform line endings
      context.currentLine = TfStringTrimRight(rawLine)

      // increment the line number
      ++context.lineNo

      // update hash
      this.#hash = TfHashCombine(this.#hash, context.currentLine)

      if (context.lineNo > 1 && context.version < 0) {
        TF_RUNTIME_ERROR(`Syntax Error on line 1 of ${context.filename}. First line in file must be version info.`)
        return false
      }

      // simply ignore comments
      if (context.currentLine.indexOf(_tokens.commentDelimiter) === 0) {
        continue
      } else if (context.currentLine.indexOf(_tokens.sectionDelimiter) === 0) {
        // we found a section delimiter
        if (!this._parseSectionLine(context)) return false

        TfDebug.msg(HioDebugCodes.HIO_DEBUG_GLSLFX,
          `  ${TfGetBaseName(context.filename)} : ${context.lineNo} : ${context.currentLine}\n`)
      } else if (context.currentSectionType === HioGlslfxTokens.glslfx &&
          context.currentLine.indexOf(_tokens.import) === 0) {
        if (!this._processImport(context)) return false
      } else if (context.currentSectionType === _tokens.glsl) {
        // don't do any parsing of these lines. this will be compiled
        // and linked with the glsl compiler later.
        this.#append(this.#sourceMap, context.currentSectionId, context.currentLine + '\n')
      } else if (context.currentSectionType === _tokens.layout) {
        this.#append(this.#layoutMap, context.currentSectionId, context.currentLine + '\n')
      } else if (context.currentSectionType === _tokens.configuration) {
        // this is added to the config dictionary which we will compose
        // later
        this.#append(this.#configMap, context.filename, context.currentLine + '\n')
      }
    }

    // If we never found the glslfx version this isn't a valid glslfx.
    if (context.version < 0) return false

    for (const importFile of context.imports) {
      TfDebug.msg(HioDebugCodes.HIO_DEBUG_GLSLFX, ` Importing File : ${importFile}\n`)

      const localContext = new _ParseContext(importFile)
      if (!this._processFile(importFile, localContext)) return false
    }

    return true
  }

  /** std::map<std::string, std::string>::operator[](key).append(text) */
  #append(map: Map<string, string>, key: string, text: string): void {
    map.set(key, (map.get(key) ?? '') + text)
  }

  // glslfx.cpp:372-403
  private _processImport(context: _ParseContext): boolean {
    const tokens = TfStringTokenize(context.currentLine)

    if (tokens.length !== 2) {
      TF_RUNTIME_ERROR(`Syntax Error on line ${context.lineNo} of ${context.filename}. ` +
        '#import declaration must be followed by a valid file path.')
      return false
    }

    const errorStr = { value: '' }
    const importFile = _ComputeResolvedPath(context.filename, tokens[1]!, errorStr)

    if (importFile.length === 0) {
      if (errorStr.value.length !== 0) {
        TF_RUNTIME_ERROR(`Syntax Error on line ${context.lineNo} of ${context.filename}. ${errorStr.value}`)
        return false
      }

      TF_WARN(`File doesn't exist: "${tokens[1]}"\n`)
      return false
    }

    // stash away imports for later. top down is weakest to strongest
    // and we want the
    context.imports.push(importFile)
    return true
  }

  // glslfx.cpp:405-437
  private _parseSectionLine(context: _ParseContext): boolean {
    const tokens = TfStringTokenize(context.currentLine)
    if (tokens.length === 1) {
      TF_RUNTIME_ERROR(`Syntax Error on line ${context.lineNo} of ${context.filename}. ` +
        'Section delimiter must be followed by a valid token.')
      return false
    }

    // As upstream, a delimiter line of only "--" followed by whitespace
    // tokenizes to one token; tokens[1] of a shorter vector is undefined
    // behaviour upstream and the empty section type here.
    context.currentSectionType = tokens[1] ?? ''
    context.currentSectionId = ''

    if (context.currentSectionType === HioGlslfxTokens.glslfx) {
      return this._parseVersionLine(tokens, context)
    }
    if (context.currentSectionType === _tokens.configuration) {
      return this._parseConfigurationLine(context)
    } else if (context.currentSectionType === _tokens.glsl) {
      return this._parseGLSLSectionLine(tokens, context)
    } else if (context.currentSectionType === _tokens.layout) {
      return this._parseLayoutSectionLine(tokens, context)
    }

    TF_RUNTIME_ERROR(`Syntax Error on line ${context.lineNo} of ${context.filename}. ` +
      `Unknown section tag "${context.currentSectionType}"`)
    return false
  }

  // glslfx.cpp:439-477
  private _parseGLSLSectionLine(tokens: readonly string[], context: _ParseContext): boolean {
    if (tokens.length < 3) {
      TF_RUNTIME_ERROR(`Syntax Error on line ${context.lineNo} of ${context.filename}. "glsl" tag must` +
        'be followed by a valid identifier.')
      return false
    }

    context.currentSectionId = tokens[2]!

    // if we already have a section id that is registered in our source map,
    // bail
    if (this.#sourceMap.has(context.currentSectionId)) {
      TF_RUNTIME_ERROR(`Syntax Error on line ${context.lineNo} of ${context.filename}. ` +
        `Source for "${context.currentSectionId}" has already been defined`)
      return false
    }

    // Emit a comment for more helpful compile / link diagnostics.
    // note: #line with source file name is not allowed in GLSL.
    //
    // Use the file's basename rather than full path to avoid
    // burning unnecessary extra context into the generated code
    // that could weaken GL driver shader caching, such as build
    // artifact serial numbers.
    //
    this.#append(this.#sourceMap, context.currentSectionId,
      `// line ${context.lineNo} "${TfGetBaseName(context.filename)}"\n`)

    return true
  }

  // glslfx.cpp:479-506
  private _parseLayoutSectionLine(tokens: readonly string[], context: _ParseContext): boolean {
    if (tokens.length < 3) {
      TF_RUNTIME_ERROR(`Syntax Error on line ${context.lineNo} of ${context.filename}. "layout" tag ` +
        'must be followed by a valid identifier.')
      return false
    }

    context.currentSectionId = tokens[2]!

    // if we already have a section id that is registered in our layout map,
    // bail
    if (this.#layoutMap.has(context.currentSectionId)) {
      TF_RUNTIME_ERROR(`Syntax Error on line ${context.lineNo} of ${context.filename}. ` +
        `Layout for "${context.currentSectionId}" has already been defined`)
      return false
    }

    return true
  }

  // glslfx.cpp:508-539
  private _parseVersionLine(tokens: readonly string[], context: _ParseContext): boolean {
    if (context.lineNo !== 1) {
      TF_RUNTIME_ERROR(`Syntax Error on line ${context.lineNo} of ${context.filename}. ` +
        'Version specifier must be on the first line.')
      return false
    }

    // verify that the version spec is what we expect
    if (tokens.length !== 4 || tokens[2] !== _tokens.version) {
      TF_RUNTIME_ERROR(`Syntax Error on line ${context.lineNo} of ${context.filename}. Invalid ` +
        'version specifier.')
      return false
    }

    context.version = _StringToDouble(tokens[3]!)

    // verify this with the global version. for now, mismatch is an error
    if (context.version !== this.#globalContext.version) {
      TF_RUNTIME_ERROR(`Version mismatch. ${this.#globalContext.filename} specifies ` +
        `${_Fixed2(this.#globalContext.version)}, but ${context.filename} ` +
        `specifies ${_Fixed2(context.version)}`)
      return false
    }

    return true
  }

  // glslfx.cpp:541-557
  private _parseConfigurationLine(context: _ParseContext): boolean {
    if (this.#configMap.has(context.filename)) {
      TF_RUNTIME_ERROR(`Syntax Error on line ${context.lineNo} of ${context.filename}. ` +
        'configuration for this file has already been defined')
      return false
    }

    // insert things in the vector in the order of weakest to strongest
    // strongest. this should be the same as our encounter order
    this.#configOrder.unshift(context.filename)
    this.#configMap.set(context.filename, '')

    return true
  }

  // glslfx.cpp:561-602
  private _composeConfiguration(reason: { value: string }): boolean {
    // XXX for now, the strongest value just wins. there is no partial
    // composition. (glslfx.cpp:564-581)
    for (const item of this.#configOrder) {
      TF_AXIOM(this.#configMap.has(item), '_configMap.find(item) != _configMap.end()')
      TfDebug.msg(HioDebugCodes.HIO_DEBUG_GLSLFX, `    Parsing config for ${TfGetBaseName(item)}\n`)

      const errorStr = { value: '' }
      this.#config = HioGlslfxConfig.Read(
        this.#technique, this.#configMap.get(item)!, item, errorStr)

      if (errorStr.value.length !== 0) {
        reason.value = `Error parsing configuration section of ${item}: ${errorStr.value}.`
        return false
      }
    }

    return true
  }

  // glslfx.cpp:644-671
  private _getLayout(shaderStageKey: TfToken): string {
    if (!this.#config) return ''

    const configKeys = this.#config.getSourceKeys(shaderStageKey)

    let ret = ''

    for (const key of configKeys) {
      // now look up the keys and concatenate them together..
      const layout = this.#layoutMap.get(key)

      if (layout === undefined) {
        // do nothing if there is no layout section with a matching key
        continue
      }

      if (ret.length !== 0) ret += ',\n'
      ret += layout + '\n'
    }

    return ret
  }

  // glslfx.cpp:673-687
  private _getLayoutAsString(shaderStageKeys: readonly TfToken[]): string {
    let ret = ''
    for (const shaderStageKey of shaderStageKeys) {
      if (ret.length !== 0) ret += ', '
      ret += `"${shaderStageKey}" : [ ${this._getLayout(shaderStageKey)} ]`
    }
    ret = `{ ${ret} }`

    return ret
  }

  // glslfx.cpp:697-724
  private _getSource(shaderStageKey: TfToken): string {
    if (!this.#config) return ''

    const sourceKeys = this.#config.getSourceKeys(shaderStageKey)

    let ret = ''

    for (const key of sourceKeys) {
      // now look up the keys and concatenate them together..
      const source = this.#sourceMap.get(key)

      if (source === undefined) {
        TF_RUNTIME_ERROR(`Can't find shader source for <${shaderStageKey}> with the key <${key}>`)
        return ''
      }

      ret += source + '\n'
    }

    return ret
  }
}

/** TfStringToDouble (tf/stringUtils.cpp:70-82): junk converts to 0. */
function _StringToDouble(text: string): number {
  try {
    return TfStringToDouble(text)
  } catch {
    return 0
  }
}


