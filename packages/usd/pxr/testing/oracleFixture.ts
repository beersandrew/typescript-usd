// Readers for enveloped fixtures captured from native OpenUSD (FIXTURES.md at
// the repository root): a JSON envelope naming the OpenUSD release and commit
// that produced the payload, the capture script (its path in the capture
// tooling, which is kept outside this repository) and the upstream sources it
// cites.
import { readFileSync } from 'node:fs'

export interface OracleEnvelope<T> {
  release: string
  commit: string
  script: string
  upstream: string[]
  payload: T
}

/** The OpenUSD release every fixture is captured from (FIXTURES.md). */
const pin = { release: '26.11.1', commit: '96c1989167d2aaab5bd34627f32a321a6b79866b' } as const

/** The payload of an enveloped fixture, after checking it names the pin. */
export function oraclePayload<T>(fixture: OracleEnvelope<T>, name = fixture.script): T {
  if (fixture.release !== pin.release || fixture.commit !== pin.commit) {
    throw new Error(`${name}: captured with OpenUSD ${fixture.release} (${fixture.commit}), ` +
      `expected ${pin.release} (${pin.commit}); recapture it (FIXTURES.md)`)
  }
  return fixture.payload
}

/** Read an enveloped fixture from disk and return its payload. */
export function readOracleFixture<T = any>(file: string | URL): T {
  return oraclePayload(JSON.parse(readFileSync(file, 'utf8')) as OracleEnvelope<T>, String(file))
}
