// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStDisplayStyle.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/testenv/testHdStDisplayStyle.cpp (OpenUSD
// 26.11.1): ten cubes, each drawn with a repr configured here through
// HdMesh/HdBasisCurves/HdPoints::ConfigureRepr (wireframe, culled
// wireframes, wire on surface, two-pass "feyRay", points), into
// multisampled AOVs, in a 640x480 offscreen run.
//
// Divergences: as testHdStInstancing.ts (driver given its Hgi, RunTest is
// ParseArgs + InitTest + OffscreenTest, WriteToFile is ReadBackAov; Present
// not ported). std::cout lines go to the returned stdout. The repr
// configurations are process-wide statics upstream as here; they persist
// in the page between registrations, which configure the same names the
// same way.

import {
  Matrix4d as GfMatrix4d,
  Matrix4f as GfMatrix4f,
  Rect2i as GfRect2i,
  Vec2i as GfVec2i,
  Vec3d as GfVec3d,
  Vec3f as GfVec3f,
  Vec4f as GfVec4f,
} from 'typescript-usd/gf'
import {
  BasisCurvesGeomStyle as HdBasisCurvesGeomStyle,
  BasisCurvesReprDesc as HdBasisCurvesReprDesc,
  CullStyle as HdCullStyle,
  HdBasisCurvesRprim as HdBasisCurves,
  HdMeshRprim as HdMesh,
  HdPointsRprim as HdPoints,
  Interpolation as I,
  MeshGeomStyle as HdMeshGeomStyle,
  MeshReprDesc as HdMeshReprDesc,
  MeshReprDescTokens as HdMeshReprDescTokens,
  PointsGeomStyle as HdPointsGeomStyle,
  PointsReprDesc as HdPointsReprDesc,
  ReprSelector as HdReprSelector,
  ReprTokens as HdReprTokens,
} from 'typescript-usd/hd'
import { OpenSubdivTokens as PxOsdOpenSubdivTokens } from 'typescript-usd/pxOsd'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Framing as CameraUtilFraming } from 'typescript-usd/cameraUtil'
import type { Hgi } from 'typescript-usd/hgi'
import type { Token as TfToken } from 'typescript-usd/tf'
import { HdSt_TestDriver, type HdStTestAovReadback } from '../../src/unitTestHelper.ts'
import { HdSt_UnitTestGLDrawing } from './unitTestGLDrawing.ts'

/** testHdStDisplayStyle.cpp:31-41 */
const _tokens = {
  feyRay: 'feyRay',
  wireframe: 'wireframe',
  wireframeBack: 'wireframeBack',
  wireframeFront: 'wireframeFront',
  wireOnSurfUnlit: 'wireOnSurfUnlit',
  solidWireOnSurf: 'solidWireOnSurf',
  points: 'points',
  pointsAndSurf: 'pointsAndSurf',
} as const

const curvesWire = () => new HdBasisCurvesReprDesc(HdBasisCurvesGeomStyle.HdBasisCurvesGeomStyleWire)
const pointsPoints = () => new HdPointsReprDesc(HdPointsGeomStyle.HdPointsGeomStylePoints)

/** testHdStDisplayStyle.cpp:43-69 */
export class My_TestGLDrawing extends HdSt_UnitTestGLDrawing {
  private _reprName: string = HdReprTokens.hull
  private _refineLevel = 0
  private _driver: HdSt_TestDriver | null = null
  private _outputFilePath = ''
  readonly stdout: string[] = []

  /** testHdStDisplayStyle.cpp:45-50 */
  constructor(private readonly _hgi: Hgi) {
    super()
    this.setCameraRotate(60.0, 0.0)
    this.setCameraTranslate(new GfVec3f(0, 0, Math.fround(Math.fround(-20.0) - Math.fround(Math.fround(1.7320508) * 2.0))))
  }

  /** testHdStDisplayStyle.cpp:72-262 */
  initTest(): void {
    this.stdout.push('My_TestGLDrawing::InitTest()')

    this._driver = new HdSt_TestDriver(this._hgi, this._reprName as TfToken)
    const delegate = this._driver.getDelegate()
    delegate.setRefineLevel(this._refineLevel)

    // configure display styles

    // wireframe
    HdMesh.configureRepr(_tokens.wireframe,
      new HdMeshReprDesc(HdMeshGeomStyle.HdMeshGeomStyleEdgeOnly,
        HdCullStyle.HdCullStyleNothing,
        HdMeshReprDescTokens.surfaceShaderUnlit,
        /*flatShadingEnabled=*/true))
    HdBasisCurves.configureRepr(_tokens.wireframe, curvesWire())
    HdPoints.configureRepr(_tokens.wireframe, pointsPoints())

    // wireframe + backface culling
    HdMesh.configureRepr(_tokens.wireframeFront,
      new HdMeshReprDesc(HdMeshGeomStyle.HdMeshGeomStyleEdgeOnly,
        HdCullStyle.HdCullStyleBack,
        HdMeshReprDescTokens.surfaceShaderUnlit,
        /*flatShadingEnabled=*/true))
    HdBasisCurves.configureRepr(_tokens.wireframeFront, curvesWire())
    HdPoints.configureRepr(_tokens.wireframeFront, pointsPoints())

    // wireframe + frontface culling
    HdMesh.configureRepr(_tokens.wireframeBack,
      new HdMeshReprDesc(HdMeshGeomStyle.HdMeshGeomStyleEdgeOnly,
        HdCullStyle.HdCullStyleFront,
        HdMeshReprDescTokens.surfaceShaderUnlit,
        /*flatShadingEnabled=*/true))
    // (upstream configures wireframeFront again here, not wireframeBack;
    // testHdStDisplayStyle.cpp:110-113)
    HdBasisCurves.configureRepr(_tokens.wireframeFront, curvesWire())
    HdPoints.configureRepr(_tokens.wireframeFront, pointsPoints())

    // wireframe on surface, unlit
    HdMesh.configureRepr(_tokens.wireOnSurfUnlit,
      new HdMeshReprDesc(HdMeshGeomStyle.HdMeshGeomStyleEdgeOnSurf,
        HdCullStyle.HdCullStyleDontCare,
        HdMeshReprDescTokens.surfaceShaderUnlit,
        /*flatShadingEnabled=*/true,
        /*blendWireframeColor=*/false,
        /*forceOpaqueEdges=*/false))
    HdBasisCurves.configureRepr(_tokens.wireOnSurfUnlit, curvesWire())
    HdPoints.configureRepr(_tokens.wireOnSurfUnlit, pointsPoints())

    // wireframe on surface, force opaque edges
    HdMesh.configureRepr(_tokens.solidWireOnSurf,
      new HdMeshReprDesc(HdMeshGeomStyle.HdMeshGeomStyleEdgeOnSurf,
        HdCullStyle.HdCullStyleDontCare,
        HdMeshReprDescTokens.surfaceShader,
        /*flatShadingEnabled=*/true,
        /*blendWireframeColor=*/false,
        /*forceOpaqueEdges=*/true))

    // 2-pass FeyRay
    HdMesh.configureRepr(_tokens.feyRay,
      new HdMeshReprDesc(HdMeshGeomStyle.HdMeshGeomStyleSurf,
        HdCullStyle.HdCullStyleFront,
        HdMeshReprDescTokens.surfaceShader,
        /*flatShadingEnabled=*/false),
      new HdMeshReprDesc(HdMeshGeomStyle.HdMeshGeomStyleEdgeOnly,
        HdCullStyle.HdCullStyleBack,
        HdMeshReprDescTokens.constantColor,
        /*flatShadingEnabled=*/true))
    HdBasisCurves.configureRepr(_tokens.feyRay, curvesWire())
    HdPoints.configureRepr(_tokens.feyRay, pointsPoints())

    // points
    HdMesh.configureRepr(_tokens.points,
      new HdMeshReprDesc(HdMeshGeomStyle.HdMeshGeomStylePoints,
        HdCullStyle.HdCullStyleNothing,
        HdMeshReprDescTokens.constantColor,
        /*flatShadingEnabled=*/true))
    HdBasisCurves.configureRepr(_tokens.points, curvesWire())
    HdPoints.configureRepr(_tokens.points, pointsPoints())

    // points and surface
    HdMesh.configureRepr(_tokens.pointsAndSurf,
      new HdMeshReprDesc(HdMeshGeomStyle.HdMeshGeomStylePoints,
        HdCullStyle.HdCullStyleNothing,
        HdMeshReprDescTokens.constantColor,
        /*flatShadingEnabled=*/true),
      new HdMeshReprDesc(HdMeshGeomStyle.HdMeshGeomStyleSurf,
        HdCullStyle.HdCullStyleNothing,
        HdMeshReprDescTokens.surfaceShader,
        /*flatShadingEnabled=*/false))
    HdBasisCurves.configureRepr(_tokens.pointsAndSurf, curvesWire())
    HdPoints.configureRepr(_tokens.pointsAndSurf, pointsPoints())

    let pos = [0, 0, 0]
    {
      const at = () => new GfMatrix4f(new GfMatrix4d(1).setTranslate(new GfVec3d(pos[0]!, pos[1]!, pos[2]!)))
      const add = (id: string, repr?: string) => {
        delegate.addCube(id, at()) // default repr when none is given
        if (repr) delegate.setReprSelector(id, new HdReprSelector(repr as TfToken))
        pos[0]! += 3.0
      }
      add('/cube1')
      add('/cube2', HdReprTokens.smoothHull)
      add('/cube3', _tokens.wireframe)
      add('/cube4', _tokens.wireframeFront)
      add('/cube5', _tokens.wireframeBack)
      add('/cube6', _tokens.wireOnSurfUnlit)

      // wrap
      pos = [0, -3.0, 0]

      add('/cube7', _tokens.feyRay)
      add('/cube8', _tokens.points)
      add('/cube9', _tokens.pointsAndSurf)

      delegate.addCube('/cube10', at(), /*guide*/false,
        /*instancerId*/'',
        /*scheme*/PxOsdOpenSubdivTokens.catmullClark,
        VtValue.create(new GfVec3f(1, 1, 1), VtValueTypes.GfVec3f),
        I.HdInterpolationConstant,
        VtValue.create(Math.fround(0.5), VtValueTypes.float),
        I.HdInterpolationConstant)
      delegate.setReprSelector('/cube10', new HdReprSelector(_tokens.solidWireOnSurf as TfToken))
      pos[0]! += 3.0
    }
    const center = new GfVec3f(7.5, 0, 1.5)

    // center camera
    const t = this.getCameraTranslate()
    this.setCameraTranslate(new GfVec3f(t.get(0) - center.get(0), t.get(1) - center.get(1), t.get(2) - center.get(2)))

    this._driver.setClearColor(new GfVec4f(0.1, 0.1, 0.1, 1.0))
    this._driver.setClearDepth(1.0)
    this._driver.setupAovs(this.getWidth(), this.getHeight(), /*multisampled*/true)
    this._driver.setWireframeColor(new GfVec4f(1, 0, 0, 1))
  }

  /** testHdStDisplayStyle.cpp:264-281 */
  drawTest(): void {
    const width = this.getWidth(), height = this.getHeight()
    // camera
    this._driver!.setCamera(this.getViewMatrix(), this.getProjectionMatrix(),
      new CameraUtilFraming(new GfRect2i(new GfVec2i(0, 0), width, height)))
    this._driver!.updateAovDimensions(width, height)
    this._driver!.draw()
  }

  /** testHdStDisplayStyle.cpp:283-291 */
  async offscreenTest(): Promise<HdStTestAovReadback | null> {
    this.drawTest()
    if (this._outputFilePath) return this._driver!.readBackAov('color')
    return null
  }

  /** testHdStDisplayStyle.cpp:299-312 */
  override parseArgs(argv: readonly string[]): void {
    for (let i = 0; i < argv.length; ++i) {
      const arg = argv[i]!
      if (arg === '--repr') this._reprName = argv[++i]!
      else if (arg === '--refineLevel') this._refineLevel = parseInt(argv[++i]!, 10)
      else if (arg === '--write') this._outputFilePath = argv[++i]!
    }
  }

  getOutputFilePath(): string { return this._outputFilePath }
}

/** testHdStDisplayStyle.cpp:314-319 DisplayStyleTest. */
export async function BasicTest(hgi: Hgi, argv: readonly string[]): Promise<{ images: { name: string, image: HdStTestAovReadback }[], stdout: string }> {
  const drawing = new My_TestGLDrawing(hgi)
  drawing.parseArgs(argv)
  drawing.initTest()
  const image = await drawing.offscreenTest()
  return { images: image ? [{ name: drawing.getOutputFilePath(), image }] : [], stdout: drawing.stdout.join('\n') }
}
