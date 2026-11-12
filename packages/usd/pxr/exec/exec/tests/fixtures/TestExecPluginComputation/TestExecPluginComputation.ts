// Port of OpenUSD v26.11.1 pxr/exec/exec/testenv/TestExecPluginComputation.cpp,
// the test plugin library of testExecComputationRegistration. Its plugInfo.json
// is TestExecPluginComputation_plugInfo.json with LibraryPath naming this
// module; the registry imports it when the plugin is loaded.

import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA } from '../../../src/registerSchema.ts'
import { AttributeValue, NamespaceAncestor } from '../../../src/computationBuilders.ts'

// TF_DEFINE_PRIVATE_TOKENS (TestExecPluginComputation.cpp:13-20)
const _tokens = {
  anotherComputation: 'anotherComputation',
  input1: 'input1',
  input2: 'input2',
  myComputation: 'myComputation',
  unregisteredComputation: 'unregisteredComputation',
} as const

EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA('TestExecPluginComputationSchema', (self) => {
  // Register a computation that the test looks for first, causing this plugin
  // to be loaded.
  self.primComputation(_tokens.myComputation)
    .Callback(VtValueTypes.double, () => 42.0)
    .inputs(
      AttributeValue(VtValueTypes.double, _tokens.input1),
      NamespaceAncestor(VtValueTypes.double, _tokens.input2),
    )

  // Register another computation that the test looks for second, after plugin
  // loading has happened
  self.primComputation(_tokens.anotherComputation)
    .Callback(VtValueTypes.double, () => 42.0)
    .inputs(
      AttributeValue(VtValueTypes.double, _tokens.input1),
    )
})

// Register a computation on a different schema, to confirm that the computation
// is defined when we load plugins for the schema above.
//
EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA('TestExecExtraPluginComputationSchema', (self) => {
  self.primComputation(_tokens.myComputation)
    .Callback(VtValueTypes.double, () => 42.0)
})

// Attempt to register a computation for a schema that's already been
// registered.
//
EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA(
  'TestExecComputationRegistrationCustomSchema', (self) => {
    self.primComputation(_tokens.unregisteredComputation)
      .Callback(VtValueTypes.double, () => 42.0)
  })
