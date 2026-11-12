// Ported from OpenUSD 26.11.1: pxr/base/gf/duration.cpp,
//  pxr/base/gf/duration.h, pxr/base/gf/wrapDuration.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 gf/duration.h:22-145, duration.cpp:18-31 and
// wrapDuration.cpp:22-110. Relative time-code values scale without offsets.
import {Type as TfType} from 'typescript-usd/tf'
TfType.define('GfDuration')
export class GfDuration {
  readonly #value:number
  constructor(value:number|GfDuration=0){this.#value=value instanceof GfDuration?value.#value:value}
  GetValue():number{return this.#value}
  valueOf():number{return this.#value}
  equals(rhs:number|GfDuration):boolean{return this.#value===Number(rhs)}
  compare(rhs:number|GfDuration):number{return this.#value<Number(rhs)?-1:this.#value>Number(rhs)?1:0}
  add(rhs:number|GfDuration):GfDuration{return new GfDuration(this.#value+Number(rhs))}
  subtract(rhs:number|GfDuration):GfDuration{return new GfDuration(this.#value-Number(rhs))}
  multiply(rhs:number):GfDuration{return new GfDuration(this.#value*rhs)}
  divide(rhs:GfDuration):number
  divide(rhs:number):GfDuration
  divide(rhs:number|GfDuration):number|GfDuration{return rhs instanceof GfDuration?this.#value/rhs.#value:new GfDuration(this.#value/rhs)}
  getNegated():GfDuration{return new GfDuration(-this.#value)}
  // duration.cpp streams the double with std::ostream's default precision6.
  toString():string{
    const value=this.#value
    if(Number.isNaN(value))return 'nan'
    if(!Number.isFinite(value))return value<0?'-inf':'inf'
    if(value===0)return Object.is(value,-0)?'-0':'0'
    // Round the exact IEEE double to six significant decimal digits, ties
    // to even. JavaScript toPrecision uses a different decimal halfway rule.
    const view=new DataView(new ArrayBuffer(8));view.setFloat64(0,Math.abs(value))
    const bits=view.getBigUint64(0),encoded=Number((bits>>52n)&0x7ffn)
    const mantissa=(bits&((1n<<52n)-1n))+(encoded?1n<<52n:0n)
    const binaryExponent=encoded?encoded-1023-52:-1074
    let numerator=mantissa,denominator=1n
    if(binaryExponent>=0)numerator<<=BigInt(binaryExponent);else denominator<<=BigInt(-binaryExponent)
    let exponent=Number(Math.abs(value).toExponential().split('e')[1])
    const scale=5-exponent
    if(scale>=0)numerator*=10n**BigInt(scale);else denominator*=10n**BigInt(-scale)
    let digits=numerator/denominator
    const remainder=(numerator%denominator)*2n
    if(remainder>denominator||remainder===denominator&&digits%2n===1n)digits++
    if(digits===1000000n){digits/=10n;exponent++}
    const significant=String(digits).replace(/0+$/,'')
    const sign=value<0?'-':''
    if(exponent>=6||exponent<-4){
      const fraction=significant.slice(1)
      return sign+significant[0]+(fraction?'.'+fraction:'')+'e'+(exponent<0?'-':'+')+String(Math.abs(exponent)).padStart(2,'0')
    }
    const point=exponent+1
    return sign+(point<=0?'0.'+'0'.repeat(-point)+significant:point>=significant.length?significant+'0'.repeat(point-significant.length):significant.slice(0,point)+'.'+significant.slice(point))
  }
  repr():string{return `Gf.Duration(${this.toString()})`}
}
