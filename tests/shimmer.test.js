import test from 'node:test';
import assert from 'node:assert';
import {
  getAverageAmplitude,
  calculateShimmerLocalPercent,
  calculateShimmerDB,
  calculateShimmerAPQ3
} from '../src/core/algorithms/shimmer.js';

test('getAverageAmplitude should calculate correct average absolute amplitude', () => {
  assert.strictEqual(getAverageAmplitude([]), 0);
  assert.strictEqual(getAverageAmplitude([1.0, -1.0]), 1.0);
  assert.strictEqual(getAverageAmplitude([0.5, 1.5, -1.0]), 1.0);
});

test('calculateShimmerLocalPercent should return 0 for stable amplitudes', () => {
  assert.strictEqual(calculateShimmerLocalPercent([0.5, 0.5, 0.5]), 0);
});

test('calculateShimmerLocalPercent should compute correct local percentage', () => {
  // Amplitudes: [1.0, 0.8, 1.0, 0.8]
  // Avg amplitude: 0.9
  // Diff: |1.0 - 0.8| = 0.2, etc. (all three diffs are 0.2). Avg diff: 0.2
  // Shimmer local percent: (0.2 / 0.9) * 100 = 22.2222...
  const amplitudes = [1.0, 0.8, 1.0, 0.8];
  const expected = (0.2 / 0.9) * 100;
  const result = calculateShimmerLocalPercent(amplitudes);

  assert.ok(Math.abs(result - expected) < 1e-5, `Expected ${expected} but got ${result}`);
});

test('calculateShimmerDB should compute correct decibel shimmer', () => {
  // Amplitudes: [1.0, 0.8]
  // log10(0.8 / 1.0) = -0.096910013
  // 20 * -0.096910013 = -1.93820026
  // Shimmer dB: 1.93820026
  const amplitudes = [1.0, 0.8];
  const expected = Math.abs(20 * Math.log10(0.8 / 1.0));
  const result = calculateShimmerDB(amplitudes);

  assert.ok(Math.abs(result - expected) < 1e-5, `Expected ${expected} but got ${result}`);
});

test('calculateShimmerDB should ignore invalid or near-zero amplitudes', () => {
  const result = calculateShimmerDB([1.0, 0, 0.8]);
  // Midpoint has amplitude 0. The pairs (1.0, 0) and (0, 0.8) are invalid.
  // So validPairs is 0, should return 0.
  assert.strictEqual(result, 0);
});

test('calculateShimmerAPQ3 should compute correct APQ3 percentage', () => {
  // Amplitudes: [1.0, 0.8, 1.2, 1.0, 0.8]
  // N = 5
  // Avg absolute amplitude (denominator): 0.96
  // Indices to check:
  // i=1 (val: 0.8): localAvg = (1.0+0.8+1.2)/3 = 1.0. diff = |0.8 - 1.0| = 0.2
  // i=2 (val: 1.2): localAvg = (0.8+1.2+1.0)/3 = 1.0. diff = |1.2 - 1.0| = 0.2
  // i=3 (val: 1.0): localAvg = (1.2+1.0+0.8)/3 = 1.0. diff = |1.0 - 1.0| = 0.0
  // Average perturbation (numerator): (0.2 + 0.2 + 0) / 3 = 0.133333
  // APQ3: (0.133333 / 0.96) * 100 = 13.8888...
  const amplitudes = [1.0, 0.8, 1.2, 1.0, 0.8];
  const expected = ((0.4 / 3) / 0.96) * 100;
  const result = calculateShimmerAPQ3(amplitudes);

  assert.ok(Math.abs(result - expected) < 1e-5, `Expected ${expected} but got ${result}`);
});

test('Shimmer functions should handle edge cases with too few samples', () => {
  assert.strictEqual(calculateShimmerLocalPercent([1.0]), 0);
  assert.strictEqual(calculateShimmerDB([1.0]), 0);
  assert.strictEqual(calculateShimmerAPQ3([1.0, 0.9]), 0);
});
