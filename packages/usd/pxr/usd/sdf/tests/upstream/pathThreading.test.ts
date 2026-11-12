// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfPathThreading.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/sdf/testenv/testSdfPathThreading.cpp.
//
// The upstream suite is a STRESS test: it spins up `hardware_concurrency` threads,
// each looping for 2s building random SdfPaths (AppendChild/Property/Variant/Target/
// Mapper/Expression/…) and shoving them through a mutex-guarded shared cache, to
// shake out races in the path-interning / refcount / hash-table machinery.
//
// JS is single-threaded: the CONCURRENCY dimension (threads, atomics, the mutex,
// the shared path cache) is N/A here — there is no parallel access to make race-safe,
// so there is nothing to port on that axis (this is a substrate fact, NOT a coverage
// gap). What the stress test ultimately ASSERTS is a determinism/identity property:
// constructing "the same" path from many independent call sites must always yield an
// identical, consistent SdfPath (same string, equal by value). THAT is faithfully
// testable in a single thread by replaying the suite's exact construction patterns
// many times over and asserting the results never drift.
//
// Construction axes covered = those typescript-usd's public SdfPath exposes: AppendChild
// (prim), AppendVariantSelection, AppendProperty, AppendTarget (the upstream
// _MakeRandomPath axes). AppendMapper / AppendExpression / AppendRelationalAttribute
// / AppendMapperArg have no typescript-usd public method and are therefore out of scope.
//
// Golden strings are CAPTURED FROM THE LIVE PIXAR BUILD (usd-2605, Sdf.Path), via a
// seeded generator over the suite's name tokens (A,B,C,x_0..x_63) — see the scratch
// generator gen.py; the recipe+expected pairs below are baked verbatim from its
// output, never hand-derived.
import { describe, expect, it } from 'vitest'
import { SdfPath } from '../../src/path.ts'

type Op =
  | ['child', string]
  | ['variant', string, string]
  | ['property', string]
  | ['target', Op[]]
interface Record { ops: Op[]; expected: string }

// Captured from the Pixar build (pxr.Sdf, usd-2605). Each `expected` is Sdf.Path's
// own pathString for the path built by replaying `ops` from absoluteRootPath.
const GOLDEN: Record[] = [
  {"ops": [["child", "x_26"], ["child", "B"]], "expected": "/x_26/B"},
  {"ops": [["child", "x_27"], ["variant", "x_46", "x_50"], ["property", "x_54"]], "expected": "/x_27{x_46=x_50}.x_54"},
  {"ops": [["child", "x_59"], ["child", "x_37"], ["property", "x_31"]], "expected": "/x_59/x_37.x_31"},
  {"ops": [["child", "x_32"], ["variant", "x_38", "x_31"]], "expected": "/x_32{x_38=x_31}"},
  {"ops": [["child", "x_53"], ["child", "x_53"], ["child", "x_8"], ["property", "x_17"]], "expected": "/x_53/x_53/x_8.x_17"},
  {"ops": [["child", "x_19"]], "expected": "/x_19"},
  {"ops": [["child", "x_41"]], "expected": "/x_41"},
  {"ops": [["child", "x_9"], ["child", "x_40"], ["child", "x_51"], ["variant", "x_28", "x_2"]], "expected": "/x_9/x_40/x_51{x_28=x_2}"},
  {"ops": [["child", "x_53"], ["variant", "x_48", "x_6"], ["property", "x_37"], ["target", [["child", "x_14"], ["child", "x_0"], ["child", "x_19"]]]], "expected": "/x_53{x_48=x_6}.x_37[/x_14/x_0/x_19]"},
  {"ops": [["child", "x_17"], ["variant", "x_2", "x_37"]], "expected": "/x_17{x_2=x_37}"},
  {"ops": [["child", "x_48"], ["variant", "x_54", "x_45"], ["property", "x_23"]], "expected": "/x_48{x_54=x_45}.x_23"},
  {"ops": [["child", "x_37"], ["variant", "x_10", "x_49"]], "expected": "/x_37{x_10=x_49}"},
  {"ops": [["child", "x_16"], ["child", "x_2"], ["variant", "x_27", "x_16"], ["property", "x_1"], ["target", [["child", "x_52"], ["property", "x_21"]]]], "expected": "/x_16/x_2{x_27=x_16}.x_1[/x_52.x_21]"},
  {"ops": [["child", "x_16"], ["child", "x_38"], ["child", "x_22"], ["property", "x_26"], ["target", [["child", "x_23"], ["child", "x_50"], ["property", "x_44"]]]], "expected": "/x_16/x_38/x_22.x_26[/x_23/x_50.x_44]"},
  {"ops": [["child", "x_50"], ["variant", "x_35", "x_44"]], "expected": "/x_50{x_35=x_44}"},
  {"ops": [["child", "B"], ["child", "x_32"], ["variant", "x_8", "x_44"], ["property", "x_12"]], "expected": "/B/x_32{x_8=x_44}.x_12"},
  {"ops": [["child", "x_55"], ["child", "x_11"]], "expected": "/x_55/x_11"},
  {"ops": [["child", "x_29"], ["property", "x_21"], ["target", [["child", "x_57"], ["child", "x_11"], ["child", "x_31"]]]], "expected": "/x_29.x_21[/x_57/x_11/x_31]"},
  {"ops": [["child", "x_63"], ["property", "x_39"]], "expected": "/x_63.x_39"},
  {"ops": [["child", "x_61"], ["variant", "x_36", "x_14"], ["property", "x_45"]], "expected": "/x_61{x_36=x_14}.x_45"},
  {"ops": [["child", "x_59"], ["child", "B"]], "expected": "/x_59/B"},
  {"ops": [["child", "x_44"]], "expected": "/x_44"},
  {"ops": [["child", "x_57"]], "expected": "/x_57"},
  {"ops": [["child", "x_11"], ["variant", "x_47", "x_46"]], "expected": "/x_11{x_47=x_46}"},
  {"ops": [["child", "x_8"], ["variant", "x_25", "x_37"]], "expected": "/x_8{x_25=x_37}"},
  {"ops": [["child", "x_52"], ["property", "x_13"], ["target", [["child", "x_13"], ["child", "x_38"], ["child", "x_35"]]]], "expected": "/x_52.x_13[/x_13/x_38/x_35]"},
  {"ops": [["child", "x_12"], ["child", "x_21"], ["child", "x_22"], ["variant", "x_46", "x_35"]], "expected": "/x_12/x_21/x_22{x_46=x_35}"},
  {"ops": [["child", "x_62"], ["child", "x_0"], ["variant", "x_18", "x_15"], ["property", "x_59"], ["target", [["child", "x_45"], ["child", "x_7"], ["child", "x_4"], ["property", "x_17"]]]], "expected": "/x_62/x_0{x_18=x_15}.x_59[/x_45/x_7/x_4.x_17]"},
  {"ops": [["child", "x_30"], ["variant", "x_5", "x_53"]], "expected": "/x_30{x_5=x_53}"},
  {"ops": [["child", "x_13"], ["child", "x_9"], ["child", "x_7"], ["property", "x_40"], ["target", [["child", "x_58"], ["child", "x_11"], ["child", "C"], ["property", "x_37"]]]], "expected": "/x_13/x_9/x_7.x_40[/x_58/x_11/C.x_37]"},
  {"ops": [["child", "x_63"], ["child", "x_24"], ["variant", "x_51", "x_38"], ["property", "x_32"], ["target", [["child", "x_19"], ["child", "x_8"], ["property", "x_7"]]]], "expected": "/x_63/x_24{x_51=x_38}.x_32[/x_19/x_8.x_7]"},
  {"ops": [["child", "x_41"], ["child", "x_60"], ["variant", "x_38", "x_14"]], "expected": "/x_41/x_60{x_38=x_14}"},
  {"ops": [["child", "x_17"], ["child", "x_34"]], "expected": "/x_17/x_34"},
  {"ops": [["child", "x_42"], ["child", "x_22"], ["child", "x_22"], ["property", "x_45"]], "expected": "/x_42/x_22/x_22.x_45"},
  {"ops": [["child", "x_62"], ["child", "x_7"], ["child", "x_39"], ["property", "x_37"], ["target", [["child", "x_23"], ["child", "x_15"], ["child", "x_52"]]]], "expected": "/x_62/x_7/x_39.x_37[/x_23/x_15/x_52]"},
  {"ops": [["child", "x_27"], ["variant", "x_45", "x_31"], ["property", "x_34"], ["target", [["child", "x_2"]]]], "expected": "/x_27{x_45=x_31}.x_34[/x_2]"},
  {"ops": [["child", "x_54"], ["child", "x_21"], ["child", "x_7"], ["variant", "x_30", "x_14"], ["property", "x_27"]], "expected": "/x_54/x_21/x_7{x_30=x_14}.x_27"},
  {"ops": [["child", "x_3"], ["child", "x_13"]], "expected": "/x_3/x_13"},
  {"ops": [["child", "x_6"], ["child", "x_46"], ["variant", "x_8", "x_1"]], "expected": "/x_6/x_46{x_8=x_1}"},
  {"ops": [["child", "x_36"], ["variant", "x_30", "x_28"]], "expected": "/x_36{x_30=x_28}"},
  {"ops": [["child", "x_61"], ["child", "x_12"], ["child", "x_44"], ["variant", "x_41", "x_18"]], "expected": "/x_61/x_12/x_44{x_41=x_18}"},
  {"ops": [["child", "x_25"], ["child", "C"], ["child", "x_4"], ["variant", "x_56", "x_59"], ["property", "x_44"], ["target", [["child", "x_12"], ["property", "x_14"]]]], "expected": "/x_25/C/x_4{x_56=x_59}.x_44[/x_12.x_14]"},
  {"ops": [["child", "x_46"], ["property", "x_47"]], "expected": "/x_46.x_47"},
  {"ops": [["child", "x_23"], ["child", "x_21"], ["property", "x_21"]], "expected": "/x_23/x_21.x_21"},
  {"ops": [["child", "x_1"], ["variant", "x_33", "x_54"], ["property", "x_38"], ["target", [["child", "x_12"], ["child", "x_4"], ["child", "x_7"]]]], "expected": "/x_1{x_33=x_54}.x_38[/x_12/x_4/x_7]"},
  {"ops": [["child", "x_46"], ["child", "x_59"], ["child", "x_34"], ["variant", "x_47", "x_9"]], "expected": "/x_46/x_59/x_34{x_47=x_9}"},
  {"ops": [["child", "x_15"], ["child", "x_29"], ["variant", "x_11", "x_43"], ["property", "x_53"]], "expected": "/x_15/x_29{x_11=x_43}.x_53"},
  {"ops": [["child", "x_52"], ["variant", "x_27", "x_60"]], "expected": "/x_52{x_27=x_60}"},
  {"ops": [["child", "x_6"], ["child", "x_40"]], "expected": "/x_6/x_40"},
  {"ops": [["child", "x_63"], ["variant", "x_39", "x_14"], ["property", "x_37"]], "expected": "/x_63{x_39=x_14}.x_37"},
  {"ops": [["child", "x_62"], ["child", "x_3"]], "expected": "/x_62/x_3"},
  {"ops": [["child", "x_0"], ["child", "x_20"], ["child", "x_57"], ["property", "x_60"]], "expected": "/x_0/x_20/x_57.x_60"},
  {"ops": [["child", "x_12"], ["child", "x_39"], ["child", "x_48"], ["variant", "x_38", "x_18"]], "expected": "/x_12/x_39/x_48{x_38=x_18}"},
  {"ops": [["child", "x_19"], ["child", "x_6"], ["child", "x_41"], ["variant", "x_42", "x_15"], ["property", "x_58"]], "expected": "/x_19/x_6/x_41{x_42=x_15}.x_58"},
  {"ops": [["child", "x_17"], ["child", "x_31"], ["child", "x_16"], ["variant", "A", "x_40"]], "expected": "/x_17/x_31/x_16{A=x_40}"},
  {"ops": [["child", "x_1"], ["child", "x_59"], ["child", "x_55"], ["variant", "x_52", "x_28"]], "expected": "/x_1/x_59/x_55{x_52=x_28}"},
  {"ops": [["child", "x_40"], ["child", "x_24"], ["child", "x_49"], ["variant", "x_49", "x_8"], ["property", "x_29"], ["target", [["child", "x_63"], ["child", "x_41"], ["child", "x_48"]]]], "expected": "/x_40/x_24/x_49{x_49=x_8}.x_29[/x_63/x_41/x_48]"},
  {"ops": [["child", "C"], ["property", "x_4"], ["target", [["child", "x_2"], ["child", "x_62"], ["child", "B"]]]], "expected": "/C.x_4[/x_2/x_62/B]"},
  {"ops": [["child", "x_55"], ["child", "x_41"], ["child", "x_5"], ["variant", "x_54", "x_38"]], "expected": "/x_55/x_41/x_5{x_54=x_38}"},
  {"ops": [["child", "A"], ["child", "x_56"]], "expected": "/A/x_56"},
  {"ops": [["child", "A"]], "expected": "/A"},
  {"ops": [["child", "A"], ["child", "B"]], "expected": "/A/B"},
  {"ops": [["child", "A"], ["child", "B"], ["child", "C"]], "expected": "/A/B/C"},
  {"ops": [["child", "A"], ["variant", "v", "x"]], "expected": "/A{v=x}"},
  {"ops": [["child", "A"], ["variant", "v", "x"], ["child", "B"]], "expected": "/A{v=x}B"},
  {"ops": [["child", "A"], ["property", "p"]], "expected": "/A.p"},
  {"ops": [["child", "A"], ["variant", "v", "x"], ["property", "p"]], "expected": "/A{v=x}.p"},
  {"ops": [["child", "A"], ["property", "rel"], ["target", [["child", "B"]]]], "expected": "/A.rel[/B]"},
  {"ops": [["child", "A"], ["property", "rel"], ["target", [["child", "B"], ["property", "p"]]]], "expected": "/A.rel[/B.p]"},
  {"ops": [["child", "x_63"], ["child", "x_0"]], "expected": "/x_63/x_0"},
]

// Replay a recipe from absoluteRootPath via the public Append* surface — the exact
// _MakeRandomPath axes (minus the threading-only/mapper/expression axes typescript-usd lacks).
function build(ops: Op[]): SdfPath {
  let p = SdfPath.absoluteRootPath
  for (const op of ops) {
    switch (op[0]) {
      case 'child': p = p.appendChild(op[1]); break
      case 'variant': p = p.appendVariantSelection(op[1], op[2]); break
      case 'property': p = p.appendProperty(op[1]); break
      case 'target': p = p.appendTarget(build(op[1])); break
    }
  }
  return p
}

describe('SdfPath threading — single-threaded determinism analog', () => {
  it('every captured construction matches the Pixar build', () => {
    for (const { ops, expected } of GOLDEN) {
      expect(build(ops).pathString).toBe(expected)
    }
  })

  // The crux of what the C++ stress test guards: building "the same" path from many
  // independent call sites must converge on byte-identical, value-equal results.
  // Loop each recipe many times (standing in for the suite's N threads × 2s) and
  // assert the constructed string never drifts and is equal-by-value to a sibling.
  it('repeated construction is deterministic and value-consistent', () => {
    const ITERS = 200
    for (const { ops, expected } of GOLDEN) {
      const first = build(ops)
      for (let i = 0; i < ITERS; ++i) {
        const p = build(ops)
        expect(p.pathString).toBe(expected)
        expect(p.equals(first)).toBe(true)
        expect(first.equals(p)).toBe(true)
      }
    }
  })

  // Interleave construction of ALL recipes round-robin (the suite's shared cache pulls
  // an arbitrary cached path and extends it), asserting no construction order pollutes
  // another — the interning/strings stay independent and stable across interleaving.
  it('interleaved round-robin construction stays independent', () => {
    const ROUNDS = 50
    for (let r = 0; r < ROUNDS; ++r) {
      for (const { ops, expected } of GOLDEN) {
        expect(build(ops).pathString).toBe(expected)
      }
    }
  })

  // Extending a fetched/cached path (suite's _GetPath -> _MakeRandomPath(p)) and the
  // GetPrimPath trim it applies must also be deterministic: same base -> same child,
  // and parent navigation round-trips.
  it('extension + prim-path trim of cached paths is stable', () => {
    for (const { ops, expected } of GOLDEN) {
      const base = build(ops)
      // GetPrimPath is the suite's trim-back for non-extensible paths.
      const prim = base.getPrimPath()
      expect(base.getPrimPath().pathString).toBe(prim.pathString)
      // Extend the trimmed prim with a child; repeat -> identical.
      const a = prim.isEmpty() ? base : prim.appendChild('x_0')
      const b = prim.isEmpty() ? base : prim.appendChild('x_0')
      expect(a.pathString).toBe(b.pathString)
      // String round-trips through the parser back to the same string.
      expect(SdfPath.fromString(expected).pathString).toBe(expected)
    }
  })
})
