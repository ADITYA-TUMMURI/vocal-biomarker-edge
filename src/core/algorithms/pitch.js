/**
 * Pitch detection and cycle extraction algorithms for vocal biomarker analysis.
 *
 * Implements:
 * 1. Center-clipped Autocorrelation Pitch Detection
 * 2. Peak-to-Peak Cycle and Amplitude Extraction
 */

/**
 * Center-clips an audio buffer to reduce formant influence and highlight the fundamental period.
 * Ref: Sondhi, M. M. (1968). New methods of pitch extraction. IEEE Transactions on Audio and Electroacoustics.
 *
 * @param {Float32Array|number[]} buffer - The raw input audio samples.
 * @param {number} clippingThresholdRatio - The ratio (0 to 1) of max amplitude to use for clipping. Default is 0.3.
 * @returns {Float32Array} The center-clipped signal.
 */
export function centerClip(buffer, clippingThresholdRatio = 0.3) {
  const length = buffer.length;
  const clipped = new Float32Array(length);

  if (length === 0) return clipped;

  // Find absolute maximum amplitude
  let maxVal = 0;
  for (let i = 0; i < length; i++) {
    const absVal = Math.abs(buffer[i]);
    if (absVal > maxVal) {
      maxVal = absVal;
    }
  }

  const threshold = maxVal * clippingThresholdRatio;

  // Perform three-level or center-clipping
  for (let i = 0; i < length; i++) {
    const val = buffer[i];
    if (val > threshold) {
      clipped[i] = val - threshold;
    } else if (val < -threshold) {
      clipped[i] = val + threshold;
    } else {
      clipped[i] = 0;
    }
  }

  return clipped;
}

/**
 * Detects the fundamental frequency (F0) of an audio buffer using center-clipped autocorrelation.
 * Optimized for human voice pitch range (50 Hz - 500 Hz).
 *
 * @param {Float32Array|number[]} buffer - The input audio buffer.
 * @param {number} sampleRate - The sampling rate of the audio buffer (e.g. 44100).
 * @param {object} options - Configuration options.
 * @param {number} options.minFreq - Minimum frequency to check (default: 50 Hz).
 * @param {number} options.maxFreq - Maximum frequency to check (default: 500 Hz).
 * @param {number} options.voicedThreshold - Threshold for autocorrelation peak ratio (default: 0.25).
 * @returns {object} { frequency: number, periodSamples: number, isVoiced: boolean }
 */
export function detectPitchAutocorrelation(buffer, sampleRate, options = {}) {
  const minFreq = options.minFreq || 50;
  const maxFreq = options.maxFreq || 500;
  const voicedThreshold = options.voicedThreshold || 0.25;

  const results = { frequency: 0, periodSamples: 0, isVoiced: false };
  const length = buffer.length;

  if (length === 0 || !sampleRate) {
    return results;
  }

  // Pre-process with center clipping
  const clippedBuffer = centerClip(buffer, 0.3);

  // Convert frequency range to search lags in samples
  const minLag = Math.floor(sampleRate / maxFreq);
  const maxLag = Math.floor(sampleRate / minFreq);

  if (minLag >= length || maxLag >= length) {
    return results;
  }

  // Calculate Autocorrelation function R(lag)
  // R(lag) = sum_{t=0}^{N-1-lag} x(t) * x(t + lag)
  const r = new Float32Array(maxLag + 1);

  // Calculate R(0) for normalization
  let r0 = 0;
  for (let i = 0; i < length; i++) {
    r0 += clippedBuffer[i] * clippedBuffer[i];
  }

  if (r0 === 0) {
    return results; // Silence
  }

  // Compute correlation for candidate lags
  let maxR = -Infinity;
  let bestLag = -1;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const maxIdx = length - lag;
    for (let t = 0; t < maxIdx; t++) {
      sum += clippedBuffer[t] * clippedBuffer[t + lag];
    }
    r[lag] = sum;

    if (sum > maxR) {
      maxR = sum;
      bestLag = lag;
    }
  }

  // Voicing decision: is the peak significant relative to signal energy?
  const peakRatio = maxR / r0;
  if (bestLag !== -1 && peakRatio >= voicedThreshold) {
    results.frequency = sampleRate / bestLag;
    results.periodSamples = bestLag;
    results.isVoiced = true;
  }

  return results;
}

/**
 * Extracts pitch periods and peak amplitudes from an audio buffer.
 * Performs peak picking in sequential cycles based on an estimated pitch period.
 *
 * @param {Float32Array|number[]} buffer - The voiced input audio buffer.
 * @param {number} sampleRate - The sampling rate.
 * @param {number} estPeriodSamples - Estimated fundamental pitch period in samples.
 * @returns {object} { periods: number[], amplitudes: number[] } Arrays of pitch periods (in samples) and cycle peak amplitudes.
 */
export function extractCyclesAndAmplitudes(buffer, sampleRate, estPeriodSamples) {
  const periods = [];
  const amplitudes = [];
  const length = buffer.length;

  if (length === 0 || !estPeriodSamples || estPeriodSamples < 4) {
    return { periods, amplitudes };
  }

  // Step 1: Find the first major peak as anchor point
  let currentIdx = 0;
  let maxAmp = 0;

  // Search the first 1.5 periods for the starting peak
  const initialSearchRange = Math.min(length, Math.round(estPeriodSamples * 1.5));
  for (let i = 0; i < initialSearchRange; i++) {
    const absVal = Math.abs(buffer[i]);
    if (absVal > maxAmp) {
      maxAmp = absVal;
      currentIdx = i;
    }
  }

  // Step 2: Track subsequent cycles by leaping by estPeriodSamples and searching locally
  const tolerance = Math.round(estPeriodSamples * 0.25); // 25% jitter tolerance

  while (currentIdx < length) {
    const nextTargetIdx = currentIdx + estPeriodSamples;
    if (nextTargetIdx >= length) {
      break;
    }

    // Set local search window around next expected peak
    const startSearch = Math.max(currentIdx + 2, nextTargetIdx - tolerance);
    const endSearch = Math.min(length - 1, nextTargetIdx + tolerance);

    if (startSearch >= endSearch) {
      break;
    }

    let localMaxAmp = -1;
    let localPeakIdx = -1;

    for (let j = startSearch; j <= endSearch; j++) {
      const absVal = Math.abs(buffer[j]);
      if (absVal > localMaxAmp) {
        localMaxAmp = absVal;
        localPeakIdx = j;
      }
    }

    if (localPeakIdx !== -1) {
      const actualPeriod = localPeakIdx - currentIdx;

      // Sanity check: Ensure period is within reasonable bounds of estimation
      if (actualPeriod >= estPeriodSamples * 0.5 && actualPeriod <= estPeriodSamples * 1.8) {
        periods.push(actualPeriod);
        amplitudes.push(localMaxAmp);
        currentIdx = localPeakIdx;
      } else {
        // Fallback: Skip if cycle is distorted
        currentIdx = nextTargetIdx;
      }
    } else {
      break;
    }
  }

  return { periods, amplitudes };
}
