import test from 'node:test';
import assert from 'node:assert';
import {
  getAveragePeriod,
  calculateJitterAbsolute,
  calculateJitterLocalPercent,
  calculateJitterRAP
} from '../src/core/algorithms/jitter.js';

test('getAveragePeriod should calculate correct average period', () => {
  assert.strictEqual(getAveragePeriod([]), 0);
  assert.strictEqual(getAveragePeriod([10]), 10);
  assert.strictEqual(getAveragePeriod([100, 110, 90]), 100);
});

test('calculateJitterAbsolute should return 0 for stable periods', () => {
  const periods = [100, 100, 100, 100];
  assert.strictEqual(calculateJitterAbsolute(periods), 0);
});

test('calculateJitterAbsolute should compute correct average differences', () => {
  // Diff list: [10, 10, 10]. Average diff: 10
  const periods = [100, 110, 100, 110];
  assert.strictEqual(calculateJitterAbsolute(periods), 10);
  
  // With sampleRate, convert to seconds
  assert.strictEqual(calculateJitterAbsolute(periods, 1000), 0.01);
});

test('calculateJitterLocalPercent should calculate correct percentage jitter', () => {
  // Periods: [100, 110, 100, 110]
  // Avg period: 105. Jitter absolute: 10.
  // Local percent: (10 / 105) * 100 = 9.5238...
  const periods = [100, 110, 100, 110];
  const expected = (10 / 105) * 100;
  const result = calculateJitterLocalPercent(periods);
  
  assert.ok(Math.abs(result - expected) < 1e-5, `Expected ${expected} but got ${result}`);
});

test('calculateJitterRAP should calculate correct RAP percentage', () => {
  // Periods: [100, 110, 90, 100, 110]
  // N = 5
  // Avg period (denominator): 102
  // Indices to check:
  // i=1 (val: 110): localAvg = (100+110+90)/3 = 100. diff = |110 - 100| = 10
  // i=2 (val: 90): localAvg = (110+90+100)/3 = 100. diff = |90 - 100| = 10
  // i=3 (val: 100): localAvg = (90+100+110)/3 = 100. diff = |100 - 100| = 0
  // Average perturbation (numerator): (10 + 10 + 0) / 3 = 6.66667
  // RAP: (6.66667 / 102) * 100 = 6.5359477...
  const periods = [100, 110, 90, 100, 110];
  const expected = ((20 / 3) / 102) * 100;
  const result = calculateJitterRAP(periods);

  assert.ok(Math.abs(result - expected) < 1e-5, `Expected ${expected} but got ${result}`);
});

test('Jitter functions should handle edge cases with too few samples', () => {
  assert.strictEqual(calculateJitterAbsolute([100]), 0);
  assert.strictEqual(calculateJitterLocalPercent([100]), 0);
  assert.strictEqual(calculateJitterRAP([100, 110]), 0);
});
