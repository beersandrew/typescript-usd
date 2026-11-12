// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/debug.cpp,
//  pxr/base/tf/debug.cpp, pxr/base/tf/debugCodes.cpp,
//  pxr/base/tf/diagnosticMgr.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/base/tf/testenv/debug.cpp, registrations
// TfDebugTestEnv (Test_TfDebugTestEnv, debug.cpp:62-123; CMakeLists.txt:599-606)
// and TfDebugFatal_1, TfDebugFatal_2, TfDebugFatal_3 (debug.cpp:137-176;
// CMakeLists.txt:583-594, EXPECTED_RETURN_CODE 134), all run by testTf.
//
// Expected values:
// - fixtures/debugTestEnv/debugTestEnv.out is upstream's
//   testenv/baseline/TfDebugTestEnv/non-specific/debugTestEnv.out, verbatim.
//   It also lists the debug codes libusd_tf registers itself (debug.cpp:297-301,
//   debugCodes.cpp:14-27, diagnosticMgr.cpp:89-100: TF_DEBUG_REGISTRY,
//   TF_DLOPEN, TF_ATTACH_DEBUGGER_ON_ERROR, ...). They name C++ facilities the
//   TypeScript tf does not have, so it does not register them; the comparison
//   is with the baseline's lines for the symbols the test registers.
// - fixtures/debugTestEnv/debugTestEnvOracle.json is captured from the
//   reference build (FIXTURES.md) under the registration's
//   TF_DEBUG environment: upstream's test prints only descriptions, so the
//   enabled states TF_DEBUG produces come from that capture.
// - TfDebugFatal_*: the process aborts (return code 134) on a TF_FATAL_ERROR
//   raised by the debug registry's _RegisterDebugSymbolImpl / _Register
//   (debug.cpp:113-127, 455-472). The TypeScript fatal error is a
//   thrown error of FatalError type carrying the same message.
//
// Each case loads a fresh debug registry (vi.resetModules) because upstream
// runs each registration in its own testTf process, and the registry reads
// TF_DEBUG when it is first used (debug.cpp:283-290).
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

type DiagnosticModule = typeof import('../../src/diagnostic.ts')
type TfDebugClass = typeof import('../../src/debug.ts').TfDebug
type TfErrorInstance = InstanceType<typeof import('../../src/diagnostic.ts').TfError>

const fixture = (name: string) => new URL(`./fixtures/debugTestEnv/${name}`, import.meta.url)
const oracle = JSON.parse(readFileSync(fixture('debugTestEnvOracle.json'), 'utf8')).payload as {
  TF_DEBUG: string
  afterRegister: Record<string, boolean>
  flimMatches: string[]
  flamStarMatches: string[]
  afterSet: Record<string, boolean>
}

const savedTfDebug = process.env.TF_DEBUG
async function freshDebug(tfDebug: string | undefined):
    Promise<{ TfDebug: TfDebugClass, diag: DiagnosticModule }> {
  if (tfDebug === undefined) delete process.env.TF_DEBUG
  else process.env.TF_DEBUG = tfDebug
  vi.resetModules()
  const { TfDebug } = await import('../../src/debug.ts')
  const diag = await import('../../src/diagnostic.ts')
  return { TfDebug, diag }
}
afterEach(() => {
  if (savedTfDebug === undefined) delete process.env.TF_DEBUG
  else process.env.TF_DEBUG = savedTfDebug
})

describe('TfDebugTestEnv (testenv/debug.cpp:62-123)', () => {
  it('registers, describes and prints the symbols under TF_DEBUG', async () => {
    // CMakeLists.txt:601: ENV TF_DEBUG="FOO* FLAM_* FLAM -FOOFLIMFLAM TF_DISCOVERY_D*"
    const { TfDebug } = await freshDebug(oracle.TF_DEBUG)

    TfDebug.registerDebugSymbol('FOO', 'fake foo env var')
    TfDebug.registerDebugSymbol('FOOFLAM', 'fake fooflam env var')
    TfDebug.registerDebugSymbol('FOOFLIMFLAM', 'fake fooflimflam env var')
    TfDebug.registerDebugSymbol('FLIMFLAM', 'fake flimflam env var')
    TfDebug.registerDebugSymbol('FLIM', 'fake flim env var')
    TfDebug.registerDebugSymbol('FLAM', 'fake flam env var')

    for (const [name, enabled] of Object.entries(oracle.afterRegister)) {
      expect(TfDebug.isDebugSymbolNameEnabled(name), name).toBe(enabled)
    }

    expect(TfDebug.setDebugSymbolsByName('FLIM', false)).toEqual(oracle.flimMatches)
    expect(TfDebug.setDebugSymbolsByName('FLAM*', false)).toEqual(oracle.flamStarMatches)

    for (const [name, enabled] of Object.entries(oracle.afterSet)) {
      expect(TfDebug.isDebugSymbolNameEnabled(name), name).toBe(enabled)
    }

    // debug.cpp:77-95: every expected name is among the symbol names.
    const expSymNames = ['FLAM', 'FLIM', 'FLIMFLAM', 'FOO', 'FOOFLAM', 'FOOFLIMFLAM']
    const symNames = TfDebug.getDebugSymbolNames().sort()
    expect(symNames.filter(name => expSymNames.includes(name))).toEqual(expSymNames)

    // debug.cpp:97-118
    const expDescriptions: Record<string, string> = {
      FOO: 'fake foo env var',
      FOOFLAM: 'fake fooflam env var',
      FOOFLIMFLAM: 'fake fooflimflam env var',
      FLIMFLAM: 'fake flimflam env var',
      FLIM: 'fake flim env var',
      FLAM: 'fake flam env var',
    }
    for (const [name, description] of Object.entries(expDescriptions)) {
      expect(TfDebug.getDebugSymbolDescription(name)).toBe(description)
    }

    // debug.cpp:120: printf("%s\n", TfDebug::GetDebugSymbolDescriptions()).
    // Baseline lines are "NAME<pad>: description"; a wrapped entry (name of
    // 25+ characters) continues on an indented line.
    const baseline = readFileSync(fixture('debugTestEnv.out'), 'utf8')
    const entries: string[] = []
    for (const line of baseline.split('\n')) {
      if (line.startsWith(' ') && entries.length) entries[entries.length - 1] += `\n${line}`
      else if (line !== '') entries.push(line)
    }
    const ownEntries = entries.filter(entry => expSymNames.includes(entry.split(/[ :]/)[0]!))
    expect(ownEntries.length).toBe(expSymNames.length)
    expect(TfDebug.getDebugSymbolDescriptions() + '\n')
      .toBe(ownEntries.map(entry => `${entry}\n`).join('') + '\n')
  })
})

describe('TfDebugFatal_* (testenv/debug.cpp:137-176)', () => {
  const expectFatal = (diag: DiagnosticModule, action: () => void, message: string) => {
    let thrown: unknown
    try { action() } catch (error) { thrown = error }
    expect(thrown).toBeInstanceOf(diag.TfError)
    expect((thrown as TfErrorInstance).isFatal()).toBe(true)
    expect((thrown as TfErrorInstance).getCommentary()).toBe(message)
  }

  it('TfDebugFatal_1: registering a symbol twice is fatal (debug.cpp:137-150)', async () => {
    const { TfDebug, diag } = await freshDebug(undefined)
    TfDebug.registerDebugSymbol('GRANDPA', 'loading of blah-blah files')
    TfDebug.registerDebugSymbol('FATHER', 'parsing of foo-foo code')
    expectFatal(diag, () => TfDebug.registerDebugSymbol('FATHER', 'some other thing that e1 does'),
      "[TF_DEBUG_ENVIRONMENT_SYMBOL] multiple debug symbol definitions for 'FATHER'.  " +
      'This is usually due to software misconfiguration, such as multiple versions of ' +
      'the same shared library loaded simultaneously in the process.  ' +
      'Please check your build configuration.')
  })

  it('TfDebugFatal_2: a NULL description is fatal (debug.cpp:152-163)', async () => {
    const { TfDebug, diag } = await freshDebug(undefined)
    expectFatal(diag, () => TfDebug.registerDebugSymbol('GRANDPA', null as unknown as string),
      "description argument for 'GRANDPA' is NULL")
  })

  it('TfDebugFatal_3: an empty description is fatal (debug.cpp:165-176)', async () => {
    const { TfDebug, diag } = await freshDebug(undefined)
    expectFatal(diag, () => TfDebug.registerDebugSymbol('FATHER', '\0dasad'),
      "description argument for 'FATHER' is empty -- add description!")
  })
})
