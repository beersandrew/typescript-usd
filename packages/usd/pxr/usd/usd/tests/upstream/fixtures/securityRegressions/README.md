# Security regression fixtures

Unmodified copies of the malformed inputs of three OpenUSD v26.11.1
(commit `96c1989167d2aaab5bd34627f32a321a6b79866b`) security regression
tests, kept under their upstream testenv paths:

| File | Upstream test |
| --- | --- |
| `testUsdReadOutOfBounds/corrupt.usd` | `pxr/usd/usd/testenv/testUsdReadOutOfBounds.py` |
| `testUsdUsdcBugGHSA02.testenv/root.usdc` | `pxr/usd/usd/testenv/testUsdUsdcBugGHSA02.cpp` (GHSA-58p5-r2f6-g2cj) |
| `testUsdUsdzBugGHSA01.testenv/root.usdz` | `pxr/usd/usd/testenv/testUsdUsdzBugGHSA01.cpp` (GHSA-4j7j-gm3f-m63w) |

They are used by `../../readOutOfBounds.test.ts`, `../../usdcBugGHSA02.test.ts`
and `../../usdzBugGHSA01.test.ts`, which fail (not skip) when a file is
missing. `expected.json` records what native `Usd.Stage.Open` does with each
file, captured from OpenUSD 26.11.1 (see `FIXTURES.md` at the repository root).

These files are part of OpenUSD, © Pixar, licensed under the Tomorrow Open
Source Technology License 1.0 (see `LICENSE` and `NOTICE` at the repository
root). They are deliberately malformed; copy them byte for byte.

Refresh with:

```sh
for f in testUsdReadOutOfBounds/corrupt.usd \
         testUsdUsdcBugGHSA02.testenv/root.usdc \
         testUsdUsdzBugGHSA01.testenv/root.usdz; do
  cp "$OPENUSD_SOURCE/pxr/usd/usd/testenv/$f" "$f"
done
```
