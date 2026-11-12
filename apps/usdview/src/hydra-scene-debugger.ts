// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/hydraSceneDebugger.py
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// usdview's Hydra Scene Debugger (Window > Hydra Scene Debugger), ported from
// OpenUSD 26.11.1 pxr/usdImaging/usdviewq/hydraSceneDebugger.py. This module
// holds the widgets' state and behaviour as plain models; the DOM view is
// hydra-scene-debugger-view.ts. Each model class names the Qt widget it ports.
//
// Qt's QTreeWidget/QTreeWidgetItem are reduced to TreeWidget/TreeItem below:
// items with column texts, children, an expanded flag and a child indicator,
// and the widget signals the debugger connects to (itemExpanded,
// itemCollapsed, itemSelectionChanged).
//
// Upstream bugs fixed here (the faithful code would show stale or duplicate
// rows); each is marked "Upstream bug" at its site:
// - _RemoveSubtreeEntries (hydraSceneDebugger.py:334-342) collects `primPath`
//   instead of `itemPrimPath`, so descendants of a removed prim stay in the
//   prim item map and a re-added descendant lands on a detached item.
// - _SceneIndexPrimTreeWidgetItem.WasExpanded (hydraSceneDebugger.py:414-419)
//   passes the child item, not its path, to _RemoveSubtree, so children added
//   by notices before the first expansion are not removed and are listed twice.
import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  DebugPrintDataSource as HdDebugPrintDataSource,
  RetainedSampledDataSource as HdRetainedSampledDataSource,
  SampledDataSource as HdSampledDataSource,
  VectorDataSource as HdVectorDataSource,
  type DataSourceBase as HdDataSourceBase,
} from 'typescript-usd/hd'
import type { Value as VtValue } from 'typescript-usd/vt'
import { UsdviewqHydraObserver, getPendingNotices, locatorSetAsString, sampledValue, type PendingNotice } from './hydra-observer'
import { pyFloat, pyStr } from './python-format'

// ---------------------------------------------------------------- paths

export const absoluteRootPath = '/'
function isPropertyPath(path: string): boolean { return path.lastIndexOf('.') > path.lastIndexOf('/') }
/** SdfPath::GetName: the prim or property name; the absolute root's name is
 *  "/" (the native capture's root row). */
export function pathName(path: string): string {
  if (path === absoluteRootPath) return absoluteRootPath
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('.')) + 1)
}
/** SdfPath::GetParentPath for absolute prim and property paths. */
export function parentPath(path: string): string {
  if (path === absoluteRootPath) return ''
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('.'))
  return cut <= 0 ? absoluteRootPath : path.slice(0, cut)
}
/** SdfPath::HasPrefix */
export function hasPathPrefix(path: string, prefix: string): boolean {
  if (path === prefix || prefix === absoluteRootPath) return path.startsWith('/')
  return path.startsWith(prefix) && (path[prefix.length] === '/' || path[prefix.length] === '.')
}

// --------------------------------------------------- QTreeWidget, reduced

export type TreeParent = TreeItem | TreeWidget
export class TreeItem {
  readonly texts: string[] = []
  readonly children: TreeItem[] = []
  parent: TreeParent | undefined
  expanded = false
  /** QTreeWidgetItem.ChildIndicatorPolicy: undefined shows it when there are children. */
  showIndicator: boolean | undefined
  constructor(parent: TreeParent) {
    this.parent = parent
    parent.children.push(this)
  }
  text(column: number): string { return this.texts[column] ?? '' }
  setText(column: number, text: string): void { this.texts[column] = text; this.treeWidget()?.changed() }
  childCount(): number { return this.children.length }
  child(i: number): TreeItem | undefined { return this.children[i] }
  indexOfChild(item: TreeItem): number { return this.children.indexOf(item) }
  takeChild(index: number): TreeItem | undefined {
    if (index < 0 || index >= this.children.length) return undefined
    const [item] = this.children.splice(index, 1)
    const tree = this.treeWidget()
    item!.parent = undefined
    tree?.itemRemoved(item!)
    return item
  }
  takeChildren(): TreeItem[] {
    const items = [...this.children]
    for (let i = items.length - 1; i >= 0; i--) this.takeChild(i)
    return items
  }
  /** QTreeWidgetItem::treeWidget: undefined once detached. */
  treeWidget(): TreeWidget | undefined {
    let p: TreeParent | undefined = this.parent
    while (p instanceof TreeItem) p = p.parent
    return p
  }
  hasIndicator(): boolean { return this.showIndicator ?? this.children.length > 0 }
  isSelected(): boolean { return this.treeWidget()?.selectedItem === this }
  /** QTreeWidgetItem::setExpanded: emits itemExpanded/itemCollapsed on a change. */
  setExpanded(expanded: boolean): void {
    if (this.expanded === expanded) return
    this.expanded = expanded
    const tree = this.treeWidget()
    if (!tree) return
    tree.changed()
    if (expanded) tree.onItemExpanded(this)
    else tree.onItemCollapsed(this)
  }
}

export class TreeWidget {
  readonly children: TreeItem[] = []
  selectedItem: TreeItem | undefined
  /** Bumped on every visible change, for the view. */
  version = 0
  onChanged: () => void = () => {}
  onItemExpanded: (item: TreeItem) => void = () => {}
  onItemCollapsed: (item: TreeItem) => void = () => {}
  onItemSelectionChanged: () => void = () => {}
  changed(): void { this.version++; this.onChanged() }
  invisibleRootItem(): TreeWidget { return this }
  topLevelItem(i: number): TreeItem | undefined { return this.children[i] }
  selectedItems(): TreeItem[] { return this.selectedItem ? [this.selectedItem] : [] }
  /** Single selection: selecting an item (or nothing) emits itemSelectionChanged on a change. */
  setSelected(item: TreeItem | undefined): void {
    if (this.selectedItem === item) return
    this.selectedItem = item
    this.changed()
    this.onItemSelectionChanged()
  }
  /** Qt drops a removed item (or its descendant) from the selection. */
  itemRemoved(item: TreeItem): void {
    const selected = this.selectedItem
    let p: TreeParent | undefined = selected
    while (p instanceof TreeItem && p !== item) p = p.parent
    if (selected && p === item) this.setSelected(undefined)
    else this.changed()
  }
  takeTopLevelItem(index: number): TreeItem | undefined {
    if (index < 0 || index >= this.children.length) return undefined
    const [item] = this.children.splice(index, 1)
    item!.parent = undefined
    this.itemRemoved(item!)
    return item
  }
  indexOfChild(item: TreeItem): number { return this.children.indexOf(item) }
  takeChild(index: number): TreeItem | undefined { return this.takeTopLevelItem(index) }
  /** QTreeWidget::clear resets the selection model, which emits no
   *  selection signal. */
  clear(): void {
    for (const item of this.children) item.parent = undefined
    this.children.length = 0
    this.selectedItem = undefined
    this.changed()
  }
}
/** QTreeWidgetItem::parent: none for a top-level item. */
const itemParent = (item: TreeItem): TreeItem | undefined => item.parent instanceof TreeItem ? item.parent : undefined

// ------------------------------------------------- _SceneIndexTreeWidget

/** hydraSceneDebugger.py:383-429 _SceneIndexPrimTreeWidgetItem */
export class SceneIndexPrimItem extends TreeItem {
  #queryOnExpansion: boolean
  constructor(parent: TreeParent, readonly primPath: string, queryOnExpansion = false, tree?: SceneIndexTree) {
    super(parent)
    this.#queryOnExpansion = queryOnExpansion

    if (queryOnExpansion) this.showIndicator = true

    this.texts[0] = isPropertyPath(primPath) ? `.${pathName(primPath)}` : pathName(primPath)

    if ((tree ?? SceneIndexTree.of(this))?.primIsExpanded(primPath)) {
      this.setExpanded(true)
    }
  }

  getPrimPath(): string { return this.primPath }

  wasExpanded(treeWidget: SceneIndexTree, observer: UsdviewqHydraObserver): void {
    treeWidget.addToExpandedSet(this.primPath)

    if (!this.#queryOnExpansion) return

    this.#queryOnExpansion = false

    // Upstream bug (hydraSceneDebugger.py:414-419): it passes the child item
    // to _RemoveSubtree, which looks it up as a path and finds nothing.
    for (const childItem of [...this.children]) {
      if (childItem instanceof SceneIndexPrimItem) treeWidget._removeSubtree(childItem.getPrimPath())
    }

    for (const childPath of observer.getChildPrimPaths(this.getPrimPath())) {
      const childPrimType = observer.getPrim(childPath).primType
      const childItem = new SceneIndexPrimItem(this, childPath, true, treeWidget)
      childItem.setText(1, childPrimType)
      treeWidget._addPrimItem(childPath, childItem)
    }

    if (!this.childCount()) this.showIndicator = false
    treeWidget.changed()
  }
}

/** hydraSceneDebugger.py:219-379 _SceneIndexTreeWidget (columns Name, Type). */
export class SceneIndexTree extends TreeWidget {
  static readonly headerLabels = ['Name', 'Type']
  static of(item: TreeItem): SceneIndexTree | undefined {
    const tree = item.treeWidget()
    return tree instanceof SceneIndexTree ? tree : undefined
  }
  readonly #expandedSet = new Set<string>()
  readonly #primItems = new Map<string, SceneIndexPrimItem>()
  /** primSelected(primPath, dataSource) */
  onPrimSelected: (primPath: string, dataSource: HdContainerDataSource | undefined) => void = () => {}
  /** primDirtied(primPath, locators) */
  onPrimDirtied: (primPath: string, locators: HdDataSourceLocatorSet) => void = () => {}

  constructor(private readonly _observer: UsdviewqHydraObserver) {
    super()
    this.onItemSelectionChanged = () => this.#itemSelectionChanged()
    this.onItemExpanded = item => { if (item instanceof SceneIndexPrimItem) item.wasExpanded(this, this._observer) }
    this.onItemCollapsed = item => { if (item instanceof SceneIndexPrimItem) this.removeFromExpandedSet(item.getPrimPath()) }
  }

  /** hydraSceneDebugger.py:241-256 contextMenuEvent: a menu with the disabled
   *  entry "type: <type>" and a separator. */
  contextMenuItems(item: TreeItem): string[] | undefined {
    return item instanceof SceneIndexPrimItem ? [`type: ${item.text(1)}`] : undefined
  }

  /** hydraSceneDebugger.py:258-263 */
  primsAdded(entries: readonly (readonly [string, string])[]): void {
    for (const [primPath, primType] of entries) {
      const item = this._getPrimItem(primPath)
      if (!item) continue
      item.setText(1, primType)
      if (item.isSelected()) this.onItemSelectionChanged()
    }
  }

  /** hydraSceneDebugger.py:265-281 */
  primsRemoved(entries: readonly string[]): void {
    for (const primPath of entries) {
      const item = this._getPrimItem(primPath, false)
      if (item) {
        const parentItem = itemParent(item)
        if (parentItem !== undefined) parentItem.takeChild(parentItem.indexOfChild(item))

        // XXX Items are currently stored flat so this loop will not
        //     scale for lots of items
        this._removeSubtree(primPath)
      }
    }
  }

  /** hydraSceneDebugger.py:283-299 */
  primsDirtied(entries: readonly (readonly [string, HdDataSourceLocatorSet])[]): void {
    const item = this.selectedItems()[0]
    if (!item) return
    if (!(item instanceof SceneIndexPrimItem)) return

    const selectedPath = item.getPrimPath()

    const selectedItemLocators = new HdDataSourceLocatorSet()
    for (const [primPath, dirtiedLocators] of entries) {
      if (primPath === selectedPath) selectedItemLocators.insert(dirtiedLocators)
    }

    this.onPrimDirtied(selectedPath, selectedItemLocators)
  }

  /** hydraSceneDebugger.py:301-318 */
  _getPrimItem(primPath: string, createIfNecessary = true): SceneIndexPrimItem | undefined {
    const existing = this.#primItems.get(primPath)
    if (existing) return existing

    if (!createIfNecessary) return undefined

    const parentItem: TreeParent | undefined = primPath === absoluteRootPath
      ? this.invisibleRootItem() : this._getPrimItem(parentPath(primPath), true)

    if (parentItem === undefined) return undefined

    const item = new SceneIndexPrimItem(parentItem, primPath, false, this)
    this.#primItems.set(primPath, item)
    this.changed()
    return item
  }

  /** hydraSceneDebugger.py:320-321 */
  _addPrimItem(primPath: string, item: SceneIndexPrimItem): void { this.#primItems.set(primPath, item) }

  /** hydraSceneDebugger.py:323-332 */
  _removeSubtree(primPath: string): void {
    const item = this._getPrimItem(primPath, false)
    if (item === undefined) return

    const parent = itemParent(item)
    if (parent !== undefined) parent.takeChild(parent.indexOfChild(item))

    this._removeSubtreeEntries(primPath)
  }

  /** hydraSceneDebugger.py:334-342 */
  _removeSubtreeEntries(primPath: string): void {
    const toRemove: string[] = []
    for (const itemPrimPath of this.#primItems.keys()) {
      // Upstream bug (hydraSceneDebugger.py:338): it appends primPath.
      if (hasPathPrefix(itemPrimPath, primPath)) toRemove.push(itemPrimPath)
    }
    for (const p of toRemove) this.#primItems.delete(p)
  }

  /** hydraSceneDebugger.py:344-349 */
  requery(): void {
    this.clear()
    this.#primItems.clear()
    this.#primItems.set(absoluteRootPath, new SceneIndexPrimItem(this.invisibleRootItem(), absoluteRootPath, true, this))
    this.changed()
  }

  primIsExpanded(primPath: string): boolean { return this.#expandedSet.has(primPath) }
  addToExpandedSet(primPath: string): void { this.#expandedSet.add(primPath) }
  removeFromExpandedSet(primPath: string): void { this.#expandedSet.delete(primPath) }

  /** hydraSceneDebugger.py:360-371 */
  #itemSelectionChanged(): void {
    const item = this.selectedItems()[0]
    if (!item) {
      this.onPrimSelected('', undefined)
      return
    }
    if (item instanceof SceneIndexPrimItem) {
      const primPath = item.getPrimPath()
      const { dataSource } = this._observer.getPrim(primPath)
      this.onPrimSelected(item.getPrimPath(), dataSource)
    }
  }
}

// ------------------------------------------------- _DataSourceTreeWidget

const locatorKey = (locator: HdDataSourceLocator): string => locator.GetString('\u0000')
const isBranch = (ds: HdDataSourceBase | undefined) => ds instanceof HdContainerDataSource || ds instanceof HdVectorDataSource

/** hydraSceneDebugger.py:522-654 _DataSourceTreeWidgetItem */
export class DataSourceItem extends TreeItem {
  #dataSource: HdDataSourceBase | undefined
  #childrenBuilt = false
  constructor(private readonly _locator: HdDataSourceLocator, parentItem: TreeParent, dataSource: HdDataSourceBase | undefined) {
    super(parentItem)
    this.#dataSource = dataSource

    if (!_locator.IsEmpty()) this.texts[0] = _locator.getLastElement()

    this.showIndicator = isBranch(this.#dataSource)

    if (this.#isInExpandedSet()) this.setExpanded(true)
  }

  #expandedSet(): Set<string> | undefined {
    const tree = this.treeWidget()
    return tree instanceof DataSourceTree ? tree._getExpandedSet() : undefined
  }
  #isInExpandedSet(): boolean { return this.#expandedSet()?.has(locatorKey(this._locator)) ?? false }
  #setIsInExpandedSet(state: boolean): void {
    if (state) this.#expandedSet()?.add(locatorKey(this._locator))
    else this.#expandedSet()?.delete(locatorKey(this._locator))
  }

  wasExpanded(): void {
    this.#setIsInExpandedSet(true)
    if (this.#childrenBuilt) return
    this.#buildChildren()
  }

  wasCollapsed(): void { this.#setIsInExpandedSet(false) }

  /** hydraSceneDebugger.py:564-620 */
  setDirty(dataSource: HdDataSourceBase | undefined): void {
    if (this.#childrenBuilt) {
      if (dataSource instanceof HdContainerDataSource) {
        // confirm that existing data source is also a container
        // if not, rebuild entirely
        if (!(this.#dataSource instanceof HdContainerDataSource)) {
          this.#dataSource = dataSource
          this.#rebuildChildren()
          return
        }

        const usedNames = new Set<string>()
        const itemsToRemove: TreeItem[] = []

        for (const childItem of [...this.children]) {
          if (!(childItem instanceof DataSourceItem)) continue

          const childName = childItem.getLocator().getLastElement()
          const childDs = dataSource.Get(childName)
          usedNames.add(childName)

          if (childDs !== undefined) childItem.setDirty(childDs)
          else itemsToRemove.push(childItem)
        }

        // add any new items
        for (const childName of dataSource.getNames()) {
          if (!usedNames.has(childName)) {
            const childDs = dataSource.Get(childName)
            if (childDs !== undefined) {
              new DataSourceItem(this._locator.append(childName), this, childDs)
            }
          }
        }

        for (const item of itemsToRemove) this.takeChild(this.indexOfChild(item))
      } else if (dataSource instanceof HdVectorDataSource) {
        // confirm that existing data source is also a vector
        // of the same length (could reuse items but probably not
        // worth the extra complexity)
        if (!(this.#dataSource instanceof HdVectorDataSource) ||
            this.childCount() !== dataSource.getNumElements()) {
          this.#dataSource = dataSource
          this.#rebuildChildren()
          return
        }

        for (let i = 0; i < dataSource.getNumElements(); i++) {
          const childItem = this.child(i)
          if (childItem instanceof DataSourceItem) childItem.setDirty(dataSource.getElement(i))
        }
      }
    }

    this.#dataSource = dataSource
    this.treeWidget()?.changed()
  }

  getDataSource(): HdDataSourceBase | undefined { return this.#dataSource }
  getLocator(): HdDataSourceLocator { return this._locator }

  #rebuildChildren(): void {
    this.takeChildren()
    this.#buildChildren()
  }

  /** hydraSceneDebugger.py:632-654 */
  #buildChildren(): void {
    this.#childrenBuilt = true

    if (this.#dataSource instanceof HdContainerDataSource) {
      const usedNames = new Set<string>()
      for (const childName of this.#dataSource.getNames()) {
        if (usedNames.has(childName)) continue
        usedNames.add(childName)
        const childDataSource = this.#dataSource.Get(childName)
        if (childDataSource !== undefined) {
          new DataSourceItem(this._locator.append(childName), this, childDataSource)
        }
      }
    } else if (this.#dataSource instanceof HdVectorDataSource) {
      for (let i = 0; i < this.#dataSource.getNumElements(); i++) {
        const childName = `i${i}`
        new DataSourceItem(this._locator.append(childName), this, this.#dataSource.getElement(i))
      }
    }
    this.treeWidget()?.changed()
  }
}

/** hydraSceneDebugger.py:433-518 _DataSourceTreeWidget (column Name). */
export class DataSourceTree extends TreeWidget {
  static readonly headerLabels = ['Name']
  readonly #expandedSet = new Set<string>()
  /** dataSourceSelected(dataSource) */
  onDataSourceSelected: (dataSource: HdDataSourceBase | undefined) => void = () => {}

  constructor() {
    super()
    this.onItemExpanded = item => { if (item instanceof DataSourceItem) item.wasExpanded() }
    this.onItemCollapsed = item => { if (item instanceof DataSourceItem) item.wasCollapsed() }
    this.onItemSelectionChanged = () => this.#itemSelectionChanged()
  }

  /** hydraSceneDebugger.py:447-454 */
  setPrimDataSource(primPath: string, dataSource: HdContainerDataSource | undefined): void {
    this.clear()
    if (dataSource !== undefined) {
      const item = new DataSourceItem(new HdDataSourceLocator(), this.invisibleRootItem(), dataSource)
      item.setText(0, `<${pathName(primPath)}>`)
    }
  }

  /** hydraSceneDebugger.py:456-495 */
  primDirtied(_primPath: string, dataSource: HdContainerDataSource | undefined, locatorSet: HdDataSourceLocatorSet): void {
    // loop over existing items to determine which require data source
    // updates
    const taskQueue: (TreeItem | undefined)[] = [this.topLevelItem(0)]

    while (taskQueue.length > 0) {
      const item = taskQueue.pop()

      if (!(item instanceof DataSourceItem)) continue

      const loc = item.getLocator()

      let addChildren = false

      if (!loc.IsEmpty()) {
        if (locatorSet.contains(loc)) {
          // dirty here, we'll need a new data source
          // no need to add children as SetDirty will handle that
          item.setDirty(HdContainerDataSource.Get(dataSource, loc))
        } else if (locatorSet.intersects(loc)) {
          addChildren = true
        }
      } else {
        addChildren = true
      }

      if (addChildren) {
        for (let i = 0; i < item.childCount(); i++) taskQueue.push(item.child(i))
      }
    }

    // Force a selection change on the current item so that the value column
    // re-pulls on the data source
    const selected = this.selectedItems()[0]
    if (selected instanceof DataSourceItem && locatorSet.intersects(selected.getLocator())) {
      this.onItemSelectionChanged()
    }
  }

  _getExpandedSet(): Set<string> { return this.#expandedSet }

  /** hydraSceneDebugger.py:509-518 */
  #itemSelectionChanged(): void {
    const item = this.selectedItems()[0]
    if (!item) return
    if (!(item instanceof DataSourceItem)) return
    this.onDataSourceSelected(item.getDataSource())
  }
}

// ------------------------------------------- _DataSourceValueTreeView

/**
 * VtValue::GetTypeName (vt/value.h; ArchGetDemangled of the held type), as
 * _WrapSampledDataSourceGetTypeString returns it (wrapHydraObserver.cpp:189-200).
 * FAITHFULNESS-DEBT(usdview-vt-type-name): the library's VtValue type names
 * are Sdf-style ('token', 'GfVec3f[]'); this maps them to the demangled C++
 * names native usdview shows. Retire it when VtValue::getTypeName returns the
 * demangled C++ name as upstream does.
 */
export function cppTypeName(typeName: string): string {
  if (typeName.endsWith('[]')) return `VtArray<${cppTypeName(typeName.slice(0, -2))}>`
  return cppScalarNames[typeName] ?? typeName
}
const cppScalarNames: Record<string, string> = {
  token: 'TfToken', asset: 'SdfAssetPath', half: 'pxr_half::half', uint: 'unsigned int',
  uint64: 'unsigned long long', uchar: 'unsigned char', int64: 'long long', ushort: 'unsigned short',
  timecode: 'SdfTimeCode', opaque: 'SdfOpaqueValue', pathExpression: 'SdfPathExpression',
}

const pythonIntegers = new Set(['int', 'uint', 'int64', 'uint64', 'uchar', 'short', 'ushort'])
/**
 * str() of the Python object a VtValue converts to (wrapHydraObserver.cpp:160-187
 * _WrapSampledDataSourceGetValue; _ValueItemModel.data uses str(value)).
 * bool, numbers, strings, tokens and paths become Python builtins; Gf and Vt
 * values print as their C++ operator<<, which is also the binding's fallback
 * for a value Python cannot hold.
 */
export function valueText(value: VtValue): string {
  const typeName = value.getTypeName(), held = value.Get<unknown>()
  if (typeName === 'bool') return held ? 'True' : 'False'
  if (pythonIntegers.has(typeName) && (typeof held === 'number' || typeof held === 'bigint')) return String(held)
  if (typeName === 'float' && typeof held === 'number') return pyFloat(Math.fround(held))
  if ((typeName === 'double' || typeName === 'half') && typeof held === 'number') return pyFloat(held)
  if (typeName === 'token' || typeName === 'string' || typeName === 'SdfPath') return String(held)
  if (typeName === 'asset' || typeName === 'SdfAssetPath') return pyStr(held, 'asset')
  return HdDebugPrintDataSource(HdRetainedSampledDataSource.new(value)).replace(/\n$/, '')
}

/** The model _DataSourceValueTreeView shows (hydraSceneDebugger.py:658-745). */
export interface ValueModel {
  /** headerData: the type string, and "Index" for an array. */
  header: string[]
  rows: string[][]
}

/**
 * hydraSceneDebugger.py:722-742 SetDataSource: a model for a sampled data
 * source, else none. _ValueItemModel lists an array's elements one per row
 * when the converted value has AsList (hydraSceneDebugger.py:662); no value a
 * VtValue converts to has it (the native capture shows VtArray<GfVec3f> as
 * one row), so every value is one row of str(value).
 */
export function valueModel(dataSource: HdDataSourceBase | undefined): ValueModel | undefined {
  if (!(dataSource instanceof HdSampledDataSource)) return undefined
  const value = sampledValue(dataSource)
  // An empty value is Python None; GetTypeString is then "".
  if (!value) return { header: [''], rows: [['None']] }
  return { header: [cppTypeName(value.getTypeName())], rows: [[valueText(value)]] }
}

// --------------------------------------------------- _NoticeLoggingWidget

/** One logged row: the notice type with its entries' path and value columns. */
export interface LoggedNotice { type: PendingNotice[0], entries: [string, string][] }

/** hydraSceneDebugger.py:749-909 _NoticeLoggingWidget, _ObserverLoggingItemModel
 *  (columns "Notice Type/ Prim Path", "Value"). */
export class NoticeLog {
  static readonly headerLabels = ['Notice Type/ Prim Path', 'Value']
  readonly entries: LoggedNotice[] = []
  recording = false
  label = ''
  version = 0
  onChanged: () => void = () => {}
  #changed(): void { this.version++; this.onChanged() }

  /** startStopButton text */
  get startStopText(): string { return this.recording ? 'Stop Recording' : 'Start Recording' }

  /** hydraSceneDebugger.py:777-780 AddNotices, 817-830 AddEntries */
  addNotices(notices: readonly PendingNotice[]): void {
    if (!this.recording) return
    if (notices.length === 0) return
    for (const notice of notices) this.entries.push(loggedNotice(notice))
    this.#changed()
  }
  setText(value: string): void { this.label = value; this.#changed() }
  /** hydraSceneDebugger.py:785-786, 832-835 */
  clear(): void { this.entries.length = 0; this.#changed() }
  /** hydraSceneDebugger.py:788-791 */
  toggleRecordingState(): void { this.recording = !this.recording; this.#changed() }
}

/** _ObserverLoggingItemModel.data (hydraSceneDebugger.py:837-862). */
function loggedNotice([type, values]: PendingNotice): LoggedNotice {
  switch (type) {
    case 'removed': return { type, entries: values.map(path => [path, '']) }
    case 'added': return { type, entries: values.map(([path, primType]) => [path, primType]) }
    case 'dirtied': return { type, entries: values.map(([path, locators]) => [path, locatorSetAsString(locators)]) }
  }
}

// ------------------------------------------------------ HydraSceneDebugger

/** One entry of the Inputs menu tree (hydraSceneDebugger.py:150-159). */
export interface InputMenuItem { name: string, indices: number[], children: InputMenuItem[] }

/** The name label: "<b><i>( display name )</i></b> registered name". */
export interface NameLabel { displayName: string, suffix: string }

/** hydraSceneDebugger.py:31-182 HydraSceneDebugger */
export class HydraSceneDebuggerModel {
  readonly observer = new UsdviewqHydraObserver()
  readonly siTree = new SceneIndexTree(this.observer)
  readonly dsTree = new DataSourceTree()
  value: ValueModel | undefined
  valueVersion = 0
  nameLabel: NameLabel | undefined
  /** QPushButton is enabled until the first label update. */
  goToInputEnabled = true
  logger: NoticeLog | undefined
  onValueChanged: () => void = () => {}
  onLabelChanged: () => void = () => {}

  constructor() {
    this.siTree.onPrimSelected = (primPath, dataSource) => this.#primSelected(primPath, dataSource)
    this.dsTree.onDataSourceSelected = dataSource => this.#setValue(valueModel(dataSource))
    this.siTree.onPrimDirtied = (primPath, locators) => this.#primDirtied(primPath, locators)
  }

  dispose(): void { this.observer.dispose() }

  /** _RegisteredSceneIndexChooser.__AboutToShow (hydraSceneDebugger.py:200-207):
   *  the registered names, or none ("No Registered Names", disabled). */
  registeredSceneIndexNames(): string[] { return UsdviewqHydraObserver.getRegisteredSceneIndexNames() }

  /** hydraSceneDebugger.py:87-101 __PollForNotices, run by a 16 ms timer. */
  pollForNotices(): void {
    if (!this.observer.hasPendingNotices()) return

    const notices = getPendingNotices(this.observer)
    this.logger?.addNotices(notices)

    for (const notice of notices) {
      if (notice[0] === 'added') this.siTree.primsAdded(notice[1])
      else if (notice[0] === 'removed') this.siTree.primsRemoved(notice[1])
      else if (notice[0] === 'dirtied') this.siTree.primsDirtied(notice[1])
    }
  }

  /** hydraSceneDebugger.py:103-106 */
  sceneIndexSelected(name: string): void {
    this.observer.targetToNamedSceneIndex(name)
    this.#updateNameLabel(name)
    this.#sceneIndexChanged()
  }

  /** hydraSceneDebugger.py:108-110 */
  #sceneIndexChanged(): void { this.siTree.requery() }

  /** hydraSceneDebugger.py:112-114 */
  #primSelected(primPath: string, dataSource: HdContainerDataSource | undefined): void {
    this.#setValue(undefined)
    this.dsTree.setPrimDataSource(primPath, dataSource)
  }

  /** hydraSceneDebugger.py:116-118 */
  #primDirtied(primPath: string, locators: HdDataSourceLocatorSet): void {
    const { dataSource } = this.observer.getPrim(primPath)
    this.dsTree.primDirtied(primPath, dataSource, locators)
  }

  #setValue(value: ValueModel | undefined): void {
    this.value = value
    this.valueVersion++
    this.onValueChanged()
  }

  /** hydraSceneDebugger.py:123-164 __FillGoToInputMenu: the input scenes as
   *  a fully expanded tree. */
  inputsMenu(): InputMenuItem[] {
    const top: InputMenuItem[] = []
    const queue: [number[], InputMenuItem[]][] = [[[], top]]
    while (queue.length > 0) {
      const [indices, itemParent] = queue.pop()!
      const names = this.observer.getInputDisplayNames(indices)
      names.forEach((name, i) => {
        const item: InputMenuItem = { name, indices: [...indices, i], children: [] }
        itemParent.push(item)
        queue.push([item.indices, item.children])
      })
    }
    return top
  }

  /** hydraSceneDebugger.py:141-146 _ItemClicked */
  inputSelected(indices: readonly number[]): void {
    this.observer.targetToInputSceneIndex(indices)
    this.#updateNameLabel()
    this.#sceneIndexChanged()
  }

  /** hydraSceneDebugger.py:166-175 */
  #updateNameLabel(prefix?: string): void {
    this.nameLabel = { displayName: this.observer.getDisplayName(), suffix: prefix ?? '' }
    this.logger?.setText(nameLabelText(this.nameLabel))
    this.goToInputEnabled = this.observer.getInputDisplayNames([]).length > 0
    this.onLabelChanged()
  }

  /** hydraSceneDebugger.py:177-182 __ShowLoggerWindow: made once, then shown. */
  showLogger(): NoticeLog {
    if (!this.logger) {
      this.logger = new NoticeLog()
      this.logger.setText(this.nameLabel ? nameLabelText(this.nameLabel) : '')
    }
    return this.logger
  }
}

/** The label's plain text: "( display name ) registered name". */
export function nameLabelText(label: NameLabel): string { return `( ${label.displayName} ) ${label.suffix}` }
