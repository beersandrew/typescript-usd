Locally authored viewer fixture under accompanying OpenUSD license.
A Catmull-Clark control cube and a red DistantLight make refinement and lighting controls visible.
Native OpenUSD 26.08 captures are in tests/fixtures/displaySettings/, captured by the capture tooling kept outside this repository (FIXTURES.md).
No ASWF attribution or pixel-parity claim. High native complexity uses level 2;
the TypeScript uniform refinement path is bounded and does not claim adaptive parity.

The distant light authors normalize=true so intensity3 remains visible independently of its small angular size; native unnormalized distant intensity is scaled by solid angle.
