// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/pcp/testenv/testPcpCompositionResults.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Generated from OpenUSD v26.08 pxr/usd/pcp/CMakeLists.txt. Regenerate from
// that file; do not hand-curate.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { museumInvalidOpinionRoot } from './compositionInvalidOpinions.ts'
import {
  type CompositionResultsOptions,
  testPcpCompositionResults,
} from './testPcpCompositionResults.ts'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const FIXTURES = path.join(HERE, 'fixtures/compositionResults')
const CASES = [
  { program: "testPcpMuseum_BasicAncestralReference", testenv: "testPcpMuseum_BasicAncestralReference.testenv", layer: "BasicAncestralReference/root.usda", baseline: "compositionResults_BasicAncestralReference.txt" },
  { program: "testPcpMuseum_BasicDuplicateSublayer", testenv: "testPcpMuseum_BasicDuplicateSublayer.testenv", layer: "BasicDuplicateSublayer/root.usda", baseline: "compositionResults_BasicDuplicateSublayer.txt" },
  { program: "testPcpMuseum_BasicInherits", testenv: "testPcpMuseum_BasicInherits.testenv", layer: "BasicInherits/root.usda", baseline: "compositionResults_BasicInherits.txt", errorBaseline: "compositionErrors_BasicInherits.txt" },
  { program: "testPcpMuseum_BasicInstancing", testenv: "testPcpMuseum_BasicInstancing.testenv", layer: "BasicInstancing/root.usda", baseline: "compositionResults_BasicInstancing.txt", overrideInstanceable: true },
  { program: "testPcpMuseum_BasicInstancingAndNestedInstances", testenv: "testPcpMuseum_BasicInstancingAndNestedInstances.testenv", layer: "BasicInstancingAndNestedInstances/root.usda", baseline: "compositionResults_BasicInstancingAndNestedInstances.txt", overrideInstanceable: true },
  { program: "testPcpMuseum_BasicInstancingAndVariants", testenv: "testPcpMuseum_BasicInstancingAndVariants.testenv", layer: "BasicInstancingAndVariants/root.usda", baseline: "compositionResults_BasicInstancingAndVariants.txt", overrideInstanceable: true },
  { program: "testPcpMuseum_BasicListEditing", testenv: "testPcpMuseum_BasicListEditing.testenv", layer: "BasicListEditing/root.usda", baseline: "compositionResults_BasicListEditing_usd.txt" },
  { program: "testPcpMuseum_BasicListEditingWithInherits", testenv: "testPcpMuseum_BasicListEditingWithInherits.testenv", layer: "BasicListEditingWithInherits/root.usda", baseline: "compositionResults_BasicListEditingWithInherits.txt" },
  { program: "testPcpMuseum_BasicLocalAndGlobalClassCombination", testenv: "testPcpMuseum_BasicLocalAndGlobalClassCombination.testenv", layer: "BasicLocalAndGlobalClassCombination/root.usda", baseline: "compositionResults_BasicLocalAndGlobalClassCombination.txt" },
  { program: "testPcpMuseum_BasicNestedPayload", testenv: "testPcpMuseum_BasicNestedPayload.testenv", layer: "BasicNestedPayload/root.usda", baseline: "compositionResults_BasicNestedPayload.txt" },
  { program: "testPcpMuseum_BasicNestedVariants", testenv: "testPcpMuseum_BasicNestedVariants.testenv", layer: "BasicNestedVariants/root.usda", baseline: "compositionResults_BasicNestedVariants.txt" },
  { program: "testPcpMuseum_BasicNestedVariantsWithSameName", testenv: "testPcpMuseum_BasicNestedVariantsWithSameName.testenv", layer: "BasicNestedVariantsWithSameName/root.usda", baseline: "compositionResults_BasicNestedVariantsWithSameName.txt" },
  { program: "testPcpMuseum_BasicOwner", testenv: "testPcpMuseum_BasicOwner.testenv", layer: "BasicOwner/root.usda", baseline: "compositionResults_BasicOwner.txt", session: "BasicOwner/session.usda" },
  { program: "testPcpMuseum_BasicPayload", testenv: "testPcpMuseum_BasicPayload.testenv", layer: "BasicPayload/root.usda", baseline: "compositionResults_BasicPayload.txt", session: "BasicPayload/session.usda", errorBaseline: "compositionErrors_BasicPayload.txt" },
  { program: "testPcpMuseum_BasicPayloadDiamond", testenv: "testPcpMuseum_BasicPayloadDiamond.testenv", layer: "BasicPayloadDiamond/root.usda", baseline: "compositionResults_BasicPayloadDiamond.txt", payloadsSource: "^(?!/RootUnloaded)", overrideInstanceable: true },
  { program: "testPcpMuseum_BasicReference", testenv: "testPcpMuseum_BasicReference.testenv", layer: "BasicReference/root.usda", baseline: "compositionResults_BasicReference.txt", session: "BasicReference/session.usda" },
  { program: "testPcpMuseum_BasicReferenceAndClass", testenv: "testPcpMuseum_BasicReferenceAndClass.testenv", layer: "BasicReferenceAndClass/root.usda", baseline: "compositionResults_BasicReferenceAndClass.txt" },
  { program: "testPcpMuseum_BasicReferenceAndClassDiamond", testenv: "testPcpMuseum_BasicReferenceAndClassDiamond.testenv", layer: "BasicReferenceAndClassDiamond/root.usda", baseline: "compositionResults_BasicReferenceAndClassDiamond.txt" },
  { program: "testPcpMuseum_BasicReferenceDiamond", testenv: "testPcpMuseum_BasicReferenceDiamond.testenv", layer: "BasicReferenceDiamond/root.usda", baseline: "compositionResults_BasicReferenceDiamond.txt" },
  { program: "testPcpMuseum_BasicRelocateToAnimInterface", testenv: "testPcpMuseum_BasicRelocateToAnimInterface.testenv", layer: "BasicRelocateToAnimInterface/root.usda", baseline: "compositionResults_BasicRelocateToAnimInterface.txt" },
  { program: "testPcpMuseum_BasicRelocateToAnimInterfaceAsNewRootPrim", testenv: "testPcpMuseum_BasicRelocateToAnimInterfaceAsNewRootPrim.testenv", layer: "BasicRelocateToAnimInterfaceAsNewRootPrim/root.usda", baseline: "compositionResults_BasicRelocateToAnimInterfaceAsNewRootPrim_usd.txt", errorBaseline: "compositionErrors_BasicRelocateToAnimInterfaceAsNewRootPrim_usd.txt" },
  { program: "testPcpMuseum_BasicSpecializes", testenv: "testPcpMuseum_BasicSpecializes.testenv", layer: "BasicSpecializes/root.usda", baseline: "compositionResults_BasicSpecializes.txt" },
  { program: "testPcpMuseum_BasicSpecializesAndInherits", testenv: "testPcpMuseum_BasicSpecializesAndInherits.testenv", layer: "BasicSpecializesAndInherits/root.usda", baseline: "compositionResults_BasicSpecializesAndInherits.txt" },
  { program: "testPcpMuseum_BasicSpecializesAndReferences", testenv: "testPcpMuseum_BasicSpecializesAndReferences.testenv", layer: "BasicSpecializesAndReferences/root.usda", baseline: "compositionResults_BasicSpecializesAndReferences.txt" },
  { program: "testPcpMuseum_BasicSpecializesAndVariants", testenv: "testPcpMuseum_BasicSpecializesAndVariants.testenv", layer: "BasicSpecializesAndVariants/root.usda", baseline: "compositionResults_BasicSpecializesAndVariants.txt" },
  { program: "testPcpMuseum_BasicTimeOffset", testenv: "testPcpMuseum_BasicTimeOffset.testenv", layer: "BasicTimeOffset/root.usda", baseline: "compositionResults_BasicTimeOffset.txt" },
  { program: "testPcpMuseum_BasicVariantWithConnections", testenv: "testPcpMuseum_BasicVariantWithConnections.testenv", layer: "BasicVariantWithConnections/root.usda", baseline: "compositionResults_BasicVariantWithConnections.txt" },
  { program: "testPcpMuseum_BasicVariantWithReference", testenv: "testPcpMuseum_BasicVariantWithReference.testenv", layer: "BasicVariantWithReference/root.usda", baseline: "compositionResults_BasicVariantWithReference.txt", errorBaseline: "compositionErrors_BasicVariantWithReference.txt" },
  { program: "testPcpMuseum_EdgeCaseLocalAndGlobalClassCombination", testenv: "testPcpMuseum_EdgeCaseLocalAndGlobalClassCombination.testenv", layer: "EdgeCaseLocalAndGlobalClassCombination/root.usda", baseline: "compositionResults_EdgeCaseLocalAndGlobalClassCombination.txt" },
  { program: "testPcpMuseum_ElidedAncestralRelocates", testenv: "testPcpMuseum_ElidedAncestralRelocates.testenv", layer: "ElidedAncestralRelocates/root.usda", baseline: "compositionResults_ElidedAncestralRelocates.txt" },
  { program: "testPcpMuseum_ErrorArcCycle", testenv: "testPcpMuseum_ErrorArcCycle.testenv", layer: "ErrorArcCycle/root.usda", baseline: "compositionResults_ErrorArcCycle.txt", errorBaseline: "compositionErrors_ErrorArcCycle.txt" },
  { program: "testPcpMuseum_ErrorConnectionPermissionDenied", testenv: "testPcpMuseum_ErrorConnectionPermissionDenied.testenv", layer: "ErrorConnectionPermissionDenied/root.usda", baseline: "compositionResults_ErrorConnectionPermissionDenied_usd.txt" },
  { program: "testPcpMuseum_ErrorInconsistentProperties", testenv: "testPcpMuseum_ErrorInconsistentProperties.testenv", layer: "ErrorInconsistentProperties/root.usda", baseline: "compositionResults_ErrorInconsistentProperties_usd.txt", errorBaseline: "compositionErrors_ErrorInconsistentProperties_usd.txt" },
  { program: "testPcpMuseum_ErrorInvalidAuthoredRelocates", testenv: "testPcpMuseum_ErrorInvalidAuthoredRelocates.testenv", layer: "ErrorInvalidAuthoredRelocates/root.usda", baseline: "compositionResults_ErrorInvalidAuthoredRelocates.txt", errorBaseline: "compositionErrors_ErrorInvalidAuthoredRelocates.txt" },
  { program: "testPcpMuseum_ErrorInvalidConflictingRelocates", testenv: "testPcpMuseum_ErrorInvalidConflictingRelocates.testenv", layer: "ErrorInvalidConflictingRelocates/root.usda", baseline: "compositionResults_ErrorInvalidConflictingRelocates.txt", errorBaseline: "compositionErrors_ErrorInvalidConflictingRelocates.txt" },
  { program: "testPcpMuseum_ErrorInvalidInstanceTargetPath", testenv: "testPcpMuseum_ErrorInvalidInstanceTargetPath.testenv", layer: "ErrorInvalidInstanceTargetPath/root.usda", baseline: "compositionResults_ErrorInvalidInstanceTargetPath_usd.txt", errorBaseline: "compositionErrors_ErrorInvalidInstanceTargetPath_usd.txt" },
  { program: "testPcpMuseum_ErrorInvalidPayload", testenv: "testPcpMuseum_ErrorInvalidPayload.testenv", layer: "ErrorInvalidPayload/root.usda", baseline: "compositionResults_ErrorInvalidPayload.txt", errorBaseline: "compositionErrors_ErrorInvalidPayload.txt" },
  { program: "testPcpMuseum_ErrorInvalidPreRelocateTargetPath", testenv: "testPcpMuseum_ErrorInvalidPreRelocateTargetPath.testenv", layer: "ErrorInvalidPreRelocateTargetPath/root.usda", baseline: "compositionResults_ErrorInvalidPreRelocateTargetPath_usd.txt" },
  { program: "testPcpMuseum_ErrorInvalidReferenceToRelocationSource", testenv: "testPcpMuseum_ErrorInvalidReferenceToRelocationSource.testenv", layer: "ErrorInvalidReferenceToRelocationSource/root.usda", baseline: "compositionResults_ErrorInvalidReferenceToRelocationSource.txt", errorBaseline: "compositionErrors_ErrorInvalidReferenceToRelocationSource.txt" },
  { program: "testPcpMuseum_ErrorInvalidTargetPath", testenv: "testPcpMuseum_ErrorInvalidTargetPath.testenv", layer: "ErrorInvalidTargetPath/root.usda", baseline: "compositionResults_ErrorInvalidTargetPath.txt", errorBaseline: "compositionErrors_ErrorInvalidTargetPath.txt" },
  { program: "testPcpMuseum_ErrorOpinionAtRelocationSource", testenv: "testPcpMuseum_ErrorOpinionAtRelocationSource.testenv", layer: "ErrorOpinionAtRelocationSource/root.usda", baseline: "compositionResults_ErrorOpinionAtRelocationSource.txt", errorBaseline: "compositionErrors_ErrorOpinionAtRelocationSource.txt" },
  { program: "testPcpMuseum_ErrorOwner", testenv: "testPcpMuseum_ErrorOwner.testenv", layer: "ErrorOwner/root.usda", baseline: "compositionResults_ErrorOwner.txt", session: "ErrorOwner/session.usda", errorBaseline: "compositionErrors_ErrorOwner.txt" },
  { program: "testPcpMuseum_ErrorPermissionDenied", testenv: "testPcpMuseum_ErrorPermissionDenied.testenv", layer: "ErrorPermissionDenied/root.usda", baseline: "compositionResults_ErrorPermissionDenied_usd.txt" },
  { program: "testPcpMuseum_ErrorRelocateWithVariantSelection", testenv: "testPcpMuseum_ErrorRelocateWithVariantSelection.testenv", layer: "ErrorRelocateWithVariantSelection/root.usda", baseline: "compositionResults_ErrorRelocateWithVariantSelection.txt", errorBaseline: "compositionErrors_ErrorRelocateWithVariantSelection.txt" },
  { program: "testPcpMuseum_ErrorSublayerCycle", testenv: "testPcpMuseum_ErrorSublayerCycle.testenv", layer: "ErrorSublayerCycle/root.usda", baseline: "compositionResults_ErrorSublayerCycle.txt", errorBaseline: "compositionErrors_ErrorSublayerCycle.txt" },
  { program: "testPcpMuseum_ExpressionsInPayloads", testenv: "testPcpMuseum_ExpressionsInPayloads.testenv", layer: "ExpressionsInPayloads/root.usda", baseline: "compositionResults_ExpressionsInPayloads.txt" },
  { program: "testPcpMuseum_ExpressionsInReferences", testenv: "testPcpMuseum_ExpressionsInReferences.testenv", layer: "ExpressionsInReferences/root.usda", baseline: "compositionResults_ExpressionsInReferences.txt" },
  { program: "testPcpMuseum_ExpressionsInSublayers", testenv: "testPcpMuseum_ExpressionsInSublayers.testenv", layer: "ExpressionsInSublayers/root.usda", baseline: "compositionResults_ExpressionsInSublayers.txt", session: "ExpressionsInSublayers/session.usda", errorBaseline: "compositionErrors_ExpressionsInSublayers.txt" },
  { program: "testPcpMuseum_ExpressionsInVariantSelections", testenv: "testPcpMuseum_ExpressionsInVariantSelections.testenv", layer: "ExpressionsInVariantSelections/root.usda", baseline: "compositionResults_ExpressionsInVariantSelections.txt", errorBaseline: "compositionErrors_ExpressionsInVariantSelections.txt" },
  { program: "testPcpMuseum_ImpliedAndAncestralInherits", testenv: "testPcpMuseum_ImpliedAndAncestralInherits.testenv", layer: "ImpliedAndAncestralInherits/root.usda", baseline: "compositionResults_ImpliedAndAncestralInherits.txt" },
  { program: "testPcpMuseum_ImpliedAndAncestralInherits_ComplexEvaluation", testenv: "testPcpMuseum_ImpliedAndAncestralInherits_ComplexEvaluation.testenv", layer: "ImpliedAndAncestralInherits_ComplexEvaluation/root.usda", baseline: "compositionResults_ImpliedAndAncestralInherits_ComplexEvaluation.txt" },
  { program: "testPcpMuseum_ImpliedAndAncestralInherits_graph", testenvSuffix: "ImpliedAndAncestralInherits", layer: "ImpliedAndAncestralInherits/root.usda", baseline: "compositionResults_ImpliedAndAncestralInherits_graph.txt", dumpPath: "/World/CharGroup/Sim/includes/Hand/Geom", dumpMaps: true },
  { program: "testPcpMuseum_ImpliedArcsAndInstancing", testenv: "testPcpMuseum_ImpliedArcsAndInstancing.testenv", layer: "ImpliedArcsAndInstancing/root.usda", baseline: "compositionResults_ImpliedArcsAndInstancing.txt" },
  { program: "testPcpMuseum_InternalReferenceInOffsetSublayer", testenv: "testPcpMuseum_InternalReferenceInOffsetSublayer.testenv", layer: "InternalReferenceInOffsetSublayer/root.usda", baseline: "compositionResults_InternalReferenceInOffsetSublayer.txt" },
  { program: "testPcpMuseum_ListOpsWithLayerOffsets_delete", testenvSuffix: "ListOpsWithLayerOffsets", layer: "ListOpsWithLayerOffsets/base_delete.usda", baseline: "compositionResults_ListOps_delete.txt" },
  { program: "testPcpMuseum_ListOpsWithLayerOffsets_delete_24", testenvSuffix: "ListOpsWithLayerOffsets", layer: "ListOpsWithLayerOffsets/base_delete_24.usda", baseline: "compositionResults_ListOps_delete_24.txt" },
  { program: "testPcpMuseum_ListOpsWithLayerOffsets_multi_offset_sublayer", testenvSuffix: "ListOpsWithLayerOffsets", layer: "ListOpsWithLayerOffsets/base_multi_offset_sublayer.usda", baseline: "compositionResults_ListOps_multi_offset_sublayer.txt" },
  { program: "testPcpMuseum_ListOpsWithLayerOffsets_prepend", testenvSuffix: "ListOpsWithLayerOffsets", layer: "ListOpsWithLayerOffsets/base_prepend.usda", baseline: "compositionResults_ListOps_prepend.txt" },
  { program: "testPcpMuseum_ListOpsWithLayerOffsets_sub_scaled", testenvSuffix: "ListOpsWithLayerOffsets", layer: "ListOpsWithLayerOffsets/base_sub_scaled.usda", baseline: "compositionResults_ListOps_sub_scaled.txt" },
  { program: "testPcpMuseum_ListOpsWithLayerOffsets_x2", testenvSuffix: "ListOpsWithLayerOffsets", layer: "ListOpsWithLayerOffsets/base_x2.usda", baseline: "compositionResults_ListOps_x2.txt" },
  { program: "testPcpMuseum_PayloadsAndAncestralArcs", testenv: "testPcpMuseum_PayloadsAndAncestralArcs.testenv", layer: "PayloadsAndAncestralArcs/root.usda", baseline: "compositionResults_PayloadsAndAncestralArcs.txt", payloadsSource: "^(?!/Root/UnloadedInheritedPayload)" },
  { program: "testPcpMuseum_PayloadsAndAncestralArcs2", testenv: "testPcpMuseum_PayloadsAndAncestralArcs2.testenv", layer: "PayloadsAndAncestralArcs2/root.usda", baseline: "compositionResults_PayloadsAndAncestralArcs2.txt" },
  { program: "testPcpMuseum_PayloadsAndAncestralArcs3_allpayloads", testenvSuffix: "PayloadsAndAncestralArcs3", layer: "PayloadsAndAncestralArcs3/root.usda", baseline: "compositionResults_PayloadsAndAncestralArcs3_allpayloads.txt" },
  { program: "testPcpMuseum_PayloadsAndAncestralArcs3_refpayloadsonly", testenvSuffix: "PayloadsAndAncestralArcs3", layer: "PayloadsAndAncestralArcs3/root.usda", baseline: "compositionResults_PayloadsAndAncestralArcs3_refpayloadsonly.txt", payloadsSource: ".*Reference.*" },
  { program: "testPcpMuseum_ReferenceListOpsWithOffsets", testenv: "testPcpMuseum_ReferenceListOpsWithOffsets.testenv", layer: "ReferenceListOpsWithOffsets/root.usda", baseline: "compositionResults_ReferenceListOpsWithOffsets.txt" },
  { program: "testPcpMuseum_RelativePathPayloads", testenv: "testPcpMuseum_RelativePathPayloads.testenv", layer: "RelativePathPayloads/root.usda", baseline: "compositionResults_RelativePathPayloads.txt" },
  { program: "testPcpMuseum_RelativePathReferences", testenv: "testPcpMuseum_RelativePathReferences.testenv", layer: "RelativePathReferences/root.usda", baseline: "compositionResults_RelativePathReferences.txt" },
  { program: "testPcpMuseum_RelocatePrimsWithSameName", testenv: "testPcpMuseum_RelocatePrimsWithSameName.testenv", layer: "RelocatePrimsWithSameName/root.usda", baseline: "compositionResults_RelocatePrimsWithSameName.txt", errorBaseline: "compositionErrors_RelocatePrimsWithSameName.txt" },
  { program: "testPcpMuseum_RelocateToNone", testenv: "testPcpMuseum_RelocateToNone.testenv", layer: "RelocateToNone/root.usda", baseline: "compositionResults_RelocateToNone_usd.txt", errorBaseline: "compositionErrors_RelocateToNone_usd.txt" },
  { program: "testPcpMuseum_SpecializesAndAncestralArcs", testenv: "testPcpMuseum_SpecializesAndAncestralArcs.testenv", layer: "SpecializesAndAncestralArcs/root.usda", baseline: "compositionResults_SpecializesAndAncestralArcs.txt" },
  { program: "testPcpMuseum_SpecializesAndAncestralArcs2", testenv: "testPcpMuseum_SpecializesAndAncestralArcs2.testenv", layer: "SpecializesAndAncestralArcs2/root.usda", baseline: "compositionResults_SpecializesAndAncestralArcs2.txt" },
  { program: "testPcpMuseum_SpecializesAndAncestralArcs3", testenv: "testPcpMuseum_SpecializesAndAncestralArcs3.testenv", layer: "SpecializesAndAncestralArcs3/root.usda", baseline: "compositionResults_SpecializesAndAncestralArcs3.txt" },
  { program: "testPcpMuseum_SpecializesAndAncestralArcs4", testenv: "testPcpMuseum_SpecializesAndAncestralArcs4.testenv", layer: "SpecializesAndAncestralArcs4/root.usda", baseline: "compositionResults_SpecializesAndAncestralArcs4.txt" },
  { program: "testPcpMuseum_SpecializesAndAncestralArcs4_graph", testenvSuffix: "SpecializesAndAncestralArcs4", layer: "SpecializesAndAncestralArcs4/root.usda", baseline: "compositionResults_SpecializesAndAncestralArcs4_graph.txt", dumpPath: "/Parent/Child" },
  { program: "testPcpMuseum_SpecializesAndAncestralArcs5", testenv: "testPcpMuseum_SpecializesAndAncestralArcs5.testenv", layer: "SpecializesAndAncestralArcs5/root.usda", baseline: "compositionResults_SpecializesAndAncestralArcs5.txt" },
  { program: "testPcpMuseum_SpecializesAndDuplicateArcs", testenv: "testPcpMuseum_SpecializesAndDuplicateArcs.testenv", layer: "SpecializesAndDuplicateArcs/root.usda", baseline: "compositionResults_SpecializesAndDuplicateArcs.txt" },
  { program: "testPcpMuseum_SpecializesAndVariants", testenv: "testPcpMuseum_SpecializesAndVariants.testenv", layer: "SpecializesAndVariants/root.usda", baseline: "compositionResults_SpecializesAndVariants.txt" },
  { program: "testPcpMuseum_SpecializesAndVariants2", testenv: "testPcpMuseum_SpecializesAndVariants2.testenv", layer: "SpecializesAndVariants2/root.usda", baseline: "compositionResults_SpecializesAndVariants2.txt" },
  { program: "testPcpMuseum_SpecializesAndVariants3", testenv: "testPcpMuseum_SpecializesAndVariants3.testenv", layer: "SpecializesAndVariants3/root.usda", baseline: "compositionResults_SpecializesAndVariants3.txt" },
  { program: "testPcpMuseum_SubrootInheritsAndVariants", testenv: "testPcpMuseum_SubrootInheritsAndVariants.testenv", layer: "SubrootInheritsAndVariants/root.usda", baseline: "compositionResults_SubrootInheritsAndVariants.txt" },
  { program: "testPcpMuseum_SubrootReferenceAndClasses", testenv: "testPcpMuseum_SubrootReferenceAndClasses.testenv", layer: "SubrootReferenceAndClasses/root.usda", baseline: "compositionResults_SubrootReferenceAndClasses.txt" },
  { program: "testPcpMuseum_SubrootReferenceAndRelocates", testenv: "testPcpMuseum_SubrootReferenceAndRelocates.testenv", layer: "SubrootReferenceAndRelocates/root.usda", baseline: "compositionResults_SubrootReferenceAndRelocates.txt" },
  { program: "testPcpMuseum_SubrootReferenceAndVariants", testenv: "testPcpMuseum_SubrootReferenceAndVariants.testenv", layer: "SubrootReferenceAndVariants/root.usda", baseline: "compositionResults_SubrootReferenceAndVariants.txt", errorBaseline: "compositionErrors_SubrootReferenceAndVariants.txt" },
  { program: "testPcpMuseum_SubrootReferenceAndVariants2", testenv: "testPcpMuseum_SubrootReferenceAndVariants2.testenv", layer: "SubrootReferenceAndVariants2/root.usda", baseline: "compositionResults_SubrootReferenceAndVariants2.txt" },
  { program: "testPcpMuseum_SubrootReferenceNonCycle", testenv: "testPcpMuseum_SubrootReferenceNonCycle.testenv", layer: "SubrootReferenceNonCycle/root.usda", baseline: "compositionResults_SubrootReferenceNonCycle.txt", errorBaseline: "compositionErrors_SubrootReferenceNonCycle.txt" },
  { program: "testPcpMuseum_TimeCodesPerSecond1", testenvSuffix: "TimeCodesPerSecond", layer: "TimeCodesPerSecond/root.usda", baseline: "compositionResults_TimeCodesPerSecond1.txt" },
  { program: "testPcpMuseum_TimeCodesPerSecond2", testenvSuffix: "TimeCodesPerSecond", layer: "TimeCodesPerSecond/root_48tcps.usda", baseline: "compositionResults_TimeCodesPerSecond2.txt" },
  { program: "testPcpMuseum_TimeCodesPerSecond3", testenvSuffix: "TimeCodesPerSecond", layer: "TimeCodesPerSecond/root_24tcps_12fps.usda", baseline: "compositionResults_TimeCodesPerSecond3.txt" },
  { program: "testPcpMuseum_TimeCodesPerSecond4", testenvSuffix: "TimeCodesPerSecond", layer: "TimeCodesPerSecond/root_12fps.usda", baseline: "compositionResults_TimeCodesPerSecond4.txt" },
  { program: "testPcpMuseum_TimeCodesPerSecondWithSessionLayer1", testenvSuffix: "TimeCodesPerSecond", layer: "TimeCodesPerSecond/root_24tcps_12fps.usda", baseline: "compositionResults_TimeCodesPerSecondWithSessionLayer1.txt", session: "TimeCodesPerSecond/session_48tcps.usda" },
  { program: "testPcpMuseum_TimeCodesPerSecondWithSessionLayer2", testenvSuffix: "TimeCodesPerSecond", layer: "TimeCodesPerSecond/root_48tcps.usda", baseline: "compositionResults_TimeCodesPerSecondWithSessionLayer2.txt", session: "TimeCodesPerSecond/session_24fps.usda" },
  { program: "testPcpMuseum_TimeCodesPerSecondWithSessionLayer3", testenvSuffix: "TimeCodesPerSecond", layer: "TimeCodesPerSecond/root_12fps.usda", baseline: "compositionResults_TimeCodesPerSecondWithSessionLayer3.txt", session: "TimeCodesPerSecond/session_24fps.usda" },
  { program: "testPcpMuseum_TimeCodesPerSecondWithSessionLayer4", testenvSuffix: "TimeCodesPerSecond", layer: "TimeCodesPerSecond/root_12fps.usda", baseline: "compositionResults_TimeCodesPerSecondWithSessionLayer4.txt", session: "TimeCodesPerSecond/session.usda" },
  { program: "testPcpMuseum_TrickyClassHierarchy", testenv: "testPcpMuseum_TrickyClassHierarchy.testenv", layer: "TrickyClassHierarchy/root.usda", baseline: "compositionResults_TrickyClassHierarchy.txt" },
  { program: "testPcpMuseum_TrickyConnectionToRelocatedAttribute", testenv: "testPcpMuseum_TrickyConnectionToRelocatedAttribute.testenv", layer: "TrickyConnectionToRelocatedAttribute/root.usda", baseline: "compositionResults_TrickyConnectionToRelocatedAttribute.txt" },
  { program: "testPcpMuseum_TrickyInheritsAndRelocates", testenv: "testPcpMuseum_TrickyInheritsAndRelocates.testenv", layer: "TrickyInheritsAndRelocates/root.usda", baseline: "compositionResults_TrickyInheritsAndRelocates.txt", errorBaseline: "compositionErrors_TrickyInheritsAndRelocates.txt" },
  { program: "testPcpMuseum_TrickyInheritsAndRelocates2", testenv: "testPcpMuseum_TrickyInheritsAndRelocates2.testenv", layer: "TrickyInheritsAndRelocates2/root.usda", baseline: "compositionResults_TrickyInheritsAndRelocates2.txt" },
  { program: "testPcpMuseum_TrickyInheritsAndRelocates3", testenv: "testPcpMuseum_TrickyInheritsAndRelocates3.testenv", layer: "TrickyInheritsAndRelocates3/root.usda", baseline: "compositionResults_TrickyInheritsAndRelocates3.txt" },
  { program: "testPcpMuseum_TrickyInheritsAndRelocates4", testenv: "testPcpMuseum_TrickyInheritsAndRelocates4.testenv", layer: "TrickyInheritsAndRelocates4/root.usda", baseline: "compositionResults_TrickyInheritsAndRelocates4.txt" },
  { program: "testPcpMuseum_TrickyInheritsAndRelocates5", testenv: "testPcpMuseum_TrickyInheritsAndRelocates5.testenv", layer: "TrickyInheritsAndRelocates5/root.usda", baseline: "compositionResults_TrickyInheritsAndRelocates5.txt" },
  { program: "testPcpMuseum_TrickyInheritsAndRelocatesToNewRootPrim", testenv: "testPcpMuseum_TrickyInheritsAndRelocatesToNewRootPrim.testenv", layer: "TrickyInheritsAndRelocatesToNewRootPrim/root.usda", baseline: "compositionResults_TrickyInheritsAndRelocatesToNewRootPrim.txt", errorBaseline: "compositionErrors_TrickyInheritsAndRelocatesToNewRootPrim.txt" },
  { program: "testPcpMuseum_TrickyInheritsInVariants", testenv: "testPcpMuseum_TrickyInheritsInVariants.testenv", layer: "TrickyInheritsInVariants/root.usda", baseline: "compositionResults_TrickyInheritsInVariants.txt" },
  { program: "testPcpMuseum_TrickyInheritsInVariants2", testenv: "testPcpMuseum_TrickyInheritsInVariants2.testenv", layer: "TrickyInheritsInVariants2/root.usda", baseline: "compositionResults_TrickyInheritsInVariants2.txt" },
  { program: "testPcpMuseum_TrickyListEditedTargetPaths", testenv: "testPcpMuseum_TrickyListEditedTargetPaths.testenv", layer: "TrickyListEditedTargetPaths/root.usda", baseline: "compositionResults_TrickyListEditedTargetPaths.txt" },
  { program: "testPcpMuseum_TrickyLocalClassHierarchyWithRelocates", testenv: "testPcpMuseum_TrickyLocalClassHierarchyWithRelocates.testenv", layer: "TrickyLocalClassHierarchyWithRelocates/root.usda", baseline: "compositionResults_TrickyLocalClassHierarchyWithRelocates.txt" },
  { program: "testPcpMuseum_TrickyMultipleRelocations", testenv: "testPcpMuseum_TrickyMultipleRelocations.testenv", layer: "TrickyMultipleRelocations/root.usda", baseline: "compositionResults_TrickyMultipleRelocations.txt" },
  { program: "testPcpMuseum_TrickyMultipleRelocations2", testenv: "testPcpMuseum_TrickyMultipleRelocations2.testenv", layer: "TrickyMultipleRelocations2/root.usda", baseline: "compositionResults_TrickyMultipleRelocations2.txt" },
  { program: "testPcpMuseum_TrickyMultipleRelocations3", testenv: "testPcpMuseum_TrickyMultipleRelocations3.testenv", layer: "TrickyMultipleRelocations3/root.usda", baseline: "compositionResults_TrickyMultipleRelocations3.txt" },
  { program: "testPcpMuseum_TrickyMultipleRelocations4", testenv: "testPcpMuseum_TrickyMultipleRelocations4.testenv", layer: "TrickyMultipleRelocations4/root.usda", baseline: "compositionResults_TrickyMultipleRelocations4.txt" },
  { program: "testPcpMuseum_TrickyMultipleRelocations5", testenv: "testPcpMuseum_TrickyMultipleRelocations5.testenv", layer: "TrickyMultipleRelocations5/root.usda", baseline: "compositionResults_TrickyMultipleRelocations5.txt" },
  { program: "testPcpMuseum_TrickyMultipleRelocationsAndClasses", testenv: "testPcpMuseum_TrickyMultipleRelocationsAndClasses.testenv", layer: "TrickyMultipleRelocationsAndClasses/root.usda", baseline: "compositionResults_TrickyMultipleRelocationsAndClasses.txt" },
  { program: "testPcpMuseum_TrickyMultipleRelocationsAndClasses2", testenv: "testPcpMuseum_TrickyMultipleRelocationsAndClasses2.testenv", layer: "TrickyMultipleRelocationsAndClasses2/root.usda", baseline: "compositionResults_TrickyMultipleRelocationsAndClasses2.txt" },
  { program: "testPcpMuseum_TrickyMultipleRelocationsAndClasses3", testenv: "testPcpMuseum_TrickyMultipleRelocationsAndClasses3.testenv", layer: "TrickyMultipleRelocationsAndClasses3/root.usda", baseline: "compositionResults_TrickyMultipleRelocationsAndClasses3.txt" },
  { program: "testPcpMuseum_TrickyNestedClasses", testenv: "testPcpMuseum_TrickyNestedClasses.testenv", layer: "TrickyNestedClasses/root.usda", baseline: "compositionResults_TrickyNestedClasses.txt" },
  { program: "testPcpMuseum_TrickyNestedClasses2", testenv: "testPcpMuseum_TrickyNestedClasses2.testenv", layer: "TrickyNestedClasses2/root.usda", baseline: "compositionResults_TrickyNestedClasses2.txt" },
  { program: "testPcpMuseum_TrickyNestedClasses3", testenv: "testPcpMuseum_TrickyNestedClasses3.testenv", layer: "TrickyNestedClasses3/root.usda", baseline: "compositionResults_TrickyNestedClasses3.txt" },
  { program: "testPcpMuseum_TrickyNestedClasses4", testenv: "testPcpMuseum_TrickyNestedClasses4.testenv", layer: "TrickyNestedClasses4/root.usda", baseline: "compositionResults_TrickyNestedClasses4.txt" },
  { program: "testPcpMuseum_TrickyNestedSpecializes", testenv: "testPcpMuseum_TrickyNestedSpecializes.testenv", layer: "TrickyNestedSpecializes/root.usda", baseline: "compositionResults_TrickyNestedSpecializes.txt" },
  { program: "testPcpMuseum_TrickyNestedSpecializes2", testenv: "testPcpMuseum_TrickyNestedSpecializes2.testenv", layer: "TrickyNestedSpecializes2/root.usda", baseline: "compositionResults_TrickyNestedSpecializes2.txt" },
  { program: "testPcpMuseum_TrickyNestedVariants", testenv: "testPcpMuseum_TrickyNestedVariants.testenv", layer: "TrickyNestedVariants/root.usda", baseline: "compositionResults_TrickyNestedVariants.txt" },
  { program: "testPcpMuseum_TrickyNonLocalVariantSelection", testenv: "testPcpMuseum_TrickyNonLocalVariantSelection.testenv", layer: "TrickyNonLocalVariantSelection/root.usda", baseline: "compositionResults_TrickyNonLocalVariantSelection.txt" },
  { program: "testPcpMuseum_TrickyRelocatedTargetInVariant", testenv: "testPcpMuseum_TrickyRelocatedTargetInVariant.testenv", layer: "TrickyRelocatedTargetInVariant/root.usda", baseline: "compositionResults_TrickyRelocatedTargetInVariant.txt" },
  { program: "testPcpMuseum_TrickyRelocationOfPrimFromPayload", testenv: "testPcpMuseum_TrickyRelocationOfPrimFromPayload.testenv", layer: "TrickyRelocationOfPrimFromPayload/root.usda", baseline: "compositionResults_TrickyRelocationOfPrimFromPayload.txt" },
  { program: "testPcpMuseum_TrickyRelocationOfPrimFromVariant", testenv: "testPcpMuseum_TrickyRelocationOfPrimFromVariant.testenv", layer: "TrickyRelocationOfPrimFromVariant/root.usda", baseline: "compositionResults_TrickyRelocationOfPrimFromVariant.txt" },
  { program: "testPcpMuseum_TrickyRelocationSquatter", testenv: "testPcpMuseum_TrickyRelocationSquatter.testenv", layer: "TrickyRelocationSquatter/root.usda", baseline: "compositionResults_TrickyRelocationSquatter.txt" },
  { program: "testPcpMuseum_TrickySpecializesAndInherits", testenv: "testPcpMuseum_TrickySpecializesAndInherits.testenv", layer: "TrickySpecializesAndInherits/root.usda", baseline: "compositionResults_TrickySpecializesAndInherits.txt" },
  { program: "testPcpMuseum_TrickySpecializesAndInherits2", testenv: "testPcpMuseum_TrickySpecializesAndInherits2.testenv", layer: "TrickySpecializesAndInherits2/root.usda", baseline: "compositionResults_TrickySpecializesAndInherits2.txt" },
  { program: "testPcpMuseum_TrickySpecializesAndInherits3", testenv: "testPcpMuseum_TrickySpecializesAndInherits3.testenv", layer: "TrickySpecializesAndInherits3/root.usda", baseline: "compositionResults_TrickySpecializesAndInherits3.txt" },
  { program: "testPcpMuseum_TrickySpecializesAndRelocates", testenv: "testPcpMuseum_TrickySpecializesAndRelocates.testenv", layer: "TrickySpecializesAndRelocates/root.usda", baseline: "compositionResults_TrickySpecializesAndRelocates.txt" },
  { program: "testPcpMuseum_TrickySpookyInherits", testenv: "testPcpMuseum_TrickySpookyInherits.testenv", layer: "TrickySpookyInherits/root.usda", baseline: "compositionResults_TrickySpookyInherits.txt" },
  { program: "testPcpMuseum_TrickySpookyInheritsInSymmetricArmRig", testenv: "testPcpMuseum_TrickySpookyInheritsInSymmetricArmRig.testenv", layer: "TrickySpookyInheritsInSymmetricArmRig/root.usda", baseline: "compositionResults_TrickySpookyInheritsInSymmetricArmRig.txt" },
  { program: "testPcpMuseum_TrickySpookyInheritsInSymmetricBrowRig", testenv: "testPcpMuseum_TrickySpookyInheritsInSymmetricBrowRig.testenv", layer: "TrickySpookyInheritsInSymmetricBrowRig/root.usda", baseline: "compositionResults_TrickySpookyInheritsInSymmetricBrowRig.txt" },
  { program: "testPcpMuseum_TrickySpookyVariantSelection", testenv: "testPcpMuseum_TrickySpookyVariantSelection.testenv", layer: "TrickySpookyVariantSelection/root.usda", baseline: "compositionResults_TrickySpookyVariantSelection.txt" },
  { program: "testPcpMuseum_TrickySpookyVariantSelectionInClass", testenv: "testPcpMuseum_TrickySpookyVariantSelectionInClass.testenv", layer: "TrickySpookyVariantSelectionInClass/root.usda", baseline: "compositionResults_TrickySpookyVariantSelectionInClass.txt" },
  { program: "testPcpMuseum_TrickyVariantAncestralSelection", testenv: "testPcpMuseum_TrickyVariantAncestralSelection.testenv", layer: "TrickyVariantAncestralSelection/root.usda", baseline: "compositionResults_TrickyVariantAncestralSelection.txt" },
  { program: "testPcpMuseum_TrickyVariantInPayload", testenv: "testPcpMuseum_TrickyVariantInPayload.testenv", layer: "TrickyVariantInPayload/root.usda", baseline: "compositionResults_TrickyVariantInPayload.txt" },
  { program: "testPcpMuseum_TrickyVariantIndependentSelection", testenv: "testPcpMuseum_TrickyVariantIndependentSelection.testenv", layer: "TrickyVariantIndependentSelection/root.usda", baseline: "compositionResults_TrickyVariantIndependentSelection.txt" },
  { program: "testPcpMuseum_TrickyVariantOverrideOfLocalClass", testenv: "testPcpMuseum_TrickyVariantOverrideOfLocalClass.testenv", layer: "TrickyVariantOverrideOfLocalClass/root.usda", baseline: "compositionResults_TrickyVariantOverrideOfLocalClass.txt" },
  { program: "testPcpMuseum_TrickyVariantOverrideOfRelocatedPrim", testenv: "testPcpMuseum_TrickyVariantOverrideOfRelocatedPrim.testenv", layer: "TrickyVariantOverrideOfRelocatedPrim/root.usda", baseline: "compositionResults_TrickyVariantOverrideOfRelocatedPrim.txt" },
  { program: "testPcpMuseum_TrickyVariantSelectionInVariant", testenv: "testPcpMuseum_TrickyVariantSelectionInVariant.testenv", layer: "TrickyVariantSelectionInVariant/root.usda", baseline: "compositionResults_TrickyVariantSelectionInVariant.txt" },
  { program: "testPcpMuseum_TrickyVariantSelectionInVariant2", testenv: "testPcpMuseum_TrickyVariantSelectionInVariant2.testenv", layer: "TrickyVariantSelectionInVariant2/root.usda", baseline: "compositionResults_TrickyVariantSelectionInVariant2.txt" },
  { program: "testPcpMuseum_TrickyVariantWeakerSelection", testenv: "testPcpMuseum_TrickyVariantWeakerSelection.testenv", layer: "TrickyVariantWeakerSelection/root.usda", baseline: "compositionResults_TrickyVariantWeakerSelection.txt" },
  { program: "testPcpMuseum_TrickyVariantWeakerSelection2", testenv: "testPcpMuseum_TrickyVariantWeakerSelection2.testenv", layer: "TrickyVariantWeakerSelection2/root.usda", baseline: "compositionResults_TrickyVariantWeakerSelection2.txt" },
  { program: "testPcpMuseum_TrickyVariantWeakerSelection3", testenv: "testPcpMuseum_TrickyVariantWeakerSelection3.testenv", layer: "TrickyVariantWeakerSelection3/root.usda", baseline: "compositionResults_TrickyVariantWeakerSelection3.txt" },
  { program: "testPcpMuseum_TrickyVariantWeakerSelection4", testenv: "testPcpMuseum_TrickyVariantWeakerSelection4.testenv", layer: "TrickyVariantWeakerSelection4/root.usda", baseline: "compositionResults_TrickyVariantWeakerSelection4.txt" },
  { program: "testPcpMuseum_TypicalReferenceToChargroup", testenv: "testPcpMuseum_TypicalReferenceToChargroup.testenv", layer: "TypicalReferenceToChargroup/root.usda", baseline: "compositionResults_TypicalReferenceToChargroup.txt" },
  { program: "testPcpMuseum_TypicalReferenceToChargroupWithRename", testenv: "testPcpMuseum_TypicalReferenceToChargroupWithRename.testenv", layer: "TypicalReferenceToChargroupWithRename/root.usda", baseline: "compositionResults_TypicalReferenceToChargroupWithRename.txt" },
  { program: "testPcpMuseum_TypicalReferenceToRiggedModel", testenv: "testPcpMuseum_TypicalReferenceToRiggedModel.testenv", layer: "TypicalReferenceToRiggedModel/root.usda", baseline: "compositionResults_TypicalReferenceToRiggedModel.txt" },
  { program: "testPcpMuseum_UnmappableImpliedInherit", testenv: "testPcpMuseum_UnmappableImpliedInherit.testenv", layer: "UnmappableImpliedInherit/root.usda", baseline: "compositionResults_UnmappableImpliedInherit.txt" },
  { program: "testPcpMuseum_VariantSelectionsInVariantsOrder", testenv: "testPcpMuseum_VariantSelectionsInVariantsOrder.testenv", layer: "VariantSelectionsInVariantsOrder/root.usda", baseline: "compositionResults_VariantSelectionsInVariantsOrder.txt" },
  { program: "testPcpMuseum_VariantSpecializesAndReference", testenv: "testPcpMuseum_VariantSpecializesAndReference.testenv", layer: "VariantSpecializesAndReference/root.usda", baseline: "compositionResults_VariantSpecializesAndReference.txt" },
  { program: "testPcpMuseum_VariantSpecializesAndReferenceSurprisingBehavior", testenv: "testPcpMuseum_VariantSpecializesAndReferenceSurprisingBehavior.testenv", layer: "VariantSpecializesAndReferenceSurprisingBehavior/root.usda", baseline: "compositionResults_VariantSpecializesAndReferenceSurprisingBehavior.txt" },
] as const

describe('testPcpCompositionResults registered museum baselines', () => {
  for (const testCase of CASES) {
    it(`${testCase.program}: byte-identical composition result`, async () => {
      const testenvName = 'testenvSuffix' in testCase
        ? `testPcpMuseum_${testCase.testenvSuffix}.testenv`
        : testCase.testenv
      const testenv = path.join(FIXTURES, testenvName)
      const options: CompositionResultsOptions = {
        layerPath: path.join(testenv, testCase.layer),
        layerLabel: testCase.layer,
        errorFile: 'errorBaseline' in testCase,
        consistencyChecks: true,
        overrideInstanceable:
          'overrideInstanceable' in testCase &&
          testCase.overrideInstanceable === true,
      }
      if ('session' in testCase && typeof testCase.session === 'string') {
        options.sessionPath = path.join(testenv, testCase.session)
        options.sessionLabel = testCase.session
      }
      if ('payloadsSource' in testCase &&
          typeof testCase.payloadsSource === 'string') {
        options.payloads = new RegExp(testCase.payloadsSource)
      }
      if ('variantFallbacksSource' in testCase &&
          typeof testCase.variantFallbacksSource === 'string') {
        options.variantFallbacks =
          Function(`"use strict"; return (${testCase.variantFallbacksSource})`)() as
            Record<string, readonly string[]>
      }
      if ('dumpPath' in testCase && typeof testCase.dumpPath === 'string') {
        options.dumpPath = testCase.dumpPath
      }
      if ('dumpMaps' in testCase && testCase.dumpMaps === true) {
        options.dumpMaps = true
      }
      const rootLayer = museumInvalidOpinionRoot(testCase.program, options.layerPath)
      if (rootLayer) options.rootLayer = rootLayer
      const result = await testPcpCompositionResults(options)
      expect(result.stdout).toBe(readFileSync(
        path.join(testenv, 'baseline', testCase.baseline), 'utf8'))
      if ('errorBaseline' in testCase) {
        expect(result.errorFile).toBe(readFileSync(
          path.join(testenv, 'baseline', testCase.errorBaseline), 'utf8'))
      }
      expect(result.stderr).toBe('')
    })
  }
})
