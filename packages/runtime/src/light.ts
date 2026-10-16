/**
 * Overrides for light themes (`theme.mode: light`), scoped to `#rf-root.rf-light`. The base
 * stylesheet keeps a few dark-page assumptions (white hairlines, black shadows, dark glass); these
 * rules swap them for dark-on-light equivalents. Dark themes never match, so their frames are
 * unchanged.
 */
export const LIGHT_CSS = String.raw`
.rf-light .c-table .th { background: rgba(0,0,0,.03); }
.rf-light .c-code { box-shadow: 0 24px 60px rgba(16,24,40,.12); }
.rf-light .c-code .ln .no { color: var(--dim); filter: none; opacity: .75; }

.rf-light .c-phone { background: #ffffff; border-color: var(--line); box-shadow: 0 30px 80px rgba(16,24,40,.16), inset 0 0 0 10px #eef1f5; }
.rf-light .c-phone .scr { background: linear-gradient(180deg, #ffffff, var(--bg)); }
.rf-light .c-phone .notch { background: #11141c; }
.rf-light .c-phone .item { background: rgba(0,0,0,.03); }
.rf-light .c-phone .btn { color: #ffffff !important; }
.rf-light .c-phone .spin { border-color: rgba(255,255,255,.35); border-top-color: #ffffff; }
.rf-light .c-phone .nt { background: rgba(255,255,255,.97); border-color: var(--line); box-shadow: 0 16px 40px rgba(16,24,40,.14); }
.rf-light .c-phone .ok { background: rgba(255,255,255,.95); }

.rf-light .c-trap .bg { background: color-mix(in srgb, var(--bg) 92%, transparent); }
.rf-light .c-trap .tape { color: #ffffff; }
.rf-light .c-cta .send { color: #ffffff; }

.rf-light .c-bar-chart .bc-grid { border-top-color: rgba(0,0,0,.1); }
.rf-light .c-bar-chart .bc-grid.zero { border-top-color: rgba(0,0,0,.35); }
.rf-light .c-bar-chart .bc-grid.v { border-left-color: rgba(0,0,0,.09); }
.rf-light .c-bar-chart .bc-grid.v.zero { border-left-color: rgba(0,0,0,.35); }
.rf-light .c-ranking .rk-track { background: rgba(0,0,0,.07); }
.rf-light .c-before-after .ba-text { text-shadow: 0 2px 16px rgba(255,255,255,.7); }
.rf-light .c-before-after .ba-div { box-shadow: 0 0 18px rgba(16,24,40,.25); }
.rf-light .c-before-after .ba-knob { box-shadow: 0 8px 24px rgba(16,24,40,.2); }
.rf-light .c-matrix-2x2 .mx-lab { background: color-mix(in srgb, var(--card) 92%, transparent); }
`;
