// Ported from OpenUSD 26.11.1: pxr/imaging/hd/schemaTypeDefs.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/schemaTypeDefs.h (OpenUSD 26.11.1).
//
// Upstream declares these as template aliases (`using X = HdVectorOfSchemasSchema<S>`).
// TypeScript cannot pass a class as a template argument, so each alias is a
// subclass that supplies the element schema class to the base constructor.
// Element schema classes are only referenced inside constructors, so the
// import cycles with the schema modules are safe at module evaluation.

import { HdContainerDataSource, HdVectorDataSource } from './dataSource.ts'
import type { HdSampledDataSource } from './dataSource.ts'
import type { HdIntArrayDataSource } from './dataSourceTypeDefs.ts'
import { HdContainerOfSchemasSchema, HdContainerOfTypedSampledDataSourcesSchema } from './containerSchema.ts'
import { HdVectorOfSchemasSchema, HdVectorOfTypedSampledDataSourcesSchema } from './vectorSchema.ts'
import { HdBackPlateSchema } from './backPlateSchema.ts'
import { HdExtComputationInputComputationSchema } from './extComputationInputComputationSchema.ts'
import { HdExtComputationOutputSchema } from './extComputationOutputSchema.ts'
import { HdInstanceIndicesSchema } from './instanceIndicesSchema.ts'
import { HdInstanceSchema } from './instanceSchema.ts'
import { HdMaterialConnectionSchema } from './materialConnectionSchema.ts'
import { HdMaterialInterfaceMappingSchema } from './materialInterfaceMappingSchema.ts'
import { HdMaterialInterfaceParameterSchema } from './materialInterfaceParameterSchema.ts'
import { HdMaterialNetworkSchema } from './materialNetworkSchema.ts'
import { HdMaterialNodeParameterSchema } from './materialNodeParameterSchema.ts'
import { HdMaterialNodeSchema } from './materialNodeSchema.ts'
import { HdRenderProductSchema } from './renderProductSchema.ts'
import { HdRenderSettingDescriptorSchema } from './renderSettingDescriptorSchema.ts'
import { HdRenderVarSchema } from './renderVarSchema.ts'

/** schemaTypeDefs.h:21 */
export class HdIntArrayVectorSchema extends HdVectorOfTypedSampledDataSourcesSchema<HdIntArrayDataSource> {}

/** schemaTypeDefs.h:25 */
export class HdRenderProductVectorSchema extends HdVectorOfSchemasSchema<HdRenderProductSchema> {
  constructor(vector?: HdVectorDataSource | undefined) { super(vector, HdRenderProductSchema) }
}

/** schemaTypeDefs.h:27 */
export class HdRenderVarVectorSchema extends HdVectorOfSchemasSchema<HdRenderVarSchema> {
  constructor(vector?: HdVectorDataSource | undefined) { super(vector, HdRenderVarSchema) }
}

/** schemaTypeDefs.h:29 */
export class HdInstanceVectorSchema extends HdVectorOfSchemasSchema<HdInstanceSchema> {
  constructor(vector?: HdVectorDataSource | undefined) { super(vector, HdInstanceSchema) }
}

/** schemaTypeDefs.h:31 */
export class HdInstanceIndicesVectorSchema extends HdVectorOfSchemasSchema<HdInstanceIndicesSchema> {
  constructor(vector?: HdVectorDataSource | undefined) { super(vector, HdInstanceIndicesSchema) }
}

/** schemaTypeDefs.h:33 */
export class HdMaterialInterfaceMappingVectorSchema extends HdVectorOfSchemasSchema<HdMaterialInterfaceMappingSchema> {
  constructor(vector?: HdVectorDataSource | undefined) { super(vector, HdMaterialInterfaceMappingSchema) }
}

/** schemaTypeDefs.h:35 */
export class HdMaterialConnectionVectorSchema extends HdVectorOfSchemasSchema<HdMaterialConnectionSchema> {
  constructor(vector?: HdVectorDataSource | undefined) { super(vector, HdMaterialConnectionSchema) }
}

/** schemaTypeDefs.h:39 */
export class HdSampledDataSourceContainerSchema extends HdContainerOfTypedSampledDataSourcesSchema<HdSampledDataSource> {}

/** schemaTypeDefs.h:43 */
export class HdBackPlateContainerSchema extends HdContainerOfSchemasSchema<HdBackPlateSchema> {
  constructor(container?: HdContainerDataSource | undefined) { super(container, HdBackPlateSchema) }
}

/** schemaTypeDefs.h:45 */
export class HdMaterialNodeContainerSchema extends HdContainerOfSchemasSchema<HdMaterialNodeSchema> {
  constructor(container?: HdContainerDataSource | undefined) { super(container, HdMaterialNodeSchema) }
}

/** schemaTypeDefs.h:47 */
export class HdMaterialNodeParameterContainerSchema extends HdContainerOfSchemasSchema<HdMaterialNodeParameterSchema> {
  constructor(container?: HdContainerDataSource | undefined) { super(container, HdMaterialNodeParameterSchema) }
}

/** schemaTypeDefs.h:49 */
export class HdMaterialNetworkContainerSchema extends HdContainerOfSchemasSchema<HdMaterialNetworkSchema> {
  constructor(container?: HdContainerDataSource | undefined) { super(container, HdMaterialNetworkSchema) }
}

/** schemaTypeDefs.h:51 */
export class HdMaterialConnectionContainerSchema extends HdContainerOfSchemasSchema<HdMaterialConnectionSchema> {
  constructor(container?: HdContainerDataSource | undefined) { super(container, HdMaterialConnectionSchema) }
}

/** schemaTypeDefs.h:53 */
export class HdMaterialInterfaceParameterContainerSchema extends HdContainerOfSchemasSchema<HdMaterialInterfaceParameterSchema> {
  constructor(container?: HdContainerDataSource | undefined) { super(container, HdMaterialInterfaceParameterSchema) }
}

/** schemaTypeDefs.h:55 */
export class HdExtComputationInputComputationContainerSchema extends HdContainerOfSchemasSchema<HdExtComputationInputComputationSchema> {
  constructor(container?: HdContainerDataSource | undefined) { super(container, HdExtComputationInputComputationSchema) }
}

/** schemaTypeDefs.h:57 */
export class HdExtComputationOutputContainerSchema extends HdContainerOfSchemasSchema<HdExtComputationOutputSchema> {
  constructor(container?: HdContainerDataSource | undefined) { super(container, HdExtComputationOutputSchema) }
}

/** schemaTypeDefs.h:59 */
export class HdSampledDataSourceContainerContainerSchema extends HdContainerOfSchemasSchema<HdSampledDataSourceContainerSchema> {
  constructor(container?: HdContainerDataSource | undefined) { super(container, HdSampledDataSourceContainerSchema) }
}

/** schemaTypeDefs.h:61 */
export class HdRenderSettingDescriptorContainerSchema extends HdContainerOfSchemasSchema<HdRenderSettingDescriptorSchema> {
  constructor(container?: HdContainerDataSource | undefined) { super(container, HdRenderSettingDescriptorSchema) }
}

/** schemaTypeDefs.h:65 */
export class HdMaterialConnectionVectorContainerSchema extends HdContainerOfSchemasSchema<HdMaterialConnectionVectorSchema> {
  constructor(container?: HdContainerDataSource | undefined) { super(container, HdMaterialConnectionVectorSchema) }
}
