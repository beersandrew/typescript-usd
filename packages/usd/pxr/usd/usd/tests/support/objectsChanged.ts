// Test support: records UsdNotice::ObjectsChanged notices a stage sends,
// registered with TfNotice::Register(..., stage) as upstream tests do, as
// plain path summaries. The notice itself stays reachable as `notice`.

import { Notice as TfNotice } from 'typescript-usd/tf'
import { Notice as UsdNotice, type Stage } from 'typescript-usd/usd'

export interface ObjectsChangedSummary {
  resyncedPaths: string[]
  changedInfoOnlyPaths: string[]
  // Present only when the notice resynced resolved asset paths.
  resolvedAssetPathsResyncedPaths?: string[]
  readonly notice: UsdNotice.ObjectsChanged
  getChangedFields(path: string): string[]
  hasChangedFields(path: string): boolean
  getPrimResyncType(path: string): [UsdNotice.PrimResyncType, string]
}

export function summarizeObjectsChanged(notice: UsdNotice.ObjectsChanged): ObjectsChangedSummary {
  const assetPaths = notice.getResolvedAssetPathsResyncedPaths().toArray()
  const summary = {
    resyncedPaths: notice.getResyncedPaths().toArray(),
    changedInfoOnlyPaths: notice.getChangedInfoOnlyPaths().toArray(),
    ...(assetPaths.length > 0 ? { resolvedAssetPathsResyncedPaths: assetPaths } : {}),
  } as ObjectsChangedSummary
  Object.defineProperties(summary, {
    notice: { value: notice, enumerable: false },
    getChangedFields: { value: (path: string) => notice.getChangedFields(path), enumerable: false },
    hasChangedFields: { value: (path: string) => notice.hasChangedFields(path), enumerable: false },
    getPrimResyncType: { value: (path: string) => notice.getPrimResyncType(path), enumerable: false },
  })
  return summary
}

/** Calls listener with a summary of each ObjectsChanged notice from stage; returns a revoker. */
export function onObjectsChanged(
  stage: Stage, listener: (notice: ObjectsChangedSummary) => void,
): () => void {
  const key = TfNotice.Register(UsdNotice.ObjectsChanged,
    notice => listener(summarizeObjectsChanged(notice)), stage)
  return () => key.revoke()
}
