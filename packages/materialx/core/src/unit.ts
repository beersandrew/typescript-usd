// Ported from MaterialX 1.39.5: source/MaterialXCore/Unit.h,
//  source/MaterialXCore/Unit.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXCore/Unit.h and Unit.cpp

import { ExceptionTypeError } from './exceptions.ts'
import { TypedValue } from './value.ts'
import { ValueElement } from './element.ts'
import { Node } from './node.ts'
import { UnitDef, UnitTypeDef } from './definition.ts'
import { Vector2, Vector3, Vector4, VectorBase } from './types.ts'
import { EMPTY_STRING } from './util.ts'
import type { Document } from './document.ts'

const SCALE_ATTRIBUTE = 'scale'

// A value that a unit converter can convert: a float or a vector.
export type UnitConvertible = number | Vector2 | Vector3 | Vector4

// An abstract base class for unit converters. Each unit converter instance
// is responsible for a single unit type.
export abstract class UnitConverter {
  // Convert a given value in a given unit to a desired unit.
  abstract convert<T extends UnitConvertible>(input: T, inputUnit: string, outputUnit: string): T

  // Given a unit name return a value that it can map to as an integer, or
  // -1 if not found.
  getUnitAsInteger(_unitName: string): number {
    return -1
  }

  // Given an integer index return the unit name in the map used by the
  // converter, or the empty string if not found.
  getUnitFromInteger(_index: number): string {
    return EMPTY_STRING
  }

  // Create unit definitions in a document based on the converter.
  abstract write(doc: Document): void
}

// A converter class for linear units that require only a scalar
// multiplication.
export class LinearUnitConverter extends UnitConverter {
  private _unitScale = new Map<string, number>()
  private _unitEnumeration = new Map<string, number>()
  private _unitType = ''

  private constructor(unitTypeDef: UnitTypeDef | null) {
    super()
    if (!unitTypeDef) return

    // Populate the unit scale and enumeration maps for each UnitDef.
    let enumerant = 0
    for (const unitdef of unitTypeDef.getUnitDefs()) {
      for (const unit of unitdef.getUnits()) {
        const name = unit.getName()
        if (name !== '') {
          const scaleString = unit.getAttribute(SCALE_ATTRIBUTE)
          // Unit math mirrors the C++ float (single-precision) arithmetic so
          // conversions round-trip identically to upstream.
          this._unitScale.set(name, Math.fround(scaleString !== '' ? parseFloat(scaleString) : 1.0))
          this._unitEnumeration.set(name, enumerant++)
        }
      }
    }

    this._unitType = unitTypeDef.getName()
  }

  static create(unitTypeDef: UnitTypeDef | null): LinearUnitConverter {
    return new LinearUnitConverter(unitTypeDef)
  }

  // Return the unit type string.
  getUnitType(): string {
    return this._unitType
  }

  // Create unit definitions in a document based on the converter.
  override write(doc: Document): void {
    if (!doc.getUnitTypeDef(this._unitType)) {
      // Add a unittypedef.
      doc.addUnitTypeDef(this._unitType)

      // Add a unitdef definition.
      const unitdefName = 'UD_stdlib_' + this._unitType
      if (!doc.getUnitDef(unitdefName)) {
        const unitDef = doc.addUnitDef(unitdefName)
        unitDef.setUnitType(this._unitType)

        // Add in units to the definition.
        for (const [unitName, scale] of this._unitScale) {
          const unit = unitDef.addUnit(unitName)
          unit.setAttribute(SCALE_ATTRIBUTE, String(scale))
        }
      }
    }
  }

  // Return the mappings from unit names to the scale value defined by a
  // linear converter.
  getUnitScale(): Map<string, number> {
    return this._unitScale
  }

  // Ratio between the given unit and a desired unit.
  conversionRatio(inputUnit: string, outputUnit: string): number {
    const fromScale = this._unitScale.get(inputUnit)
    if (fromScale === undefined) {
      throw new ExceptionTypeError('Unrecognized source unit: ' + inputUnit)
    }
    const toScale = this._unitScale.get(outputUnit)
    if (toScale === undefined) {
      throw new ExceptionTypeError('Unrecognized destination unit: ' + outputUnit)
    }
    return Math.fround(fromScale / toScale)
  }

  // Convert a given value in a given unit to a desired unit, with each
  // operation rounded to single precision as in the C++ implementation.
  override convert<T extends UnitConvertible>(input: T, inputUnit: string, outputUnit: string): T {
    if (inputUnit === outputUnit) {
      return input
    }
    const ratio = this.conversionRatio(inputUnit, outputUnit)
    if (typeof input === 'number') {
      return Math.fround(Math.fround(input) * ratio) as T
    }
    const res = (input as VectorBase).copy()
    for (let i = 0; i < res.numElements(); i++) {
      res.setItem(i, Math.fround(Math.fround(res.getItem(i)) * ratio))
    }
    return res as T
  }

  // Given a unit name return a value that it can map to as an integer, or
  // -1 if not found.
  override getUnitAsInteger(unitName: string): number {
    return this._unitEnumeration.get(unitName) ?? -1
  }

  // Given an integer index return the unit name in the map used by the
  // converter, or the empty string if not found.
  override getUnitFromInteger(index: number): string {
    for (const [name, value] of this._unitEnumeration) {
      if (value === index) return name
    }
    return EMPTY_STRING
  }
}

// A registry for unit converters.
export class UnitConverterRegistry {
  private static _instance: UnitConverterRegistry | null = null

  private _unitConverters = new Map<string, UnitConverter>()

  private constructor() {}

  // Return the singleton registry (mirrors the C++ static instance).
  static create(): UnitConverterRegistry {
    if (!UnitConverterRegistry._instance) {
      UnitConverterRegistry._instance = new UnitConverterRegistry()
    }
    return UnitConverterRegistry._instance
  }

  // Add a unit converter for a given UnitTypeDef. Returns false if a
  // converter has already been registered for it.
  addUnitConverter(def: UnitTypeDef | null, converter: UnitConverter): boolean {
    if (def && !this._unitConverters.has(def.getName())) {
      this._unitConverters.set(def.getName(), converter)
      return true
    }
    return false
  }

  // Remove the unit converter for a given UnitTypeDef. Returns false if no
  // converter exists for it.
  removeUnitConverter(def: UnitTypeDef | null): boolean {
    if (def && this._unitConverters.has(def.getName())) {
      this._unitConverters.delete(def.getName())
      return true
    }
    return false
  }

  // Get the unit converter for a given UnitTypeDef, or null.
  getUnitConverter(def: UnitTypeDef | null): UnitConverter | null {
    if (def) {
      return this._unitConverters.get(def.getName()) ?? null
    }
    return null
  }

  // Clear all unit converters from the registry.
  clearUnitConverters(): void {
    this._unitConverters.clear()
  }

  // Given a unit name return a value that it can map to as an integer, or
  // -1 if not found.
  getUnitAsInteger(unitName: string): number {
    for (const converter of this._unitConverters.values()) {
      const value = converter.getUnitAsInteger(unitName)
      if (value >= 0) return value
    }
    return -1
  }

  // Create unit definitions in a document based on registered converters.
  write(doc: Document): void {
    for (const converter of this._unitConverters.values()) {
      converter.write(doc)
    }
  }

  // Convert input values which have a source unit to a given target unit.
  // Returns true if any unit conversion occurred.
  convertToUnit(doc: Document, unitType: string, targetUnit: string): boolean {
    const unitTypeDef = doc.getUnitTypeDef(unitType)
    const unitConverter = this.getUnitConverter(unitTypeDef)

    if (!unitTypeDef || !unitConverter) {
      return false
    }

    const convertibleTypes = new Set(['float', 'vector2', 'vector3', 'vector4'])

    let convertedUnits = false
    for (const elem of doc.traverseTree()) {
      const node = elem.asA(Node)
      if (!node || node.getInputCount() === 0) {
        continue
      }
      for (const input of node.getInputs()) {
        const type = input.getType()
        const value = input.getValue()
        if (value instanceof TypedValue && input.hasUnit() && input.getUnitType() === unitType && convertibleTypes.has(type)) {
          const original = value.getData() as UnitConvertible
          const converted = unitConverter.convert(original, input.getUnit(), targetUnit)
          input.setValue(converted, type)
          input.removeAttribute(ValueElement.UNIT_ATTRIBUTE)
          input.removeAttribute(ValueElement.UNITTYPE_ATTRIBUTE)
          convertedUnits = true
        }
      }
    }
    return convertedUnits
  }
}
