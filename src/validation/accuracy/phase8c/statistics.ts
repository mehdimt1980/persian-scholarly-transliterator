import type { ProportionMetric } from './types';

/** Wilson score interval, z=1.959963984540054 for a two-sided 95% interval. */
export function proportion(numerator: number, denominator: number): ProportionMetric {
  if (denominator === 0) return { numerator, denominator, percent: null, wilson95: null };
  const z = 1.959963984540054;
  const p = numerator / denominator;
  const z2 = z * z;
  const center = (p + z2 / (2 * denominator)) / (1 + z2 / denominator);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * denominator)) / denominator) / (1 + z2 / denominator);
  return { numerator, denominator, percent: p * 100, wilson95: { low: Math.max(0, center - margin) * 100, high: Math.min(1, center + margin) * 100 } };
}
