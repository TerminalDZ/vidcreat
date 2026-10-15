/** Base stylesheet of the runtime. Every color/size comes from theme CSS variables. No CSS animations: time is driven by render(t). */
export const BASE_CSS = String.raw`
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; animation: none !important; transition: none !important; }
html, body { background: var(--bg); overflow: hidden; }
body { -webkit-font-smoothing: antialiased; text-rendering: geometricPrecision; font-kerning: normal; }
#rf-root { position: relative; overflow: hidden; background: var(--bg); color: var(--ink);
  font-family: var(--f-display); contain: strict; }
.rf-layer { position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; }
.rf-world { position: absolute; left: 0; top: 0; width: 100%; height: 100%; will-change: transform; }

/* background */
.rf-bgc { position: absolute; left: 0; top: 0; will-change: transform; }
.rf-gridc { position: absolute; left: 0; top: 0; will-change: transform; }

/* header */
.rf-header { position: absolute; left: 60px; right: 60px; height: 120px; font-family: var(--f-mono); }
.rf-progress { position: absolute; left: 0; right: 0; top: 0; height: 6px; border-radius: 6px; background: var(--line); overflow: hidden; }
.rf-progress-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transform-origin: 0 50%; background: var(--lime); border-radius: 6px; }
.rf-progress-tick { position: absolute; top: -3px; width: 3px; height: 12px; margin-left: -1.5px; background: var(--bg); }
.rf-hrow { position: absolute; left: 0; right: 0; top: 30px; display: flex; align-items: center; justify-content: space-between;
  font-size: 26px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink); }
.rf-series { display: flex; align-items: center; gap: 16px; font-weight: 700; }
.rf-series::before { content: ''; width: 16px; height: 16px; background: var(--lime); border-radius: 3px; box-shadow: 0 0 18px var(--lime); }
.rf-ep { color: var(--dim); font-weight: 600; }
.rf-chapter { position: absolute; left: 0; right: 0; top: 76px; height: 34px; overflow: hidden; font-size: 24px; letter-spacing: 0.14em;
  color: var(--lime); font-weight: 600; text-transform: uppercase; }
.rf-chapter span { position: absolute; left: 0; top: 0; white-space: nowrap; }

/* scenes & elements */
.rf-scene { position: absolute; overflow: visible; transform-origin: 50% 50%; }
.rf-el { position: absolute; transform-origin: 50% 50%; }
.rf-c { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }

/* captions */
.rf-captions { position: absolute; text-align: center; font-family: var(--f-arabic); font-weight: 800;
  line-height: 1.32; color: var(--ink); }
.rf-chunk { position: absolute; left: 0; top: 0; width: 100%; }
.rf-cline { background: var(--scrim); padding: 0.06em 0.34em 0.12em; border-radius: 18px;
  -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.rf-tok { display: inline-block; white-space: nowrap; transform-origin: 50% 60%; }
.rf-tok bdi { unicode-bidi: isolate; direction: ltr; }

/* waveform */
.rf-wave { position: absolute; left: 50%; display: flex; align-items: center; gap: 6px; transform: translateX(-50%); }
.rf-wave i { display: block; width: 6px; border-radius: 4px; background: var(--lime); }

/* overlays */
.rf-vignette, .rf-flash { position: absolute; inset: 0; }
.rf-grain { position: absolute; left: 0; top: 0; will-change: transform; }
.rf-vignette { will-change: transform; }

/* ------- components ------- */
.rf-card { background: var(--card); border: 2px solid var(--line); border-radius: 26px; }

.c-title { display: flex; flex-direction: column; justify-content: center; height: 100%; font-weight: 800; line-height: 1.04; letter-spacing: -0.02em; }
.c-title .t-main { white-space: pre-wrap; }
.c-title .t-sub { margin-top: 18px; font-family: var(--f-mono); font-size: 30px; font-weight: 500; letter-spacing: 0.08em; color: var(--dim); text-transform: uppercase; }
.c-title .t-hide { opacity: 0; }

.c-label { display: flex; align-items: center; gap: 14px; height: 100%; font-family: var(--f-mono); text-transform: uppercase; letter-spacing: 0.18em; font-weight: 600; white-space: nowrap; }
.c-label .dot { width: 14px; height: 14px; border-radius: 50%; background: currentColor; box-shadow: 0 0 16px currentColor; flex: none; }

.c-code { display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,.45); }
.c-code .bar { display: flex; align-items: center; gap: 12px; height: 62px; padding: 0 26px; border-bottom: 2px solid var(--line); flex: none; }
.c-code .bar i { width: 15px; height: 15px; border-radius: 50%; background: var(--line); }
.c-code .bar i:nth-child(1) { background: var(--red); } .c-code .bar i:nth-child(2) { background: var(--amber); } .c-code .bar i:nth-child(3) { background: var(--lime); }
.c-code .bar b { margin-left: 14px; font-family: var(--f-mono); font-weight: 500; font-size: 24px; color: var(--dim); letter-spacing: 0.04em; }
.c-code .body { position: relative; padding: 22px 0; font-family: var(--f-mono); direction: ltr; text-align: left; }
.c-code .ln { position: relative; display: flex; white-space: pre; padding: 0 30px 0 0; line-height: 1.55; }
.c-code .ln .no { width: 74px; flex: none; text-align: right; padding-right: 22px; color: var(--line); filter: brightness(1.8); }
.c-code .ln .hl { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transform-origin: 0 50%; border-left: 6px solid; }
.c-code .ln .tx { position: relative; }
.c-code .caret { display: inline-block; width: 0.58em; height: 1.1em; margin-left: 2px; vertical-align: -0.18em; background: var(--lime); }
.tk-kw { color: var(--violet); } .tk-str { color: var(--lime); } .tk-num { color: var(--amber); } .tk-com { color: var(--dim); font-style: italic; }
.tk-fn { color: var(--cyan); } .tk-ty { color: var(--amber); } .tk-op { color: var(--dim); }

.c-node { display: flex; flex-direction: column; justify-content: center; gap: 8px; height: 100%; padding: 0 30px; border: 3px solid; border-radius: 26px; overflow: hidden; }
.c-node .n-top { display: flex; align-items: center; gap: 14px; }
.c-node .n-title { font-size: 46px; font-weight: 700; letter-spacing: -0.01em; white-space: nowrap; }
.c-node .n-sub { font-family: var(--f-mono); font-size: 25px; color: var(--dim); white-space: nowrap; }
.c-node .n-badge { position: absolute; top: 16px; right: 18px; font-family: var(--f-mono); font-size: 20px; padding: 4px 12px; border-radius: 999px; font-weight: 700; letter-spacing: .08em; }
.c-node .n-dot { position: absolute; top: 22px; right: 22px; width: 16px; height: 16px; border-radius: 50%; }
.c-node .n-spin { position: absolute; top: 18px; right: 18px; width: 26px; height: 26px; border-radius: 50%; border: 4px solid transparent; }

.c-arrow svg { position: absolute; left: 0; top: 0; overflow: visible; }
.c-arrow .a-label { position: absolute; transform: translate(-50%, -50%); padding: 8px 18px; border-radius: 999px; background: var(--bg); border: 2px solid;
  font-family: var(--f-mono); font-size: 24px; font-weight: 600; white-space: nowrap; letter-spacing: 0.02em; }
.c-arrow .a-pk { position: absolute; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%; }
.c-arrow .a-pkl { position: absolute; transform: translate(-50%, -150%); font-family: var(--f-mono); font-size: 20px; white-space: nowrap; }

.c-chip { display: flex; align-items: center; justify-content: center; height: 100%; }
.c-chip .pill { position: relative; display: inline-flex; align-items: center; gap: 14px; padding: 0 34px; height: 100%; border-radius: 999px; border: 3px solid;
  font-family: var(--f-mono); font-weight: 700; white-space: nowrap; }
.c-chip .strike { position: absolute; left: 18px; right: 18px; top: 50%; height: 5px; margin-top: -2.5px; transform-origin: 0 50%; border-radius: 4px; }

.c-stamp { display: flex; align-items: center; justify-content: center; height: 100%; }
.c-stamp .st { padding: 0.06em 0.34em 0.1em; border: 0.075em solid; border-radius: 0.14em; font-weight: 900; letter-spacing: 0.02em; line-height: 1; white-space: nowrap; text-transform: uppercase; }

.c-table { overflow: hidden; display: flex; flex-direction: column; }
.c-table .tr { position: relative; display: flex; align-items: center; border-bottom: 2px solid var(--line); flex: none; }
.c-table .tr:last-child { border-bottom: none; }
.c-table .th { font-family: var(--f-mono); text-transform: uppercase; letter-spacing: .1em; color: var(--dim); font-weight: 600; background: rgba(255,255,255,.02); }
.c-table .td { padding: 0 24px; white-space: nowrap; overflow: hidden; text-overflow: clip; font-family: var(--f-mono); }
.c-table .rowbg { position: absolute; inset: 0; }
.c-table .rstrike { position: absolute; left: 16px; right: 16px; top: 50%; height: 4px; transform-origin: 0 50%; border-radius: 3px; }

.c-lanes { display: flex; gap: 26px; height: 100%; }
.c-lanes .lane { position: relative; flex: 1; display: flex; flex-direction: column; min-width: 0; }
.c-lanes .lh { height: 74px; display: flex; align-items: center; justify-content: center; gap: 12px; border-radius: 20px 20px 0 0; border: 3px solid; border-bottom: none;
  font-family: var(--f-mono); font-size: 28px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.c-lanes .lb { position: relative; flex: 1; border: 3px solid; border-top-width: 2px; border-radius: 0 0 20px 20px; }
.c-lanes .step { position: absolute; left: 16px; right: 16px; display: flex; align-items: center; gap: 12px; padding: 0 18px; border-radius: 14px; border: 2px solid var(--line);
  background: var(--card); font-family: var(--f-mono); white-space: nowrap; overflow: hidden; }
.c-lanes .step .mk { margin-left: auto; font-weight: 800; }

.c-check { display: flex; flex-direction: column; justify-content: center; gap: 22px; height: 100%; }
.c-check .ct { font-family: var(--f-mono); font-size: 26px; letter-spacing: .16em; color: var(--dim); text-transform: uppercase; margin-bottom: 6px; }
.c-check .it { display: flex; align-items: center; gap: 26px; }
.c-check .bx { position: relative; flex: none; border: 4px solid var(--line); border-radius: 12px; }
.c-check .bx svg { position: absolute; inset: -4px; overflow: visible; }
.c-check .tx { font-weight: 600; white-space: nowrap; }

.c-counter { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; }
.c-counter .v { font-weight: 800; letter-spacing: -0.04em; line-height: 1; font-variant-numeric: tabular-nums; white-space: nowrap; direction: ltr; }
.c-counter .l { margin-top: 14px; font-family: var(--f-mono); font-size: 28px; color: var(--dim); letter-spacing: .14em; text-transform: uppercase; }

.c-meter { display: flex; flex-direction: column; justify-content: center; height: 100%; gap: 18px; }
.c-meter .mh { display: flex; justify-content: space-between; align-items: baseline; font-family: var(--f-mono); }
.c-meter .ml { font-size: 26px; color: var(--dim); letter-spacing: .12em; text-transform: uppercase; }
.c-meter .mv { font-size: 44px; font-weight: 700; direction: ltr; }
.c-meter .track { position: relative; height: 44px; border-radius: 14px; background: var(--card); border: 2px solid var(--line); overflow: visible; }
.c-meter .fill { position: absolute; left: 4px; top: 4px; bottom: 4px; border-radius: 10px; transform-origin: 0 50%; }
.c-meter .thr { position: absolute; top: -14px; bottom: -14px; width: 4px; margin-left: -2px; border-radius: 2px; }
.c-meter .thl { position: absolute; top: -48px; transform: translateX(-50%); font-family: var(--f-mono); font-size: 20px; white-space: nowrap; }

.c-tl { position: relative; height: 100%; }
.c-tl .axis { position: absolute; left: 0; right: 0; height: 4px; border-radius: 2px; transform-origin: 0 50%; }
.c-tl .mk { position: absolute; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; }
.c-tl .mk .pin { width: 26px; height: 26px; border-radius: 50%; border: 5px solid; background: var(--bg); }
.c-tl .mk .lab { margin-top: 14px; font-family: var(--f-mono); font-size: 26px; font-weight: 700; white-space: nowrap; }
.c-tl .mk .sub { margin-top: 4px; font-family: var(--f-mono); font-size: 20px; color: var(--dim); white-space: nowrap; }
.c-tl .end { position: absolute; font-family: var(--f-mono); font-size: 22px; color: var(--dim); }
.c-tl .cur { position: absolute; width: 4px; margin-left: -2px; border-radius: 2px; }

.c-grid { display: flex; flex-direction: column; height: 100%; }
.c-grid .gl { font-family: var(--f-mono); font-size: 26px; color: var(--dim); letter-spacing: .14em; text-transform: uppercase; margin-bottom: 18px; text-align: center; }
.c-grid .gg { flex: 1; display: grid; }
.c-grid .tile { position: relative; display: flex; align-items: center; justify-content: center; border-radius: 16px; border: 3px solid;
  font-family: var(--f-mono); font-weight: 700; font-size: 22px; overflow: hidden; }

.c-bucket { position: relative; height: 100%; }
.c-bucket svg { position: absolute; left: 0; top: 0; overflow: visible; }
.c-bucket .bl { position: absolute; left: 0; right: 0; text-align: center; font-family: var(--f-mono); }

.c-phone { position: relative; height: 100%; border-radius: 64px; background: #050608; border: 4px solid #2a2f3d; box-shadow: 0 40px 120px rgba(0,0,0,.6), inset 0 0 0 10px #0d1016; }
.c-phone .scr { position: absolute; left: 16px; top: 16px; right: 16px; bottom: 16px; border-radius: 50px; overflow: hidden; background: linear-gradient(180deg, #121624, #0b0d14); }
.c-phone .notch { position: absolute; left: 50%; top: 14px; width: 130px; height: 34px; margin-left: -65px; border-radius: 20px; background: #000; }
.c-phone .sb { position: absolute; left: 36px; right: 30px; top: 18px; display: flex; justify-content: space-between; align-items: center; font-family: var(--f-display); font-size: 22px; font-weight: 600; color: var(--ink); }
.c-phone .sb .ic { display: flex; gap: 8px; align-items: center; }
.c-phone .app { position: absolute; left: 34px; right: 34px; top: 110px; bottom: 40px; display: flex; flex-direction: column; }
.c-phone .ah { font-family: var(--f-mono); font-size: 22px; letter-spacing: .14em; color: var(--dim); text-transform: uppercase; }
.c-phone .at { margin-top: 10px; font-size: 44px; font-weight: 700; }
.c-phone .item { margin-top: 38px; padding: 26px; border-radius: 24px; background: rgba(255,255,255,.04); border: 2px solid var(--line); font-size: 26px; color: var(--dim); }
.c-phone .amt { margin-top: 10px; font-size: 64px; font-weight: 800; color: var(--ink); letter-spacing: -0.02em; }
.c-phone .btn { position: relative; margin-top: auto; height: 96px; border-radius: 28px; display: flex; align-items: center; justify-content: center; gap: 16px;
  font-size: 32px; font-weight: 700; overflow: hidden; }
.c-phone .ripple { position: absolute; width: 60px; height: 60px; border-radius: 50%; left: 50%; top: 50%; margin: -30px 0 0 -30px; background: rgba(255,255,255,.5); }
.c-phone .spin { width: 34px; height: 34px; border-radius: 50%; border: 5px solid rgba(0,0,0,.25); border-top-color: rgba(0,0,0,.85); }
.c-phone .off { position: absolute; left: 34px; right: 34px; top: 74px; height: 0; }
.c-phone .offb { display: flex; align-items: center; gap: 12px; padding: 10px 18px; border-radius: 14px; background: rgba(255,74,92,.16); color: var(--red); font-family: var(--f-mono); font-size: 20px; font-weight: 700; letter-spacing: .06em; }
.c-phone .nt { position: absolute; left: 18px; right: 18px; display: flex; gap: 16px; align-items: center; padding: 20px; border-radius: 26px;
  background: rgba(28,32,46,.96); border: 2px solid rgba(255,255,255,.06); box-shadow: 0 20px 50px rgba(0,0,0,.5); }
.c-phone .nt .ni { flex: none; width: 58px; height: 58px; border-radius: 16px; display: flex; align-items: center; justify-content: center; }
.c-phone .nt .nb { min-width: 0; }
.c-phone .nt .nh { font-size: 20px; color: var(--dim); font-family: var(--f-mono); letter-spacing: .06em; text-transform: uppercase; }
.c-phone .nt .nx { font-size: 25px; font-weight: 600; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.c-phone .ok { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; background: rgba(11,13,20,.94); }
.c-phone .ok b { font-size: 40px; }

.c-quote { position: relative; height: 100%; padding: 54px 60px; display: flex; flex-direction: column; justify-content: center; }
.c-quote .qm { position: absolute; top: -30px; font-size: 220px; line-height: 1; font-weight: 800; opacity: .9; }
.c-quote .qt { font-weight: 700; line-height: 1.22; white-space: pre-wrap; }
.c-quote .qh { opacity: 0; }
.c-quote .qa { margin-top: 30px; font-family: var(--f-mono); font-size: 28px; color: var(--dim); letter-spacing: .08em; }

.c-particles canvas { position: absolute; left: 0; top: 0; }

.c-trap { position: relative; height: 100%; overflow: hidden; }
.c-trap .bg { position: absolute; inset: 0; background: rgba(7,8,12,.86); }
.c-trap .tape { position: absolute; left: -20%; width: 140%; height: 92px; display: flex; align-items: center; overflow: hidden; font-family: var(--f-mono); font-weight: 800; font-size: 40px;
  letter-spacing: .2em; color: #07080c; white-space: nowrap; }
.c-trap .center { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; gap: 26px; }
.c-trap .tt { font-size: 150px; font-weight: 900; letter-spacing: -0.02em; line-height: .95; text-align: center; }
.c-trap .ts { font-size: 44px; font-weight: 700; color: var(--ink); text-align: center; max-width: 900px; font-family: var(--f-arabic); }

.c-cta { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; height: 100%; text-align: center; }
.c-cta .cl { font-family: var(--f-mono); font-size: 30px; letter-spacing: .24em; text-transform: uppercase; }
.c-cta .cn { font-size: 92px; font-weight: 800; line-height: 1.02; letter-spacing: -0.02em; }
.c-cta .box { margin-top: 34px; width: 820px; display: flex; align-items: center; gap: 20px; padding: 24px 28px; border-radius: 28px; background: var(--card); border: 2px solid var(--line); text-align: left; }
.c-cta .av { flex: none; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.c-cta .inp { flex: 1; font-family: var(--f-mono); font-size: 34px; font-weight: 600; white-space: nowrap; overflow: hidden; }
.c-cta .ph { color: var(--dim); font-weight: 500; }
.c-cta .send { flex: none; padding: 14px 26px; border-radius: 18px; font-family: var(--f-mono); font-weight: 800; font-size: 26px; color: #07080c; }

.c-icon { display: flex; align-items: center; justify-content: center; height: 100%; }
.c-icon .ring { position: absolute; border-radius: 50%; border: 4px solid; }
.c-icon img { display: block; }
`;
