// The two interpreter windows on one scene: Window > Python Interpreter
// (src/py-interpreter.ts, Pyodide over the pxr forwarding layer) and
// Window > TypeScript Interpreter (src/ts-interpreter.ts) are seeded with the
// same usdviewApi, whose stage is the viewer's own UsdStage. Python's
// forwarding objects hold the core's objects, so an edit from either
// language is an edit of that stage: the other language reads it at once,
// and the stage's ObjectsChanged notice, which redraws the viewer
// (runtime.ts prepareImaging), is sent for edits from both.
import { beforeAll, describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Stage, Notice as UsdNotice } from 'typescript-usd/usd'
import { Notice as TfNotice } from 'typescript-usd/tf'
import { loadPxrPython } from '../../../packages/usd/python/runUpstream'
import { createPxrInteractive } from '../../../packages/usd/python/interactive'
import type { InterpreterLanguage } from '../src/interpreter-language'
import { seededPythonInterpreter } from '../src/py-interpreter'
import { createTypeScriptInterpreter } from '../src/ts-interpreter'
import { UsdviewApi, type UsdviewAppController } from '../src/usdview-api'

describe('Python and TypeScript editing one stage', () => {
  let stage: Stage
  let python: InterpreterLanguage
  let typescript: InterpreterLanguage
  let notices = 0
  const run = (lang: () => InterpreterLanguage) => async (source: string) => {
    let text = '', failed = false
    await lang().runSource(source, { write: (t, style = 'output') => { text += t; if (style !== 'output') failed = true } })
    if (failed) throw new Error(`${source}\n${text}`)
    return text.trim()
  }
  const py = run(() => python), ts = run(() => typescript)

  beforeAll(async () => {
    stage = await Stage.open(Layer.createAnonymous())
    stage.definePrim('/World', 'Xform')
    const app = {
      stage: () => stage,
      selectionState: () => ({ selections: [{ path: '/World' }], focusPath: '/World', lcdPaths: ['/World'] }),
    } as unknown as UsdviewAppController
    const usdviewApi = new UsdviewApi(app)
    python = await seededPythonInterpreter(createPxrInteractive((await loadPxrPython()).pyodide), { usdviewApi })
    typescript = await createTypeScriptInterpreter({ usdviewApi })
    TfNotice.Register(UsdNotice.ObjectsChanged, () => { notices++ }, stage)
  }, 120_000)

  it('sees the same stage from both languages', async () => {
    expect(await py('usdviewApi.stage.GetRootLayer().identifier')).toBe(`'${stage.getRootLayer().identifier}'`)
    expect(await ts('usdviewApi.stage === usdviewApi.stage && usdviewApi.stage.getRootLayer().identifier')).toBe(`'${stage.getRootLayer().identifier}'`)
  })

  it('reads in TypeScript what Python authored', async () => {
    const before = notices
    await py("ball = UsdGeom.Sphere.Define(usdviewApi.stage, '/World/Ball')")
    await py('ball.GetRadiusAttr().Set(2.0)')
    await py('ball.GetDisplayColorAttr().Set([Gf.Vec3f(1, 0, 0)])')
    await py('ball.AddTranslateOp().Set(Gf.Vec3d(0, 3, 0))')
    expect(notices).toBeGreaterThanOrEqual(before + 4)
    expect(await ts("usdviewApi.stage.getPrim('/World/Ball').typeName")).toBe("'Sphere'")
    expect(await ts("usdviewApi.stage.getPrim('/World/Ball').getAttr('radius').get()")).toBe('2')
    expect(await ts("String(usdviewApi.stage.getPrim('/World/Ball').getAttr('xformOp:translate').get())")).toBe(`'${String(stage.getPrim('/World/Ball')!.getAttr('xformOp:translate')!.get())}'`)
  })

  it('reads in Python what TypeScript authored, on the same objects', async () => {
    const before = notices
    await ts("const box = new UsdGeom.Cube(usdviewApi.stage.definePrim('/World/Box', 'Cube'))")
    await ts('box.getSizeAttr().set(0.5)')
    await ts("usdviewApi.stage.getPrim('/World/Ball').getAttr('radius').set(5)")
    expect(notices).toBeGreaterThanOrEqual(before + 3)
    expect(await py("UsdGeom.Cube(usdviewApi.stage.GetPrimAtPath('/World/Box')).GetSizeAttr().Get()")).toBe('0.5')
    // The Python schema object made before the TypeScript edit reads it.
    expect(await py('ball.GetRadiusAttr().Get()')).toBe('5.0')
    expect(await py("UsdGeom.XformCommonAPI(usdviewApi.stage.GetPrimAtPath('/World/Ball')).GetXformVectors(Usd.TimeCode.Default())[0]")).toBe('Gf.Vec3d(0.0, 3.0, 0.0)')
  })

  it('takes turns on one prim and ends with one layer', async () => {
    await py("UsdGeom.XformCommonAPI(usdviewApi.stage.GetPrimAtPath('/World/Box')).SetTranslate(Gf.Vec3d(1, 2, 3))")
    await ts("usdviewApi.stage.getPrim('/World/Box').getAttr('size').set(1.5)")
    await py("usdviewApi.stage.GetPrimAtPath('/World/Ball').SetActive(False)")
    expect(await ts("usdviewApi.stage.getPrim('/World/Ball').isActive")).toBe('false')
    await ts("usdviewApi.stage.removePrim('/World/Ball')")
    expect(await py("bool(usdviewApi.stage.GetPrimAtPath('/World/Ball'))")).toBe('False')
    expect(stage.getRootLayer().exportToString()).toContain('def Cube "Box"')
    expect(stage.getPrim('/World/Box')!.getAttr('size')!.get()).toBe(1.5)
    expect(String(stage.getPrim('/World/Box')!.getAttr('xformOp:translate')!.get())).toBe('(1, 2, 3)')
  })

  it('builds a mesh, a material, animation, variants and primvars from Python, read back in TypeScript', async () => {
    await py("tri = UsdGeom.Mesh.Define(usdviewApi.stage, '/World/Tri')")
    await py('tri.CreatePointsAttr([Gf.Vec3f(0, 0, 0), Gf.Vec3f(1, 0, 0), Gf.Vec3f(0, 1, 0)])')
    await py('tri.CreateFaceVertexCountsAttr([3]); tri.CreateFaceVertexIndicesAttr([0, 1, 2])')
    expect(await ts("String(usdviewApi.stage.getPrim('/World/Tri').getAttr('points').get())")).toMatch(/1, 0, 0/)
    // A UsdPreviewSurface material bound to the mesh (upstream's
    // ConnectToSource(connectable, sourceName) and Bind).
    await py("mtl = UsdShade.Material.Define(usdviewApi.stage, '/World/Looks/Blue')")
    await py("surf = UsdShade.Shader.Define(usdviewApi.stage, '/World/Looks/Blue/Surface')")
    await py("surf.CreateIdAttr('UsdPreviewSurface')")
    await py("surf.CreateInput('diffuseColor', Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(0.2, 0.6, 1))")
    expect(await py("mtl.CreateSurfaceOutput().ConnectToSource(surf.ConnectableAPI(), 'surface')")).toBe('True')
    await py('UsdShade.MaterialBindingAPI.Apply(tri.GetPrim()).Bind(mtl)')
    expect(await py('m, rel = UsdShade.MaterialBindingAPI(tri).ComputeBoundMaterial(); m.GetPath(), rel.GetPath()')).toBe("(Sdf.Path('/World/Looks/Blue'), Sdf.Path('/World/Tri.material:binding'))")
    expect(await py("m, rel = UsdShade.MaterialBindingAPI(usdviewApi.stage.GetPrimAtPath('/World')).ComputeBoundMaterial(); bool(m), rel")).toBe('(False, None)')
    expect(await ts("usdviewApi.stage.getPrim('/World/Looks/Blue/Surface').getAttr('inputs:diffuseColor').typeName")).toBe("'color3f'")
    expect(await ts("UsdShade.MaterialBindingAPI.computeBoundMaterial(usdviewApi.stage, '/World/Tri')?.materialPath")).toBe("'/World/Looks/Blue'")
    // Time samples from both, and the stage's time range.
    await py("spin = UsdGeom.Xformable(tri).AddRotateZOp()")
    await py('spin.Set(0.0, 1); spin.Set(90.0, 24)')
    await ts("usdviewApi.stage.getPrim('/World/Tri').getAttr('xformOp:rotateZ').set(180, 48)")
    expect(await py('spin.GetTimeSamples()')).toBe('[1.0, 24.0, 48.0]')
    expect(await py('spin.Get(12)')).toBe(String(stage.getPrim('/World/Tri')!.getAttr('xformOp:rotateZ')!.get(12)))
    await py('usdviewApi.stage.SetStartTimeCode(1); usdviewApi.stage.SetEndTimeCode(48)')
    expect(await ts('[usdviewApi.stage.startTimeCode, usdviewApi.stage.endTimeCode]')).toBe('[ 1, 48 ]')
    // A variant set authored from Python, selected from TypeScript.
    await py("sizes = tri.GetPrim().GetVariantSets().AddVariantSet('size')")
    await py("sizes.AddVariant('small'); sizes.AddVariant('big')")
    await ts("usdviewApi.stage.getPrim('/World/Tri').getVariantSet('size').setVariantSelection('big')")
    expect(await py('sizes.GetVariantSelection()')).toBe("'big'")
    await py("UsdGeom.PrimvarsAPI(tri).CreatePrimvar('displayOpacity', Sdf.ValueTypeNames.FloatArray, UsdGeom.Tokens.constant).Set([0.5])")
    expect(await ts("Array.from(usdviewApi.stage.getPrim('/World/Tri').getAttr('primvars:displayOpacity').get())")).toBe('[ 0.5 ]')
    const text = stage.getRootLayer().exportToString()
    expect(text).toContain('rel material:binding = </World/Looks/Blue>')
    expect(text).toContain('token outputs:surface.connect = </World/Looks/Blue/Surface.outputs:surface>')
    expect(text).toContain('color3f inputs:diffuseColor = (0.2, 0.6, 1)')
    expect(text).toContain('endTimeCode = 48')
  })
})
