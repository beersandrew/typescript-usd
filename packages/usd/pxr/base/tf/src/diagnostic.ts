// Ported from OpenUSD 26.11.1: pxr/base/tf/diagnostic.cpp,
//  pxr/base/tf/diagnostic.h, pxr/base/tf/diagnosticBase.h,
//  pxr/base/tf/diagnosticMgr.h, pxr/base/tf/diagnosticTrap.h,
//  pxr/base/tf/errorMark.h, and 1 more cited below
// Copyright 2016, 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Diagnostic adaptation for OpenUSD v26.08 pxr/base/tf/diagnosticBase.h,
// diagnosticMgr.h, diagnosticTrap.h, errorMark.h and errorTransport.h.
// JavaScript has no destructors, so TfErrorMark and TfDiagnosticTrap end their
// lifetime through Dispose() (also [Symbol.dispose] for `using`). A JavaScript
// realm runs one synchronous lane, which plays the role of upstream's
// per-thread error list and mark count (diagnosticMgr.h:513-524).

export enum TfDiagnosticType {
  CodingError = 'CodingError',
  RuntimeError = 'RuntimeError',
  Warning = 'Warning',
  Status = 'Status',
  FatalError = 'FatalError',
}

export interface TfCallContext {
  file?: string
  function?: string
  prettyFunction?: string
  line?: number
}

export class TfDiagnosticBase extends globalThis.Error {
  commentary: string
  readonly diagnosticType: TfDiagnosticType
  readonly context: TfCallContext
  readonly code: unknown
  readonly codeString: string
  readonly quiet: boolean
  #info: unknown

  constructor(
    commentary: string,
    diagnosticType = TfDiagnosticType.RuntimeError,
    context: TfCallContext = {},
    code: unknown = diagnosticType,
    codeString = String(code),
    info?: unknown,
    quiet = false,
  ) {
    super(commentary)
    this.commentary = commentary
    this.diagnosticType = diagnosticType
    this.context = context
    this.code = code
    this.codeString = codeString
    this.#info = info
    this.quiet = quiet
  }
  getContext(): TfCallContext { return this.context }
  getSourceFileName(): string { return this.context.file ?? '' }
  getSourceLineNumber(): number { return this.context.line ?? 0 }
  getSourceFunction(): string { return this.context.prettyFunction ?? this.context.function ?? '' }
  getCommentary(): string { return this.commentary }
  augmentCommentary(value: string): void {
    this.commentary = this.commentary ? `${this.commentary}\n${value}` : value
  }
  getDiagnosticCode(): unknown { return this.code }
  getDiagnosticCodeAsString(): string { return this.codeString }
  getInfo<T>(): T | undefined { return this.#info as T | undefined }
  setInfo(value: unknown): void { this.#info = value }
  getQuiet(): boolean { return this.quiet }
  isFatal(): boolean { return this.diagnosticType === TfDiagnosticType.FatalError }
  isCodingError(): boolean { return this.diagnosticType === TfDiagnosticType.CodingError }
}

export class TfError extends TfDiagnosticBase {
  /** @internal Serial number in the manager's error list (diagnosticBase.h:194). */
  _serial = 0
  constructor(message: string, type = TfDiagnosticType.RuntimeError, context: TfCallContext = {}) {
    super(message, type, context)
  }
  getErrorCode(): unknown { return this.getDiagnosticCode() }
  getErrorCodeAsString(): string { return this.getDiagnosticCodeAsString() }
}
export class TfWarning extends TfDiagnosticBase {
  constructor(message: string, context: TfCallContext = {}) {
    super(message, TfDiagnosticType.Warning, context)
  }
}
export class TfStatus extends TfDiagnosticBase {
  constructor(message: string, context: TfCallContext = {}) {
    super(message, TfDiagnosticType.Status, context)
  }
}

export interface TfDiagnosticDelegate {
  issueError(error: TfError): void
  issueWarning(warning: TfWarning): void
  issueStatus(status: TfStatus): void
  issueFatalError?(context: TfCallContext, message: string): void
}

export class TfDiagnosticMgr {
  static readonly #instance = new TfDiagnosticMgr()
  readonly #delegates: TfDiagnosticDelegate[] = []
  #errorList: TfError[] = []
  readonly #traps: TfDiagnosticTrap[] = []
  #quiet = false
  #reentered = false
  // diagnosticMgr.h:489 and :398-409
  #nextSerial = 0
  #markCount = 0
  static GetInstance(): TfDiagnosticMgr { return this.#instance }
  static getCodeName(code: unknown): string { return String(code) }
  static formatDiagnostic(_code: unknown, context: TfCallContext, message: string): string {
    const source = context.file ? `${context.file}:${context.line ?? 0}: ` : ''
    return `${source}${message}`
  }
  addDelegate(delegate: TfDiagnosticDelegate): void { this.#delegates.push(delegate) }
  removeDelegate(delegate: TfDiagnosticDelegate): void {
    for (let index = this.#delegates.length - 1; index >= 0; index--) {
      if (this.#delegates[index] === delegate) this.#delegates.splice(index, 1)
    }
  }
  setQuiet(quiet: boolean): void { this.#quiet = quiet }

  // Error list iterators are indices into the current lane's list
  // (diagnosticMgr.h:170-177).
  getErrorBegin(): number { return 0 }
  getErrorEnd(): number { return this.#errorList.length }
  /** The error an iterator refers to. */
  getError(index: number): TfError | undefined { return this.#errorList[index] }
  // diagnosticMgr.cpp:541-547
  eraseError(index: number): number {
    if (index < this.#errorList.length) this.#errorList.splice(index, 1)
    return index
  }
  // diagnosticMgr.cpp:574-587
  eraseRange(first: number, last: number): number {
    if (first === last) return last
    this.#errorList.splice(first, last - first)
    return first
  }

  // diagnosticMgr.cpp:250-260: with no active mark the error is reported at
  // once; otherwise it joins the error list under the next serial number.
  appendError(error: TfError): void {
    if (!this.hasActiveErrorMark()) {
      this._reportError(error)
    } else {
      error._serial = this.#nextSerial++
      this.#errorList.push(error)
    }
  }

  // diagnosticMgr.cpp:287-323
  postError(value: TfDiagnosticBase | string): void {
    const diagnostic = value instanceof TfError ? value : new TfError(
      typeof value === 'string' ? value : value.getCommentary(),
      value instanceof TfDiagnosticBase ? value.diagnosticType : undefined,
      value instanceof TfDiagnosticBase ? value.context : undefined,
    )
    this.appendError(diagnostic)
  }
  postWarning(value: TfDiagnosticBase | string): void {
    const diagnostic = value instanceof TfWarning ? value : new TfWarning(
      typeof value === 'string' ? value : value.getCommentary())
    this.#post(diagnostic, delegate => delegate.issueWarning(diagnostic))
  }
  postStatus(value: TfDiagnosticBase | string): void {
    const diagnostic = value instanceof TfStatus ? value : new TfStatus(
      typeof value === 'string' ? value : value.getCommentary())
    this.#post(diagnostic, delegate => delegate.issueStatus(diagnostic))
  }
  postFatal(context: TfCallContext, message: string): never {
    for (const delegate of this.#delegates) delegate.issueFatalError?.(context, message)
    throw new TfError(message, TfDiagnosticType.FatalError, context)
  }

  // diagnosticMgr.h:257-261
  hasActiveErrorMark(): boolean { return this.#markCount > 0 }

  /** @internal diagnosticMgr.cpp:381-404 */
  _reportError(error: TfError): void {
    this.#post(error, delegate => delegate.issueError(error))
  }
  /** @internal diagnosticMgr.cpp:262-285: reserialize and splice a transport. */
  _spliceErrors(src: TfError[]): void {
    if (!this.hasActiveErrorMark()) {
      for (const error of src) this._reportError(error)
    } else {
      for (const error of src) error._serial = this.#nextSerial++
      this.#errorList.push(...src)
    }
    src.length = 0
  }
  /** @internal The serial the next appended error receives. */
  get _nextSerial(): number { return this.#nextSerial }
  /** @internal diagnosticMgr.h:398-402 */
  _createErrorMark(): void { ++this.#markCount }
  /** @internal diagnosticMgr.h:405-409: true when the last mark ends. */
  _destroyErrorMark(): boolean { return --this.#markCount === 0 }
  /** @internal diagnosticMgr.cpp:549-572: first error with serial >= mark. */
  _getErrorMarkBegin(mark: number): { begin: number, count: number } {
    const errorList = this.#errorList
    if (mark >= this.#nextSerial || errorList.length === 0) {
      return { begin: errorList.length, count: 0 }
    }
    let i = errorList.length
    while (i > 0 && errorList[i - 1]!._serial >= mark) --i
    return { begin: i, count: errorList.length - i }
  }
  /** @internal Moves [first, last) out of the list (errorTransport.h:61-68). */
  _takeErrors(first: number, last: number): TfError[] {
    return this.#errorList.splice(first, last - first)
  }
  _pushTrap(trap: TfDiagnosticTrap): void { this.#traps.push(trap) }
  _popTrap(trap: TfDiagnosticTrap): void {
    const index = this.#traps.lastIndexOf(trap)
    if (index >= 0) this.#traps.splice(index, 1)
  }
  // diagnosticMgr.cpp:381-404 and :407-449: a reentrant post is dropped, an
  // active trap captures, then delegates, then the default printer.
  #post(diagnostic: TfDiagnosticBase, deliver: (delegate: TfDiagnosticDelegate) => void): void {
    if (this.#reentered) return
    this.#reentered = true
    try {
      const trap = this.#traps.at(-1)
      if (trap) { trap._capture(diagnostic); return }
      if (this.#delegates.length) for (const delegate of [...this.#delegates]) deliver(delegate)
      else if (!this.#quiet && !diagnostic.getQuiet()) globalThis.console.warn(diagnostic.getCommentary())
    } finally {
      this.#reentered = false
    }
  }
}

export class TfDiagnosticTrap {
  #diagnostics: TfDiagnosticBase[] = []
  #active = true
  constructor() { TfDiagnosticMgr.GetInstance()._pushTrap(this) }
  _capture(value: TfDiagnosticBase): void { this.#diagnostics.push(value) }
  dismiss(): void {
    if (!this.#active) return
    this.#active = false
    TfDiagnosticMgr.GetInstance()._popTrap(this)
    const pending = this.#diagnostics
    this.#diagnostics = []
    for (const diagnostic of pending) {
      if (diagnostic instanceof TfError) TfDiagnosticMgr.GetInstance().postError(diagnostic)
      else if (diagnostic instanceof TfWarning) TfDiagnosticMgr.GetInstance().postWarning(diagnostic)
      else TfDiagnosticMgr.GetInstance().postStatus(diagnostic)
    }
  }
  // diagnosticTrap.h: the destructor dismisses.
  dispose(): void { this.dismiss() }
  [Symbol.dispose](): void { this.dismiss() }
  clear(): void { this.#diagnostics = [] }
  clearErrors(): void { this.#diagnostics = this.#diagnostics.filter(value => !(value instanceof TfError)) }
  clearWarnings(): void { this.#diagnostics = this.#diagnostics.filter(value => !(value instanceof TfWarning)) }
  clearStatuses(): void { this.#diagnostics = this.#diagnostics.filter(value => !(value instanceof TfStatus)) }
  eraseMatching(predicate: (value: TfDiagnosticBase) => boolean): number {
    const before = this.#diagnostics.length
    this.#diagnostics = this.#diagnostics.filter(value => !predicate(value))
    return before - this.#diagnostics.length
  }
  isClean(): boolean { return this.#diagnostics.length === 0 }
  hasErrors(): boolean { return this.#diagnostics.some(value => value instanceof TfError) }
  hasWarnings(): boolean { return this.#diagnostics.some(value => value instanceof TfWarning) }
  hasStatuses(): boolean { return this.#diagnostics.some(value => value instanceof TfStatus) }
  hasAnyMatching(predicate: (value: TfDiagnosticBase) => boolean): boolean { return this.#diagnostics.some(predicate) }
  hasAllMatching(predicate: (value: TfDiagnosticBase) => boolean): boolean { return this.#diagnostics.every(predicate) }
  countMatching(predicate: (value: TfDiagnosticBase) => boolean): number { return this.#diagnostics.filter(predicate).length }
  getErrors(): TfError[] { return this.#diagnostics.filter(value => value instanceof TfError) }
  getWarnings(): TfWarning[] { return this.#diagnostics.filter(value => value instanceof TfWarning) }
  getStatuses(): TfStatus[] { return this.#diagnostics.filter(value => value instanceof TfStatus) }
  forEach(fn: (value: TfDiagnosticBase) => void): void { for (const value of [...this.#diagnostics]) fn(value) }
  // diagnosticTrap.cpp:102-118: move the captured diagnostics into a
  // transport, leaving the trap clean and still active.
  transport(): TfDiagnosticTransport {
    if (this.isClean()) return new TfDiagnosticTransport()
    const transport = new TfDiagnosticTransport(this.#diagnostics)
    this.#diagnostics = []
    return transport
  }
}

// diagnosticTransport.h:23-98 and diagnosticContainer.cpp:15-26: Post()
// re-posts every diagnostic to the current lane in the order it was issued,
// leaving the transport empty. The C++ constructor taking a container is
// private to TfDiagnosticTrap::Transport().
export class TfDiagnosticTransport {
  #diagnostics: TfDiagnosticBase[]
  /** @internal `diagnostics` is used by TfDiagnosticTrap.Transport() only. */
  constructor(diagnostics: TfDiagnosticBase[] = []) { this.#diagnostics = diagnostics }
  post(): void {
    const mgr = TfDiagnosticMgr.GetInstance()
    const diagnostics = this.#diagnostics
    this.#diagnostics = []
    for (const value of diagnostics) {
      if (value instanceof TfError) mgr.postError(value)
      else if (value instanceof TfWarning) mgr.postWarning(value)
      else if (value instanceof TfStatus) mgr.postStatus(value)
    }
  }
  IsEmpty(): boolean { return this.#diagnostics.length === 0 }
}

// errorMark.h:47-166 and errorMark.cpp:27-102. Construction opens the mark;
// Dispose() is the destructor: when the last active mark ends, errors still
// pending since this mark are reported (errorMark.cpp:73-85).
export class TfErrorMark {
  #mark = 0
  #active = true
  constructor() {
    TfDiagnosticMgr.GetInstance()._createErrorMark()
    this.setMark()
  }
  // errorMark.h:71-73
  setMark(): void { this.#mark = TfDiagnosticMgr.GetInstance()._nextSerial }
  // errorMark.h:82-85 and errorMark.cpp:27-32
  isClean(): boolean {
    const mgr = TfDiagnosticMgr.GetInstance()
    if (this.#mark >= mgr._nextSerial) return true
    const b = mgr.getErrorBegin(), e = mgr.getErrorEnd()
    return b === e || mgr.getError(e - 1)!._serial < this.#mark
  }
  // errorMark.h:92-100
  clear(): boolean {
    const mgr = TfDiagnosticMgr.GetInstance()
    const b = this.getBegin(), e = mgr.getErrorEnd()
    if (b !== e) {
      mgr.eraseRange(b, e)
      return true
    }
    return false
  }
  // errorMark.cpp:87-102
  transport(): TfErrorTransport {
    const begin = this.getBegin(), end = this.getEnd()
    if (begin === end) return new TfErrorTransport()
    return new TfErrorTransport(TfDiagnosticMgr.GetInstance()._takeErrors(begin, end))
  }
  // errorMark.h:117-119
  transportTo(dest: TfErrorTransport): void { this.transport().swap(dest) }
  // errorMark.h:136-147: the iterator index of the first error since the mark.
  getBegin(): number { return TfDiagnosticMgr.GetInstance()._getErrorMarkBegin(this.#mark).begin }
  /** GetBegin(&nErrors): the number of errors since the mark. */
  getNumErrors(): number { return TfDiagnosticMgr.GetInstance()._getErrorMarkBegin(this.#mark).count }
  getEnd(): number { return TfDiagnosticMgr.GetInstance().getErrorEnd() }
  begin(): number { return this.getBegin() }
  end(): number { return this.getEnd() }
  /** The errors in [GetBegin(), GetEnd()). */
  getErrors(): readonly TfError[] {
    const mgr = TfDiagnosticMgr.GetInstance()
    const errors: TfError[] = []
    for (let i = this.getBegin(); i < this.getEnd(); i++) errors.push(mgr.getError(i)!)
    return errors
  }
  // A thrown TfError does not post itself; Capture is the JavaScript boundary
  // that posts what `action` throws, so it lands in this mark's range.
  capture(action: () => void): void {
    try { action() } catch (error) {
      TfDiagnosticMgr.GetInstance().postError(error instanceof TfError
        ? error : new TfError(error instanceof globalThis.Error ? error.message : String(error)))
    }
  }
  // errorMark.cpp:73-85 (destructor) and :34-41 (_ReportErrors)
  dispose(): void {
    if (!this.#active) return
    this.#active = false
    const mgr = TfDiagnosticMgr.GetInstance()
    if (mgr._destroyErrorMark() && !this.isClean()) {
      const b = this.getBegin(), e = mgr.getErrorEnd()
      const pending: TfError[] = []
      for (let i = b; i < e; i++) pending.push(mgr.getError(i)!)
      for (const error of pending) mgr._reportError(error)
      mgr.eraseRange(b, b + pending.length)
    }
  }
  [Symbol.dispose](): void { this.dispose() }
}

// errorTransport.h:29-81
export class TfErrorTransport {
  #errorList: TfError[]
  constructor(errors: TfError[] = []) { this.#errorList = errors }
  post(): void {
    if (!this.IsEmpty()) TfDiagnosticMgr.GetInstance()._spliceErrors(this.#errorList)
  }
  IsEmpty(): boolean { return this.#errorList.length === 0 }
  swap(other: TfErrorTransport): void {
    const errors = this.#errorList
    this.#errorList = other.#errorList
    other.#errorList = errors
  }
}

// errorMark.h:184-185
export function TF_HAS_ERRORS(marker: TfErrorMark, expr: () => void): boolean {
  marker.setMark()
  expr()
  return !marker.isClean()
}

export function TfRaiseError(message: string): never { throw new TfError(message) }
export function TfRaiseWarning(message: string): void {
  TfDiagnosticMgr.GetInstance().postWarning(message)
}
export function TfLogCrash(message: string): never {
  throw new TfError(message, TfDiagnosticType.FatalError)
}

// The posting macros of diagnostic.h (OpenUSD 26.11.1 pxr/base/tf/diagnostic.h:
// TF_CODING_ERROR 311, TF_RUNTIME_ERROR 340, TF_FATAL_ERROR 347, TF_WARN 377,
// TF_STATUS 383, TF_VERIFY 399, TF_AXIOM and TF_DEV_AXIOM 194-210).
// Callers pass the formatted message; TF_VERIFY and TF_AXIOM cannot quote
// the C++ expression text, so they take it (or the message) as a string.

/** TF_CODING_ERROR (diagnostic.h:311). */
export function TF_CODING_ERROR(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.CodingError))
}

/** TF_RUNTIME_ERROR (diagnostic.h:340). */
export function TF_RUNTIME_ERROR(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.RuntimeError))
}

/**
 * TF_WARN (diagnostic.h:377). The macro captures TF_CALL_CONTEXT
 * (callContext.h); JavaScript has no __FILE__/__LINE__, so a caller that
 * needs the source location passes it as `context`.
 */
export function TF_WARN(message: string, context: TfCallContext = {}): void {
  TfDiagnosticMgr.GetInstance().postWarning(new TfWarning(message, context))
}

/** TF_STATUS (diagnostic.h:383); `context` as for TF_WARN. */
export function TF_STATUS(message: string, context: TfCallContext = {}): void {
  TfDiagnosticMgr.GetInstance().postStatus(new TfStatus(message, context))
}

/** TF_FATAL_ERROR (diagnostic.h:347): throws. */
export function TF_FATAL_ERROR(message: string): never {
  throw new TfError(message, TfDiagnosticType.FatalError)
}

/**
 * TF_VERIFY (diagnostic.h:399): posts a coding error
 * "Failed verification: ' <expression> '" when cond is false, and returns
 * cond. `expression` stands in for the stringized C++ condition; `message`
 * is the optional format argument.
 */
export function TF_VERIFY(cond: unknown, expression = '', message?: string): boolean {
  if (cond) return true
  TF_CODING_ERROR(`Failed verification: ' ${expression} '${message ? ` -- ${message}` : ''}`)
  return false
}

/** TF_AXIOM (diagnostic.h:194): a failed axiom is fatal (throws). */
export function TF_AXIOM(cond: unknown, expression = ''): asserts cond {
  if (!cond) TF_FATAL_ERROR(`Failed axiom: ' ${expression} '`)
}

/** TF_DEV_AXIOM (diagnostic.h:206): checked in every build here. */
export function TF_DEV_AXIOM(cond: unknown, expression = ''): asserts cond {
  if (!cond) TF_FATAL_ERROR(`Failed axiom: ' ${expression} '`)
}
