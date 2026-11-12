# Vt hash native oracle (OpenUSD 26.11.1)

`expected.json` is produced by a native capture that links the real native
`libusd_vt` / `libusd_gf` / `libusd_tf` and records `VtValue::GetHash()` for
held scalars, Gf vectors/matrices/quaternions and VtArrays, and
`hash_value(VtDictionary)`, as 16 hex digits. `hash.test.ts` rebuilds each
value from its label.

Native source: OpenUSD v26.11.1 (96c1989167d2aaab5bd34627f32a321a6b79866b).
Captured on macOS arm64.

The capture wraps its output in the `{release, commit, script, upstream,
payload}` envelope. The fixture changes only by being recaptured (see the
repository's `FIXTURES.md`).
