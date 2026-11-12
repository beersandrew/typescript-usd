import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: [
      './pxr/testing/valueEquality.ts',
      // Test-only checking mode for values handed out by reads
      // (pxr/usd/sdf/src/checkReturnedValues.ts).
      ...(process.env.USD_CHECK_RETURNED_VALUES === '1' ? ['./pxr/testing/checkReturnedValues.ts'] : []),
    ],
  },
})
