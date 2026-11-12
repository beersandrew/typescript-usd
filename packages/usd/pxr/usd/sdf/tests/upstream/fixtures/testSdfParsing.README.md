# testSdfParsing.testenv

`testSdfParsing.testenv/` is an unmodified copy of OpenUSD
`pxr/usd/sdf/testenv/testSdfParsing.testenv` at v26.11.1
(commit `96c1989167d2aaab5bd34627f32a321a6b79866b`): the input layers,
`plugInfo.json` (the test's SdfMetadata plugin) and `baseline/`, the layers
OpenUSD itself exported from the inputs. It is used by `../parsing.test.ts`,
the port of `pxr/usd/sdf/testenv/testSdfParsing.py`.

These files are part of OpenUSD, © Pixar, licensed under the Tomorrow Open
Source Technology License 1.0 (see `LICENSE` and `NOTICE` at the repository
root). Some inputs are deliberately malformed (BOMs, bad UTF-8, missing
newlines); copy them byte for byte.

Refresh with:

```sh
rm -rf testSdfParsing.testenv
cp -R "$OPENUSD_SOURCE/pxr/usd/sdf/testenv/testSdfParsing.testenv" .
```
