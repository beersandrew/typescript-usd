# ArchHash native oracle (OpenUSD 26.11.1)

`expected.json` is produced by a native capture that links the real native
`libusd_arch` and records `ArchHash` (32-bit) and `ArchHash64`, unseeded and
seeded, over a fixed 320-byte buffer (stored in the JSON) at every length
0..300 from byte offsets 0 and 3, plus a few UTF-8 strings. The lengths cross
SpookyHash's 16-byte, 32-byte, 96-byte-block and 192-byte Short/long
thresholds (arch/hash.cpp:313-475).

Native source: OpenUSD v26.11.1 (96c1989167d2aaab5bd34627f32a321a6b79866b).
Captured on macOS arm64 (little-endian).

The capture wraps its output in the `{release, commit, script, upstream,
payload}` envelope. The fixture changes only by being recaptured (see the
repository's `FIXTURES.md`).

SpookyHash is Bob Jenkins' public-domain code as embedded in OpenUSD's
`arch/hash.cpp`; the captured values are native OpenUSD output.
