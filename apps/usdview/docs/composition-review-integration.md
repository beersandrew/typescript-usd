# Composition review integration

`CompositionReview` owns session-layer review edits only. Native reference is
OpenUSD `v26.11.1` `usdviewq/appController.py` visibility actions and
`usdviewq/common.py` `ResetSessionVisibility` / `InvisRootPrims`. The checked-in
oracle was captured with installed native OpenUSD 26.08 by the capture tooling
kept outside this repository (`FIXTURES.md`); it is not a 26.11 binary capture.

Runtime integration is implemented in `runtime.ts`:

- Create `new CompositionReview(stage, () => currentTime)` when committing a new
  stage; discard it with that stage. `getCompositionState(path)` calls `.state(path)`.
- Serialize `applyCompositionCommand(command)` with stage open, time evaluation,
  display rebuilds, and disposal. Call `.apply(command, candidateRebuild)` and return
  `{tree: rebuiltHierarchy, selection: select(retainedPathOrNull)}` only on success.
- Candidate rebuild must preserve camera pose, use current time, validate textures
  and a GPU draw before swapping the renderer, and dispose candidate resources on
  failure. Permit an empty scene after unloading or hiding. Compare composition
  errors before/after and reject newly introduced failures.
- `.apply` restores session text, load rules, muted layer identifiers and original
  edit target on failure. The renderer hook must not swap a candidate then throw.
  If rollback also fails, an AggregateError reports both failures.
- Retain selected prim when it still exists; otherwise clear selection. Refresh
  camera choices after successful recomposition. UI already refreshes hierarchy,
  selection, camera controls and the composition dialog from the result.
- Runtime must reject overlapping edits even when the dialog is closed. The UI
  serializes its own commands but is not the global scene scheduler.

The Show menu opens the compact review dialog. Variant changes and visibility
opinions are authored into the session layer; payload load rules and muted layers
are stage state. Reset Session Visibility removes only session visibility
attributes, preserving variant selections. Show follows native MakeVisible and
may hide sibling branches when revealing a child beneath an invisible ancestor.
Edits target default time, as native usdview does; the displayed effective
visibility evaluates at the runtime's current time.

Known scope boundaries: single-prim selection; no authored layer-file writes;
no references/payload-arc authoring, layer-stack reorder, variant creation or
session export. Tests cover native visibility/variant/payload outcomes, layer
mute persistence, rollback on rejected candidate validation and dialog failure
handling. Browser validation is tracked by the parent integration session. Runtime integration tests additionally cover current-time sampling, frame rollback, new composition errors, empty variants, selection retention and conflicting scene updates.
