// Ported from MaterialX 1.39.5: source/MaterialXGenHw/HwLightShaders.h
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenHw/HwLightShaders.h

import { GenUserData, ShaderNode } from '@mtlx/genshader'

// Hardware light shader user data.
export class HwLightShaders extends GenUserData {
  protected _shaders = new Map<number, ShaderNode>()

  // Create and return a new instance.
  static create(): HwLightShaders {
    return new HwLightShaders()
  }

  // Bind a light shader to a light type id.
  bind(type: number, shader: ShaderNode): void {
    this._shaders.set(type, shader)
  }

  // Unbind a light shader previously bound to a light type id.
  unbind(type: number): void {
    this._shaders.delete(type)
  }

  // Clear all light shaders previously bound.
  clear(): void {
    this._shaders.clear()
  }

  // Return the light shader bound to the given light type, or null.
  get(type: number): ShaderNode | null {
    return this._shaders.get(type) ?? null
  }

  // Return the map of bound light shaders.
  getAll(): Map<number, ShaderNode> {
    return this._shaders
  }
}
