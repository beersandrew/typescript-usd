# Native retained-schema imaging consequences

The capture (made with the capture tooling kept outside this repository; `FIXTURES.md`) compiles a small C++ program against the OpenUSD 26.11.1 reference build and runs the existing `scene.usda` through the actual `UsdImagingCreateSceneIndices` chain. Each session edit is followed by `ApplyPendingUpdates` and notice-batch `Flush`. Expected output is `imaging-expected.json`; it includes applied schemas, computed draw-mode UI values, apply-attribute validity/fallbacks, final prim paths/types, extents and point values. This is native scene-index evidence, not a new graphics/pixel comparison.

The sequence reproduces DrawModeWidget: apply GeomModelAPI and author cards on the child, clear only its session default, then apply the API/author origin on the group and clear only its session default. It intentionally retains the API schema, as native does.

| Operation | Native final geometry below `/World/Group/Model` |
|---|---|
| Initial | `Geom` (`cube`) |
| Child cards | `cardsMesh`, with24 zero-valued points |
| Child X | `Geom` (`cube`) |
| Parent origin | `originCurves`, unit coordinate axes |
| Parent X | `boundsCurves`, with8 zero-valued points |

Initially the group's authored bounds value affects `ComputeModelDrawMode`, but the group has no applied GeomModelAPI and therefore contributes no geomModel imaging data. After parent editing/clearing, that API remains and exposes the original root-layer bounds value to imaging. Returning to the same computed UI token does not restore the initial imaging representation. Requiring the initial image after this sequence would contradict native.

This fixture intentionally has no authored extentsHint on the model. Native produces zero-size cards/bounds too; blank images for those stand-ins are not evidence that the editor failed. The primitive `cube` is subsequently tessellated by the renderer; TypeScript's equivalent ordinary geometry path is the same `Geom` path with a mesh representation.

Sources: native `geomModelAPIAdapter.cpp:58-92`, `flattenedGeomModelDataSourceProvider.cpp:70-118`, `primTreeWidget.py:154-188`. Native usdImagingGL engine defaults to scene-index mode (`engine.cpp:81`), unlike the legacy delegate's separate unapplied-model behavior.

`imaging-expected.json` is recaptured with the capture tooling kept outside this repository (`FIXTURES.md`).
