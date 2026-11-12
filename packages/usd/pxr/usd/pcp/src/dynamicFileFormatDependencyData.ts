// Ported from OpenUSD 26.11.1:
//  pxr/usd/pcp/dynamicFileFormatDependencyData.cpp,
//  pxr/usd/pcp/dynamicFileFormatDependencyData.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PcpDynamicFileFormatDependencyData.
// OpenUSD 26.05: dynamicFileFormatDependencyData.{h,cpp}.

import type { PcpDynamicFileFormatInterface } from './dynamicFileFormatInterface.ts'

interface PcpDynamicFileFormatDependencyContext {
  readonly fileFormat: PcpDynamicFileFormatInterface
  readonly dependencyContextData: unknown
}

export class PcpDynamicFileFormatDependencyData {
  private readonly dependencyContexts: PcpDynamicFileFormatDependencyContext[] = []
  private readonly relevantFieldNames = new Set<string>()
  private readonly relevantAttributeNames = new Set<string>()

  constructor(other?: PcpDynamicFileFormatDependencyData) {
    if (other) this.appendDependencyData(other)
  }

  isEmpty(): boolean {
    return this.dependencyContexts.length === 0
  }

  addDependencyContext(
    fileFormat: PcpDynamicFileFormatInterface,
    dependencyContextData: unknown,
    composedFieldNames: Iterable<string>,
    composedAttributeNames: Iterable<string>,
  ): void {
    this.dependencyContexts.push({ fileFormat, dependencyContextData })
    for (const name of composedFieldNames) this.relevantFieldNames.add(name)
    for (const name of composedAttributeNames) this.relevantAttributeNames.add(name)
  }

  appendDependencyData(other: PcpDynamicFileFormatDependencyData): void {
    for (const context of other.dependencyContexts) {
      this.dependencyContexts.push(context)
    }
    for (const name of other.relevantFieldNames) this.relevantFieldNames.add(name)
    for (const name of other.relevantAttributeNames) this.relevantAttributeNames.add(name)
  }

  getRelevantFieldNames(): ReadonlySet<string> {
    return this.relevantFieldNames
  }

  getRelevantAttributeNames(): ReadonlySet<string> {
    return this.relevantAttributeNames
  }

  canFieldChangeAffectFileFormatArguments(
    fieldName: string, oldValue: unknown, newValue: unknown,
  ): boolean {
    if (!this.relevantFieldNames.has(fieldName)) return false
    return this.dependencyContexts.some(({ fileFormat, dependencyContextData }) => {
      const canAffect = fileFormat.canFieldChangeAffectFileFormatArguments
      return canAffect === undefined || canAffect.call(
        fileFormat, fieldName, oldValue, newValue, dependencyContextData)
    })
  }

  canAttributeDefaultValueChangeAffectFileFormatArguments(
    attributeName: string, oldValue: unknown, newValue: unknown,
  ): boolean {
    if (!this.relevantAttributeNames.has(attributeName)) return false
    return this.dependencyContexts.some(({ fileFormat, dependencyContextData }) => {
      const canAffect = fileFormat.canAttributeDefaultValueChangeAffectFileFormatArguments
      return canAffect === undefined || canAffect.call(
        fileFormat, attributeName, oldValue, newValue, dependencyContextData)
    })
  }
}
