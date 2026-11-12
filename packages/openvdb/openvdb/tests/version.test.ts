import { describe, it, expect } from 'vitest'
import {
  OPENVDB_LIBRARY_MAJOR_VERSION_NUMBER,
  OPENVDB_LIBRARY_MINOR_VERSION_NUMBER,
} from '../src/index.ts'

// Placeholder until V2 (.vdb archive read) begins; the tracked upstream
// version is recorded in packages/openvdb/PROVENANCE.md.
describe('openvdb version', () => {
  it('tracks upstream OpenVDB 13.0', () => {
    expect(OPENVDB_LIBRARY_MAJOR_VERSION_NUMBER).toBe(13)
    expect(OPENVDB_LIBRARY_MINOR_VERSION_NUMBER).toBe(0)
  })
})
