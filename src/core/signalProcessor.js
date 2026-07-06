/**
 * Edge-Compute Acoustic Vocal Biomarker Platform
 * Signal Processing and Audio Capture Pipeline
 */

import {
  detectPitchAutocorrelation,
  extractCyclesAndAmplitudes,
  calculateJitterLocalPercent,
  calculateJitterRAP,
  calculateShimmerLocalPercent,
  calculateShimmerDB,
  calculateShimmerAPQ3,
} from './algorithms/index.js';

export class VocalAudioProcessor {
  constructor() {
    this.audioContext = null;
    this.stream = null;
    this.source = null;
    this.processor = null;
    this.isRecording = false;
    this.isPaused = false;

    // Accumulators
    this.accumulatedSamples = []; // Array of Float32Array chunks
    this.featuresHistory = []; // Array of { mfcc, spectralFlatness, rms, timestamp }
    this.sampleRate = 44100;
    this.bufferSize = 2048;

    // Callbacks
    this.onFeaturesExtracted = null; // (features, rawTimeDomainData) => {}
    this.onStateChange = null; // (state) => {}
  }

  /**
   * Starts capturing audio from microphone.
   * @param {object} options
   * @param {number} [options.bufferSize] - Audio buffer size (1024, 2048, 4096)
   * @param {number} [options.sampleRate] - Requested sampling rate
   */
  async start(options = {}) {
    if (this.isRecording) return;

    this.bufferSize = options.bufferSize || 2048;
    const requestedSampleRate = options.sampleRate || 44100;

    // 1. Request microphone permissions
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    // 2. Initialize AudioContext
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: requestedSampleRate,
      });
    } catch (e) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    this.sampleRate = this.audioContext.sampleRate;
    this.source = this.audioContext.createMediaStreamSource(this.stream);

    // 3. Reset state
    this.accumulatedSamples = [];
    this.featuresHistory = [];
    this.isRecording = true;
    this.isPaused = false;

    // 4. Create ScriptProcessorNode
    this.processor = this.audioContext.createScriptProcessor(this.bufferSize, 1, 1);
    this.processor.onaudioprocess = (e) => {
      if (!this.isRecording || this.isPaused) return;

      const inputData = e.inputBuffer.getChannelData(0);

      // Clone buffer to avoid data changing before callback processing
      const bufferClone = new Float32Array(inputData);

      // Accumulate raw sample chunk
      this.accumulatedSamples.push(bufferClone);

      // Extract real-time features using Meyda (loaded from CDN in browser)
      if (typeof window.Meyda !== 'undefined') {
        try {
          const features = window.Meyda.extract(['mfcc', 'spectralFlatness', 'rms'], bufferClone);
          if (features) {
            this.featuresHistory.push({
              mfcc: features.mfcc,
              spectralFlatness: features.spectralFlatness,
              rms: features.rms,
              timestamp: this.audioContext.currentTime,
            });

            if (this.onFeaturesExtracted) {
              this.onFeaturesExtracted(features, bufferClone);
            }
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Meyda feature extraction failed:', err);
        }
      }
    };

    // Connect components
    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);

    if (this.onStateChange) this.onStateChange('recording');
  }

  /**
   * Pauses audio recording.
   */
  pause() {
    if (!this.isRecording || this.isPaused) return;
    this.isPaused = true;
    if (this.onStateChange) this.onStateChange('paused');
  }

  /**
   * Resumes audio recording.
   */
  resume() {
    if (!this.isRecording || !this.isPaused) return;
    this.isPaused = false;
    if (this.onStateChange) this.onStateChange('recording');
  }

  /**
   * Stops recording and returns consolidated data.
   * @returns {object|null}
   */
  stop() {
    if (!this.isRecording) return null;

    this.isRecording = false;

    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.onStateChange) this.onStateChange('stopped');

    // Consolidate raw audio buffer
    const totalLength = this.accumulatedSamples.reduce((sum, chunk) => sum + chunk.length, 0);
    const rawAudio = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.accumulatedSamples) {
      rawAudio.set(chunk, offset);
      offset += chunk.length;
    }

    const features = [...this.featuresHistory];

    this.accumulatedSamples = [];
    this.featuresHistory = [];

    return {
      rawAudio,
      sampleRate: this.sampleRate,
      features,
    };
  }

  /**
   * Feeds raw captured audio into core jitter & shimmer analysis algorithms.
   * @param {Float32Array} rawAudio - The accumulated raw audio samples.
   * @param {number} sampleRate - Sample rate of raw audio.
   * @returns {object} Analysis metrics or error message.
   */
  analyze(rawAudio, sampleRate) {
    if (!rawAudio || rawAudio.length === 0) {
      return {
        success: false,
        error: 'No audio data captured to analyze.',
      };
    }

    const blockSize = this.bufferSize;
    const hopSize = Math.floor(blockSize / 2);
    const sampleCount = rawAudio.length;

    const voicedBlocks = [];
    const pitchPeriods = [];
    const peakAmplitudes = [];

    // Analyze block-by-block to trace pitch periods and amplitudes
    for (let i = 0; i + blockSize <= sampleCount; i += hopSize) {
      const block = rawAudio.subarray(i, i + blockSize);
      const pitchResult = detectPitchAutocorrelation(block, sampleRate, {
        minFreq: 50,
        maxFreq: 500,
        voicedThreshold: 0.25,
      });

      if (pitchResult.isVoiced && pitchResult.frequency > 0) {
        const { periods, amplitudes } = extractCyclesAndAmplitudes(
          block,
          sampleRate,
          pitchResult.periodSamples
        );

        if (periods.length > 0) {
          pitchPeriods.push(...periods);
          peakAmplitudes.push(...amplitudes);
          voicedBlocks.push({
            frequency: pitchResult.frequency,
            periodSamples: pitchResult.periodSamples,
          });
        }
      }
    }

    // Require at least a small set of voiced cycles to determine biomarkers
    if (pitchPeriods.length < 3 || peakAmplitudes.length < 3) {
      return {
        success: false,
        error: 'Insufficient voiced speech detected. Please speak steadily and try again.',
      };
    }

    // F0 calculations
    const frequencies = voicedBlocks.map((b) => b.frequency);
    const avgF0 = frequencies.reduce((a, b) => a + b, 0) / frequencies.length;
    const minF0 = Math.min(...frequencies);
    const maxF0 = Math.max(...frequencies);

    // Vocal Jitter calculations
    const jitterLocalPercent = calculateJitterLocalPercent(pitchPeriods);
    const jitterRAP = calculateJitterRAP(pitchPeriods);

    // Vocal Shimmer calculations
    const shimmerLocalPercent = calculateShimmerLocalPercent(peakAmplitudes);
    const shimmerDB = calculateShimmerDB(peakAmplitudes);
    const shimmerAPQ3 = calculateShimmerAPQ3(peakAmplitudes);

    return {
      success: true,
      metrics: {
        avgF0,
        minF0,
        maxF0,
        jitterLocalPercent,
        jitterRAP,
        shimmerLocalPercent,
        shimmerDB,
        shimmerAPQ3,
        voicedRatio: voicedBlocks.length / (sampleCount / hopSize),
      },
    };
  }
}
