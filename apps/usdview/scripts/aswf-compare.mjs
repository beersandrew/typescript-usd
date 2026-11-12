// Exact observed feature-count comparisons, not a declaration of USD parity.
const canonical = value => JSON.stringify(value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b))) : value)
export function compareAssessment(row) {
  if (row.native.status !== 'opened' || row.typescript.status !== 'opened' || row.typescript.assessmentError)
    return { status: 'not-comparable', reason: 'Both complete CPU feature probes must open successfully; native errors remain evidence, not waived expectations.' }
  const fields = ['primCount','types','subdivisionSchemes','shaderIds','animatedAttributeCount']
  const differentFields = fields.filter(field => canonical(row.native[field]) !== canonical(row.typescript[field]))
  return { status: differentFields.length ? 'differences-observed' : 'selected-counts-match', comparedFields: fields, differentFields,
    scope: 'Selected default-composed-stage feature counts only; values, bounds, geometry, variants, materials and pixels are not equivalence-tested.' }
}
export function comparisonSummary(rows) {
  const result = {}
  for (const row of rows) result[row.comparison.status] = (result[row.comparison.status] ?? 0) + 1
  return result
}
