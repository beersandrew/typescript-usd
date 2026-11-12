# typescript-usd — operating rules

Binding rules for working in this repo — agents and humans alike. What the
project IS (packages, tests, commands) lives in README.md.

## The scope rule (do not break)

**typescript-usd contains only what upstream OpenUSD contains.** Before adding any
API or behavior, locate its counterpart in OpenUSD at the tracked release tag
(`v26.11.1`) and mirror its naming,
semantics, and package placement. If only an *application built on USD* would
have it, it belongs in a consumer repo that installs `typescript-usd` —
log the idea there, never build it here.

Boundary precedents: session layers + edit targets, the SdfLayerStateDelegate
undo *hook*, and variant-selection authoring are IN (they are upstream APIs);
undo/redo *stacks* and UX, transform gizmos, project/document management,
persistence, and collaboration are application concerns — always out.

## Target

This workspace has one branch, `main`. The target is OpenUSD 26.11.1 (tag
`v26.11.1`, commit `96c1989167d2aaab5bd34627f32a321a6b79866b`); the inherited
v26.08 source/test baseline is not target parity. Domain schemas, upstream imaging and OpenExec are in scope here; the
viewer in `apps/usdview` is a consumer of this package. Core conformance and
OpenUSD compatibility are separate test targets of the same library, and Core
normative requirements govern any claim of Core compliance.

## Where expected values come from

- Ports follow the structure of the governing upstream C++ and cite it by
  file:line.
- Expected values in tests come from OpenUSD itself — ported from its testenv
  suites or captured from a real OpenUSD build and committed as fixtures
  (`FIXTURES.md` at the repository root: the capture tooling is kept outside
  this repository). Never hand-derive them, and never edit a captured fixture
  by hand.
- Tests are self-contained: they never run OpenUSD. Conformance against the
  specification is owned by AOUSD's compliance suite; this repository contains
  no AOUSD code and does not duplicate it. Anything that tests the library from
  outside uses only its public API, so a capability it needs belongs in that API.

## Conventions

- Row-vector matrices (v·M); world = local · parentWorld. xformOpOrder
  composes in REVERSE (first listed = outermost).
- Attribute values are Gf values and VtArrays (parserHelpers.ts lists them);
  setters convert plain JS shapes by the attribute's type. Quaternions are
  imaginary-first in crate files and VtArray storage (GfQuat's layout) and
  real-first in USDA and GfQuat constructors.
- Normalize parser value shapes at the flatten boundary (USDA dict vs USDC
  pairs) — silent shape mismatches are this repo's worst historical bug class.
- No comments referencing external projects: code comments cite upstream
  OpenUSD (file:line) and this repo's own files only.

## Tests

- Ported upstream tests live in each library's `tests/upstream/`; typescript-usd's own
  checks live beside them.
- A known gap runs as a PLAIN failing `it()` — no `it.fails`, no `it.skip` of
  real assertions, no denylists. Progress is the failing count going down.
- The one exception is a check the platform rules out (no WebGPU compute under
  Node, no synchronous GPU readback, no shader doubles, ...): it is adapted, or
  skipped only where it cannot run (`it.skipIf`), at a
  `PLATFORM-DIVERGENCE(<id>)` that names where it runs instead (for example a
  Safari image suite). It is not counted as a failure, and a real gap is never
  filed this way.
- **Verification:** run the targeted tests for the library you changed, plus
  `pnpm typecheck`. Know every failure your work causes: never an unnoticed
  regression of a passing test. `pnpm test` runs everything.
- Commit at coherent boundaries. `git status` first and stage exactly your
  files.

## Consumers log, they don't patch

Work done in a repo that *consumes* typescript-usd never edits typescript-usd in place. A
consumer that hits a gap here logs it — an issue with the smallest repro, the
upstream counterpart in OpenUSD's `pxr/` tree, OpenUSD's actual behavior, and
an acceptance criterion — and moves to unblocked work.

## Interim APIs

When the faithful mechanism is bigger than the immediate need, interim
plumbing is allowed ONLY as: (1) never public-surface — if upstream's analog
is private, ours is too, or it's named `_interim_*` and kept out of the
package barrel; (2) retirement tracked by a `FAITHFULNESS-DEBT` comment naming
the end-state; (3) one callsite per consumer, behind the consumer's own seam.
Open debt: `_interim_flushChanges()`, a deprecated one-line alias of the
supported `Stage.flushChanges()`, until consumers migrate. (Async-coalesced
composition — mutate, then `await stage.flushChanges()` — is the INTENDED
web-USD model, not a stopgap toward synchronous change processing.)

## No status prose

Status boards and handoff docs rot. A divergence is tracked by a plain
failing test; an internal stand-in by a self-contained
`// FAITHFULNESS-DEBT(<id>):` comment at the code site naming the upstream
mechanism (file:line) and the faithful replacement. A difference the platform
forces (JavaScript has no pointer identity, `use_count` or shared-memory
threads; GPU readback is asynchronous; there is no OpenGL; WebGPU lacks a
feature) is a `// PLATFORM-DIVERGENCE(<id>):` comment instead: it is
documented, not retired. Use FAITHFULNESS-DEBT whenever a faithful port is
possible in JavaScript and WebGPU. The code comments ARE the queue:
[docs/faithfulness-debt.md](docs/faithfulness-debt.md) is regenerated from
the `FAITHFULNESS-DEBT` and `PLATFORM-DIVERGENCE` comments by the tooling kept
outside this repository (FIXTURES.md), whose check also fails on an id with
no `TAG(<id>): text` definition or a doc citing an id the code no longer has.
Never edit the ledger by hand. Retiring an id means deleting every marker of
it, including references in docs and tests.
