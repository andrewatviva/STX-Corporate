import React from 'react';
import { Mail, Phone, MessageSquare } from 'lucide-react';
import { useTenant } from '../contexts/TenantContext';

const STX_PHONE     = '1300 200 789';
const STX_SMS       = '+61 482 071 108';
const STX_SMS_HREF  = 'sms:+61482071108';
const DEFAULT_EMAIL = 'enquiries@supportedtravelx.com.au';

export default function Contact() {
  const { clientConfig, isSTX, activeClientConfig } = useTenant();
  const effectiveConfig = isSTX ? activeClientConfig : clientConfig;
  const contactEmail    = effectiveConfig?.contact?.email || DEFAULT_EMAIL;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Contact STX</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-md">
        <p className="text-gray-600 text-sm mb-5">
          For any travel queries or support, contact your STX travel coordinator.
        </p>
        <div className="space-y-4">

          <div className="flex items-center gap-3 text-sm">
            <Mail size={16} className="text-blue-500 shrink-0" />
            <a href={`mailto:${contactEmail}`} className="text-blue-600 hover:underline break-all">
              {contactEmail}
            </a>
          </div>

          <div className="flex items-center gap-3 text-sm text-gray-700">
            <Phone size={16} className="text-blue-500 shrink-0" />
            <a href={`tel:${STX_PHONE.replace(/\s/g, '')}`} className="hover:text-blue-600">
              {STX_PHONE}
            </a>
          </div>

          <div className="flex items-center gap-3 text-sm text-gray-700">
            <MessageSquare size={16} className="text-blue-500 shrink-0" />
            <div>
              <a href={STX_SMS_HREF} className="hover:text-blue-600">
                {STX_SMS}
              </a>
              <p className="text-xs text-gray-400 mt-0.5">Text message (SMS)</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
