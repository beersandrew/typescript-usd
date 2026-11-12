// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/stageView.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 usdviewq/stageView.py:585-597. Library-free so display
// settings load with the core chunk; storm-engine.ts applies them to Storm.
export const renderModes = ['Wireframe','WireframeOnSurface','Smooth Shaded','Flat Shaded','Points','Geom Only','Geom Smooth','Geom Flat','Hidden Surface Wireframe'] as const
export type RenderMode = typeof renderModes[number]
export const selectionColors = {Yellow:[1,1,0,0.5],White:[1,1,1,0.5],Cyan:[0,1,1,0.5]} as const
