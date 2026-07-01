/* ---------------- modal open/close ---------------- */
const synthBar = document.getElementById('synthBar');
const synthOverlay = document.getElementById('synthOverlay');
const synthClose = document.getElementById('synthClose');
const barPlayBtn = document.getElementById('barPlayBtn');

function openModal(){
  synthOverlay.classList.add('open');
  resizeCanvas();
  requestAnimationFrame(refreshAllScrollEdges);
}
function closeModal(){
  synthOverlay.classList.remove('open');
  closeFMPopup();
  closeFxPopup();
}

synthBar.addEventListener('click', (e)=>{
  if(e.target === barPlayBtn || barPlayBtn.contains(e.target)) return;
  openModal();
});
synthClose.addEventListener('click', closeModal);
document.getElementById('synthDone').addEventListener('click', closeModal);
synthOverlay.addEventListener('click', (e)=>{
  if(e.target === synthOverlay) closeModal();
});

/* ---------------- nav scroll-fade ---------------- */
// Fade the fixed top banner out as the page scrolls, so it never sits over
// content scrolling up beneath it.
const navEl = document.querySelector('.nav');
const bgScopeEl = document.getElementById('bgScope');
const NAV_FADE_PX = 90; // fully faded before content scrolls up into the banner
const SCOPE_BASE_OPACITY = 0.55; // matches the original #bgScope opacity
// When the user STARTS playback while at the top, we want to force the nav out
// and bring the waveform in — same end-state as scrolling down. CSS transitions
// (added to .nav + #bgScope) make this a smooth cross-fade.
let playFadeOverride = false; // true while running — drives nav→0, scope→full
function updateNavFade(){
  const scrollO = Math.max(0, 1 - window.scrollY / NAV_FADE_PX);
  const navO = playFadeOverride ? 0 : scrollO;
  navEl.style.opacity = navO.toFixed(3);
  if(bgScopeEl) bgScopeEl.style.opacity = (SCOPE_BASE_OPACITY * (1 - navO)).toFixed(3);
}
function setPlayFadeOverride(on){ playFadeOverride = on; updateNavFade(); }
window.addEventListener('scroll', updateNavFade, { passive: true });
updateNavFade();

/* ---------------- FM per-step popup ---------------- */
const fmPopup = document.getElementById('fmPopup');
const fmPopupStep = document.getElementById('fmPopupStep');
const fmPopupClose = document.getElementById('fmPopupClose');
const fmRatioInput = document.getElementById('fmRatioInput');
const fmIndexInput = document.getElementById('fmIndexInput');
const fmRatioVal = document.getElementById('fmRatioVal');
const fmIndexVal = document.getElementById('fmIndexVal');
let fmPopupStepIdx = -1;

function openFMPopup(stepIdx, anchorEl){
  if(acidInstrument !== 'fm') return;
  fmPopupStepIdx = stepIdx;
  const bar = Math.floor(stepIdx / STEPS) + 1;
  const stepInBar = (stepIdx % STEPS) + 1;
  fmPopupStep.textContent = `bar ${bar} · step ${stepInBar}`;
  fmRatioInput.value = FM_RATIO[stepIdx];
  fmIndexInput.value = FM_INDEX[stepIdx];
  fmRatioVal.textContent = (+FM_RATIO[stepIdx]).toFixed(2);
  fmIndexVal.textContent = FM_INDEX[stepIdx];
  fmPopup.hidden = false;
  positionPopupAbove(fmPopup, anchorEl);
}

// position `popup` above `anchorEl`, centred horizontally, relative to the
// .synth-modal that contains them; falls back below if there's no room above.
// Uses offset* values (layout coords) rather than getBoundingClientRect: the
// page has `body { zoom: 1.25 }`, which scales BCR but NOT offset*/style.left,
// so mixing the two pushes the popup off the right edge of the modal.
function positionPopupAbove(popup, anchorEl){
  const modal = anchorEl.closest('.synth-modal');
  let aLeft = 0, aTop = 0;
  for(let el = anchorEl; el && el !== modal; el = el.offsetParent){
    aLeft += el.offsetLeft;
    aTop += el.offsetTop;
  }
  const aW = anchorEl.offsetWidth, aH = anchorEl.offsetHeight;
  const pW = popup.offsetWidth, pH = popup.offsetHeight;
  const mW = modal.clientWidth;
  let left = aLeft + aW/2 - pW/2;
  let top = aTop - pH - 8;
  if(top < 4) top = aTop + aH + 8;
  left = Math.max(8, Math.min(mW - pW - 8, left));
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';
}
function closeFMPopup(){
  fmPopup.hidden = true;
  fmPopupStepIdx = -1;
}
fmPopupClose.addEventListener('click', closeFMPopup);
fmRatioInput.addEventListener('input', ()=>{
  if(fmPopupStepIdx < 0) return;
  const v = +fmRatioInput.value;
  FM_RATIO[fmPopupStepIdx] = v;
  fmRatioVal.textContent = v.toFixed(2);
  saveStateSoon();
});
fmIndexInput.addEventListener('input', ()=>{
  if(fmPopupStepIdx < 0) return;
  const v = +fmIndexInput.value;
  FM_INDEX[fmPopupStepIdx] = v;
  fmIndexVal.textContent = v;
  saveStateSoon();
});
// click outside the popup closes it
document.addEventListener('pointerdown', (e)=>{
  if(fmPopup.hidden) return;
  if(fmPopup.contains(e.target)) return;
  if(e.target.classList && e.target.classList.contains('step-pitch')) return;
  closeFMPopup();
}, true);
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape') closeModal();
  if((e.code === 'Space' || e.key === ' ') && !['INPUT','TEXTAREA'].includes(e.target.tagName)){
    e.preventDefault();
    e.stopPropagation();
    if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
    handleToggle();
  }
}, true);

/* ---------------- FX bus popups (right-click on the FX BUS knobs) ---------------- */
const delayFxPopup = document.getElementById('delayFxPopup');
const reverbFxPopup = document.getElementById('reverbFxPopup');

// One row per slider in an FX popup. fmt(v) → label text · cur() → current
// state for popup-open sync · apply(v) → push to the live audio graph.
// Adding a new param = appending one row.
const FX_BINDINGS = [
  { popup: delayFxPopup,  inputId: 'delayFbInput',     valId: 'delayFbVal',     fmt: v => v,                   cur: () => delayFbValue,
    apply: v => { delayFbValue = v; if(delayFbRef) delayFbRef.gain.value = v / 100; } },
  { popup: delayFxPopup,  inputId: 'delayStepsInput',  valId: 'delayStepsVal',  fmt: v => DELAY_DIVS[v].label, cur: () => delayDivIndex,
    apply: v => { delayDivIndex = v; if(delayNodeRef) delayNodeRef.delayTime.setTargetAtTime(STEP_SECONDS * delayMultiplier(), ctx.currentTime, 0.03); } },
  { popup: delayFxPopup,  inputId: 'delayToneInput',   valId: 'delayToneVal',   fmt: v => v,                   cur: () => delayTone,
    apply: v => { delayTone = v; if(delayDampRef) delayDampRef.frequency.setTargetAtTime(v, ctx.currentTime, 0.03); } },
  { popup: reverbFxPopup, inputId: 'reverbSizeInput',  valId: 'reverbSizeVal',  fmt: v => v.toFixed(1),        cur: () => reverbSize,
    apply: v => { reverbSize = v; if(reverbConvolverRef) reverbConvolverRef.buffer = makeImpulseResponse(ctx, reverbSize, reverbDecay); } },
  { popup: reverbFxPopup, inputId: 'reverbDecayInput', valId: 'reverbDecayVal', fmt: v => v.toFixed(1),        cur: () => reverbDecay,
    apply: v => { reverbDecay = v; if(reverbConvolverRef) reverbConvolverRef.buffer = makeImpulseResponse(ctx, reverbSize, reverbDecay); } },
].map(b => {
  b.input = document.getElementById(b.inputId);
  b.val   = document.getElementById(b.valId);
  b.input.addEventListener('input', () => {
    const v = +b.input.value;
    b.val.textContent = b.fmt(v);
    b.apply(v);
    saveStateSoon();
  });
  return b;
});

function openFxPopup(popup, anchorEl){
  closeFxPopup();
  FX_BINDINGS.forEach(b => {
    if(b.popup !== popup) return;
    const v = b.cur();
    b.input.value = v;
    b.val.textContent = b.fmt(v);
  });
  popup.hidden = false;
  positionPopupAbove(popup, anchorEl);
}
function closeFxPopup(){
  delayFxPopup.hidden = true;
  reverbFxPopup.hidden = true;
}
[delayFxPopup, reverbFxPopup].forEach(p =>
  p.querySelector('.fm-popup-close').addEventListener('click', closeFxPopup));

// outside-click closes any open FX popup; right-clicks on the bus knobs
// re-open via contextmenu, so don't treat those clicks as "outside".
document.addEventListener('pointerdown', (e) => {
  if(delayFxPopup.hidden && reverbFxPopup.hidden) return;
  if(delayFxPopup.contains(e.target) || reverbFxPopup.contains(e.target)) return;
  if(e.target.closest && e.target.closest('.seq-bus-sends .knob')) return;
  closeFxPopup();
}, true);

/* ---------------- step sequencer ---------------- */
let ctx = null;
let masterGain = null;
let analyser = null;
let running = false;
let droneNodes = [];
let delayReturn = null;
let reverbReturn = null;
const trackGains = {};
const trackDelaySends = {};
const trackReverbSends = {};
const trackSendKnobs = {}; // { [id]: { delay, reverb } } — set during the track-row build; used by randomize

const TRACK_SEND_DEFAULTS = {
  kick:  { delay: 0,  reverb: 8  },
  snare: { delay: 10, reverb: 22 },
  hat:   { delay: 6,  reverb: 30 },
  acid:  { delay: 30, reverb: 16 },
};
// live mirror of each track's send levels (kept in sync by the knobs) so the
// offline export reflects the current mix even before audio has started.
const trackSendValues = {};
Object.keys(TRACK_SEND_DEFAULTS).forEach(id=>{
  trackSendValues[id] = { ...TRACK_SEND_DEFAULTS[id] };
});

const STEPS = 16;        // steps per bar (page size) — the visual grid is always 16
const MAX_BARS = 4;
let numBars = 1;         // sequence length in bars: 1 | 2 | 4
let currentBar = 0;      // the bar currently viewed/edited in the modal grid
function totalSteps(){ return STEPS * numBars; }
function absStep(s){ return currentBar * STEPS + s; } // visual 0–15 → absolute index
let TEMPO_BPM = 140;
let STEP_SECONDS = 60 / TEMPO_BPM / 4;
// Swing: 50 = straight; 75 = max shuffle. Delays every weak 16th (odd absolute
// step) by a fraction of STEP_SECONDS — bar duration stays the same.
let swingPct = 50;
// ADSR scaling: 0 = voice envelopes as authored; 100 = ENV_MAX_MULT× as slow.
// Multiplies the time-literals inside playKick/Snare/Hat/Acid/FM (see envMult()).
let adsrScale = 0;
const ENV_MAX_MULT = 5;
function envMult(){ return 1 + (adsrScale / 100) * (ENV_MAX_MULT - 1); }
// Synths get a wider ceiling than drums — at adsr=100 the acid/FM release
// stretches 10× instead of 5×, so notes can sustain past the next step.
const SYNTH_ENV_MAX_MULT = 10;
function synthEnvMult(){ return 1 + (adsrScale / 100) * (SYNTH_ENV_MAX_MULT - 1); }
let delayNodeRef = null;
let delayFbRef = null;          // delay feedback gain — mutated by the delay FX popup
let delayDampRef = null;        // delay tone (lowpass) filter — mutated by the delay FX popup
let reverbConvolverRef = null;  // reverb convolver — buffer is replaced when size/decay change
// FX bus return levels (0–100) — formerly the DELAY / REVERB sliders, now knobs.
let delayBusValue = 22;
let reverbBusValue = 28;
// Internal FX parameters, surfaced via the right-click popups on the bus knobs.
let delayFbValue = 42;          // feedback %
// Delay time is tempo-locked to one of these note divisions. Each entry's
// `steps` is the multiplier on STEP_SECONDS (one 16th), so 1/32 = half a 16th,
// 1/16 = one 16th, … 1 = whole note (16 sixteenths).
const DELAY_DIVS = [
  { label: '1/32', steps: 0.5 },
  { label: '1/16', steps: 1   },
  { label: '1/8',  steps: 2   },
  { label: '3/16', steps: 3   },
  { label: '1/4',  steps: 4   },
  { label: '3/8',  steps: 6   },
  { label: '1/2',  steps: 8   },
  { label: '3/4',  steps: 12  },
  { label: '1',    steps: 16  },
];
let delayDivIndex = 3;          // default 3/16 (matches the previous numeric default of 3)
function delayMultiplier(){ return DELAY_DIVS[delayDivIndex].steps; }
let delayTone = 3200;           // damping LPF cutoff (Hz)
let reverbSize = 2.6;           // IR length seconds
let reverbDecay = 2.8;          // IR decay factor

const TRACKS = [
  { id:'kick',  label:'KICK'  },
  { id:'snare', label:'SNARE' },
  { id:'hat',   label:'HAT'   },
  { id:'acid',  label:'ACID'  },
];

const DEFAULT_PATTERN = {
  kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
  snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
  hat:   [1,0,1,0, 1,0,1,1, 1,0,1,0, 1,0,1,1],
  acid:  [1,1,0,1, 0,0,1,0, 1,1,0,0, 1,0,1,0],
};

const ACID_ACCENT = [1,0,0,0, 0,0,1,0, 0,1,0,0, 0,0,0,0];
const ACID_NOTES = [36,36,39,41, 36,36,43,36, 39,39,36,36, 44,36,41,39];
const ACID_NOTE_MIN = 12; // C0
const ACID_NOTE_MAX = 72; // C5

// FM voice — 2-operator sine FM, per-step ratio + index
let acidInstrument = 'acid'; // 'acid' | 'fm'
const FM_RATIO = new Array(STEPS).fill(2);    // modulator : carrier
const FM_INDEX = new Array(STEPS).fill(120);  // modulation index (0–400)

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function noteName(m){ return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }

const pattern = {};
TRACKS.forEach(t => pattern[t.id] = DEFAULT_PATTERN[t.id].slice());

const trackMute = {};
const trackSolo = {};
const muteButtons = {};
// Per-track transposition in semitones, range -12..+12 (±1 octave). Applied as
// a frequency multiplier inside each voice fn: 2^(semitones/12). Synths shift
// the MIDI note before midiToFreq; drums multiply their oscillator frequencies.
const trackTranspose = { kick: 0, snare: 0, hat: 0, acid: 0 };
const transposeCtls = {}; // octave-pill controllers, populated below; used by loadState/randomize
function trackPitchMult(id){ return Math.pow(2, (trackTranspose[id] || 0) / 12); }
TRACKS.forEach(t => { trackMute[t.id] = false; trackSolo[t.id] = false; });
function unmuteAll(){
  TRACKS.forEach(t => {
    if(trackMute[t.id]){
      trackMute[t.id] = false;
      muteButtons[t.id]?.classList.remove('active');
    }
  });
  saveStateSoon();
}
document.getElementById('unmuteAllBtn').addEventListener('click', unmuteAll);
function trackAudible(id){
  const anySolo = TRACKS.some(t => trackSolo[t.id]);
  if(anySolo) return trackSolo[id]; // solo overrides mute on the soloed track
  return !trackMute[id];
}

/* ---- state persistence (localStorage) ---- */
// Mirror creative state to localStorage so a refresh doesn't wipe the pattern.
// Writes coalesce via rAF, so calling saveStateSoon() on every mutation is cheap
// even during rapid drags. loadState mutates arrays in place to preserve the
// references already captured in closures and DOM build code below.
const STATE_KEY = 'modwav-state-v1';
function saveStateNow(){
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      v: 1,
      // While evolving, persist the FROZEN user pattern, not the live mutating
      // buffer. Reload restores what the user authored, not a midstream evolve
      // snapshot. Everything outside that snapshot (numBars, tempo, fx, etc.)
      // is still saved from live state — evolve doesn't touch them.
      pattern:   evolving && preEvolveSnapshot ? { kick: preEvolveSnapshot.kick, snare: preEvolveSnapshot.snare, hat: preEvolveSnapshot.hat, acid: preEvolveSnapshot.acid } : pattern,
      acidNotes: evolving && preEvolveSnapshot ? preEvolveSnapshot.acidNotes : ACID_NOTES,
      acidAccent: ACID_ACCENT,
      fmRatio:   evolving && preEvolveSnapshot ? preEvolveSnapshot.fmRatio : FM_RATIO,
      fmIndex:   evolving && preEvolveSnapshot ? preEvolveSnapshot.fmIndex : FM_INDEX,
      numBars, currentBar, tempo: TEMPO_BPM, swing: swingPct, adsr: adsrScale, acidInstrument,
      trackSends: evolving && preEvolveSnapshot ? preEvolveSnapshot.sends : trackSendValues,
      trackMute, trackSolo, trackTranspose,
      fx: {
        delayBus: delayBusValue, reverbBus: reverbBusValue,
        delayFb: delayFbValue, delayDiv: delayDivIndex, delayTone,
        reverbSize, reverbDecay,
      },
    }));
  } catch(_) { /* quota or disabled — silent */ }
}
let _saveScheduled = false;
function saveStateSoon(){
  if(_saveScheduled) return;
  _saveScheduled = true;
  requestAnimationFrame(() => { _saveScheduled = false; saveStateNow(); });
}
// Flush any pending save when the page is about to hide (reload, tab close,
// nav away, mobile background). pagehide fires more reliably than
// beforeunload, especially on iOS Safari.
addEventListener('pagehide', () => { if(_saveScheduled) saveStateNow(); });
addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'hidden' && _saveScheduled) saveStateNow();
});
(function loadState(){
  let s;
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if(!raw) return;
    s = JSON.parse(raw);
    if(!s || s.v !== 1) return;
  } catch(_) { return; }
  const replaceArr = (target, src) => {
    if(!Array.isArray(src)) return;
    target.length = 0;
    target.push(...src);
  };
  if(s.pattern) Object.keys(pattern).forEach(id => replaceArr(pattern[id], s.pattern[id]));
  replaceArr(ACID_NOTES,  s.acidNotes);
  replaceArr(ACID_ACCENT, s.acidAccent);
  replaceArr(FM_RATIO,    s.fmRatio);
  replaceArr(FM_INDEX,    s.fmIndex);
  if([1,2,4].includes(s.numBars)) numBars = s.numBars;
  if(typeof s.currentBar === 'number') currentBar = Math.max(0, Math.min(numBars - 1, s.currentBar));
  if(typeof s.tempo === 'number'){
    TEMPO_BPM = Math.max(60, Math.min(180, Math.round(s.tempo)));
    STEP_SECONDS = 60 / TEMPO_BPM / 4;
  }
  if(typeof s.swing === 'number') swingPct = Math.max(50, Math.min(75, Math.round(s.swing)));
  if(typeof s.adsr === 'number') adsrScale = Math.max(0, Math.min(100, Math.round(s.adsr)));
  if(s.acidInstrument === 'fm' || s.acidInstrument === 'acid') acidInstrument = s.acidInstrument;
  if(s.trackSends) Object.keys(trackSendValues).forEach(id => {
    if(s.trackSends[id]) Object.assign(trackSendValues[id], s.trackSends[id]);
  });
  if(s.trackMute) Object.assign(trackMute, s.trackMute);
  if(s.trackSolo) Object.assign(trackSolo, s.trackSolo);
  if(s.trackTranspose) Object.keys(trackTranspose).forEach(id => {
    const v = s.trackTranspose[id];
    if(typeof v === 'number') trackTranspose[id] = Math.max(-12, Math.min(12, Math.round(v)));
  });
  if(s.fx){
    const fx = s.fx;
    if(typeof fx.delayBus === 'number')   delayBusValue  = fx.delayBus;
    if(typeof fx.reverbBus === 'number')  reverbBusValue = fx.reverbBus;
    if(typeof fx.delayFb === 'number')    delayFbValue   = fx.delayFb;
    if(typeof fx.delayDiv === 'number' && fx.delayDiv >= 0 && fx.delayDiv < DELAY_DIVS.length) delayDivIndex = fx.delayDiv;
    if(typeof fx.delayTone === 'number')  delayTone      = fx.delayTone;
    if(typeof fx.reverbSize === 'number') reverbSize     = fx.reverbSize;
    if(typeof fx.reverbDecay === 'number') reverbDecay   = fx.reverbDecay;
  }
})();

/* ---- build mini bar sequencer ---- */
const barSeqEl = document.getElementById('barSeq');
TRACKS.forEach((track, ti)=>{
  const row = document.createElement('div');
  row.className = 'bar-seq-row';
  row.dataset.track = ti;
  for(let s=0; s<STEPS; s++){
    const dot = document.createElement('div');
    dot.className = 'bar-step';
    dot.dataset.track = track.id;
    dot.dataset.step = s;
    if(pattern[track.id][s]) dot.classList.add('on');
    row.appendChild(dot);
  }
  barSeqEl.appendChild(row);
});

/* ---- build modal sequencer grid ---- */
const seqEl = document.getElementById('seq');
const instButtons = {};
function setAcidInstrument(name){
  acidInstrument = name;
  if(instButtons.acid) instButtons.acid.classList.toggle('active', name === 'acid');
  if(instButtons.fm) instButtons.fm.classList.toggle('active', name === 'fm');
  if(name !== 'fm' && typeof closeFMPopup === 'function') closeFMPopup();
  saveStateSoon();
}

TRACKS.forEach((track, ti)=>{
  const label = document.createElement('div');
  label.className = 'seq-label mono';
  if(track.id === 'acid'){
    const toggle = document.createElement('div');
    toggle.className = 'inst-toggle';
    const a = document.createElement('button');
    a.type = 'button'; a.textContent = 'ACID'; a.className = 'inst-btn active';
    a.addEventListener('click', ()=>setAcidInstrument('acid'));
    const f = document.createElement('button');
    f.type = 'button'; f.textContent = 'FM'; f.className = 'inst-btn';
    f.addEventListener('click', ()=>setAcidInstrument('fm'));
    instButtons.acid = a; instButtons.fm = f;
    toggle.append(a, f);
    label.append(toggle);
  } else {
    const text = document.createElement('span');
    text.textContent = track.label;
    label.appendChild(text);
  }
  const ctrl = document.createElement('div');
  ctrl.className = 'track-ctrl';
  const muteBtn = document.createElement('button');
  muteBtn.type = 'button';
  muteBtn.className = 'track-ctrl-btn mute';
  muteBtn.textContent = 'M';
  muteBtn.title = `mute ${track.label}`;
  muteBtn.classList.toggle('active', trackMute[track.id]); // reflect loaded state
  muteBtn.addEventListener('click', ()=>{
    trackMute[track.id] = !trackMute[track.id];
    muteBtn.classList.toggle('active', trackMute[track.id]);
    saveStateSoon();
  });
  muteButtons[track.id] = muteBtn;
  const soloBtn = document.createElement('button');
  soloBtn.type = 'button';
  soloBtn.className = 'track-ctrl-btn solo';
  soloBtn.textContent = 'S';
  soloBtn.title = `solo ${track.label}`;
  soloBtn.classList.toggle('active', trackSolo[track.id]); // reflect loaded state
  soloBtn.addEventListener('click', ()=>{
    trackSolo[track.id] = !trackSolo[track.id];
    soloBtn.classList.toggle('active', trackSolo[track.id]);
    saveStateSoon();
  });
  ctrl.append(muteBtn, soloBtn);
  label.appendChild(ctrl);
  seqEl.appendChild(label);
  // OCT pill goes into its own grid cell (column 2), separate from .track-ctrl.
  // Keeps M/S aligned with the unmute-all button above and leaves the label
  // cell wide enough for ACID+FM.
  const oct = makeOctavePill(track.id);
  transposeCtls[track.id] = oct;
  const octCell = document.createElement('div');
  octCell.className = 'seq-oct-cell';
  octCell.appendChild(oct.el);
  seqEl.appendChild(octCell);

  const row = document.createElement('div');
  row.className = 'seq-row';
  row.dataset.track = ti;
  for(let s=0; s<STEPS; s++){
    const btn = document.createElement('button');
    btn.className = 'step';
    btn.dataset.track = track.id;
    btn.dataset.step = s;
    if(s % 4 === 0) btn.dataset.beat = '0';
    if(pattern[track.id][s]) btn.classList.add('on');

    function toggleStep(){
      const i = absStep(s);
      pattern[track.id][i] = pattern[track.id][i] ? 0 : 1;
      btn.classList.toggle('on');
      // mirror to the mini-grid only if it's currently showing this (edited) bar
      if(miniGridBar === currentBar){
        const barStep = barSeqEl.querySelector(`.bar-step[data-track="${track.id}"][data-step="${s}"]`);
        if(barStep) barStep.classList.toggle('on', !!pattern[track.id][i]);
      }
      saveStateSoon();
    }

    if(track.id === 'acid'){
      // acid steps carry a per-step pitch; drag up/down to retune, click to toggle
      btn.classList.add('step-pitch');
      const noteLabel = document.createElement('span');
      noteLabel.className = 'note-name mono';
      noteLabel.textContent = noteName(ACID_NOTES[absStep(s)]);
      btn.appendChild(noteLabel);

      let dragging = false, axis = null, moved = false;
      let startX = 0, startY = 0, startNote = 0;
      let longPressTimer = null, longPressed = false;
      const PX_PER_SEMITONE = 8;
      const AXIS_THRESHOLD = 6;

      btn.addEventListener('pointerdown', (e)=>{
        if(e.button !== 0) return; // ignore right/middle click — contextmenu handles it
        dragging = true; axis = null; moved = false; longPressed = false;
        startX = e.clientX; startY = e.clientY;
        startNote = ACID_NOTES[absStep(s)];
        longPressTimer = setTimeout(()=>{
          if(!moved){ longPressed = true; openFMPopup(absStep(s), btn); }
        }, 450);
      });
      btn.addEventListener('pointermove', (e)=>{
        if(!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if(axis === null){
          if(Math.abs(dx) < AXIS_THRESHOLD && Math.abs(dy) < AXIS_THRESHOLD) return;
          axis = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
          moved = true;
          if(longPressTimer){ clearTimeout(longPressTimer); longPressTimer = null; }
          if(axis === 'y'){
            try { btn.setPointerCapture(e.pointerId); } catch(_){}
          } else {
            // committed to horizontal scroll — release the gesture to the row
            dragging = false;
            return;
          }
        }
        if(axis !== 'y') return;
        const semis = Math.round((startY - e.clientY) / PX_PER_SEMITONE);
        const next = Math.max(ACID_NOTE_MIN, Math.min(ACID_NOTE_MAX, startNote + semis));
        const i = absStep(s);
        if(next !== ACID_NOTES[i]){
          ACID_NOTES[i] = next;
          noteLabel.textContent = noteName(next);
          saveStateSoon();
        }
        e.preventDefault();
      });
      btn.addEventListener('pointerup', (e)=>{
        // pointerdown only sets dragging for a left press, so a right-click
        // (contextmenu / FM popup) leaves it false — don't let pointerup toggle.
        const wasLeftPress = dragging;
        if(longPressTimer){ clearTimeout(longPressTimer); longPressTimer = null; }
        dragging = false;
        try { btn.releasePointerCapture(e.pointerId); } catch(_){}
        if(wasLeftPress && !moved && !longPressed) toggleStep();
      });
      btn.addEventListener('pointercancel', ()=>{
        if(longPressTimer){ clearTimeout(longPressTimer); longPressTimer = null; }
        dragging = false; axis = null;
      });
      btn.addEventListener('contextmenu', (e)=>{
        e.preventDefault();
        openFMPopup(absStep(s), btn);
      });
    } else {
      btn.addEventListener('click', toggleStep);
    }
    row.appendChild(btn);
  }
  const rowScroll = document.createElement('div');
  rowScroll.className = 'seq-row-scroll';
  rowScroll.appendChild(row);
  const rowFrame = document.createElement('div');
  rowFrame.className = 'seq-row-frame at-start';
  rowFrame.appendChild(rowScroll);
  rowScroll.addEventListener('scroll', ()=>updateScrollEdges(rowScroll, rowFrame), { passive: true });
  seqEl.appendChild(rowFrame);

  const sends = document.createElement('div');
  sends.className = 'send-knobs';
  // trackSendValues is the source of truth (defaults seeded at module load,
  // possibly overwritten by loadState); the knob's initial angle follows it.
  const initial = trackSendValues[track.id];
  const delayKnob = makeKnob(initial.delay, (v)=>{
    trackSendValues[track.id].delay = v;
    if(trackDelaySends[track.id]) trackDelaySends[track.id].gain.value = v / 100;
  }, `${track.label} → delay send`);
  const reverbKnob = makeKnob(initial.reverb, (v)=>{
    trackSendValues[track.id].reverb = v;
    if(trackReverbSends[track.id]) trackReverbSends[track.id].gain.value = v / 100;
  }, `${track.label} → reverb send`);
  sends.appendChild(delayKnob);
  sends.appendChild(reverbKnob);
  trackSendKnobs[track.id] = { delay: delayKnob, reverb: reverbKnob };
  seqEl.appendChild(sends);
});

// FX-bus return row — delay/reverb return knobs aligned under the per-track
// send columns (same 3rd grid column + .send-knobs structure).
{
  const busLabel = document.createElement('div');
  busLabel.className = 'seq-label seq-bus-label mono';
  busLabel.innerHTML = '<span>FX BUS</span>';
  seqEl.appendChild(busLabel);

  // OCT column has no bus control — empty placeholder cell keeps the grid aligned.
  const octSpacer = document.createElement('div');
  octSpacer.className = 'seq-bus-spacer';
  seqEl.appendChild(octSpacer);

  const spacer = document.createElement('div'); // occupies the steps column
  spacer.className = 'seq-bus-spacer';
  seqEl.appendChild(spacer);

  const busSends = document.createElement('div');
  busSends.className = 'send-knobs seq-bus-sends';
  const delayBusKnob = makeKnob(delayBusValue, (v)=>{
    delayBusValue = v;
    if(delayReturn) delayReturn.gain.value = v / 100;
  }, 'delay return level (right-click for FX params)');
  const reverbBusKnob = makeKnob(reverbBusValue, (v)=>{
    reverbBusValue = v;
    if(reverbReturn) reverbReturn.gain.value = v / 100;
  }, 'reverb return level (right-click for FX params)');
  // right-click opens the bus's internal-params popup (FB/STEPS/TONE for delay;
  // SIZE/DECAY for reverb). long-press on touch fires the same popup.
  function attachFxRightClick(knob, popup){
    const open = () => openFxPopup(popup, knob);
    knob.addEventListener('contextmenu', e => { e.preventDefault(); open(); });
    let lpTimer = null;
    knob.addEventListener('pointerdown', e => {
      if(e.pointerType === 'touch') lpTimer = setTimeout(open, 450);
    });
    const clearLP = () => { if(lpTimer){ clearTimeout(lpTimer); lpTimer = null; } };
    knob.addEventListener('pointerup', clearLP);
    knob.addEventListener('pointercancel', clearLP);
    knob.addEventListener('pointermove', clearLP);
  }
  attachFxRightClick(delayBusKnob, delayFxPopup);
  attachFxRightClick(reverbBusKnob, reverbFxPopup);
  busSends.appendChild(delayBusKnob);
  busSends.appendChild(reverbBusKnob);
  seqEl.appendChild(busSends);
}

/* ---- pages: 1/2/4-bar length + page navigation ---- */
// The five per-step arrays grow/shrink to STEPS * numBars. The visual grid is
// always 16 steps showing currentBar; the mini-grid shows whichever bar is
// playing (during playback) or being edited (when stopped).
const PLOCK_ARRAYS = () => [pattern.kick, pattern.snare, pattern.hat, pattern.acid, ACID_NOTES, ACID_ACCENT, FM_RATIO, FM_INDEX];
let miniGridBar = 0;   // which bar the bottom mini-grid currently displays
let playingBar = -1;   // bar the scheduler is currently on (-1 when stopped)
// While the scheduler is running, ÷2/×2 queue here and the scheduler applies
// the change at the next bar boundary — so the currently audible bar is never
// cut off and there's always a next bar to land on.
let pendingLengthChange = null; // 'halve' | 'double' | null

const pageDotsEl = document.getElementById('pageDots');
const halveBtn = document.getElementById('halveBtn');
const doubleBtn = document.getElementById('doubleBtn');
const exportHeadEl = document.getElementById('exportHead');

// re-sync the bottom mini-grid's on/off to a given bar's slice
function renderMiniGrid(bar){
  miniGridBar = bar;
  document.querySelectorAll('#barSeq .bar-step').forEach(el=>{
    const id = el.dataset.track;
    const s = +el.dataset.step;
    el.classList.toggle('on', !!pattern[id][bar * STEPS + s]);
  });
}

// re-sync the 16 visual modal buttons (+ acid note labels) to currentBar.
// Intentionally does NOT touch the mini-grid: that one follows the last-played
// bar at all times (during play it tracks playingBar; when stopped it stays
// where it was).
function renderPage(){
  document.querySelectorAll('#seq .step').forEach(btn=>{
    const track = btn.dataset.track;
    const s = +btn.dataset.step;
    const i = currentBar * STEPS + s;
    btn.classList.toggle('on', !!pattern[track][i]);
    if(track === 'acid'){
      const lbl = btn.querySelector('.note-name');
      if(lbl) lbl.textContent = noteName(ACID_NOTES[i]);
    }
  });
  renderPageDots();
}

function renderPageDots(){
  pageDotsEl.replaceChildren();
  for(let b=0; b<numBars; b++){
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'page-dot';
    dot.dataset.bar = b;
    dot.title = `bar ${b + 1}`;
    if(b === currentBar) dot.classList.add('viewing');
    if(b === playingBar) dot.classList.add('playing');
    dot.addEventListener('click', ()=>setCurrentBar(b));
    pageDotsEl.appendChild(dot);
  }
  halveBtn.disabled = numBars <= 1;
  doubleBtn.disabled = numBars >= MAX_BARS;
  if(exportHeadEl) exportHeadEl.textContent = `Take it home — ${numBars}-bar loop`;
}

// reflect the playing bar on the dots without rebuilding them
function updatePlayingDots(){
  pageDotsEl.querySelectorAll('.page-dot').forEach(dot=>{
    dot.classList.toggle('playing', +dot.dataset.bar === playingBar);
  });
}

function setCurrentBar(b){
  if(b < 0 || b >= numBars || b === currentBar) return;
  currentBar = b;
  renderPage();
  saveStateSoon();
}

// _Now helpers actually mutate the per-step arrays; the public ÷2/×2 handlers
// either call them immediately (stopped) or queue them (playing).
function doubleLengthNow(){
  if(numBars >= MAX_BARS) return;
  // duplicate every per-step array in place: [bar1] -> [bar1, copy-of-bar1]
  PLOCK_ARRAYS().forEach(a=>{ const n = a.length; for(let k=0;k<n;k++) a.push(a[k]); });
  numBars *= 2;
  renderPage();
  saveStateSoon();
}
function halveLengthNow(){
  if(numBars <= 1) return;
  PLOCK_ARRAYS().forEach(a=>{ a.length = a.length / 2; });
  numBars /= 2;
  if(currentBar >= numBars) currentBar = numBars - 1;
  renderPage();
  saveStateSoon();
  // No mini-grid clamping needed: while playing, the scheduler's modulo on the
  // new totalSteps + highlightPlayhead handles the transition; while stopped,
  // the mini-grid is always on bar 0 (playhead reset), which halve never removes.
}

function setPendingLengthChange(action){
  pendingLengthChange = action;
  halveBtn.classList.toggle('pending', action === 'halve');
  doubleBtn.classList.toggle('pending', action === 'double');
}
function clearPendingLengthChange(){
  if(!pendingLengthChange) return;
  pendingLengthChange = null;
  halveBtn.classList.remove('pending');
  doubleBtn.classList.remove('pending');
}
// Called by the scheduler when currentStep crosses into a new bar.
function applyPendingLengthChange(){
  const action = pendingLengthChange;
  clearPendingLengthChange();
  if(action === 'double') doubleLengthNow();
  else if(action === 'halve') halveLengthNow();
}

function doubleLength(){
  if(numBars >= MAX_BARS) return;
  if(running){ setPendingLengthChange('double'); return; }
  doubleLengthNow();
}
function halveLength(){
  if(numBars <= 1) return;
  if(running){ setPendingLengthChange('halve'); return; }
  halveLengthNow();
}

halveBtn.addEventListener('click', halveLength);
doubleBtn.addEventListener('click', doubleLength);
renderPageDots();

function updateScrollEdges(el, frame){
  const target = frame || el.parentElement;
  const max = el.scrollWidth - el.clientWidth;
  target.classList.toggle('at-start', el.scrollLeft <= 1);
  target.classList.toggle('at-end', el.scrollLeft >= max - 1);
}
function refreshAllScrollEdges(){
  document.querySelectorAll('.seq-row-scroll').forEach(el => updateScrollEdges(el));
}

// Circular rotary knob (0–100). Drag up/down to turn — same idiom as the acid
// pitch steps and BPM pill. onInput(value) fires on every change.
function makeKnob(value, onInput, title){
  const knob = document.createElement('div');
  knob.className = 'knob';
  knob.tabIndex = 0;
  knob.setAttribute('role', 'slider');
  knob.setAttribute('aria-valuemin', '0');
  knob.setAttribute('aria-valuemax', '100');
  if(title) knob.title = title;
  let val = value;
  function setVal(v){
    val = Math.max(0, Math.min(100, Math.round(v)));
    // 270° sweep: −135° at 0, 0° (straight up) at 50, +135° at 100
    knob.style.setProperty('--knob-ang', (-135 + (val / 100) * 270).toFixed(1) + 'deg');
    knob.setAttribute('aria-valuenow', String(val));
  }
  knob.setValue = setVal;            // expose so randomize/etc. can drive the angle
  setVal(val);
  let dragging = false, startY = 0, startVal = 0;
  knob.addEventListener('pointerdown', (e)=>{
    if(e.button !== 0) return;
    dragging = true; startY = e.clientY; startVal = val;
    try { knob.setPointerCapture(e.pointerId); } catch(_){}
    e.preventDefault();
  });
  knob.addEventListener('pointermove', (e)=>{
    if(!dragging) return;
    setVal(startVal + (startY - e.clientY) * 0.6); // up = increase
    onInput(val);
    saveStateSoon(); // every knob in this app drives persisted state
    e.preventDefault();
  });
  function end(e){
    if(!dragging) return;
    dragging = false;
    try { knob.releasePointerCapture(e.pointerId); } catch(_){}
  }
  knob.addEventListener('pointerup', end);
  knob.addEventListener('pointercancel', end);
  return knob;
}

// Octave pill: ±12 semitone vertical-drag transposer per track. Same gesture as
// the BPM pill (drag up/down, ns-resize cursor) but smaller, and rendered as a
// .tempo-ctrl with the .octave modifier. Returns { el, setValue(semitones) }.
function makeOctavePill(trackId){
  const PX_PER_SEMI = 6;
  const el = document.createElement('div');
  el.className = 'tempo-ctrl octave';
  el.title = `${trackId} transpose: drag for ±12 semitones, double-click to reset`;
  const val = document.createElement('span');
  val.className = 'tempo-label mono octave-val';
  function fmt(n){ return (n > 0 ? '+' : '') + n; }
  function setVal(v){
    v = Math.max(-12, Math.min(12, Math.round(v)));
    trackTranspose[trackId] = v;
    val.textContent = fmt(v);
  }
  setVal(trackTranspose[trackId] || 0);
  el.appendChild(val);
  let dragging = false, startY = 0, startVal = 0;
  el.addEventListener('pointerdown', (e)=>{
    if(e.button !== 0) return;
    dragging = true; startY = e.clientY; startVal = trackTranspose[trackId];
    try { el.setPointerCapture(e.pointerId); } catch(_){}
    el.classList.add('dragging');
    e.preventDefault();
  });
  el.addEventListener('pointermove', (e)=>{
    if(!dragging) return;
    setVal(startVal + Math.round((startY - e.clientY) / PX_PER_SEMI));
    saveStateSoon();
  });
  function end(e){
    if(!dragging) return;
    dragging = false;
    try { el.releasePointerCapture(e.pointerId); } catch(_){}
    el.classList.remove('dragging');
  }
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  // double-click resets to 0 (matches the convention of nuking a transposition)
  el.addEventListener('dblclick', ()=>{ setVal(0); saveStateSoon(); });
  return { el, setValue: setVal };
}

const toggleBtn = document.getElementById('synthToggle');
const statusDot = document.getElementById('statusDot');
const modalDot = document.getElementById('modalDot');
const statusText = document.getElementById('statusText');
const bpmAmtEl = document.getElementById('bpmAmt');
// Anchor on the BPM input — querySelector('.tempo-ctrl') would return the
// first match, which is now a track octave pill (also a .tempo-ctrl) since
// the track rows build before the bottom ctrl-row. closest() gets the right pill.
const tempoCtrlEl = bpmAmtEl.closest('.tempo-ctrl');

function setTempo(bpm){
  bpm = Math.max(60, Math.min(180, Math.round(bpm)));
  TEMPO_BPM = bpm;
  STEP_SECONDS = 60 / TEMPO_BPM / 4;
  if(bpmAmtEl.value != bpm) bpmAmtEl.value = bpm;
  if(delayNodeRef && ctx){
    delayNodeRef.delayTime.setTargetAtTime(STEP_SECONDS * delayMultiplier(), ctx.currentTime, 0.03);
  }
  saveStateSoon();
}

bpmAmtEl.addEventListener('input', ()=>{
  const v = parseInt(bpmAmtEl.value, 10);
  if(!isNaN(v)) setTempo(v);
});
bpmAmtEl.addEventListener('blur', ()=>{ setTempo(parseInt(bpmAmtEl.value, 10) || 140); });
bpmAmtEl.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter') bpmAmtEl.blur();
});

// drag up/down on the tempo pill to scrub (like acid pitch steps)
(function(){
  let dragging = false, moved = false, startY = 0, startBpm = 0;
  const PX_PER_BPM = 3;
  tempoCtrlEl.addEventListener('pointerdown', (e)=>{
    if(e.target === bpmAmtEl && document.activeElement === bpmAmtEl) return; // already editing
    dragging = true; moved = false;
    startY = e.clientY;
    startBpm = TEMPO_BPM;
    try { tempoCtrlEl.setPointerCapture(e.pointerId); } catch(_){}
    tempoCtrlEl.classList.add('dragging');
    e.preventDefault();
  });
  tempoCtrlEl.addEventListener('pointermove', (e)=>{
    if(!dragging) return;
    const dy = startY - e.clientY;
    if(Math.abs(dy) > 3) moved = true;
    setTempo(startBpm + Math.round(dy / PX_PER_BPM));
  });
  // pointerup is the normal end. pointercancel fires on system gestures, focus
  // loss, or releasing outside the viewport — without handling it the .dragging
  // highlight would stick on (visible bug where the BPM pill stayed
  // phosphor-bordered after dragging off-screen).
  function endTempoDrag(e){
    if(!dragging) return;
    dragging = false;
    try { tempoCtrlEl.releasePointerCapture(e.pointerId); } catch(_){}
    tempoCtrlEl.classList.remove('dragging');
    if(!moved && e && e.target === bpmAmtEl){
      bpmAmtEl.focus(); bpmAmtEl.select();
    }
  }
  tempoCtrlEl.addEventListener('pointerup', endTempoDrag);
  tempoCtrlEl.addEventListener('pointercancel', endTempoDrag);
  // safety net: if focus leaves the page mid-drag, neither pointerup nor
  // pointercancel may fire on the captured element. blur on window clears it.
  window.addEventListener('blur', () => endTempoDrag(null));
})();

// SWING + ADSR knobs live in .ctrl-row next to the BPM pill. Layout:
// [▶] [BPM 140] [SWING N%] [ADSR N%]. Knobs are 0–100; SWING maps to 50–75%
// (50 = straight); ADSR is 0–100% directly.
const ctrlRowEl = document.querySelector('.ctrl-row');
function makeLabeledKnob(label, knobValue, fmt, onChange, title){
  const wrap = document.createElement('div');
  wrap.className = 'tempo-ctrl';
  const lab = document.createElement('span');
  lab.className = 'tempo-label mono';
  lab.textContent = label;
  const val = document.createElement('span');
  val.className = 'tempo-label mono';
  val.textContent = fmt(knobValue);
  const knob = makeKnob(knobValue, (v) => {
    val.textContent = fmt(v);
    onChange(v);
  }, title);
  wrap.appendChild(lab);
  wrap.appendChild(knob);
  wrap.appendChild(val);
  return { wrap, knob, setValue: (v) => { knob.setValue(v); val.textContent = fmt(v); } };
}
// SWING knob: 0–100 → swingPct 50–75 (50% = straight; 75% = max shuffle).
const swingKnobCtl = makeLabeledKnob('SWING', (swingPct - 50) * 4,
  v => (50 + v / 4).toFixed(0) + '%',
  v => { swingPct = 50 + v / 4; },
  'Swing — delays every weak 16th (50% = straight, 75% = max shuffle)');
const adsrKnobCtl  = makeLabeledKnob('ADSR',  adsrScale,
  v => v + '%',
  v => { adsrScale = v; },
  'ADSR time scaling — stretches voice envelopes');
ctrlRowEl.appendChild(swingKnobCtl.wrap);
ctrlRowEl.appendChild(adsrKnobCtl.wrap);

function makeImpulseResponse(ctx, duration, decay){
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * duration);
  const ir = ctx.createBuffer(2, length, rate);
  for(let ch = 0; ch < 2; ch++){
    const data = ir.getChannelData(ch);
    for(let i = 0; i < length; i++){
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i/length, decay);
    }
  }
  return ir;
}

// Master limiter — tanh soft-clip at -6 dBFS with 4× oversampling so inter-sample
// (true) peaks get caught. Invisible/fixed: no UI, no state, same node in live
// and offline graphs. Sits between the analyser/master and destination.
function makeLimiterCurve(){
  const n = 8192;
  const curve = new Float32Array(n);
  const ceiling = 0.5; // -6 dB linear
  for(let i = 0; i < n; i++){
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ceiling * Math.tanh(x);
  }
  return curve;
}
function makeMasterLimiter(audioCtx){
  const ws = audioCtx.createWaveShaper();
  ws.curve = makeLimiterCurve();
  ws.oversample = '4x';
  return ws;
}

function ensureAudio(){
  if(ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();

  // iOS Web Audio unlock: play a silent buffer synchronously inside the user gesture
  const unlockBuf = ctx.createBuffer(1, 1, 22050);
  const unlockSrc = ctx.createBufferSource();
  unlockSrc.buffer = unlockBuf;
  unlockSrc.connect(ctx.destination);
  unlockSrc.start(0);

  masterGain = ctx.createGain();
  masterGain.gain.value = 0.6;
  analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;

  // dry path
  masterGain.connect(analyser);

  // delay bus — dotted-eighth feedback delay. delayBusInput sums each track's send.
  const delayBusInput = ctx.createGain();
  delayBusInput.gain.value = 1;
  // max delay time must cover the slowest case: 60 BPM × whole-note = 4 s. 5 s gives headroom.
  const delayNode = ctx.createDelay(5.0);
  delayNode.delayTime.value = STEP_SECONDS * delayMultiplier();
  delayNodeRef = delayNode;
  const delayFb = ctx.createGain();
  delayFb.gain.value = delayFbValue / 100;
  delayFbRef = delayFb;
  const delayDamp = ctx.createBiquadFilter();
  delayDamp.type = 'lowpass';
  delayDamp.frequency.value = delayTone;
  delayDampRef = delayDamp;
  delayReturn = ctx.createGain();
  delayReturn.gain.value = delayBusValue / 100;
  delayBusInput.connect(delayNode);
  delayNode.connect(delayDamp);
  delayDamp.connect(delayFb);
  delayFb.connect(delayNode);
  delayDamp.connect(delayReturn);
  delayReturn.connect(analyser);

  // reverb bus — algorithmic impulse response. reverbBusInput sums each track's send.
  const reverbBusInput = ctx.createGain();
  reverbBusInput.gain.value = 1;
  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulseResponse(ctx, reverbSize, reverbDecay);
  reverbConvolverRef = reverb;
  reverbReturn = ctx.createGain();
  reverbReturn.gain.value = reverbBusValue / 100;
  reverbBusInput.connect(reverb);
  reverb.connect(reverbReturn);
  reverbReturn.connect(analyser);

  const limiter = makeMasterLimiter(ctx);
  analyser.connect(limiter);
  limiter.connect(ctx.destination);

  // per-track output gain + sends into the shared delay/reverb buses
  TRACKS.forEach(track=>{
    const g = ctx.createGain();
    g.gain.value = 1;
    g.connect(masterGain);
    trackGains[track.id] = g;

    const defaults = TRACK_SEND_DEFAULTS[track.id];
    const ds = ctx.createGain();
    ds.gain.value = defaults.delay / 100;
    g.connect(ds);
    ds.connect(delayBusInput);
    trackDelaySends[track.id] = ds;

    const rs = ctx.createGain();
    rs.gain.value = defaults.reverb / 100;
    g.connect(rs);
    rs.connect(reverbBusInput);
    trackReverbSends[track.id] = rs;
  });

  const drone = ctx.createOscillator();
  drone.type = 'sine';
  drone.frequency.value = 65.41;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.0;
  drone.connect(droneGain);
  droneGain.connect(masterGain);
  drone.start();
  droneNodes = [drone, droneGain];
}

function playKick(ctx, t, dest){
  const m = envMult();
  // The kick's "transient" — pitch-up sweep (0.001) + amp attack (0.002) + the
  // click osc + click envelope — must NOT scale with ADSR. At m=5 a scaled
  // click stretches a 1800Hz square out to 30ms, which reads as a staccato
  // high-pitched chirp instead of a kick attack. Only the body/release stretches.
  const p = trackPitchMult('kick');
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(38.7 * p, t);
  osc.frequency.exponentialRampToValueAtTime(106.8 * p, t + 0.001);
  osc.frequency.exponentialRampToValueAtTime(32 * p, t + 0.14 * m);

  const ampEnv = ctx.createGain();
  ampEnv.gain.setValueAtTime(0.0001, t);
  ampEnv.gain.exponentialRampToValueAtTime(0.708, t + 0.002);     // peak -3 dB (was 1.0)
  ampEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.55 * m);

  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for(let i=0;i<256;i++){ const x = (i/255)*2-1; curve[i] = Math.tanh(x*2.2); }
  shaper.curve = curve;

  const click = ctx.createOscillator();
  click.type = 'square';
  click.frequency.value = 1800;
  const clickEnv = ctx.createGain();
  clickEnv.gain.setValueAtTime(0.127, t);                           // -3 dB (was 0.18); transient
  clickEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.006);    // transient — not scaled

  osc.connect(shaper);
  shaper.connect(ampEnv);
  ampEnv.connect(dest);
  click.connect(clickEnv);
  clickEnv.connect(dest);

  osc.start(t); osc.stop(t + 0.58 * m);
  click.start(t); click.stop(t + 0.01);                              // transient — not scaled
}

function playSnare(ctx, t, dest){
  const m = envMult();
  const p = trackPitchMult('snare');
  const osc1 = ctx.createOscillator();
  osc1.type = 'triangle';
  osc1.frequency.value = 190 * p;
  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.value = 264 * p;

  const bodyEnv = ctx.createGain();
  bodyEnv.gain.setValueAtTime(0.225, t);                            // -6 dB (was 0.45)
  bodyEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.13 * m);

  osc1.connect(bodyEnv);
  osc2.connect(bodyEnv);
  bodyEnv.connect(dest);
  osc1.start(t); osc1.stop(t + 0.14 * m);
  osc2.start(t); osc2.stop(t + 0.14 * m);

  const bufferSize = ctx.sampleRate * 0.2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0; i<bufferSize; i++) data[i] = Math.random()*2-1;

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 900;
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 2400;
  bandpass.Q.value = 0.7;

  const noiseEnv = ctx.createGain();
  noiseEnv.gain.setValueAtTime(0.275, t);                           // -6 dB (was 0.55)
  noiseEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.16 * m);

  noise.connect(highpass);
  highpass.connect(bandpass);
  bandpass.connect(noiseEnv);
  noiseEnv.connect(dest);
  noise.start(t);
  noise.stop(t + 0.18 * m);
}

function playHat(ctx, t, dest){
  const m = envMult();
  const ratios = [1, 1.342, 1.787, 2.0, 2.245, 2.6];
  const fundamental = 245 * trackPitchMult('hat');
  const hatGain = ctx.createGain();

  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 6800;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.198, t);                                // -3 dB (was 0.28)
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 * m);

  ratios.forEach(r=>{
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = fundamental * r;
    o.connect(hatGain);
    o.start(t);
    o.stop(t + 0.06 * m);
  });

  hatGain.connect(highpass);
  highpass.connect(env);
  env.connect(dest);
}

function midiToFreq(m){ return 440 * Math.pow(2, (m-69)/12); }

function stepWobble(stepIndex, salt){
  const x = Math.sin(stepIndex * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function playAcid(ctx, t, stepIndex, dest){
  const note = ACID_NOTES[stepIndex % ACID_NOTES.length] + trackTranspose.acid;
  const freq = midiToFreq(note);
  const accented = !!ACID_ACCENT[stepIndex % ACID_ACCENT.length];

  const wCutoff = stepWobble(stepIndex, 1);
  const wReso = stepWobble(stepIndex, 2);
  const wDecay = stepWobble(stepIndex, 3);

  const q = (accented ? 11 : 6) + wReso * 7;
  const peakGain = accented ? 0.34 : 0.22;
  const noteLen = STEP_SECONDS * (1.3 + wDecay * 1.1) * synthEnvMult();
  const noteTrack = (freq / midiToFreq(36)) * 400;
  const cutoffPeak = (accented ? 2800 : 1500) + noteTrack + wCutoff * 1100;
  const cutoffFloor = 160 + wCutoff * 90;

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, t);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(cutoffPeak, t);
  filter.frequency.exponentialRampToValueAtTime(cutoffFloor, t + noteLen * (0.7 + wDecay * 0.2));

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peakGain, t + 0.006 * envMult());
  gain.gain.exponentialRampToValueAtTime(0.0001, t + noteLen);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  osc.start(t);
  osc.stop(t + noteLen + 0.05);
}

function playFM(ctx, t, stepIndex, dest){
  const note = ACID_NOTES[stepIndex] + trackTranspose.acid;
  const freq = midiToFreq(note);
  const ratio = FM_RATIO[stepIndex];
  const index = FM_INDEX[stepIndex];
  const accented = !!ACID_ACCENT[stepIndex];
  const noteLen = STEP_SECONDS * 1.4 * synthEnvMult();

  const carrier = ctx.createOscillator();
  carrier.type = 'sine';
  carrier.frequency.setValueAtTime(freq, t);

  const mod = ctx.createOscillator();
  mod.type = 'sine';
  mod.frequency.setValueAtTime(freq * ratio, t);

  // mod depth scales with note frequency so timbre stays consistent across pitches
  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(freq * (index / 100), t);
  mod.connect(modGain);
  modGain.connect(carrier.frequency);

  const ampEnv = ctx.createGain();
  const peakGain = accented ? 0.36 : 0.24;
  ampEnv.gain.setValueAtTime(0.0001, t);
  ampEnv.gain.exponentialRampToValueAtTime(peakGain, t + 0.006 * envMult());
  ampEnv.gain.exponentialRampToValueAtTime(0.0001, t + noteLen);

  carrier.connect(ampEnv);
  ampEnv.connect(dest);

  carrier.start(t); carrier.stop(t + noteLen + 0.05);
  mod.start(t); mod.stop(t + noteLen + 0.05);
}

const VOICES = { kick: playKick, snare: playSnare, hat: playHat };

let currentStep = 0;
let nextStepTime = 0;
let schedulerTimer = null;
const SCHEDULE_AHEAD = 0.12;

function scheduleStep(stepIndex, time){
  TRACKS.forEach(track=>{
    if(!trackAudible(track.id)) return;
    const dest = trackGains[track.id];
    if(track.id === 'acid'){
      if(pattern.acid[stepIndex]){
        const voice = acidInstrument === 'fm' ? playFM : playAcid;
        voice(ctx, time, stepIndex, dest);
      }
    } else if(pattern[track.id][stepIndex]){
      VOICES[track.id](ctx, time, dest);
    }
  });
  highlightPlayhead(stepIndex);
}

function highlightPlayhead(stepIndex){
  const bar = Math.floor(stepIndex / STEPS);
  const visual = stepIndex % STEPS;
  // mini-grid + page dots follow the bar currently playing
  if(bar !== miniGridBar) renderMiniGrid(bar);
  if(bar !== playingBar){ playingBar = bar; updatePlayingDots(); }
  // modal grid: only light up when the playing bar is the one being viewed
  document.querySelectorAll('.step.playhead').forEach(el=>el.classList.remove('playhead'));
  if(bar === currentBar){
    document.querySelectorAll(`.step[data-step="${visual}"]`).forEach(el=>el.classList.add('playhead'));
  }
  // bar mini grid
  document.querySelectorAll('.bar-step.playhead').forEach(el=>el.classList.remove('playhead'));
  document.querySelectorAll(`.bar-step[data-step="${visual}"]`).forEach(el=>el.classList.add('playhead'));
}

function schedulerLoop(){
  while(nextStepTime < ctx.currentTime + SCHEDULE_AHEAD){
    // Swing: only the weak 16th (odd absolute step) is delayed; pacing
    // (nextStepTime) is untouched so the bar duration stays exact.
    const swingOffset = (currentStep % 2) * (swingPct - 50) / 100 * STEP_SECONDS;
    scheduleStep(currentStep, nextStepTime + swingOffset);
    nextStepTime += STEP_SECONDS;
    // increment first, then if we just crossed into a new bar, apply any
    // pending length change — guarantees the audible bar plays out fully and
    // the final modulo lands us on a step that exists in the new sequence.
    currentStep = currentStep + 1;
    if(currentStep % STEPS === 0){
      if(pendingLengthChange) applyPendingLengthChange();
      // Evolve runs once per audible bar boundary, just before the modulo
      // wrap, so mutations land on the next bar's playback in the same tick
      // as any pending length change.
      if(evolving) evolveOnce();
    }
    currentStep = currentStep % totalSteps();
  }
  schedulerTimer = setTimeout(schedulerLoop, 25);
}

function startSequencer(){
  // currentStep is set to 0 by stopSequencer (or initialization), so playback
  // always begins at bar 1 step 1. The playhead "lives" at currentStep; the
  // modal controls move it (stop → reset, play → advance), and the mini-grid
  // is a passive display of whichever bar the playhead is in.
  nextStepTime = ctx.currentTime + 0.05;
  schedulerLoop();
}

function stopSequencer(){
  if(schedulerTimer) clearTimeout(schedulerTimer);
  document.querySelectorAll('.step.playhead').forEach(el=>el.classList.remove('playhead'));
  document.querySelectorAll('.bar-step.playhead').forEach(el=>el.classList.remove('playhead'));
  // Stop resets the playhead to bar 0 step 0; mini-grid follows.
  currentStep = 0;
  playingBar = -1;
  updatePlayingDots();
  if(miniGridBar !== 0) renderMiniGrid(0); else miniGridBar = 0;
  clearPendingLengthChange(); // a queued change is canceled when you stop
}

function setPlayingState(isPlaying){
  running = isPlaying;
  setPlayFadeOverride(isPlaying);
  if(running){
    toggleBtn.textContent = '◼';
    toggleBtn.title = 'Stop';
    toggleBtn.setAttribute('aria-label', 'Stop');
    barPlayBtn.textContent = '◼';
    barPlayBtn.title = 'Stop';
    barPlayBtn.setAttribute('aria-label', 'Stop');
    statusDot.classList.add('live');
    modalDot.classList.add('live');
    statusText.textContent = 'PLAYING';
    if(droneNodes[1]) droneNodes[1].gain.linearRampToValueAtTime(0.04, ctx.currentTime + 1.2);
    startSequencer();
    cancelMarqueeIdle();
  } else {
    toggleBtn.textContent = '▶';
    toggleBtn.title = 'Play';
    toggleBtn.setAttribute('aria-label', 'Play');
    barPlayBtn.textContent = '▶';
    barPlayBtn.title = 'Play';
    barPlayBtn.setAttribute('aria-label', 'Play');
    statusDot.classList.remove('live');
    modalDot.classList.remove('live');
    statusText.textContent = 'STOPPED';
    if(droneNodes[1]) droneNodes[1].gain.linearRampToValueAtTime(0.0, ctx.currentTime + 0.6);
    stopSequencer();
    scheduleMarqueeIdle();
  }
}

/* ---- idle MOD.WAV marquee on the bottom-bar grid ---- */
const MARQUEE_GLYPHS = {
  M: [[1,0,0,0,1],[1,1,0,1,1],[1,0,1,0,1],[1,0,0,0,1]],
  O: [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  D: [[1,1,1,0,0],[1,0,0,1,0],[1,0,0,1,0],[1,1,1,0,0]],
  '.': [[0],[0],[0],[1]],
  W: [[1,0,0,0,1],[1,0,1,0,1],[1,0,1,0,1],[0,1,0,1,0]],
  A: [[0,1,1,1,0],[1,0,0,0,1],[1,1,1,1,1],[1,0,0,0,1]],
  V: [[1,0,0,0,1],[1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0]],
};
function buildMarquee(text){
  const rows = [[],[],[],[]];
  const blank = w => { for(let r=0;r<4;r++) for(let i=0;i<w;i++) rows[r].push(0); };
  blank(16);
  for(const ch of text){
    if(ch === ' '){ blank(2); continue; }
    const g = MARQUEE_GLYPHS[ch];
    if(!g) continue;
    for(let r=0;r<4;r++) g[r].forEach(v=>rows[r].push(v));
    blank(1);
  }
  blank(16);
  return rows;
}
const MARQUEE = buildMarquee('MOD.WAV');
let marqueeOffset = 0;
let marqueeTimer = null;
let marqueeIdleTimer = null;
function renderMarqueeFrame(){
  const rowEls = document.querySelectorAll('#barSeq .bar-seq-row');
  for(let r=0;r<4;r++){
    const steps = rowEls[r].querySelectorAll('.bar-step');
    for(let c=0;c<16;c++){
      const idx = (marqueeOffset + c) % MARQUEE[r].length;
      steps[c].classList.toggle('on', !!MARQUEE[r][idx]);
    }
  }
}
function restoreBarFromPattern(){
  // marquee only runs while stopped — restore the bar the mini-grid was on
  // before the marquee overwrote it (last-played bar, or bar 0 if never played).
  renderMiniGrid(miniGridBar);
}
function startMarquee(){
  if(marqueeTimer || running) return;
  marqueeOffset = 0;
  marqueeTimer = setInterval(()=>{
    renderMarqueeFrame();
    marqueeOffset = (marqueeOffset + 1) % MARQUEE[0].length;
  }, 140);
}
function stopMarquee(){
  if(!marqueeTimer) return;
  clearInterval(marqueeTimer);
  marqueeTimer = null;
  restoreBarFromPattern();
}
function scheduleMarqueeIdle(){
  clearTimeout(marqueeIdleTimer);
  marqueeIdleTimer = setTimeout(startMarquee, 10000);
}
function cancelMarqueeIdle(){
  clearTimeout(marqueeIdleTimer);
  marqueeIdleTimer = null;
  stopMarquee();
}
scheduleMarqueeIdle();

async function handleToggle(){
  ensureAudio();
  if(ctx.state === 'suspended') await ctx.resume();
  setPlayingState(!running);
}

toggleBtn.addEventListener('click', handleToggle);
barPlayBtn.addEventListener('click', (e)=>{
  e.stopPropagation();
  handleToggle();
});

/* ---------------- oscilloscope draw ---------------- */
const canvas = document.getElementById('scope');
const cctx = canvas.getContext('2d');
const bgCanvas = document.getElementById('bgScope');
const bgCtx = bgCanvas.getContext('2d');
let dataArray;

function resizeOne(c){
  const ratio = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = c.clientHeight;
  if(w === 0 || h === 0) return;
  c.width = w * ratio;
  c.height = h * ratio;
  c.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
}
function resizeCanvas(){
  resizeOne(canvas);
  resizeOne(bgCanvas);
}
window.addEventListener('resize', resizeCanvas);
window.addEventListener('resize', refreshAllScrollEdges);
resizeCanvas();

function drawIdleTo(ctx2d, c, t, ampScale){
  const w = c.clientWidth, h = c.clientHeight;
  if(w === 0) return;
  ctx2d.clearRect(0,0,w,h);
  ctx2d.beginPath();
  ctx2d.strokeStyle = '#4A4842';
  ctx2d.lineWidth = 1.2;
  const midY = h/2;
  const amp = 7 * ampScale;
  for(let x=0; x<w; x++){
    const y = midY + Math.sin((x*0.045) + t*0.0017) * amp * Math.sin(t*0.0004);
    if(x===0) ctx2d.moveTo(x,y); else ctx2d.lineTo(x,y);
  }
  ctx2d.stroke();
}

function drawLiveTo(ctx2d, c, glow){
  const w = c.clientWidth, h = c.clientHeight;
  if(w === 0) return;
  ctx2d.clearRect(0,0,w,h);
  ctx2d.beginPath();
  ctx2d.strokeStyle = '#8FFFC4';
  ctx2d.lineWidth = 1.4;
  if(glow){
    ctx2d.shadowColor = 'rgba(143,255,196,0.45)';
    ctx2d.shadowBlur = 4;
  }
  const sliceWidth = w / dataArray.length;
  let x = 0;
  for(let i=0; i<dataArray.length; i++){
    const v = dataArray[i] / 128.0;
    const y = (v * h) / 2;
    if(i===0) ctx2d.moveTo(x,y); else ctx2d.lineTo(x,y);
    x += sliceWidth;
  }
  ctx2d.stroke();
  if(glow) ctx2d.shadowBlur = 0;
}

function loop(t){
  if(synthOverlay.classList.contains('open')){
    resizeOne(canvas);
  }
  resizeOne(bgCanvas);
  if(running && analyser){
    if(!dataArray) dataArray = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(dataArray);
    drawLiveTo(cctx, canvas, true);
    drawLiveTo(bgCtx, bgCanvas, false);
  } else {
    drawIdleTo(cctx, canvas, t, 1);
    drawIdleTo(bgCtx, bgCanvas, t, Math.max(1, bgCanvas.clientHeight / 86));
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------------- export: stems + mix + MIDI (actual 1/2/4-bar length) ---------------- */
const EXPORT_SR = 44100;

// rebuild the live FX topology (per-track gain + delay/reverb buses) inside an
// offline context so exported audio matches what you hear.
function buildOfflineGraph(octx, trackIds){
  // Same limiter shape as the live path — sits between every signal source
  // and the destination so true peaks get caught on export too. Routing the
  // FX returns through it (not just master) was the bug-bait the spec warned
  // about: otherwise the limiter only clips the dry signal.
  const limiter = makeMasterLimiter(octx);
  limiter.connect(octx.destination);

  const master = octx.createGain();
  master.gain.value = 0.6;
  master.connect(limiter);

  const delayBusInput = octx.createGain();
  const delayNode = octx.createDelay(5.0);
  delayNode.delayTime.value = STEP_SECONDS * delayMultiplier();
  const delayFb = octx.createGain(); delayFb.gain.value = delayFbValue / 100;
  const delayDamp = octx.createBiquadFilter();
  delayDamp.type = 'lowpass'; delayDamp.frequency.value = delayTone;
  const delayReturn = octx.createGain();
  delayReturn.gain.value = delayBusValue / 100;
  delayBusInput.connect(delayNode);
  delayNode.connect(delayDamp);
  delayDamp.connect(delayFb);
  delayFb.connect(delayNode);
  delayDamp.connect(delayReturn);
  delayReturn.connect(limiter);

  const reverbBusInput = octx.createGain();
  const reverb = octx.createConvolver();
  reverb.buffer = makeImpulseResponse(octx, reverbSize, reverbDecay);
  const reverbReturn = octx.createGain();
  reverbReturn.gain.value = reverbBusValue / 100;
  reverbBusInput.connect(reverb);
  reverb.connect(reverbReturn);
  reverbReturn.connect(limiter);

  const gains = {};
  trackIds.forEach(id=>{
    const g = octx.createGain(); g.gain.value = 1; g.connect(master);
    const sv = trackSendValues[id];
    const ds = octx.createGain(); ds.gain.value = sv.delay / 100;
    g.connect(ds); ds.connect(delayBusInput);
    const rs = octx.createGain(); rs.gain.value = sv.reverb / 100;
    g.connect(rs); rs.connect(reverbBusInput);
    gains[id] = g;
  });
  return gains;
}

async function renderLoop(trackIds){
  const stepCount = totalSteps();
  const startPad = 0.02;
  const loopLen = stepCount * STEP_SECONDS;
  const tail = 2.0; // let delay/reverb tails ring out
  const length = Math.ceil(EXPORT_SR * (startPad + loopLen + tail));
  const octx = new OfflineAudioContext(2, length, EXPORT_SR);
  const gains = buildOfflineGraph(octx, trackIds);

  for(let step=0; step<stepCount; step++){
    const t = startPad + step * STEP_SECONDS;
    trackIds.forEach(id=>{
      if(id === 'acid'){
        if(pattern.acid[step]){
          const voice = acidInstrument === 'fm' ? playFM : playAcid;
          voice(octx, t, step, gains.acid);
        }
      } else if(pattern[id][step]){
        VOICES[id](octx, t, gains[id]);
      }
    });
  }
  return await octx.startRendering();
}

function audioBufferToWav(buffer){
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const numFrames = buffer.length;
  const blockAlign = numCh * 2;
  const dataSize = numFrames * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  let p = 0;
  const wStr = s => { for(let i=0;i<s.length;i++) view.setUint8(p++, s.charCodeAt(i)); };
  const wU32 = v => { view.setUint32(p, v, true); p += 4; };
  const wU16 = v => { view.setUint16(p, v, true); p += 2; };
  wStr('RIFF'); wU32(36 + dataSize); wStr('WAVE');
  wStr('fmt '); wU32(16); wU16(1); wU16(numCh); wU32(sr);
  wU32(sr * blockAlign); wU16(blockAlign); wU16(16);
  wStr('data'); wU32(dataSize);
  const channels = [];
  for(let c=0;c<numCh;c++) channels.push(buffer.getChannelData(c));
  for(let i=0;i<numFrames;i++){
    for(let c=0;c<numCh;c++){
      let s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      p += 2;
    }
  }
  return new Uint8Array(ab);
}

const CRC_TABLE = (function(){
  const t = new Uint32Array(256);
  for(let n=0;n<256;n++){
    let c = n;
    for(let k=0;k<8;k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes){
  let c = 0xFFFFFFFF;
  for(let i=0;i<bytes.length;i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// minimal store-only (uncompressed) ZIP — no external deps
function buildZip(files){
  const enc = new TextEncoder();
  const localParts = [];
  const central = [];
  let offset = 0;
  files.forEach(f=>{
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;
    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lh.set(nameBytes, 30);
    localParts.push(lh, f.data);

    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    ch.set(nameBytes, 46);
    central.push(ch);

    offset += lh.length + size;
  });
  const centralSize = central.reduce((a,c)=>a + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  return new Blob([...localParts, ...central, eocd], { type: 'application/zip' });
}

// Standard MIDI File (format 1): drums on ch10, acid melodic on ch1, 1/2/4 bars
function buildMidi(){
  const TPQ = 480;
  const stepTicks = TPQ / 4; // 16th note
  const stepCount = totalSteps();
  const DRUM_CH = 9, ACID_CH = 0;
  const DRUM_NOTE = { kick: 36, snare: 38, hat: 42 };

  const vlq = value => {
    const bytes = [value & 0x7F];
    value = Math.floor(value / 128);
    while(value > 0){ bytes.unshift((value & 0x7F) | 0x80); value = Math.floor(value / 128); }
    return bytes;
  };
  const pushU32 = (arr, v) => arr.push((v>>>24)&0xFF, (v>>>16)&0xFF, (v>>>8)&0xFF, v&0xFF);
  const pushU16 = (arr, v) => arr.push((v>>>8)&0xFF, v&0xFF);

  function eventsToTrack(events){
    events.sort((a,b)=> a.tick - b.tick || a.order - b.order);
    const bytes = [];
    let last = 0;
    events.forEach(ev=>{
      vlq(ev.tick - last).forEach(b=>bytes.push(b));
      last = ev.tick;
      ev.data.forEach(b=>bytes.push(b));
    });
    bytes.push(0x00, 0xFF, 0x2F, 0x00);
    const chunk = [0x4D,0x54,0x72,0x6B];
    pushU32(chunk, bytes.length);
    return chunk.concat(bytes);
  }

  const usPerQuarter = Math.round(60000000 / TEMPO_BPM);
  const tempoTrack = eventsToTrack([
    { tick:0, order:0, data:[0xFF,0x51,0x03,(usPerQuarter>>16)&0xFF,(usPerQuarter>>8)&0xFF,usPerQuarter&0xFF] },
    { tick:0, order:1, data:[0xFF,0x58,0x04,4,2,24,8] },
    { tick:0, order:2, data:[0xFF,0x03,0x05,0x6D,0x6F,0x64,0x77,0x76] }, // track name "modwv"
  ]);

  const tracks = [tempoTrack];

  ['kick','snare','hat'].forEach(id=>{
    const note = DRUM_NOTE[id];
    const events = [];
    for(let step=0; step<stepCount; step++){
      if(pattern[id][step]){
        const onTick = step * stepTicks;
        events.push({ tick:onTick, order:1, data:[0x90|DRUM_CH, note, 100] });
        events.push({ tick:onTick + Math.floor(stepTicks*0.5), order:0, data:[0x80|DRUM_CH, note, 0] });
      }
    }
    tracks.push(eventsToTrack(events));
  });

  {
    const events = [];
    for(let step=0; step<stepCount; step++){
      if(pattern.acid[step]){
        const note = ACID_NOTES[step];
        const accent = !!ACID_ACCENT[step];
        const onTick = step * stepTicks;
        const nextActive = !!pattern.acid[(step + 1) % stepCount];
        const gate = nextActive ? stepTicks : Math.floor(stepTicks * 0.9);
        events.push({ tick:onTick, order:1, data:[0x90|ACID_CH, note, accent?115:85] });
        events.push({ tick:onTick + gate, order:0, data:[0x80|ACID_CH, note, 0] });
      }
    }
    tracks.push(eventsToTrack(events));
  }

  const header = [0x4D,0x54,0x68,0x64];
  pushU32(header, 6);
  pushU16(header, 1);
  pushU16(header, tracks.length);
  pushU16(header, TPQ);

  let all = header.slice();
  tracks.forEach(t=> all = all.concat(t));
  return new Uint8Array(all);
}

function exportReadme(){
  const bpm = Math.round(TEMPO_BPM);
  const barWord = numBars === 1 ? '1-bar' : `${numBars}-bar`;
  return new TextEncoder().encode(
`mod.wav — your ${barWord} loop
==========================

Rendered live from the signal generator. ${bpm} BPM, ${numBars} ${numBars === 1 ? 'bar' : 'bars'}.
Acid voice: ${acidInstrument.toUpperCase()}.

stems/   per-track WAV stems (kick, snare, hat, acid) — drop into any DAW
mix.wav  the full loop, one file
pattern.mid  the same pattern as MIDI (drums on ch10, acid on ch1)

Made in the room. Take it home, build on it.
mod.wav — SF
`);
}

function triggerDownload(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 5000);
}

const exportBtn = document.getElementById('exportBtn');
const exportStatus = document.getElementById('exportStatus');
let exporting = false;

async function runExport(){
  if(exporting) return;
  exporting = true;
  if(running) setPlayingState(false);
  exportBtn.disabled = true;
  const origText = exportBtn.textContent;
  exportBtn.textContent = 'Rendering…';
  const nextFrame = () => new Promise(r=>requestAnimationFrame(r));
  try {
    const stemTracks = ['kick','snare','hat','acid'];
    const total = stemTracks.length + 1;
    const files = [];
    for(let i=0;i<stemTracks.length;i++){
      const id = stemTracks[i];
      exportStatus.textContent = `rendering ${id} (${i+1}/${total})…`;
      await nextFrame();
      const buf = await renderLoop([id]);
      files.push({ name:`stems/${i+1}_${id}.wav`, data: audioBufferToWav(buf) });
    }
    exportStatus.textContent = `rendering mix (${total}/${total})…`;
    await nextFrame();
    const mixTracks = stemTracks.filter(trackAudible);
    const mixBuf = await renderLoop(mixTracks.length ? mixTracks : stemTracks);
    files.push({ name:'mix.wav', data: audioBufferToWav(mixBuf) });
    files.push({ name:'pattern.mid', data: buildMidi() });
    files.push({ name:'README.txt', data: exportReadme() });

    exportStatus.textContent = 'packaging…';
    await nextFrame();
    const zip = buildZip(files);
    triggerDownload(zip, `modwav-loop-${Math.round(TEMPO_BPM)}bpm.zip`);
    exportStatus.textContent = 'saved ✓';
  } catch(err){
    console.error('export failed', err);
    exportStatus.textContent = 'export failed — see console';
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = origText;
    exporting = false;
  }
}
exportBtn.addEventListener('click', runExport);

/* ---------------- randomize ---------------- */
// Configurable randomize. The tree below mirrors the persistence schema (minus
// numBars/mute/solo and the three items the user opted out of: ACID_ACCENT,
// acidInstrument, FX-bus return levels). Leaves carry an `apply` fn that
// mutates the corresponding state. Parents are visual + cascade-toggle nodes.
// Mask is ephemeral (not persisted). Right-click the die opens the popup;
// left-click runs immediately with the current mask.

const _ri = (lo, hi) => Math.floor(lo + Math.random() * (hi - lo + 1));     // inclusive int
const _rf = (lo, hi) => lo + Math.random() * (hi - lo);                     // float
const _rp = (arr) => arr[Math.floor(Math.random() * arr.length)];           // pick
const _rd = (p) => Math.random() < p ? 1 : 0;                               // 0/1 with density

// Densities tuned for musicality — uniform 0.5 makes drums sound noisy.
const TRACK_DENSITY = { kick: 0.4, snare: 0.22, hat: 0.55, acid: 0.45 };
const FM_RATIO_CHOICES = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8];

function rndSteps(id){
  const d = TRACK_DENSITY[id] ?? 0.4;
  const n = totalSteps();
  for(let i = 0; i < n; i++) pattern[id][i] = _rd(d);
}
function rndPitch(){
  const n = totalSteps();
  for(let i = 0; i < n; i++) ACID_NOTES[i] = _ri(ACID_NOTE_MIN, ACID_NOTE_MAX);
}
function rndFmRatio(){
  const n = totalSteps();
  for(let i = 0; i < n; i++) FM_RATIO[i] = _rp(FM_RATIO_CHOICES);
}
function rndFmIndex(){
  const n = totalSteps();
  for(let i = 0; i < n; i++) FM_INDEX[i] = _ri(0, 80) * 5;                  // 0–400 step 5
}
function rndOctave(id){
  const v = _ri(-12, 12);
  transposeCtls[id]?.setValue(v);
}
function rndSend(id, kind){
  const v = _ri(0, 100);
  trackSendValues[id][kind] = v;
  const node = kind === 'delay' ? trackDelaySends[id] : trackReverbSends[id];
  if(node) node.gain.value = v / 100;
  trackSendKnobs[id]?.[kind]?.setValue(v);
}
function rndFxDelay(){
  delayFbValue  = _ri(0, 95);
  delayDivIndex = _ri(0, DELAY_DIVS.length - 1);
  delayTone     = _ri(5, 120) * 100;                                        // 500–12000 step 100
  if(delayFbRef)   delayFbRef.gain.value = delayFbValue / 100;
  if(delayDampRef) delayDampRef.frequency.setTargetAtTime(delayTone, ctx?.currentTime || 0, 0.03);
  if(delayNodeRef && ctx) delayNodeRef.delayTime.setTargetAtTime(STEP_SECONDS * delayMultiplier(), ctx.currentTime, 0.03);
}
function rndFxReverb(){
  reverbSize  = Math.round(_rf(0.5, 5.0) * 10) / 10;
  reverbDecay = Math.round(_rf(1.0, 5.0) * 10) / 10;
  if(reverbConvolverRef && ctx) reverbConvolverRef.buffer = makeImpulseResponse(ctx, reverbSize, reverbDecay);
}
function rndBpm(){
  setTempo(_ri(60, 180));
}
function rndSwing(){
  swingPct = _ri(50, 75);
  swingKnobCtl.setValue((swingPct - 50) * 4);
}
function rndAdsr(){
  adsrScale = _ri(0, 100);
  adsrKnobCtl.setValue(adsrScale);
}

const RND_TREE = [
  { id: 'all', label: 'ALL', children: [
    { id: 'tracks', label: 'tracks', children: TRACKS.map(t => ({
      id: t.id, label: t.label.charAt(0) + t.label.slice(1).toLowerCase(),
      children: [
        { id: `${t.id}.steps`,  label: 'steps',       apply: () => rndSteps(t.id) },
        { id: `${t.id}.octave`, label: 'octave',      apply: () => rndOctave(t.id) },
        ...(t.id === 'acid' ? [
          { id: 'acid.pitch',    label: 'pitch',      apply: rndPitch },
          { id: 'acid.fmRatio',  label: 'FM ratio',   apply: rndFmRatio },
          { id: 'acid.fmIndex',  label: 'FM index',   apply: rndFmIndex },
        ] : []),
        { id: `${t.id}.delay`,  label: 'delay send',  apply: () => rndSend(t.id, 'delay') },
        { id: `${t.id}.reverb`, label: 'reverb send', apply: () => rndSend(t.id, 'reverb') },
      ],
    }))},
    { id: 'fx', label: 'fx bus', children: [
      { id: 'fx.delay',  label: 'delay',  apply: rndFxDelay },
      { id: 'fx.reverb', label: 'reverb', apply: rndFxReverb },
    ]},
    { id: 'bpm', label: 'BPM', apply: rndBpm },
    { id: 'swing', label: 'swing', apply: rndSwing },
    { id: 'adsr', label: 'ADSR', apply: rndAdsr },
  ]},
];

// Flat list of leaf nodes for fast iteration during randomize().
const _leaves = [];
(function collectLeaves(nodes){
  nodes.forEach(n => {
    if(n.children) collectLeaves(n.children);
    else _leaves.push(n);
  });
})(RND_TREE);

// Mask shape: { [leafId]: boolean }. Defaults: every leaf on.
const defaultMask = () => Object.fromEntries(_leaves.map(l => [l.id, true]));
let _rndMask = defaultMask();

function runRandomize(){
  _leaves.forEach(leaf => { if(_rndMask[leaf.id]) leaf.apply(); });
  // Reflect everything that changed into the DOM + saved state.
  renderPage();
  renderMiniGrid(miniGridBar);
  saveStateSoon();
}

/* ---------------- evolve mode ---------------- */
// Hairline mutations applied at every bar boundary while playing. Each tick
// picks 1–3 mutations (weighted toward 1), each scoped to a single track and
// a single parameter. Excludes globals (BPM/swing/ADSR/FX-bus/master) per spec.
// Bias is toward rhythmic (step toggles) over melodic/timbral.
// Mode is transient: not persisted, resets to off on reload.
let evolving = false;
let evolveBtnEl = null; // set when the button is wired below
// Frozen copy of the user's authored pattern, taken when evolve arms. While
// evolving, the live arrays are the mutating buffer; this snapshot is what
// gets persisted (so reload doesn't clobber the user's work) and what gets
// restored on disarm. Null when not evolving.
let preEvolveSnapshot = null;

function snapshotPatternState(){
  const sends = {};
  Object.keys(trackSendValues).forEach(id => { sends[id] = { ...trackSendValues[id] }; });
  return {
    kick: [...pattern.kick], snare: [...pattern.snare],
    hat:  [...pattern.hat],  acid:  [...pattern.acid],
    acidNotes: [...ACID_NOTES],
    fmRatio:   [...FM_RATIO],
    fmIndex:   [...FM_INDEX],
    sends,
  };
}
function restorePatternState(snap){
  // Copy in place so every closure that captured these arrays keeps working —
  // same idiom loadState() uses.
  const replace = (target, src) => { target.length = 0; target.push(...src); };
  replace(pattern.kick,  snap.kick);
  replace(pattern.snare, snap.snare);
  replace(pattern.hat,   snap.hat);
  replace(pattern.acid,  snap.acid);
  replace(ACID_NOTES,    snap.acidNotes);
  replace(FM_RATIO,      snap.fmRatio);
  replace(FM_INDEX,      snap.fmIndex);
  // Sends need to also push back to the audio nodes + knob UI so live playback
  // and the visible knob angles match the restored values.
  Object.keys(snap.sends).forEach(id => {
    ['delay','reverb'].forEach(kind => {
      const v = snap.sends[id][kind];
      trackSendValues[id][kind] = v;
      const node = kind === 'delay' ? trackDelaySends[id] : trackReverbSends[id];
      if(node) node.gain.value = v / 100;
      trackSendKnobs[id]?.[kind]?.setValue(v);
    });
  });
}

// Weighted pick: stepToggle 70 / acidPitch 15 / fmTweak 10 / sendNudge 5.
// Returns one of: 'step' | 'pitch' | 'fm' | 'send'.
function pickEvolveOp(){
  const r = Math.random() * 100;
  if(r < 70) return 'step';
  if(r < 85) return 'pitch';
  if(r < 95) return 'fm';
  return 'send';
}
// 1: 60%, 2: 30%, 3: 10%.
function pickEvolveCount(){
  const r = Math.random();
  if(r < 0.6) return 1;
  if(r < 0.9) return 2;
  return 3;
}

function evolveStepToggle(){
  // Density-aware flip — biases away from all-on / all-off attractors so a
  // long evolve session doesn't drift into noise or silence.
  const track = _rp(['kick','snare','hat','acid']);
  const arr = pattern[track];
  const n = arr.length;
  const density = arr.reduce((a,v)=>a+v,0) / n;
  const flipOnP = density < 0.2 ? 0.85 : density > 0.7 ? 0.15 : 0.5;
  const want = _rd(flipOnP); // 1 = want to turn one on, 0 = turn one off
  const candidates = [];
  for(let i = 0; i < n; i++) if((arr[i] ? 0 : 1) === want) candidates.push(i);
  if(!candidates.length) return false;
  const i = _rp(candidates);
  arr[i] = want;
  return true;
}
function evolveAcidPitch(){
  // Only re-pitches active acid steps (silent ones are inaudible — no point).
  const active = [];
  for(let i = 0; i < pattern.acid.length; i++) if(pattern.acid[i]) active.push(i);
  if(!active.length) return false;
  const i = _rp(active);
  const delta = _rp([-3,-2,-1,1,2,3]);
  ACID_NOTES[i] = Math.max(ACID_NOTE_MIN, Math.min(ACID_NOTE_MAX, ACID_NOTES[i] + delta));
  return true;
}
function evolveFmTweak(){
  // Only relevant when the acid voice is FM AND there's an active step to retime.
  if(acidInstrument !== 'fm') return false;
  const active = [];
  for(let i = 0; i < pattern.acid.length; i++) if(pattern.acid[i]) active.push(i);
  if(!active.length) return false;
  const i = _rp(active);
  if(Math.random() < 0.5){
    // ratio: nudge to a neighboring choice in the discrete list
    const idx = FM_RATIO_CHOICES.indexOf(FM_RATIO[i]);
    const ni = Math.max(0, Math.min(FM_RATIO_CHOICES.length - 1, (idx < 0 ? 0 : idx) + _rp([-1,1])));
    FM_RATIO[i] = FM_RATIO_CHOICES[ni];
  } else {
    FM_INDEX[i] = Math.max(0, Math.min(400, FM_INDEX[i] + _ri(-20, 20)));
  }
  return true;
}
function evolveSendNudge(){
  const track = _rp(['kick','snare','hat','acid']);
  const kind = Math.random() < 0.5 ? 'delay' : 'reverb';
  const cur = trackSendValues[track][kind];
  const delta = _ri(5, 15) * (Math.random() < 0.5 ? -1 : 1);
  const v = Math.max(0, Math.min(100, cur + delta));
  trackSendValues[track][kind] = v;
  const node = kind === 'delay' ? trackDelaySends[track] : trackReverbSends[track];
  if(node) node.gain.value = v / 100;
  trackSendKnobs[track]?.[kind]?.setValue(v);
  return true;
}

function evolveOnce(){
  const n = pickEvolveCount();
  let changed = false;
  for(let k = 0; k < n; k++){
    let op = pickEvolveOp();
    // If the chosen op can't apply (no active acid steps, wrong instrument,
    // etc.) fall through to a step toggle — keeps the bar feeling alive.
    let ok;
    if(op === 'pitch')      ok = evolveAcidPitch();
    else if(op === 'fm')    ok = evolveFmTweak();
    else if(op === 'send')  ok = evolveSendNudge();
    else                    ok = evolveStepToggle();
    if(!ok) ok = evolveStepToggle();
    changed = changed || ok;
  }
  if(changed){
    renderPage();
    renderMiniGrid(miniGridBar);
    saveStateSoon();
  }
}

function setEvolving(on){
  if(on === evolving) return;
  if(on){
    // Freeze the user's authored pattern before any mutation runs.
    preEvolveSnapshot = snapshotPatternState();
    evolving = true;
  } else {
    evolving = false;
    if(preEvolveSnapshot){
      restorePatternState(preEvolveSnapshot);
      preEvolveSnapshot = null;
      renderPage();
      renderMiniGrid(miniGridBar);
      saveStateSoon();
    }
  }
  if(evolveBtnEl){
    evolveBtnEl.classList.toggle('evolving', evolving);
    evolveBtnEl.setAttribute('aria-pressed', String(evolving));
  }
}

/* ---- randomize popup (tree of checkboxes) ---- */
evolveBtnEl = document.getElementById('evolveBtn');
// Null-safe: a stale HTML cache without the evolveBtn shouldn't take the whole
// app down. The mode is still callable via setEvolving() in devtools.
if(evolveBtnEl) evolveBtnEl.addEventListener('click', () => setEvolving(!evolving));
const rndBtn = document.getElementById('rndBtn');
const rndPopup = document.getElementById('rndPopup');
const rndTreeEl = document.getElementById('rndTree');

// Build the checkbox tree from RND_TREE. Each row stores a flat list of
// descendant leaf ids on the input element via dataset; cascade toggling is
// just "set all descendant leaves to this row's checked state, then re-sync
// every parent's visual state".
function buildRndTree(){
  const allInputs = []; // [{ input, leafIds }]
  function build(nodes, depth){
    nodes.forEach(node => {
      const row = document.createElement('label');
      row.className = 'rnd-row';
      row.style.paddingLeft = (depth * 14) + 'px';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.rnd = node.id;
      const span = document.createElement('span');
      span.textContent = node.label;
      row.append(input, span);
      rndTreeEl.appendChild(row);
      // collect leaf ids beneath this node (for cascade); a leaf node owns itself.
      const leafIds = [];
      if(node.children){
        const collect = (n) => n.children ? n.children.forEach(collect) : leafIds.push(n.id);
        collect(node);
      } else {
        leafIds.push(node.id);
      }
      allInputs.push({ input, leafIds });
      input.addEventListener('change', () => {
        // Set every descendant leaf in the mask to this row's new checked state,
        // then re-sync every checkbox in the tree from the mask.
        leafIds.forEach(id => { _rndMask[id] = input.checked; });
        syncTreeChecks();
      });
      if(node.children) build(node.children, depth + 1);
    });
  }
  function syncTreeChecks(){
    allInputs.forEach(({ input, leafIds }) => {
      const on = leafIds.every(id => _rndMask[id]);
      const off = leafIds.every(id => !_rndMask[id]);
      input.checked = on;
      input.indeterminate = !on && !off;
    });
  }
  build(RND_TREE, 0);
  syncTreeChecks();
}
buildRndTree();

function openRndPopup(anchorEl){
  rndPopup.hidden = false;
  positionPopupAbove(rndPopup, anchorEl);
}
function closeRndPopup(){ rndPopup.hidden = true; }
document.getElementById('rndClose').addEventListener('click', closeRndPopup);
document.getElementById('rndGo').addEventListener('click', () => { runRandomize(); closeRndPopup(); });

// Left-click = randomize now. Right-click / long-press (touch) = open popup.
rndBtn.addEventListener('click', runRandomize);
rndBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); openRndPopup(rndBtn); });
{
  let lpTimer = null;
  rndBtn.addEventListener('pointerdown', (e) => {
    if(e.pointerType === 'touch') lpTimer = setTimeout(() => { openRndPopup(rndBtn); lpTimer = null; }, 450);
  });
  const clearLP = () => { if(lpTimer){ clearTimeout(lpTimer); lpTimer = null; } };
  rndBtn.addEventListener('pointerup', clearLP);
  rndBtn.addEventListener('pointercancel', clearLP);
  rndBtn.addEventListener('pointermove', clearLP);
}
// outside-click closes the rnd popup; clicks on the die itself re-open via
// contextmenu/long-press, so don't treat those as outside.
document.addEventListener('pointerdown', (e) => {
  if(rndPopup.hidden) return;
  if(rndPopup.contains(e.target)) return;
  if(e.target.closest && e.target.closest('#rndBtn')) return;
  closeRndPopup();
}, true);

/* ---- post-load DOM sync ---- */
// loadState() ran early to mutate state vars before the DOM builders read them
// (so step .on classes, knob angles, mute/solo, etc. all reflect saved state
// at build time). A few things still need a final sync though: the BPM input
// keeps its HTML default until setTempo writes to it, the modal grid build
// uses raw 0–15 indices that only match bar 0, and the ACID button is
// hardcoded `active`. These calls reconcile that. Lives at the end of the
// file so all const/let declarations it touches are already initialized.
setTempo(TEMPO_BPM);
renderPage();
setAcidInstrument(acidInstrument);
swingKnobCtl.setValue((swingPct - 50) * 4);
adsrKnobCtl.setValue(adsrScale);
