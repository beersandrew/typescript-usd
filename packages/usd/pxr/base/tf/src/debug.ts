// Ported from OpenUSD 26.11.1: pxr/base/tf/debug.cpp, pxr/base/tf/debug.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TfDebug registry and wildcard control, ported from OpenUSD v26.11.1
// pxr/base/tf/debug.h:122-379 and debug.cpp. Debug codes are named by string
// (TF_DEBUG_CODES enums have no TypeScript counterpart), so the C++ per-enum
// _Node caches collapse into the registry's name tables.
import { TfDiagnosticMgr } from './diagnostic.ts'

type Output = { log(message: string): unknown } | { write(message: string): unknown }
let output: Output = globalThis.console

function getenv(name: string): string {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.[name] ?? ''
}

// debug.cpp:65-101
function checkSymbolAgainstPatterns(enumName: string, patterns: readonly string[]):
    { matched: boolean, enabled: boolean } {
  const result = { matched: false, enabled: false }
  for (let pattern of patterns) {
    if (pattern === '') continue
    let value = true
    if (pattern[0] === '-') {
      pattern = pattern.slice(1)
      value = false
    }
    if (pattern === '') continue
    if (pattern.endsWith('*')) {
      pattern = pattern.slice(0, -1)
      if (enumName.startsWith(pattern)) {
        result.matched = true
        result.enabled = value
      }
    } else if (pattern === enumName) {
      result.matched = true
      result.enabled = value
    }
  }
  return result
}

// debug.cpp:103-342 (Tf_DebugSymbolRegistry). std::map iteration order is
// the sorted key order, which the name and description queries reproduce.
class Tf_DebugSymbolRegistry {
  // _namesToNodes: every known symbol name (registered or set by name).
  readonly namesToNodes = new Set<string>()
  // _registeredNames: name -> description.
  readonly registeredNames = new Map<string, string>()
  // _namesToExplicitEnabledState
  readonly namesToExplicitEnabledState = new Map<string, boolean>()
  // debug.cpp:284: the TF_DEBUG tokens, read once when the registry is made.
  readonly envTokens: string[]

  constructor() {
    this.envTokens = getenv('TF_DEBUG').split(/\s+/).filter(token => token !== '')
  }

  // debug.cpp:113-145
  Register(name: string, description: string): void {
    if (this.registeredNames.has(name)) {
      TfDiagnosticMgr.GetInstance().postFatal({},
        `[TF_DEBUG_ENVIRONMENT_SYMBOL] multiple debug symbol definitions for '${name}'.  ` +
        'This is usually due to software misconfiguration, such as multiple versions of ' +
        'the same shared library loaded simultaneously in the process.  ' +
        'Please check your build configuration.')
    }
    this.registeredNames.set(name, description)
    this.namesToNodes.add(name)
  }

  // debug.cpp:165-174
  getEnabledState(name: string): boolean {
    const explicit = this.namesToExplicitEnabledState.get(name)
    if (explicit !== undefined) return explicit
    return checkSymbolAgainstPatterns(name, this.envTokens).enabled
  }

  // debug.cpp:176-215
  setByPattern(pattern: string, matches: string[]): void {
    if (pattern === '' || pattern === '-') return
    for (const name of [...this.namesToNodes].sort()) {
      const check = checkSymbolAgainstPatterns(name, [pattern])
      if (check.matched) {
        matches.push(name)
        this.namesToExplicitEnabledState.set(name, check.enabled)
      }
    }
  }

  // debug.cpp:217-236
  setByName(name: string, enabled: boolean): void {
    this.namesToNodes.add(name)
    this.namesToExplicitEnabledState.set(name, enabled)
  }

  // debug.cpp:243-261
  getDescriptions(): string {
    let result = ''
    for (const name of [...this.registeredNames.keys()].sort()) {
      const description = this.registeredNames.get(name)!
      if (name.length < 25) {
        result += `${name}${' '.repeat(25 - name.length)}: ${description}\n`
      } else {
        result += `${name}:\n${' '.repeat(25)}  ${description}\n`
      }
    }
    return result
  }
}

let registry: Tf_DebugSymbolRegistry | undefined
// debug.cpp:109-111: the registry singleton is made on first use.
const getRegistry = (): Tf_DebugSymbolRegistry => registry ??= new Tf_DebugSymbolRegistry()

export class TfDebug {
  // debug.cpp:455-472 (_RegisterDebugSymbolImpl, the TF_DEBUG_ENVIRONMENT_SYMBOL
  // path): a missing or empty description is a fatal error, as is registering
  // a name twice (debug.cpp:119-127).
  static registerDebugSymbol(name: string, description: string): void {
    if (description === null || description === undefined) {
      TfDiagnosticMgr.GetInstance().postFatal({},
        `description argument for '${name}' is NULL`)
    } else if (description === '' || description[0] === '\0') {
      TfDiagnosticMgr.GetInstance().postFatal({},
        `description argument for '${name}' is empty -- add description!`)
    }
    getRegistry().Register(name, description)
  }

  // debug.h:126-143 (Enable/Disable -> _SetNode -> debug.cpp:217-236)
  static enable(name: string): void { getRegistry().setByName(name, true) }
  static disable(name: string): void { getRegistry().setByName(name, false) }
  // debug.h EnableAll<T>/DisableAll<T> set every code of one TF_DEBUG_CODES
  // enum; with string codes this is every known symbol.
  static enableAll(): void { for (const name of getRegistry().namesToNodes) this.enable(name) }
  static disableAll(): void { for (const name of getRegistry().namesToNodes) this.disable(name) }
  static isEnabled(name: string): boolean { return getRegistry().getEnabledState(name) }
  static isCompileTimeEnabled(): boolean { return true }
  static getNumDebugCodes(): number { return getRegistry().namesToNodes.size }

  // debug.cpp:345-352
  static setDebugSymbolsByName(pattern: string, value: boolean): string[] {
    const matches: string[] = []
    getRegistry().setByPattern((value ? '' : '-') + pattern, matches)
    return matches
  }

  // debug.cpp:354-376
  static isDebugSymbolNameEnabled(name: string): boolean { return getRegistry().getEnabledState(name) }
  static getDebugSymbolNames(): string[] { return [...getRegistry().namesToNodes].sort() }
  static getDebugSymbolDescription(name: string): string {
    return getRegistry().registeredNames.get(name) ?? ''
  }
  static getDebugSymbolDescriptions(): string { return getRegistry().getDescriptions() }
  static setOutputFile(next: Output): Output {
    const previous = output
    output = next
    return previous
  }
  static msg(name: string, message: string): void {
    if (!this.isEnabled(name)) return
    if ('write' in output) output.write(message)
    else output.log(message)
  }
}

export const Debug = TfDebug
