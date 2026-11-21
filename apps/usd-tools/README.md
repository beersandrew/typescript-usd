# USD tools

OpenUSD's command-line tools as small web pages: choose a sample or open your
own files, set the tool's options, and read what the tool prints. The tools
are TypeScript USD's ports (`packages/usd/pxr/**/bin`), run in the page; files
never leave the device.

Pages: `usdcat/`, `usdzip/`, `usdchecker/`, `usddiff/`, `usdresolve/`, `usdstitch/`, `usdstitchclips/`, `usdfixbrokenpixarschemas/`,
linked from `index.html`. usdedit is left out: it opens a file in a text
editor, which a page would have to be; usddumpcrate and usdauthors too
(diagnostics and credits, not tools for files people bring). usdtree has no
page.

## usdcat: the converter

usdcat's page is a converter between text and binary USD. Drop files on the
yard (or a folder, or tap it to choose) and a black cat, a USD stage of its
own drawn by Storm (`src/cat3d.ts`, `src/cat3d-model.ts`, `src/storm-view.ts`;
a 2D cat where the browser has no WebGPU), moves each file by telekinesis: the
file floats from the Input pile to hover in front of the cat, glowing through
the rainbow while usdcat runs, the cat's eyes cycling with it, and lands on
the Output pile as the other format as soon as usdcat finishes. Only a drop
let go over the yard counts. `.usda` becomes `.usdc`, `.usdc` becomes `.usda`,
a `.usd` is read (its `#usda` or `PXR-USDC` magic) and becomes the other, and
a `.usdz` package's root layer comes out as `.usda`. The Output pile keeps the
newest three results; each one downloads (the share sheet on touch devices) or
opens in TypeScript usdview in a new tab (`?open=handoff`: the page sends the
file to the viewer it opened; usdview is looked for at `../../usdview/` beside
the tool pages, or where `?usdview=` says). Settings holds usdcat's other
options: always .usda / always .usdc, keep a `.usd` file's name
(`--usdFormat`), `--flatten` (with `--mask` and `--skipSourceFileComment`)
and `--flattenLayerStack`; they are remembered in the browser. Each
conversion is a real run, `usdcat [options] -o /out/<n>/<name> <input>`, and
the resolver keeps what it writes under `/out/` in memory. The log under the
yard shows each command, what usdcat printed and how long it took. A dropped
folder converts its root layer (named after the folder, else the shallowest);
the rest of its files are there for what the root references. The page's one
sample, `shapes.usda` (four plain meshes, 5.6 MB of flattened text), is a
chip at the bottom to drag onto the yard or click to download. Motion stops
when the system asks for reduced motion.

    pnpm dev        # http://127.0.0.1:5173
    pnpm build      # dist/, a static folder that works from any path
    pnpm samples    # recopy public/samples from a usd-museum checkout

## usdzip: the pencil case

Drop a USD file or its folder (or choose files, a folder, or a sample): the
files land on a desk, the ones the root layer uses fly into an open pencil
case, the zipper closes, and a tag hangs off it with the .usdz's name and size;
tap it (or the case) to save. Files the root layer does not use stay on the
desk, greyed. The root is the layer named after its folder, else the
shallowest; a menu picks another. Each package is a real run,
`usdzip --asset <root> /out/<n>/<name>.usdz --list -`; the listing is what the
case takes in, in order. The gear has `--checkCompliance`.

usdzip writes through the host filesystem, so the page installs one in memory
(`src/memfs.ts`) with the library's hooks, `_ArSetHostFilesystem`
(ar/_internal) and `_TfSetHostFilesystem` (tf), added for this
(PLATFORM-DIVERGENCE tf-host-filesystem): TfSafeOutputFile and
TfAtomicOfstreamWrapper wrote only through Node's fs before. The page copies a
sample's or the dropped files into it before zipping.

Checked Nov 21 (`scripts/check-usdzip.cjs`, then OpenUSD 26.11.1's
`usdzip --asset` on the same folder): for all five samples the package holds
the same files in the same order with identical contents, and usdzip prints
the same warnings (without the C++ function, file and line). The .usdz bytes
differ only in the zip's file timestamps.

## usdchecker: the inspector

Drop a USD file or its folder (or pick a sample) and its case file lands on
the inspector's bench. He looks it over with his magnifying glass while
usdchecker runs, then brings his stamp down: PASSED, PASSED with warnings, or
FAILED, and his face follows. Each inspection files a report: usdchecker's
printed output read back into one section per variant selection it validated
("As authored", "With wrap = checks on /variants/..."), the findings grouped
by the rule that raised them, each rule with its description from the
validation registry (`ValidationRegistry.getValidatorMetadata(name).doc`) and
its messages. The gear has `--skipVariants`, `--rootPackageOnly`,
`--noAssetChecks` and `--strict`. The scan starts before the run: a run keeps
the page's main thread busy, so the scene must be on screen first.

## usddiff: the owl

Put a USD file in each slot (drop on a slot, drop two at once, tap a slot,
or pick a sample pair) and the owl perched between them looks from one to
the other while usddiff compares them, then closes its eyes contentedly
("Same!") or goes wide-eyed with its tufts up ("6 changes!"). The hunks
usddiff prints are laid out side by side, before on the left and after on
the right, with line numbers and the changed part of each changed line
marked; "Save as .diff" keeps the output. ⇄ swaps the files. The gear has
`--flatten` and `--brief`. usddiff runs with an empty environment, so it
uses its built-in unified diff, and reads its inputs and writes its
temporary usda files through the in-memory filesystem. Sample pairs: the
heath before and after commit 4ffd2bcd (`heath-before.usda`, written by
`scripts/samples.mjs` from git), suitcase A (text, metres) against suitcase B
(binary, centimetres), two forgeries of the variants exhibit, and the heath
against itself.

## usdresolve: the homing pigeon

Pick a sample or drop a folder: its files become a little town of houses
(a street per folder; roofs coloured by kind), and the asset paths a layer
names become letters (its sublayers, payloads, references and asset-valued
attributes, from `UsdUtilsExtractExternalReferences`; "from" picks the
layer). Send a letter, or write an address, and usdresolve resolves it; the
pigeon flies it from the layer's house to the house it resolves to, which
lights up, or loops over town and comes home when it resolves to nothing. A
path inside a package lands on the package. The gear chooses
`--anchorPath <layer>` (as the layer reads the path; the default) or
`--createContextForAsset <root>` (the root layer's folder as the search
path).

## usdstitch and usdstitchclips: the tailor mouse

One module (`src/usdstitch.ts`, `src/mouse.ts`), two pages; the HTML's
`data-mode` picks. Drop files (or pick a sample set) and they become fabric
patches in a row, strongest first for usdstitch, in time order for
usdstitchclips (↑ ↓ reorder, ✕ removes). Sew, and the mouse scurries along
the row sewing a red seam after each patch; the row pulls together into a
quilt (a film strip for clips) and the results hang below as tags to save.
usdstitch makes one layer (`--out`, named in the gear); usdstitchclips makes
the result layer, its topology and its manifest, with `--clipPath` on the
page and `--startTimeCode`, `--endTimeCode`, `--clipSet` and `--noComment`
in the gear. Each run works in `/work/<n>/` on the in-memory filesystem; the
clips are copied there first, as usdstitchclips names them relative to its
result, so the saved files work beside the clips. The clip sample is a
bouncing ball in four clips of 12 frames, generated by `scripts/samples.mjs`.

## usdfixbrokenpixarschemas: the fix-it robot

Drop a USD file or .usdz (or pick a sample) and its part lands on the bench;
the robot tinkers with its wrench (sparks, a busy antenna light) while the
tool runs on a copy in `/work/<n>/`, then gives a thumbs-up with a green
light ("Fixed! 5 changes"), shrugs ("Nothing to fix!") or turns red. What it
changed is shown as usddiff sees it, the backup against the fixed file, side
by side (`src/diffview.ts`, shared with the usddiff page); the problems the
tool's validation still reports are listed; the fixed file hangs as a tag to
save. Samples: the inputs of OpenUSD's own tests for the tool (several
fixes, material bindings in variants, a package of packages, render
settings that need nothing) and the heath (nothing broken). The in-memory
filesystem renames folders too, as the tool's usdz unpacking needs.

## How the pages run the tools

- `src/files.ts`: a resolver (an `ArDefaultResolver` subclass, registered as
  a plugin and chosen with `ArSetPreferredResolver`) that serves the samples
  at `/samples/...` and picked files at `/files/<name>`, and leaves every
  other path, such as plugin resources, to `ArDefaultResolver`.
- `src/plugins.ts`: loads every schema, file-format and shader plugin an
  OpenUSD install registers at startup, so tools keep the fields they define.
- `public/async-context.js`: PLATFORM-DIVERGENCE(usd-tools-single-lane-async-context).
  The tools bind resolver contexts across awaits, which TypeScript USD carries
  with `AsyncContext` (Node: `AsyncLocalStorage`); Safari has neither. A page
  runs one tool at a time, so a single-lane `AsyncContext.Variable` stands in.
  It is a classic script so it runs before the library's modules.
- `src/run-tool.ts` runs a tool one at a time; Tf diagnostics posted during a
  run go to its standard error, as TypeScript USD's printer writes them (the
  commentary, without upstream's C++ function, file and line).
- `src/usdcat.ts`, `src/cat.ts`, `src/usdcat.css`: the usdcat converter and
  its cat (an inline SVG). `src/usdzip.ts`, `src/usdzip.css`: the pencil case.
  `src/usdchecker.ts`, `src/inspector.ts`, `src/usdchecker.css`: the
  inspector. `src/playful.ts`, `src/playful.css` and `src/drop.ts`: what the
  pages share (settings gear, saving, drops and root layers, log).

Open files puts the picked files side by side under `/files/`. Open folder
keeps the folder's layout (`/files/<folder>/...`), so layers find what they
reference in subfolders; the layer named after the folder is chosen first.
Browsers that cannot pick folders (iOS) show only Open files.

## Samples

`public/samples` holds four USD Museum exhibits (CC0 1.0,
`LICENSE-usd-museum.txt`) and the witches' heath from
`packages/usd/examples/stagehand/browser/heath.usda` (this repository's
licence), listed with their source in `manifest.json`. Pixar's Kitchen Set is
not shipped: its USD Asset licence (OpenUSD `docs/dl_license.rst` §3e) forbids
distributing it.

## Checked against OpenUSD

Converter, Nov 21 (`scripts/check-usdcat-converter.cjs`, then OpenUSD
26.11.1's usdcat on what it saved): usdc → usda and a binary `.usd` → usda are
byte-identical to OpenUSD's `usdcat -o`; usda → usdc and a text `.usd` → usdc
read back in OpenUSD identical to the source; `--flatten
--skipSourceFileComment` to usdc reads back identical to OpenUSD's own
flattened usdc. The .usdc bytes are not identical to OpenUSD's (the crate
writer lays the file out differently, 3621 vs 3567 bytes for the heath).

usdchecker, Nov 21 (`scripts/check-usdchecker.cjs`, then OpenUSD 26.11.1's
usdchecker on the same files): on all five samples, with and without
`--skipVariants`, what the page's usdchecker printed is identical to
OpenUSD's apart from anonymous layer ids (`@anon:4:...` against
`@anon:0x106f3a410:...`); the verdicts match (cycles fails with 3 composition
errors, the rest pass).

Fixed on the way (Nov 21): usdchecker reported
`MaterialBindingCollectionValidator.InvalidResourcePath` for every direct
binding to a material inside an instance (1500 on the variants exhibit),
because `UsdSchemaBase.isValid()` asked `stage.has()`, which sees no instance
proxies. It now follows `schemaBase.h:146-150` (a live prim).

usddiff, Nov 21 (`scripts/check-usddiff.cjs`, then OpenUSD 26.11.1's usddiff
on the same files): all four sample pairs print identical output with the
same exit code (1, 1, 1, 0); `--flatten` on the heath and forgeries pairs is
identical; `--brief` differs only in the temporary file names it prints.

usdresolve, Nov 21 (`scripts/check-usdresolve.cjs`, then OpenUSD 26.11.1's
usdresolve with the same arguments): every letter of the formats and variants
exhibits, a missing file, and paths inside a .usdz (`case_c.usdz[case_c.usdc]`,
`[textures/label.png]`) print the same resolved path or the same failure,
with `--anchorPath` and with `--createContextForAsset`.

usdstitch and usdstitchclips, Nov 21 (`scripts/check-usdstitch.cjs`, then
OpenUSD 26.11.1's tools on the same files): the three usdstitch samples and
all three usdstitchclips layers (`--noComment`) are byte-identical to
OpenUSD's.

usdfixbrokenpixarschemas, Nov 21 (`scripts/check-usdfixbrokenpixarschemas.cjs`,
then OpenUSD 26.11.1's tool on copies of the samples): the two fixed .usda
files are byte-identical; the package holds identical files (its zips' time
stamps differ); render settings and the heath are left alone by both, and
the validation errors printed after fixing are the same.

Gaps in the port still open (they show with the TypeScript tools under Node
too):

- UsdStage does not report composition errors as warnings when it opens
  (`usd/stage.cpp:3326` `_ReportErrors`); usdchecker's own composition
  validator does report them.
- `usdcat --flatten` on the cycles exhibit numbers `Flattened_Prototype_1` and
  `_2` the other way round.
