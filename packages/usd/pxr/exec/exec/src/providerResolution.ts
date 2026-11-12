// Ported from OpenUSD 26.11.1: pxr/exec/exec/providerResolution.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/providerResolution.h.

import type { SdfPath } from 'typescript-usd/sdf/path'

/**
 * Data used to find computation providers during exec compilation
 * (providerResolution.h:16-64).
 *
 * The provider resolution process starts from the **origin object**, the
 * scene object that owns the consuming computation, and searches to find
 * **computation providers**, the scene objects that own the computations
 * that are evaluated to yield input values.
 */
export interface ExecProviderResolution {
  /**
   * A path that describes the first part of provider resolution.
   *
   * This path is relative to the origin object.
   */
  localTraversal: SdfPath

  /**
   * An enum value that indicates the type of dynamic traversal used during
   * provider resolution.
   */
  dynamicTraversal: ExecProviderResolution.DynamicTraversal
}

export namespace ExecProviderResolution {
  /**
   * An enum that indicates the part of provider resolution that is
   * implemented by exec compilation logic (providerResolution.h:34-56).
   */
  export enum DynamicTraversal {
    /** The localTraversal path directly indicates the computation provider. */
    Local,
    /**
     * Find providers by traversing relationship targets, applying any
     * relationship forwarding, to the targeted objects.
     */
    RelationshipTargetedObjects,
    /**
     * Find providers by traversing attribute connections to the objects
     * they target.
     */
    ConnectionTargetedObjects,
    /**
     * Find providers by traversing incoming attribute connections to the
     * attributes that own them.
     */
    IncomingConnectionOwningAttributes,
    /** Find the provider by traversing upward in namespace */
    NamespaceAncestor,
  }
}
