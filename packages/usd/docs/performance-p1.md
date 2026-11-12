# Performance P1: a TypeScript language-fit map (design notes)

Written as a proposal; the decision and "as built" sections at the end record
what was adopted. The analysis itself changed no library behaviour. It records how upstream OpenUSD 26.11.1 relies on C++ mechanisms
for cost and lifetime, what typescript-usd does today, what that costs on real
assets, and the closest TypeScript mapping that keeps every value seen through
the API unchanged. The changes it proposes (copy-on-write field storage,
explicit disposal, type tables and the rest) were to be made after review,
one at a time, each against the benchmark it should move.

Citations: `upstream/...` is `pxr/...` of OpenUSD 26.11.1 (`$OPENUSD_SOURCE`); other paths are
in this package (`packages/usd/`). Line numbers are at commit e4b3051.

## Benchmarks

The real-asset benchmark, part of the tooling kept outside this repository
(`FIXTURES.md`), times the same three workloads in Node, in Safari and
natively. The workloads are defined once for the Node and Safari halves; the
native half performs the same steps through the C++ API, and both write
their timings into the same output directory.

- **open**: `UsdStage::Open` with all payloads loaded (the default), then a
  `UsdPrimRange` traversal that lists every prim's property names. Each
  measurement is a first open in a fresh process (Node, native) or a fresh
  iframe realm (Safari).
- **playback**: per frame of the stage's time range, read every attribute
  whose `UsdAttributeQuery::ValueMightBeTimeVarying` is true, and compute the
  local-to-world transform of every Xformable whose transform might vary,
  through one `UsdGeomXformCache` per frame. This is the per-frame value work
  of a viewer, without imaging or GPU work. One warm-up pass, then five timed
  passes; the figure is the median pass divided by the frame count.
- **author**: an in-memory stage, 100 Xform prims, each with a `double` and a
  `double3 xformOp:translate` attribute given 1,000 time samples in
  increasing time order (200,000 `UsdAttribute::Set(value, time)` calls).

Assets: CarbonFrameBike (`.usdz`) and the Mini Car Kit `vehicleVariants.usda` and
BrainStem (`.usdz`, UsdSkel animation) from the ASWF assets repository at
091bb5c, and a generated scene (500 animated
Xforms under 10 animated groups, 120 frames, USDA). The runner checks that every
runtime saw the same prim, property, animated-attribute and frame counts as the
native run.

### Results

Machine: Apple M4 Pro, 12 cores, 24 GB, macOS (Darwin 27.2.0). Node v24.7.0;
Safari 27.2 (WebKit 605.1.15); OpenUSD 26.11.1 C++ build (the OpenUSD 26.11.1 reference build,
`-O2` benchmark, TBB from the same build). Library commit e4b3051. Medians:
9 fresh processes per workload in Node and natively, 5 fresh iframe realms in
Safari; playback is the median of 5 passes in each run, divided by the frame
count, then the median over runs. Recorded 2026-11-05 06:12-06:15 UTC on a
shared developer machine with a 1-minute load average of 13-16 (12 cores);
an earlier full run under higher load (16-22) gave the same picture, with
noisier native multi-threaded opens. Safari's `performance.now()` has 1 ms
resolution, so Safari open times of a few ms are coarse. Node reads files
from disk; Safari fetches them from the local server (`Cache-Control:
no-store`); native reads from disk (mmap for USDC). Every runtime reported the
same prim, property, animated-attribute and frame counts.

| Workload | Node (ms) | Safari (ms) | Native, default threads (ms) | Native, 1 thread (ms) | Node / native 1t | Safari / native 1t |
|---|---:|---:|---:|---:|---:|---:|
| First open + traversal, CarbonFrameBike (844 prims, 13276 properties) | 592 | 528 | 124.2 | 129.9 | 4.6x | 4.1x |
| First open + traversal, Vehicle (91 prims, 516 properties) | 34 | 42 | 6.9 | 10.9 | 3.1x | 3.9x |
| First open + traversal, BrainStem (187 prims, 2651 properties) | 29 | 19 | 6.5 | 8.1 | 3.6x | 2.3x |
| First open + traversal, Generated scene (511 prims, 3054 properties) | 129 | 87 | 29.0 | 30.8 | 4.2x | 2.8x |
| Playback per frame, BrainStem (3 animated attributes, 0 varying xforms, 1291 frames) | 0.014 | 0.008 | 0.002 | 0.002 | 6.7x | 3.6x |
| Playback per frame, Generated scene (1010 animated attributes, 510 varying xforms, 120 frames) | 4.996 | 4.617 | 0.572 | 0.571 | 8.7x | 8.1x |
| Author 200,000 time samples | 1210 | 1034 | 148 | 148 | 8.2x | 7.0x |

| Reopen in the same process (Node) | CarbonFrameBike | Vehicle | BrainStem | Generated scene |
|---|---:|---:|---:|---:|
| stage dropped, GC forced | 43.8 ms (root still registered) | 7.9 ms (root still registered) | 9.9 ms (root still registered) | 10.9 ms (root still registered) |
| after `Stage.dispose()`, GC forced | 644.0 ms | 23.6 ms | 14.3 ms | 141.6 ms |
| native, after the stage is released | 119.4 ms | 2.8 ms | 0.7 ms | 22.3 ms |

Ratios use the single-threaded native build, the like-for-like comparison
with a single JavaScript thread. "Root still registered" means `Layer.find`
returned the previous stage's root layer before the reopen (section 3):
those reopens reuse already-parsed layers and are not comparable to native.

Engine features the plan depends on, as reported by the engines: Node 24
has `Float16Array`, `Symbol.dispose` and `using`; Safari 27.2 reports
`Float16Array` but neither `Symbol.dispose` nor `using` syntax.

Raw results (every run) and the Node CPU profiles with their top self-time
lists are kept outside the repository; `run.mjs` writes them to its `--out`
directory (`results.json`, `summary.json`, `profiles/<job>/top.json`).

### Where the Node time goes

Top self-time functions from `node --cpu-prof` (100 µs sampling, one run per
workload, the whole process including module loading; positions mapped to
sources through the bundle's source map):

| Workload | Top self time |
|---|---|
| Open, CarbonFrameBike | Text parser: `rawNumber` 16%, `parseValue` 12%, `validateTextValue` 8%, `inlineGap` 6%, number regular expression 5%, `peek` 3% (`sdf/src/textFileFormatParser.ts`); GC 6% |
| Open, Vehicle / BrainStem | Module compile 20%; GC; Pcp node iteration (`pcp/src/iterator.ts:344`) 7% on BrainStem |
| Open, generated scene | Text parser and value coercion (`rawNumber`, `parsePrimBodyItem`, `sdfCanonicalTextTypeName`, `coerceValueToType`) ~25%; GC 9% |
| Playback, BrainStem | `GfVec` construction 9%, GC 8%, `slerpQuat`/`lerpTyped`/`slerpQuaternion` 15% (quaternion array interpolation) |
| Playback, generated scene | `_transformAttributeValue` (`usd/src/stage.ts:2672`) 17%, GC 9%, `UsdLayerTimeSamples.around` (`usd/src/resolver.ts:139`) 9%, `SdfData._samples` 8%, `usdWithLiveSamples` 8%, `_getView` 4%, `usdResolveAttributeFieldWithSource` 4%, `evaluateXformOps` 3%. Inclusive: `XformCache` path 83% of the playback passes, attribute-query reads 18% |
| Author | `_sdfRegisterMetadataPlugins` (`sdf/src/schema.ts:110`) 13%, GC 5%, `TfNotice.Send` 4%. Inclusive: change block and notice delivery 37%, composed `typeName` per call 28%, stage composition pass per change 22%, plugin metadata re-registration 15%, `SdfPath.fromString` 10% |


## The map

Each entry: what upstream does, what typescript-usd does today, the measured or
expected cost, and the closest faithful TypeScript mapping.

### 1. Values: VtValue copies, VtArray and VtDictionary sharing, SdfData reads

**Upstream.** `SdfData` stores one `VtValue` per field in a small vector per
spec (`upstream/usd/sdf/data.h:157-170`). `SdfData::Get` returns that
`VtValue` by value (`upstream/usd/sdf/data.cpp:204-210`). Copying a `VtValue`
is cheap for every type that matters here:
- small trivially-copyable types (numbers, `GfVec3f`, `TfToken`, `SdfPath`)
  are stored inline (`_UsesLocalStore`, `upstream/base/vt/value.h:141-145`);
- everything else is held through a reference-counted `_Counted<T>`
  (`value.h:98-123`, `_RemoteTypeInfo` `value.h:745-770`), so a copy shares
  the object, and the first mutable access of a shared object copies it
  (`_GetMutableObj`, `value.h:758-762`);
- `VtArray` is itself copy-on-write: `data()` detaches a shared buffer
  (`upstream/base/vt/array.h:403`).

`VtDictionary` is the one exception: copying it copies its map
(`upstream/base/vt/dictionary.h:52-54, 207`), but the map's values are
`VtValue`s and share. Readers inside Usd mostly avoid even the `VtValue` copy:
`UsdAttributeQuery` caches a `UsdResolveInfo`
(`upstream/usd/usd/attributeQuery.cpp:82-88`) and value reads go through
`SdfLayer::QueryTimeSample` into a typed destination
(`UsdStage::_GetValueFromResolveInfoImpl`, `upstream/usd/usd/stage.cpp:7743`);
Pcp reads list ops with typed `HasField(path, field, &out)`
(`upstream/usd/pcp/composeSite.cpp:80, 268`).

**Today.** `SdfData` stores plain JavaScript values in a
`Map<string, SpecData>` with a `Map<string, unknown>` of fields per spec
(`pxr/usd/sdf/src/data.ts:17-22, 92`). `SdfData.get` returns
`sdfCloneValue(stored)` (`data.ts:126-128`), which
(`pxr/usd/sdf/src/abstractData.ts:80-92`):
- shares `VtArray` storage (`VtArray.Clone`), already copy-on-write;
- constructs a new Gf value object per read;
- deep-copies plain arrays, dictionaries (plain objects), `Map`s and `Set`s.

`_getView` (`data.ts:130-132`, `Layer._getFieldView` `layer.ts:806-808`)
returns the stored value without a copy. Today only Pcp's
`pcpReadField` (`pxr/usd/pcp/src/layerStackIdentifier.ts:62`) and the Usd
time-sample reader (`pxr/usd/usd/src/resolver.ts:186-188`) use the views;
everything else calls `Layer.getField` (34 call sites in `stage.ts`, 9 in
`resolver.ts`, 9 in `pcp/src/layerStack.ts`, 40 in `usdGenSchema.ts`).
`VtValue` itself already shares its held object with a share count and
copies on the first mutable access (`pxr/base/vt/src/value.ts:107-144`).

**Measured cost.** Small in these workloads. In the Node CPU profiles,
`sdfCloneValue` (inclusive) is under 1% of the CarbonFrameBike and
generated-scene opens and 1% of BrainStem playback. The earlier borrowed-read and
`VtArray`-sharing work (benchmarks `step3`-`step5` in `bench/results/`) removed
the large copies. Copy-on-write field storage is therefore mainly about
memory and about matching upstream's semantics, not about the open or playback
times in the table.

**Mapping.** Keep `getField` returning a value that the caller can treat as
its own, as upstream's by-value `VtValue` does, but stop paying for it:
1. Store immutable values. Gf values and `VtArray` already have value
   classes; a stored Gf value would be frozen (`Object.freeze`) and returned
   as is, since a frozen object is safe to share. `VtArray` keeps its
   copy-on-write storage. Dictionaries become `VtDictionary` instances with a
   share count like `VtValue`'s (`value.ts:102-144`), so a read shares and the
   first write copies. Plain arrays that are not `VtArray` (list-op item
   lists, token lists in some fields) would be frozen at write time.
2. Make returned typed-array views read-only by construction where possible:
   `Object.freeze` cannot freeze typed-array elements. `VtArray.data()`
   already detaches before handing out its buffer, as upstream's `data()`
   does (`pxr/base/vt/src/array.ts:432`); `cdata()` (`array.ts:437`) hands out
   the shared buffer typed as read-only, which TypeScript checks at compile
   time only, so it is checked in tests (below).
3. Route `getField` through `_getView` once values are immutable, and retire
   the separate view API.

**Finding code that mutates returned values.** Before changing what `get`
returns, run the full suite in a checking mode (an environment switch read
once at module load, off by default):
- `SdfData.get` returns a deep-frozen value instead of a clone (frozen plain
  arrays, dictionaries, Gf values; `Map`/`Set` wrapped in read-only
  proxies). Strict-mode code that writes to it throws `TypeError` at the
  mutation site, with a stack.
- `VtArray` gains a read-only flag set on values handed out by `get`; its
  mutating methods throw when it is set.
- Typed-array buffers handed out are hashed when handed out and re-hashed
  after each test (`afterEach`), reporting any buffer that changed.
Each failure is a call site to fix (copy before editing) before step 3 above.

### 2. Time samples: storage, writes and the in-place branch

**Upstream.** A spec's samples are one `SdfTimeSampleMap`
(`std::map<double, VtValue>`, `upstream/usd/sdf/types.h:282`) held in the
`timeSamples` field's `VtValue`. `SdfData::SetTimeSample` swaps the map out
of the field, inserts with `newSamples[time] = value`, and swaps it back
(`upstream/usd/sdf/data.cpp:478-505`): O(log n), in place when the field's
object is not shared. If any reader holds a `VtValue` copy of the map (from
`Get`), the swap first copies (`_GetMutableObj`), so readers keep a snapshot.
`QueryTimeSample` and the bracketing queries are `std::map` lookups
(`data.cpp:403-414, 446-476`).

**Today.** There is a separate sorted index: the stored field is either a
sorted `[time, value][]` array that `SdfData` owns and edits in place
(`_ownSamples`, `data.ts:283-294`; `_setTimeSample` `data.ts:260-270`: binary
search, then `splice`), or another stored form (the text parser's time-keyed
object, a value given to `set`), indexed once into sorted pairs and cached in
a `WeakMap` keyed by the stored object (`_samples`, `data.ts:210-226`). A
`WeakMap` of value-kind summaries is dropped on each edit (`data.ts:194-204`).
`queryTimeSample` clones the sample (`data.ts:181-186`); `_getTimeSamplesView`
returns the live array (`data.ts:188-190`), which the Usd resolver reads
through `UsdLayerTimeSamples` (`resolver.ts:80-150`) on every value read.
Insertion is O(n) (`splice`), O(log n) in a `std::map`; in-order authoring,
the common case, appends.

**The shelved in-place branch.** `wip/sdfdata-inplace-samples` in an earlier
repository of this port introduced this owned,
in-place sorted array and was shelved as making the Usd oracle tests fail at
random. Re-running the Usd test project six times on each of the two commits
(four in file order, two with `--sequence.shuffle`) did not support that
attribution: 66 failures were identical on both commits in every run, totals
were 69-71 (base) and 68-73 (branch), and every failure that came and went
also came and went on the base commit. The varying failures were (a) tests
that hit vitest's 5 s timeout, the oracle-backed `stagePopulationInteraction`
and `profileProducers` tests, which spawn `usdcat --flatten` and a Node
producer synchronously per test (`packages/pxr/usd/usd/tests/architecture/stagePopulationInteraction.test.ts:47-56`
there), so whether they finish depends on machine load; and (b) a
variant-fallback test that depends on global state left by other tests, which
fails only under shuffling. Statically, the branch could not leak its live
array: `get` deep-cloned, `queryTimeSample` cloned, the other readers copied,
the change records carried no sample values since 3d4c3670, and no cache was
keyed by the samples object. The likely cause of the "random" failures is
therefore timeouts and test-order dependence that predate the branch. The
branch did change one behaviour deterministically: non-finite sample times,
which the old read path dropped, stayed in the owned array (a `NaN` time
breaks the sort order); no test writes such times.

In the current code, the live array reaches two more readers than the shelved
branch had: the Usd resolver, which re-reads it on every call and keeps
nothing between writes (`resolver.ts:94`), and `Layer.eraseField` /
`_primSetField`, which put the stored value uncopied into a change record's
`oldValue` (`pxr/usd/sdf/src/layer.ts:1425-1426, 1636-1637`); that is safe
because the field is erased or replaced, never edited again. A safe in-place
design must keep four rules: public reads return copies or snapshots; any
cache keyed by the array object is cleared on every in-place write (today
`_sampleKinds`, `data.ts:263, 275`); an array handed out uncopied is never
edited again; and non-finite times are handled on write as the read path
handles them. The current `_setTimeSample` (`data.ts:260-270`) has the same
non-finite-time behaviour as the branch, while `sampleEntries` drops such
times when indexing other stored forms (`data.ts:36`); upstream's
`std::map<double, VtValue>` accepts them, so what to do with them should be
captured from the native build before choosing.

**Measured cost.** The authoring benchmark (200,000 samples) takes about 8x
the native time in Node and 7x in Safari. The sample storage is not where it goes: in the profile,
83% of the run is `Attribute.setTimeSample`, of which per-call change
processing (`sdfChangeBlock` → notices → `Stage._handleLayersDidChange` →
a composition pass) is about 37%, resolving the attribute's composed
`typeName` for each call (`Stage._setAttrTimeSample`, `stage.ts:4404-4415`) is
about 28%, and re-registering every plugin's metadata fields on each metadata
type lookup (`syncMetadataPlugins`, `pxr/usd/usd/src/schemaRegistry.ts:127-136`
→ `_sdfRegisterMetadataPlugins`, `pxr/usd/sdf/src/schema.ts:110`) is about
15%. Upstream records a time-sample change as
`SdfChangeList::DidChangeAttributeTimeSamples`
(`upstream/usd/sdf/changeList.cpp:516`), which the stage handles without a
recomposition.

**Mapping.** Keep the owned sorted pairs array: it is the closest
JavaScript structure to `std::map<double, VtValue>` for the access pattern
(append-mostly, binary-search reads), and arrays of pairs are compact in V8.
Give readers upstream's snapshot guarantee explicitly: the field holds a
sample-array owner with a version (or share count); `get('timeSamples')`
and any cached resolve hand out either a copy or a shared, frozen snapshot,
and the owner copies before editing if a snapshot is outstanding (copy on
write), exactly as `_GetMutableObj` does. Separately, cut the per-call costs
above, which are not storage costs: register plugin metadata once per plugin
registration (a revision check against `PlugRegistry`), take the declared
type from the attribute's spec rather than a full composed resolve when the
edit target already has the spec, and process a samples-only change as an
info-only change without a composition pass.

### 3. Lifetime: SdfLayerRefPtr, the layer registry, stages

**Upstream.** Layers are reference counted (`TfRefBase`,
`upstream/base/tf/refBase.h:56`); stages, layer stacks and callers hold
`SdfLayerRefPtr`. The layer registry holds only weak handles
(`upstream/usd/sdf/layerRegistry.h:25-60`). When the last reference goes,
`~SdfLayer` erases the layer from the registry (`upstream/usd/sdf/layer.cpp:266-296`),
so `SdfLayer::Find` returns null and `FindOrOpen` reads the file again.
`~UsdStage` calls `_Close`, which revokes the stage's per-layer notice keys
(`upstream/usd/usd/stage.cpp:923-954`). The notice registry keys per-sender
listeners by the sender's `TfWeakBase*` (`upstream/base/tf/noticeRegistry.h:121-128`),
so it does not keep senders alive.

**Today.** The registry holds `WeakRef`s and erases entries from a
`FinalizationRegistry` callback (`pxr/usd/sdf/src/layerRegistry.ts:42-52,
145-171`): a layer stays registered until the garbage collector reclaims it.
`Stage.dispose()` exists and closes the stage as `_Close` does
(`pxr/usd/usd/src/stage.ts:932-959`); `Layer` has no dispose, and neither
implements `Symbol.dispose`.

Measured: in Node with `--expose-gc`, after a stage is dropped *without*
`dispose()` and garbage is collected, its root layer is still registered
(`Layer.find` returns it) for every asset. The `Stage` object is collected;
the layer is not. A heap snapshot gives the retaining path
`(Stack roots) → module context: containers (Map) → { bySender: Map } → Layer`:
`TfNotice`'s per-sender table is a strong `Map` keyed by the sender
(`pxr/base/tf/src/notice.ts:25-32, 69-83`), and `Stage._registerPerLayerNotices`
registers one listener per used layer with the layer as sender
(`stage.ts:2104-2111`). The listener only revokes itself when a later notice
arrives from that layer after the stage is gone. So every layer used by a
stage that is not disposed stays alive for the life of the page or process.
With `dispose()` the root layer is collected and unregistered. The leak also
acts as an unintended cache: the table's warm reopen is far faster without
`dispose()` than with it, because the layers are not read again.

**Mapping.** Make lifetime explicit, with garbage collection as the fallback:
1. Key `TfNotice`'s per-sender listeners weakly (`WeakMap<object, Deliverer[]>`),
   matching upstream's `TfWeakBase*` keys. This fixes the leak on its own.
2. Count owners the way upstream counts `SdfLayerRefPtr`s: a `Stage`
   acquires its root and session layers, a `PcpLayerStack` acquires its
   layers, and `Layer.findOrOpen`/`open`/`createNew`/`createAnonymous` count
   one acquisition for the caller. `Stage.dispose()`, layer-stack teardown and
   `Layer.dispose()` release. At zero the registry entry is erased at once, as
   `~SdfLayer` does. A caller acquisition that is never disposed is released
   by the existing `WeakRef`/`FinalizationRegistry` path when the `Layer` is
   collected, so garbage collection stays the fallback. One divergence
   remains and should be documented at the site: a caller that holds a
   `Layer` it did not acquire (for example from `stage.getRootLayer()`)
   keeps a usable object after the owners release it, but `Layer.find` no
   longer returns it, where a C++ caller's `SdfLayerRefPtr` would keep it
   registered. Such callers can acquire explicitly.
3. Add `Layer.dispose()` (release a caller's use) and `[Symbol.dispose]` on
   `Layer` and `Stage`, so `using stage = await Stage.open(...)` releases
   deterministically where the engine supports it. Node 24 does; Safari 27.2
   has neither `Symbol.dispose` nor `using` (probed by `browser.ts`), so the
   library must not require them: `dispose()` is the API, and
   `[Symbol.dispose]` is defined only when `Symbol.dispose` exists.

What changes observably: reopening a layer after every owner has released it
gives a fresh layer read from storage, as in C++, where today it returns the
same object, including unsaved edits. Code that relied on that (reopening a
layer that only a disposed stage held, and expecting unsaved edits) changes
behaviour; upstream behaves the new way. Values read through a live stage or
layer do not change.

### 4. VtValue type dispatch

**Upstream.** Each `VtValue` holds one pointer to a static per-type
`_TypeInfo` (`upstream/base/vt/value.h:150`, `_TypeInfoImpl` `value.h:537`,
the `_info` member `value.h:1521`). Copy, destroy, equality, hashing,
streaming, array queries, casts and proxy handling are indirect calls through
that table; there are no type tests on the hot path.

**Today.** Dispatch is by `instanceof`/`typeof` chains in several places that
must agree: `copyHeldValue` (`pxr/base/vt/src/value.ts:34-60`, with a
constructor fallback inside `try`), `castValue` comparing type names as
strings (`value.ts:76-105`), `IsArrayValued`/`GetElementType`
(`value.ts:297-317`), and in Sdf `sdfCloneValue`, `sdfValuesEqual`
(`abstractData.ts:80-135`), `_sdfIsGfValue` (`schema.ts:786-788`) and
`_sdfIsDictionary`. The `VtValue` already carries its `TfType`.

**Measured cost.** Not isolated. These functions are each under 1% in the
profiles of the workloads here. The case for a table is consistency (one
place defines copy, equality, hash, freeze and cast per type, which the
copy-on-write and freezing work above needs) more than speed.

**Mapping.** A `Vt_TypeInfo` record per registered `TfType` (copy, equal,
hash, freeze, isArray, element type, cast targets), reached from the
`VtValue`'s `TfType` in one lookup, and, for the untagged values `SdfData`
stores, from a symbol-keyed property on each value class's prototype
(`GfVec*`, `GfMatrix*`, `GfQuat*`, `VtArray`, `VtDictionary`, the list-op
classes), with `typeof` for primitives. Dispatch then costs one property load
per value, monomorphic per class.

### 5. Paths, tokens and hashing

**Upstream.** `SdfData` is a `TfHashMap<SdfPath, _SpecData>`
(`data.h:164-170`). An `SdfPath` is two handles to interned, pool-allocated
nodes (`upstream/usd/sdf/path.h:1064-1065`); nodes are found or created in
per-parent tables (`_FindOrCreate`, `upstream/usd/sdf/pathNode.cpp:240`), so
equality is a pointer comparison and hashing is O(1) (`path.h:960-966`).
`TfToken` is an interned string with pointer equality
(`upstream/base/tf/token.h:80, 392`); field lookups compare token pointers.

**Today.** Specs are keyed by path string (`data.ts:92`); field names are
strings; `TfToken` is a branded string type with no runtime cost
(`pxr/base/tf/src/token.ts:28-31`). `SdfPath` wraps a `PathNode` chain that is
not interned: `SdfPath.fromString` parses each time (`pxr/usd/sdf/src/path.ts:225-234`)
and `equals` compares strings (`path.ts:1030`). V8 caches a string's hash in
the string, and compares internalized strings by pointer, but path strings
built by concatenation (`${primPath}.${name}`) are fresh strings, so each
`Map` lookup with one hashes and compares characters.

**Measured cost.** `SdfPath.fromString`/`parsePath` is 10% of the authoring
profile; `SdfData._getView` and
`_samples` (path-string `Map` lookups per read) are 5-7% of playback.

**Mapping.** Intern `PathNode`s in per-parent child tables, as
`Sdf_PathNode` does, and cache `SdfPath` objects per node, so equality and
`Map` keys use object identity. Key `SdfData` by the interned node internally
while the public `Layer` API keeps accepting path strings (one string-to-node
lookup at the boundary, cached for repeated strings). Interned nodes need a
release policy; the closest mapping to upstream's refcounted nodes is a
`WeakRef`-valued child table with `FinalizationRegistry` cleanup, which only
matters for long sessions that create many transient paths. Tokens stay
branded strings: JavaScript already interns string literals, which covers
field names.

### 6. 64-bit integers, unsigned types, half floats

**Upstream.** `int64_t`/`uint64_t` and `GfHalf` (`upstream/base/gf/half.h:26`)
are held exactly.

**Today.** `int64`/`uint64` scalars are `bigint` from the text parser and
crate reader (`pxr/usd/sdf/src/parserHelpers.ts:26, 160`;
`pxr/usd/sdf/src/crateFile.ts:92-99, 215, 247`), arrays use
`BigInt64Array`/`BigUint64Array` (`pxr/base/vt/src/array.ts:135`), but
`VtValue`'s numeric cast table bounds `int64`/`uint64` to
`Number.MAX_SAFE_INTEGER` and works on `number`s (`value.ts:65-67, 88`), so
casts disagree with stored values beyond 2^53. Half scalars are JavaScript
numbers rounded once to binary16 (`pxr/base/gf/src/half.ts:8-16`); half arrays
keep binary16 bits in `Uint16Array` (`crateFile.ts:293`) and decode per
element.

**Cost.** `bigint` arithmetic allocates, but 64-bit values are rare in scene
data; no workload here exercises them. Per-element half decoding costs only
on reads of half arrays.

**Mapping.** Keep `bigint` for 64-bit scalars and the `BigInt64Array`
family for arrays (exact, as upstream); make `VtValue` casts to and from
`int64`/`uint64` use `bigint` with the full range. Use `Float16Array` for
half arrays where the engine has it (Node 24 and Safari 27.2 both do), with
the `Uint16Array` bits as the fallback.

### 7. Threads and Work

**Upstream.** Work is spread over TBB threads: prim indexing
(`PcpCache::ComputePrimIndexesInParallel` and `Pcp_ParallelIndexer`,
`upstream/usd/pcp/cache.cpp:1398, 1670`), stage population
(`_ComposeSubtreesInParallel`, `upstream/usd/usd/stage.cpp:3405`), crate
reading (`upstream/usd/sdf/crateFile.cpp:1005, 3852-4049`,
`crateData.cpp:783`) and stage teardown (`stage.cpp:940-954`), all through
`WorkParallelForN`/`WorkDispatcher` (`upstream/base/work/loops.h:165`).

**Today.** Single-threaded; `Stage.open` is `async` so layer reads can
overlap I/O.

**Measured.** The native build was run with its default thread count (12)
and with `PXR_WORK_THREAD_LIMIT=1`. Threads give at most
1.6x on the first opens (Vehicle 6.9 ms against 10.9 ms); playback and authoring do not change.
The single-threaded native build is still 3-9x faster than either JavaScript
engine, so threading is not what mainly separates the runtimes.

**Mapping.** Concurrency for I/O (issue all of a layer stack's sublayer and
reference reads before awaiting any) is the useful part, and costs nothing in
fidelity. Workers fit decoding that produces transferable buffers
(USDC decompression and array decoding, USDA tokenizing), not composition:
Pcp's graphs are object graphs that cannot be shared across Workers without
serialization. Not recommended until a profile shows decode time dominating
an open.

### 8. Other hot spots the profiles show

- **`UsdGeomXformCache` does not cache its `XformQuery`.** Upstream builds
  one `UsdGeomXformable::XformQuery` (a `UsdAttributeQuery` per op) per cache
  entry (`upstream/usd/usdGeom/xformCache.cpp:89`,
  `upstream/usd/usdGeom/xformable.h:353-435`). Here
  `getLocalTransformation`/`_getCtm` call `evaluateXformOps(prim, time)`
  (`pxr/usd/usdGeom/src/xformCache.ts:88-93, 178-183`;
  `pxr/usd/usdGeom/src/xformable.ts:264`), which resolves `xformOpOrder` and
  every op attribute through a full composed resolve on every call. In the
  generated scene's playback profile this is about 83% of the playback passes;
  the attribute-query reads are the other 18%. Done in `613353ac` (step 2):
  each entry now holds its `XformQuery` (`performance-viewer.md`, "the
  XformQuery path", November 9, 2026).
- **Per-resolve result copies.** Each attribute resolve spreads the resolve
  result into a new object and attaches a live-sample getter with
  `Object.defineProperty` (`stage.ts:2668-2715`, `resolver.ts:189-197`):
  about 20% of the same profile, all under the uncached xform path.
- **Per-read sample windows.** `UsdAttributeQuery.get` builds a window of up
  to four `[time, value]` pairs per read (`resolver.ts:134-150`) after a
  path-string lookup of the samples (`data.ts:210`): about 15% of that
  profile. Upstream brackets the `std::map` and interpolates two values
  (`upstream/usd/usd/interpolators.cpp`).
- **Array interpolation allocates per element.** Interpolating a quaternion
  array reads each element into a new `GfQuatf` and slerps it
  (`pxr/base/vt/src/array.ts:108`, `pxr/usd/usd/src/interpolators.ts:176`):
  about a quarter of BrainStem playback self time is `GfVec`/`GfQuat` construction
  and slerp. Upstream loops over the arrays' storage in place
  (`upstream/usd/usd/interpolators.cpp:76-104`).
- **USDA parsing.** CarbonFrameBike's open is mostly the text parser:
  `rawNumber`, `parseValue`, `validateTextValue` and a regular-expression
  check per number (`pxr/usd/sdf/src/textFileFormatParser.ts:82, 497-530,
  675`) are about 35% of that profile's self time.
- **`TfDictionaryLessThan`** encodes both strings to UTF-8 on each comparison
  (`pxr/base/tf/src/stringUtils.ts:65-68`) when sorting property names. An ASCII fast path gives the same
  order.
- **Authoring**: per-call change processing, composed `typeName` resolution
  and plugin metadata re-registration, described in section 2.

## Recommended order

Each step is a separate change, landed only if the full test suite and the
oracle captures are unchanged, and recorded with the real-asset benchmark
before and after. "Moves" names the benchmark row it should change.

| # | Change | Moves | Expected | Risk |
|---|---|---|---|---|
| 1 | `TfNotice` keys per-sender listeners weakly (section 3, step 1) | open, warm reopen without `dispose()` | Root layer no longer registered after the stage is collected; memory of closed scenes is reclaimed. Warm reopen without `dispose()` becomes a real reopen (slower, as native) | Low. Matches upstream's `TfWeakBase*` keys |
| 2 | Port `UsdGeomXformable::XformQuery` and cache it per `XformCache` entry (section 8) | playback, generated scene | Removes the ~83% of the playback pass spent re-resolving xform ops; the remaining cost is the query reads | Low. Same values; covered by xform tests and oracle captures |
| 3 | Attribute value path: no per-resolve object spread or `defineProperty`; bracket and interpolate from the layer's sample array without building a window (section 8) | playback, both assets | Most of the remaining per-read allocation | Low to medium: many resolve-result consumers |
| 4 | Interpolate numeric and quaternion arrays over typed storage (section 8) | playback, BrainStem | Removes per-element Gf allocation (about a quarter of the profile's self time) | Low |
| 5 | Authoring: register plugin metadata once per plugin registration; take the declared type from the spec; handle samples-only changes without a composition pass (section 2) | author | The three items are ~80% of the authoring profile | Medium: change processing must keep upstream's notices and invalidation |
| 6 | `Layer.dispose()`, `[Symbol.dispose]` on `Layer` and `Stage`, owner counts released by `Stage.dispose()` (section 3, steps 2-3) | warm reopen with `dispose()` | Deterministic release, as upstream; reopen reads afresh | Medium: observable change for code that reopened a layer only a disposed stage held |
| 7 | Checking mode that freezes returned values and hashes handed-out buffers; fix every mutation site it finds (section 1) | none (test-only) | Prerequisite for 8 | Low |
| 8 | Copy-on-write snapshots for `timeSamples`; immutable stored values; `getField` without copies (sections 1-2) | author, memory; open marginally | `sdfCloneValue` is under 1% of open/playback today, so the gain is mostly memory and upstream semantics | Medium to high: aliasing bugs are what broke the in-place branch; step 7 first |
| 9 | `Vt_TypeInfo` table for copy/equal/hash/freeze/cast (section 4) | none directly | Consistency for 7-8; small speed change | Low to medium |
| 10 | Text parser number scanning without a per-number regular expression; ASCII fast path in `TfDictionaryLessThan` (section 8) | open, CarbonFrameBike | Bike open is ~35% text parsing | Low; parser has upstream parsing tests |
| 11 | Interned `SdfPath` nodes; node-keyed `SdfData` behind the string API (section 5) | open (all), author | `SdfPath.fromString` is 10% of the author profile | High: pervasive |
| 12 | `int64`/`uint64` casts on `bigint`; `Float16Array` half arrays (section 6) | none here | Correctness for values beyond 2^53 | Low |
| 13 | I/O concurrency for layer-stack reads; Workers for decode only if a profile shows decode dominating (section 7) | open, many-layer assets | Depends on transport latency | Medium for Workers; not recommended now |

## Decision: copy-on-write, option A (November 5, 2026)

Step 8 goes straight to upstream's end state: `VtArray` and `VtDictionary` are
copy-on-write (shared storage, detached on first write through their API), and
values handed out by reads are read-only (frozen or read-only views); callers
copy explicitly or write through the API to change a value, as `const` does in
C++. There is no intermediate copy-at-the-boundary stage.

**Baseline for comparison:** `main` at `378824f` is the last commit
before copy-on-write. Any behaviour or performance difference found later is
compared and bisected against it.

### Step 8 as built

- **`VtArray`** (`pxr/base/vt/src/array.ts`) was already copy-on-write
  (shared storage with a share count, foreign `FromBuffer` storage, detach on
  first write). A frozen array (`Object.freeze`) is now the `const` array:
  every mutating method (`set`, `push_back`, `resize`, `insert`, `erase`,
  `assign`, `clear`, `reserve`, `swap`, `data()`, `MakeUnique()`) throws a
  `TypeError`; the non-const accessors (`get`, `begin`, `rbegin`, ...) act as
  their const counterparts; `Clone()` and `slice()` give writable arrays.
  `cdata()` is the shared storage: element storage (strings, tokens, ...)
  is frozen once it is shared, so a write throws; typed storage is typed
  `Vt_ReadonlyTypedBuffer`, a typed array without element writes or
  `set`/`fill`/`copyWithin`/`sort`/`reverse`/`subarray`, checked by the
  compiler. A run-time read-only typed array was rejected: a `Proxy` is not
  an `ArrayBufferView` (WebGPU `writeBuffer`, `TypedArray.set` and
  structured clone reject it or take a slow path) and costs a trap per
  element in the interpolation loops; immutable `ArrayBuffer`s
  (`transferToImmutable`) are not in Node 24. The checking mode below covers
  typed storage at run time in the test suite.
- **`VtDictionary`** (`pxr/base/vt/src/dictionary.ts`) is copy-on-write over
  its map: a copy shares the map and a share count; a write, or a non-const
  access that hands out an entry's `VtValue` (`get`, iteration), copies it
  first. A frozen dictionary is read-only.
- **Storage** (`pxr/usd/sdf/src/data.ts`, `immutableValue.ts`): `SdfData`
  copies a value when it is stored (`sdfStoredValue`; a frozen value is
  shared as it is) and hands it out without a copy, deep-frozen. Freezing
  happens on the first hand-out, not when the value is stored: freezing every
  value as the text parser stores it cost about 10% of the generated scene's
  open in Node, mostly values that are never read. Owned time-sample pairs
  are frozen when a read hands them out, and the next sample edit copies them
  (`_ownSamples`), as `SdfData::SetTimeSample` copies a shared map. Stored
  `Map`/`Set` values (which cannot be frozen) are copied on hand-out, as
  before.
- **Reads** hand out read-only values: `SdfData.get`/`queryTimeSample`,
  `Layer.getField`, `getFieldDictValueByKey`, `queryTimeSample`, and the Usd
  attribute (`getValue`, `getValueAtTime`, `getDefaultValue`,
  `getFallbackValue`, `getField`), `AttributeQuery.get`, prim/property/stage
  `getMetadata` reads, and the values of the maps `getAllMetadata`/
  `getAllAuthoredMetadata` return (the maps themselves are the caller's, as
  upstream returns them by value). The Usd resolver and interpolators no
  longer copy stored values (`resolver.ts`, `interpolators.ts`,
  `stage.ts` flatten metadata).
- **Checking mode** (`USD_CHECK_RETURNED_VALUES=1`,
  `pxr/usd/sdf/src/checkReturnedValues.ts`): freezing is the normal
  behaviour now; the mode keeps what freezing cannot protect (typed storage,
  `Map`, `Set`, compared after each test) and freezes the internal
  uncloned views (`_getView`, `_getTimeSamplesView`), so library code that
  edits stored values through them throws in the suite.
- **Call sites.** Under the step-7 mode the suite found the three UsdMtlx
  reader sites and two test sites already fixed in step 7; with the freezing
  made normal, the library suite, the checking-mode suite and the viewer's
  tests found no further library or viewer call site that edits a returned
  value. Three tests that asserted the old copy-at-the-boundary contract now
  assert upstream's (`sdf/tests/upstream/data.test.ts`,
  `usd/tests/architecture/timeSampleReads.test.ts`,
  `sdf/tests/architecture/valueModel.test.ts`); new tests:
  `usd/tests/architecture/readOnlyValues.test.ts`,
  `vt/tests/architecture/copyOnWrite.test.ts`.

**Measured** (November 5, 2026, same machine as above, shared with other
work: 1-minute load average 13-55 on 12 cores, so single figures move by
10-20% between runs). Baseline `378824f` against step 8 (`b8cb604`), Node
bundles run alternately, base then step 8, nine times each (medians); Safari through `run.mjs`, five fresh realms each, one
after the other; native unchanged (single-threaded:
bike 125.3 ms, generated-scene playback 0.609 ms/frame, author 138 ms).

| Workload | Node base | Node step 8 | Safari base | Safari step 8 |
|---|---:|---:|---:|---:|
| Open + traversal, CarbonFrameBike (ms) | 1394* | 1272* | 481 | 478 |
| Open + traversal, Vehicle (ms) | 93* | 85* | 39 | 40 |
| Open + traversal, BrainStem (ms) | 54* | 55* | 17 | 19 |
| Open + traversal, generated scene (ms) | 222* | 168* | 92 | 91 |
| Playback, BrainStem (ms/frame) | 0.0033 | 0.0034 | 0.0039 | 0.0031 |
| Playback, generated scene (ms/frame) | 1.29 | 1.20 | 1.08 | 0.88 |
| Author 200,000 samples (ms) | 715 | 730 | 528 | 508 |
| Heap after open, CarbonFrameBike (MB) | 49.4 | 49.4 | | |

\* measured during a load spike; `run.mjs` medians a few minutes apart gave
bike 687/702, Vehicle 36/40, BrainStem 29/29, generated scene 137/135 ms.

No workload moved beyond the run-to-run noise, and the heap after opening is
the same to 0.1 MB: storage holds one copy of each value before and after
(reads used to make short-lived copies, which the open profiles show as
under 1%, section 1). The difference is semantic: reads no longer copy, and a
value read can no longer be changed in place. The viewer's asset-acceptance
renders (hdStWgsl, Safari, one run each) are pixel-identical to the
baseline's for the 22 assets that render; the four `features` assets that
fail to open (curves, subdiv_refined, volumes, vdb_volume) fail the same way
at the baseline.
