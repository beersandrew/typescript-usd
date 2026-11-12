/** Files explicitly supplied by a user, with paths relative to one selected mount. */
export interface LocalAssetFile {
  path: string
  file: File
}

/** The UI chooses the root explicitly; dependency lookup never guesses basenames. */
export interface LocalAssetSet {
  rootPath: string
  files: readonly LocalAssetFile[]
}
