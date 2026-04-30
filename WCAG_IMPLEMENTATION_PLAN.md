# WCAG 2.1 AA Implementation Plan — STX Corporate Portal

> **Document purpose:** Detailed implementation plan for achieving WCAG 2.1 Level AA accessibility compliance.  
> **Audit date:** 30 April 2026  
> **Estimated total effort:** 25–35 hours  
> **Approach:** All changes are additive — no functionality is removed or redesigned.

---

## Overview

The STX Corporate Portal has solid structural foundations (semantic HTML, keyboard-navigable links, landmark elements) but fails several Level A (minimum) and Level AA requirements. The AccessibilityToolbar is a genuine user enhancement but does not substitute for foundational WCAG compliance in the base HTML, ARIA, and keyboard behaviour.

This plan is organised into four phases by priority. Phase 1 addresses blockers — issues that prevent users with disabilities from accessing core functionality. Phases 2–4 address degraded experience, structural improvements, and ongoing hardening.

---

## Phase 1 — Critical Blockers

**Target:** Resolve all Level A failures and the most impactful Level AA failures.  
**Estimated effort:** 13–17 hours  
**Rationale:** These items block access entirely for keyboard-only or screen reader users.

---

### 1.1 — Color Contrast Audit and Remediation

**WCAG:** 1.4.3 Contrast (Minimum) — Level AA  
**Severity:** Critical  
**Estimated effort:** 3–4 hours

**The problem:**  
Multiple gray text values fail the 4.5:1 minimum contrast ratio for normal-weight text on white/light backgrounds:

| Tailwind class | Approx. ratio | Status |
|---|---|---|
| `text-gray-300` | ~1.5:1 | CRITICAL FAIL |
| `text-gray-400` | ~2.5:1 | FAIL |
| `text-gray-500` | ~3.1:1 | FAIL (normal text) |
| `text-gray-600` | ~4.3:1 | MARGINAL FAIL |
| `text-gray-700` | ~5.5:1 | PASS |

**Minimum safe palette:**
- Primary text → `text-gray-900` or `text-gray-800`
- Secondary/support text → `text-gray-700`
- Labels, captions, badges → `text-gray-700` minimum
- Placeholder text → Tailwind `placeholder-gray-500` fails; use `placeholder-gray-600` minimum

**Files to audit (systematic find-replace per file):**

| File | Failing patterns |
|---|---|
| `src/components/trips/TripList.jsx` | `text-gray-300` (lead time dash), `text-gray-400`, `text-gray-500` labels |
| `src/components/invoices/InvoiceDetail.jsx` | `text-gray-400` table headers |
| `src/components/invoices/InvoiceBuilder.jsx` | `text-gray-400`, `text-gray-500` |
| `src/components/layout/TopBar.jsx` | `text-gray-400` user display name |
| `src/pages/Dashboard.jsx` | `text-gray-500` card labels |
| `src/components/reports/*.jsx` | `text-gray-400`, `text-gray-500` throughout |
| `src/components/admin/*.jsx` | `text-gray-400`, `text-gray-500` table and label text |
| `src/pages/Team.jsx` | Secondary text throughout |
| `src/components/trips/TripDetail.jsx` | Label and metadata text |
| `src/components/trips/TripForm.jsx` | Helper text, placeholder text |

**Implementation steps:**
1. Search codebase: `grep -r "text-gray-[345]00" src/` to get full list
2. For each occurrence: determine if it's on a white/light background
3. Replace with minimum-passing equivalent:
   - `text-gray-300` → `text-gray-600` (decorative placeholders) or `text-gray-700` (content)
   - `text-gray-400` → `text-gray-600`
   - `text-gray-500` → `text-gray-700`
4. Check all `placeholder-*` classes — use `placeholder-gray-600` minimum
5. Verify badge text (status badges, lead time badges) — ensure text colour + background colour combination passes
6. Test with WebAIM Contrast Checker or browser DevTools accessibility panel

**Notes:**
- Dark-background contexts (Sidebar `bg-gray-900`, modals with dark headers) are exempt if the text there passes on the dark background — audit separately
- The AccessibilityToolbar's High Contrast toggle remains as an enhancement on top of compliant base colours

---

### 1.2 — Skip Navigation Link

**WCAG:** 2.4.1 Bypass Blocks — Level A  
**Severity:** Critical (keyboard users)  
**Estimated effort:** 30 minutes

**The problem:**  
There is no "Skip to main content" link. Keyboard users must Tab through the entire Sidebar (all navigation items) on every page load before reaching main content.

**Implementation:**

File: `src/components/layout/AppShell.jsx`

Add as the first element in the JSX return, before the sidebar:

```jsx
{/* Skip navigation — visually hidden until focused */}
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200] focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:font-medium focus:shadow-lg"
>
  Skip to main content
</a>
```

Then add the target `id` to the main content area:

```jsx
<main id="main-content" className="flex-1 overflow-auto" tabIndex={-1}>
  {/* existing content */}
</main>
```

The `tabIndex={-1}` on the `<main>` allows focus to be programmatically placed there without adding it to the natural tab order.

**Notes:**
- `sr-only` hides it visually; `focus:not-sr-only` reveals it when focused by keyboard
- The link should be the very first focusable element on every page
- No change to existing layout or functionality required

---

### 1.3 — Modal Focus Trap and Focus Restoration

**WCAG:** 2.1.1 Keyboard, 2.4.3 Focus Order — Level A  
**Severity:** Critical (screen reader and keyboard users)  
**Estimated effort:** 2–3 hours

**The problem:**  
`src/components/shared/Modal.jsx` does not trap focus inside the modal overlay. When a modal is open:
- Keyboard users can Tab out of the modal into content behind the overlay
- Screen reader users lose orientation and may interact with background content
- When the modal closes, focus is not returned to the element that opened it

**Implementation option A — Use `react-focus-lock` (recommended):**

Install: `npm install react-focus-lock`

Wrap modal content:
```jsx
import FocusLock from 'react-focus-lock';

// Inside Modal render:
<FocusLock returnFocus>
  <div role="dialog" aria-modal="true" aria-labelledby={titleId} ...>
    {children}
  </div>
</FocusLock>
```

`returnFocus` automatically returns focus to the trigger element when the lock is removed (modal closes). No additional logic needed.

**Implementation option B — Manual focus trap (~60 lines, no new dependency):**

```jsx
// In Modal.jsx
import { useRef, useEffect } from 'react';

function trapFocus(element) {
  const focusable = element.querySelectorAll(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  function handleKeyDown(e) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  element.addEventListener('keydown', handleKeyDown);
  first?.focus();
  return () => element.removeEventListener('keydown', handleKeyDown);
}
```

**Additional changes to Modal.jsx:**
1. Add `aria-modal="true"` to the dialog div
2. Add `aria-labelledby` linking to the modal title (requires modal to accept a `titleId` prop or derive one)
3. Move focus to the modal's first focusable element on open
4. Store and restore focus on close

**Files affected:** `src/components/shared/Modal.jsx` only. All existing Modal usages are unchanged — the focus trap is internal.

---

### 1.4 — Form Error Accessibility

**WCAG:** 3.3.1 Error Identification (A), 3.3.3 Error Suggestion (AA)  
**Severity:** Critical (screen reader users)  
**Estimated effort:** 3–4 hours

**The problem:**  
Form errors are displayed visually but:
- Not announced to screen readers when they appear (no `aria-live`)
- Not linked to specific fields (no `aria-describedby`)
- Fields don't signal error state (no `aria-invalid`)

**Standard pattern to implement across all forms:**

```jsx
// 1. Error container with aria-live so it's announced on appearance
<div aria-live="polite" aria-atomic="true">
  {error && (
    <p id="form-error" className="text-red-600 text-sm mt-1" role="alert">
      {error}
    </p>
  )}
</div>

// 2. Input with aria-invalid and aria-describedby
<input
  type="email"
  id="email"
  aria-invalid={!!error}
  aria-describedby={error ? 'form-error' : undefined}
  ...
/>
```

**Files to update:**

| File | Error patterns present |
|---|---|
| `src/components/auth/LoginPage.jsx` | Login error banner (lines 184–188) |
| `src/components/trips/TripForm.jsx` | Validation errors on submit |
| `src/pages/Team.jsx` | User form submission errors |
| `src/components/admin/UserManager.jsx` | User form errors |
| `src/components/admin/ClientForm.jsx` | Client form errors |
| `src/pages/OnboardingForm.jsx` | All field validation |
| `src/components/hotels/HotelBookingFlow.jsx` | Booking form errors |
| `src/components/account/AccountSettings.jsx` | Settings save errors |

**Implementation steps:**
1. Identify every form with validation or submission errors
2. Add unique `id` to each error message element
3. Add matching `aria-describedby` to the associated input
4. Add `aria-invalid={!!hasError}` to each input
5. Wrap error message containers in `<div aria-live="polite" aria-atomic="true">`
6. For field-level errors (inline), use `role="alert"` on the error `<p>` tag

**Required fields:**  
While updating forms, also add `aria-required="true"` to all inputs that are required, and add a visible indicator in the label:
```jsx
<label htmlFor="tripTitle">
  Trip title <span className="text-red-600" aria-hidden="true">*</span>
</label>
<input aria-required="true" id="tripTitle" ... />
```
Add a note at the top of each form: `<p className="text-sm text-gray-700">Fields marked <span aria-hidden="true">*</span> are required.</p>`

---

### 1.5 — Accessible Names for Icon-Only Buttons

**WCAG:** 4.1.2 Name, Role, Value — Level A  
**Severity:** High (screen reader users)  
**Estimated effort:** 2 hours

**The problem:**  
Buttons containing only a Lucide icon (no visible text) are announced by screen readers as "button" with no description of their purpose.

**Pattern for all icon-only buttons:**

```jsx
// BEFORE
<button onClick={handleDelete}>
  <Trash2 size={16} />
</button>

// AFTER — option A: aria-label on button
<button onClick={handleDelete} aria-label="Delete trip">
  <Trash2 size={16} aria-hidden="true" />
</button>

// AFTER — option B: visually hidden text
<button onClick={handleDelete}>
  <Trash2 size={16} aria-hidden="true" />
  <span className="sr-only">Delete trip</span>
</button>
```

Always add `aria-hidden="true"` to the icon when a label or visible text is present — prevents the screen reader from also reading out the SVG title.

**Files to audit and update:**

| File | Icon-only buttons |
|---|---|
| `src/components/layout/TopBar.jsx` | Clear client selection (X), Settings button |
| `src/components/trips/TripList.jsx` | Edit, Delete, view-trip action buttons |
| `src/components/trips/TripDetail.jsx` | Edit, attachment actions, amendment actions |
| `src/components/passengers/PassengerList.jsx` | Edit, Delete passenger buttons |
| `src/components/invoices/InvoiceBuilder.jsx` | Remove line item, add fee buttons |
| `src/components/invoices/InvoiceDetail.jsx` | Action buttons |
| `src/components/admin/UserManager.jsx` | Edit, deactivate user buttons |
| `src/components/admin/FeedbackManager.jsx` | Reply, dismiss buttons |
| `src/pages/Team.jsx` | Edit member, delete member buttons |

**Audit approach:** `grep -rn "Lucide\|from 'lucide-react'" src/` — check every icon usage; determine if it's standalone in a button.

**Decorative icons:** For icons that are purely decorative (alongside visible text, or for visual flourish), add `aria-hidden="true"` without a label. Example:
```jsx
<button>
  <PlusCircle size={16} aria-hidden="true" />
  New Trip
</button>
```

---

### 1.6 — Dropdown ARIA (TopBar Client Selector)

**WCAG:** 4.1.2 Name, Role, Value — Level A/AA  
**Severity:** High (screen reader users)  
**Estimated effort:** 1–2 hours

**The problem:**  
The client selector dropdown in `src/components/layout/TopBar.jsx` has no ARIA attributes to describe its behaviour. Screen readers don't know it's a menu or whether it's open.

**Implementation:**

```jsx
// Trigger button
<button
  onClick={() => setOpen(true)}
  aria-haspopup="listbox"
  aria-expanded={open}
  aria-label="Select working client"
>
  {activeClientName} <ChevronDown aria-hidden="true" />
</button>

// Dropdown list
<ul role="listbox" aria-label="Client list">
  {clients.map(client => (
    <li
      key={client.id}
      role="option"
      aria-selected={client.id === activeClientId}
      onClick={() => select(client.id)}
    >
      {client.name}
    </li>
  ))}
</ul>
```

Also add keyboard support:
- `ArrowDown` / `ArrowUp` to move between options
- `Enter` or `Space` to select
- `Escape` to close dropdown

**Notes:** This change is internal to `TopBar.jsx`. The visual appearance is unchanged.

---

## Phase 2 — High Impact, Level AA

**Target:** All remaining Level AA failures.  
**Estimated effort:** 7–10 hours

---

### 2.1 — Dynamic Page Titles Per Route

**WCAG:** 2.4.2 Page Titled — Level A  
**Severity:** High  
**Estimated effort:** 1–2 hours

**The problem:**  
`document.title` is always "STX Connect" regardless of route. Screen reader users announce the page title on load — with a static title, every page sounds identical.

**Implementation:**  
Add a `useEffect` to every page-level component (files in `src/pages/`):

```jsx
// Pattern
useEffect(() => {
  document.title = 'Dashboard — STX Connect';
}, []);
```

**Page title map:**

| Route | Title |
|---|---|
| `/login` | `Sign In — STX Connect` |
| `/dashboard` | `Dashboard — STX Connect` |
| `/travel` | `Travel Management — STX Connect` |
| `/travel/:tripId` | `{trip.title} — STX Connect` (dynamic, update when trip loads) |
| `/travel/new` | `New Trip — STX Connect` |
| `/passengers` | `Passenger Profiles — STX Connect` |
| `/reports` | `Reports — STX Connect` |
| `/team` | `Team — STX Connect` |
| `/invoices` | `Invoices — STX Connect` |
| `/admin` | `Admin Panel — STX Connect` |
| `/account` | `Account Settings — STX Connect` |
| `/contact` | `Contact — STX Connect` |
| `/onboarding` | `Portal Onboarding — STX Connect` |

For dynamic titles (trip detail), update in the `useEffect` that loads the trip data:
```jsx
useEffect(() => {
  if (trip) document.title = `${trip.title} — STX Connect`;
}, [trip]);
```

**Files:** All files in `src/pages/`, plus `TripDetail.jsx`.

---

### 2.2 — Focus Indicator Strengthening

**WCAG:** 2.4.7 Focus Visible — Level AA  
**Severity:** Medium-High  
**Estimated effort:** 2–3 hours

**The problem:**  
Default focus indicators are 2px `focus:ring-2` which is barely visible, particularly at non-100% zoom or with moderate visual impairment. Some buttons have no explicit focus style at all.

**Recommended global defaults:**

Add to `src/App.css` or a global stylesheet:

```css
/* Strong default focus indicator for all interactive elements */
:focus-visible {
  outline: 3px solid #2563eb; /* blue-600 */
  outline-offset: 2px;
  border-radius: 4px;
}

/* Remove outline for mouse users (only show for keyboard) */
:focus:not(:focus-visible) {
  outline: none;
}
```

This approach:
- Shows a strong 3px blue outline for keyboard navigation
- Hides the outline for mouse clicks (`:focus:not(:focus-visible)`)
- Works alongside the existing AccessibilityToolbar enhanced focus toggle (which adds 4px when opted in)
- Requires no changes to individual component files

**Additionally update Tailwind focus classes** on common interactive components:

```jsx
// Buttons: replace focus:ring-2 with focus-visible:ring-4
className="... focus-visible:ring-4 focus-visible:ring-blue-600 focus-visible:ring-offset-2"

// Links in Sidebar: ensure NavLink active/focus state is visible
```

**Files:**
- `src/App.css` — global CSS rule (primary change)
- `src/components/auth/LoginPage.jsx` — form button
- `src/components/layout/Sidebar.jsx` — NavLink focus states

---

### 2.3 — Status and Loading Announcements (`aria-live`)

**WCAG:** 4.1.3 Status Messages — Level AA  
**Severity:** Medium  
**Estimated effort:** 2–3 hours

**The problem:**  
Dynamic content changes (loading states, filter results, form success messages) are not announced to screen readers.

**Implementation — global status region:**

Add a visually hidden live region to `AppShell.jsx`:
```jsx
{/* Accessible status announcer — content is announced by screen readers */}
<div aria-live="polite" aria-atomic="true" className="sr-only" id="status-announcer" />
```

Create a utility hook `src/hooks/useAnnounce.js`:
```jsx
export function useAnnounce() {
  return (message) => {
    const el = document.getElementById('status-announcer');
    if (!el) return;
    el.textContent = '';
    // Small delay ensures screen reader picks up the change
    requestAnimationFrame(() => { el.textContent = message; });
  };
}
```

**Usage in components:**
```jsx
const announce = useAnnounce();

// After trip list filter:
announce(`Showing ${filteredTrips.length} trips`);

// After form save:
announce('Trip saved successfully');

// During loading:
// Use aria-busy on the container instead of the announcer
<div aria-busy={loading} aria-label="Trip list">
```

**Loading spinners:**

Update the AppShell loading screen and any inline loading states:
```jsx
<div role="status" aria-label="Loading" aria-live="polite">
  <div className="animate-spin ..." aria-hidden="true" />
  <p className="sr-only">Loading, please wait…</p>
</div>
```

**Files:**
- `src/components/layout/AppShell.jsx` — global status region + loading state
- `src/hooks/useAnnounce.js` — new utility hook
- `src/components/trips/TripList.jsx` — filter result announcements
- `src/components/reports/*.jsx` — report loading/result announcements

---

### 2.4 — Navigation Landmark Labels

**WCAG:** 4.1.2 Name, Role, Value — Level A  
**Severity:** Low-Medium  
**Estimated effort:** 30 minutes

**The problem:**  
The `<nav>` element in the Sidebar has no label. If a page had multiple nav regions, screen readers couldn't distinguish them.

**Implementation:**

```jsx
// src/components/layout/Sidebar.jsx
<nav aria-label="Main navigation" className="w-56 bg-gray-900 ...">

// Any secondary nav (e.g. breadcrumb, report tabs)
<nav aria-label="Breadcrumb">
<nav aria-label="Report sections">
```

Also ensure the main landmark wraps the primary content:
```jsx
// AppShell — the content area should be a <main> element
<main id="main-content" tabIndex={-1} className="flex-1 overflow-auto">
```

If `AppShell` currently uses a `<div>` for the content area, change it to `<main>`. Visually identical.

---

## Phase 3 — Structural and Semantic Improvements

**Target:** Structural HTML improvements; completing the semantic layer.  
**Estimated effort:** 4–6 hours

---

### 3.1 — Sidebar Navigation List Semantics

**WCAG:** 1.3.1 Info and Relationships — Level A  
**Severity:** Medium  
**Estimated effort:** 1 hour

**The problem:**  
Navigation links in the Sidebar are rendered directly as `<NavLink>` elements, not inside a `<ul>/<li>` list. Screen readers announce navigation lists as "list, N items" which helps users understand the structure.

**File:** `src/components/layout/Sidebar.jsx`

```jsx
// BEFORE
<nav>
  {visibleNav.map(({ to, label }) => (
    <NavLink key={to} to={to}>...</NavLink>
  ))}
</nav>

// AFTER
<nav aria-label="Main navigation">
  <ul className="list-none p-0 m-0">
    {visibleNav.map(({ to, label, icon: Icon, badge }) => (
      <li key={to}>
        <NavLink to={to} ...>...</NavLink>
      </li>
    ))}
  </ul>
</nav>
```

Add `list-none` to the `<ul>` to remove browser default bullet styles.  
No visual change. No functional change.

---

### 3.2 — Table `scope` Attributes

**WCAG:** 1.3.1 Info and Relationships — Level A  
**Severity:** Low  
**Estimated effort:** 1 hour

**The problem:**  
All `<th>` elements lack `scope` attributes. Screen readers use `scope` to associate data cells with their headers when navigating a table by cell.

**Pattern:**
```jsx
// Column headers
<th scope="col">Trip</th>
<th scope="col">Status</th>
<th scope="col">Cost</th>

// Row headers (if any)
<th scope="row">{trip.title}</th>
```

**Files to update:**
- `src/components/invoices/InvoiceBuilder.jsx`
- `src/components/invoices/InvoiceDetail.jsx`
- `src/components/reports/AllTravelReport.jsx`
- `src/components/reports/HotelPopularity.jsx`
- `src/components/admin/UserManager.jsx`
- `src/components/admin/ClientManager.jsx`
- Any other component rendering `<table><thead><th>`

Approach: `grep -rn "<th" src/` — add `scope="col"` to each.

---

### 3.3 — System `prefers-reduced-motion` Respect

**WCAG:** 2.3.3 Animation from Interactions — Level AAA (but good practice at AA)  
**Severity:** Medium  
**Estimated effort:** 1 hour

**The problem:**  
The AccessibilityToolbar provides a "Reduce motion" toggle, but the application does not automatically respect the OS-level `prefers-reduced-motion` media query. Users who have set this preference system-wide should not need to enable it again in the portal.

**Implementation:**

Add to `src/App.css`:
```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
```

**Extend AccessibilityToolbar** to detect the system preference on mount:
```jsx
// On toolbar initialisation, check system preference
useEffect(() => {
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (mediaQuery.matches && !prefs.reduceMotion) {
    setPrefs(p => ({ ...p, reduceMotion: true }));
  }
}, []); // run once on mount only — don't override user's saved preference
```

This detects the system setting on first load only. If a user has explicitly saved their toolbar preference (via localStorage), their saved setting takes priority.

---

### 3.4 — Decorative Icon Audit (`aria-hidden`)

**WCAG:** 1.1.1 Non-text Content — Level A  
**Severity:** Medium  
**Estimated effort:** 2 hours

**The problem:**  
Lucide React icons rendered alongside text labels are read by some screen readers (depending on the SVG title attribute), leading to double-reading ("Edit trip Edit icon button").

**Pattern for ALL icon usage:**
```jsx
// Decorative icon alongside text — always hide
<PlusCircle size={16} aria-hidden="true" />
New Trip

// Icon as button content (covered in 1.5 above) — label the button
<button aria-label="Edit trip">
  <Edit size={16} aria-hidden="true" />
</button>

// Icon as a meaningful standalone indicator — give it a role and label
<AlertCircle size={16} aria-label="Warning" role="img" />
```

**Rule of thumb:** Any Lucide icon that is inside or adjacent to visible text → `aria-hidden="true"`. Any Lucide icon that IS the only indicator of meaning → `role="img" aria-label="..."`.

**Files:** All component files — perform a global search for Lucide imports and check each usage.

---

## Phase 4 — Ongoing Hardening and Testing

**Target:** Prevent regression; establish testing baseline.  
**Estimated effort:** Ongoing

---

### 4.1 — Add `jest-axe` to Unit Tests

Adds automated accessibility checking to the component test suite. Catches regressions as new components are built.

```bash
npm install --save-dev jest-axe
```

```jsx
// Example test
import { axe, toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);

it('LoginPage has no accessibility violations', async () => {
  const { container } = render(<LoginPage />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

Add to CI pipeline so builds fail on new accessibility violations.

---

### 4.2 — Manual Testing Protocol

Run after completing each phase:

| Test | Tool | How |
|---|---|---|
| Keyboard-only navigation | No mouse | Tab through entire app; verify all actions reachable and logical |
| Screen reader | VoiceOver (Mac) or NVDA (Windows, free) | Navigate key flows: login, create trip, approve trip |
| Contrast check | Browser DevTools (Accessibility panel) | Inspect computed styles on all text elements |
| Zoom 200% | Browser zoom | Verify no content disappears or overlaps |
| Windows High Contrast | Windows setting | Verify interface is still operable |
| Focus indicators | Keyboard navigation | Verify all focused elements have visible outline |
| Modal behavior | Keyboard | Open modals, verify focus trapped, Escape closes, focus returns |

---

### 4.3 — Automated Scan Integration

Run Lighthouse accessibility audit on key pages before each production deploy:
- Login page
- Dashboard
- Trip list
- Trip form (new trip)
- Trip detail
- Admin panel

Target score: 90+ on all pages (100 for pages with simpler content).

---

## Implementation Sequence and Time Estimates

| # | Task | Phase | Est. Hours | File(s) |
|---|---|---|---|---|
| 1 | Color contrast audit and remediation | P1 | 3–4 h | Multiple (gray text throughout) |
| 2 | Skip navigation link | P1 | 0.5 h | `AppShell.jsx` |
| 3 | Modal focus trap (`react-focus-lock`) | P1 | 2–3 h | `Modal.jsx` |
| 4 | Form error ARIA (aria-invalid, aria-describedby, aria-live) | P1 | 3–4 h | `LoginPage`, `TripForm`, all forms |
| 5 | Icon-only button aria-label + aria-hidden on decorative icons | P1 | 2 h | Multiple |
| 6 | TopBar dropdown ARIA + keyboard navigation | P1 | 1–2 h | `TopBar.jsx` |
| 7 | Dynamic page titles per route | P2 | 1–2 h | All `src/pages/` |
| 8 | Focus indicator strengthening (global CSS) | P2 | 2–3 h | `App.css` + buttons |
| 9 | Status announcements + loading aria-live | P2 | 2–3 h | `AppShell`, `TripList`, reports |
| 10 | Navigation landmark labels | P2 | 0.5 h | `Sidebar.jsx`, `AppShell.jsx` |
| 11 | Sidebar nav `<ul>/<li>` wrapping | P3 | 1 h | `Sidebar.jsx` |
| 12 | Table `scope` attributes | P3 | 1 h | Invoice + report tables |
| 13 | `prefers-reduced-motion` CSS + toolbar detection | P3 | 1 h | `App.css`, `AccessibilityToolbar.jsx` |
| 14 | Decorative icon `aria-hidden` audit | P3 | 2 h | All components |
| 15 | Add `jest-axe` to test suite | P4 | 2 h | Test files |
| **Total** | | | **25–35 h** | |

---

## Dependency Notes

- **`react-focus-lock`** — small (5kB gzip), actively maintained, zero configuration for the basic case. Alternative: write a manual ~60-line trap (no new dependency).
- All other changes require no new dependencies.
- No existing feature is removed or visually changed by any item in this plan.
- Changes are safe to implement incrementally — each item is self-contained.

---

## WCAG 2.1 AA Compliance Tracker

| Criterion | Current | After P1 | After P2 | After P3 |
|---|---|---|---|---|
| 1.1.1 Non-text Content (A) | FAIL | PASS | PASS | PASS |
| 1.3.1 Info & Relationships (A) | PARTIAL | PARTIAL | PARTIAL | PASS |
| 1.4.3 Contrast (AA) | FAIL | PASS | PASS | PASS |
| 2.1.1 Keyboard (A) | FAIL | PASS | PASS | PASS |
| 2.4.1 Bypass Blocks (A) | FAIL | PASS | PASS | PASS |
| 2.4.2 Page Titled (A) | FAIL | FAIL | PASS | PASS |
| 2.4.7 Focus Visible (AA) | PARTIAL | PARTIAL | PASS | PASS |
| 3.3.1 Error Identification (A) | FAIL | PASS | PASS | PASS |
| 4.1.2 Name, Role, Value (A) | FAIL | PASS | PASS | PASS |
| 4.1.3 Status Messages (AA) | FAIL | PARTIAL | PASS | PASS |

---

*Document version: 30 April 2026 — STX Corporate Portal V2*  
*Review this plan after each phase is complete and update the compliance tracker.*
