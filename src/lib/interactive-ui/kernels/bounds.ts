export function boundedNumber(value: number, name: string, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be finite and between ${min} and ${max}`)
  }
  return value
}

export function boundedInteger(value: number, name: string, min: number, max: number): number {
  boundedNumber(value, name, min, max)
  if (!Number.isInteger(value)) throw new RangeError(`${name} must be an integer`)
  return value
}
