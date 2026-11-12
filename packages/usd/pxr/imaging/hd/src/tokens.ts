// Ported from OpenUSD 26.11.1: pxr/imaging/hd/tokens.cpp,
//  pxr/imaging/hd/tokens.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/tokens.h — HdTokens (TF_DEFINE_PUBLIC_TOKENS).
// Standard token strings used as keys throughout Hydra
//
// FAITHFULNESS-DEBT(hd-tokens-grabbag): this set carries many tokens upstream
// HD_TOKENS does NOT contain — they belong to per-schema TF_DECLARE_PUBLIC_TOKENS
// sets (mesh-topology, subdivision-tags, xform, mesh-schema, primvars, plus
// volume/material/instancer). The reader sets exist in meshSchema.ts; slimming
// HdTokens to upstream HD_TOKENS + re-pointing the ~60 authoring-side consumers
// is DEFERRED until hd is more fully built out. Runtime-transparent.

import { MakeTokens as TfMakeTokens } from 'typescript-usd/tf'

export const HdTokens = TfMakeTokens({
  // Prim types
  mesh:         'mesh',
  basisCurves:  'basisCurves',
  points:       'points',
  volume:       'volume',
  camera:       'camera',
  light:        'light',
  distantLight: 'distantLight',
  domeLight:    'domeLight',
  sphereLight:  'sphereLight',
  rectLight:    'rectLight',
  diskLight:    'diskLight',
  cylinderLight:'cylinderLight',

  // Schema names (top-level data source keys on a prim)
  xform:        'xform',
  visibility:   'visibility',
  purpose:      'purpose',
  extent:       'extent',
  displayStyle: 'displayStyle',
  material:     'material',
  primvars:     'primvars',
  // Deferred-skinning invalidation (the 26.05 skinning-inputs analog):
  // dirties only the per-frame joint transforms, not the geometry.
  skinningXforms: 'skinningXforms',
  categories:   'categories',
  instancedBy:  'instancedBy',

  // Geometry
  topology:         'topology',
  faceVertexCounts: 'faceVertexCounts',
  faceVertexIndices:'faceVertexIndices',
  holeIndices:      'holeIndices',
  orientation:      'orientation',
  subdivisionScheme:'subdivisionScheme',
  doubleSided:      'doubleSided',
  normals:          'normals',
  widths:           'widths',
  indices:          'indices',

  // Subdivision tags (PxOsdSubdivTags analog)
  subdivisionTags:                'subdivisionTags',
  interpolateBoundary:            'interpolateBoundary',
  faceVaryingLinearInterpolation: 'faceVaryingLinearInterpolation',
  triangleSubdivisionRule:        'triangleSubdivisionRule',
  creaseIndices:                  'creaseIndices',
  creaseLengths:                  'creaseLengths',
  creaseSharpnesses:              'creaseSharpnesses',
  cornerIndices:                  'cornerIndices',
  cornerSharpnesses:              'cornerSharpnesses',

  // Transform
  matrix:       'matrix',
  resetXformStack: 'resetXformStack',

  // Display / material
  displayColor:  'displayColor',
  displayOpacity:'displayOpacity',

  // Material network
  materialBinding:  'materialBinding',
  terminals:        'terminals',
  nodes:            'nodes',
  nodeIdentifier:   'nodeIdentifier',
  parameters:       'parameters',
  inputConnections: 'inputConnections',
  surface:          'surface',
  displacement:     'displacement',
  path:             'path',

  // Primvar interpolation
  constant:     'constant',
  uniform:      'uniform',
  varying:      'varying',
  vertex:       'vertex',
  faceVarying:  'faceVarying',
  instance:     'instance',

  // Common values
  rightHanded:  'rightHanded',
  leftHanded:   'leftHanded',
  none:         'none',
  catmullClark: 'catmullClark',
  loop:         'loop',
  bilinear:     'bilinear',

  // Visibility
  inherited:    'inherited',
  invisible:    'invisible',

  // Reprs
  hull:         'hull',
  smoothHull:   'smoothHull',
  wire:         'wire',
  wireOnSurf:   'wireOnSurf',
  refined:      'refined',
  refinedWire:  'refinedWire',
  refinedWireOnSurf: 'refinedWireOnSurf',

  // Dirty bits / sync
  transform:    'transform',
  instancer:    'instancer',

  // Instancing (flattened point-instancer transforms plus the corresponding
  // authored indices; HdInstancerTopologySchema::instanceIndices).
  instanceTransforms: 'instanceTransforms',
  instanceIndices: 'instanceIndices',

  // Volumes (hd/volumeFieldBindingSchema.h, hd/volumeFieldSchema.h; field
  // bprim type tokens from usdVolImaging/tokens.h)
  openvdbAsset:       'openvdbAsset',
  field3dAsset:       'field3dAsset',
  volumeFieldBinding: 'volumeFieldBinding',
  volumeField:        'volumeField',
  filePath:           'filePath',
  fieldName:          'fieldName',
  fieldIndex:         'fieldIndex',
  fieldDataType:      'fieldDataType',

  // Remaining HD_TOKENS (hd/tokens.h:20-122).
  accelerations: 'accelerations',
  adjacency: 'adjacency',
  angularVelocities: 'angularVelocities',
  bboxLocalMin: 'bboxLocalMin',
  bboxLocalMax: 'bboxLocalMax',
  bbox: 'bbox',
  bezier: 'bezier',
  bspline: 'bspline',
  blurScale: 'blurScale',
  catmullRom: 'catmullRom',
  centripetalCatmullRom: 'centripetalCatmullRom',
  collection: 'collection',
  computeShader: 'computeShader',
  coordSysBindings: 'coordSysBindings',
  cubic: 'cubic',
  cullStyle: 'cullStyle',
  dispatchCount: 'dispatchCount',
  drawDispatch: 'drawDispatch',
  drawingShader: 'drawingShader',
  drawingCoord0: 'drawingCoord0',
  drawingCoord1: 'drawingCoord1',
  drawingCoord2: 'drawingCoord2',
  drawingCoordI: 'drawingCoordI',
  drivers: 'drivers',
  edgeIndices: 'edgeIndices',
  elementCount: 'elementCount',
  elementsVisibility: 'elementsVisibility',
  faceColors: 'faceColors',
  filters: 'filters',
  full: 'full',
  geometry: 'geometry',
  hermite: 'hermite',
  hullIndices: 'hullIndices',
  isFlipped: 'isFlipped',
  itemsDrawn: 'itemsDrawn',
  layout: 'layout',
  linear: 'linear',
  lightLink: 'lightLink',
  filterLink: 'filterLink',
  lightFilterLink: 'lightFilterLink',
  lightFilterType: 'lightFilterType',
  meshLight: 'meshLight',
  materialParams: 'materialParams',
  materialSyncMode: 'materialSyncMode',
  nonlinearSampleCount: 'nonlinearSampleCount',
  nonperiodic: 'nonperiodic',
  params: 'params',
  patchParam: 'patchParam',
  periodic: 'periodic',
  pinned: 'pinned',
  pointsIndices: 'pointsIndices',
  portals: 'portals',
  power: 'power',
  preview: 'preview',
  pointsVisibility: 'pointsVisibility',
  primvar: 'primvar',
  primID: 'primID',
  primitiveParam: 'primitiveParam',
  tessFactors: 'tessFactors',
  quadInfo: 'quadInfo',
  renderTags: 'renderTags',
  segmented: 'segmented',
  shadowLink: 'shadowLink',
  subdivTags: 'subdivTags',
  taskState: 'taskState',
  taskParams: 'taskParams',
  topologyVisibility: 'topologyVisibility',
  totalItemCount: 'totalItemCount',
  transformInverse: 'transformInverse',
  velocities: 'velocities',
  isLight: 'isLight',
  bSpline: 'bspline',
})

export type HdToken = typeof HdTokens[keyof typeof HdTokens]

// HD_PERF_TOKENS (tokens.h:157-202), the full list.
export const HdPerfTokens = {
  adjacencyBufSize: 'adjacencyBufSize',
  basisCurvesTopology: 'basisCurvesTopology',
  bufferSourcesResolved: 'bufferSourcesResolved',
  bufferArrayRangeMigrated: 'bufferArrayRangeMigrated',
  bufferArrayRangeContainerResized: 'bufferArrayRangeContainerResized',
  committed: 'committed',
  computationsCommitted: 'computationsCommitted',
  drawBatches: 'drawBatches',
  drawCalls: 'drawCalls',
  dirtyLists: 'dirtyLists',
  dirtyListsRebuilt: 'dirtyListsRebuilt',
  garbageCollected: 'garbageCollected',
  garbageCollectedSsbo: 'garbageCollectedSsbo',
  garbageCollectedUbo: 'garbageCollectedUbo',
  garbageCollectedVbo: 'garbageCollectedVbo',
  gpuMemoryUsed: 'gpuMemoryUsed',
  instBasisCurvesTopology: 'instBasisCurvesTopology',
  instBasisCurvesTopologyRange: 'instBasisCurvesTopologyRange',
  instImplicitPrimsTopologyRange: 'instImplicitPrimsTopologyRange',
  instExtComputationDataRange: 'instExtComputationDataRange',
  instGlslProgram: 'instGlslProgram',
  instMeshTopology: 'instMeshTopology',
  instMeshTopologyRange: 'instMeshTopologyRange',
  instPrimvarRange: 'instPrimvarRange',
  instVertexAdjacency: 'instVertexAdjacency',
  meshTopology: 'meshTopology',
  nonUniformSize: 'nonUniformSize',
  numCompletedSamples: 'numCompletedSamples',
  quadrangulateCPU: 'quadrangulateCPU',
  quadrangulateGPU: 'quadrangulateGPU',
  quadrangulateFaceVarying: 'quadrangulateFaceVarying',
  quadrangulatedVerts: 'quadrangulatedVerts',
  rebuildBatches: 'rebuildBatches',
  singleBufferSize: 'singleBufferSize',
  ssboSize: 'ssboSize',
  skipInvisibleRprimSync: 'skipInvisibleRprimSync',
  sourcesCommitted: 'sourcesCommitted',
  subdivisionRefineCPU: 'subdivisionRefineCPU',
  subdivisionRefineGPU: 'subdivisionRefineGPU',
  stats: 'stats',
  textureAllocations: 'textureAllocations',
  textureMemory: 'textureMemory',
  triangulateFaceVarying: 'triangulateFaceVarying',
  uboSize: 'uboSize',
  vboRelocated: 'vboRelocated',
} as const

// HdRenderTagTokens (tokens.h HD_RENDERTAG_TOKENS).
export const HdRenderTagTokens = {
  geometry: 'geometry',
  guide:    'guide',
  hidden:   'hidden',
  proxy:    'proxy',
  render:   'render',
} as const

// pxr/imaging/hd/tokens.h token families kept separate upstream.
export const HdAovTokens = TfMakeTokens({
  color: 'color',
  depth: 'depth',
  depthStencil: 'depthStencil',
  cameraDepth: 'cameraDepth',
  normal: 'normal',
  primId: 'primId',
  instanceId: 'instanceId',
  elementId: 'elementId',
  edgeId: 'edgeId',
  pointId: 'pointId',
  Peye: 'Peye',
  Neye: 'Neye',
  patchCoord: 'patchCoord',
  primitiveParam: 'primitiveParam',
  primvars: 'primvars:',
  lpe: 'lpe:',
  shader: 'shader:',
})

export const HdRprimTypeTokens = TfMakeTokens({
  capsule: 'capsule', cone: 'cone', cube: 'cube', cylinder: 'cylinder',
  geomSubset: 'geomSubset', mesh: 'mesh', tetMesh: 'tetMesh',
  nurbsPatch: 'nurbsPatch', basisCurves: 'basisCurves',
  nurbsCurves: 'nurbsCurves', particleField: 'particleField',
  plane: 'plane', points: 'points', sphere: 'sphere', volume: 'volume',
  model: 'model',
})

export const HdSprimTypeTokens = TfMakeTokens({
  camera: 'camera', drawTarget: 'drawTarget', material: 'material',
  coordSys: 'coordSys', instancer: 'instancer', instance: 'instance',
  integrator: 'integrator', sampleFilter: 'sampleFilter',
  displayFilter: 'displayFilter', energyFilter: 'energyFilter',
  imageShader: 'imageShader', cylinderLight: 'cylinderLight',
  diskLight: 'diskLight', distantLight: 'distantLight', domeLight: 'domeLight',
  light: 'light', meshLight: 'meshLight', pluginLight: 'pluginLight',
  rectLight: 'rectLight', simpleLight: 'simpleLight',
  sphereLight: 'sphereLight', lightFilter: 'lightFilter',
  extComputation: 'extComputation',
})

export const HdBprimTypeTokens = TfMakeTokens({
  renderBuffer: 'renderBuffer', renderSettings: 'renderSettings',
})

export const HdPrimTypeTokens = {
  ...HdRprimTypeTokens,
  ...HdSprimTypeTokens,
  ...HdBprimTypeTokens,
  renderPass: 'renderPass',
  task: 'task',
} as const

export const HdReprTokens = TfMakeTokens({
  disabled: 'disabled', hull: 'hull', points: 'points',
  smoothHull: 'smoothHull', refined: 'refined', refinedWire: 'refinedWire',
  refinedWireOnSurf: 'refinedWireOnSurf',
  refinedSolidWireOnSurf: 'refinedSolidWireOnSurf', wire: 'wire',
  wireOnSurf: 'wireOnSurf', solidWireOnSurf: 'solidWireOnSurf',
})

export const HdMaterialTerminalTokens = TfMakeTokens({
  surface: 'surface', displacement: 'displacement', volume: 'volume',
  volumeFilter: 'volumeFilter', light: 'light', lightFilter: 'lightFilter',
  imageShader: 'imageShader',
})

export const HdOptionTokens = TfMakeTokens({ parallelRprimSync: 'parallelRprimSync' })
export const HdRenderContextTokens = TfMakeTokens({ universal: '' })

export function HdAovTokensMakePrimvar(name: string): string {
  return `${HdAovTokens.primvars}${name}`
}
export function HdAovTokensMakeLpe(name: string): string {
  return `${HdAovTokens.lpe}${name}`
}
export function HdAovTokensMakeShader(name: string): string {
  return `${HdAovTokens.shader}${name}`
}

export const HdCullStyleTokens = TfMakeTokens({
  dontCare: 'dontCare', nothing: 'nothing', back: 'back', front: 'front',
  backUnlessDoubleSided: 'backUnlessDoubleSided',
  frontUnlessDoubleSided: 'frontUnlessDoubleSided',
})
export const HdPrimvarRoleTokens = TfMakeTokens({
  none: '', color: 'color', vector: 'vector', normal: 'normal', point: 'point',
  textureCoordinate: 'textureCoordinate',
})
export const HdRenderSettingsTokens = TfMakeTokens({
  enableShadows: 'enableShadows', enableSceneMaterials: 'enableSceneMaterials',
  enableSceneLights: 'enableSceneLights',
  enableExposureCompensation: 'enableExposureCompensation',
  domeLightCameraVisibility: 'domeLightCameraVisibility',
  convergedVariance: 'convergedVariance',
  convergedSamplesPerPixel: 'convergedSamplesPerPixel',
  threadLimit: 'threadLimit', enableInteractive: 'enableInteractive',
})
export const HdRenderSettingsPrimTokens = TfMakeTokens({
  active: 'active', namespacedSettings: 'namespacedSettings',
  renderProducts: 'renderProducts', includedPurposes: 'includedPurposes',
  materialBindingPurposes: 'materialBindingPurposes',
  renderingColorSpace: 'renderingColorSpace',
  unionedSamplingInterval: 'unionedSamplingInterval', camera: 'camera',
  disableDepthOfField: 'disableDepthOfField',
  disableMotionBlur: 'disableMotionBlur',
})
export const HdAspectRatioConformPolicyTokens = TfMakeTokens({
  adjustApertureWidth: 'adjustApertureWidth',
  adjustApertureHeight: 'adjustApertureHeight',
  expandAperture: 'expandAperture', cropAperture: 'cropAperture',
  adjustPixelAspectRatio: 'adjustPixelAspectRatio',
})
export const HdCollectionEmulationTokens = TfMakeTokens({
  lightLinkCollection: 'lightLink', shadowLinkCollection: 'shadowLink',
  filterLinkCollection: 'filterLink',
  lightLinkCollectionMembershipExpression: 'lightLinkCollectionMembershipExpression',
  shadowLinkCollectionMembershipExpression: 'shadowLinkCollectionMembershipExpression',
  filterLinkCollectionMembershipExpression: 'filterLinkCollectionMembershipExpression',
})

const _gprimTypes = new Set<string>([
  HdRprimTypeTokens.capsule, HdRprimTypeTokens.cone, HdRprimTypeTokens.cube,
  HdRprimTypeTokens.cylinder, HdRprimTypeTokens.mesh, HdRprimTypeTokens.tetMesh,
  HdRprimTypeTokens.nurbsPatch, HdRprimTypeTokens.basisCurves,
  HdRprimTypeTokens.nurbsCurves, HdRprimTypeTokens.plane,
  HdRprimTypeTokens.points, HdRprimTypeTokens.sphere,
].map(String))
const _lightTypes = new Set<string>([
  HdSprimTypeTokens.cylinderLight, HdSprimTypeTokens.diskLight,
  HdSprimTypeTokens.distantLight, HdSprimTypeTokens.domeLight,
  HdSprimTypeTokens.light, HdSprimTypeTokens.meshLight,
  HdSprimTypeTokens.pluginLight, HdSprimTypeTokens.rectLight,
  HdSprimTypeTokens.simpleLight, HdSprimTypeTokens.sphereLight,
].map(String))
export function HdPrimTypeIsGprim(primType: string): boolean { return _gprimTypes.has(primType) }
export function HdPrimTypeIsLight(primType: string): boolean { return _lightTypes.has(primType) }
export function HdPrimTypeSupportsGeomSubsets(primType: string): boolean {
  return primType === HdRprimTypeTokens.mesh ||
    primType === HdRprimTypeTokens.nurbsPatch ||
    primType === HdRprimTypeTokens.tetMesh
}
export function HdLightPrimTypeTokens(): string[] { return [..._lightTypes] }

// HD_SHADER_TOKENS (tokens.h:208-245).
export const HdShaderTokens = TfMakeTokens({
  alphaThreshold: 'alphaThreshold',
  clipPlanes: 'clipPlanes',
  commonShaderSource: 'commonShaderSource',
  computeShader: 'computeShader',
  cullStyle: 'cullStyle',
  drawRange: 'drawRange',
  environmentMap: 'environmentMap',
  linearExposure: 'linearExposure',
  displacementShader: 'displacementShader',
  fragmentShader: 'fragmentShader',
  geometryShader: 'geometryShader',
  imageToWorldMatrix: 'imageToWorldMatrix',
  imageToHorizontallyNormalizedFilmback: 'imageToHorizontallyNormalizedFilmback',
  indicatorColor: 'indicatorColor',
  lightingBlendAmount: 'lightingBlendAmount',
  overrideColor: 'overrideColor',
  maskColor: 'maskColor',
  projectionMatrix: 'projectionMatrix',
  projectionInverseMatrix: 'projectionInverseMatrix',
  pointColor: 'pointColor',
  pointSize: 'pointSize',
  pointSelectedSize: 'pointSelectedSize',
  materialTag: 'materialTag',
  numClipPlanes: 'numClipPlanes',
  tessControlShader: 'tessControlShader',
  tessEvalShader: 'tessEvalShader',
  postTessControlShader: 'postTessControlShader',
  postTessVertexShader: 'postTessVertexShader',
  tessLevel: 'tessLevel',
  viewport: 'viewport',
  vertexShader: 'vertexShader',
  wireframeColor: 'wireframeColor',
  worldToViewMatrix: 'worldToViewMatrix',
  worldToViewInverseMatrix: 'worldToViewInverseMatrix',
  stepSize: 'stepSize',
  stepSizeLighting: 'stepSizeLighting',
  multisampleCount: 'multisampleCount',
})

// HD_INSTANCER_TOKENS (tokens.h:115-127).
export const HdInstancerTokens = TfMakeTokens({
  culledInstanceIndices: 'culledInstanceIndices',
  instancer: 'instancer',
  instancerTransform: 'instancerTransform',
  instancerTransformInverse: 'instancerTransformInverse',
  instanceIndices: 'instanceIndices',
  instanceIndexBase: 'instanceIndexBase',
  instanceTransforms: 'hydra:instanceTransforms',
  instanceRotations: 'hydra:instanceRotations',
  instanceScales: 'hydra:instanceScales',
  instanceTranslations: 'hydra:instanceTranslations',
})

// HD_MATERIALTAG_TOKENS (tokens.h:247-249; deprecated upstream in favour of
// HdStMaterialTagTokens).
export const HdMaterialTagTokens = TfMakeTokens({
  defaultMaterialTag: 'defaultMaterialTag',
})

// HD_RESOURCE_TYPE_TOKENS (tokens.h:480-482).
export const HdResourceTypeTokens = TfMakeTokens({
  texture: 'texture',
  shaderFile: 'shaderFile',
})
