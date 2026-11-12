// Ported from OpenUSD 26.11.1: pxr/usd/pcp/dynamicFileFormatInterface.cpp,
//  pxr/usd/pcp/dynamicFileFormatInterface.h
// Copyright 2019, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PcpDynamicFileFormatInterface.
// OpenUSD 26.05: dynamicFileFormatInterface.{h,cpp}.

import type { FileFormatArguments as SdfFileFormatArguments } from 'typescript-usd/sdf'
import type { PcpDynamicFileFormatContext } from './dynamicFileFormatContext.ts'

export interface PcpDynamicFileFormatInterface {
  composeFieldsForFileFormatArguments(
    assetPath: string,
    context: PcpDynamicFileFormatContext,
    args: SdfFileFormatArguments,
  ): unknown
  canFieldChangeAffectFileFormatArguments?(
    field: string, oldValue: unknown, newValue: unknown,
    dependencyContextData: unknown,
  ): boolean
  canAttributeDefaultValueChangeAffectFileFormatArguments?(
    attributeName: string, oldValue: unknown, newValue: unknown,
    dependencyContextData: unknown,
  ): boolean
}

export function pcpIsDynamicFileFormat(
  format: unknown,
): format is { read: (...args: never[]) => unknown } & PcpDynamicFileFormatInterface {
  return typeof format === 'object' && format !== null &&
    typeof (format as Partial<PcpDynamicFileFormatInterface>)
      .composeFieldsForFileFormatArguments === 'function'
}
