// Ported from OpenUSD 26.11.1: pxr/usd/usdLux/testenv/testUsdLuxLight.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdLux/testenv/testUsdLuxLight.py
//
// test_BasicConnectableLights and test_SdrShaderNodesForLights are split into
// several cases ("test_X: part") so the parts that depend on API missing here
// fail on their own while the rest of each method still runs.
import { describe, expect, it } from 'vitest'
import { Prim, SchemaRegistry as UsdSchemaRegistry, Stage } from 'typescript-usd/usd'
import {
  BBox3d as GfBBox3d, IsClose as GfIsClose, Matrix4d as GfMatrix4d, Range3d as GfRange3d,
  Vec3d as GfVec3d, Vec3f as GfVec3f,
} from 'typescript-usd/gf'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { Type as TfType } from 'typescript-usd/tf'
import { Registry as SdrRegistry, type ShaderNode, type ShaderProperty } from 'typescript-usd/sdr'
import { Boundable, setStageUpAxis } from 'typescript-usd/usdGeom'
import { ConnectableAPI, NodeGraph, type ShadeInput, type ShadeOutput } from 'typescript-usd/usdShade'
import {
  BlackbodyTemperatureAsRgb, CylinderLight, DiskLight, DistantLight, DomeLight,
  LightAPI, LightFilter, PluginLightFilter, PortalLight, RectLight, ShadowAPI,
  ShapingAPI, SphereLight, Tokens as UsdLuxTokens,
} from '../../src/index.ts'

// UsdShadeConnectableAPI::HasConnectableAPI(TfType) (connectableAPI.h).
function HasConnectableAPI(schemaType: { typeName: string }): boolean {
  return ConnectableAPI.hasConnectableAPI(TfType.findByName(`UsdLux${schemaType.typeName}`))
}

const fullPaths = (props: ReadonlyArray<ShadeInput | ShadeOutput>) => props.map(p => p.fullPath)

// The state of test_BasicConnectableLights up to the light filter section.
function _BasicConnectableLightsSetup() {
  const stage = Stage.createNew()
  const rectLight = RectLight.define(stage, '/RectLight')
  const lightAPI = rectLight.lightAPI()
  const lightInput = lightAPI.createInput('newInput', 'float')
  const lightOutput = lightAPI.createOutput('newOutput', 'float')
  const lightFilter = LightFilter.define(stage, '/LightFilter')
  const filterInput = lightFilter.createInput('newInput', 'float')
  const filterOutput = lightFilter.createOutput('newOutput', 'float')
  return { stage, rectLight, lightAPI, lightInput, lightOutput, lightFilter, filterInput, filterOutput }
}

describe('TestUsdLuxLight', () => {
  it('test_BlackbodySpectrum', () => {
    const warm_color = BlackbodyTemperatureAsRgb(1000)
    const whitepoint = BlackbodyTemperatureAsRgb(6500)
    const cool_color = BlackbodyTemperatureAsRgb(10000)
    // Whitepoint is ~= (1,1,1)
    expect(GfIsClose(whitepoint, new GfVec3f(1.0), 0.1)).toBe(true)
    // Warm has more red than green or blue
    expect(warm_color.data[0]! > warm_color.data[1]!).toBe(true)
    expect(warm_color.data[0]! > warm_color.data[2]!).toBe(true)
    // Cool has more blue than red or green
    expect(cool_color.data[2]! > cool_color.data[0]!).toBe(true)
    expect(cool_color.data[2]! > cool_color.data[1]!).toBe(true)
  })

  it('test_BasicConnectableLights: HasConnectableAPI on core lux types', () => {
    // Try checking connectableAPI on core lux types first before going
    // through the prim.
    expect(HasConnectableAPI(RectLight)).toBe(true)
    expect(HasConnectableAPI(PluginLightFilter)).toBe(true)
  })

  it('test_BasicConnectableLights: light inputs and outputs', () => {
    const stage = Stage.createNew()
    const rectLight = RectLight.define(stage, '/RectLight')
    expect(rectLight.isValid()).toBe(true)
    const lightAPI = rectLight.lightAPI()
    expect(lightAPI.isValid()).toBe(true)
    expect(lightAPI.connectableAPI().isValid()).toBe(true)

    // Rect light has the following built-in inputs attributes.
    const inputNames = ['color',
      'colorTemperature',
      'diffuse',
      'enableColorTemperature',
      'exposure',
      'height',
      'intensity',
      'normalize',
      'specular',
      'texture:file',
      'width']
    // GetInputs returns only authored inputs by default
    expect(lightAPI.getInputs()).toEqual([])

    // GetInputs(false) is a super-set of all the built-ins.
    // There could be other inputs coming from any auto applied APISchemas.
    const allInputs = lightAPI.getInputs(false).map(input => input.name)
    for (const name of inputNames) expect(allInputs).toContain(name)

    // Verify each input's attribute is prefixed.
    for (const name of inputNames) {
      expect(lightAPI.getInput(name).attr.name).toBe('inputs:' + name)
    }
    // Verify input attributes match the getter API attributes.
    expect(lightAPI.getInput('color').attr.getPath())
      .toBe(rectLight.getColorAttr().getPath())
    expect(lightAPI.getInput('texture:file').attr.getPath())
      .toBe(rectLight.getTextureFileAttr().getPath())

    // Create a new input, and verify that the input interface conforming
    // attribute is created.
    const lightInput = lightAPI.createInput('newInput', 'float')
    expect(fullPaths(lightAPI.getInputs())).toContain(lightInput.fullPath)
    // By default GetInputs() returns onlyAuthored inputs, of which
    // there is now 1.
    expect(lightAPI.getInputs().length).toBe(1)
    expect(lightAPI.getInput('newInput').fullPath).toBe(lightInput.fullPath)
    expect(lightInput.attr.getPath())
      .toBe(lightAPI.prim.getAttr('inputs:newInput')!.getPath())

    // Rect light has no authored outputs.
    expect(lightAPI.getOutputs()).toEqual([])
    // Rect light has no built-in outputs, either.
    expect(lightAPI.getOutputs(false)).toEqual([])

    // Create a new output, and verify that the output interface conforming
    // attribute is created.
    const lightOutput = lightAPI.createOutput('newOutput', 'float')
    expect(fullPaths(lightAPI.getOutputs())).toEqual([lightOutput.fullPath])
    expect(fullPaths(lightAPI.getOutputs(false))).toEqual([lightOutput.fullPath])
    expect(lightAPI.getOutput('newOutput').fullPath).toBe(lightOutput.fullPath)
    expect(lightOutput.attr.getPath())
      .toBe(lightAPI.prim.getAttr('outputs:newOutput')!.getPath())
  })

  it('test_BasicConnectableLights: light filter inputs and outputs', () => {
    const stage = Stage.createNew()
    // Do the same with a light filter
    const lightFilter = LightFilter.define(stage, '/LightFilter')
    expect(lightFilter.isValid()).toBe(true)
    expect(lightFilter.connectableAPI().isValid()).toBe(true)

    // Light filter has no built-in inputs.
    expect(lightFilter.getInputs()).toEqual([])

    // Create a new input, and verify that the input interface conforming
    // attribute is created.
    const filterInput = lightFilter.createInput('newInput', 'float')
    expect(fullPaths(lightFilter.getInputs())).toEqual([filterInput.fullPath])
    expect(lightFilter.getInput('newInput').fullPath).toBe(filterInput.fullPath)
    expect(filterInput.attr.getPath())
      .toBe(lightFilter.prim.getAttr('inputs:newInput')!.getPath())

    // Light filter has no built-in outputs.
    expect(lightFilter.getOutputs()).toEqual([])
    expect(lightFilter.getOutputs(false)).toEqual([])

    // Create a new output, and verify that the output interface conforming
    // attribute is created.
    const filterOutput = lightFilter.createOutput('newOutput', 'float')
    expect(fullPaths(lightFilter.getOutputs())).toEqual([filterOutput.fullPath])
    expect(fullPaths(lightFilter.getOutputs(false))).toEqual([filterOutput.fullPath])
    expect(lightFilter.getOutput('newOutput').fullPath).toBe(filterOutput.fullPath)
    expect(filterOutput.attr.getPath())
      .toBe(lightFilter.prim.getAttr('outputs:newOutput')!.getPath())
  })

  it('test_BasicConnectableLights: connection behavior customization', () => {
    const { stage, lightAPI, lightInput, lightOutput, filterInput, filterOutput } =
      _BasicConnectableLightsSetup()

    // Test the connection behavior customization.
    // Create a connectable prim with an output under the light.
    const lightGraph = NodeGraph.define(stage, '/RectLight/Prim')
    expect(lightGraph.isValid()).toBe(true)
    const lightGraphOutput = lightGraph.createOutput('graphOut', 'float')

    // Create a connectable prim with an output under the light filter.
    const filterGraph = NodeGraph.define(stage, '/LightFilter/Prim')
    expect(filterGraph.isValid()).toBe(true)
    const filterGraphOutput = filterGraph.createOutput('graphOut', 'float')

    // Light outputs can be connected.
    expect(lightOutput.canConnect(lightGraphOutput).canConnect).toBe(true)
    expect(lightOutput.canConnect(filterGraphOutput).canConnect).toBe(true)

    // Light inputs diverge from the default behavior and should be
    // connectable across its own scope (encapsulation is not required)
    expect(lightInput.canConnect(lightOutput).canConnect).toBe(true)
    expect(lightInput.canConnect(lightGraphOutput).canConnect).toBe(true)
    expect(lightInput.canConnect(filterGraphOutput).canConnect).toBe(true)

    // From the default behavior light filter outputs cannot be connected.
    expect(filterOutput.canConnect(lightGraphOutput).canConnect).toBe(false)
    expect(filterOutput.canConnect(filterGraphOutput).canConnect).toBe(false)

    // Light filters follow encapsulation rules, so should not be connectable
    // across its own scope. (encapsulation is required) and
    // cannot connect its own input to its own output
    expect(filterInput.canConnect(filterOutput).canConnect).toBe(false)
    expect(filterInput.canConnect(filterGraphOutput).canConnect).toBe(true)
    // cannot connect its own input to another light's output which is
    // outside its own encapsulated scope
    expect(filterInput.canConnect(lightGraphOutput).canConnect).toBe(false)

    // The shaping API inputs have the same connectable behaviors as all light
    // inputs.
    const shapingAPI = ShapingAPI.apply(lightAPI.prim)
    const shapingInput = shapingAPI.getInput('shaping:focus')
    expect(shapingInput.canConnect(lightOutput).canConnect).toBe(true)
    expect(shapingInput.canConnect(lightGraphOutput).canConnect).toBe(true)
    expect(shapingInput.canConnect(filterGraphOutput).canConnect).toBe(true)

    // The shadow API inputs have the same connectable behaviors as all light
    // inputs.
    const shadowAPI = ShadowAPI.apply(lightAPI.prim)
    const shadowInput = shadowAPI.getInput('shadow:color')
    expect(shadowInput.canConnect(lightOutput).canConnect).toBe(true)
    expect(shadowInput.canConnect(lightGraphOutput).canConnect).toBe(true)
    expect(shadowInput.canConnect(filterGraphOutput).canConnect).toBe(true)
  })

  it('test_BasicConnectableLights: shaping and shadow API inputs', () => {
    const { lightAPI } = _BasicConnectableLightsSetup()

    // The shaping API can add more connectable attributes to the light
    // and implements the same connectable interface functions. We test
    // those here.
    const shapingAPI = ShapingAPI.apply(lightAPI.prim)
    expect(shapingAPI.isValid()).toBe(true)
    expect(shapingAPI.connectableAPI().isValid()).toBe(true)
    // Verify input attributes match the getter API attributes.
    expect(shapingAPI.getInput('shaping:cone:angle').attr.getPath())
      .toBe(shapingAPI.getShapingConeAngleAttr().getPath())
    expect(shapingAPI.getInput('shaping:focus').attr.getPath())
      .toBe(shapingAPI.getShapingFocusAttr().getPath())

    // The shadow API can add more connectable attributes to the light
    // and implements the same connectable interface functions. We test
    // those here.
    const shadowAPI = ShadowAPI.apply(lightAPI.prim)
    expect(shadowAPI.isValid()).toBe(true)
    expect(shadowAPI.connectableAPI().isValid()).toBe(true)
    // Verify input attributes match the getter API attributes.
    expect(shadowAPI.getInput('shadow:color').attr.getPath())
      .toBe(shadowAPI.getShadowColorAttr().getPath())
    expect(shadowAPI.getInput('shadow:distance').attr.getPath())
      .toBe(shadowAPI.getShadowDistanceAttr().getPath())
  })

  it('test_BasicConnectableLights: APIs do not make a non-connectable prim connectable', () => {
    const { stage } = _BasicConnectableLightsSetup()
    // Even though the shadow and shaping API schemas provide connectable
    // attributes and an interface for the ConnectableAPI, the typed schema
    // of the prim is still what provides its connectable behavior. Here
    // we verify that applying these APIs to a prim whose type is not
    // connectable does NOT cause the prim to conform to the Connectable API.
    const nonConnectablePrim = stage.definePrim('/Sphere', 'Sphere')
    const shadowAPI = ShadowAPI.apply(nonConnectablePrim)
    expect(shadowAPI.isValid()).toBe(true)
    expect(shadowAPI.connectableAPI().isValid()).toBe(false)
    const shapingAPI = ShapingAPI.apply(nonConnectablePrim)
    expect(shapingAPI.isValid()).toBe(true)
    expect(shapingAPI.connectableAPI().isValid()).toBe(false)
  })

  it('test_DomeLight_OrientToStageUpAxis', () => {
    // UsdGeomXformable::GetOrderedXformOps is not public in
    // typescript-usd/usdGeom; the ops are read from xformOpOrder, whose
    // entries are the op names (op type and suffix).
    const orderedXformOps = (light: DomeLight) =>
      Array.from((light.prim.getAttr('xformOpOrder')?.getValue() ?? []) as ArrayLike<string>)

    const stage = Stage.createNew()
    // Try Y-up first.  Explicitly set this to override any site-level
    // override.
    setStageUpAxis(stage, 'Y')
    // Create a dome.
    const light = DomeLight.define(stage, '/dome')
    // No Xform ops to begin with.
    expect(orderedXformOps(light)).toEqual([])
    // Align to up axis.
    light.orientToStageUpAxis()
    // Since the stage is already Y-up, no additional xform op was required.
    expect(orderedXformOps(light)).toEqual([])
    // Now change the stage to Z-up and re-align the dome.
    setStageUpAxis(stage, 'Z')
    light.orientToStageUpAxis()
    // That should require a +90 deg rotate on X.
    const ops = orderedXformOps(light)
    expect(ops.length).toBe(1)
    // Base name UsdLux.Tokens.orientToStageUpAxis, op type TypeRotateX.
    expect(ops[0]).toBe(`xformOp:rotateX:${UsdLuxTokens.orientToStageUpAxis}`)
    expect(light.prim.getAttr(ops[0]!)!.getValue()).toBe(90.0)
  })

  it('test_UsdLux_HasConnectableAPI', () => {
    expect(HasConnectableAPI(LightAPI)).toBe(true)
    expect(HasConnectableAPI(LightFilter)).toBe(true)
  })

  it('test_GetShaderId', () => {
    // Test the LightAPI shader ID API

    // UsdLuxLightAPI and UsdLuxLightFilter implement the same API for
    // their shaderId attributes so we can test them using the same function.
    const _TestShaderIDs = (lightOrFilter: LightAPI | LightFilter, shaderIdAttrName: string) => {
      // The default render context's shaderId attribute does exist in the
      // API. These attributes do not yet exist for other contexts.
      expect(lightOrFilter.getShaderIdAttrForRenderContext('').name).toBe(shaderIdAttrName)
      expect(lightOrFilter.getShaderIdAttrForRenderContext('ri').isValid()).toBe(false)
      expect(lightOrFilter.getShaderIdAttrForRenderContext('other').isValid()).toBe(false)

      // By default LightAPI shader IDs are empty for all render contexts.
      expect(lightOrFilter.getShaderId([])).toBe('')
      expect(lightOrFilter.getShaderId(['other', 'ri'])).toBe('')

      // Set a value in the default shaderID attr.
      lightOrFilter.getShaderIdAttr().set('DefaultLight')
      // No new attributes were created.
      expect(lightOrFilter.getShaderIdAttrForRenderContext('').name).toBe(shaderIdAttrName)
      expect(lightOrFilter.getShaderIdAttrForRenderContext('ri').isValid()).toBe(false)
      expect(lightOrFilter.getShaderIdAttrForRenderContext('other').isValid()).toBe(false)

      // The default value is now the shaderID returned for all render
      // contexts since no render contexts define their own shader ID
      expect(lightOrFilter.getShaderId([])).toBe('DefaultLight')
      expect(lightOrFilter.getShaderId(['other', 'ri'])).toBe('DefaultLight')

      // Create a shaderID attr for the "ri" render context with a new ID
      // value.
      lightOrFilter.createShaderIdAttrForRenderContext('ri', 'SphereLight')
      // The shaderId attr for "ri" now exists
      expect(lightOrFilter.getShaderIdAttrForRenderContext('').name).toBe(shaderIdAttrName)
      expect(lightOrFilter.getShaderIdAttrForRenderContext('ri').name)
        .toBe('ri:' + shaderIdAttrName)
      expect(lightOrFilter.getShaderIdAttrForRenderContext('other').isValid()).toBe(false)

      // When passed no render contexts we still return the default
      // shader ID.
      expect(lightOrFilter.getShaderId([])).toBe('DefaultLight')
      // Since we defined a shader ID for "ri" but not "other", the "ri"
      // shader ID is returned when queryring for both. Querying for just
      // "other" falls back to the default shaderID
      expect(lightOrFilter.getShaderId(['other', 'ri'])).toBe('SphereLight')
      expect(lightOrFilter.getShaderId(['ri'])).toBe('SphereLight')
      expect(lightOrFilter.getShaderId(['other'])).toBe('DefaultLight')
    }

    // Create an untyped prim with a LightAPI applied and test the ShaderId
    // functions of UsdLux.LightAPI
    const stage = Stage.createNew()
    const prim = stage.definePrim('/PrimLight')
    const light = LightAPI.apply(prim)
    expect(light.isValid()).toBe(true)
    _TestShaderIDs(light, 'light:shaderId')

    // Create a LightFilter prim  and test the ShaderId functions of
    // UsdLux.LightFilter
    const lightFilter = LightFilter.define(stage, '/PrimLightFilter')
    expect(lightFilter.isValid()).toBe(true)
    _TestShaderIDs(lightFilter, 'lightFilter:shaderId')
  })

  it('test_LightExtentAndBBox', () => {
    // Test extent and bbox computations for the boundable lights.

    // Usd.TimeCode.Default()
    const time = undefined

    // Python compares the float extents with ==, under which -0.0 == 0.0.
    const plusZero = (v: readonly number[]) => v.map(x => x + 0)

    // Helper for computing the extent and bounding boxes for a light and
    // comparing against an expect extent pair.
    const _VerifyExtentAndBBox = (
      light: RectLight | DiskLight | CylinderLight | SphereLight | PortalLight,
      expectedExtent: [[number, number, number], [number, number, number]],
    ) => {
      const extent = Boundable.computeExtentFromPlugins(light.prim, time)
      expect(extent && extent.map(plusZero)).toEqual(expectedExtent)
      expect(light.computeLocalBound(time, 'default').equals(
        new GfBBox3d(
          new GfRange3d(
            new GfVec3d(...expectedExtent[0]),
            new GfVec3d(...expectedExtent[1])),
          new GfMatrix4d(1.0)))).toBe(true)
    }

    // Create a prim of each boundable light type.
    const stage = Stage.createNew()
    const rectLight = RectLight.define(stage, '/RectLight')
    expect(rectLight.isValid()).toBe(true)
    const diskLight = DiskLight.define(stage, '/DiskLight')
    expect(diskLight.isValid()).toBe(true)
    const cylLight = CylinderLight.define(stage, '/CylLight')
    expect(cylLight.isValid()).toBe(true)
    const sphereLight = SphereLight.define(stage, '/SphereLight')
    expect(sphereLight.isValid()).toBe(true)
    const portalLight = PortalLight.define(stage, '/PortalLight')
    expect(portalLight.isValid()).toBe(true)

    // Verify the extent and bbox computations for each light given its
    // fallback attribute values.
    _VerifyExtentAndBBox(rectLight, [[-0.5, -0.5, 0.0], [0.5, 0.5, 0.0]])
    _VerifyExtentAndBBox(diskLight, [[-0.5, -0.5, 0.0], [0.5, 0.5, 0.0]])
    _VerifyExtentAndBBox(cylLight, [[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]])
    _VerifyExtentAndBBox(sphereLight, [[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]])
    _VerifyExtentAndBBox(portalLight, [[-0.5, -0.5, 0.0], [0.5, 0.5, 0.0]])

    // Change the size related attribute of each light and verify the extents
    // and bounding boxes are updated.
    rectLight.createWidthAttr(4.0)
    rectLight.createHeightAttr(6.0)
    _VerifyExtentAndBBox(rectLight, [[-2.0, -3.0, 0.0], [2.0, 3.0, 0.0]])

    diskLight.createRadiusAttr(5.0)
    _VerifyExtentAndBBox(diskLight, [[-5.0, -5.0, 0.0], [5.0, 5.0, 0.0]])

    cylLight.createRadiusAttr(4.0)
    cylLight.createLengthAttr(10.0)
    _VerifyExtentAndBBox(cylLight, [[-5.0, -4.0, -4.0], [5.0, 4.0, 4.0]])

    sphereLight.createRadiusAttr(3.0)
    _VerifyExtentAndBBox(sphereLight, [[-3.0, -3.0, -3.0], [3.0, 3.0, 3.0]])

    portalLight.createWidthAttr(4.0)
    portalLight.createHeightAttr(6.0)
    _VerifyExtentAndBBox(portalLight, [[-2.0, -3.0, 0.0], [2.0, 3.0, 0.0]])
  })

  it('test_LightExtentAndBBox: distant and dome lights are not boundable', () => {
    // Gap: typescript-usd/usdGeom's Boundable handle isValid() does not check the
    // prim's type (UsdTyped::_IsCompatible), so any prim yields a valid Boundable.
    const stage = Stage.createNew()
    // For completeness verify that distant and dome lights are not
    // boundable.
    const domeLight = DomeLight.define(stage, '/DomeLight')
    expect(domeLight.isValid()).toBe(true)
    expect(new Boundable(domeLight.prim).isValid()).toBe(false)
    const domeLight_1 = DomeLight.define(stage, '/DomeLight_1')
    expect(domeLight_1.isValid()).toBe(true)
    expect(new Boundable(domeLight_1.prim).isValid()).toBe(false)
    const distLight = DistantLight.define(stage, '/DistLight')
    expect(distLight.isValid()).toBe(true)
    expect(new Boundable(distLight.prim).isValid()).toBe(false)
  })

  // The expected shader node inputs that should be found for all of our
  // UsdLux light types.
  const expectedLightInputNames = [
    // LightAPI
    'color',
    'colorTemperature',
    'diffuse',
    'enableColorTemperature',
    'exposure',
    'intensity',
    'normalize',
    'specular',

    // ShadowAPI
    'shadow:color',
    'shadow:distance',
    'shadow:enable',
    'shadow:falloff',
    'shadow:falloffGamma',

    // ShapingAPI
    'shaping:cone:angle',
    'shaping:cone:softness',
    'shaping:focus',
    'shaping:focusTint',
    'shaping:ies:angleScale',
    'shaping:ies:file',
    'shaping:ies:normalize',
  ]

  // Map of the names of the expected light nodes to the additional inputs
  // we expect for those types.
  const expectedLightNodes: Record<string, string[]> = {
    'CylinderLight': ['length', 'radius'],
    'DiskLight': ['radius'],
    'DistantLight': ['angle'],
    'DomeLight': ['texture:file', 'texture:format'],
    'GeometryLight': [],
    'PortalLight': ['width', 'height'],
    'RectLight': ['width', 'height', 'texture:file'],
    'SphereLight': ['radius'],
    'MeshLight': [],
    'VolumeLight': [],
  }

  const expectedLightTypes = [
    'CylinderLight',
    'DiskLight',
    'DistantLight',
    'DomeLight',
    'DomeLight_1',
    'GeometryLight',
    'PortalLight',
    'RectLight',
    'SphereLight',
    'MeshLight',
    'VolumeLight',
  ]

  // For each light type of test_SdrShaderNodesForLights, the prim's LightAPI
  // and the SdrShaderNode registered for its shader ID.
  function _ForEachLightNode(fn: (light: LightAPI, node: ShaderNode, sdrIdentifier: string) => void) {
    // Get all the derived types of UsdLuxBoundableLightBase and
    // UsdLuxNonboundableLightBase that are defined in UsdLux
    const plugin = PlugRegistry.GetInstance().GetPluginWithName('usdLux')!
    const lightTypes = [
      ...TfType.findByName('UsdLuxBoundableLightBase').getAllDerivedTypes(),
      ...TfType.findByName('UsdLuxNonboundableLightBase').getAllDerivedTypes(),
    ].filter(type => plugin.declaresType(type))
    expect(lightTypes.length).toBeGreaterThan(0)

    // Augment lightTypes to include MeshLightAPI and VolumeLightAPI
    lightTypes.push(TfType.findByName('UsdLuxMeshLightAPI'))
    lightTypes.push(TfType.findByName('UsdLuxVolumeLightAPI'))

    // Verify that at least one known light type is in our list to guard
    // against this giving false positives if no light types are available.
    expect(lightTypes).toContain(TfType.findByName('UsdLuxRectLight'))
    expect(lightTypes.length).toBe(expectedLightTypes.length)

    const stage = Stage.createNew()
    const prim: Prim = stage.definePrim('/Prim')

    for (const lightType of lightTypes) {
      if (UsdSchemaRegistry.isAppliedAPISchema(lightType)) {
        prim.applyAPI(lightType)
      } else {
        const typeName = UsdSchemaRegistry.getConcreteSchemaTypeName(lightType)
        if (!typeName) {
          continue
        }
        prim.setTypeName(typeName)
      }
      const light = new LightAPI(prim)
      expect(light.isValid()).toBe(true)
      const sdrIdentifier = light.getShaderId([])
      expect(sdrIdentifier).toBeTruthy()
      prim.applyAPI(ShadowAPI.typeName)
      prim.applyAPI(ShapingAPI.typeName)

      // Every concrete light type and some API schemas (with appropriate
      // shaderId as sdr Identifier) in usdLux domain will have an
      // SdrShaderNode with shading system 'USD' registered for it
      // under its USD schema type name.
      const node = SdrRegistry.getInstance().getShaderNodeByIdentifier(sdrIdentifier, ['USD'])
      expect(node, sdrIdentifier).toBeDefined()
      expect(Object.keys(expectedLightNodes)).toContain(sdrIdentifier)
      fn(light, node!, sdrIdentifier)
    }
  }

  it('test_SdrShaderNodesForLights', () => {
    // Test the automatic registration of SdrShaderNodes for all the UsdLux
    // light types.
    _ForEachLightNode((light, node, sdrIdentifier) => {
      // Names, identifier for the node all match the USD schema
      // type name
      expect(node.getIdentifier()).toBe(sdrIdentifier)
      expect(node.getName()).toBe(sdrIdentifier)
      expect(node.getImplementationName()).toBe(sdrIdentifier)

      // The context is always 'light' for lights.
      // Source type is 'USD'
      expect(node.getContext()).toBe('light')
      expect(node.getShadingSystem()).toBe('USD')

      // Help string is generated and encoded in the node's metadata (no
      // need to verify the specific wording).
      expect(Object.keys(node.getMetadata()).length).toBeGreaterThan(0)
      expect(node.getMetadata()['help']).toBe(node.getHelp())

      // Source code and URIs are all empty.
      expect(node.getSourceCode()).toBeFalsy()
      expect(node.getResolvedDefinitionURI()).toBeFalsy()
      expect(node.getResolvedImplementationURI()).toBeFalsy()

      expect(Object.keys(node.getMetadata())).not.toContain('category')
      expect(Object.keys(node.getMetadata())).not.toContain('departments')
      expect(node.getFunction()).toBeFalsy()
      expect(node.getShaderVersion().isValid()).toBe(false)
      expect(node.getPages()).toEqual([''])

      // The node will be valid for our light types.
      expect(node.isValid()).toBe(true)

      // Helper for comparing an SdrShaderProperty from node to the
      // corresponding UsdShadeInput/UsdShadeOutput from a UsdLux light
      const _CompareLightPropToNodeProp = (nodeInput: ShaderProperty, primInput: ShadeInput) => {
        // Input names and default values match.
        const primDefaultValue = primInput.attr.getValue()
        expect(nodeInput.getName()).toBe(primInput.name)
        // Python's == holds False == 0 and True == 1: a bool default is
        // conformed to an int (usdShade/shaderDefUtils.cpp:165-196).
        expect(nodeInput.getDefaultValue()).toEqual(
          typeof primDefaultValue === 'boolean' ? Number(primDefaultValue) : primDefaultValue)

        // Some USD property types don't match exactly one to one and are
        // converted to different types. In particular relevance to
        // lights and Token becomes String.
        let expectedTypeName = primInput.attr.typeName
        // Array valued attributes have their array size determined from
        // the default value and will be converted to scalar in the
        // SdrProperty if the array size is zero.
        if (expectedTypeName.endsWith('[]')) {
          const length = (primDefaultValue as { length?: number } | undefined)?.length
          if (!primDefaultValue || length === 0) {
            expectedTypeName = expectedTypeName.slice(0, -2)
          }
        }
        // token SdfType should Have String SdrTypes, but still return as
        // token when queried for GetTypeAsSdfType
        if (expectedTypeName === 'token') {
          expect(nodeInput.getType()).toBe('string')
        }
        // Bool SdfTypes should Have Int SdrTypes, but still return as
        // Bool when queried for GetTypeAsSdfType
        if (expectedTypeName === 'bool') {
          expect(nodeInput.getType()).toBe('int')
        }
        // Verify the node's input type maps back to USD property's type
        // (with the noted above exceptions).
        expect(nodeInput.getTypeAsSdfType(),
          `${node.getName()}.${nodeInput.getName()} Type`).toBe(expectedTypeName)
        // If the USD property type is an Asset, it will be listed in
        // the node's asset identifier inputs.
        if (expectedTypeName === 'asset') {
          expect(node.getAssetIdentifierInputNames()).toContain(nodeInput.getName())
        }
      }

      // There will be a one to one correspondence between node inputs
      // and prim inputs. Note that the prim may have additional inputs
      // because of auto applied API schemas, but we only need to verify
      // that the node has ONLY the expected inputs and the prim at least
      // has those input proerties.
      const expectedInputNames =
        [...expectedLightInputNames, ...expectedLightNodes[sdrIdentifier]!]
      // Verify node has exactly the expected inputs.
      expect([...node.getShaderInputNames()].sort()).toEqual([...expectedInputNames].sort())
      // Verify each node input matches a prim input.
      for (const inputName of expectedInputNames) {
        const nodeInput = node.getShaderInput(inputName)!
        const primInput = light.getInput(inputName)
        expect(nodeInput.isOutput()).toBe(false)
        _CompareLightPropToNodeProp(nodeInput, primInput)
      }

      // None of the UsdLux base lights have outputs
      expect(node.getShaderOutputNames()).toEqual([])
      expect(light.getOutputs(false)).toEqual([])

      // The reverse is tested just above, but for all asset identifier
      // inputs listed for the node there is a corresponding asset value
      // input property on the prim.
      for (const inputName of node.getAssetIdentifierInputNames()) {
        expect(light.getInput(inputName).attr.typeName).toBe('asset')
      }

      // Default input can also be specified in the property's sdrMetadata.
      if (node.getDefaultInput()) {
        const defaultInput = light.getInput(node.getDefaultInput()!.getName())
        expect(defaultInput.attr.getMetadata('sdrMetadata')).toHaveProperty('defaultInput')
      }
    })
  })

  it('test_SdrShaderNodesForLights: info string, label, vstructs and primvars', () => {
    _ForEachLightNode((light, node, sdrIdentifier) => {
      expect(node.getInfoString().startsWith(sdrIdentifier)).toBe(true)
      expect(node.getLabel()).toBe('')
      expect(node.getAllVstructNames()).toEqual([])

      // These primvars come from sdrMetadata on the prim itself which
      // isn't supported for light schemas so it will always be empty.
      expect(node.getPrimvars()).toEqual([])
      // sdrMetadata on input properties is supported so additional
      // primvar properties will correspond to prim inputs with that
      // metadata set.
      for (const propName of node.getAdditionalPrimvarProperties()) {
        expect(light.getInput(propName).getSdrMetadataByKey('primvarProperty')).toBeTruthy()
      }
    })
  })
})
