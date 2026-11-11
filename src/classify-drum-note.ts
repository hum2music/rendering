import type { DrumType } from "./types";

/** General MIDI percussion note numbers our drum arranger emits (PRD §10.2). */
const DRUM_TYPE_BY_PITCH: Record<number, DrumType> = {
  35: "kick",
  36: "kick",
  38: "snare",
  40: "snare",
  42: "hihat",
  44: "hihat",
  46: "hihat",
};

export function classifyDrumNote(pitch: number): DrumType {
  return DRUM_TYPE_BY_PITCH[pitch] ?? "hihat";
}
