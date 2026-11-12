// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/appController.py,
//  pxr/usdImaging/usdviewq/hydraSceneDebugger.py
// Copyright 2016, 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The Hydra Scene Debugger's windows (Window > Hydra Scene Debugger), the DOM
// side of src/hydra-scene-debugger.ts. Layout follows OpenUSD 26.11.1
// usdviewq/hydraSceneDebugger.py:31-86 (a toolbar with Choose Scene Index,
// Inputs, the name label and Show Notice Logger above a horizontal splitter of
// the prim tree, the data source tree and the value view) and 749-806 (the
// notice logger: Start/Stop Recording, the label and Clear above its tree).
// appController.py:2723-2728 makes the debugger once and shows it again on
// later requests; the 16 ms notice poll runs from then on
// (hydraSceneDebugger.py:82-85), whether the window is shown or not.
//
// PLATFORM-DIVERGENCE(usdview-tool-windows): usdview opens these as separate
// top-level Qt windows. A web component cannot open native windows, so each is
// a movable, resizable, non-modal panel inside the viewer.
//
// The model (and with it the library's imaging modules) loads on first use,
// keeping imaging out of the viewer's static entry graph
// (tests/code-splitting.test.ts).
import type {
  HydraSceneDebuggerModel, InputMenuItem, NameLabel, TreeItem, TreeWidget,
} from './hydra-scene-debugger'
type DebuggerModule = typeof import('./hydra-scene-debugger')

/** Coalesces renders to the next frame (a timer where there are no frames). */
const nextFrame = (callback: () => void) => typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : setTimeout(callback, 16)

export const hydraSceneDebuggerStyles = `
.tool-window { position:fixed; z-index:30; display:flex; flex-direction:column; background:#383838; border:1px solid #131313; box-shadow:0 8px 30px #0008; resize:both; overflow:hidden; min-width:320px; min-height:200px; }
.tool-window>header { display:flex; align-items:center; gap:6px; padding:3px 6px; background:#2c2c2c; cursor:move; user-select:none; }
.tool-window>header>h2 { flex:1; margin:0; font-size:inherit; font-weight:normal; text-align:center; }
.tool-window>header>button { min-height:16px; padding:0 6px; }
.tool-toolbar { display:flex; align-items:center; gap:6px; padding:6px; }
.tool-toolbar>.tool-label { flex:10; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tool-menu { position:relative; }
.tool-menu>.menu-popup { max-height:60vh; overflow:auto; }
.tool-menu .input-tree { list-style:none; margin:0; padding:2px 0; }
.tool-menu .input-tree ul { list-style:none; margin:0; padding:0 0 0 16px; }
.tool-menu .input-tree button { display:block; width:100%; border:0; border-radius:0; background:transparent; text-align:left; white-space:nowrap; padding:1px 10px; min-height:0; }
.tool-menu .input-tree button:hover { background:#be9c55; color:#363636; }
.hsd-panes { flex:1; display:flex; min-height:0; padding:0 6px 6px; gap:4px; }
.hsd-pane { display:flex; flex-direction:column; min-width:60px; min-height:0; border:1px solid #252525; background:#373737; }
.hsd-pane.si-pane,.hsd-pane.ds-pane { flex:none; width:34%; resize:horizontal; overflow:hidden; }
.hsd-pane.value-pane { flex:1; }
.tool-tree-header,.tool-tree-row { display:grid; grid-template-columns:var(--tool-columns,minmax(0,1fr)); align-items:center; }
.tool-tree-header { background:#2f2f2f; border-bottom:1px solid #252525; font-size:var(--usd-small-font); }
.tool-tree-header>span { padding:2px 4px; border-right:1px solid #252525; white-space:nowrap; overflow:hidden; }
.tool-tree-body { flex:1; overflow:auto; outline:none; }
.tool-tree-row { min-height:16px; white-space:nowrap; cursor:default; }
.tool-tree-row:hover { background:rgb(70,70,70); }
.tool-tree-row.selected { background:rgb(189,155,84); color:#363636; }
.tool-tree-row>.tool-cell { overflow:hidden; text-overflow:ellipsis; padding:0 4px; }
.tool-tree-row>.tool-cell:first-child { display:flex; align-items:center; padding-left:calc(var(--depth) * 16px); }
.tool-tree-row .toggle { flex:none; }
.tool-tree-body:focus-visible .tool-tree-row.selected { outline:1px solid #e3e3e3; outline-offset:-1px; }
.value-table { width:100%; border-collapse:collapse; table-layout:fixed; }
.value-table th { background:#2f2f2f; font-weight:normal; font-size:var(--usd-small-font); text-align:left; padding:2px 4px; border-bottom:1px solid #252525; }
.value-table th.index { width:10ch; }
.value-table td { padding:0 4px; white-space:pre-wrap; word-break:break-all; vertical-align:top; }
.hsd-context-menu { position:fixed; z-index:40; }
`

const windowHtml = (kind: string, title: string, body: string) =>
  `<section class="tool-window ${kind}" role="dialog" aria-label="${title}" hidden><header><h2>${title}</h2><button type="button" class="tool-close" aria-label="Close ${title}">✕</button></header>${body}</section>`

/** The debugger and notice logger windows (hidden until opened). */
export const hydraSceneDebuggerHtml = windowHtml('hsd-window', 'Hydra Scene Debugger', `
<div class="tool-toolbar">
  <div class="tool-menu"><button type="button" class="hsd-choose" aria-haspopup="menu">Choose Scene Index ▾</button><div class="menu-popup hsd-choose-popup" role="menu" hidden></div></div>
  <div class="tool-menu"><button type="button" class="hsd-inputs" aria-haspopup="menu">Inputs ▾</button><div class="menu-popup hsd-inputs-popup" role="menu" hidden></div></div>
  <span class="tool-label hsd-label"></span>
  <button type="button" class="hsd-show-logger">Show Notice Logger</button>
</div>
<div class="hsd-panes">
  <div class="hsd-pane si-pane" style="--tool-columns:minmax(0,1fr) 10ch"><div class="tool-tree-header"><span>Name</span><span>Type</span></div><div class="tool-tree-body hsd-si-tree" role="tree" aria-label="Scene index prims" tabindex="0"></div></div>
  <div class="hsd-pane ds-pane"><div class="tool-tree-header"><span>Name</span></div><div class="tool-tree-body hsd-ds-tree" role="tree" aria-label="Data sources" tabindex="0"></div></div>
  <div class="hsd-pane value-pane"><div class="tool-tree-body hsd-value" aria-label="Data source value"></div></div>
</div>
<div class="menu-popup hsd-context-menu" role="menu" hidden></div>`) + windowHtml('hsd-logger-window', 'Notice Logger', `
<div class="tool-toolbar">
  <button type="button" class="hsd-record">Start Recording</button>
  <span class="tool-label hsd-logger-label"></span>
  <button type="button" class="hsd-clear">Clear</button>
</div>
<div class="hsd-panes"><div class="hsd-pane value-pane" style="--tool-columns:384px minmax(0,1fr)"><div class="tool-tree-header"><span>Notice Type/ Prim Path</span><span>Value</span></div><div class="tool-tree-body hsd-log" role="tree" aria-label="Notices" tabindex="0"></div></div></div>`)

/** "<b><i>( display name )</i></b> suffix" (hydraSceneDebugger.py:167-168). */
function renderLabel(host: HTMLElement, label: NameLabel | undefined): void {
  if (!label) { host.replaceChildren(); return }
  const b = document.createElement('b'), i = document.createElement('i')
  i.textContent = `( ${label.displayName} )`
  b.append(i)
  host.replaceChildren(b, ` ${label.suffix}`)
}

interface RowOptions { columns: number }
/** Renders a TreeWidget's visible rows: an item's children show while it is expanded. */
function renderTree(host: HTMLElement, tree: TreeWidget, { columns }: RowOptions, rows: Map<HTMLElement, TreeItem>): void {
  rows.clear()
  const fragment = document.createDocumentFragment()
  const visit = (item: TreeItem, depth: number) => {
    const row = document.createElement('div')
    row.className = 'tool-tree-row'
    row.setAttribute('role', 'treeitem')
    row.style.setProperty('--depth', String(depth))
    if (item.isSelected()) { row.classList.add('selected'); row.setAttribute('aria-selected', 'true') }
    const first = document.createElement('span')
    first.className = 'tool-cell'
    const toggle = document.createElement('span')
    if (item.hasIndicator()) {
      toggle.className = `toggle ${item.expanded ? 'open' : 'closed'}`
      toggle.dataset.toggle = ''
      row.setAttribute('aria-expanded', String(item.expanded))
    } else toggle.className = 'toggle spacer'
    const name = document.createElement('span')
    name.textContent = item.text(0)
    first.append(toggle, name)
    row.append(first)
    for (let c = 1; c < columns; c++) {
      const cell = document.createElement('span')
      cell.className = 'tool-cell'
      cell.textContent = item.text(c)
      row.append(cell)
    }
    rows.set(row, item)
    fragment.append(row)
    if (item.expanded) for (const child of item.children) visit(child, depth + 1)
  }
  for (const item of tree.children) visit(item, 0)
  const scroll = host.scrollTop
  host.replaceChildren(fragment)
  host.scrollTop = scroll
}

/** Mouse and keyboard behaviour of a QTreeWidget: click selects, the branch
 *  indicator or a double click toggles, arrows move and expand/collapse. */
function bindTree(host: HTMLElement, rows: Map<HTMLElement, TreeItem>, tree: () => TreeWidget, signal: AbortSignal,
  contextMenu?: (item: TreeItem, x: number, y: number) => void): void {
  const itemOf = (target: EventTarget | null) => {
    const row = (target as Element | null)?.closest<HTMLElement>('.tool-tree-row')
    return row ? rows.get(row) : undefined
  }
  host.addEventListener('click', event => {
    const item = itemOf(event.target)
    if (!item) return
    if ((event.target as Element).closest('[data-toggle]')) item.setExpanded(!item.expanded)
    else tree().setSelected(item)
  }, { signal })
  host.addEventListener('dblclick', event => {
    const item = itemOf(event.target)
    if (item?.hasIndicator()) item.setExpanded(!item.expanded)
  }, { signal })
  host.addEventListener('contextmenu', event => {
    const item = itemOf(event.target)
    if (!item || !contextMenu) return
    event.preventDefault()
    contextMenu(item, event.clientX, event.clientY)
  }, { signal })
  host.addEventListener('keydown', event => {
    const visible = [...rows.values()], current = tree().selectedItem
    const index = current ? visible.indexOf(current) : -1
    let handled = true
    if (event.key === 'ArrowDown') { const next = visible[index + 1]; if (next) tree().setSelected(next) }
    else if (event.key === 'ArrowUp') { const prev = visible[index - 1]; if (prev) tree().setSelected(prev) }
    else if (event.key === 'ArrowRight' && current) { if (current.hasIndicator() && !current.expanded) current.setExpanded(true); else if (current.children[0]) tree().setSelected(current.children[0]) }
    else if (event.key === 'ArrowLeft' && current) { if (current.expanded) current.setExpanded(false); else if (current.parent && current.parent !== tree()) tree().setSelected(current.parent as TreeItem) }
    else handled = false
    if (handled) { event.preventDefault(); event.stopPropagation() }
  }, { signal })
}

/** A tool window: shown, raised, dragged by its title bar, closed by its button. */
export class ToolWindow {
  constructor(readonly element: HTMLElement, private readonly _left: number, private readonly _top: number,
    private readonly _width: number, private readonly _height: number) {}
  #placed = false
  get shown(): boolean { return !this.element.hidden }
  show(): void {
    if (!this.#placed) {
      this.#placed = true
      const width = Math.min(this._width, innerWidth - 20), height = Math.min(this._height, innerHeight - 20)
      Object.assign(this.element.style, { left: `${Math.max(10, Math.min(this._left, innerWidth - width - 10))}px`, top: `${Math.max(10, Math.min(this._top, innerHeight - height - 10))}px`, width: `${width}px`, height: `${height}px` })
    }
    this.element.hidden = false
    this.raise()
  }
  hide(): void { this.element.hidden = true }
  bind(signal: AbortSignal): void {
    this.element.querySelector('.tool-close')!.addEventListener('click', () => this.hide(), { signal })
    const header = this.element.querySelector<HTMLElement>('header')!
    header.addEventListener('pointerdown', event => {
      if ((event.target as Element).closest('button')) return
      const startX = event.clientX, startY = event.clientY
      const left = this.element.offsetLeft, top = this.element.offsetTop
      header.setPointerCapture?.(event.pointerId)
      const move = (e: PointerEvent) => {
        this.element.style.left = `${Math.max(0, Math.min(innerWidth - 40, left + e.clientX - startX))}px`
        this.element.style.top = `${Math.max(0, Math.min(innerHeight - 20, top + e.clientY - startY))}px`
      }
      const up = () => { header.removeEventListener('pointermove', move); header.removeEventListener('pointerup', up) }
      header.addEventListener('pointermove', move, { signal })
      header.addEventListener('pointerup', up, { signal })
    }, { signal })
    this.element.addEventListener('pointerdown', () => this.raise(), { signal, capture: true })
  }
  // Raised by stacking order, not by moving the element: re-appending it on
  // pointerdown detaches the press target, and WebKit then drops the click
  // (the close button did nothing when the window was not already in front).
  static #stack: ToolWindow[] = []
  /** Brings the window in front of the other tool windows (z-index 30-39,
   *  below the context menus at 40). */
  raise(): void {
    const stack = ToolWindow.#stack, i = stack.indexOf(this)
    if (i >= 0) stack.splice(i, 1)
    stack.push(this)
    stack.forEach((w, n) => { w.element.style.zIndex = String(30 + Math.min(n, 9)) })
  }
}

/** Window > Hydra Scene Debugger: the debugger window and its notice logger. */
export class HydraSceneDebuggerWindow {
  #model: HydraSceneDebuggerModel | undefined
  #module: DebuggerModule | undefined
  #loading: Promise<void> | undefined
  #generation = 0
  #timer: ReturnType<typeof setInterval> | undefined
  #window: ToolWindow
  #loggerWindow: ToolWindow
  #siRows = new Map<HTMLElement, TreeItem>()
  #dsRows = new Map<HTMLElement, TreeItem>()
  #renderQueued = false
  #loggerQueued = false

  constructor(private readonly _root: ShadowRoot) {
    this.#window = new ToolWindow(this.#get('.hsd-window'), 80, 70, 980, 520)
    this.#loggerWindow = new ToolWindow(this.#get('.hsd-logger-window'), 140, 130, 640, 420)
  }
  #get<T extends Element = HTMLElement>(selector: string): T { return this._root.querySelector<T>(selector)! }

  get model(): HydraSceneDebuggerModel | undefined { return this.#model }
  get shown(): boolean { return this.#window.shown }
  get loggerShown(): boolean { return this.#loggerWindow.shown }

  bind(signal: AbortSignal): void {
    this.#window.bind(signal)
    this.#loggerWindow.bind(signal)
    signal.addEventListener('abort', () => this.dispose(), { once: true })
    const options = { signal }
    const choose = this.#get('.hsd-choose'), choosePopup = this.#get('.hsd-choose-popup')
    const inputs = this.#get<HTMLButtonElement>('.hsd-inputs'), inputsPopup = this.#get('.hsd-inputs-popup')
    const closePopups = () => { choosePopup.hidden = true; inputsPopup.hidden = true; this.#get('.hsd-context-menu').hidden = true }
    // _RegisteredSceneIndexChooser.__AboutToShow (hydraSceneDebugger.py:200-207)
    choose.addEventListener('click', () => {
      const open = choosePopup.hidden
      closePopups()
      if (!open || !this.#model) return
      const names = this.#model.registeredSceneIndexNames()
      choosePopup.replaceChildren(...(names.length ? names : ['No Registered Names']).map(name => {
        const button = document.createElement('button')
        button.type = 'button'; button.setAttribute('role', 'menuitem'); button.textContent = name
        if (names.length) button.dataset.sceneIndex = name; else button.disabled = true
        return button
      }))
      choosePopup.hidden = false
    }, options)
    choosePopup.addEventListener('click', event => {
      const name = (event.target as Element).closest<HTMLButtonElement>('[data-scene-index]')?.dataset.sceneIndex
      if (name === undefined) return
      closePopups()
      this.#model?.sceneIndexSelected(name)
    }, options)
    // __FillGoToInputMenu (hydraSceneDebugger.py:123-164)
    inputs.addEventListener('click', () => {
      const open = inputsPopup.hidden
      closePopups()
      if (!open || !this.#model) return
      const list = (items: InputMenuItem[]): HTMLUListElement => {
        const ul = document.createElement('ul')
        for (const item of items) {
          const li = document.createElement('li'), button = document.createElement('button')
          button.type = 'button'; button.setAttribute('role', 'menuitem'); button.textContent = item.name
          button.dataset.indices = item.indices.join(',')
          li.append(button)
          if (item.children.length) li.append(list(item.children))
          ul.append(li)
        }
        return ul
      }
      const tree = list(this.#model.inputsMenu())
      tree.className = 'input-tree'
      inputsPopup.replaceChildren(tree)
      inputsPopup.hidden = false
    }, options)
    inputsPopup.addEventListener('click', event => {
      const indices = (event.target as Element).closest<HTMLButtonElement>('[data-indices]')?.dataset.indices
      if (indices === undefined) return
      closePopups()
      this.#model?.inputSelected(indices.split(',').map(Number))
    }, options)
    this._root.addEventListener('pointerdown', event => {
      if (!(event.target as Element).closest?.('.tool-menu,.hsd-context-menu')) closePopups()
    }, options)
    this._root.addEventListener('keydown', event => { if ((event as KeyboardEvent).key === 'Escape') closePopups() }, options)
    this.#get('.hsd-show-logger').addEventListener('click', () => this.showLogger(), options)
    this.#get('.hsd-record').addEventListener('click', () => this.#model?.logger?.toggleRecordingState(), options)
    this.#get('.hsd-clear').addEventListener('click', () => this.#model?.logger?.clear(), options)
    bindTree(this.#get('.hsd-si-tree'), this.#siRows, () => this.#model!.siTree, signal, (item, x, y) => {
      // _SceneIndexTreeWidget.contextMenuEvent (hydraSceneDebugger.py:241-256)
      const entries = this.#model?.siTree.contextMenuItems(item)
      if (!entries) return
      const menu = this.#get('.hsd-context-menu')
      menu.replaceChildren(...entries.map(text => {
        const button = document.createElement('button')
        button.type = 'button'; button.disabled = true; button.textContent = text
        return button
      }), document.createElement('hr'))
      Object.assign(menu.style, { left: `${x}px`, top: `${y}px` })
      menu.hidden = false
    })
    bindTree(this.#get('.hsd-ds-tree'), this.#dsRows, () => this.#model!.dsTree, signal)
  }

  /** appController.py:2723-2728 _showHydraSceneDebugger */
  async show(): Promise<void> {
    const generation = this.#generation
    if (!this.#model) await (this.#loading ??= this.#create())
    if (generation !== this.#generation || !this.#model) return
    this.#window.show()
    this.#render()
  }

  async #create(): Promise<void> {
    const generation = this.#generation
    const module = await import('./hydra-scene-debugger')
    if (generation !== this.#generation) return
    this.#module = module
    const model = this.#model = new module.HydraSceneDebuggerModel()
    const queue = () => {
      if (this.#renderQueued) return
      this.#renderQueued = true
      nextFrame(() => { this.#renderQueued = false; this.#render() })
    }
    model.siTree.onChanged = queue
    model.dsTree.onChanged = queue
    model.onValueChanged = queue
    model.onLabelChanged = queue
    // hydraSceneDebugger.py:82-85: a 16 ms polling timer.
    this.#timer = setInterval(() => model.pollForNotices(), 16)
  }

  /** __ShowLoggerWindow (hydraSceneDebugger.py:177-182) */
  showLogger(): void {
    if (!this.#model) return
    const logger = this.#model.showLogger()
    logger.onChanged = () => {
      if (this.#loggerQueued) return
      this.#loggerQueued = true
      nextFrame(() => { this.#loggerQueued = false; this.#renderLogger() })
    }
    this.#loggerWindow.show()
    this.#renderLogger()
  }

  #render(): void {
    const model = this.#model
    if (!model) return
    renderLabel(this.#get('.hsd-label'), model.nameLabel)
    this.#get<HTMLButtonElement>('.hsd-inputs').disabled = !model.goToInputEnabled
    const { SceneIndexTree, DataSourceTree } = this.#module!
    renderTree(this.#get('.hsd-si-tree'), model.siTree, { columns: SceneIndexTree.headerLabels.length }, this.#siRows)
    renderTree(this.#get('.hsd-ds-tree'), model.dsTree, { columns: DataSourceTree.headerLabels.length }, this.#dsRows)
    const host = this.#get('.hsd-value')
    const value = model.value
    if (!value) { host.replaceChildren(); return }
    const table = document.createElement('table')
    table.className = 'value-table'
    const head = table.createTHead().insertRow()
    value.header.forEach((text, i) => { const th = document.createElement('th'); th.textContent = text; if (i > 0) th.className = 'index'; head.append(th) })
    const body = table.createTBody()
    for (const row of value.rows) { const tr = body.insertRow(); for (const text of row) tr.insertCell().textContent = text }
    host.replaceChildren(table)
  }

  #renderLogger(): void {
    const logger = this.#model?.logger
    if (!logger) return
    this.#get('.hsd-record').textContent = logger.startStopText
    // The logger's label is the debugger's rich-text label (SetText(value)).
    renderLabel(this.#get('.hsd-logger-label'), this.#model?.nameLabel)
    const host = this.#get('.hsd-log')
    const atBottom = host.scrollTop + host.clientHeight >= host.scrollHeight - 2
    const fragment = document.createDocumentFragment()
    // _ObserverLoggingTreeView: one row per notice, its entries as children.
    for (const notice of logger.entries) {
      const details = document.createElement('details')
      const summary = document.createElement('summary')
      summary.className = 'tool-tree-row'
      summary.textContent = notice.type
      details.append(summary)
      for (const [path, value] of notice.entries) {
        const row = document.createElement('div')
        row.className = 'tool-tree-row'
        row.style.setProperty('--depth', '1')
        for (const text of [path, value]) { const cell = document.createElement('span'); cell.className = 'tool-cell'; cell.textContent = text; row.append(cell) }
        details.append(row)
      }
      fragment.append(details)
    }
    host.replaceChildren(fragment)
    if (atBottom) host.scrollTop = host.scrollHeight
  }

  dispose(): void {
    this.#generation++
    if (this.#timer !== undefined) clearInterval(this.#timer)
    this.#timer = undefined
    this.#model?.dispose()
    this.#model = undefined
    this.#loading = undefined
    this.#window.hide()
    this.#loggerWindow.hide()
  }
}
