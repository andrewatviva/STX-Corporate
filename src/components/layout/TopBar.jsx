import React, { useState, useEffect, useRef } from 'react';
import { LogOut, User, Building2, ChevronDown, X } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { ROLE_LABELS } from '../../utils/permissions';

const LOGO_STX = 'https://www.supportedtravelx.com.au/wp-content/uploads/STX-Logo-Transparent-min-1024x434-1.png';

function ClientSelector({ clientsList, activeClientId, setActiveClientId }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef();

  const activeClient = clientsList.find(c => c.id === activeClientId);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = search
    ? clientsList.filter(c => (c.name || c.id).toLowerCase().includes(search.toLowerCase()))
    : clientsList;

  const select = (id) => {
    setActiveClientId(id);
    setOpen(false);
    setSearch('');
  };

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-lg border transition-colors
          ${activeClient
            ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
            : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
      >
        <Building2 size={13} className={activeClient ? 'text-blue-500' : 'text-gray-400'} />
        <span className="max-w-[160px] truncate font-medium">
          {activeClient ? activeClient.name : 'All clients'}
        </span>
        <ChevronDown size={12} className="shrink-0 opacity-60" />
      </button>

      {activeClient && (
        <button
          onClick={() => setActiveClientId(null)}
          className="p-1 text-gray-400 hover:text-gray-700 rounded transition-colors"
          title="Clear client selection"
        >
          <X size={13} />
        </button>
      )}

      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              placeholder="Search clients…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-sm px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            <button
              onClick={() => select(null)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors
                ${!activeClientId ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              All clients (global view)
            </button>
            {filtered.map(c => (
              <button
                key={c.id}
                onClick={() => select(c.id)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors
                  ${activeClientId === c.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                {c.name || c.id}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">No clients match.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TopBar() {
  const { userProfile } = useAuth();
  const { clientConfig, isSTX, clientsList, activeClientId, setActiveClientId, activeClientConfig } = useTenant();

  // Show active client's branding when STX has selected a client, otherwise own client's branding
  const effectiveConfig = isSTX ? activeClientConfig : clientConfig;
  const clientLogo = effectiveConfig?.branding?.logo;
  const clientName = effectiveConfig?.branding?.portalTitle;

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <img src={LOGO_STX} alt="STX" className="h-8 object-contain" />

        {clientLogo && (
          <>
            <span className="text-gray-300 text-xl">|</span>
            <img src={clientLogo} alt={clientName} className="h-8 object-contain" />
          </>
        )}
        {!clientLogo && clientName && (
          <>
            <span className="text-gray-300 text-xl">|</span>
            <span className="text-gray-700 font-semibold text-sm">{clientName}</span>
          </>
        )}

        {isSTX && (
          <>
            <span className="text-gray-300 text-xl">|</span>
            <ClientSelector
              clientsList={clientsList}
              activeClientId={activeClientId}
              setActiveClientId={setActiveClientId}
            />
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <User size={15} />
          <span>{userProfile?.displayName || userProfile?.email}</span>
          <span className="text-gray-400">·</span>
          <span className="text-gray-400">{ROLE_LABELS[userProfile?.role] ?? userProfile?.role}</span>
        </div>
        <button
          onClick={() => signOut(auth)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </header>
  );
}
