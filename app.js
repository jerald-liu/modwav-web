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
const NAV_FADE_PX = 90; // fully faded before content scrolls up into the banner
function updateNavFade(){
  const o = Math.max(0, 1 - window.scrollY / NAV_FADE_PX);
  navEl.style.opacity = o.toFixed(3);
}
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
  fmPopupStep.textContent = stepIdx + 1;
  fmRatioInput.value = FM_RATIO[stepIdx];
  fmIndexInput.value = FM_INDEX[stepIdx];
  fmRatioVal.textContent = (+FM_RATIO[stepIdx]).toFixed(2);
  fmIndexVal.textContent = FM_INDEX[stepIdx];
  fmPopup.hidden = false;
  // position above the step, relative to the modal
  const modal = anchorEl.closest('.synth-modal');
  const stepR = anchorEl.getBoundingClientRect();
  const modalR = modal.getBoundingClientRect();
  const popR = fmPopup.getBoundingClientRect();
  let left = (stepR.left + stepR.width/2) - modalR.left - popR.width/2;
  let top = stepR.top - modalR.top - popR.height - 8;
  if(top < 4){ top = stepR.bottom - modalR.top + 8; }
  left = Math.max(8, Math.min(modalR.width - popR.width - 8, left));
  fmPopup.style.left = left + 'px';
  fmPopup.style.top = top + 'px';
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
});
fmIndexInput.addEventListener('input', ()=>{
  if(fmPopupStepIdx < 0) return;
  const v = +fmIndexInput.value;
  FM_INDEX[fmPopupStepIdx] = v;
  fmIndexVal.textContent = v;
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

/* ---------------- step sequencer ---------------- */
let ctx = null;
let masterGain = null;
let analyser = null;
let running = false;
let droneNodes = [];
let delayReturn = null;
let reverbReturn = null;
let delayBusInput = null;
let reverbBusInput = null;
const trackGains = {};
const trackDelaySends = {};
const trackReverbSends = {};

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

const STEPS = 16;
let TEMPO_BPM = 140;
let STEP_SECONDS = 60 / TEMPO_BPM / 4;
let delayNodeRef = null;

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
const ACID_NOTES = [36,36,39,41, 36,36,43,36, 39,41,36,36, 44,36,41,39];
const ACID_NOTE_MIN = 24; // C1
const ACID_NOTE_MAX = 60; // C4

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
TRACKS.forEach(t => { trackMute[t.id] = false; trackSolo[t.id] = false; });
function unmuteAll(){
  TRACKS.forEach(t => {
    if(trackMute[t.id]){
      trackMute[t.id] = false;
      muteButtons[t.id]?.classList.remove('active');
    }
  });
}
document.getElementById('unmuteAllBtn').addEventListener('click', unmuteAll);
function trackAudible(id){
  const anySolo = TRACKS.some(t => trackSolo[t.id]);
  if(anySolo) return trackSolo[id]; // solo overrides mute on the soloed track
  return !trackMute[id];
}

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
  muteBtn.addEventListener('click', ()=>{
    trackMute[track.id] = !trackMute[track.id];
    muteBtn.classList.toggle('active', trackMute[track.id]);
  });
  muteButtons[track.id] = muteBtn;
  const soloBtn = document.createElement('button');
  soloBtn.type = 'button';
  soloBtn.className = 'track-ctrl-btn solo';
  soloBtn.textContent = 'S';
  soloBtn.title = `solo ${track.label}`;
  soloBtn.addEventListener('click', ()=>{
    trackSolo[track.id] = !trackSolo[track.id];
    soloBtn.classList.toggle('active', trackSolo[track.id]);
  });
  ctrl.append(muteBtn, soloBtn);
  label.appendChild(ctrl);
  seqEl.appendChild(label);

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
      pattern[track.id][s] = pattern[track.id][s] ? 0 : 1;
      btn.classList.toggle('on');
      const barStep = barSeqEl.querySelector(`.bar-step[data-track="${track.id}"][data-step="${s}"]`);
      if(barStep) barStep.classList.toggle('on');
    }

    if(track.id === 'acid'){
      // acid steps carry a per-step pitch; drag up/down to retune, click to toggle
      btn.classList.add('step-pitch');
      const noteLabel = document.createElement('span');
      noteLabel.className = 'note-name mono';
      noteLabel.textContent = noteName(ACID_NOTES[s]);
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
        startNote = ACID_NOTES[s];
        longPressTimer = setTimeout(()=>{
          if(!moved){ longPressed = true; openFMPopup(s, btn); }
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
        if(next !== ACID_NOTES[s]){
          ACID_NOTES[s] = next;
          noteLabel.textContent = noteName(next);
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
        openFMPopup(s, btn);
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
  const defaults = TRACK_SEND_DEFAULTS[track.id];
  const delayKnob = document.createElement('input');
  delayKnob.type = 'range'; delayKnob.min = 0; delayKnob.max = 100;
  delayKnob.value = defaults.delay;
  delayKnob.className = 'send-knob';
  delayKnob.title = `${track.label} → delay send`;
  delayKnob.addEventListener('input', ()=>{
    trackSendValues[track.id].delay = +delayKnob.value;
    if(trackDelaySends[track.id]) trackDelaySends[track.id].gain.value = delayKnob.value / 100;
  });
  const reverbKnob = document.createElement('input');
  reverbKnob.type = 'range'; reverbKnob.min = 0; reverbKnob.max = 100;
  reverbKnob.value = defaults.reverb;
  reverbKnob.className = 'send-knob';
  reverbKnob.title = `${track.label} → reverb send`;
  reverbKnob.addEventListener('input', ()=>{
    trackSendValues[track.id].reverb = +reverbKnob.value;
    if(trackReverbSends[track.id]) trackReverbSends[track.id].gain.value = reverbKnob.value / 100;
  });
  sends.appendChild(labelTag('D', delayKnob));
  sends.appendChild(labelTag('R', reverbKnob));
  seqEl.appendChild(sends);
});

function updateScrollEdges(el, frame){
  const target = frame || el.parentElement;
  const max = el.scrollWidth - el.clientWidth;
  target.classList.toggle('at-start', el.scrollLeft <= 1);
  target.classList.toggle('at-end', el.scrollLeft >= max - 1);
}
function refreshAllScrollEdges(){
  document.querySelectorAll('.seq-row-scroll').forEach(el => updateScrollEdges(el));
}

function labelTag(text, input){
  const wrap = document.createElement('label');
  wrap.className = 'send-knob-wrap mono';
  const tag = document.createElement('span');
  tag.textContent = text;
  wrap.appendChild(tag);
  wrap.appendChild(input);
  return wrap;
}

const toggleBtn = document.getElementById('synthToggle');
const statusDot = document.getElementById('statusDot');
const modalDot = document.getElementById('modalDot');
const statusText = document.getElementById('statusText');
const delayAmtEl = document.getElementById('delayAmt');
const reverbAmtEl = document.getElementById('reverbAmt');
const bpmAmtEl = document.getElementById('bpmAmt');
const tempoCtrlEl = document.querySelector('.tempo-ctrl');

delayAmtEl.addEventListener('input', ()=>{
  if(delayReturn) delayReturn.gain.value = delayAmtEl.value / 100;
});
reverbAmtEl.addEventListener('input', ()=>{
  if(reverbReturn) reverbReturn.gain.value = reverbAmtEl.value / 100;
});
function setTempo(bpm){
  bpm = Math.max(60, Math.min(180, Math.round(bpm)));
  TEMPO_BPM = bpm;
  STEP_SECONDS = 60 / TEMPO_BPM / 4;
  if(bpmAmtEl.value != bpm) bpmAmtEl.value = bpm;
  if(delayNodeRef && ctx){
    delayNodeRef.delayTime.setTargetAtTime(STEP_SECONDS * 3, ctx.currentTime, 0.03);
  }
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
  tempoCtrlEl.addEventListener('pointerup', (e)=>{
    if(!dragging) return;
    dragging = false;
    try { tempoCtrlEl.releasePointerCapture(e.pointerId); } catch(_){}
    tempoCtrlEl.classList.remove('dragging');
    if(!moved && e.target === bpmAmtEl){
      bpmAmtEl.focus(); bpmAmtEl.select();
    }
  });
})();

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
  delayBusInput = ctx.createGain();
  delayBusInput.gain.value = 1;
  const delayNode = ctx.createDelay(2.0);
  delayNode.delayTime.value = STEP_SECONDS * 3;
  delayNodeRef = delayNode;
  const delayFb = ctx.createGain();
  delayFb.gain.value = 0.42;
  const delayDamp = ctx.createBiquadFilter();
  delayDamp.type = 'lowpass';
  delayDamp.frequency.value = 3200;
  delayReturn = ctx.createGain();
  delayReturn.gain.value = delayAmtEl.value / 100;
  delayBusInput.connect(delayNode);
  delayNode.connect(delayDamp);
  delayDamp.connect(delayFb);
  delayFb.connect(delayNode);
  delayDamp.connect(delayReturn);
  delayReturn.connect(analyser);

  // reverb bus — algorithmic impulse response. reverbBusInput sums each track's send.
  reverbBusInput = ctx.createGain();
  reverbBusInput.gain.value = 1;
  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulseResponse(ctx, 2.6, 2.8);
  reverbReturn = ctx.createGain();
  reverbReturn.gain.value = reverbAmtEl.value / 100;
  reverbBusInput.connect(reverb);
  reverb.connect(reverbReturn);
  reverbReturn.connect(analyser);

  analyser.connect(ctx.destination);

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
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(38.7, t);
  osc.frequency.exponentialRampToValueAtTime(106.8, t + 0.001);
  osc.frequency.exponentialRampToValueAtTime(32, t + 0.14);

  const ampEnv = ctx.createGain();
  ampEnv.gain.setValueAtTime(0.0001, t);
  ampEnv.gain.exponentialRampToValueAtTime(1.0, t + 0.002);
  ampEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);

  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for(let i=0;i<256;i++){ const x = (i/255)*2-1; curve[i] = Math.tanh(x*2.2); }
  shaper.curve = curve;

  const click = ctx.createOscillator();
  click.type = 'square';
  click.frequency.value = 1800;
  const clickEnv = ctx.createGain();
  clickEnv.gain.setValueAtTime(0.18, t);
  clickEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.006);

  osc.connect(shaper);
  shaper.connect(ampEnv);
  ampEnv.connect(dest);
  click.connect(clickEnv);
  clickEnv.connect(dest);

  osc.start(t); osc.stop(t + 0.58);
  click.start(t); click.stop(t + 0.01);
}

function playSnare(ctx, t, dest){
  const osc1 = ctx.createOscillator();
  osc1.type = 'triangle';
  osc1.frequency.value = 190;
  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.value = 264;

  const bodyEnv = ctx.createGain();
  bodyEnv.gain.setValueAtTime(0.45, t);
  bodyEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);

  osc1.connect(bodyEnv);
  osc2.connect(bodyEnv);
  bodyEnv.connect(dest);
  osc1.start(t); osc1.stop(t + 0.14);
  osc2.start(t); osc2.stop(t + 0.14);

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
  noiseEnv.gain.setValueAtTime(0.55, t);
  noiseEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);

  noise.connect(highpass);
  highpass.connect(bandpass);
  bandpass.connect(noiseEnv);
  noiseEnv.connect(dest);
  noise.start(t);
  noise.stop(t + 0.18);
}

function playHat(ctx, t, dest){
  const ratios = [1, 1.342, 1.787, 2.0, 2.245, 2.6];
  const fundamental = 245;
  const hatGain = ctx.createGain();

  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 6800;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.28, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);

  ratios.forEach(r=>{
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = fundamental * r;
    o.connect(hatGain);
    o.start(t);
    o.stop(t + 0.06);
  });

  hatGain.connect(highpass);
  highpass.connect(env);
  env.connect(dest);
}

let acidLastFreq = null;

function midiToFreq(m){ return 440 * Math.pow(2, (m-69)/12); }

function stepWobble(stepIndex, salt){
  const x = Math.sin(stepIndex * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function playAcid(ctx, t, stepIndex, sliding, dest){
  const note = ACID_NOTES[stepIndex % ACID_NOTES.length];
  const freq = midiToFreq(note);
  const accented = !!ACID_ACCENT[stepIndex % ACID_ACCENT.length];

  const wCutoff = stepWobble(stepIndex, 1);
  const wReso = stepWobble(stepIndex, 2);
  const wDecay = stepWobble(stepIndex, 3);

  const q = (accented ? 11 : 6) + wReso * 7;
  const peakGain = accented ? 0.34 : 0.22;
  const noteLen = STEP_SECONDS * (1.3 + wDecay * 1.1);
  const noteTrack = (freq / midiToFreq(36)) * 400;
  const cutoffPeak = (accented ? 2800 : 1500) + noteTrack + wCutoff * 1100;
  const cutoffFloor = 160 + wCutoff * 90;

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  if(sliding && acidLastFreq){
    osc.frequency.setValueAtTime(acidLastFreq, t);
    osc.frequency.linearRampToValueAtTime(freq, t + STEP_SECONDS * 0.75);
  } else {
    osc.frequency.setValueAtTime(freq, t);
  }

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(cutoffPeak, t);
  filter.frequency.exponentialRampToValueAtTime(cutoffFloor, t + noteLen * (0.7 + wDecay * 0.2));

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peakGain, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + noteLen);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  osc.start(t);
  osc.stop(t + STEP_SECONDS * 2.5);

  acidLastFreq = freq;
}

function playFM(ctx, t, stepIndex, sliding, dest){
  const note = ACID_NOTES[stepIndex];
  const freq = midiToFreq(note);
  const ratio = FM_RATIO[stepIndex];
  const index = FM_INDEX[stepIndex];
  const accented = !!ACID_ACCENT[stepIndex];
  const noteLen = STEP_SECONDS * 1.4;
  const startFreq = (sliding && acidLastFreq) ? acidLastFreq : freq;

  const carrier = ctx.createOscillator();
  carrier.type = 'sine';
  carrier.frequency.setValueAtTime(startFreq, t);

  const mod = ctx.createOscillator();
  mod.type = 'sine';
  mod.frequency.setValueAtTime(startFreq * ratio, t);

  if(sliding && acidLastFreq){
    carrier.frequency.linearRampToValueAtTime(freq, t + STEP_SECONDS * 0.7);
    mod.frequency.linearRampToValueAtTime(freq * ratio, t + STEP_SECONDS * 0.7);
  }

  // mod depth scales with note frequency so timbre stays consistent across pitches
  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(freq * (index / 100), t);
  mod.connect(modGain);
  modGain.connect(carrier.frequency);

  const ampEnv = ctx.createGain();
  const peakGain = accented ? 0.36 : 0.24;
  ampEnv.gain.setValueAtTime(0.0001, t);
  ampEnv.gain.exponentialRampToValueAtTime(peakGain, t + 0.006);
  ampEnv.gain.exponentialRampToValueAtTime(0.0001, t + noteLen);

  carrier.connect(ampEnv);
  ampEnv.connect(dest);

  carrier.start(t); carrier.stop(t + STEP_SECONDS * 2);
  mod.start(t); mod.stop(t + STEP_SECONDS * 2);

  acidLastFreq = freq;
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
        const prevIndex = (stepIndex - 1 + STEPS) % STEPS;
        const isFM = acidInstrument === 'fm';
        const sliding = !isFM && !!pattern.acid[prevIndex];
        const voice = isFM ? playFM : playAcid;
        voice(ctx, time, stepIndex, sliding, dest);
      }
    } else if(pattern[track.id][stepIndex]){
      VOICES[track.id](ctx, time, dest);
    }
  });
  highlightPlayhead(stepIndex);
}

function highlightPlayhead(stepIndex){
  // modal grid
  document.querySelectorAll('.step.playhead').forEach(el=>el.classList.remove('playhead'));
  document.querySelectorAll(`.step[data-step="${stepIndex}"]`).forEach(el=>el.classList.add('playhead'));
  // bar mini grid
  document.querySelectorAll('.bar-step.playhead').forEach(el=>el.classList.remove('playhead'));
  document.querySelectorAll(`.bar-step[data-step="${stepIndex}"]`).forEach(el=>el.classList.add('playhead'));
}

function schedulerLoop(){
  while(nextStepTime < ctx.currentTime + SCHEDULE_AHEAD){
    scheduleStep(currentStep, nextStepTime);
    nextStepTime += STEP_SECONDS;
    currentStep = (currentStep + 1) % STEPS;
  }
  schedulerTimer = setTimeout(schedulerLoop, 25);
}

function startSequencer(){
  currentStep = 0;
  nextStepTime = ctx.currentTime + 0.05;
  acidLastFreq = null;
  schedulerLoop();
}

function stopSequencer(){
  if(schedulerTimer) clearTimeout(schedulerTimer);
  document.querySelectorAll('.step.playhead').forEach(el=>el.classList.remove('playhead'));
  document.querySelectorAll('.bar-step.playhead').forEach(el=>el.classList.remove('playhead'));
}

function setPlayingState(isPlaying){
  running = isPlaying;
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
  document.querySelectorAll('#barSeq .bar-step').forEach(el=>{
    const id = el.dataset.track;
    const s = +el.dataset.step;
    el.classList.toggle('on', !!pattern[id][s]);
  });
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

/* ---------------- export: 4-bar stems + mix + MIDI ---------------- */
const EXPORT_BARS = 4;
const EXPORT_SR = 44100;

// rebuild the live FX topology (per-track gain + delay/reverb buses) inside an
// offline context so exported audio matches what you hear.
function buildOfflineGraph(octx, trackIds){
  const master = octx.createGain();
  master.gain.value = 0.6;
  master.connect(octx.destination);

  const delayBusInput = octx.createGain();
  const delayNode = octx.createDelay(2.0);
  delayNode.delayTime.value = STEP_SECONDS * 3;
  const delayFb = octx.createGain(); delayFb.gain.value = 0.42;
  const delayDamp = octx.createBiquadFilter();
  delayDamp.type = 'lowpass'; delayDamp.frequency.value = 3200;
  const delayReturn = octx.createGain();
  delayReturn.gain.value = (+delayAmtEl.value) / 100;
  delayBusInput.connect(delayNode);
  delayNode.connect(delayDamp);
  delayDamp.connect(delayFb);
  delayFb.connect(delayNode);
  delayDamp.connect(delayReturn);
  delayReturn.connect(octx.destination);

  const reverbBusInput = octx.createGain();
  const reverb = octx.createConvolver();
  reverb.buffer = makeImpulseResponse(octx, 2.6, 2.8);
  const reverbReturn = octx.createGain();
  reverbReturn.gain.value = (+reverbAmtEl.value) / 100;
  reverbBusInput.connect(reverb);
  reverb.connect(reverbReturn);
  reverbReturn.connect(octx.destination);

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
  const totalSteps = STEPS * EXPORT_BARS;
  const startPad = 0.02;
  const loopLen = totalSteps * STEP_SECONDS;
  const tail = 2.0; // let delay/reverb tails ring out
  const length = Math.ceil(EXPORT_SR * (startPad + loopLen + tail));
  const octx = new OfflineAudioContext(2, length, EXPORT_SR);
  const gains = buildOfflineGraph(octx, trackIds);

  acidLastFreq = null;
  for(let step=0; step<totalSteps; step++){
    const sIdx = step % STEPS;
    const t = startPad + step * STEP_SECONDS;
    trackIds.forEach(id=>{
      if(id === 'acid'){
        if(pattern.acid[sIdx]){
          const prev = (sIdx - 1 + STEPS) % STEPS;
          const isFM = acidInstrument === 'fm';
          const sliding = !isFM && !!pattern.acid[prev];
          const voice = isFM ? playFM : playAcid;
          voice(octx, t, sIdx, sliding, gains.acid);
        }
      } else if(pattern[id][sIdx]){
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

// Standard MIDI File (format 1): drums on ch10, acid melodic on ch1, 4 bars
function buildMidi(){
  const TPQ = 480;
  const stepTicks = TPQ / 4; // 16th note
  const totalSteps = STEPS * EXPORT_BARS;
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
    for(let step=0; step<totalSteps; step++){
      if(pattern[id][step % STEPS]){
        const onTick = step * stepTicks;
        events.push({ tick:onTick, order:1, data:[0x90|DRUM_CH, note, 100] });
        events.push({ tick:onTick + Math.floor(stepTicks*0.5), order:0, data:[0x80|DRUM_CH, note, 0] });
      }
    }
    tracks.push(eventsToTrack(events));
  });

  {
    const events = [];
    for(let step=0; step<totalSteps; step++){
      const sIdx = step % STEPS;
      if(pattern.acid[sIdx]){
        const note = ACID_NOTES[sIdx];
        const accent = !!ACID_ACCENT[sIdx];
        const onTick = step * stepTicks;
        const nextActive = !!pattern.acid[(sIdx + 1) % STEPS];
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
  return new TextEncoder().encode(
`mod.wav — your 4-bar loop
==========================

Rendered live from the signal generator. ${bpm} BPM, ${EXPORT_BARS} bars.
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
