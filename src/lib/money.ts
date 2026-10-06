/**
 * Minor-unit money helpers. Every amount inside IntentShield is an integer
 * number of minor units (cents) from database to policy engine to PayPal
 * formatting. Floats never touch money. Limitation: 2-decimal currencies
 * assumed (USD, EUR); zero-decimal currencies (JPY) are out of MVP scope.
 */

export function formatMoney(minorUnits: number, currency: string): string {
  const value = (minorUnits / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${value}`;
}

/** PayPal Orders v2 expects decimal strings, e.g. "900.00". */
export function toPayPalAmount(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2);
}

/** Parse a decimal string/number (e.g. "899.99") into minor units. */
export function parseMoneyToMinor(input: string | number): number {
  const n = typeof input === "number" ? input : Number.parseFloat(input);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid monetary value: ${typeof input === "string" ? "not a parseable amount" : "out of range"}`);
  }
  return Math.round(n * 100);
}
