// Ported from OpenUSD 26.11.1: pxr/imaging/hio/glslfxResourceLayout.cpp,
//  pxr/imaging/hio/glslfxResourceLayout.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hio/glslfxResourceLayout.{h,cpp} (OpenUSD 26.11.1).
//
// Deliberate divergences:
// - ParseLayout's `ElementVector *result` out-param is the array it appends
//   to.
// - Element's ShaderStage default UINT32_MAX is 0xffffffff.

import {
  MakeTokens as TfMakeTokens,
  Token as TfToken,
  TfDiagnosticMgr,
  TfDiagnosticType,
  Error as TfError,
} from 'typescript-usd/tf'
import { Dictionary as VtDictionary, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Hio_VtValueVectorType } from './dictionary.ts'
import { HioFormat } from './types.ts'

/** HIO_GLSLFX_RESOURCE_LAYOUT_TOKENS (glslfxResourceLayout.h:20-38),
 *  TF_DEFINE_PUBLIC_TOKENS (glslfxResourceLayout.cpp:19-20). */
export const HioGlslfxResourceLayoutTokens = TfMakeTokens({
  unknown: 'unknown',
  block: 'block',
  inValue: 'in',
  outValue: 'out',
  inBlock: 'in block',
  outBlock: 'out block',
  inValueArray: 'in array',
  outValueArray: 'out array',
  inBlockArray: 'in block array',
  outBlockArray: 'out block array',
  uniformBlock: 'uniform block',
  bufferReadOnly: 'buffer readOnly',
  bufferReadWrite: 'buffer readWrite',
  centroid: 'centroid',
  sample: 'sample',
  smooth: 'smooth',
  flat: 'flat',
  noperspective: 'noperspective',
})

/** HioGlslfxResourceLayout::InOut (glslfxResourceLayout.h:76-80). */
export enum HioGlslfxResourceLayoutInOut {
  NONE,
  STAGE_IN,
  STAGE_OUT,
}

/** HioGlslfxResourceLayout::Kind (glslfxResourceLayout.h:82-92). */
export enum HioGlslfxResourceLayoutKind {
  NONE,
  VALUE,
  BLOCK,
  QUALIFIER,
  UNIFORM_VALUE,
  UNIFORM_BLOCK,
  UNIFORM_BLOCK_CONSTANT_PARAMS,
  BUFFER_READ_ONLY,
  BUFFER_READ_WRITE,
}

/** HioGlslfxResourceLayout::ShaderStage (glslfxResourceLayout.h:94). */
export type HioGlslfxResourceLayoutShaderStage = number

/** HioGlslfxResourceLayout::Member (glslfxResourceLayout.h:98-114). As
 *  upstream, the constructor does not store `qualifiers`. */
export class HioGlslfxResourceLayoutMember {
  dataType: TfToken
  name: TfToken
  arraySize: TfToken
  qualifiers: TfToken
  constructor(
    dataType: TfToken,
    name: TfToken,
    arraySize: TfToken = TfToken(),
    _qualifiers: TfToken = TfToken(),
  ) {
    this.dataType = dataType
    this.name = name
    this.arraySize = arraySize
    this.qualifiers = TfToken()
  }
}
export type HioGlslfxResourceLayoutMemberVector = HioGlslfxResourceLayoutMember[]

/** HioGlslfxResourceLayout::Element (glslfxResourceLayout.h:117-147). */
export class HioGlslfxResourceLayoutElement {
  inOut: HioGlslfxResourceLayoutInOut
  kind: HioGlslfxResourceLayoutKind
  location: number
  dataType: TfToken
  name: TfToken
  qualifiers: TfToken
  arraySize: TfToken
  aggregateName: TfToken
  members: HioGlslfxResourceLayoutMemberVector
  stageVisibility: HioGlslfxResourceLayoutShaderStage
  constructor(
    inOut: HioGlslfxResourceLayoutInOut = HioGlslfxResourceLayoutInOut.NONE,
    kind: HioGlslfxResourceLayoutKind = HioGlslfxResourceLayoutKind.NONE,
    dataType: TfToken = HioGlslfxResourceLayoutTokens.unknown,
    name: TfToken = HioGlslfxResourceLayoutTokens.unknown,
    arraySize: TfToken = TfToken(),
    qualifiers: TfToken = TfToken(),
    stageVisibility: HioGlslfxResourceLayoutShaderStage = 0xffffffff,
  ) {
    this.inOut = inOut
    this.kind = kind
    this.location = -1
    this.dataType = dataType
    this.name = name
    this.qualifiers = qualifiers
    this.arraySize = arraySize
    this.aggregateName = TfToken()
    this.members = []
    this.stageVisibility = stageVisibility
  }
}
export type HioGlslfxResourceLayoutElementVector = HioGlslfxResourceLayoutElement[]

/** HioGlslfxResourceLayout::TextureType (glslfxResourceLayout.h:150-155). */
export enum HioGlslfxResourceLayoutTextureType {
  TEXTURE,                // a texture
  SHADOW_TEXTURE,         // a texture used as a shadow
  ARRAY_TEXTURE,          // e.g. texture1DArray, texture2DArray, etc.
  CUBEMAP_TEXTURE,        // a cubemap texture
}

/** HioGlslfxResourceLayout::TextureElement (glslfxResourceLayout.h:157-178). */
export class HioGlslfxResourceLayoutTextureElement {
  name: TfToken
  dim: number
  bindingIndex: number
  format: HioFormat
  textureType: HioGlslfxResourceLayoutTextureType
  arraySize: number
  constructor(
    name: TfToken,
    dim: number,
    bindingIndex: number,
    format: HioFormat = HioFormat.HioFormatFloat32Vec4,
    textureType: HioGlslfxResourceLayoutTextureType = HioGlslfxResourceLayoutTextureType.TEXTURE,
    arraySize = 0,
  ) {
    this.name = name
    this.dim = dim
    this.bindingIndex = bindingIndex
    this.format = format
    this.textureType = textureType
    this.arraySize = arraySize
  }
}
export type HioGlslfxResourceLayoutTextureElementVector = HioGlslfxResourceLayoutTextureElement[]

// ---------------------------------------------------------------------------
// glslfxResourceLayout.cpp:25-294 (anonymous namespace)
// ---------------------------------------------------------------------------

const InOut = HioGlslfxResourceLayoutInOut
const Kind = HioGlslfxResourceLayoutKind
const Element = HioGlslfxResourceLayoutElement
const Member = HioGlslfxResourceLayoutMember
type Element = HioGlslfxResourceLayoutElement
type InputValue = VtValue
type InputValueVector = VtValue[]

// glslfxResourceLayout.cpp:37-42: VtValue::GetWithDefault<std::string> gives
// the default unless the value holds a std::string.
function _Token(input: InputValue | undefined): TfToken {
  return TfToken(input !== undefined && input.IsHolding(VtValueTypes.string)
    ? input.UncheckedGet<string>()
    : HioGlslfxResourceLayoutTokens.unknown)
}

// glslfxResourceLayout.cpp:44-48
function _GetInputValueVector(input: InputValue | undefined): InputValueVector {
  return input !== undefined && input.IsHolding(Hio_VtValueVectorType)
    ? input.UncheckedGet<InputValueVector>() : []
}

// Check fpr specific storage and interpolation qualifiers.
// glslfxResourceLayout.cpp:50-59
function _IsMemberQualifier(input: TfToken): boolean {
  return input === HioGlslfxResourceLayoutTokens.centroid ||
    input === HioGlslfxResourceLayoutTokens.sample ||
    input === HioGlslfxResourceLayoutTokens.flat ||
    input === HioGlslfxResourceLayoutTokens.noperspective ||
    input === HioGlslfxResourceLayoutTokens.smooth
}

// e.g. ["vec4", "Peye"]
// e.g. ["float", "length", "3"] The member is a float array with 3 elements.
// e.g. ["vec3", "color", "flat"] The member type is vec3, and there is no
// interpolation across the face.
// e.g. ["float", "length", "3", "flat"] The member is a float array with 3
// elements, and there is no interpolation across the face.
// glslfxResourceLayout.cpp:61-94. As upstream, `fromElement` is unused: every
// entry is visited, and the leading string entries are skipped because they
// are not lists of 2 to 4 values.
function _ParseMembers(input: InputValueVector, _fromElement: number): HioGlslfxResourceLayoutMemberVector {
  const result: HioGlslfxResourceLayoutMemberVector = []
  for (const inputValue of input) {
    const memberInput = _GetInputValueVector(inputValue)
    const n = memberInput.length
    if (!(2 <= n && n <= 4)) continue
    const member = new Member(/*dataType=*/_Token(memberInput[0]), /*name=*/_Token(memberInput[1]))
    result.push(member)
    if (n === 3) {
      const inputToken = _Token(memberInput[2])
      // Try to parse qualifier.
      if (_IsMemberQualifier(inputToken)) {
        member.qualifiers = inputToken
      // If fails, parse as array size.
      } else {
        member.arraySize = inputToken
      }
    } else if (n === 4) {
      member.arraySize = _Token(memberInput[2])
      member.qualifiers = _Token(memberInput[3])
    }
  }
  return result
}

/** Copy `from` into `*element` (the C++ assignment `*element = Element(...)`). */
function _Assign(element: Element, from: Element): void {
  Object.assign(element, from)
}

// e.g. ["in", "vec3", "color"]
// e.g. ["in", "int", "pointId", "flat"]
// glslfxResourceLayout.cpp:96-120
function _ParseValue(input: InputValueVector, element: Element): boolean {
  if (input.length !== 3 && input.length !== 4) return false
  if (_Token(input[0]) === HioGlslfxResourceLayoutTokens.inValue) {
    _Assign(element, new Element(InOut.STAGE_IN, Kind.VALUE,
      /*dataType=*/_Token(input[1]), /*name=*/_Token(input[2])))
    if (input.length === 4) element.qualifiers = _Token(input[3])
    return true
  } else if (_Token(input[0]) === HioGlslfxResourceLayoutTokens.outValue) {
    _Assign(element, new Element(InOut.STAGE_OUT, Kind.VALUE,
      /*dataType=*/_Token(input[1]), /*name=*/_Token(input[2])))
    if (input.length === 4) element.qualifiers = _Token(input[3])
    return true
  }
  return false
}

// e.g. ["in array", "vec3", "color", "NUM_VERTS"]
// glslfxResourceLayout.cpp:122-142
function _ParseValueArray(input: InputValueVector, element: Element): boolean {
  if (input.length !== 4) return false
  if (_Token(input[0]) === HioGlslfxResourceLayoutTokens.inValueArray) {
    _Assign(element, new Element(InOut.STAGE_IN, Kind.VALUE,
      /*dataType=*/_Token(input[1]), /*name=*/_Token(input[2]),
      /*arraySize=*/_Token(input[3])))
    return true
  } else if (_Token(input[0]) === HioGlslfxResourceLayoutTokens.outValueArray) {
    _Assign(element, new Element(InOut.STAGE_OUT, Kind.VALUE,
      /*dataType=*/_Token(input[1]), /*name=*/_Token(input[2]),
      /*arraySize=*/_Token(input[3])))
    return true
  }
  return false
}

// e.g. ["in block", "VertexData", "inData",
//          ["vec3", "Peye"],
//          ["vec3", "Neye"]
//      ]
// glslfxResourceLayout.cpp:144-168
function _ParseBlock(input: InputValueVector, element: Element): boolean {
  if (input.length < 4) return false
  if (_Token(input[0]) === HioGlslfxResourceLayoutTokens.inBlock) {
    _Assign(element, new Element(InOut.STAGE_IN, Kind.BLOCK,
      /*dataType=*/HioGlslfxResourceLayoutTokens.block, /*name=*/_Token(input[2])))
    element.aggregateName = _Token(input[1])
    element.members = _ParseMembers(input, /*fromElement=*/3)
    return true
  } else if (_Token(input[0]) === HioGlslfxResourceLayoutTokens.outBlock) {
    _Assign(element, new Element(InOut.STAGE_OUT, Kind.BLOCK,
      /*dataType=*/HioGlslfxResourceLayoutTokens.block, /*name=*/_Token(input[2])))
    element.aggregateName = _Token(input[1])
    element.members = _ParseMembers(input, /*fromElement=*/3)
    return true
  }
  return false
}

// e.g. ["in block array", "VertexData", "inData", "NUM_VERTS",
//          ["vec3", "Peye"],
//          ["vec3", "Neye"]
//      ]
// glslfxResourceLayout.cpp:170-197
function _ParseBlockArray(input: InputValueVector, element: Element): boolean {
  if (input.length < 5) return false
  if (_Token(input[0]) === HioGlslfxResourceLayoutTokens.inBlockArray) {
    _Assign(element, new Element(InOut.STAGE_IN, Kind.BLOCK,
      /*dataType=*/HioGlslfxResourceLayoutTokens.block, /*name=*/_Token(input[2]),
      /*arraySize=*/_Token(input[3])))
    element.aggregateName = _Token(input[1])
    element.members = _ParseMembers(input, /*fromElement=*/4)
    return true
  } else if (_Token(input[0]) === HioGlslfxResourceLayoutTokens.outBlockArray) {
    _Assign(element, new Element(InOut.STAGE_OUT, Kind.BLOCK,
      /*dataType=*/HioGlslfxResourceLayoutTokens.block, /*name=*/_Token(input[2]),
      /*arraySize=*/_Token(input[3])))
    element.aggregateName = _Token(input[1])
    element.members = _ParseMembers(input, /*fromElement=*/4)
    return true
  }
  return false
}

// e.g. ["in", "early_fragment_tests"]
// glslfxResourceLayout.cpp:199-215. As upstream, any two-entry declaration is
// accepted (the final `return true`), leaving a default Element when the
// first entry is neither "in" nor "out".
function _ParseQualifier(input: InputValueVector, element: Element): boolean {
  if (input.length !== 2) return false
  if (_Token(input[0]) === HioGlslfxResourceLayoutTokens.inValue) {
    _Assign(element, new Element(InOut.STAGE_IN, Kind.QUALIFIER))
    element.qualifiers = _Token(input[1])
    return true
  } else if (_Token(input[0]) === HioGlslfxResourceLayoutTokens.outValue) {
    _Assign(element, new Element(InOut.STAGE_OUT, Kind.QUALIFIER))
    element.qualifiers = _Token(input[1])
    return true
  }

  return true
}

// e.g. ["uniform block", "Uniforms", "cullParams",
//          ["mat4", "cullMatrix"],
//          ["vec2", "drawRangeNDC"],
//          ["uint", "drawCommandNumUints"],
//          ["int",  "resetPass"]
//      ]
// glslfxResourceLayout.cpp:217-237
function _ParseUniformBlock(input: InputValueVector, element: Element): boolean {
  if (input.length < 4) return false
  if (_Token(input[0]) === HioGlslfxResourceLayoutTokens.uniformBlock) {
    _Assign(element, new Element(InOut.NONE, Kind.UNIFORM_BLOCK_CONSTANT_PARAMS,
      /*dataType=*/HioGlslfxResourceLayoutTokens.uniformBlock, /*name=*/_Token(input[2])))
    element.aggregateName = _Token(input[1])
    element.members = _ParseMembers(input, /*fromElement=*/3)
    return true
  }
  return false
}

// e.g. ["buffer readWrite", "DispatchBuffer", "dispatchBuffer",
//          ["uint", "drawCommands", "[]"]
//      ]
// glslfxResourceLayout.cpp:239-265
function _ParseBuffer(input: InputValueVector, element: Element): boolean {
  if (input.length < 4) return false
  if (_Token(input[0]) === HioGlslfxResourceLayoutTokens.bufferReadOnly) {
    _Assign(element, new Element(InOut.NONE, Kind.BUFFER_READ_ONLY,
      /*dataType=*/HioGlslfxResourceLayoutTokens.bufferReadOnly, /*name=*/_Token(input[2])))
    element.aggregateName = _Token(input[1])
    element.members = _ParseMembers(input, /*fromElement=*/3)
    return true
  } else if (_Token(input[0]) === HioGlslfxResourceLayoutTokens.bufferReadWrite) {
    _Assign(element, new Element(InOut.NONE, Kind.BUFFER_READ_WRITE,
      /*dataType=*/HioGlslfxResourceLayoutTokens.bufferReadWrite, /*name=*/_Token(input[2])))
    element.aggregateName = _Token(input[1])
    element.members = _ParseMembers(input, /*fromElement=*/3)
    return true
  }
  return false
}

// glslfxResourceLayout.cpp:267-292
function _ParsePerStageLayout(result: HioGlslfxResourceLayoutElementVector, perStageLayout: VtValue): void {
  const perSnippetVector = _GetInputValueVector(perStageLayout)
  for (const perSnippet of perSnippetVector) {
    const perDeclVector = _GetInputValueVector(perSnippet)
    for (const perDecl of perDeclVector) {
      const input = _GetInputValueVector(perDecl)
      const element = new Element()

      if (_ParseValue(input, element) ||
          _ParseValueArray(input, element) ||
          _ParseBlock(input, element) ||
          _ParseBlockArray(input, element) ||
          _ParseQualifier(input, element) ||
          _ParseUniformBlock(input, element) ||
          _ParseBuffer(input, element)) {
        result.push(element)
      } else {
        TfDiagnosticMgr.GetInstance().postError(
          new TfError('Error parsing PerStageLayout', TfDiagnosticType.CodingError))
      }
    }
  }
}

/** HioGlslfxResourceLayout (glslfxResourceLayout.h:69-189). */
export class HioGlslfxResourceLayout {
  static readonly InOut = HioGlslfxResourceLayoutInOut
  static readonly Kind = HioGlslfxResourceLayoutKind
  static readonly Member = HioGlslfxResourceLayoutMember
  static readonly Element = HioGlslfxResourceLayoutElement
  static readonly TextureType = HioGlslfxResourceLayoutTextureType
  static readonly TextureElement = HioGlslfxResourceLayoutTextureElement

  /** glslfxResourceLayout.cpp:296-307 */
  static parseLayout(
    result: HioGlslfxResourceLayoutElementVector,
    shaderStage: TfToken,
    layoutDict: VtDictionary,
  ): void {
    const perStageLayout = layoutDict.get(shaderStage)
    if (perStageLayout !== undefined) {
      _ParsePerStageLayout(result, perStageLayout)
    }
  }
}
