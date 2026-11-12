// With USD_CHECK_RETURNED_VALUES=1, fail a test when a value handed out by a
// scene-description read changed after it was handed out, in storage that
// freezing cannot protect (see pxr/usd/sdf/src/checkReturnedValues.ts).
import { afterEach } from 'vitest'
import { _sdfCheckTakeMutations } from 'typescript-usd/sdf/_internal'

afterEach(() => {
  const mutations = _sdfCheckTakeMutations()
  if (mutations.length === 0) return
  throw new Error(`a handed-out value was mutated:\n${mutations.map(m => `${m.what}\n${m.stack}`).join('\n\n')}`)
})
