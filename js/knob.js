// knob.js — physical-feeling controls for the rack panel: a pot with a printed tick
// ring, and an encoder-style panel switch. Pure DOM/SVG, no deps.
//
// Interaction: drag vertically, mouse wheel, arrow keys, double-click to reset,
// hold shift for fine control. touch-action:none keeps a finger drag from scrolling.
// `sens` is the px of vertical travel for the full range (default 180): a knob whose
// interesting values are few (a 0-100% gradient) wants a short one so a phone swipe
// reaches the end.

const NS = "http://www.w3.org/2000/svg";
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const polar = (cx, cy, r, deg) => {
  const a = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};
const SWEEP = 270;
const A0 = -SWEEP / 2;
const A1 = SWEEP / 2;
const SIZES = { lg: 62, md: 50, sm: 40 };

let knobSeq = 0;

export function knob({ label, min, max, step = 1, value = 0, def, size = "md", format, ticks = 10, majorEvery = 5, smallVal = false, onInput, tip = "", onDblClick, sens = 180 }) {
  const px = SIZES[size] || SIZES.md;
  const el = document.createElement("div");
  el.className = `knob k-${size}` + (smallVal ? " k-smallval" : "");
  el.tabIndex = 0;
  el.setAttribute("role", "slider");

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("width", px);
  svg.setAttribute("height", px);

  // printed tick ring. A rotary switch passes ticks = positions-1 and majorEvery 0
  // so there is exactly one detent per position.
  const ring = document.createElementNS(NS, "g");
  for (let k = 0; k <= ticks; k++) {
    const a = A0 + (k / ticks) * SWEEP;
    const major = majorEvery > 0 && k % majorEvery === 0;
    const [x1, y1] = polar(50, 50, 34, a);
    const [x2, y2] = polar(50, 50, major ? 42 : 38, a);
    const l = document.createElementNS(NS, "line");
    l.setAttribute("x1", x1.toFixed(2)); l.setAttribute("y1", y1.toFixed(2));
    l.setAttribute("x2", x2.toFixed(2)); l.setAttribute("y2", y2.toFixed(2));
    l.setAttribute("class", major ? "k-tick major" : "k-tick");
    ring.appendChild(l);
  }
  svg.appendChild(ring);

  // min/max only where there is room to read them
  if (size === "lg") {
    const fmtEnds = format || ((v) => String(Math.round(v)));
    for (const deg of [A0, A1]) {
      const [x, y] = polar(50, 50, 47, deg);
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", x.toFixed(2));
      t.setAttribute("y", (y + 3.4).toFixed(2));
      t.setAttribute("class", "k-end");
      t.setAttribute("text-anchor", "middle");
      t.textContent = fmtEnds(deg === A0 ? min : max);
      svg.appendChild(t);
    }
  }

  // a domed cap: radial gradient from a top-left highlight down to a shaded rim,
  // plus a small drop shadow, so the pot looks like a physical object
  const uid = "cap" + (knobSeq++);
  const defs = document.createElementNS(NS, "defs");
  const grad = document.createElementNS(NS, "radialGradient");
  grad.setAttribute("id", uid);
  grad.setAttribute("cx", "34%"); grad.setAttribute("cy", "27%"); grad.setAttribute("r", "80%");
  const hs = document.createElementNS(NS, "stop");
  hs.setAttribute("offset", "0%"); hs.style.stopColor = "rgba(255,255,255,.22)";
  const ms = document.createElementNS(NS, "stop");
  ms.setAttribute("offset", "52%"); ms.style.stopColor = "#2c2c31";
  const ls = document.createElementNS(NS, "stop");
  ls.setAttribute("offset", "100%"); ls.style.stopColor = "rgba(0,0,0,.5)";
  grad.append(hs, ms, ls);
  defs.appendChild(grad);
  svg.appendChild(defs);

  // the pot: a dark skirt, then a domed cap, then the pointer
  const base = document.createElementNS(NS, "circle");
  base.setAttribute("cx", 50); base.setAttribute("cy", 50); base.setAttribute("r", 29.5);
  base.setAttribute("class", "k-base");
  const cap = document.createElementNS(NS, "circle");
  cap.setAttribute("cx", 50); cap.setAttribute("cy", 50); cap.setAttribute("r", 26);
  cap.setAttribute("class", "k-cap");
  cap.setAttribute("fill", `url(#${uid})`);
  const ptr = document.createElementNS(NS, "line");
  ptr.setAttribute("class", "k-ptr");
  svg.append(base, cap, ptr);

  const lab = document.createElement("div");
  lab.className = "k-lab";
  lab.textContent = label;
  const val = document.createElement("div");
  val.className = "k-val";
  el.append(lab, svg, val);

  const fmt = format || ((v) => (step < 1 ? String(Math.round(v * 100) / 100) : String(Math.round(v))));
  let cur = clamp(value, min, max);
  let dragging = null;

  function paint() {
    const t = max === min ? 0 : (cur - min) / (max - min);
    const ang = A0 + t * SWEEP;
    const [x, y] = polar(50, 50, 25, ang);
    ptr.setAttribute("x1", 50); ptr.setAttribute("y1", 50);
    ptr.setAttribute("x2", x.toFixed(2)); ptr.setAttribute("y2", y.toFixed(2));
    val.textContent = fmt(cur);
    el.title = `${label}: ${fmt(cur)}${tip ? " — " + tip : ""}`;
    el.setAttribute("aria-valuemin", String(min));
    el.setAttribute("aria-valuemax", String(max));
    el.setAttribute("aria-valuenow", String(cur));
  }

  function set(v, fire = true) {
    let n = clamp(Number(v) || 0, min, max);
    if (step > 0) n = clamp(Math.round(n / step) * step, min, max);
    if (n === cur) { paint(); return; }
    cur = n;
    paint();
    if (fire && onInput) onInput(cur);
  }

  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dragging = { y: e.clientY, v: cur };
    el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
  });
  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const range = max - min;
    const travel = e.shiftKey ? sens * 5 : sens;   // px of travel for the full range
    set(dragging.v + (dragging.y - e.clientY) / travel * range);
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = null;
    el.classList.remove("dragging");
    try { el.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  };
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);

  el.addEventListener("wheel", (e) => { e.preventDefault(); set(cur + (e.deltaY < 0 ? 1 : -1) * step); }, { passive: false });
  el.addEventListener("dblclick", () => { if (onDblClick) onDblClick(); else if (def != null) set(def); });
  el.addEventListener("keydown", (e) => {
    const mult = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); set(cur + step * mult); }
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); set(cur - step * mult); }
    else if (e.key === "Home") { e.preventDefault(); set(min); }
    else if (e.key === "End") { e.preventDefault(); set(max); }
  });

  paint();
  el.setValue = (v, fire) => set(v, fire);
  el.setRange = (lo, hi) => {
    min = lo; max = hi;
    if (cur > max) set(max); else if (cur < min) set(min); else paint();
  };
  Object.defineProperty(el, "value", { get: () => cur });
  return el;
}

// An encoder-style panel switch: ‹ value › . Replaces native <select> so nothing
// in the panel looks like browser chrome.
export function sw({ label, options, value, onInput }) {
  const el = document.createElement("div");
  el.className = "sw";
  el.tabIndex = 0;
  el.setAttribute("role", "listbox");

  const lab = document.createElement("div");
  lab.className = "sw-lab";
  lab.textContent = label;
  const body = document.createElement("div");
  body.className = "sw-body";
  const prev = document.createElement("button");
  prev.type = "button"; prev.className = "sw-arrow"; prev.textContent = "‹";
  const val = document.createElement("span");
  val.className = "sw-val";
  const next = document.createElement("button");
  next.type = "button"; next.className = "sw-arrow"; next.textContent = "›";
  body.append(prev, val, next);
  el.append(lab, body);

  let idx = Math.max(0, options.findIndex((o) => String(o.v) === String(value)));
  const paint = () => {
    const o = options[idx];
    val.textContent = o?.t ?? "";
    el.title = `${label}: ${o?.title ?? o?.t ?? ""}`;
  };
  const move = (d) => {
    idx = (idx + d + options.length) % options.length;
    paint();
    if (onInput) onInput(options[idx].v);
  };
  prev.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  el.addEventListener("wheel", (e) => { e.preventDefault(); move(e.deltaY < 0 ? -1 : 1); }, { passive: false });
  el.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); move(-1); }
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); move(1); }
  });
  el.setValue = (v) => {
    const i = options.findIndex((o) => String(o.v) === String(v));
    if (i >= 0) { idx = i; paint(); }
  };
  paint();
  return el;
}

// A latching panel toggle.
export function toggle({ label, value = false, onInput }) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "toggle" + (value ? " on" : "");
  el.textContent = label;
  el.addEventListener("click", () => {
    const on = !el.classList.contains("on");
    el.classList.toggle("on", on);
    if (onInput) onInput(on);
  });
  el.setValue = (v) => el.classList.toggle("on", !!v);
  return el;
}
