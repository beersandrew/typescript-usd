# Native composition API repros — resolved

Resolved in the library (`b2dd7b3f`).
The viewer now uses public `Prim.getPrimIndex()` and `PcpLayerStack.getLayerTree()`
with immutable `Sdf.LayerTree`. Root/session trees are separate; layer handles are
weak and tree structure is retained. `capture-cached.py` and `expected-cached.json`
record the native cached/nested tree now used by viewer tests. Expanded-index
fixtures below remain historical reference evidence.

## Original missing API report

# Native composition UI API boundaries

Pinned reference: OpenUSD v26.11.1, `pxr/usdImaging/usdviewq/appController.py:4427–4500`.
The capture (made with the capture tooling kept outside this repository; `FIXTURES.md`)
runs against installed native `(0,26,11)` and writes both an expanded
Pcp graph oracle and the exact native root layer tree.

The viewer's published package currently exposes `Prim.computeExpandedPrimIndex()`
and `PcpNodeRef.getChildren()`, so the new hierarchy uses true Pcp edges and includes
noncontributing nodes. Native usdview instead uses `Prim.GetPrimIndex()`, its cached
index. No public equivalent is exported by the current TypeScript Prim API. The
consumer must not access `_primData` to impersonate that API.

Native also walks `node.layerStack.layerTree.childTrees`. The current public
PcpLayerStack exposes strength-ordered `layers` but no layerTree accessor. The
fixture deliberately contains `root.usda → weak.usda → nested.usda`; the native
`native-layer-tree.json` records this hierarchy. The viewer therefore labels the
layers as an ordered list rather than inventing ancestry from authored sublayer
paths (which would mishandle muting, reordering, expression variables and cycles).

A library follow-up should port public `UsdPrim::GetPrimIndex` and native
`PcpLayerStack::GetLayerTree`/`SdfLayerTree` ownership and construction, with native
fixtures including session sublayers, repeated layers, offsets, muted layers and
session-owner ordering. Acceptance: the native walker and public TypeScript walker
produce the same node/layer parent edges, strength order, paths and spec presence;
retained snapshots remain valid according to native lifetime rules across stage
changes. Library work belongs in a separate typescript-usd worktree, not this viewer.

These gaps remain disclosed. Passing this fixture establishes expanded graph and
layer-list parity, not full native composition-tree parity or whole-USD coverage.
