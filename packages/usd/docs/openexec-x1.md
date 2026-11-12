# OpenExec X-1: a faithful TypeScript OpenExec (design notes)

Written November 6, 2026 as the plan for the port, against OpenUSD 26.11.1 (commit 96c19891).
Section 9 records the decisions as built; section 11 records what the first slice ported.

## Summary

- OpenExec (`pxr/exec`) is a computation engine: schemas publish
  *computations*, OpenExec compiles a composed stage plus those definitions
  into a vectorized data-flow network (Vdf), schedules a request against it and
  evaluates it with caching and invalidation. It is 8 libraries and about 113k
  upstream lines (code without comments: about 60k).
- In 26.11.1 exactly one imaging path consumes it:
  `USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX=1` (default off,
  `usdImagingGL/engine.cpp:100-105`) makes `UsdImagingGLEngine` merge a
  `UsdExecImaging_StageSceneIndex` over the usdImaging scene
  (`engine.cpp:1680-1770`). That scene index gives every `UsdGeomXformable`
  prim an `xform` whose matrix is OpenExec's `computeLocalToWorldTransform`
  with `resetXformStack = true` (`usdExecImaging/geomXformablePrimAdapter.cpp`),
  and every `ExecIrXformable` prim the value of `posed:space`. This is exactly
  what makes a controller-driven spotlight rig aim in `usdrecord`: the SpotRig's
  `xformOp:transform` has a connection to `Controller.out:space`, which only
  OpenExec follows. Without exec, UsdGeom keeps the authored matrix, aimed at
  the WRONG sign.
- The JS mapping of upstream threading is upstream's own single-threaded
  configuration: `VDF_ENABLE_PARALLEL_EVALUATION_ENGINE=0` selects
  `EfPageCacheExecutor<VdfPullBasedExecutorEngine, VdfDataManagerVector>`
  (`exec/runtime.cpp:38-64`), and the scheduler then skips task-graph
  generation (`vdf/scheduler.cpp:2686-2689`). Compilation is a
  continuation-passing task system on a `WorkDispatcher`; a FIFO dispatcher
  drained by `Wait()` runs it unchanged.
- The spotlight-rig path (slice S1) is the include closure of
  `execUsd/system.cpp`, `execGeom/xformable.cpp`,
  `execIr/fkControllerComputations.cpp` and `exec/runtime.cpp`, minus the
  parallel and speculation engines, graphers and execution stats: 209 units
  (a `.h`/`.cpp` pair is one unit), about 61k upstream lines, 34k of them code.
  Most of that is vdf (31.7k lines). The rest of upstream (switch controller,
  joint scope, inversion, parallel engine, graphers, stats, diagnostics) is
  later work or out of scope (section 7).
- Recommendation: port S1 in the order of section 7, the way imaging I-1 was
  done: one file per upstream file, with citations. Gate every library on its
  ported upstream tests. Then port usdExecImaging (1.9k lines) and the
  engine hunk, so the viewer draws what `usdrecord` draws when the env setting
  is on.

## 1. What OpenExec is in 26.11.1

`pxr/exec/README.md`: "OpenExec supports efficient computation of values that
are derived from data encoded in USD scenes. Computational behaviors can be
published for USD schemas." `exec/docs/executionSystemDesign.md` describes
three phases, each amortizing the next:

1. **Compilation** (`exec/compiler.cpp`, `exec/*CompilationTask.cpp`,
   `exec/program.cpp`): leaf value keys → input resolution through the scene
   (`exec/inputResolver.cpp`) → output-providing tasks that create one
   `VdfNode` per (provider, computation) and connect the nodes. The product is
   an `Exec_Program`: a `VdfNetwork`, the leaf-node cache, the compiled-output
   cache, the uncompilation table and per-node recompilation info.
2. **Scheduling** (`vdf/scheduler.cpp`): a `VdfRequest` (masked leaf outputs)
   → `VdfSchedule` (the nodes to run, request/affects/keep masks, buffer
   passing, pass-throughs).
3. **Evaluation** (`vdf/pullBasedExecutorEngine.h`, `ef/pageCache*`): pull
   from the requested outputs, stop at cache hits, run node callbacks
   (`VdfContext`), cache results in the executor data manager and, for
   time-dependent values, in the page cache keyed by `EfTime`.

Invalidation is incremental. Time changes (`ExecSystem::_ChangeTime`), authored
value changes (`Exec_Program::InvalidateAttributeAuthoredValues`) and metadata
changes only invalidate values. Resyncs uncompile network pieces
(`exec/uncompiler.cpp`) and recompile inputs (`exec/inputRecompilationTask.cpp`).
Requests receive invalidation callbacks (`exec/requestImpl.cpp`).

### 1.1 Libraries and dependencies (CMake LIBRARIES, `pxr/tests/architecture/libraryGraph.json`)

| Library | Lines (raw / code) | Depends on (pxr) | Role |
|---|---|---|---|
| vdf | 59,802 / ~32k | arch gf tf trace vt work | network, nodes, masks, vectors, schedules, executors |
| ef | 7,490 / ~4k | vdf arch tf trace usd work | time, leaf nodes, page cache, page-cache executor, dependency caches |
| esf | 2,347 / ~1.3k | arch sdf tf vt usd | abstract scene interface (stage, prim, attribute, journal, edit reasons) |
| esfUsd | 3,990 / ~2.3k | esf + usd | esf over a UsdStage, connection tables, change notices |
| exec | 20,707 / ~11k | ef esf tf trace ts sdf usd vdf vt | definitions, builders, compiler, program, runtime, system, requests |
| execUsd | 8,035 / ~1.1k code + docs | esf esfUsd exec ... | public entry: ExecUsdSystem, ExecUsdRequest, ExecUsdValueKey, ExecUsdCacheView |
| execGeom | 934 | gf tf execUsd usdGeom | `computeLocalToWorldTransform` for UsdGeomXformable |
| execIr | 10,392 | execGeom execUsd gf sdf tf usd vt | invertible-rig schemas: IrController, IrFkController, IrSwitchController, IrXformable, IrJointScope |
| usdExecImaging (usdImaging) | 2,013 | execGeom execIr execUsd hd ... usdImaging | exec stage scene index for UsdImagingGLEngine |

`pxr/base/work` (dispatcher, loops, thread limits) is not in typescript-usd
yet; vdf, ef and exec need a subset (section 5).

### 1.2 Public API surface

- `ExecUsdSystem(stage)` (`execUsd/system.h`): `ChangeTime(UsdTimeCode)`,
  `BuildRequest(vector<ExecUsdValueKey>, valueCallback, timeCallback)`,
  `PrepareRequest`, `Compute(request) -> ExecUsdCacheView`,
  `ComputeWithOverrides(request, ExecUsdValueOverrideVector)`. It derives from
  `ExecSystem` (`exec/system.h`), which owns `Exec_Program`, `Exec_Runtime` and
  `Exec_RequestTracker`. It listens to `UsdNotice::ObjectsChanged` through
  `EsfUsdStageData` (`execUsd/system.cpp:30-60`).
- `ExecUsdValueKey` (`execUsd/valueKey.h`): (UsdAttribute | UsdPrim, computation
  token); `ExecUsdRequest` (move-only handle; `IsValid`);
  `ExecUsdCacheView::Get(index) -> VtValue` (`execUsd/cacheView.h`).
- Builtin computations (`exec/builtinComputations.h`): `computeValue`,
  `computeTime`, `computeResolvedValue`, `computeMetadata`, ... .
- Computation definition language (`exec/computationBuilders.h`, 2,106 lines):
  `EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA(Schema) { self.PrimComputation(name)
  .Callback<T>(fn).Inputs(AttributeValue<T>(attr), NamespaceAncestor<T>(comp),
  Prim().Computation<T>(...), Attribute(name).Computation<T>(...), ...); }`
  plus `AttributeComputation`, `AttributeExpression`, `DispatchedPrimComputation`,
  `Constant`, `Metadata`, `Relationship().Targeted...`, `IncomingConnections`
  and others. Callbacks receive a `VdfContext` (`vdf/context.h`):
  `GetInputValue<T>`, `GetInputValuePtr<T>`, `SetOutput`, `SetEmptyOutput`,
  `SetOutputToReferenceInput`.
- Value types used in exec networks must be registered with
  `ExecTypeRegistry::RegisterType(fallback)` (`exec/typeRegistry.h`), which
  also registers `VdfExecutionTypeRegistry`.

### 1.3 Plugin registration

A library that defines computations declares the schemas in `plugInfo.json`
under `"Exec": {"Schemas": {"UsdGeomXformable": {"allowsPluginComputations":
true}, ...}}` (`execGeom/plugInfo.json`, `execIr/plugInfo.json`).
`Exec_PluginData` (`exec/pluginData.cpp:25-160`) reads that metadata from every
`PlugRegistry` plugin. When the definition registry first needs a schema's
computations, it calls `plugin->Load()` (`pluginData.cpp:42-52`). Loading runs
the library's `TF_REGISTRY_FUNCTION(ExecDefinitionRegistryTag)` blocks, which
`EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA` expands to (`exec/registerSchema.h`).
In typescript-usd, `PlugPlugin.Load()` is synchronous only for loaded plugins
(`base/plug/src/plugin.ts:60-71`), and `LoadAsync` imports the module. Exec's
lazy synchronous load therefore has to become "load the Exec plugins before
compiling" (decision D4).

### 1.4 Who consumes it

- **usdImaging**: only `UsdImagingGLEngine`, behind
  `USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX` (default false). The engine
  finds `UsdExecImaging_StageSceneIndex` through
  `PlugRegistry::FindDerivedTypeByName` and its TfType factory
  (`engine.cpp:1722-1745`; `usdExecImaging/stageSceneIndex.cpp:15-28`,
  `usdExecImaging/plugInfo.json`). It merges that scene index above the
  usdImaging stage scene index, inside a notice-batching scene index
  (`engine.cpp:1746-1770`). `SetTime` refreshes the exec request and sends
  dirty notices (`engine.cpp:516`, `stageSceneIndex.cpp:60-70`).
  `ApplyPendingUpdates` runs before notices flush (`engine.cpp:2566`). The
  adapter registry (`usdExecImaging/adapterRegistry.cpp:22-46`) is hard-coded:
  UsdGeomXformable (unless `USDEXECIMAGING_ENABLE_USDGEOM_XFORMABLE_ADAPTER=0`)
  and ExecIrXformable. Nothing else in usdImaging, hdSt or usdview uses exec.
  The OpenExec demo (`extras/exec/examples/irExample`) is a usdview Python
  plugin over ExecIr.
- **Consequence**: with the env setting on, every Xformable draws from
  `xformOp:transform` only. execGeom ignores other ops
  (`execGeom/xformable.cpp:44-55`; adapterRegistry's env-setting doc). The
  A scene that relies on other ops must author its placement as an
  `xformOp:transform`. A faithful viewer has the same behaviour and must
  draw the same wrong placement for other ops when the setting is on.
- **usdrecord**: `UsdAppUtilsFrameRecorder` drives `UsdImagingGLEngine`, so
  the env setting is the whole switch. Native exec renders need the first
  frame rendered twice, because of a native HdxSimpleLightTask camera
  verification on the first exec frame.

## 2. The use case: a controller-driven spotlight rig (execIr)

A `Spotlight/Controller` prim is
an `IrFkController` with `in:tx/ty/tz` = the spot position and `in:rx/ry` time-sampled
every 2 frames (a baked aim at a target). `SpotRig`'s single
`xformOp:transform` keeps an authored matrix aimed at the WRONG sign and
has a connection to `Controller.out:space`. `WrongSign` is connected the same
way to `SignController`, which parks it at y = -3 under the stage.

The computation chain natively:
`computeLocalToWorldTransform(SpotRig)` (execGeom) ← inputs
`AttributeValue<GfMatrix4d>("xformOp:transform")` (whose `computeValue`
follows the attribute connection, `exec/builtinAttributeComputations.cpp`,
`exec/inputResolver.cpp`) ← `out:space` attribute expression
(`execIr/controllerBuilder.h`) ← the controller's private `forwardCompute`
prim computation (`execIr/fkControllerComputations.cpp`,
`execIr/utils.cpp` `ExecIr_UtilsCompute`) ← `in:*` attribute values (time
dependent through `EfTimeInputNode` / attribute input nodes) — and
`NamespaceAncestor<GfMatrix4d>(computeLocalToWorldTransform)` for the parent.

## 3. Test bar

### 3.1 The upstream-test rule applied

All upstream exec tests are C++ testenv programs with TF_AXIOM expectations
written in the test source. Every one of them is also built and installed in
the OpenUSD 26.11.1 reference build's `tests/` and passes there. They qualify when they exercise code
on the spotlight-rig/viewer path:

| Qualifies (port with the library) | Out of scope, reason |
|---|---|
| vdf: testVdfBasic, Mask, Vector, ConnectorMap, CountingIterator, DefaultInitAllocator, DynamicTopologicalSorter, Edit, ExecutionTypeRegistry, Grapher, HardToReach, IndexedWeights, InputValuesPointer, IsolatedSubnetwork, IteratorRange, Iterators, PoolChainIndexer, ReadWriteAccessor, ReadWriteIterator, ReorderConnections, Request, SparseInputPathFinder, SubrangeView, Traversal | testVdfMaskThreading, NetworkThreading, ParallelExecutorDataVector, Speculation: threads or the parallel/speculation engines (not on the JS path). testVdfExecutionStats: diagnostics tooling (later, optional). *_Perf: timing only |
| ef: testEfTime, LeafNodeCache, DependencyCache | — |
| esf: testEsfEditReason, FixedSizePolymorphicHolder (layout test; port its observable part) | — |
| esfUsd: testEsfUsdSceneObjects, ConnectionTables, ConnectionTablesStochastic | — |
| exec: testExecTypeRegistration, InputResolver, ComputationRegistration, UncompilationTable (+ TestExecPluginComputation plugins) | TestExecConflictingPluginRegistration*: needs two shared-library plugins; port when plugin loading is decided (D4) |
| execUsd: all 21 non-perf tests | testExecUsdRecompilation_Perf |
| execGeom: testExecGeomXformable | testExecGeomXformable_Perf |
| execIr: testExecIrFkController, Controller, JointScope, SwitchController, SwitchCompensation | python bindings (wrap*.cpp): none tested in testenv |
| extras/exec/examples: testComputingValuesExample, testDefiningComputationsExample (end-to-end ExecUsdSystem requests) | testSwitchCompensation (extras/exec/examples/irExample): a Python test of the irExampleAuthoringCode C++ library through its Python bindings, and the irExampleUsdviewPlugin is a Python usdview plugin; Python-only, not on our path |

These tests check behaviour, not just values, and their values were written
by upstream. They need no oracle captures. Native captures (made against the
OpenUSD 26.11.1 reference build by the capture tooling kept outside this
repository; `FIXTURES.md`) are used for
any value a ported test prints instead of asserting.

## 4. Port conventions (binding for every exec file)

1. **Layout**: `packages/usd/pxr/exec/<lib>/src/<upstreamBasename>.ts`, one TS
   file per upstream `.h`/`.cpp` pair (inline-only headers too). Tests go in
   `pxr/exec/<lib>/tests/upstream/<testName>.test.ts`; fixtures in
   `pxr/exec/<lib>/tests/fixtures/`. Each library has `src/index.ts` and a
   package entry `typescript-usd/<lib>`. Cross-library imports use the
   package entry (enforced by `pxr/tests/architecture/libraryLayering.test.ts`,
   whose `libraryOf` learns the `exec` group). Imports within a library are
   relative.
2. **Names**: upstream class, function, enum and method names verbatim,
   PascalCase methods (`VdfNetwork.GetNode`), as in `base/tf`, `base/plug`
   and `imaging/hd`. Private members keep upstream's `_name`. Each file header
   cites its upstream files; non-trivial functions cite `file:line`.
3. **Scene types**: TfToken is `string` (as in hd/usdImaging). SdfPath is
   the `SdfPath` class (`typescript-usd/sdf`); hash keys use its path string.
   Gf values are the `Gf*` classes. Values crossing VtValue use `VtValue` with
   the TfType names of `base/vt/src/types.ts` (`GfMatrix4d`, `double`, `token`,
   ...).
4. **Templates**: C++ `T` becomes a runtime `TfType` argument where upstream
   dispatches on type (`VdfVector`, `VdfExecutionTypeRegistry`,
   `ExecTypeRegistry`, `GetInputValue<T>`). `VdfTypedVector<GfMatrix4d>` is
   `VdfTypedVector(GfMatrix4dType)` and so on. TS generics carry the static
   type.
5. **Value semantics**: C++ value types (VdfMask, EfTime, Exec_OutputKey,
   VdfMaskedOutput, ...) are immutable after construction, or copied
   explicitly where upstream copies and then mutates. A C++ map or set keyed
   by a value type is a JS Map keyed by a documented canonical key string or
   number.
6. **Out-parameters**: containers are passed and mutated. A scalar or value
   out-parameter becomes a return value (a tuple when the function already
   returns something), documented at the site.
7. **Threading** (section 5): WorkDispatcher, WorkParallelForN,
   WorkWithScopedDispatcher, WorkWithScopedParallelism and
   WorkGetConcurrencyLimit come from the `work` library port. tbb concurrent
   containers become Map/Set/Array; atomics become plain fields; mutexes are
   dropped (single-threaded), with no comment needed beyond the file header.
8. **Memory management**: allocators, pools, `TfAutoMallocTag`, explicit
   `delete` and `Clear()` for memory release are kept only where they are
   observable. Ownership becomes GC; an upstream "delete" that has observable
   effects (network removal, executor `ClearData`) is kept.
9. **Diagnostics**: `TF_CODING_ERROR`, `TF_RUNTIME_ERROR`, `TF_WARN` and
   `TF_VERIFY` map to `TfDiagnosticMgr` posts with upstream's messages.
   TF_AXIOM and TF_FATAL_ERROR throw.
10. **Not ported**: an upstream branch whose code is not ported posts a
    coding error naming the upstream file:line, then throws. It never returns
    a default value. Every such site carries a
    `// FAITHFULNESS-DEBT(openexec-<id>):` comment.
11. **Tests**: each ported upstream test keeps its function names as `it()`
    names and its expectations verbatim. A known gap is a plain failing
    `it()`.

### 4.1 Mapping rules for C++ constructs (binding)

These rules keep separately ported files compatible. Each one is decided
once here.

- **Ids**: `VdfIndex`, `VdfVersion` and `VdfId` are `number`.
  `VdfId = version * 2**32 + index`, with the helpers upstream has
  (`VdfNode.GetIndexFromId`, `GetVersionFromId`, `VdfOutput` likewise). Versions
  stay below 2**21, so ids are exact doubles.
- **Value-type template parameters**: when callers write `T` explicitly, the TS
  method takes a `TfType` as its first parameter, mirroring the template
  argument list. Examples: `ctx.GetInputValue<T>(name)` →
  `ctx.GetInputValue<T>(type, name)`, `VdfTypedVector<T>(v)` →
  `new VdfTypedVector<T>(type, v)`, `vec.GetReadAccessor<T>()` →
  `vec.GetReadAccessor<T>(type)`, `vec.Holds<T>()` → `vec.Holds(type)`,
  `VdfExecutionTypeRegistry::GetFallback<T>()` → `GetFallback<T>(type)`. When
  C++ deduces `T` from an argument (`ctx.SetOutput(value)`), TS takes only the
  argument and gets the type from context, here the output spec. Typed
  accesses check the held type and post a coding error on mismatch, as
  upstream's `_CheckType` does.
- **TfType identity**: builtins use `VtValueTypes` from
  `typescript-usd/vt` (`double`, `int`, `float`, `bool`, `token` for TfToken,
  `string`, `GfMatrix4d`, `GfVec3d`, ...). Every other C++ type is named by its
  C++ class name with `TfType.Define('<Name>')` in the TS file that ports the
  class, exported as `<Name>Type` (for example `EfTimeType`,
  `VdfIndexedWeightsType`, `ExecIrResultType`, `SdfPathType`).
- **Operators** (as `TfCompressedBits` spells them): `==` `Equals`, `!=`
  `NotEquals`, `<` `LessThan`, `&`/`&=` `And`/`AndAssign`, `|`/`|=`
  `Or`/`OrAssign`, `^`/`^=` `Xor`/`XorAssign`, `-`/`-=`
  `Subtract`/`SubtractAssign`, `~` `Complement` (mutating where upstream's
  method is), `[]` `Get(i)` and `Set(i, v)`, explicit `operator bool` `AsBool()`,
  hash `GetHash(): number`. Copy constructor: a `constructor(rhs)` overload or
  `Clone()`. Assignment: `Assign(rhs)`. Move: `MoveAssign(rhs)`, or `Swap`.
- **Iterators**: C++ iterator classes keep their names and get
  `IsAtEnd()`, `Increment()` (`operator++`, returns this), `Deref()`
  (`operator*`) and `Equals()`. Range classes are also JS iterables.
- **Pointers**: a nullable `T*` is `T | null`; references are `T`. Pointer keys
  (`VdfNode*`, `VdfOutput*`, `VdfInput*`) are object keys of a JS Map or Set.
  Value keys use a canonical string from a function named at the map's
  declaration.
- **Virtuals**: abstract classes and methods; `IsA<T>()` and `dynamic_cast` are
  `instanceof`.
- **Callbacks**: `VdfCallbackNodeFn = (context: VdfContext) => void`; debug-name
  callbacks are `() => string`.
- **Dropped**: `TRACE_FUNCTION*`, `TfAutoMallocTag*`, `TF_MALLOC_TAG_NEW`,
  `ARCH_LIKELY`, prefetch and alignment hints, allocator and pool classes
  that have no observable behaviour. Memory-usage estimators keep their
  upstream structure where a test reads them. Otherwise they carry a
  `FAITHFULNESS-DEBT` comment.
- **Diagnostics**: `TF_CODING_ERROR`, `TF_RUNTIME_ERROR`, `TF_WARN`,
  `TF_STATUS`, `TF_VERIFY(cond, 'expression text', message?)`, `TF_AXIOM`,
  `TF_DEV_AXIOM` and `TF_FATAL_ERROR` from `typescript-usd/tf` (ported
  from `tf/diagnostic.h`). `TF_DEBUG` codes go through `TfDebug`.

## 5. Threading in JS

| Upstream | Single-threaded TS (faithful to upstream's serial configuration) |
|---|---|
| `VDF_ENABLE_PARALLEL_EVALUATION_ENGINE` (vdf/types.cpp, default true) | Setting kept. TS default **false** (D1): the parallel engine is not ported; asking for it fails loudly |
| `EfPageCacheExecutor<VdfParallelExecutorEngine, VdfParallelDataManagerVector>` | not ported (FAITHFULNESS-DEBT) |
| `EfPageCacheExecutor<VdfPullBasedExecutorEngine, VdfDataManagerVector<Background>>` | ported; background deallocation becomes immediate |
| `VdfScheduler::_ScheduleTaskGraph` (parallel only) | not called when the setting is false; not ported |
| `WorkDispatcher::Run/Wait`, `WorkWithScopedDispatcher` | FIFO queue drained by `Wait()` (compilation tasks re-enqueue themselves through the task syncs, `exec/compilerTaskSyncBase.cpp`) |
| `WorkParallelForN(n, fn)` | `fn(0, n)` (upstream's own serial path when concurrency is 1) |
| `WorkWithScopedParallelism(fn)` | `fn()` |
| `Exec_TaskCycleDetector` busy counts | kept: cycles are tasks that are still blocked when the queue drains |

The result is deterministic, and its evaluation order is the one native gets
with `VDF_ENABLE_PARALLEL_EVALUATION_ENGINE=0`. Captures record both native
settings so that any order-dependent difference shows up.

## 6. Slice S1: what the spotlight rig needs

S1 is the closure above, single-threaded. In upstream order:

1. **work** (subset): dispatcher, loops, withScopedParallelism, threadLimits.
2. **vdf core**: masks; vectors and their five storage impls; specs; network,
   node, input, output, connection; context and iterators; request; schedule
   and scheduler (without task graphs); executor interface; data managers
   (vector, hash table); pull-based engine; simple, sub and dataless
   executors; executor invalidator; traversers; isolated subnetwork.
3. **ef**: time, time interval, time input node, leaf node and caches, vector
   key, page cache, page cache storage, commit request, page-cache-based
   executor, masked sub-executor, output value cache, dependency cache, lofted
   output set.
4. **esf, esfUsd**: scene interfaces, journals and edit reasons; the UsdStage
   adapter, stage data and change listener.
5. **exec**: types, type registry, value key, builtin computations,
   computation definitions and builders, definition registry, plugin data,
   input keys and resolution, output keys, compiled caches, program, compiler
   and compilation tasks, cycle detection, interrupt state, node types
   (attribute input, callback, constant, metadata), runtime, system, change
   processor, request impl and tracker, cache view, uncompilation and
   recompilation (program and system include them).
6. **execUsd**: system, request, value key, cache view.
7. **execGeom**: tokens, xformable registration.
8. **execIr**: tokens, schemas (Controller, FkController, Xformable; generated
   classes via `scripts/usdGenSchema.mjs`), types, computations tokens,
   controllerBuilder, utils, fkController computations, xformable
   computations.
9. **usdExecImaging** and the `UsdImagingGLEngine` hunk
   (`_CreateExecSceneIndices`, `SetTime`/`SetStage`/`ApplyPendingUpdates`
   calls).

Later (not needed by the spotlight rig): execIr switchController and jointScope
computations, inversion exercised (ComputeWithOverrides is in S1 because
system.cpp includes it), vdf parallel engine and parallel data managers,
speculation, dotGrapher/grapher, execution stats, exec systemDiagnostics.

## 7. Files, upstream line counts, porting order

Totals per library and status (raw lines including comments). A unit is a
header/cpp pair. The order follows the include graph, leaves first.

| Library | S1 units | S1 lines (code) | Later units | Later lines |
|---|---|---|---|---|
| vdf | 98 | 31,657 (17,108) | 36 | 16,930 (parallel, speculation, graphers, stats, testUtils) |
| ef | 17 | 6,082 (3,312) | 2 | 243 (firstValidInputValue, testUtils) |
| esf | 11 | 1,877 (1,016) | 0 | 0 |
| esfUsd | 9 | 2,120 (1,375) | 0 | 0 |
| exec | 58 | 16,913 (9,279) | 1 | 96 (systemDiagnostics) |
| execUsd | 7 | 1,079 (624) | 0 | 0 |
| execGeom | 2 | 103 (57) | 0 | 0 |
| execIr | 7 | 2,424 (1,320) | 7 | 3,485 (switch controller, joint scope and their computations) |
| usdExecImaging | 15 | 2,013 (about 1,200 code) | 0 | 0 |

The per-file list is the appendix (generated by
`scratchpad/release/openexec/tools/order.py` over the upstream tree).

## 8. Risks

1. **Size.** S1 is about 34k lines of upstream code. vdf alone is half of it,
   with dense template machinery: `VdfVector` storage impls, the iterators, a
   2,977-line scheduler and a 1,179-line pull engine. A port that drops a
   storage impl or a scheduler pass changes observable behaviour (sharing,
   compression, keep masks, buffer passing) that the vdf tests check.
2. **Template-to-runtime typing.** Exec dispatches on C++ types in many places
   (`VdfVector`, the type dispatch tables, `GetInputValue<T>`). A wrong TfType
   mapping fails silently in TS unless every typed access checks the held
   type. Every `VdfVector` access checks it, as upstream's debug build does.
3. **Plugin loading.** Exec loads plugins synchronously and lazily, and the
   web loads asynchronously (D4).
4. **Concurrent-edit surface.** Parallel tracks edit usdImagingGL/engine.ts
   and the libraryLayering test. The exec hunks there are small and listed.
5. **Usd API gaps.** esfUsd needs `UsdAttributeQuery`, connection
   introspection, `UsdPrimTypeInfo`, schema `IsA` for typed schemas defined in
   exec (IrFkController) and `UsdNotice::ObjectsChanged` changed-field
   details. Gaps are logged as failing tests.
6. **Imaging behaviour change.** Under the exec scene index every Xformable
   draws from `xformOp:transform` only. That is upstream behaviour, and it is
   why the setting stays default-off.
7. **Native first-frame quirk** (HdxSimpleLightTask camera verification): the
   native references work around it, and the viewer must not "fix" it.

## 9. Decisions (November 7, 2026, as built)

All five are approved as described and implemented: one-thread engine only (D1),
S1 including recompilation (D2), the `?env=` URL setting as the viewer switch (D3),
the interim async plugin load (D4), and generated execIr schemas (D5).

- **D1. Parallel engine.** Keep `VDF_ENABLE_PARALLEL_EVALUATION_ENGINE` with
  TS default false (upstream default true), and do not port the parallel and
  speculation engines (about 5k lines) until there is a threading model (Web
  Workers + SharedArrayBuffer is not a faithful map of TBB). Asking for them
  fails loudly. Native captures are checked under both settings.
- **D2. Scope of S1.** The spotlight-rig path is about 209 units. Port S1 whole,
  including uncompilation and recompilation (program and system use them),
  before usdExecImaging. The alternative is to gate resync handling as a
  loud failure and land usdExecImaging earlier. The recommendation is S1
  whole, because otherwise the first USD edit breaks a viewer session.
- **D3. Exec in the viewer.** Expose the engine's env setting to the viewer
  as the `?env=` URL setting, or as a viewer option.
- **D4. Plugin loading.** Exec calls `PlugPlugin::Load()` lazily during
  compilation. Proposal: `ExecUsdSystem` construction stays synchronous, and
  callers `await` the Exec plugins' `LoadAsync()` first (one
  `ExecLoadPluginsAsync()`-style call on the registry, interim and
  non-public). A compile that meets an unloaded Exec plugin posts a coding
  error and fails loudly.
- **D5. Where execIr's schema lives.** Upstream generates ExecIr schema classes
  in pxr/exec/execIr. Proposal: generate them there with
  `scripts/usdGenSchema.mjs` and register the plugin like the usd domain
  schemas.

## 10. FAITHFULNESS-DEBT list (initial)

- `openexec-parallel`: vdf parallel executor engine, parallel data managers,
  parallel task sync and waitlist, `VdfScheduler::_ScheduleTaskGraph`.
- `openexec-speculation`: speculation executors and nodes.
- `openexec-grapher`: dotGrapher/grapher (debug output). Closed November 7:
  ported (section 11).
- `openexec-stats`: VdfExecutionStats and its processors.
- `openexec-plugin-load`: synchronous lazy plugin load (D4).
- `openexec-background-dealloc`: `VdfDataManagerDeallocationMode::Background`
  frees immediately.

## 11. Slice S1: status (November 7, 2026)

S1 is ported in full, together with usdExecImaging, the engine hunk and a
viewer switch. End-to-end value coverage of S1 through `ExecUsdSystem`:
every registered execUsd, execGeom and execIr test is ported (19 + 1 + 5,
none of them `_Perf`), and so are the two registered exec examples,
`extras/exec/examples/computingValues` (testComputingValuesExample:
`computeLocalToWorldTransform` through the execGeom plugin) and
`definingComputations` (testDefiningComputationsExample: a plugin schema's
prim computations). Both are under `pxr/exec/execUsd/tests/upstream`; the
coverage script (tooling kept outside this repository) only looks at port
files under each library's own directory, so it does not count these two.
`testSwitchCompensation` (extras/exec/examples/irExample) is out of scope:
it is a Python test of a C++ library through its Python bindings.

| Library | TS lines (src) | Upstream units | Upstream tests ported |
|---|---|---|---|
| work (subset) | 188 | dispatcher, loops, threadLimits, withScopedParallelism | own controller test |
| vdf | 23,784 | the 98 S1 units plus simpleExecutor, readWrite/masked/weighted iterators, extensibleNode, inputValuesPointer, allocateBoxedValue, subrangeView, sparse path finder, parallel data manager vector (the simple executor's data manager), testUtils, grapher, grapherOptions and dotGrapher | 24 |
| ef | 4,351 | all 19 | 3 |
| esf / esfUsd | 1,164 / 1,742 | all | 2 / 3 |
| exec | 11,533 | all 59 | 4 (+3 test plugins) |
| execUsd | 760 | all | 19 (not _Perf) + 2 examples |
| execGeom | 142 | all | 1 |
| execIr | 2,658 | all (schemas via usdGenSchema.mjs, computations by hand) | 5 |
| usdExecImaging | 1,356 | all 15 | none upstream; controller tests |

**Grapher (November 7).** `vdf/grapher`, `grapherOptions` and `dotGrapher`
are ported unit for unit. `VdfGrapher::GraphToFile` writes with node:fs
where the host has a file system and posts a runtime error where it has
none (a browser). JS objects have no address: `_FormatAddress` prints a
distinct stable `0x` number per node, input and output, which is all the
upstream `normalizeDotFiles.py` scripts leave. `Exec_Program::GraphNetwork`,
`ExecSystem::Diagnostics::GraphNetwork`, `VdfContext::CodingError` and
`VDF_FATAL_ERROR` now graph as upstream does (the last two write a
neighborhood graph to a temporary file). Tests: testVdfGrapher (9 baselines)
is ported; testExecUsdRecompilation, testExecUsdUncompilation,
testExecUsdConstantInput (its testenv's own normalizer, which also drops
constant node indices) and testExecGeomXformable (now with its
`DIFF_COMPARE testCompiler.out`) match the upstream baselines.

**Typed metadata (November 7).** The typed reads upstream esfUsd calls are
ported into the library where upstream has them:
- `SdfFieldDefinition.getTypedFallbackValue()` is
  `FieldDefinition::GetFallbackValue()` (schema.cpp:88-92) as a VtValue
  holding the registered C++ fallback type (`_RegisterStandardFields`,
  schema.cpp:734-863; plugin fields per `_GetDefaultMetadataValue`,
  schema.cpp:1658-1730). `pxr/usd/sdf/tests/schemaFieldTypes.test.ts`
  checks every field against the native build
  (`fixtures/schemaFieldTypes`, oracle capture).
- `Prim/Attribute/UsdRel.getMetadata(key, value: VtValue): boolean` is
  `UsdObject::GetMetadata(const TfToken&, VtValue*)` (object.h:285).
- `UsdAttributeQuery.get(value: VtValue, time): boolean` is
  `UsdAttributeQuery::Get(VtValue*, UsdTimeCode)` (attributeQuery.h:151).
- `Attribute.getConnections(sources: SdfPath[]): boolean` is
  `UsdAttribute::GetConnections(SdfPathVector*)` with upstream's
  `isClean && hasTargetOpinions` result (property.cpp:172-233).
The untyped forms are unchanged. esfUsd's `_GetMetadata`,
`_GetMetadataValueType`, `EsfUsd_AttributeQuery._Get` and the stage data's
connection reads now call these.

**Viewer (Safari 27.2, port 8840).** The test page used
`?env=USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX=1` on a harness that places
the scene with an `xformOp:transform`. At frames 1,
24, 48, 72 and 96 the WRONG sign is parked under the stage and the can is
aimed at the target. Without the setting, the sign stands stage left with the
can aimed at it.

**Known gaps (plain failing tests):**
- openexec-tfspan: one vdf case.
- Resolved November 10, 2026 as platform divergences (5 cases now pass):
  `VdfNode::GetMemoryUsage` reports only measurable data, as JavaScript has
  no sizeof (PLATFORM-DIVERGENCE `openexec-memory-usage`), so DumpStats no
  longer throws in testVdfBasic runSimpleTest, testVdfEdit TestEdits and its
  dot-file comparison, and testVdfIsolatedSubnetwork TestIsolateBranch; the
  `VdfInputVector` lvalue copy count expects 0, as JavaScript has no copy or
  move overloads (PLATFORM-DIVERGENCE `js-no-copy-move`).
- `pxr/exec/execTest` is not ported: one exec case.
- testExecUsdBasicCompilation needs TraceReporter serialization
  (`SerializeProcessedCollections`), which it calls before its
  `DIFF_COMPARE testCompiler.out`.

**What remains, by size.** Execution stats are about 0.6k lines. The
parallel and speculation engines (about 6k lines) wait on decision D1. Then
`PlugRegistry::FindDerivedTypeByName`, a bundler-visible library-plugin
import in plug (it replaces the viewer's importer override).

Additional FAITHFULNESS-DEBT ids, beyond section 10:
- openexec-memory-usage
- openexec-tfspan
- openexec-vt-failget
- openexec-plugin-bundling

Closed November 7: openexec-grapher, openexec-usd-typed-metadata,
openexec-usd-vtvalue-get, openexec-usd-connections-bool.

## Appendix: upstream units in porting order

Each entry is `unit raw-lines`.

- **vdf, slice S1** (98 units, 31657 lines, 17108 code): boxedContainerTraits 27, boxedContainer 209, maskRegistry 394, mask 820, compressedIndexMapping 365, fixedSizePolymorphicHolder 124, vectorData 394, vectorAccessor 119, estimateSize 100, indexedDataIterator 80, traits 112, indexedData 427, indexedWeights 22, forEachCommonType 92, vectorImpl_Dispatch 89, fixedSizeHolder 201, vectorImpl_Single 161, vectorImpl_Empty 121, vectorImpl_Compressed 367, vectorImpl_Contiguous 362, vectorDataTyped 98, vectorImpl_Boxed 165, vectorImpl_Shared 390, vector 901, typedVector 71, outputSpec 219, inputSpec 191, connectorMap 186, tokens 42, connectorSpecs 330, inputAndOutputSpecs 181, inputAndOutputSpecsRegistry 155, defaultInitAllocator 66, types 150, output 401, maskedOutput 165, maskedOutputVector 134, request 500, requiredInputsPredicate 105, debugCodes 77, countingIterator 116, rootNode 86, scheduleTasks 143, scheduleNode 136, object 493, error 83, poolChainIndex 85, dynamicTopologicalSorter 463, poolChainIndexer 266, sparseInputTraverser 770, sparseOutputTraverser 944, networkUtil 225, scheduler 2977, schedule 1161, scheduleInvalidator 480, node 1337, execNodeDebugName 82, typeDispatchTable 221, executionTypeRegistry 408, networkStats 193, network 1026, input 280, connection 144, lruCache 133, maskMemoizer 69, nodeProcessInvalidationInterface 143, executorInvalidator 686, executorObserver 70, executorInterface 674, executorErrorLogger 189, evaluationState 113, context 666, iterator 261, dataManagerAllocator 347, dataManagerBasedExecutor 209, dataManagerBasedSubExecutor 103, dataManagerFacade 46, smblData 316, executorBufferData 437, executorDataManagerInterface 194, executorInvalidationData 230, executorDataManager 636, dataManagerHashTable 290, executorDataVector 486, dataManagerVector 363, datalessExecutor 183, executorFactoryBase 59, executorFactory 65, pullBasedExecutorEngine 1179, subExecutor 149, readIterator 428, rawValueAccessor 190, inputVector 267, isolatedSubnetwork 469, iteratorRange 86, nodeSet 190, readIteratorRange 58, sparseVectorizedOutputTraverser 441
- **vdf, later** (36 units, 16930 lines, 9399 code): grapherOptions 359, dotGrapher 755, grapher 244, allocateBoxedValue 146, executionStats 387, executionStatsProcessor 180, speculationExecutorBase 127, speculationExecutorEngine 613, speculationNode 411, speculationExecutor 215, executor 127, extensibleNode 167, indexedWeightsOperand 2361, inputValuesPointer 227, maskedIterator 172, readWriteIterator 314, weightedIterator 537, iterators 66, parallelExecutorDataManagerInterface 252, parallelExecutorDataManager 650, parallelExecutorDataVector 1101, parallelDataManagerVector 368, parallelTaskWaitlist 278, parallelTaskSync 188, parallelExecutorEngineBase 2309, parallelExecutorEngine 474, parallelSpeculationExecutorEngine 172, readWriteAccessor 188, readWriteIteratorRange 58, simpleExecutor 236, sparseInputPathFinder 931, sparseVectorizedInputTraverser 615, vectorSubrangeAccessor 119, subrangeView 380, testUtils 1031, vectorIterator 172
- **ef, slice S1** (17 units, 6082 lines, 3312 code): dependencyCache 908, inputValueBlock 292, leafNode 154, leafNodeIndexer 231, leafNodeCache 474, loftedOutputSet 345, maskedSubExecutor 304, outputValueCache 632, vectorKey 203, pageCache 209, pageCacheCommitRequest 230, pageCacheStorage 940, pageCacheBasedExecutor 416, pageCacheExecutor 100, time 248, timeInputNode 72, timeInterval 324
- **ef, later** (2 units, 243 lines, 134 code): firstValidInputValue 55, pageCacheSubExecutor 188
- **esf, slice S1** (11 units, 1877 lines, 1016 code): fixedSizePolymorphicHolder 315, attributeQuery 146, editReason 231, journal 118, stage 190, relationship 158, prim 163, schemaConfigKey 55, object 278, property 103, attribute 120
- **esfUsd, slice S1** (9 units, 2120 lines, 1375 code): attributeQuery 114, relationship 70, prim 112, stage 146, stageData 959, object 362, property 104, attribute 92, sceneAdapter 161
- **exec, slice S1** (58 units, 16913 lines, 9279 code): valueExtractorFunction 31, valueExtractor 85, typeRegistry 480, attributeInputNode 228, builtinComputationRegistry 222, builtinComputations 206, types 44, callbackNode 75, providerResolution 69, inputKey 150, computationDefinition 148, privateBuiltinComputations 114, compilationTask 543, compilerTaskSyncBase 375, outputKey 175, compilerTaskSync 207, interruptState 177, validationError 53, taskCycleDetector 446, compilationState 125, valueKey 82, compiledLeafNodeCache 170, compiledOutputCache 173, invalidationResult 75, metadataInputNode 111, nodeRecompilationInfo 114, nodeRecompilationInfoTable 208, timeChangeInvalidationResult 44, uncompilationTarget 186, uncompilationRuleSet 238, uncompilationTable 249, program 1235, builtinAttributeComputations 331, builtinObjectComputations 214, constantValueNode 80, pluginComputationDefinition 185, pluginData 251, definitionRegistry 1350, builtinStageComputations 191, cacheView 174, cycleDetectingTask 145, inputResolver 726, outputProvidingCompilationTask 219, inputResolvingCompilationTask 207, inputRecompilationTask 213, leafCompilationTask 255, runtime 464, compiler 197, registerSchema 73, computationBuilders 2590, debugCodes 45, request 45, requestTracker 207, valueOverride 40, system 510, requestImpl 890, uncompiler 260, systemChangeProcessor 213
- **exec, later** (1 units, 96 lines, 54 code): systemDiagnostics 96
- **execUsd, slice S1** (7 units, 1079 lines, 624 code): valueKey 128, valueOverride 40, system 357, visitValueKey 31, requestImpl 348, request 96, cacheView 79
- **execGeom, slice S1** (2 units, 103 lines, 57 code): tokens 42, xformable 61
- **execIr, slice S1** (7 units, 2424 lines, 1320 code): computations 85, types 46, controllerBuilder 607, tokens 439, utils 848, fkControllerComputations 78, xformableComputations 321
- **execIr, later** (7 units, 3485 lines, 1748 code): controller 227, fkController 842, generatedSchema.module 14, xformable 1436, jointScope 407, switchController 468, switchControllerComputations 91
