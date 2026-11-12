// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp,
//  pxr/imaging/hdSt/testenv/testHdStPtex.cpp,
//  pxr/imaging/hdSt/testenv/testHdStShaders.cpp
// Copyright 2021, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The textured-material scene of the fixtures/texturedCodegen capture, built
// through the ported Storm path: the testHdStDepthBias driver pattern
// (tests/upstream/testHdStDepthBias.ts; testHdStDepthBias.cpp:33-204) with
// one render pass, a 4x4 grid mesh (subdivision scheme none), and a material network like testHdStShaders /
// testHdStPtex (testHdStShaders.cpp:79-232, testHdStPtex.cpp:73-130): a
// glslfx surface from source code whose "textures" entry diffuseColor is
// connected to a UsdUVTexture node reading texture.png, with st from a
// UsdPrimvarReader_float2. Not an upstream test: its expectations are the
// reference build's run of that capture (FIXTURES.md).

import {
  Matrix4f as GfMatrix4f,
  Rect2i as GfRect2i,
  Vec2f as GfVec2f,
  Vec2i as GfVec2i,
  Vec3f as GfVec3f,
  Vec4f as GfVec4f,
} from 'typescript-usd/gf'
import { Token as TfToken, Type as TfType } from 'typescript-usd/tf'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import {
  CompareFunction as HdCompareFunction,
  CullStyle as HdCullStyle,
  Interpolation as HdInterpolation,
  MaterialNetwork as HdMaterialNetwork,
  MaterialNetworkMap as HdMaterialNetworkMap,
  MaterialNode as HdMaterialNode,
  MaterialTerminalTokens as HdMaterialTerminalTokens,
  PrimvarRoleTokens as HdPrimvarRoleTokens,
  RenderTagTokens as HdRenderTagTokens,
  ReprSelector as HdReprSelector,
  ReprTokens as HdReprTokens,
  RprimCollection as HdRprimCollection,
  Tokens as HdTokens,
} from 'typescript-usd/hd'
import { Framing as CameraUtilFraming } from 'typescript-usd/cameraUtil'
import { OpenSubdivTokens as PxOsdOpenSubdivTokens } from 'typescript-usd/pxOsd'
import type { Hgi } from 'typescript-usd/hgi'
import { HioGlslfxTokens } from 'typescript-usd/hio'
import { Registry as SdrRegistry } from 'typescript-usd/sdr'
import { HdSt_RenderPass } from '../src/renderPass.ts'
import { HdSt_DrawTask, HdSt_TestDriverBase, type HdStTestAovReadback } from '../src/unitTestHelper.ts'
import { My_TestGLDrawing as DepthBiasDrawing } from './upstream/testHdStDepthBias.ts'

/** The capture's My_TestDriver */
export class TexturedTestDriver extends HdSt_TestDriverBase {
  constructor(hgi: Hgi) {
    super(hgi)
    this._renderPassStates = [this._getRenderDelegate().createRenderPassState()]
    this._renderPassStates[0]!.setDepthFunc(HdCompareFunction.HdCmpFuncLess)
    this._renderPassStates[0]!.setCullStyle(HdCullStyle.HdCullStyleNothing)

    this._init()

    this._renderPasses.push(new HdSt_RenderPass(
      this.getDelegate().getRenderIndex(),
      new HdRprimCollection(HdTokens.geometry, new HdReprSelector(HdReprTokens.smoothHull))))
  }

  draw(): void {
    this._getEngine().Execute(this.getDelegate().getRenderIndex(), [
      new HdSt_DrawTask(this._renderPasses[0]!, this._renderPassStates[0]!,
        [HdRenderTagTokens.geometry])])
  }

  /** The texture load phase of the next commit (textureObjectRegistry.ts). */
  loadTexturesAsync(): Promise<void> {
    return (this.getDelegate().getRenderIndex().getResourceRegistry() as unknown as
      { loadTexturesAsync(): Promise<void> }).loadTexturesAsync()
  }
}

/** The capture's lines 83-101 */
export const surfaceSource =
  '-- glslfx version 0.1 \n' +
  '-- configuration \n' +
  '{\n' +
  '"textures" : { \n' +
  '    "diffuseColor": { \n' +
  '        "description": "Diffuse color texture" \n' +
  '    } \n' +
  '}, \n' +
  '"techniques": {\n' +
  '    "default": {\n' +
  '        "surfaceShader": {\n' +
  '            "source": [ "texturedCodegen.Surface" ]\n' +
  '        }\n' +
  '    }\n' +
  '}\n\n' +
  '}\n' +
  '-- glsl texturedCodegen.Surface \n\n' +
  'vec4 surfaceShader(vec4 Peye, vec3 Neye, vec4 color, vec4 patchCoord) {\n' +
  '    return vec4(HdGet_diffuseColor().xyz, 1);\n' +
  '}\n'

/** The capture's My_TestGLDrawing: the depthBias drawing harness camera
 *  (rotate 90, 0; translate 0, 0, -10). */
export class TexturedDrawing extends DepthBiasDrawing {
  private _texturedDriver: TexturedTestDriver | null = null

  constructor(private readonly _texHgi: Hgi) {
    super(_texHgi)
    this.setCameraRotate(90.0, 0.0)
    this.setCameraTranslate(new GfVec3f(0, 0, -10.0))
  }

  /** The capture's lines 103-170 */
  override initTest(): void {
    const driver = new TexturedTestDriver(this._texHgi)
    this._texturedDriver = driver
    driver.setClearColor(new GfVec4f(0.1, 0.1, 0.1, 1.0))
    driver.setClearDepth(1.0)
    driver.setupAovs(this.getWidth(), this.getHeight())

    const delegate = driver.getDelegate()

    const sdrSurfaceNode = SdrRegistry.getInstance().getShaderNodeFromSourceCode(
      surfaceSource, HioGlslfxTokens.glslfx, {})!

    const material = new HdMaterialNetworkMap()
    const network = new HdMaterialNetwork()
    material.map.set(HdMaterialTerminalTokens.surface, network)

    const reader = new HdMaterialNode()
    reader.path = '/material/Reader'
    reader.identifier = 'UsdPrimvarReader_float2'
    reader.parameters.set('varname', VtValue.create(TfToken('st'), VtValueTypes.token))

    const texture = new HdMaterialNode()
    texture.path = '/material/Texture'
    texture.identifier = 'UsdUVTexture'
    texture.parameters.set('file', VtValue.create(new SdfAssetPath('texture.png'), TfType.declare('SdfAssetPath')))
    texture.parameters.set('wrapS', VtValue.create(TfToken('repeat'), VtValueTypes.token))
    texture.parameters.set('wrapT', VtValue.create(TfToken('repeat'), VtValueTypes.token))

    const terminal = new HdMaterialNode()
    terminal.path = '/material/Shader'
    terminal.identifier = sdrSurfaceNode.getIdentifier()

    network.relationships.push({
      inputId: reader.path, inputName: 'result', outputId: texture.path, outputName: 'st' })
    network.relationships.push({
      inputId: texture.path, inputName: 'rgb', outputId: terminal.path, outputName: 'diffuseColor' })

    network.nodes.push(reader)
    network.nodes.push(texture)
    material.terminals.push(terminal.path)
    network.nodes.push(terminal) // must be last in vector

    delegate.addMaterialResource('/material', VtValue.create(material, TfType.declare('HdMaterialNetworkMap')))

    // The points and faces of HdUnitTestDelegate::AddGrid
    // (unitTestDelegate.cpp:1463-1509), with subdivision scheme "none".
    const grid = '/grid'
    const nx = 4, ny = 4
    const points: GfVec3f[] = []
    const numVerts: number[] = [], verts: number[] = []
    for (let y = 0; y <= ny; ++y) {
      for (let x = 0; x <= nx; ++x) {
        points.push(new GfVec3f(Math.fround(2.0 * x / Math.fround(nx) - 1.0),
          Math.fround(2.0 * y / Math.fround(ny) - 1.0), 0))
      }
    }
    for (let y = 0; y < ny; ++y) {
      for (let x = 0; x < nx; ++x) {
        numVerts.push(4)
        verts.push(y * (nx + 1) + x)
        verts.push(y * (nx + 1) + x + 1)
        verts.push((y + 1) * (nx + 1) + x + 1)
        verts.push((y + 1) * (nx + 1) + x)
      }
    }
    delegate.addMesh(grid, new GfMatrix4f(1.0).setScale(4.0), points, numVerts, verts,
      false, '', PxOsdOpenSubdivTokens.none)
    const st: GfVec2f[] = []
    for (let y = 0; y <= ny; ++y) {
      for (let x = 0; x <= nx; ++x) {
        st.push(new GfVec2f(Math.fround(2.0 * x / nx), Math.fround(2.0 * y / ny)))
      }
    }
    delegate.addPrimvar(grid, 'st', VtValue.createArray(new VtArray<GfVec2f>(st, VtValueTypes.GfVec2f)),
      HdInterpolation.HdInterpolationVertex, HdPrimvarRoleTokens.textureCoordinate)
    delegate.bindMaterial(grid, '/material')
  }

  /** The capture's lines 172-180 */
  drawTest(): void {
    const width = this.getWidth(), height = this.getHeight()
    this._texturedDriver!.setCamera(this.getViewMatrix(), this.getProjectionMatrix(),
      new CameraUtilFraming(new GfRect2i(new GfVec2i(0, 0), width, height)))
    this._texturedDriver!.updateAovDimensions(width, height)
    this._texturedDriver!.draw()
  }

  /** The capture's lines 182-187, with the texture load phase awaited after the
   *  first draw allocated the material's texture handles (see
   *  textureObjectRegistry.ts): the image is read back from a second draw
   *  that commits the loaded texture. */
  async offscreenTextured(): Promise<HdStTestAovReadback | null> {
    this.drawTest()
    await this._texturedDriver!.loadTexturesAsync()
    this.drawTest()
    return this._texturedDriver!.readBackAov('color')
  }

  getTexturedDriver(): TexturedTestDriver | null { return this._texturedDriver }
}
