import { describe, expect, it, vi } from 'vitest'
import { droppedFiles, isUsdScenePath, selectedFiles } from '../src/local-asset-selection'
import { createLocalFilesContext } from '../src/local-file-resolver'
import { Stage } from 'typescript-usd/usd'

function fileEntry(name: string, file = new File([''], name)): FileSystemEntry {
  return { name, isFile: true, isDirectory: false, file: (success: FileCallback) => success(file) } as FileSystemFileEntry
}
function directory(name: string, batches: FileSystemEntry[][]) {
  let index = 0
  const readEntries = vi.fn((success: FileSystemEntriesCallback) => success(batches[index++] ?? []))
  const entry = { name, isFile: false, isDirectory: true, createReader: () => ({ readEntries }) } as unknown as FileSystemDirectoryEntry
  return { entry, readEntries }
}
function item(entry: FileSystemEntry | null, file: File | null = null): DataTransferItem {
  return { kind: 'file', webkitGetAsEntry: () => entry, getAsFile: () => file } as DataTransferItem
}
function transfer(items: DataTransferItem[], files: File[] = []): DataTransfer {
  return { items, files } as unknown as DataTransfer
}

describe('local asset selection', () => {
  it('retains picker paths and recognizes only USD root extensions', () => {
    const nested = new File([''], 'scene.USDA'), loose = new File([''], 'scene.usdz')
    Object.defineProperty(nested, 'webkitRelativePath', { value: 'folder/nested/scene.USDA' })
    expect(selectedFiles([nested, loose])).toEqual([{ path: 'folder/nested/scene.USDA', file: nested }, { path: 'scene.usdz', file: loose }])
    expect(['a.usd', 'a.usda', 'a.usdc', 'a.USDZ'].every(isUsdScenePath)).toBe(true)
    expect(['a.usda.png', 'a.txt', 'a.usdz/'].some(isUsdScenePath)).toBe(false)
  })

  it('enumerates every directory batch and nested folder without collapsing paths', async () => {
    const root = new File(['#usda 1.0\n(subLayers = [@layers/child.usda@])\ndef "Root" {}'], 'root.usda')
    const child = new File(['#usda 1.0\ndef "Child" {}'], 'child.usda')
    const nested = directory('layers', [[fileEntry('child.usda', child)], []])
    const folder = directory('scene', [[fileEntry('root.usda', root)], [nested.entry], [fileEntry('texture #?.png')], []])
    const files = await droppedFiles(transfer([item(folder.entry)]))
    expect(files.map(file => file.path)).toEqual(['scene/root.usda', 'scene/layers/child.usda', 'scene/texture #?.png'])
    expect(folder.readEntries).toHaveBeenCalledTimes(4)
    expect(nested.readEntries).toHaveBeenCalledTimes(2)
    const context = await createLocalFilesContext({ rootPath: 'scene/root.usda', files })
    const stage = (await Stage.open(context.url, { resolverContext: context.context }))!
    try { context.assertComplete(); expect([...stage.traverse()]).toEqual(['/Child', '/Root']) }
    finally { stage.dispose() }
  })

  it('snapshots all root handles before asynchronous directory reads resume', async () => {
    let finish!: FileSystemEntriesCallback
    const first = { name: 'folder', isDirectory: true, createReader: () => ({ readEntries: (success: FileSystemEntriesCallback) => { finish = success } }) } as unknown as FileSystemDirectoryEntry
    const second = item(null, new File([''], 'later.usda'))
    const getFile = vi.spyOn(second, 'getAsFile')
    const pending = droppedFiles(transfer([item(first), second]))
    expect(getFile).toHaveBeenCalledTimes(1)
    getFile.mockImplementation(() => { throw new Error('Protected drag store') })
    finish([])
    expect((await pending).map(file => file.path)).toEqual(['later.usda'])
  })

  it('supports file-list fallback and non-prefixed entry API', async () => {
    const file = new File([''], 'scene.usdz')
    expect(await droppedFiles(transfer([], [file]))).toEqual([{ path: 'scene.usdz', file }])
    const entryItem = { kind: 'file', getAsEntry: () => fileEntry(file.name, file), getAsFile: () => null } as unknown as DataTransferItem
    expect(await droppedFiles(transfer([entryItem]))).toEqual([{ path: file.name, file }])
  })

  it('rejects inaccessible roots and propagates file/directory read errors', async () => {
    await expect(droppedFiles(transfer([item(null)]))).rejects.toThrow('could not read')
    const error = new DOMException('Denied', 'NotReadableError')
    const badFile = { name: 'root.usda', isFile: true, file: (_success: FileCallback, reject: ErrorCallback) => reject(error) } as FileSystemFileEntry
    const badFolder = { name: 'folder', isDirectory: true, createReader: () => ({ readEntries: (_success: FileSystemEntriesCallback, reject: ErrorCallback) => reject(error) }) } as unknown as FileSystemDirectoryEntry
    for (const entry of [badFile, badFolder, { name: 'unknown' } as FileSystemEntry]) {
      await expect(droppedFiles(transfer([item(entry)]))).rejects.toThrow()
    }
  })

  it('uses the supplied loose File when Safari exposes an unreadable backing entry', async () => {
    const file = new File(['#usda 1.0'], 'scene.usda')
    const read = vi.fn((_success: FileCallback, reject: ErrorCallback) => reject(new DOMException('Path does not exist', 'NotFoundError')))
    const entry = { name: file.name, isFile: true, isDirectory: false, file: read } as unknown as FileSystemFileEntry
    expect(await droppedFiles(transfer([item(entry, file)]))).toEqual([{path: file.name, file}])
    expect(read).not.toHaveBeenCalled()
  })

  it('honors an already cancelled file-list fallback', async () => {
    const abort = new AbortController(); abort.abort()
    await expect(droppedFiles(transfer([], [new File([''], 'root.usda')]), abort.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('discards a file callback completed after cancellation', async () => {
    const abort = new AbortController()
    let finish!: FileCallback
    const entry = { name: 'root.usda', isFile: true, file: (success: FileCallback) => { finish = success } } as FileSystemFileEntry
    const pending = expect(droppedFiles(transfer([item(entry)]), abort.signal)).rejects.toMatchObject({ name: 'AbortError' })
    abort.abort(); finish(new File([''], 'root.usda')); await pending
  })

  it('stops directory traversal when cancelled during a batch', async () => {
    const abort = new AbortController()
    let finish!: FileSystemEntriesCallback
    const readEntries = vi.fn((success: FileSystemEntriesCallback) => { finish = success })
    const entry = { name: 'folder', isDirectory: true, createReader: () => ({ readEntries }) } as unknown as FileSystemDirectoryEntry
    const pending = expect(droppedFiles(transfer([item(entry)]), abort.signal)).rejects.toMatchObject({ name: 'AbortError' })
    abort.abort(); finish([fileEntry('root.usda')]); await pending
    expect(readEntries).toHaveBeenCalledTimes(1)
  })
})
