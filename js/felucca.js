// felucca.js — Felucca editor protocol codec (pure: no transport, no imports).
//
// The firmware side is firmware/src/editor.c. Frames:
//   F0 7D 46 4C <cmd> <args...> F7
// Every valid request gets exactly one reply with the same header and cmd.
// Invalid fixed argument lengths get no reply. Every data byte is 7 bit.
//
// Used here:
//   INFO (1)        version string, NENGINES, P_COUNT, G_COUNT, NSTEP, P_E0,
//                   NENGINES engine-name strings, NTRK, CHAIN_ROWS, tagged blocks
//   TRACK_STEP (30) track, index (get)  |  track, index + the step bytes (set)
//                   reply: track, index, n, note0..3, time, flags, vel,
//                   hit, acc, hi, chance, ratchet, nudge
//
// Step times: 0 NOTE, 1 TIE, 2 REST. Flags: 1 accent, 2 slide (bits 3-4 are
// the ratchet, set by the device's own RATCH — a write keeps them).
// A chance of 100 means "always" (the firmware stores 0 for it).
//
// Note length: there is no length field in a Felucca step. Inside a row the
// note's gate is the track's own GATE parameter (firmware seq.c:
// g = period * P_SGATE / 128 — it cannot pass the row); across rows the only
// way to hold is TIE (see holdLen / pulseSteps / tieStep below).

export const CMD = { INFO: 1, GET: 2, SET: 3, STEP_GET: 6, STEP_SET: 7, PROJECT: 9, TRACK: 27, TRACK_STEP: 30, MOTION: 64 };
export const ST = { NOTE: 0, TIE: 1, REST: 2 };
export const SF = { ACCENT: 1, SLIDE: 2 };

const HDR = [0x7D, 0x46, 0x4C];

// F0 7D 46 4C <cmd> <args> F7
export function frame(cmd, args = []) {
  return [0xF0, ...HDR, cmd & 0x7F, ...args.map((a) => a & 0x7F), 0xF7];
}

// The args of a reply to `cmd`, or null (a push, another command, garbage).
export function reply(sx, cmd) {
  if (!sx || sx.length < 6 || sx[0] !== 0xF0 || sx[sx.length - 1] !== 0xF7) return null;
  if (sx[1] !== 0x7D || sx[2] !== 0x46 || sx[3] !== 0x4C) return null;
  if (sx[4] !== (cmd & 0x7F)) return null;
  return sx.slice(5, -1);
}

function readStr(args, at) {
  let s = "";
  while (at < args.length && args[at]) s += String.fromCharCode(args[at++]);
  return [s, at + 1];
}

// INFO reply -> the fields this app needs (the tagged tail is ignored).
export function decodeInfo(args) {
  let at = 0, version;
  [version, at] = readStr(args, at);
  const [nengines, pcount, gcount, nstep, pe0] = args.slice(at, at + 5);
  at += 5;
  const engines = [];
  for (let i = 0; i < nengines; i++) { let s; [s, at] = readStr(args, at); engines.push(s); }
  const ntrk = args[at] ?? 4;
  const chainRows = args[at + 1] ?? 16;
  return { version, nengines, pcount, gcount, nstep, pe0, engines, ntrk, chainRows };
}

// The 12 step bytes a write carries (the drum grid is kept at zero).
export function stepBytes(st) {
  const notes = [0, 1, 2, 3].map((k) => (st.notes?.[k] ?? 0) & 0x7F);
  return [Math.min(4, st.n ?? (st.notes?.length ?? 0)), ...notes, st.time & 3, st.flags & 3,
    (st.vel ?? 0) & 0x7F, 0, 0, 0, (st.chance ?? 100) & 0x7F];
}

// A TRACK_STEP reply (track, index, then the 14 step bytes) -> a step object.
export function readStep(args) {
  return {
    track: args[0], index: args[1],
    n: args[2], notes: args.slice(3, 7), time: args[7], flags: args[8] & 3, vel: args[9],
    hit: args[10], acc: args[11], hi: args[12], chance: args[13],
    ratchet: args[14], nudge: args[15],
  };
}

// Do the bytes we would write already equal what the device reports? (Only the
// fields a write sets: the ratchet and nudge stay the device's.)
export function sameStep(want, cur) {
  const w = stepBytes(want);
  const c = stepBytes(cur);
  return w.every((b, i) => b === c[i]);
}

function fromPulse(src, velDefault = 100) {
  const notes = (src?.notes ?? []).slice(0, 4);
  return {
    n: notes.length,
    notes: [0, 1, 2, 3].map((k) => (notes[k]?.note ?? 0) & 0x7F),
    time: notes.length ? ST.NOTE : ST.REST,
    flags: 0,
    vel: notes.length ? ((notes[0].vel ?? velDefault) & 0x7F) : 0,
    hit: 0, acc: 0, hi: 0,
    chance: 100,
  };
}

// How many rows the note at `i` covers, 1..noteLen. Felucca has no per-step length:
// a longer note is written as TIE rows (firmware seq.c: on a TIE the track does not
// retrigger, it pushes the sounding note's off forward and keeps holding while TIE
// steps chain), and the hold ends at the next NOTE row. So the span stops at the
// next row that has notes, and at the end of the pattern (rows past `length` are
// rests, which release — a hold is not carried into the next pass).
// `pattern` is the *pulses* pattern: a row with notes anywhere in it ends the hold.
export function holdLen(pattern, i, end = 64, noteLen = 1) {
  const steps = pattern?.steps ?? [];
  let len = 1;
  while (len < noteLen && i + len < end && !(steps[i + len]?.notes?.length)) len++;
  return len;
}

// A pulses pattern (64 steps, up to 9 notes each) -> `nstep` Felucca steps
// (up to 4 notes each). Steps past the pattern's length become rests.
// noteLen > 1 holds each note across the following empty rows (TIE steps) so it
// sounds until the next note on the track — the device's own length control.
export function pulseSteps(pattern, nstep = 64, velDefault = 100, noteLen = 1) {
  const len = Math.min(pattern?.length ?? nstep, nstep);
  const out = [];
  for (let i = 0; i < nstep; i++) out.push(fromPulse(i < len ? pattern?.steps?.[i] : null, velDefault));
  if (noteLen > 1)
    for (let i = 0; i < len; i++) {
      if (out[i].time !== ST.NOTE) continue;
      const span = holdLen(pattern, i, len, noteLen);
      for (let k = 1; k < span; k++) out[i + k] = tieStep();
    }
  return out;
}

// A REST step (what clearing a track writes).
export function restStep() {
  return { n: 0, notes: [0, 0, 0, 0], time: ST.REST, flags: 0, vel: 0, hit: 0, acc: 0, hi: 0, chance: 100 };
}

// A TIE step: it holds what the track already plays; it never triggers by itself.
export function tieStep() {
  return { n: 0, notes: [0, 0, 0, 0], time: ST.TIE, flags: 0, vel: 0, hit: 0, acc: 0, hi: 0, chance: 100 };
}
