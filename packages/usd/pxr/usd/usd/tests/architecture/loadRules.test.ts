import { describe, expect, it } from 'vitest'
import { StageLoadRules } from '../../src/stageLoadRules.ts'

describe('StageLoadRules', () => {
  it('applies the most specific retained payload inclusion opinion', () => {
    const rules = new StageLoadRules(false)
    rules.include('/World')
    expect(rules.isIncluded('/World/Model')).toBe(true)
    expect(rules.isIncluded('/Other')).toBe(false)
    rules.exclude('/World/Model')
    expect(rules.isIncluded('/World')).toBe(true)
    expect(rules.isIncluded('/World/Model/Child')).toBe(false)
  })

  it('does not reuse removed descendant opinions when replacing a subtree rule', () => {
    const rules = new StageLoadRules(true)
    rules.exclude('/World/Model')
    rules.include('/World')
    expect(rules.isIncluded('/World/Model')).toBe(true)
  })
})
