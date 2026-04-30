/**
 * Returns a function that posts a message to the global aria-live status announcer.
 * Used to notify screen reader users of dynamic UI changes (filter results, saves, etc.).
 */
export function useAnnounce() {
  return (message) => {
    const el = document.getElementById('status-announcer');
    if (!el) return;
    el.textContent = '';
    requestAnimationFrame(() => { el.textContent = message; });
  };
}
