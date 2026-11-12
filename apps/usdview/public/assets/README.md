# Viewer scene fixtures

Every file here is either authored for this viewer or an unchanged copy of an
OpenUSD 26.11.1 file, all under the Tomorrow Open Source Technology License
1.0; `provenance.json` lists each file's origin and licence, and the SHA-256
and source of each OpenUSD copy. No third-party scene assets are included.
`scenes.json` is the example menu manifest.

`torus.usda`, the page's default scene, is a green wireframe torus: the wireframe
is the geometry (closed linear BasisCurves around and along the tube), so it draws
as a wireframe in every draw mode and in OpenUSD's usdview.

`cube.usda` is a polygon unit cube. `composed_cubes.usda` references it three
times: two visible coloured cubes with different transforms, and one cube
under an invisible parent. This checks application composition and data flow;
it is not an upstream reference image or a Core compliance golden.

Automated tests exercise real Stage composition and Hydra scene-index data
from the workspace library (`packages/usd`). They do not exercise a GPU or establish image
parity.

`previewSurface/` is a local integration fixture from typescript-usd, with native OpenUSD 26.08 data expectations and a generated checker texture. It is not an ASWF asset or a pixel golden.

`materialx/multiUv/` is a library fixture checked against native OpenUSD 26.08, for two independently indexed UV sets and distinct sampler states, with its source and licence beside the assets.

`volumes/` holds the unmodified OpenUSD v26.11.1 `testUsdImagingGLVdbVolume`
fallback-material scene and its three `.vdb` grids, under OpenUSD's licence
(`volumes/OpenUSD-LICENSE.txt`; sources and SHA-256 in
`volumes/provenance.json`). The local root `volumes/vdbVolume.usda` deactivates
the scene's glslfx checkerboard background, which this viewer does not draw.
The density grid in `smoke_000001.vdb` (frame 1) has no active voxels, so
frame 1 draws nothing, as it does in OpenUSD. The volume is drawn with Storm's
fallback volume shader; upstream's baseline images for this scene are in the
library fixture `packages/usd/pxr/usdImaging/usdVolImaging/tests/fixtures/`.
These are not pixel goldens for this viewer.
