// Port of OpenUSD v26.11.1
// pxr/exec/exec/testenv/TestExecConflictingPluginRegistration1.cpp, a test
// plugin library of testExecComputationRegistration. Its plugInfo.json is
// TestExecConflictingPluginRegistration1_plugInfo.json with LibraryPath
// naming this module.

import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA } from '../../../src/registerSchema.ts'

// Register a computation for a schema that conflicts with a different plugin
// that registers for the same schema.
//
EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA(
  'TestExecConflictingPluginRegistrationSchema', (self) => {
    self.primComputation('conflictingRegistrationComputation')
      .Callback(VtValueTypes.double, () => 42.0)
  })
