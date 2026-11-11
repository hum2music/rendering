export type DrumType = "kick" | "snare" | "hihat";
export type Timbre = "melody" | "piano" | "bass" | "guitar";

export interface PitchedRenderNote {
  startMs: number;
  durationMs: number;
  velocity: number;
  frequencyHz: number;
  /** Defaults to "melody" (a near-pure tone) if omitted. */
  timbre?: Timbre;
}

export interface DrumRenderNote {
  startMs: number;
  durationMs: number;
  velocity: number;
  drumType: DrumType;
}
