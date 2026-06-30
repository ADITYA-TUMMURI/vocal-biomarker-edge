import test from 'node:test';
import assert from 'node:assert';
import {
  centerClip,
  detectPitchAutocorrelation,
  extractCyclesAndAmplitudes,
} from '../src/core/algorithms/pitch.js';

test('centerClip should correctly clip values based on threshold', () => {
  // Max absolute value is 10.0. At ratio 0.3, threshold is 3.0
  const input = new Float32Array([0, 2, -2, 5, -5, 10, -10]);
  const expected = new Float32Array([0, 0, 0, 2, -2, 7, -7]);

  const output = centerClip(input, 0.3);

  assert.strictEqual(output.length, input.length);
  for (let i = 0; i < output.length; i++) {
    assert.ok(
      Math.abs(output[i] - expected[i]) < 1e-5,
      `At index ${i}, expected ${expected[i]} but got ${output[i]}`
    );
  }
});

test('centerClip should handle empty array', () => {
  const output = centerClip(new Float32Array([]));
  assert.strictEqual(output.length, 0);
});

test('detectPitchAutocorrelation should return isVoiced false for silence', () => {
  const silence = new Float32Array(1024);
  const result = detectPitchAutocorrelation(silence, 44100);
  assert.strictEqual(result.isVoiced, false);
  assert.strictEqual(result.frequency, 0);
});

test('detectPitchAutocorrelation should detect the correct frequency of a sine wave', () => {
  const sampleRate = 44100;
  const targetFreq = 150; // 150 Hz
  const bufferLength = 2048;
  const buffer = new Float32Array(bufferLength);

  // Generate a pure sine wave at 150 Hz
  for (let i = 0; i < bufferLength; i++) {
    buffer[i] = Math.sin(2 * Math.PI * targetFreq * (i / sampleRate));
  }

  const result = detectPitchAutocorrelation(buffer, sampleRate, { minFreq: 50, maxFreq: 500 });

  assert.strictEqual(result.isVoiced, true);
  // Period in samples for 150 Hz is 44100 / 150 = 294 samples
  assert.strictEqual(result.periodSamples, 294);
  assert.ok(
    Math.abs(result.frequency - targetFreq) < 1.0,
    `Detected frequency ${result.frequency} is not close to target ${targetFreq}`
  );
});

test('extractCyclesAndAmplitudes should correctly identify cycles and amplitudes in a synthetic pulse train', () => {
  const sampleRate = 44100;
  const estPeriod = 100; // 100 samples
  const bufferLength = 1000;
  const buffer = new Float32Array(bufferLength);

  // Generate a signal with clear peaks every 100 samples with alternating peak heights
  // Peak indices: 50, 150, 250, 350, 450, 550, 650, 750, 850, 950
  const peakAmplitudes = [0.8, 0.9, 0.8, 0.9, 0.8, 0.9, 0.8, 0.9, 0.8, 0.9];

  for (let i = 0; i < bufferLength; i++) {
    // Basic decay wave to make it sound/look like a voice pulse
    const cyclePos = i % estPeriod;
    if (cyclePos === 50) {
      const peakIdx = Math.floor(i / estPeriod);
      buffer[i] = peakAmplitudes[peakIdx];
    } else {
      buffer[i] = 0;
    }
  }

  const { periods, amplitudes } = extractCyclesAndAmplitudes(buffer, sampleRate, estPeriod);

  // Expect 9 periods because there are 10 peaks
  assert.strictEqual(periods.length, 9);
  assert.strictEqual(amplitudes.length, 9);

  // Check periods (all should be exactly 100 samples)
  for (let i = 0; i < periods.length; i++) {
    assert.strictEqual(periods[i], 100);
  }

  // Check amplitudes (first peak 50 is ignored as start point, so we track from index 50 to 150, amplitude at 150 is index 1, i.e., 0.9)
  const expectedAmps = [0.9, 0.8, 0.9, 0.8, 0.9, 0.8, 0.9, 0.8, 0.9];
  for (let i = 0; i < amplitudes.length; i++) {
    assert.ok(
      Math.abs(amplitudes[i] - expectedAmps[i]) < 1e-5,
      `Amplitude mismatch at ${i}: expected ${expectedAmps[i]} got ${amplitudes[i]}`
    );
  }
});
