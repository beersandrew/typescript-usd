// Ported from OpenUSD 26.11.1: pxr/usd/usd/prim.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Surface Prim: one call per member into the core's prim handle
// (pxr/usd/usd/src/prim.ts Prim; OpenUSD pxr/usd/usd/prim.h).
import type { Prim as CorePrim } from 'typescript-usd/usd'
import { Attribute } from './attribute.ts'
import { ensure, guard, guardAsync } from './error.ts'
import { Stage } from './stage.ts'

/**
 * A prim's specifier.
 *
 * @upstream SdfSpecifier
 */
export const Specifier = {
  /** @upstream SdfSpecifierDef */
  SdfSpecifierDef: 'def',
  /** @upstream SdfSpecifierOver */
  SdfSpecifierOver: 'over',
  /** @upstream SdfSpecifierClass */
  SdfSpecifierClass: 'class',
} as const

/**
 * A prim's specifier: `"def"`, `"over"` or `"class"`.
 *
 * @upstream SdfSpecifier
 */
export type Specifier = typeof Specifier[keyof typeof Specifier]

/**
 * Options for {@link Prim.createAttribute}.
 *
 * @upstream UsdPrim::CreateAttribute
 */
export interface CreateAttributeOptions {
  /**
   * Whether the attribute is custom (not declared by a schema); default true.
   *
   * @upstream UsdPrim::CreateAttribute(custom)
   */
  custom?: boolean
  /**
   * `"varying"` (default) or `"uniform"`.
   *
   * @upstream UsdPrim::CreateAttribute(variability)
   */
  variability?: 'varying' | 'uniform'
}

/**
 * A prim on a stage. Like upstream's UsdPrim, it is a handle: a new object
 * for each lookup, valid while the prim exists.
 *
 * @upstream UsdPrim
 */
export class Prim {
  readonly #core: CorePrim

  private constructor(core: CorePrim) {
    this.#core = core
  }

  /**
   * The surface prim for a core prim handle, or undefined for none.
   *
   * @upstream none
   */
  static fromCore(core: CorePrim | undefined): Prim | undefined {
    return core ? new Prim(core) : undefined
  }

  /**
   * The core prim this wraps, for APIs the surface does not cover yet.
   *
   * @upstream none
   */
  get core(): CorePrim {
    return this.#core
  }

  /**
   * The prim's path (`/World/Mesh`).
   *
   * @upstream UsdObject::GetPath
   */
  get path(): string {
    return this.#core.path
  }

  /**
   * The stage the prim is on.
   *
   * @upstream UsdObject::GetStage
   */
  get stage(): Stage {
    return Stage.fromCore(this.#core.getStage())
  }

  /**
   * The prim's schema type name (`Mesh`), or `""` for a typeless prim.
   *
   * @upstream UsdPrim::GetTypeName
   */
  get typeName(): string {
    return this.#core.typeName
  }

  /**
   * The prim's specifier.
   *
   * @upstream UsdPrim::GetSpecifier
   */
  get specifier(): Specifier {
    return this.#core.getSpecifier()
  }

  /**
   * Whether the prim is active.
   *
   * @upstream UsdPrim::IsActive
   */
  get isActive(): boolean {
    return this.#core.isActive
  }

  /**
   * Whether the prim and its ancestors are loaded (payloads).
   *
   * @upstream UsdPrim::IsLoaded
   */
  get isLoaded(): boolean {
    return this.#core.isLoaded
  }

  /**
   * Whether the prim and its ancestors have defining specifiers.
   *
   * @upstream UsdPrim::IsDefined
   */
  get isDefined(): boolean {
    return this.#core.isDefined
  }

  /**
   * The parent prim; undefined for the pseudo-root.
   *
   * @upstream UsdPrim::GetParent
   */
  get parent(): Prim | undefined {
    return Prim.fromCore(this.#core.getParent())
  }

  /**
   * The prim's children that pass the default predicate (active, loaded,
   * defined, not abstract), in order.
   *
   * @upstream UsdPrim::GetChildren
   */
  get children(): IterableIterator<Prim> {
    return this.#core.getChildren().map(child => new Prim(child))[Symbol.iterator]()
  }

  /**
   * Whether the prim's schema type is `schemaIdentifier` or derives from it
   * (`prim.isA("Gprim")`).
   *
   * @upstream UsdPrim::IsA
   */
  isA(schemaIdentifier: string): boolean {
    return this.#core.isA(schemaIdentifier)
  }

  /**
   * The attribute `name`, or undefined if the prim has none.
   *
   * @upstream UsdPrim::GetAttribute
   */
  attribute(name: string): Attribute | undefined {
    return Attribute.fromCore(this.#core.getAttr(name))
  }

  /**
   * Whether the prim has an attribute `name`.
   *
   * @upstream UsdPrim::HasAttribute
   */
  hasAttribute(name: string): boolean {
    return this.#core.hasAttribute(name)
  }

  /**
   * All the prim's attributes, authored or declared by its schemas.
   *
   * @upstream UsdPrim::GetAttributes
   */
  get attributes(): Attribute[] {
    return this.#core.getAttributes().flatMap(attribute => Attribute.fromCore(attribute) ?? [])
  }

  /**
   * Authors an attribute spec on the stage's edit target and returns it.
   *
   * @param typeName - A value type name (`"float3[]"`).
   * @throws UsdError when the attribute cannot be created.
   * @upstream UsdPrim::CreateAttribute
   */
  createAttribute(name: string, typeName: string, options: CreateAttributeOptions = {}): Attribute {
    const created = guard('Prim.createAttribute',
      () => this.#core.createAttribute(name, typeName, options.custom, options.variability))
    return ensure('Prim.createAttribute', Attribute.fromCore(created))
  }

  /**
   * Authors the prim's `active` metadata; recomposition finishes before the
   * promise resolves.
   *
   * @upstream UsdPrim::SetActive
   */
  async setActive(active: boolean): Promise<void> {
    await guardAsync('Prim.setActive', () => this.#core.setActive(active))
  }
}
