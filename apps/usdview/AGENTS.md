# usdview — operating rules

`apps/usdview` is a browser port of OpenUSD's usdview over the workspace library
(`packages/usd`, consumed as `typescript-usd: workspace:*`). It opens a USD scene,
renders it through the library's UsdImagingGLEngine (UsdImaging → Hydra → Storm →
HgiWebGPU), and offers usdview's inspection, selection and display controls.

- Use an ordinary TypeScript controller and one autonomous Web Component
  (`<usd-viewer>`); no React or other UI framework. Do not use Three.js,
  another USD runtime or native/WebAssembly USD as the rendering implementation.
- The viewer renders only through the library's imaging stack. It owns UI and
  application behaviour; USD semantics and rendering belong in `packages/usd`
  (follow `packages/usd/AGENTS.md` there). Make library changes in the library
  package of this workspace, not as viewer-side workarounds.
- Do not silently pretend unsupported scene features render correctly: diagnose
  them (`src/storm-coverage.ts`).
- Tests of USD behaviour derive expectations from upstream OpenUSD 26.11.1:
  pinned upstream fixtures or captures from the native reference build
  (`FIXTURES.md` at the repository root). Never hand-derive them. Preserve source
  citations when adapting code.
- Keep asset provenance and license (`public/assets/provenance.json`). Renders of
  third-party assets stay local and are never committed.
- Browser checks run in Safari on a Mac. Real-browser runs and jsdom/controller
  tests (`vitest`) are reported separately.
