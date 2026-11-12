// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/materialNetwork.cpp,
//  pxr/imaging/hdSt/materialXFilter.cpp, pxr/imaging/hdSt/renderDelegate.cpp
// Copyright 2017, 2019, 2020 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/hdSt/materialx: turns on Storm's MaterialX support.
//
// Importing this module is the runtime counterpart of building OpenUSD with
// PXR_ENABLE_MATERIALX_SUPPORT (hdSt/CMakeLists.txt:16-34): it brings in
// materialXFilter and materialXShaderGen with hdMtlx, the vendored MaterialX
// generators and the MaterialX 1.39.5 libraries, and installs them in Storm
// (materialXSupport.ts), which then accepts the "mtlx" material render
// context (renderDelegate.cpp:723-727) and runs HdSt_ApplyMaterialXFilter on
// surface networks (materialNetwork.cpp:1182-1187).
//
// usdMtlx is imported too: the filter finds MaterialX terminals through the
// Sdr nodes usdMtlx's discovery and parser plugins register
// (materialXFilter.cpp:1606-1610), and stages can reference .mtlx files.

import 'typescript-usd/usdMtlx'
import { HdSt_ApplyMaterialXFilter } from './materialXFilter.ts'
import { HdSt_SetMaterialXSupport } from './materialXSupport.ts'

HdSt_SetMaterialXSupport({ applyMaterialXFilter: HdSt_ApplyMaterialXFilter })
