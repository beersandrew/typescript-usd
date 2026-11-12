// Ported from OpenUSD 26.11.1: pxr/usd/sdf/predicateLibrary.cpp,
//  pxr/usd/sdf/predicateLibrary.h, pxr/usd/sdf/predicateProgram.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/sdf/predicateLibrary.{h,cpp} and predicateProgram.h
// (OpenUSD 26.11.1): SdfPredicateParamNamesAndDefaults,
// SdfPredicateLibrary<DomainType>, SdfPredicateProgram<DomainType> and
// SdfLinkPredicateExpression. SdfPredicateFunctionResult lives in
// pathExpression.ts.
//
// C++ deduces each predicate function's parameter types from its signature
// (TfFunctionTraits); TypeScript cannot, so Define() takes the parameter
// types explicitly (`paramTypes`, one per parameter after the domain object,
// 'args' for a trailing std::vector<FnArg>). Binding casts each argument as
// VtValue::Cast<ParamType> does for the values the predicate parser produces
// (bool, int64, double, std::string): arithmetic types cast among each other
// (Vt's registered arithmetic casts), std::string casts to TfToken, nothing
// else converts.

import { Error as TfError, TfDiagnosticMgr, TfDiagnosticType } from 'typescript-usd/tf'
import { SdfPredicateFunctionResult, type SdfPathExprArgValue, type SdfPathExprFnArg } from './pathExpression.ts'

function TF_RUNTIME_ERROR(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.RuntimeError))
}

function TF_CODING_ERROR(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.CodingError))
}

/** The C++ type of a predicate function parameter (after the domain
 *  argument). 'args' is the trailing std::vector<FnArg> bag. */
export type SdfPredicateParamType = 'bool' | 'int' | 'double' | 'string' | 'token' | 'args'

/** A default value: a parsed argument value, or a JS bool/number/string
 *  (VtValue(bool), VtValue(int) or VtValue(double), VtValue(std::string)). */
export type SdfPredicateDefaultValue = SdfPathExprArgValue | boolean | number | string

function _ToArgValue(v: SdfPredicateDefaultValue): SdfPathExprArgValue {
  switch (typeof v) {
    case 'boolean': return { type: 'bool', value: v }
    case 'number': return Number.isInteger(v) ? { type: 'int', value: v } : { type: 'double', value: v }
    case 'string': return { type: 'string', value: v }
  }
  return v
}

/** VtValue::Cast<ParamType>(val): the cast value, or undefined when it does
 *  not convert. */
function _Cast(val: SdfPathExprArgValue | undefined, type: SdfPredicateParamType): unknown {
  if (val === undefined) return undefined
  switch (type) {
    case 'bool':
      if (val.type === 'bool') return val.value
      if (val.type === 'int' || val.type === 'double') return val.value !== 0
      return undefined
    case 'int':
      if (val.type === 'bool') return val.value ? 1 : 0
      if (val.type === 'int') return val.value
      if (val.type === 'double') return Math.trunc(val.value)
      return undefined
    case 'double':
      if (val.type === 'bool') return val.value ? 1 : 0
      if (val.type === 'int' || val.type === 'double') return val.value
      return undefined
    case 'string':
    case 'token':
      return val.type === 'string' ? val.value : undefined
  }
  return undefined
}

/** predicateLibrary.h:37-90 */
export class SdfPredicateParamNamesAndDefaults {
  private readonly _params: { name: string, val: SdfPathExprArgValue | undefined }[]
  private readonly _numDefaults: number

  constructor(params: readonly ({ name: string, val?: SdfPredicateDefaultValue } | string)[] = []) {
    this._params = params.map(p => typeof p === 'string'
      ? { name: p, val: undefined }
      : { name: p.name, val: p.val === undefined ? undefined : _ToArgValue(p.val) })
    this._numDefaults = this._countDefaults()
  }

  /** predicateLibrary.cpp:14-39: check that all defaults are trailing and
   *  names are unique & non-empty. */
  checkValidity(): boolean {
    // Basic check -- names must be unique and nonempty, and any params
    // with defaults must be trailing.
    const names = new Set<string>()
    let seenDefault = false
    for (const param of this._params) {
      if (param.name === '') {
        TF_CODING_ERROR('Predicate parameter names must be nonempty')
        return false
      }
      if (names.has(param.name)) {
        TF_CODING_ERROR(`Duplicate predicate parameter name '${param.name}'`)
        return false
      }
      names.add(param.name)
      if (param.val !== undefined) {
        seenDefault = true
      } else if (seenDefault) {
        TF_CODING_ERROR('Non-default predicate parameters must precede default parameters')
        return false
      }
    }
    return true
  }

  getParams(): readonly { name: string, val: SdfPathExprArgValue | undefined }[] {
    return this._params
  }

  getNumDefaults(): number {
    return this._numDefaults
  }

  /** predicateLibrary.cpp:41-50 */
  private _countDefaults(): number {
    let count = 0
    for (const param of this._params) {
      if (param.val !== undefined) ++count
    }
    return count
  }
}

/** PredicateFunction: std::function<SdfPredicateFunctionResult (DomainType
 *  const &)>. A predicate function may also return a bool
 *  (SdfPredicateFunctionResult(bool) is MayVaryOverDescendants). */
export type SdfPredicateFunction<D> = (obj: D) => SdfPredicateFunctionResult

type _Binder<D> = (args: readonly SdfPathExprFnArg[]) => SdfPredicateFunction<D> | null | undefined

function _AsResult(r: SdfPredicateFunctionResult | boolean): SdfPredicateFunctionResult {
  return typeof r === 'boolean' ? SdfPredicateFunctionResult.makeVarying(r) : r
}

/** predicateLibrary.h:199-781: a library of predicate functions, each bound
 *  to a name, for linking predicate expressions into programs. */
export class SdfPredicateLibrary<D> {
  private readonly _binders = new Map<string, _Binder<D>[]>()

  /** Copy constructor (predicateLibrary.h:221-229). */
  static copy<D, L extends SdfPredicateLibrary<D>>(this: new () => L, other: SdfPredicateLibrary<D>): L {
    const lib = new this()
    for (const [name, binders] of other._binders) {
      lib._binders.set(name, [...binders])
    }
    return lib
  }

  /** predicateLibrary.h:244-269. Register a function with name `name`.
   *  `paramTypes` are the C++ parameter types after the domain argument;
   *  `namesAndDefaults` names (right-aligned) trailing parameters and gives
   *  their defaults. */
  define(
    name: string,
    fn: (obj: D, ...params: never[]) => SdfPredicateFunctionResult | boolean,
    paramTypes: readonly SdfPredicateParamType[] = [],
    namesAndDefaults: SdfPredicateParamNamesAndDefaults | readonly ({ name: string, val?: SdfPredicateDefaultValue } | string)[] = [],
  ): this {
    const nd = namesAndDefaults instanceof SdfPredicateParamNamesAndDefaults
      ? namesAndDefaults : new SdfPredicateParamNamesAndDefaults(namesAndDefaults)
    // _OverloadBinder::TryCreate (predicateLibrary.h:695-704).
    if (SdfPredicateLibrary._checkNamesAndDefaultsWithSignature(paramTypes, nd)) {
      const call = fn as (obj: D, ...params: unknown[]) => SdfPredicateFunctionResult | boolean
      this._push(name, args => SdfPredicateLibrary._tryToBindCall(call, paramTypes, args, nd))
    }
    return this
  }

  /** predicateLibrary.h:271-286. Register a custom binding function for
   *  `name`: it receives the call's arguments and returns a predicate
   *  function, or null if the arguments can't be bound. */
  defineBinder(name: string, binder: _Binder<D>): this {
    this._push(name, binder)
    return this
  }

  private _push(name: string, binder: _Binder<D>): void {
    const list = this._binders.get(name)
    if (list) list.push(binder)
    else this._binders.set(name, [binder])
  }

  /** predicateLibrary.h:290-310 */
  _bindCall(name: string, args: readonly SdfPathExprFnArg[]): SdfPredicateFunction<D> | undefined {
    const binders = this._binders.get(name)
    if (binders === undefined) {
      TF_RUNTIME_ERROR(`No registered function '${name}'`)
      return undefined
    }
    // Run thru optimistically first -- if we fail to bind to any overload,
    // then produce an error message with all the overload signatures.
    for (let i = binders.length - 1; i >= 0; --i) {
      const ret = binders[i]!(args)
      if (ret) return ret
    }
    return undefined
  }

  /** predicateLibrary.h:312-404 _CheckOneNameAndDefault /
   *  _CheckNamesAndDefaultsWithSignature. */
  private static _checkNamesAndDefaultsWithSignature(
    paramTypes: readonly SdfPredicateParamType[], nd: SdfPredicateParamNamesAndDefaults,
  ): boolean {
    // Basic check for declared names & defaults.
    if (!nd.checkValidity()) {
      return false
    }
    const params = nd.getParams()
    const arity = paramTypes.length + 1
    if (params.length > arity - 1) {
      TF_CODING_ERROR(`Predicate named arguments (${params.length}) exceed number of ` +
        `C++ function arguments (${arity - 1})`)
      return false
    }
    let valid = true
    const numParams = paramTypes.length
    for (let index = numParams - 1; index >= 0; --index) {
      const nFromEnd = numParams - index - 1
      if (nFromEnd >= params.length) continue
      const param = params[params.length - nFromEnd - 1]!
      const type = paramTypes[index]!
      if (param.val !== undefined && type !== 'args' && _Cast(param.val, type) === undefined) {
        TF_CODING_ERROR(`Predicate default parameter '${param.name}' value of type ` +
          `'${param.val.type}' cannot convert to c++ argument of type '${type}' at index ${index}`)
        valid = false
      }
    }
    return valid
  }

  /** predicateLibrary.h:406-610 _TryBindOne / _TryBindArgs /
   *  _FillArbitraryArgs / _TryToBindCall. */
  private static _tryToBindCall<D>(
    fn: (obj: D, ...params: unknown[]) => SdfPredicateFunctionResult | boolean,
    paramTypes: readonly SdfPredicateParamType[],
    args: readonly SdfPathExprFnArg[],
    nd: SdfPredicateParamNamesAndDefaults,
  ): SdfPredicateFunction<D> | undefined {
    const arity = paramTypes.length + 1
    const takesArbitraryArgs = arity >= 2 && paramTypes[paramTypes.length - 1] === 'args'
    const minArgs = arity - 1 - nd.getNumDefaults()
    const maxArgs = takesArbitraryArgs ? Infinity : arity - 1
    const numBindableArgs = arity - (takesArbitraryArgs ? 2 : 1)

    if (args.length < minArgs) {
      TF_RUNTIME_ERROR(`Function requires at least ${minArgs} argument${minArgs === 1 ? '' : 's'}, ` +
        `${args.length} given`)
      return undefined
    }
    if (args.length > maxArgs) {
      TF_RUNTIME_ERROR(`Function takes at most ${maxArgs} argument${maxArgs === 1 ? '' : 's'}, ` +
        `${args.length} given`)
      return undefined
    }

    const typedArgs: unknown[] = new Array(paramTypes.length)
    const boundArgs: boolean[] = args.map(() => false)
    let boundAllParams = true
    const params = nd.getParams()
    const numParams = paramTypes.length

    for (let index = 0; index < numBindableArgs; ++index) {
      if (!boundAllParams) break
      const type = paramTypes[index]!
      // namesAndDefaults covers trailing parameters -- that is, there may be
      // zero or more leading unnamed parameters.
      const numUnnamed = numParams - params.length
      const paramNameAndDefault = index >= numUnnamed ? params[index - numUnnamed] : undefined
      const posArg = index < args.length && args[index]!.argName === '' ? args[index] : undefined

      const tryBind = (val: SdfPathExprArgValue, argIndex: number): boolean => {
        const cast = _Cast(val, type)
        if (cast !== undefined) {
          typedArgs[index] = cast
          boundArgs[argIndex] = true
          return true
        }
        boundAllParams = false
        return false
      }

      if (!paramNameAndDefault) {
        // If this is a positional parameter, the arg must be too.
        if (!posArg) {
          boundAllParams = false
          continue
        }
        tryBind(posArg.value, index)
        continue
      } else if (posArg) {
        // Passed a positional arg, try to bind.
        tryBind(posArg.value, index)
        continue
      }

      // Only possibility is a keyword arg.  If there's a matching name, try
      // to bind that, otherwise try to fill a default.
      let matched = false
      for (let i = 0; i < args.length; ++i) {
        if (boundArgs[i]) continue
        if (args[i]!.argName === paramNameAndDefault.name) {
          tryBind(args[i]!.value, i)
          matched = true
          break
        }
      }
      if (matched) continue

      // No matching arg, try to fill default val.
      const cast = _Cast(paramNameAndDefault.val, type)
      if (cast !== undefined) {
        typedArgs[index] = cast
      } else {
        // Error, could not fill default.
        boundAllParams = false
      }
    }

    if (!boundAllParams) {
      return undefined
    }
    if (takesArbitraryArgs) {
      typedArgs[typedArgs.length - 1] = args.filter((_, i) => !boundArgs[i])
    }
    return (obj: D) => _AsResult(fn(obj, ...typedArgs))
  }
}

/** The operations of a linked program (predicateProgram.h:180). */
enum _Op { Call, Not, Open, Close, And, Or }

/** predicateProgram.h:38-183: a predicate expression linked against a
 *  library, ready to evaluate against domain objects. */
export class SdfPredicateProgram<D> {
  /** @internal */ _ops: _Op[] = []
  /** @internal */ _funcs: SdfPredicateFunction<D>[] = []

  /** explicit operator bool (predicateProgram.h:57-60) */
  isValid(): boolean {
    return this._ops.length !== 0
  }

  /** operator() (predicateProgram.h:62-151) */
  call(obj: D): SdfPredicateFunctionResult {
    let result = SdfPredicateFunctionResult.makeConstant(false)
    let nest = 0
    let funcIter = 0
    let opIter = 0
    const opEnd = this._ops.length

    // Helper for short-circuiting "and" and "or" operators.  Advance,
    // ignoring everything until we reach the next Close that brings us to
    // the starting nest level.
    const shortCircuit = (): void => {
      const origNest = nest
      for (; opIter !== opEnd; ++opIter) {
        switch (this._ops[opIter]!) {
          case _Op.Call: ++funcIter; break // Skip calls.
          case _Op.Not: case _Op.And: case _Op.Or: break // Skip operations.
          case _Op.Open: ++nest; break
          case _Op.Close:
            if (--nest === origNest) {
              return
            }
            break
        }
      }
    }

    // Evaluate the predicate expression by processing operations and
    // invoking predicate functions.
    for (; opIter !== opEnd; ++opIter) {
      const op = this._ops[opIter]!
      switch (op) {
        case _Op.Call:
          result = result.setAndPropagateConstancy(this._funcs[funcIter++]!(obj))
          break
        case _Op.Not: result = result.not(); break
        case _Op.And: case _Op.Or: {
          const decidingValue = op !== _Op.And
          // If the and/or result is already the deciding value,
          // short-circuit.  Otherwise the result is the rhs, so continue.
          if (result.GetValue() === decidingValue) {
            shortCircuit()
          }
          break
        }
        case _Op.Open: ++nest; break
        case _Op.Close: --nest; break
      }
    }
    return result
  }
}

/** Something SdfLinkPredicateExpression can walk: SdfPredicateExpression::Walk
 *  (logic(op, argIndex) around each operation, call for each function call). */
export interface SdfPredicateExpressionWalkable {
  walk(
    logic: (op: 'not' | 'and' | 'or', argIndex: number) => void,
    call: (call: { funcName: string, args: readonly SdfPathExprFnArg[] }) => void,
  ): void
}

/** predicateProgram.h:185-270: link `expr` against `lib`, producing a
 *  program. On failure to bind any call, issue a runtime error and return
 *  an empty program. */
export function SdfLinkPredicateExpression<D>(
  expr: SdfPredicateExpressionWalkable,
  lib: SdfPredicateLibrary<D>,
): SdfPredicateProgram<D> {
  // Walk expr and populate prog, binding calls with lib.
  let prog = new SdfPredicateProgram<D>()
  let errs = ''

  const translateLogic = (op: 'not' | 'and' | 'or', argIndex: number): void => {
    switch (op) {
      case 'not': // Not is postfix, RPN-style.
        if (argIndex === 1) {
          prog._ops.push(_Op.Not)
        }
        break
      case 'and': // Binary logic ops are infix to facilitate
      case 'or': // short-circuiting.
        if (argIndex === 1) {
          prog._ops.push(op === 'and' ? _Op.And : _Op.Or)
          prog._ops.push(_Op.Open)
        } else if (argIndex === 2) {
          prog._ops.push(_Op.Close)
        }
        break
    }
  }

  const translateCall = (call: { funcName: string, args: readonly SdfPathExprFnArg[] }): void => {
    // Try to bind the call against library overloads.  If successful,
    // insert a call op and the function.
    const fn = lib._bindCall(call.funcName, call.args)
    if (fn) {
      prog._funcs.push(fn)
      prog._ops.push(_Op.Call)
    } else {
      if (errs !== '') {
        errs += ', '
      }
      errs += 'Failed to bind call of ' + call.funcName
    }
  }

  // Walk the expression and build the "compiled" program.
  expr.walk(translateLogic, translateCall)

  if (errs !== '') {
    prog = new SdfPredicateProgram<D>()
    TF_RUNTIME_ERROR(errs)
  }
  return prog
}
