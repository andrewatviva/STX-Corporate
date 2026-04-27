import React, { useMemo, useState } from 'react';
import { ArrowLeft, Download, Printer, ExternalLink, Edit2, Check, X, Trash2, DollarSign } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency, formatDateDisplay, formatDateTime } from '../../utils/formatters';

const STATUS_CFG = {
  draft:      { cls: 'bg-amber-100 text-amber-700',  label: 'Draft' },
  finalised:  { cls: 'bg-green-100 text-green-700',  label: 'Finalised' },
  paid:       { cls: 'bg-teal-100 text-teal-700',    label: 'Paid' },
};

function StatusBadge({ status }) {
  const { cls, label } = STATUS_CFG[status] || { cls: 'bg-gray-100 text-gray-600', label: status };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
}

function recalcTotals(items) {
  const exGST   = items.reduce((s, i) => s + (parseFloat(i.amount)  || 0), 0);
  const inclGST = items.reduce((s, i) => s + (parseFloat(i.inclGST) || 0), 0);
  return {
    subtotalExGST: parseFloat(exGST.toFixed(2)),
    totalGST:      parseFloat((inclGST - exGST).toFixed(2)),
    totalInclGST:  parseFloat(inclGST.toFixed(2)),
  };
}

export default function InvoiceDetail({
  invoice, clientConfig, clientName, clientId,
  onBack, onEdit, updateInvoice, deleteInvoice, onDeleted,
}) {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'stx_admin';

  const [editingIdx,    setEditingIdx]    = useState(null);
  const [editDraft,     setEditDraft]     = useState({ description: '', amount: '', inclGST: '' });
  const [actionSaving,  setActionSaving]  = useState(false);

  // Group items by cost centre, preserving original index for edits
  const grouped = useMemo(() => {
    const map = {};
    (invoice.lineItems || []).forEach((item, origIdx) => {
      const cc = item.costCentre || '(No cost centre)';
      if (!map[cc]) map[cc] = [];
      map[cc].push({ ...item, _origIdx: origIdx });
    });
    return map;
  }, [invoice.lineItems]);

  function startEdit(item) {
    setEditingIdx(item._origIdx);
    setEditDraft({
      description: item.description || '',
      amount:      String(item.amount || 0),
      inclGST:     String(item.inclGST || 0),
    });
  }

  async function saveEdit(item) {
    const amount  = parseFloat(editDraft.amount) || 0;
    // Trip items have mixed GST — both amount and inclGST are editable.
    // Fee items have a fixed gstRate — auto-calc inclGST.
    const inclGST = item.lineType === 'trip' || item.gstRate == null
      ? parseFloat(editDraft.inclGST) || 0
      : parseFloat((amount * (1 + (item.gstRate ?? 0.1))).toFixed(2));

    const newLineItems = (invoice.lineItems || []).map((li, i) =>
      i === item._origIdx
        ? { ...li, description: editDraft.description, amount, inclGST }
        : li
    );
    const newTotals = recalcTotals(newLineItems);
    setActionSaving(true);
    try {
      await updateInvoice(clientId, invoice.id, { lineItems: newLineItems, ...newTotals });
      setEditingIdx(null);
    } finally {
      setActionSaving(false);
    }
  }

  async function handleMarkPaid() {
    if (!window.confirm('Mark this invoice as paid? This will lock it from further editing.')) return;
    setActionSaving(true);
    try { await updateInvoice(clientId, invoice.id, { status: 'paid' }); }
    finally { setActionSaving(false); }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this invoice permanently? This cannot be undone.')) return;
    setActionSaving(true);
    try {
      await deleteInvoice(clientId, invoice.id);
      onDeleted();
    } finally {
      setActionSaving(false);
    }
  }

  function downloadCSV() {
    const rows = [
      ['Invoice Number', invoice.invoiceNumber],
      ...(invoice.name ? [['Invoice Name', invoice.name]] : []),
      ['Client', clientName || ''],
      ['Period', `${formatDateDisplay(invoice.periodFrom)} – ${formatDateDisplay(invoice.periodTo)}`],
      ['Status', STATUS_CFG[invoice.status]?.label || invoice.status],
      [],
      ['Ref', 'Traveller', 'Cost Centre', 'Description', 'Ex-GST ($)', 'GST ($)', 'Incl. GST ($)'],
      ...(invoice.lineItems || []).map(item => [
        item.tripRef || '',
        item.travellerName || '',
        item.costCentre || '',
        item.description || '',
        (parseFloat(item.amount)  || 0).toFixed(2),
        ((parseFloat(item.inclGST) || 0) - (parseFloat(item.amount) || 0)).toFixed(2),
        (parseFloat(item.inclGST) || 0).toFixed(2),
      ]),
      [],
      ['', '', '', 'Subtotal (ex-GST)', (invoice.subtotalExGST || 0).toFixed(2)],
      ['', '', '', 'GST',               (invoice.totalGST     || 0).toFixed(2)],
      ['', '', '', 'Total (incl. GST)', (invoice.totalInclGST || 0).toFixed(2)],
    ];
    const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `${invoice.invoiceNumber}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  function printPDF() {
    const resolvedClientName = clientName || clientConfig?.name || '';
    const statusLabel = STATUS_CFG[invoice.status]?.label || invoice.status;
    const stxLogoUrl  = 'https://www.supportedtravelx.com.au/wp-content/uploads/STX-Logo-Transparent-min-1024x434-1.png';
    const clientLogoUrl = clientConfig?.branding?.logo || '';

    const lineRows = (invoice.lineItems || []).map(item => `
      <tr>
        <td class="mono">${item.tripRef || '—'}</td>
        <td>${item.travellerName || ''}</td>
        <td>${item.costCentre || ''}</td>
        <td>${item.description || ''}</td>
        <td class="num">$${(parseFloat(item.amount) || 0).toFixed(2)}</td>
        <td class="num">$${((parseFloat(item.inclGST) || 0) - (parseFloat(item.amount) || 0)).toFixed(2)}</td>
        <td class="num">$${(parseFloat(item.inclGST) || 0).toFixed(2)}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${invoice.invoiceNumber}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:40px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:20px;border-bottom:2px solid #e5e7eb}
  .logos{display:flex;align-items:center;gap:20px}
  .logos img{max-height:56px;max-width:140px;object-fit:contain}
  .inv-title{text-align:right}
  .inv-title h1{font-size:22px;font-weight:bold;font-family:monospace;margin-bottom:4px}
  .inv-title .inv-name{font-size:14px;color:#374151;margin-bottom:2px}
  .inv-title .status{display:inline-block;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:600;background:#d1fae5;color:#065f46}
  .meta{color:#555;margin-bottom:24px;line-height:2}
  table{width:100%;border-collapse:collapse;margin-bottom:24px}
  th{background:#f3f4f6;text-align:left;padding:8px 10px;font-size:11px;border-bottom:2px solid #d1d5db}
  td{padding:7px 10px;border-bottom:1px solid #f0f0f0;vertical-align:top}
  td.num,th.num{text-align:right} td.mono{font-family:monospace;font-size:11px;color:#6b7280}
  .tw{display:flex;justify-content:flex-end} .tt{width:300px;border-collapse:collapse}
  .tt td{padding:5px 10px;border:none} .tt td.num{text-align:right}
  .tt tr.grand td{font-weight:bold;font-size:13px;border-top:2px solid #d1d5db;padding-top:8px}
  .notes{margin-top:24px;padding:12px;background:#f9fafb;border-radius:6px}
  @media print{body{padding:20px}}
</style></head><body>
  <div class="header">
    <div class="logos">
      <img src="${stxLogoUrl}" alt="STX" onerror="this.style.display='none'" />
      ${clientLogoUrl ? `<img src="${clientLogoUrl}" alt="${resolvedClientName}" onerror="this.style.display='none'" />` : ''}
    </div>
    <div class="inv-title">
      <h1>${invoice.invoiceNumber}</h1>
      ${invoice.name ? `<div class="inv-name">${invoice.name}</div>` : ''}
      <span class="status">${statusLabel}</span>
    </div>
  </div>
  <div class="meta">
    <div><strong>Client:</strong> ${resolvedClientName || '—'}</div>
    <div><strong>Period:</strong> ${formatDateDisplay(invoice.periodFrom)} – ${formatDateDisplay(invoice.periodTo)}</div>
  </div>
  <table><thead><tr>
    <th>Ref</th><th>Traveller</th><th>Cost Centre</th><th>Description</th>
    <th class="num">Ex-GST</th><th class="num">GST</th><th class="num">Incl. GST</th>
  </tr></thead><tbody>${lineRows}</tbody></table>
  <div class="tw"><table class="tt">
    <tr><td>Subtotal (ex-GST)</td><td class="num">$${(invoice.subtotalExGST||0).toFixed(2)}</td></tr>
    <tr><td>GST</td><td class="num">$${(invoice.totalGST||0).toFixed(2)}</td></tr>
    <tr class="grand"><td>Total (incl. GST)</td><td class="num">$${(invoice.totalInclGST||0).toFixed(2)}</td></tr>
  </table></div>
  ${invoice.notes ? `<div class="notes"><strong>Notes</strong><br>${invoice.notes}</div>` : ''}
</body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  const canEdit   = isAdmin && invoice.status !== 'paid';
  const canDelete = isAdmin;
  const canPay    = isAdmin && invoice.status === 'finalised';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
            <ArrowLeft size={14} /> Back to invoices
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-semibold text-gray-800 font-mono">{invoice.invoiceNumber}</h2>
            {invoice.name && (
              <span className="text-base font-medium text-gray-600">{invoice.name}</span>
            )}
            <StatusBadge status={invoice.status} />
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Period: {formatDateDisplay(invoice.periodFrom)} – {formatDateDisplay(invoice.periodTo)}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canPay && (
            <button
              onClick={handleMarkPaid}
              disabled={actionSaving}
              className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-40"
            >
              <DollarSign size={13} /> Mark as paid
            </button>
          )}
          {canEdit && invoice.status === 'draft' && (
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Edit2 size={13} /> Edit
            </button>
          )}
          <button
            onClick={downloadCSV}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download size={13} /> CSV
          </button>
          <button
            onClick={printPDF}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Printer size={13} /> PDF
          </button>
          {isAdmin && (
            <button
              disabled
              title="Xero integration — coming soon"
              className="flex items-center gap-1.5 px-3 py-2 border border-blue-200 rounded-lg text-sm font-medium text-blue-300 cursor-not-allowed"
            >
              <ExternalLink size={13} /> Send to Xero
            </button>
          )}
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={actionSaving}
              className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-500 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-40"
            >
              <Trash2 size={13} /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Line items grouped by cost centre */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {Object.keys(grouped).length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">No line items.</div>
        ) : (
          Object.entries(grouped).map(([cc, items]) => {
            const ccTotal = items.reduce((s, i) => s + (parseFloat(i.inclGST) || 0), 0);
            return (
              <div key={cc} className="border-b border-gray-100 last:border-0">
                <div className="flex items-center justify-between px-5 py-3 bg-gray-50">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{cc}</span>
                  <span className="text-xs text-gray-500">{formatCurrency(ccTotal)} incl. GST</span>
                </div>
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100">
                    <tr>
                      <th className="px-5 py-2 text-left text-xs font-medium text-gray-400 w-24">Ref</th>
                      <th className="px-5 py-2 text-left text-xs font-medium text-gray-400 w-36">Traveller</th>
                      <th className="px-5 py-2 text-left text-xs font-medium text-gray-400">Description</th>
                      <th className="px-5 py-2 text-right text-xs font-medium text-gray-400 w-28">Ex-GST</th>
                      <th className="px-5 py-2 text-right text-xs font-medium text-gray-400 w-24">GST</th>
                      <th className="px-5 py-2 text-right text-xs font-medium text-gray-400 w-28">Incl. GST</th>
                      {canEdit && <th className="px-5 py-2 w-20" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {items.map(item => {
                      const isEditing = editingIdx === item._origIdx;
                      const isTripLine = item.lineType === 'trip' || item.gstRate == null;
                      // Auto-calc inclGST for fee items; for trip items, show separate input
                      const draftInclGST = isTripLine
                        ? parseFloat(editDraft.inclGST) || 0
                        : parseFloat(((parseFloat(editDraft.amount) || 0) * (1 + (item.gstRate ?? 0.1))).toFixed(2));

                      return isEditing ? (
                        <tr key={item.dedupKey || item._origIdx} className="bg-blue-50/40">
                          <td className="px-5 py-2 font-mono text-xs text-gray-500">{item.tripRef || '—'}</td>
                          <td className="px-5 py-2 text-xs text-gray-600">{item.travellerName || '—'}</td>
                          <td className="px-5 py-2">
                            <input
                              autoFocus
                              className="border border-blue-400 rounded px-2 py-1 text-xs w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                              value={editDraft.description}
                              onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))}
                            />
                          </td>
                          <td className="px-5 py-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              className="border border-blue-400 rounded px-2 py-1 text-xs w-24 text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                              value={editDraft.amount}
                              onChange={e => setEditDraft(d => ({ ...d, amount: e.target.value }))}
                            />
                          </td>
                          <td className="px-5 py-2 text-right text-xs text-gray-500">
                            {isTripLine ? (
                              /* trip items: let user set gross (inclGST) directly */
                              <input
                                type="number"
                                step="0.01"
                                title="Incl. GST (gross)"
                                className="border border-blue-400 rounded px-2 py-1 text-xs w-24 text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                                value={editDraft.inclGST}
                                onChange={e => setEditDraft(d => ({ ...d, inclGST: e.target.value }))}
                              />
                            ) : (
                              /* fee items: GST auto-calculated */
                              <span className="text-gray-400">
                                {formatCurrency(draftInclGST - (parseFloat(editDraft.amount) || 0))}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-2 text-right font-medium text-gray-700 text-xs">
                            {isTripLine
                              ? formatCurrency(parseFloat(editDraft.inclGST) || 0)
                              : formatCurrency(draftInclGST)}
                          </td>
                          {canEdit && (
                            <td className="px-5 py-2">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => saveEdit(item)}
                                  disabled={actionSaving}
                                  className="p-1 rounded text-blue-600 hover:text-blue-800 disabled:opacity-40"
                                  title="Save"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  onClick={() => setEditingIdx(null)}
                                  className="p-1 rounded text-gray-400 hover:text-gray-600"
                                  title="Cancel"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ) : (
                        <tr key={item.dedupKey || item._origIdx} className="hover:bg-gray-50/50">
                          <td className="px-5 py-3 font-mono text-xs text-gray-500">{item.tripRef || '—'}</td>
                          <td className="px-5 py-3 text-gray-700">{item.travellerName || '—'}</td>
                          <td className="px-5 py-3 text-gray-700">{item.description}</td>
                          <td className="px-5 py-3 text-right text-gray-700">{formatCurrency(item.amount)}</td>
                          <td className="px-5 py-3 text-right text-gray-500">
                            {formatCurrency((parseFloat(item.inclGST) || 0) - (parseFloat(item.amount) || 0))}
                          </td>
                          <td className="px-5 py-3 text-right font-medium text-gray-800">{formatCurrency(item.inclGST)}</td>
                          {canEdit && (
                            <td className="px-5 py-3 text-right">
                              <button
                                onClick={() => startEdit(item)}
                                className="p-1 rounded text-gray-400 hover:text-blue-600 transition-colors"
                                title="Edit this item"
                              >
                                <Edit2 size={13} />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })
        )}
      </div>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="bg-white rounded-xl border border-gray-200 p-5 w-72">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal (ex-GST)</span>
              <span>{formatCurrency(invoice.subtotalExGST)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>GST</span>
              <span>{formatCurrency(invoice.totalGST)}</span>
            </div>
            <div className="flex justify-between font-semibold text-gray-800 pt-2 border-t border-gray-100 text-base">
              <span>Total (incl. GST)</span>
              <span>{formatCurrency(invoice.totalInclGST)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      {invoice.notes && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Notes</h3>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{invoice.notes}</p>
        </div>
      )}

      <div className="text-xs text-gray-400 pb-2">
        {invoice.createdAt && `Created ${formatDateTime(invoice.createdAt)}`}
        {invoice.updatedAt && ` · Updated ${formatDateTime(invoice.updatedAt)}`}
      </div>
    </div>
  );
}
