/**
 * Jitter (Frequency Perturbation) Algorithms
 * 
 * Jitter measures the cycle-to-cycle variation of fundamental frequency (F0)
 * or pitch period duration. High jitter is correlated with voice hoarseness,
 * pathology, and clinical fatigue (SDG 3.4).
 */

/**
 * Calculates the average period of a pitch period sequence.
 * 
 * @param {number[]} periods - Array of pitch period durations (in samples or seconds).
 * @returns {number} The average pitch period duration, or 0 if empty.
 */
export function getAveragePeriod(periods) {
  const N = periods.length;
  if (N === 0) return 0;
  
  let sum = 0;
  for (let i = 0; i < N; i++) {
    sum += periods[i];
  }
  return sum / N;
}

/**
 * Calculates Jitter (Local, Absolute) in seconds or samples.
 * Represents the average absolute difference between consecutive periods.
 * 
 * @param {number[]} periods - Array of pitch period durations (in samples or seconds).
 * @param {number} [sampleRate] - Optional sampling rate. If provided, result is in seconds. Otherwise, in sample units.
 * @returns {number} Jitter (Absolute).
 */
export function calculateJitterAbsolute(periods, sampleRate = null) {
  const N = periods.length;
  if (N < 2) return 0;

  let sumDiff = 0;
  for (let i = 0; i < N - 1; i++) {
    sumDiff += Math.abs(periods[i] - periods[i + 1]);
  }
  
  const avgDiffSamples = sumDiff / (N - 1);

  if (sampleRate) {
    // Convert samples to seconds: duration_sec = samples / sampleRate
    return avgDiffSamples / sampleRate;
  }
  return avgDiffSamples;
}

/**
 * Calculates Jitter (Local, Percent).
 * Represents the average absolute difference between consecutive cycles,
 * normalized by the average period, expressed as a percentage.
 * 
 * Threshold for pathological voice: >= 1.040%
 * 
 * @param {number[]} periods - Array of pitch period durations.
 * @returns {number} Jitter (Local) as a percentage (e.g., 0.85 means 0.85%).
 */
export function calculateJitterLocalPercent(periods) {
  const N = periods.length;
  if (N < 2) return 0;

  const avgPeriod = getAveragePeriod(periods);
  if (avgPeriod === 0) return 0;

  const jitterAbs = calculateJitterAbsolute(periods);
  return (jitterAbs / avgPeriod) * 100;
}

/**
 * Calculates Jitter (Relative Average Perturbation - RAP).
 * RAP is the average absolute difference between a period and its three-period local average,
 * normalized by the average period.
 * 
 * Threshold for pathological voice: >= 0.680%
 * 
 * Formula:
 * RAP = ( 1/(N-2) * sum_{i=2}^{N-1} | T_i - (T_{i-1} + T_i + T_{i+1})/3 | ) / ( 1/N * sum_{i=1}^N T_i )
 * 
 * @param {number[]} periods - Array of pitch period durations.
 * @returns {number} Jitter (RAP) as a fraction (or percentage when multiplied by 100). We return percentage.
 */
export function calculateJitterRAP(periods) {
  const N = periods.length;
  if (N < 3) return 0;

  const avgPeriod = getAveragePeriod(periods);
  if (avgPeriod === 0) return 0;

  let perturbationSum = 0;
  for (let i = 1; i < N - 1; i++) {
    const localAvg = (periods[i - 1] + periods[i] + periods[i + 1]) / 3;
    perturbationSum += Math.abs(periods[i] - localAvg);
  }

  const averagePerturbation = perturbationSum / (N - 2);
  
  // Return as percentage to keep consistent with standard clinical tools (like Praat)
  return (averagePerturbation / avgPeriod) * 100;
}
