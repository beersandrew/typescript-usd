// The interpreter console of OpenUSD 26.11.1 usdviewq/pythonInterpreter.py
// (Controller, :194-622; View, :624-892; Myconsole, :908-923), for any
// language behind src/interpreter-language.ts. Each language gets its own
// panel of this console (Window > TypeScript Interpreter, Window > Python
// Interpreter); appController.py:2690-2707 _showInterpreter makes it once and
// shows it again on later requests.
//
// PLATFORM-DIVERGENCE(usdview-tool-windows): the QDialog is a panel inside
// the viewer (src/hydra-scene-debugger-view.ts).
//
// The QTextEdit with a protected input region is a scrollback of output with
// the input line, a one-line text field after the prompt, at its end. The
// Clear button, which usdview's console lacks, empties the scrollback and
// abandons a multi-line entry.
//
// An entry that changes the stage refreshes the viewer's views when it
// finishes, as usdview's _onPrimsChanged does for every change of its stage
// (appController.py:5502-5506 -> _updateForStageChanges, :2493-2509:
// updateGUI; a prim resync resets the prim view, :1951-1976). The viewer's
// own commands refresh what they change themselves, so here the console
// watches the stage's ObjectsChanged notices while its entry runs.
//
// This module loads on first use (tests/code-splitting.test.ts).
import { Notice as TfNotice } from 'typescript-usd/tf'
import { Notice as UsdNotice, type Stage } from 'typescript-usd/usd'
import { ToolWindow } from './hydra-scene-debugger-view'
import type { InterpreterLanguage, InterpreterLanguageFactory, InterpreterOutputStyle } from './interpreter-language'
import type { InterpreterPeerRegistry } from './shared-variables'
import { frequentlyUsed, usdviewApiDocs, type UsdviewApi } from './usdview-api'

/** pythonInterpreter.py:899-905 INITIAL_PROMPT (spec and layer are not in this viewer's usdviewApi). */
export const initialPrompt = `
Use the \`usdviewApi\` variable to interact with UsdView.
Type \`help(usdviewApi)\` to view available API methods and properties.

Frequently used properties:
${frequentlyUsed.map(name => `    usdviewApi.${name} - ${usdviewApiDocs[name]}\n`).join('')}
`

export const interpreterStyles = `
.interpreter-window { min-width:360px; min-height:200px; }
.interpreter-window .interp-console { flex:1; overflow:auto; margin:0 6px 6px; padding:2px 4px; background:#2b2b2b; border:1px solid #252525; font-family:Menlo,Monaco,Consolas,monospace; font-size:var(--usd-base-font); line-height:1.3; cursor:text; }
.interpreter-window .interp-log { margin:0; white-space:pre-wrap; word-break:break-all; font:inherit; user-select:text; }
.interpreter-window .interp-syntaxError { color:#ffcc63; }
.interpreter-window .interp-traceback { color:#ff0000; }
.interpreter-window .interp-line { display:flex; align-items:baseline; }
.interpreter-window .interp-prompt { white-space:pre; }
.interpreter-window .interp-input { flex:1; min-width:0; margin:0; padding:0; border:0; outline:none; resize:none; overflow:hidden; background:transparent; color:inherit; font:inherit; line-height:inherit; height:1.3em; white-space:pre; }
.interpreter-window .interp-loading { color:#aaa; }
`

const panelHtml = (kind: string, title: string) => `<section class="tool-window interpreter-window ${kind}-interpreter" role="dialog" aria-label="${title}" hidden><header><h2>${title}</h2><button type="button" class="interp-clear">Clear</button><button type="button" class="tool-close" aria-label="Close ${title}">✕</button></header>
<div class="interp-console" role="log"><pre class="interp-log"></pre><div class="interp-line"><span class="interp-prompt"></span><textarea class="interp-input" rows="1" spellcheck="false" autocomplete="off" aria-label="${title} input" disabled></textarea></div></div></section>`

/** One language's console: pythonInterpreter.py's Controller and View. */
export class InterpreterConsole {
  /** :221-230 last line + earlier incomplete lines, and the history. */
  lines: string[] = []
  more = false
  history: string[] = []
  historyPointer: number | null = null
  historyInput = ''
  #prompt = ''
  #queue: Promise<void> = Promise.resolve()
  readonly #log: HTMLElement
  readonly #input: HTMLTextAreaElement
  readonly #promptElement: HTMLElement
  readonly #scroller: HTMLElement

  /** The stage an entry may edit, and what to do when it did
   *  (`resynced`: a prim was added, removed or recomposed). */
  stageEdits: { stage: () => Stage | null, changed: (resynced: boolean) => void } | undefined

  constructor(readonly element: HTMLElement, readonly language: InterpreterLanguage) {
    this.#log = element.querySelector('.interp-log')!
    this.#input = element.querySelector('.interp-input')!
    this.#promptElement = element.querySelector('.interp-prompt')!
    this.#scroller = element.querySelector('.interp-console')!
    // :268-283: auto-imports (the language seeds them), the banner, the initial prompt, ps1.
    this.write(`${language.banner}\n`)
    this.write(initialPrompt)
    if (language.sharedHint) this.write(`${language.sharedHint}\n\n`)
    this.#setPrompt(language.ps1)
    this.#input.disabled = false
  }

  get input(): HTMLTextAreaElement { return this.#input }
  /** The scrollback's text, prompts and input included. */
  get text(): string { return this.#log.textContent ?? '' }

  bind(signal: AbortSignal): void {
    const options = { signal }
    this.#input.addEventListener('keydown', event => this.#keyDown(event), options)
    this.#input.addEventListener('paste', event => {
      const text = event.clipboardData?.getData('text/plain')
      if (text === undefined || !/[\r\n]/.test(text)) return
      event.preventDefault()
      this.paste(text)
    }, options)
    this.#scroller.addEventListener('click', () => { if (!getSelection?.()?.toString()) this.#input.focus() }, options)
    this.element.querySelector('.interp-clear')!.addEventListener('click', () => this.clear(), options)
  }

  /** :385-412 write: appends to the scrollback in the output brush. */
  write(text: string, style: InterpreterOutputStyle = 'output'): void {
    if (!text) return
    const last = this.#log.lastChild as HTMLElement | null
    if (style === 'output' && last && last.nodeType === Node.TEXT_NODE) (last as unknown as Text).appendData(text)
    else if (style === 'output') this.#log.append(text)
    else {
      const span = document.createElement('span')
      span.className = `interp-${style}`
      span.textContent = text
      this.#log.append(span)
    }
    this.#scroller.scrollTop = this.#scroller.scrollHeight
  }

  #setPrompt(prompt: string) { this.#prompt = prompt; this.#promptElement.textContent = prompt }

  /** Runs the input line as Return does (:322-326, 591-615 _Run); entries queue while one runs. */
  enter(): Promise<void> {
    const line = this.#input.value
    this.#input.value = ''
    return this.#queue = this.#queue.then(() => this.#run(line))
  }
  /** Runs `source` as if it had been typed and Return pressed. */
  run(source: string): Promise<void> { this.#input.value = source; return this.enter() }

  async #run(inputLine: string): Promise<void> {
    this.historyPointer = null
    if (inputLine !== '') this.history.push(inputLine)
    this.lines.push(inputLine)
    const source = this.lines.join('\n')
    this.write(`${this.#prompt}${inputLine}\n`)
    this.#promptElement.textContent = ''
    // rootDataModel.py:84-102: a resynced prim path is a structural change.
    let changed = false, resynced = false
    const stage = this.stageEdits?.stage() ?? null
    const listener = stage ? TfNotice.Register(UsdNotice.ObjectsChanged, (notice: UsdNotice.ObjectsChanged) => {
      changed = true
      if (!resynced) for (const path of notice.getResyncedPaths()) if (!path.includes('.')) { resynced = true; break }
    }, stage) : undefined
    try {
      this.more = await this.language.runSource(source, { write: (text, style) => this.write(text, style) })
    } catch (error) {
      this.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`, 'traceback')
      this.more = false
    } finally {
      listener?.revoke()
    }
    if (changed) {
      try { this.stageEdits!.changed(resynced) } catch (error) { this.write(`${error instanceof Error ? error.message : String(error)}\n`, 'traceback') }
    }
    if (this.more) this.#setPrompt(this.language.ps2)
    else { this.#setPrompt(this.language.ps1); this.lines = [] }
  }

  /** :742-759 insertFromMimeData: each pasted line but the last is entered. */
  paste(text: string): Promise<void> {
    const lines = text.replace(/\r/g, '').split('\n')
    if (lines.at(-1) === '') lines.pop()
    const start = this.#input.selectionStart ?? this.#input.value.length, end = this.#input.selectionEnd ?? start
    const before = this.#input.value.slice(0, start), after = this.#input.value.slice(end)
    let done = this.#queue
    lines.forEach((line, index) => {
      const text = (index === 0 ? before : '') + line
      if (index < lines.length - 1) done = this.#queue = this.#queue.then(() => this.#run(text))
      else this.#input.value = text + after
    })
    return done
  }

  /** Empties the scrollback and starts a new prompt. */
  clear(): void {
    this.#log.replaceChildren()
    this.lines = []; this.more = false
    this.#setPrompt(this.language.ps1)
    this.#input.value = ''
    this.#input.focus()
  }

  /** :541-553 _NextSlot */
  next(): void {
    if (!this.history.length || this.historyPointer === null) return
    if (this.historyPointer === this.history.length - 1) {
      this.#input.value = this.historyInput
      this.historyPointer = null
      return
    }
    this.historyPointer += 1
    this.#recall()
  }
  /** :555-566 _PrevSlot */
  prev(): void {
    if (!this.history.length) return
    if (this.historyPointer === null) {
      this.historyPointer = this.history.length
      this.historyInput = this.#input.value
    } else if (this.historyPointer <= 0) return
    this.historyPointer -= 1
    this.#recall()
  }
  /** :617-622 _Recall */
  #recall() { this.#input.value = this.history[this.historyPointer!]!; this.#moveToEnd(false) }

  #moveToStart(select: boolean) { const end = select ? this.#input.selectionEnd : 0; this.#input.setSelectionRange(0, end, select ? 'backward' : 'none') }
  #moveToEnd(select: boolean) { const length = this.#input.value.length; this.#input.setSelectionRange(select ? this.#input.selectionStart : length, length) }

  /** :761-852 keyPressEvent. Terminal navigation (Ctrl+P/N/A/E) uses the
   *  Control key on every platform, as terminals do. */
  #keyDown(event: KeyboardEvent): void {
    const ctrl = event.ctrlKey && !event.metaKey && !event.altKey
    const key = event.key
    if (key === 'Enter' && !event.isComposing) { event.preventDefault(); void this.enter() }
    else if (key === 'ArrowUp' || (ctrl && (key === 'p' || key === 'P'))) { event.preventDefault(); this.prev() }
    else if (key === 'ArrowDown' || (ctrl && (key === 'n' || key === 'N'))) { event.preventDefault(); this.next() }
    else if (key === 'Home' || (ctrl && (key === 'a' || key === 'A'))) { event.preventDefault(); this.#moveToStart(event.shiftKey) }
    else if (key === 'End' || (ctrl && (key === 'e' || key === 'E'))) { event.preventDefault(); this.#moveToEnd(event.shiftKey) }
    else if (key === 'Tab' && !event.shiftKey) { event.preventDefault(); this.complete() }
    else return
    event.stopPropagation()
  }

  /** :422-539 _CompleteSlot: one completion replaces the token; several are
   *  listed in columns, then the token completes to their common prefix. */
  complete(): void {
    const line = this.#input.value, cursor = this.#input.selectionStart ?? line.length
    const tokens = line.slice(0, cursor).split(/\s+/).filter(Boolean)
    const token = tokens.at(-1) ?? ''
    const completions = this.language.complete(token)
    if (!completions.length) return
    const i = line.slice(0, cursor).lastIndexOf(token)
    if (completions.length === 1) {
      this.#input.value = line.slice(0, i) + completions[0] + line.slice(i + token.length)
      const position = cursor + completions[0]!.length - token.length
      this.#input.setSelectionRange(position, position)
      return
    }
    completions.sort()
    this.write(`${this.#prompt}${line}\n`)
    // :449-496: as many columns of the longest completion (plus two) as fit;
    // filled column by column.
    const width = Math.floor(this.#scroller.clientWidth / Math.max(1, this.#charWidth()))
    const maxLength = Math.max(...completions.map(c => c.length)) + 2
    const numCols = Math.max(1, Math.floor(width / maxLength)), numRows = Math.floor(completions.length / numCols) + 1
    const cells: string[][] = Array.from({ length: numRows }, () => Array<string>(numCols).fill(''))
    let index = 0
    for (let col = 0; col < numCols; col++) for (let row = 0; row < numRows; row++) {
      if (row * numCols + col >= completions.length) continue
      cells[row]![col] = completions[index++]!
    }
    this.write(`${cells.map(row => row.map(cell => cell.padEnd(maxLength)).join('').trimEnd()).filter(Boolean).join('\n')}\n`)
    const prefix = completions.reduce((a, b) => { let n = 0; while (n < a.length && a[n] === b[n]) n++; return a.slice(0, n) })
    const textToRight = line.slice(i + token.length)
    this.#input.value = line.slice(0, i) + prefix + textToRight
    const position = this.#input.value.length - textToRight.length
    this.#input.setSelectionRange(position, position)
  }
  #charWidth(): number {
    const size = parseFloat(getComputedStyle(this.#scroller).fontSize) || 10
    return size * 0.6
  }
}

/** One language's interpreter panel. The console and the language load the
 *  first time it is shown. */
export class InterpreterWindow {
  #console: InterpreterConsole | undefined
  #loading: Promise<InterpreterConsole> | undefined
  readonly #window: ToolWindow
  readonly element: HTMLElement
  constructor(root: ShadowRoot, private readonly _kind: string, title: string, private readonly _factory: InterpreterLanguageFactory,
    private readonly _usdviewApi: UsdviewApi, private readonly _signal: AbortSignal,
    private readonly _stageEdited?: (resynced: boolean) => void,
    private readonly _peers?: InterpreterPeerRegistry) {
    if (!root.querySelector('style[data-interpreter]')) {
      const style = document.createElement('style'); style.dataset.interpreter = ''; style.textContent = interpreterStyles
      root.append(style)
    }
    const template = document.createElement('template')
    template.innerHTML = panelHtml(_kind, title)
    this.element = template.content.firstElementChild as HTMLElement
    root.append(this.element)
    // appController.py:2700-2703: beside the main window, 600 wide and half its height.
    this.#window = new ToolWindow(this.element, Math.max(10, innerWidth - 620), 60, 600, Math.max(240, Math.round(innerHeight / 2)))
    this.#window.bind(_signal)
  }
  get shown(): boolean { return this.#window.shown }
  get console(): InterpreterConsole | undefined { return this.#console }

  /** appController.py:2690-2707 _showInterpreter */
  async show(): Promise<InterpreterConsole> {
    this.#window.show()
    this.element.parentNode?.append(this.element)
    this.#loading ??= this._factory({ usdviewApi: this._usdviewApi, ...this._peers ? { peers: this._peers } : {} }).then(language => {
      if (this._kind === 'typescript' || this._kind === 'python') this._peers?.register(this._kind, language)
      const console = this.#console = new InterpreterConsole(this.element, language)
      if (this._stageEdited) console.stageEdits = { stage: () => this._usdviewApi.stage, changed: this._stageEdited }
      console.bind(this._signal)
      return console
    }).catch(error => {
      this.#loading = undefined
      const log = this.element.querySelector('.interp-log')!
      log.textContent = `The ${this._kind} interpreter failed to load: ${error instanceof Error ? error.message : String(error)}\n`
      throw error
    })
    const console = await this.#loading
    console.input.focus()
    return console
  }
  hide(): void { this.#window.hide() }
}
