// The three d3-scale pieces the charts use, as tiny functions (d3-scale drags in d3-format/-time/-interpolate/-color: ~12 KB gz).
type R = [number, number];

/** d3.scaleLinear([d0,d1],[r0,r1]) without clamping or ticks. */
export const linear = ([d0, d1]: R, [r0, r1]: R) => (v: number) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);

/** d3.scaleQuantize([d0,d1], range): equal-width buckets, clamped to the first/last. */
export const quantize = <T>([d0, d1]: R, range: T[]) => (v: number) =>
  range[Math.max(0, Math.min(range.length - 1, Math.floor((range.length * (v - d0)) / (d1 - d0))))];

/** d3.scaleBand(indexes 0..n-1, [r0,r1]).padding(p): returns x(i) and the band width. */
export function band(n: number, [r0, r1]: R, pad: number) {
  const step = (r1 - r0) / Math.max(1, n - pad + pad * 2);
  const start = r0 + (r1 - r0 - step * (n - pad)) / 2;
  return { x: (i: number) => start + step * i, width: step * (1 - pad) };
}
