import { createSeededRandom } from "@hum2music/expression";
import type { DrumRenderNote, DrumType, PitchedRenderNote, Timbre } from "./types";

export interface RenderOptions {
  sampleRate?: number;
  /** Seeds the noise generator used for drum synthesis, for reproducibility (PRD §15.1). */
  seed?: number;
}

const DEFAULT_SAMPLE_RATE = 44100;
const DEFAULT_SEED = 42;
const TAIL_MS = 300;

interface HarmonicPartial {
  multiplier: number;
  amplitude: number;
}

interface TimbreProfile {
  partials: HarmonicPartial[];
  /** Exponential amplitude decay over the note's duration; 0 = sustained (no extra decay beyond the envelope). */
  decayRatePerSec: number;
}

/**
 * Rough, additive-synthesis stand-ins for each instrument's character —
 * not sampled/physically modeled, just enough harmonic content and decay
 * shape to tell them apart by ear (melody: near-pure tone; piano/guitar:
 * brighter with a plucky decay; bass: a touch of overtone, mostly sustained).
 */
const TIMBRE_PROFILES: Record<Timbre, TimbreProfile> = {
  melody: { partials: [{ multiplier: 1, amplitude: 1 }, { multiplier: 2, amplitude: 0.15 }], decayRatePerSec: 0 },
  piano: {
    partials: [
      { multiplier: 1, amplitude: 1 },
      { multiplier: 2, amplitude: 0.5 },
      { multiplier: 3, amplitude: 0.25 },
      { multiplier: 4, amplitude: 0.12 },
    ],
    decayRatePerSec: 2.5,
  },
  bass: { partials: [{ multiplier: 1, amplitude: 1 }, { multiplier: 2, amplitude: 0.3 }], decayRatePerSec: 0.8 },
  guitar: {
    partials: [{ multiplier: 1, amplitude: 1 }, { multiplier: 2, amplitude: 0.4 }, { multiplier: 3, amplitude: 0.2 }],
    decayRatePerSec: 3,
  },
};

/**
 * Minimal software synth: additive-harmonic oscillators (with a short
 * attack/release envelope and a per-timbre decay) for pitched notes, and
 * simple decaying tone/noise bursts for drum hits. Not meant to sound
 * "produced" — just an audible, deterministic, instrument-distinguishable
 * preview, per PRD §13.3's explicit MVP bar on audio quality.
 */
export function renderToSamples(
  pitchedNotes: PitchedRenderNote[],
  drumNotes: DrumRenderNote[],
  options: RenderOptions = {},
): Float32Array {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const random = createSeededRandom(options.seed ?? DEFAULT_SEED);

  const endMs =
    Math.max(
      0,
      ...pitchedNotes.map((note) => note.startMs + note.durationMs),
      ...drumNotes.map((note) => note.startMs + note.durationMs),
    ) + TAIL_MS;
  const output = new Float32Array(Math.ceil((endMs / 1000) * sampleRate));

  for (const note of pitchedNotes) renderPitchedNote(output, note, sampleRate);
  for (const note of drumNotes) renderDrumNote(output, note, sampleRate, random);

  normalizeInPlace(output);
  return output;
}

function renderPitchedNote(output: Float32Array, note: PitchedRenderNote, sampleRate: number): void {
  const profile = TIMBRE_PROFILES[note.timbre ?? "melody"];
  const partialAmplitudeSum = profile.partials.reduce((sum, partial) => sum + partial.amplitude, 0);

  const startSample = Math.max(0, Math.round((note.startMs / 1000) * sampleRate));
  const durationSamples = Math.max(1, Math.round((note.durationMs / 1000) * sampleRate));
  const attackSamples = Math.min(durationSamples, Math.round(sampleRate * 0.01));
  const releaseSamples = Math.min(durationSamples, Math.round(sampleRate * 0.05));
  const baseAmplitude = (note.velocity / 127) * 0.25;

  for (let i = 0; i < durationSamples; i++) {
    const index = startSample + i;
    if (index >= output.length) break;

    const envelope = envelopeAt(i, durationSamples, attackSamples, releaseSamples);
    const time = i / sampleRate;
    const decay = profile.decayRatePerSec > 0 ? Math.exp(-time * profile.decayRatePerSec) : 1;

    let partialSum = 0;
    for (const partial of profile.partials) {
      partialSum += Math.sin(2 * Math.PI * note.frequencyHz * partial.multiplier * time) * partial.amplitude;
    }

    output[index] += (partialSum / partialAmplitudeSum) * baseAmplitude * envelope * decay;
  }
}

function envelopeAt(i: number, duration: number, attack: number, release: number): number {
  if (i < attack) return i / attack;
  if (i > duration - release) return Math.max(0, (duration - i) / release);
  return 1;
}

const DRUM_PROFILES: Record<DrumType, { durationSec: number; decayRate: number; amplitude: number }> = {
  kick: { durationSec: 0.15, decayRate: 20, amplitude: 0.5 },
  snare: { durationSec: 0.15, decayRate: 15, amplitude: 0.4 },
  hihat: { durationSec: 0.05, decayRate: 60, amplitude: 0.2 },
};

function renderDrumNote(output: Float32Array, note: DrumRenderNote, sampleRate: number, random: () => number): void {
  const profile = DRUM_PROFILES[note.drumType];
  const startSample = Math.max(0, Math.round((note.startMs / 1000) * sampleRate));
  const durationSamples = Math.round(profile.durationSec * sampleRate);
  const amplitude = (note.velocity / 127) * profile.amplitude;

  for (let i = 0; i < durationSamples; i++) {
    const index = startSample + i;
    if (index >= output.length) break;
    const time = i / sampleRate;
    const decay = Math.exp(-time * profile.decayRate);
    const signal =
      note.drumType === "kick"
        ? Math.sin(2 * Math.PI * (120 * Math.pow(0.08, time / profile.durationSec)) * time)
        : random() * 2 - 1;

    output[index] += signal * amplitude * decay;
  }
}

function normalizeInPlace(samples: Float32Array): void {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  if (peak <= 1) return;

  const scale = 0.98 / peak;
  for (let i = 0; i < samples.length; i++) samples[i] *= scale;
}
