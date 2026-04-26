import React from 'react';
import { LogOut, User } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { ROLE_LABELS } from '../../utils/permissions';

const LOGO_STX = 'https://www.supportedtravelx.com.au/wp-content/uploads/STX-Logo-Transparent-min-1024x434-1.png';

export default function TopBar() {
  const { userProfile } = useAuth();
  const { clientConfig, isSTX } = useTenant();

  const clientLogo = clientConfig?.branding?.logo;
  const clientName = clientConfig?.branding?.portalTitle;

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-4">
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
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">STX Global</span>
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
