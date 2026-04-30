import React, { useState, useEffect, useRef } from 'react';
import { LogOut, User, Building2, ChevronDown, X, Settings } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { ROLE_LABELS } from '../../utils/permissions';
import AccountSettings from '../account/AccountSettings';

function ClientSelector({ clientsList, activeClientId, setActiveClientId }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef();
  const listRef = useRef();
  const [activeIdx, setActiveIdx] = useState(-1);

  const activeClient = clientsList.find(c => c.id === activeClientId);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Reset active index when list or search changes
  useEffect(() => { setActiveIdx(-1); }, [search, open]);

  const allOptions = [{ id: null, name: 'All clients (global view)' }, ...clientsList];
  const filtered = [
    allOptions[0],
    ...(search
      ? clientsList.filter(c => (c.name || c.id).toLowerCase().includes(search.toLowerCase()))
      : clientsList),
  ];

  const select = (id) => {
    setActiveClientId(id);
    setOpen(false);
    setSearch('');
  };

  const handleTriggerKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActiveIdx(0); }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); }
    if (e.key === 'Escape') setOpen(false);
  };

  const handleListKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    }
    if ((e.key === 'Enter' || e.key === ' ') && activeIdx >= 0) {
      e.preventDefault();
      select(filtered[activeIdx]?.id ?? null);
    }
  };

  // Sync keyboard-focused option into view
  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[role="option"]');
    items[activeIdx]?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <button
        onClick={() => setOpen(o => !o)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={activeClient ? `Working client: ${activeClient.name}` : 'Working client: All clients'}
        className={`flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-lg border transition-colors
          ${activeClient
            ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
            : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
      >
        <Building2 size={13} aria-hidden="true" className={activeClient ? 'text-blue-500' : 'text-gray-500'} />
        <span className="max-w-[160px] truncate font-medium">
          {activeClient ? activeClient.name : 'All clients'}
        </span>
        <ChevronDown size={12} aria-hidden="true" className="shrink-0 opacity-60" />
      </button>

      {activeClient && (
        <button
          onClick={() => setActiveClientId(null)}
          aria-label="Clear client selection — return to all clients view"
          className="p-1 text-gray-500 hover:text-gray-700 rounded transition-colors"
        >
          <X size={13} aria-hidden="true" />
        </button>
      )}

      {open && (
        <div
          className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50"
          onKeyDown={handleListKeyDown}
        >
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              placeholder="Search clients…"
              aria-label="Search clients"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-sm px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <ul
            ref={listRef}
            role="listbox"
            aria-label="Client list"
            className="max-h-64 overflow-y-auto py-1 list-none m-0 p-0"
          >
            {filtered.map((c, idx) => (
              <li
                key={c.id ?? '__all__'}
                role="option"
                aria-selected={c.id === activeClientId || (c.id === null && !activeClientId)}
                onClick={() => select(c.id)}
                className={`px-3 py-2 text-sm cursor-pointer transition-colors
                  ${activeIdx === idx ? 'bg-blue-100' : ''}
                  ${(c.id === activeClientId || (c.id === null && !activeClientId)) ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                {c.name || c.id}
              </li>
            ))}
            {filtered.length <= 1 && search && (
              <li className="px-3 py-2 text-xs text-gray-600" role="option" aria-selected="false">No clients match.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

const LOGO_STX = 'https://www.supportedtravelx.com.au/wp-content/uploads/STX-Logo-Transparent-min-1024x434-1.png';

export default function TopBar() {
  const { userProfile } = useAuth();
  const { clientConfig, isSTX, clientsList, activeClientId, setActiveClientId, activeClientConfig } = useTenant();
  const [showSettings, setShowSettings] = useState(false);

  const effectiveConfig = isSTX ? activeClientConfig : clientConfig;
  const clientLogo = effectiveConfig?.branding?.logo;
  const clientName = effectiveConfig?.branding?.portalTitle;

  return (
    <>
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <img src={LOGO_STX} alt="STX" className="h-8 object-contain" />

          {clientLogo && (
            <>
              <span className="text-gray-400 text-xl" aria-hidden="true">|</span>
              <img src={clientLogo} alt={clientName} className="h-8 object-contain" />
            </>
          )}
          {!clientLogo && clientName && (
            <>
              <span className="text-gray-400 text-xl" aria-hidden="true">|</span>
              <span className="text-gray-700 font-semibold text-sm">{clientName}</span>
            </>
          )}

          {isSTX && (
            <>
              <span className="text-gray-400 text-xl" aria-hidden="true">|</span>
              <ClientSelector
                clientsList={clientsList}
                activeClientId={activeClientId}
                setActiveClientId={setActiveClientId}
              />
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-700" aria-label={`Signed in as ${userProfile?.displayName || userProfile?.email}, ${ROLE_LABELS[userProfile?.role] ?? userProfile?.role}`}>
            <User size={15} aria-hidden="true" />
            <span>{userProfile?.displayName || userProfile?.email}</span>
            <span className="text-gray-500" aria-hidden="true">·</span>
            <span className="text-gray-600">{ROLE_LABELS[userProfile?.role] ?? userProfile?.role}</span>
          </div>

          <button
            onClick={() => setShowSettings(true)}
            aria-label="Account settings"
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            <Settings size={15} aria-hidden="true" />
            <span className="hidden sm:inline">Settings</span>
          </button>

          <button
            onClick={() => signOut(auth)}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-red-600 transition-colors"
          >
            <LogOut size={15} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </header>

      {showSettings && <AccountSettings onClose={() => setShowSettings(false)} />}
    </>
  );
}
