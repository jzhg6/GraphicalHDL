export function parseUnsignedLiteral(value: string): bigint {
  if (!/^(0|[1-9][0-9]*|0[xX][0-9a-fA-F]+)$/.test(value)) {
    throw new Error(`非法无符号 literal: ${value}`);
  }
  return BigInt(value);
}

export function literalFitsWidth(value: string, width: number): boolean {
  const parsed = parseUnsignedLiteral(value);
  return parsed >= 0n && parsed < 1n << BigInt(width);
}

export function canonicalLiteral(value: string): string {
  return parseUnsignedLiteral(value).toString(10);
}
