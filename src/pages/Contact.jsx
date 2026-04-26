import React from 'react';
import { Mail, Phone } from 'lucide-react';

export default function Contact() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Contact STX</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-md">
        <p className="text-gray-600 text-sm mb-4">
          For any travel queries or support, contact your STX travel coordinator.
        </p>
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm text-gray-700">
            <Mail size={16} className="text-blue-500" />
            <a href="mailto:travel@supportedtravelx.com.au" className="hover:underline text-blue-600">
              travel@supportedtravelx.com.au
            </a>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-700">
            <Phone size={16} className="text-blue-500" />
            <span>1300 XXX XXX</span>
          </div>
        </div>
      </div>
    </div>
  );
}
