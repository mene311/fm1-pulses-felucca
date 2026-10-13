# FM-1 Pulses · Felucca

A **Felucca-native fork** of [FM-1 Pulses](https://github.com/mene311/fm1-pulses).
Same browser generator (vanilla JS + Web MIDI, no build step, no dependencies),
but the whole pipeline targets **Felucca's** sequencer over its editor protocol —
no Baud Girl bank, no dot matrix.

**▶ Live:** https://mene311.github.io/fm1-pulses-felucca/

The generator still makes a bank of **16 sequences**; here they map onto
Felucca's storage: **four projects (A–D) × four tracks** — slots 1–4 → A tracks
1–4, 5–8 → B, 9–12 → C, 13–16 → D.

- **4×4 sequence matrix** (projects × tracks), each cell a mini piano roll — tap to select
- **Piano roll** for the selected sequence (pitch rows, beat/bar lines, loop region, playhead); tap a column to select, tap again to place a note
- **Note len** (1–32 steps) — how long each note is: 1 = its own step, more = it **holds across the empty steps until the next note on that track**. Felucca has no per-step length, so a hold is written as **TIE** steps (the firmware extends the note already playing); the roll draws it as a line running on through them
- **Write 16** — the whole pipeline: per project `PROJECT load` → write only the steps that differ (`TRACK_STEP`) → `PROJECT save` (flash, transport stopped)
- **Freeze track** writes the selected sequence into the `dest` track; **Clear track** empties it.
  The `dest` select sits next to Freeze, follows the matrix cell you select (the same track the
  knobs and Play follow) and can be overridden
- **Live split**: Play sends the sequence on the **destination track's channel** — the
  `dest` select next to Freeze, which follows the matrix cell you select and can be
  overridden for a one-off write somewhere else. So Play and Freeze always point at the same
  track. The `play: project` mode plays the selected project's **four sequences at once**,
  sequence p×4+t on channel t+1 — a four-part live performance matching what Write 16 stores.
  Set the unit to **MENU > MIDI > ROUT = CH1-4**; the app reads `ROUT` on every Play and tells
  you what it finds. If the unit is on **SEL** (every channel plays its *selected* track) the app
  selects the destination track on the device itself, so what you play still lands there
  (mid-play it waits for the next Play: switching the unit's track under a held note would
  orphan it)
- **Per-track knobs**: the four tracks are different parts, so each keeps its own knob state (localStorage). Move around the 4×4 matrix and the knobs follow the track you land on; a track that has never been used inherits what is on screen. The five manual preset slots are per track too
- **Per-track preset banks**: the five local preset slots follow the selected sequence's track (T1–T4), so each part keeps its own knob states
- **Play** also carries the channel over BLE; the generator is otherwise unchanged

The protocol codec lives in `js/felucca.js` (`node js/felucca.test.mjs`, 25 checks),
validated against a real FM-1 running Felucca 1.5.1: `INFO` parsing, step
write/read/restore, and the full `PROJECT` load/save cycle.

**Signal chain:** Clock → Gate Probability → S&H → LFO → Distribution → Quantizer → MIDI out → Buffer (Loop + Deja Vu).

## Quick start

It is a **sequence generator**: shape the randomness, generate a 64-step phrase,
and **write** it into Felucca — the FM-1 plays it standalone afterwards.

```bash
python3 -m http.server 8080   # Web MIDI needs a secure context (https or localhost)
```

1. Connect the FM-1 via USB and allow the MIDI permission prompt.
2. Pick **FM-1** in the device dropdown → status turns green.
3. Set your parameters → **Generate ⟳** → **16 distinct sequencers** appear, one
   per FM-1 slot. All 16 are **derived from the one Seed** (16 fresh takes on the
   same parameters, so the bank is reproducible), and you tap a slot to view it.
4. **Drift** is the evolution on top: at **0%** the 16 share the parameters and
   differ only by generation; raise it and the parameters themselves move across
   the bank (slot 1 → slot 16) — more/less amplitude, bias, density, LFO speed…
5. Click a slot in the bank to see its 64-step grid → **Freeze → FM-1** (or `F`)
   writes just that one, or **Send all 16** writes the whole bank. **Clear all 16**
   writes empty patterns over the whole bank, wiping the device's sequencer (it asks
   first, and leaves the browser bank alone).

`←` / `→` move between slots. **Randomize** rolls a new seed + parameters;
**Generate** re-derives the bank from the current seed.

> ### ⚠ Caveat: the FM-1's own sequencer must be **stopped**
>
> The firmware **refuses** a pattern write while its sequencer is playing:
> SysEx `0x20` comes back `status 3` — *"the Sequencer is playing; stop it and
> send again"*. So before freezing, turn **SEQ off** (or STOP) on the device.
> The app reads the reply and shows this if a freeze is refused.
> (`status 1` = value out of range, `2` = damaged in transit.)

Auditioning is the **▶ Play** button: it **loops** the selected slot, and keeps
looping. It plays through a **small built-in FM synth in the browser** *and* sends
MIDI to the FM-1 — so you hear it even with no device attached (the **🔊** button
mutes the browser side only). Clicking a bank slot previews that slot once.
Because the sliders re-derive the bank
in real time, you can **morph the sound while it plays** — change Scale, Gate,
Bias, Drift… and the loop follows on the next step. That makes it a live
generative broadcaster: plug in the FM-1, hit Play, and tweak. Press **■ Stop**
(or Space) to end. This path is unaffected by the freeze caveat.

## Docs

- `DESIGN.md` — full design: modules, signal chain, defaults, UI layout.
- `GOTCHAS.md` — known pitfalls (MIDI timing, BLE latency, tab throttling) and mitigations.

## Scale presets

`presets/scales.json` holds the 20 scale presets. Schema:

```json
{ "id": "dorian", "name": "Dorian", "intervals": [0, 2, 3, 5, 7, 9, 10] }
```

`intervals` are semitone offsets from the root note (C = 0). The `custom` entry has
empty `intervals` — the user fills it via the chromatic toggle grid (persisted to localStorage).

## Structure

```
index.html, manifest.json, sw.js, css/style.css
js/pattern.js    — the SysEx 0x20 encoder (byte-verified vs Virtual-FM-1's codec)
js/generator.js  — LFO → distribution → quantizer → gate → grid snap → Loop
js/midi.js       — Web MIDI: find FM-1, send pattern (reads the reply), notes
js/app.js        — UI wiring: controls, step grid, theme menu, freeze/audition
presets/scales.json
```

## Status

**Working** — generate a 16-slot bank → freeze → the FM-1 plays it standalone.
Live-MIDI audition works too. Themes are the FM-1's own seven (decoded from its
firmware's `BGTHEME` table).
