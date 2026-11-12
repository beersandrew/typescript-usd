// Ported from OpenUSD 26.11.1: pxr/exec/execIr/controllerBuilder.cpp,
//  pxr/exec/execIr/controllerBuilder.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execIr/controllerBuilder.h and
// controllerBuilder.cpp.
//
// Registration utilities for defining invertible controller computations,
// which are the basis for invertible rigging (controllerBuilder.h:10-20).
//
// Mapping choices (docs/openexec-x1.md 4.1):
// - The member templates' ValueType is a leading TfType argument
//   (`InvertibleInputAttribute<double>(name)` ->
//   `InvertibleInputAttribute(VtValueTypes.double, name)`).
// - ExecIrControllerBuilder's destructor, which registers the inverse
//   computation callback and then (as its members are destroyed) the forward
//   and inverse computations, is Destroy(). An
//   EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA body calls it where the C++ local
//   goes out of scope, at the end of the body. The two member builders are
//   released from `self`'s full-expression tracking
//   (ExecComputationBuilder._Release) so that they live until then, as the
//   C++ members do.
// - `VtValue::Get<ValueType>()` on an ExecIrResult entry is _VtValueGet,
//   which checks the held type as upstream does.

import { TF_CODING_ERROR, TF_RUNTIME_ERROR, type Type as TfType } from 'typescript-usd/tf'
import type { Value as VtValue } from 'typescript-usd/vt'
import { VdfExecutionTypeRegistry, VdfReadIteratorRange, type VdfContext } from 'typescript-usd/vdf'
import {
  Attribute,
  AttributeValue,
  Computation,
  ExecBuiltinComputations,
  IncomingConnections,
  Prim,
  type ExecComputationBuilder,
  type ExecPrimComputationBuilder,
} from 'typescript-usd/exec'

import { ExecIrComputations } from './computations.ts'
import { ExecIrResultType, type ExecIrResult } from './types.ts'

/**
 * VtValue::Get<T> (pxr/base/vt/value.h, VtValue::_FailGet at
 * pxr/base/vt/value.cpp:557-569): returns the held value if `value` holds
 * `type`; otherwise posts upstream's coding error.
 *
 * FAITHFULNESS-DEBT(openexec-vt-failget): after the coding error upstream
 * returns a value-initialized T (Vt_DefaultValueFactory); typescript-usd/vt
 * has no default-value factory, so this throws instead -> VtValue::Get's
 * default-value fallback in typescript-usd/vt.
 */
export function _VtValueGet<T>(value: VtValue, type: TfType): T {
  if (value.IsHolding(type)) {
    return value.UncheckedGet<T>()
  }
  if (value.IsEmpty()) {
    TF_CODING_ERROR(`Attempted to get value of type '${type.getTypeName()}' from ` +
      'empty VtValue.')
  } else {
    TF_CODING_ERROR(`Attempted to get value of type '${type.getTypeName()}' from ` +
      `VtValue holding '${value.getType().getTypeName()}'`)
  }
  throw new Error('VtValue::Get default-value fallback is not ported ' +
    '(pxr/base/vt/value.cpp:557-569)')
}

/**
 * Builder base class used to share common code (controllerBuilder.h:36-79).
 */
export class ExecIr_ControllerBuilderBase {
  protected readonly _self: ExecComputationBuilder

  /** controllerBuilder.cpp:15-19. Protected upstream. */
  protected constructor(self: ExecComputationBuilder) {
    this._self = self
  }

  /**
   * Registers the 'explicitDesiredValue' and 'computedDesiredValue'
   * computations that are required to compute desired values, including
   * desired values that are expressed as overrides
   * (controllerBuilder.h:49-59, 459-489).
   *
   * TODO (upstream): These plugin computations won't be necessary when
   * OpenExec provides core inversion support.
   */
  protected _desiredValueComputations(valueType: TfType, attributeName: string): void {
    // The 'explicitDesiredValue' computation only exists to provide an output
    // where desired values can be specified as overrides passed to
    // ComputeWithOverrides.
    this._self.attributeComputation(
      attributeName, ExecIrComputations.explicitDesiredValue)
      .Callback<unknown>(valueType, (ctx: VdfContext) => {
        ctx.setEmptyOutput()
      })

    // The 'computeDesiredValue' computation gets its value from the
    // 'explicitDesiredValue' computation if it provides one, or from the
    // 'computeDesiredValue' computation via incoming connections--but only if
    // there is exactly one desired value present on these inputs. Otherwise, no
    // value is returned. An error is emitted if more than one desired value is
    // present.
    this._self.attributeComputation(
      attributeName, ExecIrComputations.computeDesiredValue)
      .Callback<unknown>(valueType, (ctx: VdfContext) =>
        ExecIr_ControllerBuilderBase._getExactlyOneDesiredValue(valueType, ctx))
      .inputs(
        Computation(valueType,
          ExecIrComputations.explicitDesiredValue),
        IncomingConnections(valueType,
          ExecIrComputations.computeDesiredValue))
  }

  /**
   * Sets the computation output to the value from the 'explicitDesiredValue'
   * input if it provides one; otherwise sets the output to the the
   * 'computeDesiredValue' input, if it has one; otherwise sets an empty
   * output value (controllerBuilder.h:61-75, 491-525).
   *
   * If, among all considered inputs, more than one input value is provided,
   * an error is emitted.
   */
  protected static _getExactlyOneDesiredValue(valueType: TfType, ctx: VdfContext): void {
    const inputValue = ((): unknown => {
      let foundInputValue: unknown =
        ctx.getInputValuePtr<unknown>(valueType,
          ExecIrComputations.explicitDesiredValue)

      for (const value of
        new VdfReadIteratorRange<unknown>(
          valueType, ctx, ExecIrComputations.computeDesiredValue)) {
        if (foundInputValue === null) {
          foundInputValue = value
        } else {
          // TODO (upstream): We will introduce an ExecValidationErrorType
          // enum to specifically identifiy this error condition.
          TF_RUNTIME_ERROR(
            `Found more than one desired value for node ${ctx.getNodeDebugName()}`)
          return null
        }
      }

      return foundInputValue
    })()

    if (inputValue !== null) {
      ctx.setOutput(inputValue)
    } else {
      ctx.setEmptyOutput()
    }
  }
}

// These computations are registered by the controller builder, but they
// are not meant to be consumed by code outside the controller builder
// (controllerBuilder.h:266-278, controllerBuilder.cpp:68-76).
class _PrivateComputationsType {
  readonly computeInvertedForwardValue: string
  readonly forwardCompute: string
  readonly inverseCompute: string

  constructor() {
    this.computeInvertedForwardValue = 'computeInvertedForwardValue'
    this.forwardCompute = 'forwardCompute'
    this.inverseCompute = 'inverseCompute'
  }
}

const _privateComputations: _PrivateComputationsType =
  Object.freeze(new _PrivateComputationsType())

/**
 * Builder class used to register invertible controller computations
 * (controllerBuilder.h:81-284).
 *
 * This class can only be used in the context of schema computation
 * registration. The constructor takes the `self` builder object that is
 * defined by `EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA`, and the callbacks that
 * implement the forward and inverse computations for the controller. The
 * client uses member functions to register controller attributes as inputs,
 * outputs, switches, etc. These registrations, in turn, generate the
 * computation inputs for the callbacks, as well as other computations that
 * are required to implement invertible controllers within OpenExec.
 *
 * The client calls Destroy() at the end of the registration block, where
 * the C++ builder object goes out of scope.
 */
export class ExecIrControllerBuilder extends ExecIr_ControllerBuilderBase {
  private readonly _forwardComputeReg: ExecPrimComputationBuilder
  private readonly _inverseComputeReg: ExecPrimComputationBuilder
  private _invertibleOutputAttributeNames: string[] = []
  private readonly _inverseCallback: ExecIrControllerBuilder.Callback
  private _destroyed = false

  /**
   * Constructs a builder that is used to register computations that
   * implement an invertible controller (controllerBuilder.h:165-178,
   * controllerBuilder.cpp:25-37).
   */
  constructor(
    self: ExecComputationBuilder,
    forwardCallback: ExecIrControllerBuilder.Callback,
    inverseCallback: ExecIrControllerBuilder.Callback,
  ) {
    super(self)
    this._forwardComputeReg = self._release(
      self.primComputation(_privateComputations.forwardCompute))
    this._inverseComputeReg = self._release(
      self.primComputation(_privateComputations.inverseCompute))
    this._inverseCallback = inverseCallback

    this._forwardComputeReg.Callback<ExecIrResult>(ExecIrResultType, forwardCallback)
  }

  /**
   * ~ExecIrControllerBuilder (controllerBuilder.cpp:39-66), then the
   * destructors of the members _inverseComputeReg and _forwardComputeReg,
   * which register the controller's inverse and forward computations.
   */
  destroy(): void {
    if (this._destroyed) {
      return
    }
    this._destroyed = true

    // Wrap the inverse callback in a lambda that checks if we have input values
    // for all invertible output attributes and returns an empty ExecIrResult if
    // any are missing.
    //
    // TODO (upstream): The Presto implementation calls the inverseCallback if
    // we have input values for *any* invertible output attributes, instead of
    // only doing so if we have values for *all* of them. We may ultimately
    // want to change this code to follow that precedent, but for now we are
    // sticking with this implementation because it means client callbacks
    // don't need to test if values are available.
    const inverseCallback = this._inverseCallback
    const invertibleOutputAttributeNames = this._invertibleOutputAttributeNames
    this._invertibleOutputAttributeNames = []
    this._inverseComputeReg.Callback<ExecIrResult>(ExecIrResultType,
      (ctx: VdfContext): void => {
        for (const name of invertibleOutputAttributeNames) {
          if (!ctx.hasInputValue(name)) {
            ctx.setOutput(new Map() satisfies ExecIrResult)
            return
          }
        }

        ctx.setOutput(inverseCallback(ctx))
      })

    // Members are destroyed in the reverse order of their declaration
    // (controllerBuilder.h:280-283).
    this._inverseComputeReg._destroy()
    this._forwardComputeReg._destroy()
  }

  /**
   * Registers an invertible input attribute (controllerBuilder.h:183-191,
   * 286-356).
   *
   * - Invertible input attributes provide input to the forward computation.
   * - Invertible input values are produced by the inverse computation.
   */
  invertibleInputAttribute(valueType: TfType, attributeName: string): void {
    // Invertible input attributes define 'computeDesiredValue' computations
    // that extract their values from the inverse computation.
    //
    // TODO (upstream): When we have core inversion support, this plugin
    // computation will be registered using a builtin computation token that
    // the core will provide, as a plugin point for plugins that provide
    // inversion behavior.
    this._self.attributeComputation(
      attributeName, ExecIrComputations.computeDesiredValue)
      .Callback<unknown>(valueType, (ctx: VdfContext) => {
        const resultMap = ctx.getInputValue<ExecIrResult>(ExecIrResultType,
          _privateComputations.inverseCompute)

        // If the inverse computation computed a value for this attribute,
        // return it; otherwise, set an empty result.
        const it = resultMap.get(attributeName)
        if (it !== undefined) {
          ctx.setOutput(_VtValueGet<unknown>(it, valueType))
        } else {
          ctx.setEmptyOutput()
        }
      })
      .inputs(
        Prim().Computation(ExecIrResultType,
          _privateComputations.inverseCompute))

    // Invertible input attributes define 'computeInvertedForwardValue'
    // computations that get their values from the inverse computation, but
    // only if they are evaluated in a context where the inverse is being
    // computed (i.e., when the inverse directly or transitively receives
    // desired value overrides). Otherwise, this computation falls back to the
    // computed value of the input attribute.
    //
    // This allows for correct computation of inverses for "non-spanning"
    // controllers. I.e., this is important in cases where controller inverses
    // can't always satisfy all desired output values, and when one controller
    // is dependent on another. In such situations, computing "inverted forward
    // values" allows for controller networks to produce "best try" solutions.
    this._self.attributeComputation(
      attributeName, _privateComputations.computeInvertedForwardValue)
      .Callback<unknown>(valueType, (ctx: VdfContext): unknown => {
        // If we have a computed desired value, that takes precedence.
        const desiredValue =
          ctx.getInputValuePtr<unknown>(valueType,
            ExecIrComputations.computeDesiredValue)
        if (desiredValue !== null) {
          return desiredValue
        }

        // Otherwise, return the attribute's computed value.
        return ctx.getInputValue<unknown>(valueType,
          ExecBuiltinComputations.computeValue)
      })
      .inputs(
        Computation(valueType, ExecIrComputations.computeDesiredValue),
        Computation(valueType, ExecBuiltinComputations.computeValue))

    // Invertible input attributes provide inputs to the forward computation via
    // the 'computeInvertedForwardValue' computation.
    this._forwardComputeReg.inputs(
      Attribute(attributeName)
        .Computation(valueType,
          _privateComputations.computeInvertedForwardValue)
        .inputName(attributeName))
  }

  /**
   * Registers a non-invertible input attribute (controllerBuilder.h:193-202,
   * 358-371).
   *
   * - All input attributes provide input to the forward computation.
   * - Non-invertible input attributes also provide input to the inverse
   *   computation.
   */
  nonInvertibleInputAttribute(valueType: TfType, attributeName: string): void {
    // All input attributes (invertible or not) are inputs to the forward
    // computation.
    this._forwardComputeReg.inputs(AttributeValue(valueType, attributeName))

    // Non-invertible input attributes are inputs to the inverse computation.
    this._inverseComputeReg.inputs(AttributeValue(valueType, attributeName))
  }

  /** Registers multiple invertible input attributes
   *  (controllerBuilder.h:204-213). */
  invertibleInputAttributes(valueType: TfType, attributeNames: readonly string[]): void {
    for (const attributeName of attributeNames) {
      this.invertibleInputAttribute(valueType, attributeName)
    }
  }

  /**
   * Registers an invertible output attribute (controllerBuilder.h:215-225,
   * 373-419).
   *
   * - Output attributes produce computed values that are the results of the
   *   forward computation and provide input to the inverse computation.
   *
   * TODO (upstream): Non-invertible output attributes are not yet
   * implemented.
   */
  invertibleOutputAttribute(valueType: TfType, attributeName: string): void {
    this._invertibleOutputAttributeNames.push(attributeName)

    // Invertible outputs support computing desired values, for inversion.
    this._desiredValueComputations(valueType, attributeName)

    // Invertible outputs provide inputs to the inverse computation, getting
    // their values from the attribute's 'computeDesiredValue' computation.
    this._inverseComputeReg.inputs(
      Attribute(attributeName)
        .Computation(valueType,
          ExecIrComputations.computeDesiredValue)
        .inputName(attributeName))

    // Register an expression on the invertible output that pulls its value
    // from the forward computation result map.
    this._self.attributeExpression(attributeName)
      .Callback<unknown>(valueType, (ctx: VdfContext) => {
        const resultMap =
          ctx.getInputValue<ExecIrResult>(ExecIrResultType,
            _privateComputations.forwardCompute)
        const it = resultMap.get(attributeName)
        if (it !== undefined) {
          ctx.setOutput(_VtValueGet<unknown>(it, valueType))
        } else {
          TF_CODING_ERROR(
            `Failed to find a result value for output attribute '${attributeName}' ` +
            `when computing ${ctx.getNodeDebugName()}`)

          ctx.setOutput(
            VdfExecutionTypeRegistry.GetInstance()
              .getFallback<unknown>(valueType))
        }
      })
      .inputs(
        Prim().Computation(ExecIrResultType,
          _privateComputations.forwardCompute))
  }

  /** Registers multiple invertible output attributes
   *  (controllerBuilder.h:227-236). */
  invertibleOutputAttributes(valueType: TfType, attributeNames: readonly string[]): void {
    for (const attributeName of attributeNames) {
      this.invertibleOutputAttribute(valueType, attributeName)
    }
  }

  /**
   * Registers a switch attribute (controllerBuilder.h:238-249, 421-435).
   *
   * Switch attributes hold values that change the behavior of the forward
   * and inverse computations.
   *
   * - Switch attributes provide input to both the forward and the inverse
   *   computation.
   */
  switchAttribute(valueType: TfType, attributeName: string): void {
    // TODO (upstream): We will have work to do here that is specific to
    // switch attributes when we implement more invertible rigging features.
    // E.g., switch attributes play a key role in determining which
    // controllers contribute to the current pose, and determining
    // contributing controllers is critical for supporing advanced authoring
    // behaviors for invertible rigs.

    // Switch attributes have all the exec registrations that non-invertible
    // attributes have.
    this.nonInvertibleInputAttribute(valueType, attributeName)
  }

  /**
   * Registers a pair of input, output passthrough attributes
   * (controllerBuilder.h:251-262, 437-457).
   *
   * - The passthrough input attribute provides input to both the forward and
   *   inverse computations.
   * - The passthrough output attribute produces the value of the input
   *   attribute.
   */
  passthroughAttributes(
    valueType: TfType,
    inAttributeName: string,
    outAttributeName: string,
  ): void {
    // Passthrough attributes are inputs to the forward and inverse
    // computations.
    this._forwardComputeReg.inputs(AttributeValue(valueType, inAttributeName))
    this._inverseComputeReg.inputs(AttributeValue(valueType, inAttributeName))

    // Passthrough attributes pass the value from the input attribute to the
    // output attribute.
    this._self.attributeExpression(outAttributeName)
      .inputs(Prim().AttributeValue(valueType, inAttributeName))
      .Callback<unknown>(valueType, (ctx: VdfContext) => {
        ctx.setOutputToReferenceInput(inAttributeName)
      })
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace ExecIrControllerBuilder {
  /** The type for forward and inverse controller computation callbacks
   *  (controllerBuilder.h:162-163). */
  type Callback = (ctx: VdfContext) => ExecIrResult
}
