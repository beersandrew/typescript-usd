import type { LocalAssetFile } from './local-assets'

export const isUsdScenePath = (path: string): boolean => /\.(usd|usda|usdc|usdz)$/i.test(path)
export function selectedFiles(files: Iterable<File>): LocalAssetFile[] {
  return [...files].map(file => ({ path: file.webkitRelativePath || file.name, file }))
}

/** Snapshot drag entries synchronously: browsers protect the data store after drop. */
export async function droppedFiles(data: DataTransfer, signal?: AbortSignal): Promise<LocalAssetFile[]> {
  signal?.throwIfAborted()
  const items = [...data.items].filter(item => item.kind === 'file')
  const roots = items.map(item => {
    const entryItem = item as DataTransferItem & { getAsEntry?: () => FileSystemEntry | null }
    return { entry: entryItem.getAsEntry?.() ?? item.webkitGetAsEntry?.() ?? null, file: item.getAsFile() }
  })
  const fallback = selectedFiles(data.files)
  const result: LocalAssetFile[] = []
  async function walk(entry: FileSystemEntry, prefix: string): Promise<void> {
    signal?.throwIfAborted()
    const path = prefix + entry.name
    if (entry.isFile) {
      const file = await new Promise<File>((resolve,reject) => (entry as FileSystemFileEntry).file(resolve,reject))
      signal?.throwIfAborted(); result.push({path,file}); return
    }
    if (!entry.isDirectory) throw new Error(`Cannot read dropped entry: ${path}`)
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    // readEntries returns batches; one call does not enumerate the whole folder.
    while (true) {
      signal?.throwIfAborted()
      const entries = await new Promise<FileSystemEntry[]>((resolve,reject) => reader.readEntries(resolve,reject))
      if (!entries.length) break
      for (const child of entries) await walk(child,path+'/')
    }
  }
  if (!roots.length) return fallback
  for (const root of roots) {
    // A loose File is already usable; Safari may expose an entry with no backing path.
    if (root.entry?.isDirectory) await walk(root.entry,'')
    else if (root.file) result.push({path:root.file.webkitRelativePath || root.file.name,file:root.file})
    else if (root.entry) await walk(root.entry,'')
    else throw new Error('The browser could not read the dropped folder. Use File → Open folder instead.')
  }
  signal?.throwIfAborted()
  return result
}
