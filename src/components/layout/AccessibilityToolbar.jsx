import React, { useState, useEffect, useCallback } from 'react';
import {
  Accessibility, X, RotateCcw,
  Type, Contrast, ScanEye,
  BookOpen, Focus, ZapOff, AlignJustify,
} from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';

// ── CSS injected once into <head> ─────────────────────────────────────────────
const A11Y_CSS = `
/* Text size */
html.a11y-text-lg  { font-size: 112.5%; }
html.a11y-text-xl  { font-size: 125%; }

/* High contrast — applied to body so the fixed toolbar is unaffected */
html.a11y-contrast body { filter: contrast(1.5); }
html.a11y-grayscale body { filter: grayscale(1); }
html.a11y-contrast.a11y-grayscale body { filter: contrast(1.5) grayscale(1); }

/* Dyslexia-friendly font */
html.a11y-dyslexia * { font-family: 'Lexend', 'Arial', sans-serif !important; }

/* Highlight links */
html.a11y-links a {
  text-decoration: underline !important;
  text-underline-offset: 3px !important;
  text-decoration-thickness: 2px !important;
  outline: 2px dashed currentColor !important;
  outline-offset: 2px !important;
  border-radius: 2px !important;
}

/* Reduce motion */
html.a11y-no-motion *,
html.a11y-no-motion *::before,
html.a11y-no-motion *::after {
  animation-duration: 0.001ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.001ms !important;
  scroll-behavior: auto !important;
}

/* Enhanced focus indicators */
html.a11y-focus *:focus-visible {
  outline: 4px solid #2563eb !important;
  outline-offset: 3px !important;
  border-radius: 3px !important;
}

/* Increased line spacing */
html.a11y-spacing p,
html.a11y-spacing li,
html.a11y-spacing td,
html.a11y-spacing th,
html.a11y-spacing label,
html.a11y-spacing span:not(.lucide):not([class*="icon"]) {
  line-height: 1.9 !important;
  letter-spacing: 0.02em !important;
}
`;

const STORAGE_KEY = 'stx_a11y_prefs';

const DEFAULT_PREFS = {
  textSize: 0,       // 0=normal, 1=large, 2=x-large
  highContrast: false,
  grayscale: false,
  dyslexiaFont: false,
  highlightLinks: false,
  reduceMotion: false,
  enhancedFocus: false,
  lineSpacing: false,
};

function loadPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function applyPrefs(prefs) {
  const cl = document.documentElement.classList;
  cl.toggle('a11y-text-lg',   prefs.textSize === 1);
  cl.toggle('a11y-text-xl',   prefs.textSize === 2);
  cl.toggle('a11y-contrast',  prefs.highContrast);
  cl.toggle('a11y-grayscale', prefs.grayscale);
  cl.toggle('a11y-dyslexia',  prefs.dyslexiaFont);
  cl.toggle('a11y-links',     prefs.highlightLinks);
  cl.toggle('a11y-no-motion', prefs.reduceMotion);
  cl.toggle('a11y-focus',     prefs.enhancedFocus);
  cl.toggle('a11y-spacing',   prefs.lineSpacing);
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AccessibilityToolbar() {
  const { clientConfig, isSTX } = useTenant();

  // Feature flag — STX always sees it; clients need it enabled (default true)
  const enabled = isSTX || clientConfig?.features?.accessibilityToolbar !== false;

  const [open, setOpen]   = useState(false);
  const [prefs, setPrefs] = useState(loadPrefs);

  // Inject CSS once
  useEffect(() => {
    if (document.getElementById('a11y-styles')) return;
    const style = document.createElement('style');
    style.id = 'a11y-styles';
    style.textContent = A11Y_CSS;
    document.head.appendChild(style);
  }, []);

  // Lazily load Lexend from Google Fonts when needed
  useEffect(() => {
    if (!prefs.dyslexiaFont) return;
    if (document.getElementById('a11y-lexend')) return;
    const link = document.createElement('link');
    link.id = 'a11y-lexend';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600;700&display=swap';
    document.head.appendChild(link);
  }, [prefs.dyslexiaFont]);

  // Apply classes + persist whenever prefs change
  useEffect(() => {
    applyPrefs(prefs);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }, [prefs]);

  // Restore on mount
  useEffect(() => { applyPrefs(prefs); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback((key) => setPrefs(p => ({ ...p, [key]: !p[key] })), []);
  const setTextSize = useCallback((n) => setPrefs(p => ({ ...p, textSize: n })), []);
  const reset = useCallback(() => setPrefs({ ...DEFAULT_PREFS }), []);

  if (!enabled) return null;

  const activeCount = [
    prefs.textSize > 0, prefs.highContrast, prefs.grayscale, prefs.dyslexiaFont,
    prefs.highlightLinks, prefs.reduceMotion, prefs.enhancedFocus, prefs.lineSpacing,
  ].filter(Boolean).length;

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Accessibility options"
        aria-expanded={open}
        className={`fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${
          open ? 'bg-blue-700 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        <Accessibility size={22} />
        {activeCount > 0 && !open && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-400 text-gray-900 text-[10px] font-bold rounded-full flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Accessibility settings"
          className="fixed bottom-20 right-6 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white">
            <div className="flex items-center gap-2">
              <Accessibility size={18} />
              <span className="font-semibold text-sm">Accessibility</span>
            </div>
            <div className="flex items-center gap-1">
              {activeCount > 0 && (
                <button
                  onClick={reset}
                  title="Reset all settings"
                  className="text-blue-200 hover:text-white p-1 rounded transition-colors flex items-center gap-1 text-xs"
                >
                  <RotateCcw size={13} /> Reset
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                aria-label="Close accessibility panel"
                className="text-blue-200 hover:text-white p-1 rounded transition-colors ml-1"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-5 max-h-[70vh] overflow-y-auto">

            {/* Text Size */}
            <Section icon={<Type size={15} />} label="Text size">
              <div className="flex gap-2 mt-2">
                {[
                  { size: 0, label: 'A',   cls: 'text-sm' },
                  { size: 1, label: 'A',   cls: 'text-base' },
                  { size: 2, label: 'A',   cls: 'text-lg' },
                ].map(({ size, label, cls }) => (
                  <button
                    key={size}
                    onClick={() => setTextSize(size)}
                    aria-pressed={prefs.textSize === size}
                    className={`flex-1 py-1.5 rounded-lg border text-center font-medium transition-colors ${cls} ${
                      prefs.textSize === size
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-gray-300 text-gray-700 hover:border-blue-400'
                    }`}
                  >
                    {label}
                    <span className="block text-[10px] font-normal opacity-75 leading-none mt-0.5">
                      {size === 0 ? 'Normal' : size === 1 ? 'Large' : 'X-Large'}
                    </span>
                  </button>
                ))}
              </div>
            </Section>

            {/* Visual */}
            <Section icon={<Contrast size={15} />} label="Visual">
              <div className="space-y-2 mt-2">
                <ToggleRow
                  label="High contrast"
                  desc="Increases colour contrast for easier reading"
                  active={prefs.highContrast}
                  onToggle={() => toggle('highContrast')}
                />
                <ToggleRow
                  label="Grayscale"
                  desc="Removes colour, reducing visual noise"
                  active={prefs.grayscale}
                  onToggle={() => toggle('grayscale')}
                />
              </div>
            </Section>

            {/* Reading */}
            <Section icon={<BookOpen size={15} />} label="Reading">
              <div className="space-y-2 mt-2">
                <ToggleRow
                  label="Dyslexia-friendly font"
                  desc="Switches to Lexend, designed for reading ease"
                  active={prefs.dyslexiaFont}
                  onToggle={() => toggle('dyslexiaFont')}
                />
                <ToggleRow
                  label="Highlight links"
                  desc="Makes all clickable links clearly visible"
                  active={prefs.highlightLinks}
                  onToggle={() => toggle('highlightLinks')}
                />
                <ToggleRow
                  label="Increase line spacing"
                  desc="More space between lines for easier reading"
                  active={prefs.lineSpacing}
                  onToggle={() => toggle('lineSpacing')}
                />
              </div>
            </Section>

            {/* Navigation */}
            <Section icon={<Focus size={15} />} label="Navigation">
              <div className="space-y-2 mt-2">
                <ToggleRow
                  label="Enhanced focus indicators"
                  desc="Bold blue outlines on keyboard-focused elements"
                  active={prefs.enhancedFocus}
                  onToggle={() => toggle('enhancedFocus')}
                />
                <ToggleRow
                  label="Reduce motion"
                  desc="Stops animations and transitions"
                  active={prefs.reduceMotion}
                  onToggle={() => toggle('reduceMotion')}
                />
              </div>
            </Section>

          </div>

          <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-400 text-center">
            Settings saved automatically for this browser
          </div>
        </div>
      )}
    </>
  );
}

function Section({ icon, label, children }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
        <span className="text-gray-400">{icon}</span>
        {label}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, desc, active, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
        active
          ? 'bg-blue-50 border-blue-300'
          : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
      }`}
    >
      <div className="min-w-0">
        <p className={`text-sm font-medium ${active ? 'text-blue-800' : 'text-gray-700'}`}>{label}</p>
        <p className="text-xs text-gray-400 leading-snug mt-0.5">{desc}</p>
      </div>
      {/* Pill toggle */}
      <div className={`shrink-0 w-10 h-5 rounded-full transition-colors relative ${active ? 'bg-blue-600' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${active ? 'left-5' : 'left-0.5'}`} />
      </div>
    </button>
  );
}
