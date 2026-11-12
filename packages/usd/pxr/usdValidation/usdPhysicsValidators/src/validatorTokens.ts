// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdPhysicsValidators/validatorTokens.cpp,
//  pxr/usdValidation/usdPhysicsValidators/validatorTokens.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdPhysicsValidators/validatorTokens.{h,cpp}.

/** validatorTokens.h:19-23 (USD_PHYSICS_VALIDATOR_NAME_TOKENS). */
export const UsdPhysicsValidatorNameTokens = Object.freeze({
  rigidBodyChecker: 'usdPhysicsValidators:RigidBodyChecker',
  colliderChecker: 'usdPhysicsValidators:ColliderChecker',
  physicsJointChecker: 'usdPhysicsValidators:PhysicsJointChecker',
  articulationChecker: 'usdPhysicsValidators:ArticulationChecker',
})

/** validatorTokens.h:25 (USD_PHYSICS_VALIDATOR_KEYWORD_TOKENS). */
export const UsdPhysicsValidatorKeywordTokens = Object.freeze({
  UsdPhysicsValidators: 'UsdPhysicsValidators',
})

/** validatorTokens.h:27-42 (USD_PHYSICS_VALIDATION_ERROR_NAME_TOKENS). */
export const UsdPhysicsValidationErrorNameTokens = Object.freeze({
  nestedArticulation: 'NestedArticulation',
  articulationOnStaticBody: 'ArticulationOnStaticBody',
  rigidBodyOrientationScale: 'RigidBodyOrientationScale',
  rigidBodyNonXformable: 'RigidBodyNonXformable',
  rigidBodyNonInstanceable: 'RigidBodyNonInstanceable',
  jointInvalidPrimRel: 'JointInvalidPrimRel',
  jointRelNotXformable: 'JointRelNotXformable',
  jointNoEnabledRigidBody: 'JointNoEnabledRigidBody',
  jointMultiplePrimsRel: 'JointMultiplePrimsRel',
  colliderNonUniformScale: 'ColliderNonUniformScale',
  colliderPlaneDynamic: 'ColliderPlaneDynamic',
  colliderSpherePointsDataMissing: 'ColliderSpherePointsDataMissing',
  massInvalidValues: 'MassInvalidValues',
  densityInvalidValues: 'DensityInvalidValues',
  inertiaInvalidValues: 'InertiaInvalidValues',
})
