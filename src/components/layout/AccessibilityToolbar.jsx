import React, { useState, useEffect, useCallback } from 'react';
import { Accessibility, X, RotateCcw, Type, Contrast, BookOpen, Focus, Minus, Plus } from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';

// ── Global CSS injected once ──────────────────────────────────────────────────
const A11Y_CSS = `
/* Dyslexia-friendly font */
html.a11y-dyslexia * { font-family: 'Lexend', 'Arial', sans-serif !important; }

/* Underline links */
html.a11y-links a {
  text-decoration: underline !important;
  text-underline-offset: 3px !important;
  text-decoration-thickness: 2px !important;
}

/* Increased line / letter spacing */
html.a11y-spacing p,
html.a11y-spacing li,
html.a11y-spacing td,
html.a11y-spacing th,
html.a11y-spacing label {
  line-height: 1.9 !important;
  letter-spacing: 0.03em !important;
  word-spacing: 0.1em !important;
}

/* Enhanced focus rings for keyboard navigation */
html.a11y-focus *:focus-visible {
  outline: 4px solid #2563eb !important;
  outline-offset: 3px !important;
  border-radius: 3px !important;
}

/* Stop all animations / transitions */
html.a11y-no-motion *,
html.a11y-no-motion *::before,
html.a11y-no-motion *::after {
  animation-duration: 0.001ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.001ms !important;
  scroll-behavior: auto !important;
}

/* Light background — whitens main content area */
html.a11y-light main { background-color: #ffffff !important; }

/* Image corrections when body filter inverts colours */
html.a11y-invert-imgs body img,
html.a11y-invert-imgs body video,
html.a11y-invert-imgs body canvas { filter: invert(1); }

html.a11y-smart-imgs body img,
html.a11y-smart-imgs body video,
html.a11y-smart-imgs body canvas { filter: invert(1) hue-rotate(180deg); }
`;

// ── Prefs & persistence ───────────────────────────────────────────────────────
const STORAGE_KEY = 'stx_a11y_prefs';

const DEFAULT = {
  textSize: 100,       // percent (80–160)
  highContrast: false,
  darkMode: false,     // smart-invert → dark-bg look
  lightBg: false,
  grayscale: false,
  invertColours: false,
  dyslexiaFont: false,
  underlineLinks: false,
  lineSpacing: false,
  enhancedFocus: false,
  reduceMotion: false,
};

function loadPrefs() {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; }
  catch { return { ...DEFAULT }; }
}

function applyPrefs(prefs) {
  const html = document.documentElement;
  const cl   = html.classList;

  // Text size — scales all rem units
  html.style.fontSize = prefs.textSize === 100 ? '' : `${prefs.textSize}%`;

  // Body filter — stack multiple filter functions
  const filters = [];
  if (prefs.highContrast)  filters.push('contrast(1.5)');
  if (prefs.grayscale)     filters.push('grayscale(1)');
  if (prefs.invertColours) filters.push('invert(1)');
  if (prefs.darkMode)      filters.push('invert(1)', 'hue-rotate(180deg)');
  document.body.style.filter = filters.length ? filters.join(' ') : '';

  // Image corrections (CSS classes on html)
  cl.toggle('a11y-invert-imgs', prefs.invertColours && !prefs.darkMode);
  cl.toggle('a11y-smart-imgs',  prefs.darkMode && !prefs.invertColours);

  // Class-based features
  cl.toggle('a11y-light',    prefs.lightBg);
  cl.toggle('a11y-dyslexia', prefs.dyslexiaFont);
  cl.toggle('a11y-links',    prefs.underlineLinks);
  cl.toggle('a11y-spacing',  prefs.lineSpacing);
  cl.toggle('a11y-focus',    prefs.enhancedFocus);
  cl.toggle('a11y-no-motion',prefs.reduceMotion);
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AccessibilityToolbar() {
  const { clientConfig, isSTX } = useTenant();
  const enabled = isSTX || clientConfig?.features?.accessibilityToolbar !== false;

  const [open,  setOpen]  = useState(false);
  const [prefs, setPrefs] = useState(loadPrefs);

  // Inject CSS once
  useEffect(() => {
    if (document.getElementById('a11y-styles')) return;
    const style = document.createElement('style');
    style.id = 'a11y-styles';
    style.textContent = A11Y_CSS;
    document.head.appendChild(style);
  }, []);

  // Lazily load Lexend font
  useEffect(() => {
    if (!prefs.dyslexiaFont || document.getElementById('a11y-lexend')) return;
    const link = document.createElement('link');
    link.id   = 'a11y-lexend';
    link.rel  = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600;700&display=swap';
    document.head.appendChild(link);
  }, [prefs.dyslexiaFont]);

  // Apply + persist whenever prefs change
  useEffect(() => {
    applyPrefs(prefs);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }, [prefs]);

  // Re-apply on mount (restore persisted state)
  useEffect(() => { applyPrefs(prefs); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle   = useCallback((key) => setPrefs(p => ({ ...p, [key]: !p[key] })), []);
  const bumpSize = useCallback((delta) =>
    setPrefs(p => ({ ...p, textSize: Math.min(160, Math.max(80, p.textSize + delta)) })), []);
  const reset    = useCallback(() => setPrefs({ ...DEFAULT }), []);

  if (!enabled) return null;

  const activeCount = [
    prefs.textSize !== 100, prefs.highContrast, prefs.darkMode, prefs.lightBg,
    prefs.grayscale, prefs.invertColours, prefs.dyslexiaFont,
    prefs.underlineLinks, prefs.lineSpacing, prefs.enhancedFocus, prefs.reduceMotion,
  ].filter(Boolean).length;

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Accessibility options"
        aria-expanded={open}
        className={`fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
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
            <div className="flex items-center gap-2">
              {activeCount > 0 && (
                <button
                  onClick={reset}
                  className="text-blue-200 hover:text-white flex items-center gap-1 text-xs rounded px-1.5 py-0.5 hover:bg-blue-700 transition-colors"
                >
                  <RotateCcw size={11} /> Reset all
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                aria-label="Close accessibility panel"
                className="text-blue-200 hover:text-white p-0.5 rounded"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-5 max-h-[72vh] overflow-y-auto">

            {/* ── Text size ── */}
            <div>
              <SectionLabel icon={<Type size={14} />} label="Text size" />
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={() => bumpSize(-10)}
                  disabled={prefs.textSize <= 80}
                  aria-label="Decrease text size"
                  className="w-9 h-9 rounded-lg border border-gray-300 flex items-center justify-center text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Minus size={16} />
                </button>
                <div className="flex-1 text-center">
                  <span className={`font-semibold ${prefs.textSize !== 100 ? 'text-blue-600' : 'text-gray-700'}`}>
                    {prefs.textSize}%
                  </span>
                  {prefs.textSize !== 100 && (
                    <button onClick={() => bumpSize(100 - prefs.textSize)} className="ml-2 text-xs text-gray-400 hover:text-gray-600 underline">
                      reset
                    </button>
                  )}
                </div>
                <button
                  onClick={() => bumpSize(10)}
                  disabled={prefs.textSize >= 160}
                  aria-label="Increase text size"
                  className="w-9 h-9 rounded-lg border border-gray-300 flex items-center justify-center text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {/* ── Colour ── */}
            <div>
              <SectionLabel icon={<Contrast size={14} />} label="Colour" />
              <div className="grid grid-cols-2 gap-2 mt-2">
                <ChipToggle label="High Contrast"    active={prefs.highContrast}   onToggle={() => toggle('highContrast')} />
                <ChipToggle label="Dark Contrast"    active={prefs.darkMode}        onToggle={() => toggle('darkMode')} />
                <ChipToggle label="Light Background" active={prefs.lightBg}         onToggle={() => toggle('lightBg')} />
                <ChipToggle label="Grayscale"        active={prefs.grayscale}       onToggle={() => toggle('grayscale')} />
                <ChipToggle label="Invert Colours"   active={prefs.invertColours}   onToggle={() => toggle('invertColours')} />
              </div>
            </div>

            {/* ── Reading ── */}
            <div>
              <SectionLabel icon={<BookOpen size={14} />} label="Reading" />
              <div className="space-y-2 mt-2">
                <ToggleRow
                  label="Readable font"
                  desc="Switches to Lexend, designed to reduce reading difficulty"
                  active={prefs.dyslexiaFont}
                  onToggle={() => toggle('dyslexiaFont')}
                />
                <ToggleRow
                  label="Underline links"
                  desc="Makes all clickable links clearly visible"
                  active={prefs.underlineLinks}
                  onToggle={() => toggle('underlineLinks')}
                />
                <ToggleRow
                  label="Increase line spacing"
                  desc="More space between lines and letters"
                  active={prefs.lineSpacing}
                  onToggle={() => toggle('lineSpacing')}
                />
              </div>
            </div>

            {/* ── Navigation ── */}
            <div>
              <SectionLabel icon={<Focus size={14} />} label="Navigation" />
              <div className="space-y-2 mt-2">
                <ToggleRow
                  label="Enhanced focus indicators"
                  desc="Bold outlines on keyboard-focused elements"
                  active={prefs.enhancedFocus}
                  onToggle={() => toggle('enhancedFocus')}
                />
                <ToggleRow
                  label="Reduce motion"
                  desc="Stops all animations and transitions"
                  active={prefs.reduceMotion}
                  onToggle={() => toggle('reduceMotion')}
                />
              </div>
            </div>

          </div>

          <p className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400 text-center">
            Settings saved automatically for this browser
          </p>
        </div>
      )}
    </>
  );
}

function SectionLabel({ icon, label }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
      <span className="text-gray-400">{icon}</span>
      {label}
    </div>
  );
}

function ChipToggle({ label, active, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`px-3 py-2 rounded-lg border text-sm font-medium text-center transition-colors ${
        active
          ? 'bg-blue-600 border-blue-600 text-white'
          : 'border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600'
      }`}
    >
      {label}
    </button>
  );
}

function ToggleRow({ label, desc, active, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
        active ? 'bg-blue-50 border-blue-300' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
      }`}
    >
      <div className="min-w-0">
        <p className={`text-sm font-medium ${active ? 'text-blue-800' : 'text-gray-700'}`}>{label}</p>
        <p className="text-xs text-gray-400 leading-snug mt-0.5">{desc}</p>
      </div>
      <div className={`shrink-0 w-10 h-5 rounded-full transition-colors relative ${active ? 'bg-blue-600' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${active ? 'left-5' : 'left-0.5'}`} />
      </div>
    </button>
  );
}
