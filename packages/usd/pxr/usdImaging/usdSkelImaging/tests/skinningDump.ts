// Test helper: prints a final scene index in the format of
// the native capture of fixtures/sceneIndex (FIXTURES.md), so the TS scene index
// chain can be compared line by line with the reference build's capture.
import {
  ContainerDataSource as HdContainerDataSource, ExtComputationPrimvarsSchema as HdExtComputationPrimvarsSchema,
  ExtComputationSchema as HdExtComputationSchema, PrimvarsSchema as HdPrimvarsSchema,
  SampledDataSource as HdSampledDataSource, SceneIndexPrimView as HdSceneIndexPrimView,
  type SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'
import { Array as VtArray, Value as VtValue } from 'typescript-usd/vt'
import type { UsdSkelImagingExtComputationContext } from '../src/extComputations.ts'

/** A VtValue type name for a data source value; plain JS numbers (int,
 *  float, double, size_t upstream) print as "number". */
export function _TypeName(value: unknown): string {
  if (value instanceof VtValue) return value.IsEmpty() ? 'NULL' : _TypeName(value.UncheckedGet())
  if (value instanceof VtArray) return `VtArray<${value.getElementType().getTypeName()}>`
  if (typeof value === 'boolean') return 'bool'
  if (typeof value === 'number') return 'number'
  if (value && typeof value === 'object') return value.constructor.name
  return String(value)
}

/** Normalizes a captured line's scalar VtValue type names to "number". */
export function _NormalizeExpected(line: string): string {
  return line.replace(/=(int|float|double|unsigned long)\b/g, '=number')
}

function _Sorted(c: HdContainerDataSource | undefined): string[] {
  return c ? [...c.getNames()].sort() : []
}

function _Str(ds: { getTypedValue(t: number): unknown } | undefined): string {
  if (!ds) return 'NULL'
  const v = ds.getTypedValue(0)
  return String(v instanceof VtValue ? v.UncheckedGet() : v)
}

function _TupleType(ds: { getTypedValue(t: number): unknown } | undefined): string {
  if (!ds) return 'NULL'
  const t = ds.getTypedValue(0) as { type: number, count: number }
  return `${t.type},${t.count}`
}

class _Context implements UsdSkelImagingExtComputationContext {
  readonly inputs = new Map<string, unknown>()
  readonly outputs = new Map<string, VtValue>()
  error = false
  getInputValue(name: string): unknown { return this.inputs.get(name) }
  getOptionalInputValue(name: string): unknown { return this.inputs.get(name) }
  setOutputValue(name: string, value: VtValue): void { this.outputs.set(name, value) }
  raiseComputationError(): void { this.error = true }
}

function _Elements(value: unknown): number[][] {
  const v = value instanceof VtValue ? value.UncheckedGet() : value
  const arr = v instanceof VtArray ? v.toArray() : (v as unknown[])
  return arr.map(p => Array.from((p as { data?: ArrayLike<number> }).data ?? (p as ArrayLike<number>)))
}

/** The native capture's printout, as lines. */
export function DumpSkinning(si: HdSceneIndexBase, prefix: string): string[] {
  const out: string[] = []
  for (const path of new HdSceneIndexPrimView(si)) {
    if (!(path === prefix || path.startsWith(`${prefix}/`))) continue
    const prim = si.getPrim(path)
    out.push(`${path} type=${prim.primType}`)
    if (!prim.dataSource) continue

    const compPrimvars = HdExtComputationPrimvarsSchema.getFromParent(prim.dataSource)
    if (compPrimvars.isDefined()) {
      out.push(`\tprimvars: ${_Sorted(HdPrimvarsSchema.getFromParent(prim.dataSource).getContainer()).join(' ')}`)
      for (const name of _Sorted(compPrimvars.getContainer())) {
        const pv = compPrimvars.getExtComputationPrimvar(name)
        out.push(`\textComputationPrimvar ${name} interpolation=${_Str(pv.getInterpolation())}` +
          ` role=${_Str(pv.getRole())} sourceComputation=${_Str(pv.getSourceComputation())}` +
          ` sourceComputationOutputName=${_Str(pv.getSourceComputationOutputName())}` +
          ` valueType=${_TupleType(pv.GetValueType())}`)
      }
    }

    const comp = HdExtComputationSchema.getFromParent(prim.dataSource)
    if (!comp.isDefined()) continue
    const inputValues = comp.getInputValues().getContainer()
    out.push(`\tinputValues:${_Sorted(inputValues).map(name => {
      const v = inputValues!.Get(name)
      return ` ${name}=${v instanceof HdSampledDataSource ? _TypeName(v.GetValue(0)) : 'NULL'}`
    }).join('')}`)
    const inputComps = comp.getInputComputations()
    for (const name of _Sorted(inputComps.getContainer())) {
      const ic = inputComps.Get(name)
      out.push(`\tinputComputation ${name} sourceComputation=${_Str(ic.getSourceComputation())}` +
        ` sourceComputationOutputName=${_Str(ic.getSourceComputationOutputName())}`)
    }
    const outputs = comp.getOutputs()
    for (const name of _Sorted(outputs.getContainer())) {
      out.push(`\toutput ${name} valueType=${_TupleType(outputs.Get(name).GetValueType())}`)
    }
    const kernel = comp.getGlslKernel()
    const callback = comp.getCpuCallback()?.getTypedValue(0) as
      { compute(ctx: UsdSkelImagingExtComputationContext): void } | undefined
    out.push(`\tdispatchCount=${_Str(comp.getDispatchCount())} elementCount=${_Str(comp.getElementCount())}` +
      ` glslKernel=${kernel && kernel.getTypedValue(0) ? 'nonempty' : 'empty'}` +
      ` cpuCallback=${callback ? 'set' : 'null'}`)
    if (!callback) continue

    const ctx = new _Context()
    for (const name of _Sorted(inputValues)) {
      const v = inputValues!.Get(name)
      if (v instanceof HdSampledDataSource) ctx.inputs.set(name, v.GetValue(0))
    }
    for (const name of _Sorted(inputComps.getContainer())) {
      const ic = inputComps.Get(name)
      const source = ic.getSourceComputation()!.getTypedValue(0)
      const sourceOutput = ic.getSourceComputationOutputName()!.getTypedValue(0)
      const sourceInputs = HdExtComputationSchema.getFromParent(si.getPrim(String(source)).dataSource)
        .getInputValues().getContainer()
      const v = sourceInputs?.Get(String(sourceOutput))
      if (v instanceof HdSampledDataSource) ctx.inputs.set(name, v.GetValue(0))
    }
    callback.compute(ctx)
    out.push(`\tcomputationError=${ctx.error}`)
    for (const name of _Sorted(outputs.getContainer())) {
      const value = ctx.outputs.get(name)
      if (!value) {
        out.push(`\tcomputed ${name} NONE`)
        continue
      }
      const elements = _Elements(value)
      out.push(`\tcomputed ${name} ${elements.length}`)
      for (const p of elements) out.push(`\t\t${p.join(' ')}`)
    }
  }
  return out
}

/** Compares a DumpSkinning printout with a capture: lines equal (after
 *  _NormalizeExpected), except computed element lines, which are compared
 *  numerically within `tolerance`. Returns the differences. */
export function CompareDump(actual: string[], captured: string, tolerance: number): string[] {
  const expected = captured.split('\n').filter(l => l !== '' && l !== 'OK').map(_NormalizeExpected)
  const diffs: string[] = []
  const n = Math.max(actual.length, expected.length)
  for (let i = 0; i < n; ++i) {
    const a = actual[i], e = expected[i]
    if (a === e) continue
    if (a !== undefined && e !== undefined && a.startsWith('\t\t') && e.startsWith('\t\t')) {
      const av = a.trim().split(' ').map(Number), ev = e.trim().split(' ').map(Number)
      if (av.length === ev.length && av.every((x, j) => Math.abs(x - ev[j]!) <= tolerance)) continue
    }
    diffs.push(`line ${i}: expected ${JSON.stringify(e)} got ${JSON.stringify(a)}`)
    if (diffs.length > 20) break
  }
  return diffs
}
