/**
 * Styles of the general-purpose components (place, time, people, media). Colors come from theme
 * variables and `color-mix` with `--ink`, so the same rules work on dark and light themes.
 */
export const GENERAL_CSS = String.raw`
.c-map, .c-route, .c-floor-plan, .c-building, .c-container-stack, .c-calendar, .c-clock, .c-schedule-board,
.c-appointment, .c-chat, .c-notification, .c-speech-bubble, .c-lower-third, .c-image, .c-logo, .c-kinetic-text,
.c-bullet-list, .c-callout, .c-spotlight, .c-split-screen, .c-pricing-table, .c-qr-code, .c-rating, .c-vitals { position: relative; height: 100%; }

.rf-veh { position: absolute; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
.rf-veh-g { display: flex; }

.c-map svg { overflow: visible; }
.c-map .mp-pin { position: absolute; width: 22px; height: 22px; border-radius: 50%; border: 4px solid var(--bg); transform: translate(-50%, -50%); }
.c-map .mp-ring { position: absolute; width: 26px; height: 26px; border-radius: 50%; border: 3px solid; }
.c-map .mp-lab { position: absolute; padding: 4px 14px; border-radius: 999px; border: 2px solid; background: color-mix(in srgb, var(--card) 92%, transparent); color: var(--ink); }

.c-route .rt-stop { position: absolute; border-radius: 50%; border: 4px solid; transform: translate(-50%, -50%); }
.c-route .rt-lab { position: absolute; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 2px; }
.c-route .rt-sub { color: var(--dim); font-family: var(--f-mono); }

.c-floor-plan .fp-wall { position: absolute; border: 6px solid color-mix(in srgb, var(--ink) 55%, transparent); border-radius: 14px; }
.c-floor-plan .fp-room { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; border: 3px solid; border-radius: 8px; text-align: center; overflow: hidden; }
.c-floor-plan .fp-ic { display: flex; }

.c-building .bd-floor { position: absolute; display: flex; align-items: center; gap: 16px; padding: 0 18px; border: 2px solid; border-radius: 12px; overflow: hidden; }
.c-building .bd-num { flex: none; display: flex; align-items: center; justify-content: center; border-radius: 10px; font-family: var(--f-mono); font-weight: 800; }
.c-building .bd-body { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
.c-building .bd-sub { color: var(--dim); }
.c-building .bd-ic { flex: none; display: flex; }
.c-building .bd-win { flex: none; display: flex; gap: 8px; }
.c-building .bd-win i { display: block; border-radius: 3px; background: color-mix(in srgb, var(--ink) 12%, transparent); }
.c-building .bd-shaft { position: absolute; border-radius: 10px; border: 2px dashed color-mix(in srgb, var(--ink) 25%, transparent); }
.c-building .bd-car { position: absolute; border-radius: 6px; }

.c-container-stack .cs-box { position: absolute; border-radius: 6px; overflow: hidden; border: 2px solid rgba(0,0,0,.25); }
.c-container-stack .cs-plate { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: flex-end; padding: 4px 10px; border-radius: 4px; }
.c-container-stack .cs-code { letter-spacing: .06em; }
.c-container-stack .cs-lab { opacity: .85; font-family: var(--f-mono); }

.c-calendar .cal-head { position: absolute; display: flex; align-items: center; justify-content: space-between; }
.c-calendar .cal-year { font-family: var(--f-mono); font-weight: 700; }
.c-calendar .cal-wd { position: absolute; text-align: center; font-family: var(--f-mono); text-transform: uppercase; letter-spacing: .08em; }
.c-calendar .cal-day { position: absolute; display: flex; align-items: center; justify-content: center; font-family: var(--f-mono); font-weight: 600; }
.c-calendar .cal-disc { position: absolute; border-radius: 50%; }
.c-calendar .cal-note { position: absolute; text-align: center; }

.c-clock .ck-label { position: absolute; left: 0; right: 0; display: flex; align-items: center; justify-content: center; font-family: var(--f-mono); color: var(--dim); letter-spacing: .12em; text-transform: uppercase; }
.c-clock .ck-digital { position: absolute; display: flex; align-items: center; justify-content: center; gap: 14px; }
.c-clock .ck-big { font-family: var(--f-mono); font-weight: 800; letter-spacing: -0.02em; line-height: 1; }
.c-clock .ck-ampm { font-family: var(--f-mono); font-weight: 700; font-size: 34px; }
.c-clock .ck-cd { position: absolute; display: flex; align-items: center; justify-content: center; font-weight: 800; line-height: 1; letter-spacing: -0.03em; }

.c-schedule-board .sb-head { position: absolute; display: flex; align-items: center; gap: 16px; border-bottom: 2px solid var(--line); }
.c-schedule-board .sb-title { letter-spacing: .14em; }
.c-schedule-board .sb-col { position: absolute; color: var(--dim); letter-spacing: .12em; text-transform: uppercase; padding-top: 10px; }
.c-schedule-board .sb-row { position: absolute; border-top: 2px solid color-mix(in srgb, var(--ink) 6%, transparent); }
.c-schedule-board .sb-cell { position: absolute; top: 0; display: flex; align-items: center; gap: 2px; }
.c-schedule-board .sb-ch { position: relative; display: flex; align-items: center; justify-content: center; border-radius: 5px; font-family: var(--f-mono); font-weight: 700; color: var(--ink);
  background: linear-gradient(180deg, color-mix(in srgb, var(--ink) 9%, var(--card)) 0 49%, color-mix(in srgb, var(--ink) 4%, var(--card)) 51% 100%);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 8%, transparent); }
.c-schedule-board .sb-ch::after { content: ''; position: absolute; left: 0; right: 0; top: 50%; height: 2px; margin-top: -1px; background: color-mix(in srgb, var(--bg) 70%, transparent); }
.c-schedule-board .sb-ar { color: var(--ink); }

.c-appointment .ap-ic { position: absolute; display: flex; align-items: center; justify-content: center; border-radius: 22px; border: 2px solid; }
.c-appointment .ap-body { position: absolute; display: flex; flex-direction: column; justify-content: center; gap: 10px; }
.c-appointment .ap-chip { align-self: flex-start; display: inline-flex; align-items: center; gap: 8px; padding: 4px 14px; border-radius: 999px; border: 2px solid; font-family: var(--f-mono); font-weight: 800; letter-spacing: .1em; }
.c-appointment .ap-chip-ic { display: flex; }
.c-appointment .ap-row { display: flex; align-items: center; gap: 12px; color: var(--dim); min-width: 0; }
.c-appointment .ap-row .rf-tx { color: var(--ink); }

.c-person-card { display: flex; align-items: center; gap: 28px; height: 100%; position: relative; }
.c-person-card.v { flex-direction: column; justify-content: center; text-align: center; gap: 16px; }
.c-person-card .pc-av { flex: none; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 4px solid; overflow: hidden; font-weight: 800; }
.c-person-card .pc-av img { width: 100%; height: 100%; object-fit: cover; display: block; }
.c-person-card .pc-txt { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.c-person-card.v .pc-txt { align-items: center; }
.c-person-card .pc-role { font-family: var(--f-mono); font-weight: 700; letter-spacing: .04em; }
.c-person-card .pc-sub { color: var(--dim); }
.c-person-card .pc-badge { position: absolute; top: 16px; inset-inline-end: 16px; padding: 4px 12px; border-radius: 999px; font-family: var(--f-mono); font-size: 18px; font-weight: 800; letter-spacing: .08em; }

.c-chat { overflow: hidden; }
.c-chat .ch-head { position: absolute; left: 0; right: 0; top: 0; display: flex; align-items: center; gap: 14px; padding: 0 22px; border-bottom: 2px solid var(--line); }
.c-chat .ch-head .pc-av { flex: none; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 3px solid; overflow: hidden; }
.c-chat .ch-dot { width: 12px; height: 12px; border-radius: 50%; margin-inline-start: auto; }
.c-chat .ch-area { position: absolute; left: 0; right: 0; bottom: 0; overflow: hidden; }
.c-chat .ch-col { position: absolute; left: 0; right: 0; top: 0; }
.c-chat .ch-bub { position: absolute; padding: 0.42em 0.7em; border-radius: 26px; line-height: 1.3; white-space: normal; overflow-wrap: anywhere; }
.c-chat .ch-bub.them { background: color-mix(in srgb, var(--ink) 8%, var(--card)); color: var(--ink); border: 2px solid var(--line); }
.c-chat .ch-name { font-size: .62em; font-weight: 800; font-family: var(--f-mono); letter-spacing: .06em; margin-bottom: 2px; }
.c-chat .ch-time { font-size: .52em; opacity: .7; font-family: var(--f-mono); text-align: end; margin-top: 2px; }
.c-chat .ch-typing { position: absolute; display: flex; align-items: center; gap: 8px; padding: 0 20px; border-radius: 26px; background: color-mix(in srgb, var(--ink) 8%, var(--card)); border: 2px solid var(--line); }
.c-chat .ch-typing i { width: 12px; height: 12px; border-radius: 50%; background: var(--dim); }

.c-notification .nt-toast { position: absolute; left: 0; right: 0; top: 0; display: flex; align-items: center; gap: 18px; padding: 0 22px; border-radius: 26px; background: var(--card); border: 2px solid var(--line);
  box-shadow: 0 16px 40px rgba(0,0,0,.28); transform-origin: 50% 0; }
.c-notification .nt-ic { flex: none; display: flex; align-items: center; justify-content: center; border-radius: 18px; }
.c-notification .nt-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.c-notification .nt-text { color: var(--dim); }
.c-notification .nt-time { flex: none; color: var(--dim); font-family: var(--f-mono); align-self: flex-start; margin-top: 22px; }

.c-speech-bubble svg { overflow: visible; }
.c-speech-bubble .sp-text { position: absolute; display: flex; align-items: center; justify-content: center; text-align: center; white-space: normal; font-weight: 700; line-height: 1.25; color: var(--ink); overflow: hidden; }

.c-lower-third .lt-bar { position: absolute; top: 0; bottom: 0; inset-inline-start: 0; width: 10px; border-radius: 4px; }
.c-lower-third .lt-panel { position: absolute; top: 0; inset-inline-start: 18px; inset-inline-end: 0; display: flex; align-items: center; gap: 18px; padding: 0 24px; border-radius: 0 18px 0 0;
  background: color-mix(in srgb, var(--card) 94%, transparent); border: 2px solid var(--line); border-bottom: none; }
.c-lower-third[dir='rtl'] .lt-panel { border-radius: 18px 0 0 0; }
.c-lower-third .lt-ic { flex: none; display: flex; align-items: center; justify-content: center; border-radius: 14px; }
.c-lower-third .lt-band { position: absolute; inset-inline-start: 18px; inset-inline-end: 12%; display: flex; align-items: center; padding: 0 24px; border-radius: 0 0 14px 0; }
.c-lower-third[dir='rtl'] .lt-band { border-radius: 0 0 0 14px; }
.c-lower-third .lt-title { font-family: var(--f-mono); letter-spacing: .1em; text-transform: uppercase; }

.c-image { overflow: hidden; background: linear-gradient(150deg, color-mix(in srgb, var(--ink) 10%, var(--card)), var(--card));
  box-shadow: inset 0 0 0 2px var(--line), 0 24px 60px rgba(0,0,0,.3); }
.c-image .im-frame { position: absolute; inset: 0; overflow: hidden; border-radius: inherit; }
.c-image .im-img { position: absolute; inset: 0; width: 100%; height: 100%; display: block; transform-origin: 50% 50%; }
.c-image .im-cap { position: absolute; left: 0; right: 0; bottom: 0; background: linear-gradient(0deg, rgba(0,0,0,.72), rgba(0,0,0,0)); }

.c-logo { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.c-logo .lg-img { display: block; max-width: 100%; object-fit: contain; }
.c-logo .lg-row { display: flex; align-items: center; justify-content: center; gap: 0.3em; max-width: 100%; }
.c-logo .lg-mark { flex: none; display: flex; align-items: center; justify-content: center; border-radius: 26%; }
.c-logo .lg-word { font-weight: 800; letter-spacing: -0.03em; white-space: nowrap; line-height: 1; }
.c-logo .lg-tag { display: flex; align-items: center; justify-content: center; font-family: var(--f-mono); color: var(--dim); letter-spacing: .2em; text-transform: uppercase; }

.c-kinetic-text { display: flex; align-items: center; }
.c-kinetic-text .kt-wrap { display: flex; flex-wrap: wrap; align-content: center; column-gap: 0.26em; row-gap: 0.06em; line-height: 1.12; letter-spacing: -0.02em; }
.c-kinetic-text .kt-w { position: relative; display: inline-block; transform-origin: 50% 70%; }
.c-kinetic-text .kt-hl { position: absolute; left: 0; right: 0; top: 0.1em; bottom: 0.04em; border-radius: 0.12em; transform: scaleX(0); }
.c-kinetic-text .kt-t { position: relative; }

.c-bullet-list .bl-title { position: absolute; left: 0; right: 0; top: 0; font-family: var(--f-mono); color: var(--dim); letter-spacing: .16em; text-transform: uppercase; }
.c-bullet-list .bl-row { position: absolute; left: 0; right: 0; display: flex; align-items: center; }
.c-bullet-list .bl-mk { flex: none; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-family: var(--f-mono); font-weight: 800; }
.c-bullet-list .bl-mk i { display: block; border-radius: 999px; }
.c-bullet-list .bl-body { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
.c-bullet-list .bl-sub { color: var(--dim); }

.c-callout svg { overflow: visible; }
.c-callout .co-lab { position: absolute; left: 50%; top: 50%; translate: -50% -50%; padding: 8px 22px; border-radius: 18px; border: 3px solid; background: color-mix(in srgb, var(--card) 94%, transparent); color: var(--ink); }

.c-spotlight svg { overflow: visible; }
.c-spotlight .sl-lab { position: absolute; padding: 8px 22px; border-radius: 999px; background: var(--card); border: 2px solid var(--line); color: var(--ink); }

.c-split-screen .ss-panel { position: absolute; display: flex; flex-direction: column; border: 2px solid; border-radius: 24px; overflow: hidden; }
.c-split-screen .ss-media { flex: none; position: relative; overflow: hidden; }
.c-split-screen .ss-media img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.c-split-screen .ss-icon { flex: none; display: flex; align-items: center; }
.c-split-screen .ss-body { flex: 1; min-height: 0; justify-content: flex-start; display: flex; flex-direction: column; gap: 10px; }
.c-split-screen .ss-text { white-space: normal; color: var(--ink); line-height: 1.3; overflow: hidden; }
.c-split-screen .ss-badge { position: absolute; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--ink); color: var(--bg); font-weight: 900; letter-spacing: .02em;
  box-shadow: 0 0 0 8px var(--bg); }

.c-pricing-table .pt-card { position: absolute; display: flex; flex-direction: column; gap: 10px; border-radius: 24px; border: 2px solid; background: var(--card); overflow: hidden; }
.c-pricing-table .pt-name { font-family: var(--f-mono); font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
.c-pricing-table .pt-price { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.c-pricing-table .pt-pv { font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; color: var(--ink); }
.c-pricing-table .pt-per { color: var(--dim); font-size: 22px; font-family: var(--f-mono); white-space: nowrap; }
.c-pricing-table .pt-was { color: var(--dim); text-decoration: line-through; text-decoration-thickness: 3px; font-family: var(--f-mono); font-size: 24px; }
.c-pricing-table .pt-feats { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; padding-top: 14px; border-top: 2px solid var(--line); }
.c-pricing-table .pt-feat { display: flex; align-items: center; gap: 10px; color: var(--ink); min-width: 0; }
.c-pricing-table .pt-feat svg { flex: none; }
.c-pricing-table .pt-badge { position: absolute; padding: 6px 16px; border-radius: 999px; font-family: var(--f-mono); font-weight: 800; letter-spacing: .12em; white-space: nowrap; }
.c-pricing-table .pt-tag { position: absolute; border-radius: 26px 16px 16px 26px; clip-path: polygon(14% 0, 100% 0, 100% 100%, 14% 100%, 0 50%); box-shadow: 0 20px 50px rgba(0,0,0,.3); }
.c-pricing-table[dir='rtl'] .pt-tag { clip-path: polygon(0 0, 86% 0, 100% 50%, 86% 100%, 0 100%); }
.c-pricing-table .pt-hole { position: absolute; top: 50%; width: 30px; height: 30px; margin-top: -15px; border-radius: 50%; background: var(--bg); box-shadow: inset 0 2px 6px rgba(0,0,0,.35); }
.c-pricing-table .pt-tbody { position: absolute; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center; gap: 2px; }
.c-pricing-table .pt-tname { font-family: var(--f-mono); letter-spacing: .14em; text-transform: uppercase; opacity: .9; }
.c-pricing-table .pt-tprice { font-weight: 900; letter-spacing: -0.03em; line-height: 1; }
.c-pricing-table .pt-tag .pt-was { color: inherit; opacity: .75; }
.c-pricing-table .pt-burst { position: absolute; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-weight: 900; box-shadow: 0 10px 30px rgba(0,0,0,.3); }

.c-qr-code .qr-card { position: absolute; border-radius: 22px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,.3), 0 0 0 2px var(--line); }
.c-qr-code .qr-lab { position: absolute; left: 0; right: 0; text-align: center; color: var(--ink); }

.c-rating { display: flex; align-items: center; gap: 20px; }
.c-rating .rt-big { flex: none; display: flex; align-items: center; justify-content: center; font-weight: 800; letter-spacing: -0.03em; }
.c-rating .rt-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.c-rating .rt-stars { display: flex; align-items: center; }
.c-rating .rt-info { display: flex; align-items: baseline; gap: 14px; min-width: 0; }
.c-rating .rt-note { color: var(--dim); font-family: var(--f-mono); }

.c-vitals .vt-side { position: absolute; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
.c-vitals .vt-label { font-family: var(--f-mono); color: var(--dim); letter-spacing: .14em; text-transform: uppercase; }
.c-vitals .vt-heart { display: flex; transform-origin: 30% 50%; }
.c-vitals .vt-val { font-weight: 800; line-height: 1; letter-spacing: -0.03em; }
.c-vitals .vt-unit { font-family: var(--f-mono); color: var(--dim); font-size: 22px; letter-spacing: .14em; }

.c-meter.gauge { display: block; position: relative; }
.c-meter .gv { position: absolute; transform: translate(-50%, -50%); font-family: var(--f-mono); font-weight: 800; direction: ltr; white-space: nowrap; }
.c-meter .gl { position: absolute; left: 0; right: 0; display: flex; align-items: center; justify-content: center; font-family: var(--f-mono); color: var(--dim); letter-spacing: .12em; text-transform: uppercase; }
`;
