export { ExceptionShaderGenError } from './exceptions.ts'
export { TypeDesc, TypeSystem, StructMemberDesc, BaseType, Semantic, Type } from './typeDesc.ts'
export {
  GenOptions,
  ShaderInterfaceType,
  HwSpecularEnvironmentMethod,
  HwDirectionalAlbedoMethod,
  HwTransmissionRenderMethod,
} from './genOptions.ts'
export { GenUserData } from './genUserData.ts'
export { ShaderNodeImpl, NopNode, stringHash } from './shaderNodeImpl.ts'
export {
  ShaderMetadata,
  ShaderMetadataRegistry,
  ShaderPortFlag,
  ShaderPort,
  ShaderInput,
  ShaderOutput,
  ShaderNode,
  ShaderNodeClassification,
} from './shaderNode.ts'
export type { ShaderGraphInputSocket, ShaderGraphOutputSocket } from './shaderNode.ts'
export {
  Syntax,
  TypeSyntax,
  ScalarTypeSyntax,
  StringTypeSyntax,
  AggregateTypeSyntax,
  StructTypeSyntax,
  Punctuation,
} from './syntax.ts'
export type { IdentifierMap } from './syntax.ts'
export {
  Stage,
  VariableBlock,
  ShaderStage,
  addStageUniform,
  addStageInput,
  addStageOutput,
  addStageConnectorBlock,
  addStageConnector,
} from './shaderStage.ts'
export type { ShaderPortPredicate } from './shaderStage.ts'
export { GenContext, ScopedSetVariableName } from './genContext.ts'
export type { ApplicationVariableHandler } from './genContext.ts'
export { Shader } from './shader.ts'
export { ShaderGraph, ShaderGraphEdge, ShaderGraphEdgeIterator } from './shaderGraph.ts'
export type { ShaderGraphRefactor } from './shaderGraph.ts'
export {
  NodeElisionRefactor,
  PremultipliedBsdfAddRefactor,
  DistributeLayerOverMixRefactor,
} from './shaderGraphRefactor.ts'
export { ShaderGenerator } from './shaderGenerator.ts'
export type { CreatorFunction } from './shaderGenerator.ts'
export { ShaderTranslator } from './shaderTranslator.ts'
export { SourceCodeNode } from './nodes/sourceCodeNode.ts'
export { CompoundNode } from './nodes/compoundNode.ts'
export { MaterialNode } from './nodes/materialNode.ts'
export {
  ColorManagementSystem,
  DefaultColorManagementSystem,
  makeColorSpaceTransform,
} from './colorManagement.ts'
export type { ColorSpaceTransform } from './colorManagement.ts'
export { UnitSystem, ScalarUnitNode, makeUnitTransform } from './unitSystem.ts'
export type { UnitTransform } from './unitSystem.ts'
export {
  GAUSSIAN_KERNEL_3,
  GAUSSIAN_KERNEL_5,
  GAUSSIAN_KERNEL_7,
  isTransparentSurface,
  mapValueToColor,
  requiresImplementation,
  elementRequiresShading,
  findRenderableMaterialNodes,
  findRenderableElements,
  getNodeDefInput,
  tokenSubstitution,
  getUdimCoordinates,
  getUdimScaleAndOffset,
  connectsToWorldSpaceNode,
  hasElementAttributes,
} from './util.ts'
