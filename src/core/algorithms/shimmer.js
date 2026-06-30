/**
 * Shimmer (Amplitude Perturbation) Algorithms
 *
 * Shimmer measures the cycle-to-cycle variation of the peak amplitude of the signal.
 * High shimmer values indicate breathiness, hoarseness, and vocal tract inflammation.
 */

/**
 * Calculates the average peak amplitude of a voice signal.
 *
 * @param {number[]} amplitudes - Array of peak amplitudes.
 * @returns {number} The average amplitude, or 0 if empty.
 */
export function getAverageAmplitude(amplitudes) {
  const N = amplitudes.length;
  if (N === 0) return 0;

  let sum = 0;
  for (let i = 0; i < N; i++) {
    sum += Math.abs(amplitudes[i]);
  }
  return sum / N;
}

/**
 * Calculates Shimmer (Local, Percent).
 * Represents the average absolute difference between consecutive peak amplitudes,
 * normalized by the average amplitude, expressed as a percentage.
 *
 * Threshold for pathological voice: >= 3.810%
 *
 * @param {number[]} amplitudes - Array of peak amplitudes.
 * @returns {number} Shimmer (Local) as a percentage.
 */
export function calculateShimmerLocalPercent(amplitudes) {
  const N = amplitudes.length;
  if (N < 2) return 0;

  const avgAmp = getAverageAmplitude(amplitudes);
  if (avgAmp === 0) return 0;

  let sumDiff = 0;
  for (let i = 0; i < N - 1; i++) {
    sumDiff += Math.abs(Math.abs(amplitudes[i]) - Math.abs(amplitudes[i + 1]));
  }

  const avgDiff = sumDiff / (N - 1);
  return (avgDiff / avgAmp) * 100;
}

/**
 * Calculates Shimmer (dB).
 * Represents the average absolute log-difference of peak amplitudes between
 * consecutive cycles, scaled by 20.
 *
 * Threshold for pathological voice: >= 0.350 dB
 *
 * Formula:
 * Shimmer(dB) = 1/(N-1) * sum_{i=1}^{N-1} | 20 * log10( A_{i+1} / A_i ) |
 *
 * @param {number[]} amplitudes - Array of peak amplitudes.
 * @returns {number} Shimmer (dB) value.
 */
export function calculateShimmerDB(amplitudes) {
  const N = amplitudes.length;
  if (N < 2) return 0;

  let sumLogDiff = 0;
  let validPairs = 0;

  for (let i = 0; i < N - 1; i++) {
    const a1 = Math.abs(amplitudes[i]);
    const a2 = Math.abs(amplitudes[i + 1]);

    // Avoid division by zero or log of zero
    if (a1 > 1e-6 && a2 > 1e-6) {
      sumLogDiff += Math.abs(20 * Math.log10(a2 / a1));
      validPairs++;
    }
  }

  if (validPairs === 0) return 0;
  return sumLogDiff / validPairs;
}

/**
 * Calculates Shimmer (APQ3 - Amplitude Perturbation Quotient 3).
 * APQ3 is the three-cycle amplitude perturbation quotient.
 *
 * Threshold for pathological voice: >= 3.070%
 *
 * Formula:
 * APQ3 = ( 1/(N-2) * sum_{i=2}^{N-1} | A_i - (A_{i-1} + A_i + A_{i+1})/3 | ) / ( 1/N * sum_{i=1}^N A_i )
 *
 * @param {number[]} amplitudes - Array of peak amplitudes.
 * @returns {number} Shimmer (APQ3) as a percentage.
 */
export function calculateShimmerAPQ3(amplitudes) {
  const N = amplitudes.length;
  if (N < 3) return 0;

  // Work with absolute amplitudes
  const absAmps = amplitudes.map((a) => Math.abs(a));
  const avgAmp = getAverageAmplitude(absAmps);
  if (avgAmp === 0) return 0;

  let perturbationSum = 0;
  for (let i = 1; i < N - 1; i++) {
    const localAvg = (absAmps[i - 1] + absAmps[i] + absAmps[i + 1]) / 3;
    perturbationSum += Math.abs(absAmps[i] - localAvg);
  }

  const averagePerturbation = perturbationSum / (N - 2);
  return (averagePerturbation / avgAmp) * 100;
}
