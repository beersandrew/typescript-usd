# AOUSD Core 1.1.0

This library is an OpenUSD port. It is also the implementation of the AOUSD
USD Core Specification v1.1.0. One codebase serves both targets. This page
covers:

- how Core compliance is decided;
- what evidence exists;
- where Core and OpenUSD disagree.

## Target

- Specification:
  [USD Core Specification v1.1.0](https://github.com/aousd/specifications-public/blob/83e25aceb11a9340db4778263bda5d5175875f49/core/1.1.0/core_spec.md).
  It is pinned to release tag `core/v1.1.0`, repository commit
  `83e25aceb11a9340db4778263bda5d5175875f49` (document source `e8f44c0`).
  `core_spec.md` has SHA-256
  `cf022c6fb6e1abbd230f3e6e7276a6f91e94c3fc7a24ca70055a84390c77637e`.
  Line numbers on this page refer to that file.
- Scope: the Core libraries (`sdf`, `pcp`, `usd`, `ar` and the base libraries
  they use). Domain schemas, UsdImaging, Hydra, Storm and viewers are outside
  Core. Rendering results are not evidence of Core compliance.
- Core 1.1.0 lists OpenUSD v25.08 as its informative correlation. The
  library itself tracks OpenUSD 26.11.1 (see the README).

## Acceptance rule

Core's normative requirements decide Core questions. Core's applicable
conformance tests decide them too. OpenUSD behaviour alone does not settle a
disagreement with Core.

Upstream OpenUSD remains the default for everything else. That includes
behaviour Core does not specify.

Where the two disagree:

1. Record the disagreement in the table below. Give the exact spec section and
   lines, the test or fixture that shows it, and the behaviour chosen.
2. Only then choose the compatible behaviour. Mark any divergence from upstream
   with a comment at the code site.
3. Don't change library behaviour to make an older golden pass. A golden that
   disagrees with both the pinned spec and OpenUSD is a golden defect.

## Evidence

| Evidence | What it establishes |
|---|---|
| Ported upstream OpenUSD tests and OpenUSD-captured fixtures (see the README) | OpenUSD parity. These are not Core requirements |
| The tests and fixtures cited in the tables below | The recorded Core/OpenUSD questions, each checked against OpenUSD 26.11.1 |

**There is no complete Core 1.1.0 clause inventory, no official Core 1.1
conformance suite, and no Core 1.1.0 compliance claim.**

## Known disagreements

Each row gives the Core section, the evidence for the disagreement, and the
behaviour chosen. "Core = OpenUSD" rows record questions that were checked and
found not to be disagreements, so they are not reopened.

| Topic | Core 1.1.0 | OpenUSD 26.11.1 | Evidence | Chosen behaviour |
|---|---|---|---|---|
| USDA statement separators | [Comments, Complex Whitespace, and Separators](https://github.com/aousd/specifications-public/blob/83e25aceb11a9340db4778263bda5d5175875f49/core/1.1.0/core_spec.md#comments-complex-whitespace-and-separators) (l. 9866-9933), `Sequence<T>` (l. 10084), `PrimItem` in [Prim Specs](https://github.com/aousd/specifications-public/blob/83e25aceb11a9340db4778263bda5d5175875f49/core/1.1.0/core_spec.md#prim-specs-1) (l. 10937-10941). A property or order statement needs a `StatementSeparator` (newline or `;`); a nested prim or variant set needs a newline | Same (`textFileFormatParser.h:264-265, 1559-1603`) | `{ double radius = 2 }`, `double x = 1 double y = 2`, `} def "C" {` and `};` after a nested prim are all rejected by both | **Core = OpenUSD**. Reject. Not a disagreement |
| Specializes combined with variants | [Specializes](https://github.com/aousd/specifications-public/blob/83e25aceb11a9340db4778263bda5d5175875f49/core/1.1.0/core_spec.md#specializes-1), Variants, Computing Variant Selection, Stage population | Same | OpenUSD 26.11.1's `testPcpMuseum_SpecializesAndVariants{,2,3}` baselines, ported in `pxr/usd/pcp/tests/upstream/compositionResults.test.ts`, contribute unopposed opinions through specializes inside variants; the 1.1 rules derive the same opinions | **Core = OpenUSD**. Keep the current behaviour; no library change |
| LZ4 chunk framing | [LZ4 Compression](https://github.com/aousd/specifications-public/blob/83e25aceb11a9340db4778263bda5d5175875f49/core/1.1.0/core_spec.md#lz4-compression) (l. 11584-11598): an 8-byte chunk count. The chunk size is `uint64` in the prose but `uint8` in the table | 1-byte chunk count, then a 4-byte `int32` size per chunk (`tf/fastCompression.cpp:59-73, 95-122`) | Every unchunked crate fixture starts with one zero byte followed by LZ4 data. Ported `fastCompression` tests | OpenUSD framing, which is what existing files use. The spec text is internally inconsistent. Qualify any Core claim until AOUSD clarifies |
| Crate dictionary keys | [Dictionary](https://github.com/aousd/specifications-public/blob/83e25aceb11a9340db4778263bda5d5175875f49/core/1.1.0/core_spec.md#dictionary) (l. 12429): keys are indexes into the TOKENS section | Keys are written as `std::string`, i.e. STRINGS indexes (`crateFile.cpp:1508-1517`) | OpenUSD-written crate files with dictionary values | OpenUSD encoding, for interoperability with existing files |
| Crate PATHS section header | [Paths Section](https://github.com/aousd/specifications-public/blob/83e25aceb11a9340db4778263bda5d5175875f49/core/1.1.0/core_spec.md#paths-section) (l. 11881-11904): one count, then three compressed arrays | Two counts: the total paths (`crateFile.cpp:3144`) and the encoded paths (`:3381`) | Every crate fixture | OpenUSD layout |
| Crate path jump algorithm | [Jump Array](https://github.com/aousd/specifications-public/blob/83e25aceb11a9340db4778263bda5d5175875f49/core/1.1.0/core_spec.md#jump-array) (l. 11929-11984): as written, a zero jump recurses on the same index | A zero jump moves to the next sibling (`crateFile.cpp` `_BuildDecompressedPathsImpl`) | Crate fixtures with zero-jump sibling chains | OpenUSD. The spec algorithm appears defective |
| Repeated spec paths in USDA | [Layer Content](https://github.com/aousd/specifications-public/blob/83e25aceb11a9340db4778263bda5d5175875f49/core/1.1.0/core_spec.md#layer-content) (l. 11235-11258): a repeated spec path is an error and processing stops | Repeated property declarations in one prim are accepted | A prim that declares the same attribute or relationship twice is accepted by OpenUSD 26.11.1 and by this library | OpenUSD (accept). Open question |
| Spline `pre` tangent padding | [Splines](https://github.com/aousd/specifications-public/blob/83e25aceb11a9340db4778263bda5d5175875f49/core/1.1.0/core_spec.md#splines) (l. 10196-10302): `'pre' (InlinePadding)+ SplineTangent`, where `InlinePadding` includes `/* */` comments | `TokenSeparator` requires one space or tab (`textFileFormatParser.h:245-246, 925-929`). `pre/*c*/(6.4, 6.4)` is rejected | OpenUSD 26.11.1 rejects `pre/*this counts as a space*/(6.4, 6.4)` with a parse error, and so does this library. Native check: `pre /*c*/(…)` and `pre (…)` are accepted, `pre/*c*/(…)` is rejected | **Undecided.** The parser follows OpenUSD's `TokenSeparator` and rejects the Core form; a comment at the site (`textFileFormatParser.ts`, knot `pre`/`post`) points here. `pre(6.4, 6.4)`, which both reject, is rejected (fixture `splineTokenSeparator`) |

### Open Core questions

These are open questions in the spec itself, not disagreements with OpenUSD.
They are recorded so nobody "fixes" them by matching one implementation:

- **Spline tangent tuple order.** `(slope, width)` at l. 10610-10614 versus
  Bezier `(width, slope)` at l. 10635-10639.
- **Omitted spline extrapolation.** Core (l. 2146-2161) says it defaults to
  held. OpenUSD and this library also default to held (`TsExtrapolation`).
- **List-op reduction equivalence** (l. 1390-1418, 1486-1497, 1607-1636).
- **USDA decimal `BasePart` ordered choice** (l. 9704-9706) versus the
  required decimal serialization.
- **`color4h` in the semantic alias table** (l. 1146-1161).

## Known library gaps against Core

No open gaps are recorded here right now. That reflects the limits of the
evidence, not completeness: there is no clause-by-clause Core 1.1.0
inventory yet. Three earlier gaps have been fixed, each with OpenUSD-captured
tests:

- **Unknown layer metadata through USDC:** the USDC reader now keeps
  unregistered fields and their stored values, as upstream does
  (`crateData.cpp:830-851`, `crateFile.cpp:1274-1288`); see
  `pxr/usd/sdf/tests/unregisteredCrateRoundtrip.test.ts`.
- **Deferred Tf file writers:** `Write` now copies the caller's bytes; see
  `pxr/base/tf/tests/fixtures/bufferOwnership/`.
- **`test_MultipleClips` pre-time and `crateRelationshipDefault`:** both pass.
