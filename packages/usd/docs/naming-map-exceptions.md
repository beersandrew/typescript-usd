# Surface naming exceptions

The surface's names are derived from upstream's by rules 2, 3, 8, 9 and 14 of
the [style guide](./style-guide.md). The members below are the exceptions:
surface-only names (`@upstream none`) and names the rules do not give. The
naming-map check (run by the tooling kept outside this repository) reads
this table: a member whose name is neither derived nor listed here fails it,
and so does a row no member uses.

| Surface | Upstream | Reason |
|---|---|---|
| `Stage.prim` | `UsdStage::GetPrimAtPath` | Paths are strings at the surface (rule 11), so `AtPath` adds nothing; the guide's example name. |
| `Stage.editContext` | `UsdEditContext::UsdEditContext` | A factory on the stage for the scope type (rule 9's `using` form); `new EditContext(stage, layer)` is the upstream-shaped equivalent. |
| `Stage.withEditTarget` | `UsdEditContext::UsdEditContext` | Rule 9's callback form of an edit context. |
| `Stage.changeBlock` | `SdfChangeBlock::SdfChangeBlock` | Rule 9's `using` and callback forms of a change block, as in the guide's example. |
| `Stage.addEventListener` | `TfNotice::Register` | Rule 14: notices are observed through `EventTarget`. |
| `StageEventMap` | `UsdNotice` | TypeScript's DOM convention for an `EventTarget`'s typed event map (`HTMLElementEventMap`). |
| `TraverseOptions.instanceProxies` | `UsdTraverseInstanceProxies` | Rule 13: the predicate wrapper is an option, not a function applied to flags. |
| `UsdError` | `TfPyConvertTfErrorsToPythonException` | Rule 5 names the one error class; upstream's counterpart is Python's `Tf.ErrorException`, raised by this function. |
| `UsdError.errors` | `TfErrorMark::GetBegin` | The errors in the mark's range, as an array rather than an iterator pair. |
| `TypedArray` | `VtArray` | The typed-array storage a numeric `VtArray` is read as (rule 10). |
| `ReadonlyValue` | `VtArray::cdata` | The read-only form values are handed out in (rule 10). |
| `ValueInput` | `VtArray::assign` | What setters accept (rule 10: any Iterable of the elements). |
| `UsdError.constructor` | `none` | Surface-only: the error class has no upstream constructor. |
| `ObjectsChangedEvent.constructor` | `none` | Surface-only: events are created by the stage from the core notice. |
| `OpenOptions.signal` | `none` | Surface-only: rule 7's `AbortSignal` for I/O. |
| `Stage.fromCore` | `none` | Surface-only: the surface object for a core object, for code that holds core objects (the bridge while apps move over). |
| `Layer.fromCore` | `none` | Surface-only: as `Stage.fromCore`. |
| `Prim.fromCore` | `none` | Surface-only: as `Stage.fromCore`. |
| `Attribute.fromCore` | `none` | Surface-only: as `Stage.fromCore`. |
| `Stage.core` | `none` | Surface-only: the wrapped core object, for APIs the surface does not cover yet. |
| `Layer.core` | `none` | Surface-only: as `Stage.core`. |
| `Prim.core` | `none` | Surface-only: as `Stage.core`. |
| `Attribute.core` | `none` | Surface-only: as `Stage.core`. |
| `Mesh.core` | `none` | Surface-only: as `Stage.core`. |
| `ObjectsChangedEvent.core` | `none` | Surface-only: as `Stage.core`, the core notice. |
