# TfHash native oracle (OpenUSD 26.11.1)

`expected.json` is produced by a native capture that links the real native
`libusd_tf` / `libusd_arch` and records `TfHash()(value)`,
`TfHash::Combine(...)`, `TfHashCString` and `TfCompressedBits` hashes as 16
hex digits. Its cases include every deterministic value printed by
`pxr/base/tf/testenv/hash.cpp` (Test_TfHash); pointer-valued hashes (TfRefPtr,
TfWeakPtr, TfToken, smart pointers, type_index) depend on process addresses
and are not captured. `hash.test.ts` rebuilds each value from its label.

Native source: OpenUSD v26.11.1 (96c1989167d2aaab5bd34627f32a321a6b79866b).
Captured on macOS arm64, where
`ARCH_CACHE_LINE_SIZE` is 128 (arch/align.h:65); the TfCompressedBits FastHash
patterns use fewer than 16 platforms, so the cache-line cutoff
(compressedBits.h:307-313) does not affect them.

The capture wraps its output in the `{release, commit, script, upstream,
payload}` envelope. The fixture changes only by being recaptured (see the
repository's `FIXTURES.md`).
