// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfTextFile.cpp,
//  pxr/usd/sdf/usdaFileFormat.cpp
// Copyright 2016, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/sdf/testenv/testSdfTextFile.cpp, registration
// testSdfTextFile_1_1 (pxr/usd/sdf/CMakeLists.txt:729-734): the same
// executable run with USD_WRITE_NEW_USDA_FILES_AS_VERSION=1.1. The shared body
// and the mapping of upstream's private Sdf_StringOutput onto
// Layer.exportToString are in textFileCases.ts.
//
// The setting is read once per process upstream
// (SdfUsdaFileFormat::GetDefaultOutputVersion, usdaFileFormat.cpp:688-694);
// it is set before any layer is written in this file.

import { defineTextFileTests } from './textFileCases.ts'

process.env.USD_WRITE_NEW_USDA_FILES_AS_VERSION = '1.1'

defineTextFileTests('testSdfTextFile_1_1', '1.1')
