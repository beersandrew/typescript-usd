# Stagehand on OpenExec (W13 spike)

Our own schema, not an upstream port: a witch's robe that OpenExec computes
from its recipe, registered the way OpenUSD's execGeom registers
UsdGeomXformable, so the design can move to C++ and swift-usd unchanged.

- `resources/`: the codeless schema (`schema.usda` → `generatedSchema.usda`,
  `plugInfo.json`) from usdGenSchema 26.11. StagehandRevolveAPI,
  StagehandNoiseAPI, StagehandSpinAPI and a typed Beat.
- `revolve.ts`: `computePoints`, `computeFaceVertexCounts` and
  `computeFaceVertexIndices` for StagehandRevolveAPI.
- `revolve.test.ts`: ask OpenExec for the robe, edit only the profile, ask
  again (computed once per change, cached otherwise); a time-sampled profile
  follows `changeTime`; the schema's fallback (16 segments) applies.

- `imaging.ts`: `StagehandRevolvePrimAdapter`, a usdExecImaging prim adapter
  that serves the computed points (`primvars/points`) and topology
  (`mesh/topology`) to Hydra. It is registered for the applied
  StagehandRevolveAPI through the interim hook in usdExecImaging's
  adapterRegistry.ts (`FAITHFULNESS-DEBT(usdexecimaging-plugin-adapters)`:
  upstream hard-codes its adapters and plans plugin registration). The hook
  layers it over the typed adapter, so the Mesh keeps execGeom's transform.
- `imaging.test.ts`: the exec stage scene index merged in front of the stage
  scene index, as UsdImagingGLEngine does. Without exec the robe has no points;
  with it Hydra gets 144 points and 120 quads, the recomputed robe after a
  recipe edit, and a cauldron that grows as the time changes.
- `plugin.ts`: registers `resources/` with PlugRegistry (Node).

Run: `npx vitest run examples/stagehand` in `packages/usd`.

## In typescript-usdview

`browser/` makes Stagehand a runtime plugin for the viewer: `plugInfo.json`
(the schema types, `Exec` metadata naming StagehandStagehandRevolveAPI, and
`LibraryPath: stagehand.js`), `entry.ts` (imports `revolve.ts` and
`imaging.ts`), `build.mjs` (esbuild; typescript-usd imports stay bare for the
page's import map) and `heath.usda` (three robes and a cauldron stored only as
recipes; the First Witch's robe and the cauldron are animated recipes).

    node examples/stagehand/browser/build.mjs <viewer dist>/plugins/stagehand
    <viewer>/index.html?plugin=plugins/stagehand/plugInfo.json&scene=plugins/stagehand/heath.usda&env=USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX%3D1

`check.mjs ROOT OUT` serves such a folder, opens it in Safari, sets frames 0,
24 and 48 through the TypeScript interpreter and saves stage view images.

Transforms in `heath.usda` are `xformOp:transform`: with exec imaging on,
execGeom's computeLocalToWorldTransform reads only that op (upstream, 26.11).
