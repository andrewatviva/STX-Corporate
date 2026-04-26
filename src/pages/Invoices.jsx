import React, { useState, useMemo } from 'react';
import { Plus, FileText, Eye, Edit2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { useInvoices } from '../hooks/useInvoices';
import { useTrips } from '../hooks/useTrips';
import { formatCurrency, formatDateDisplay } from '../utils/formatters';
import { PERMISSIONS } from '../utils/permissions';
import PermissionGate from '../components/shared/PermissionGate';
import InvoiceBuilder from '../components/invoices/InvoiceBuilder';
import InvoiceDetail from '../components/invoices/InvoiceDetail';

function StatusBadge({ status }) {
  const cls = status === 'finalised'
    ? 'bg-green-100 text-green-700'
    : 'bg-amber-100 text-amber-700';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status === 'finalised' ? 'Finalised' : 'Draft'}
    </span>
  );
}

export default function Invoices() {
  const { userProfile } = useAuth();
  const { clientId: tenantClientId, activeClientId, activeClientConfig, clientConfig, isSTX } = useTenant();
  const isAdmin = userProfile?.role === 'stx_admin';

  const clientId            = isSTX ? activeClientId  : tenantClientId;
  const currentClientConfig = isSTX ? activeClientConfig : clientConfig;

  const { invoices, loading: invLoading, createInvoice, updateInvoice } = useInvoices(clientId);
  const { trips } = useTrips(clientId, isSTX, isSTX ? activeClientId : null);

  const [view,              setView]              = useState('list');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [editInvoice,       setEditInvoice]       = useState(null);

  const selectedInvoice = useMemo(
    () => invoices.find(inv => inv.id === selectedInvoiceId) || null,
    [invoices, selectedInvoiceId]
  );

  function openNew() {
    setEditInvoice(null);
    setView('builder');
  }

  function openEdit(inv) {
    setEditInvoice(inv);
    setView('builder');
  }

  function openDetail(id) {
    setSelectedInvoiceId(id);
    setView('detail');
  }

  function handleSaved(id) {
    setSelectedInvoiceId(id);
    setView('detail');
  }

  function backToList() {
    setView('list');
    setSelectedInvoiceId(null);
    setEditInvoice(null);
  }

  // ── No-client prompt (STX without active client) ──────────────────────────
  if (isSTX && !activeClientId) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Invoices</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          <FileText size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a client from the top bar to view their invoices.</p>
        </div>
      </div>
    );
  }

  return (
    <PermissionGate permission={PERMISSIONS.INVOICE_VIEW}>
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Invoices</h1>

        {/* ── List view ──────────────────────────────────────────────────── */}
        {view === 'list' && (
          <div className="space-y-4">
            {isAdmin && (
              <div className="flex justify-end">
                <button
                  onClick={openNew}
                  disabled={!clientId}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  <Plus size={16} /> New Invoice
                </button>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {invLoading ? (
                <div className="p-8 text-center text-sm text-gray-400">Loading invoices…</div>
              ) : invoices.length === 0 ? (
                <div className="p-12 text-center text-gray-400">
                  <FileText size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No invoices yet.</p>
                  {isAdmin && clientId && (
                    <button
                      onClick={openNew}
                      className="mt-3 text-sm text-blue-600 hover:underline"
                    >
                      Create the first invoice
                    </button>
                  )}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Invoice #</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Period</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                      <th className="px-5 py-3 text-right text-xs font-medium text-gray-500">Items</th>
                      <th className="px-5 py-3 text-right text-xs font-medium text-gray-500">Total (incl. GST)</th>
                      <th className="px-5 py-3 w-20" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {invoices.map(inv => (
                      <tr
                        key={inv.id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => openDetail(inv.id)}
                      >
                        <td className="px-5 py-3 font-mono font-medium text-gray-800">
                          {inv.invoiceNumber}
                        </td>
                        <td className="px-5 py-3 text-gray-600">
                          {formatDateDisplay(inv.periodFrom)} – {formatDateDisplay(inv.periodTo)}
                        </td>
                        <td className="px-5 py-3">
                          <StatusBadge status={inv.status} />
                        </td>
                        <td className="px-5 py-3 text-right text-gray-600">
                          {(inv.lineItems || []).length}
                        </td>
                        <td className="px-5 py-3 text-right font-medium text-gray-800">
                          {formatCurrency(inv.totalInclGST)}
                        </td>
                        <td className="px-5 py-3 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openDetail(inv.id)}
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                              title="View"
                            >
                              <Eye size={14} />
                            </button>
                            {isAdmin && inv.status === 'draft' && (
                              <button
                                onClick={() => openEdit(inv)}
                                className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                                title="Edit"
                              >
                                <Edit2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── Builder view ────────────────────────────────────────────────── */}
        {view === 'builder' && (
          <InvoiceBuilder
            trips={trips}
            invoices={invoices}
            clientId={clientId}
            editInvoice={editInvoice}
            onSave={handleSaved}
            onCancel={backToList}
            createInvoice={createInvoice}
            updateInvoice={updateInvoice}
          />
        )}

        {/* ── Detail view ─────────────────────────────────────────────────── */}
        {view === 'detail' && selectedInvoice && (
          <InvoiceDetail
            invoice={selectedInvoice}
            clientConfig={currentClientConfig}
            onBack={backToList}
            onEdit={() => openEdit(selectedInvoice)}
          />
        )}
      </div>
    </PermissionGate>
  );
}
