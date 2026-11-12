// The errors an action posts, as an upstream test observes them with a
// TfErrorMark. Where OpenUSD's Python tests expect Tf.ErrorException from
// an open, the C++ call returned null with errors posted: here the open
// yields undefined and `errors` is non-empty.
import { TfErrorMark } from 'typescript-usd/tf'

export async function postedErrors<T>(action: () => Promise<T> | T): Promise<{ result: T, errors: string[] }> {
  const mark = new TfErrorMark()
  try {
    const result = await action()
    const errors = mark.getErrors().map(error => error.getCommentary())
    mark.clear()
    return { result, errors }
  } finally {
    mark.dispose()
  }
}
