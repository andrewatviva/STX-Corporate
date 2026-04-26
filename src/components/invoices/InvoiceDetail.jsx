import React, { useMemo } from 'react';
import { ArrowLeft, Download, Printer, ExternalLink, Edit2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency, formatDateDisplay, formatDateTime } from '../../utils/formatters';

function StatusBadge({ status }) {
  const cls = status === 'finalised'
    ? 'bg-green-100 text-green-700'
    : 'bg-amber-100 text-amber-700';
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>
      {status === 'finalised' ? 'Finalised' : 'Draft'}
    </span>
  );
}

export default function InvoiceDetail({ invoice, clientConfig, onBack, onEdit }) {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'stx_admin';

  const grouped = useMemo(() => {
    const map = {};
    for (const item of (invoice.lineItems || [])) {
      const cc = item.costCentre || '(No cost centre)';
      if (!map[cc]) map[cc] = [];
      map[cc].push(item);
    }
    return map;
  }, [invoice.lineItems]);

  function downloadCSV() {
    const clientName = clientConfig?.name || '';
    const rows = [
      ['Invoice Number', invoice.invoiceNumber],
      ['Client', clientName],
      ['Period', `${formatDateDisplay(invoice.periodFrom)} – ${formatDateDisplay(invoice.periodTo)}`],
      ['Status', invoice.status === 'finalised' ? 'Finalised' : 'Draft'],
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

    const csv = rows
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${invoice.invoiceNumber}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printPDF() {
    const clientName = clientConfig?.name || 'Client';
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

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${invoice.invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 40px; }
    h1 { font-size: 24px; font-weight: bold; margin-bottom: 4px; }
    .meta { color: #555; font-size: 12px; margin-bottom: 24px; line-height: 1.8; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; background: #d1fae5; color: #065f46; }
    .badge.draft { background: #fef3c7; color: #92400e; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #f3f4f6; text-align: left; padding: 8px 10px; font-size: 11px; border-bottom: 2px solid #d1d5db; }
    td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
    td.num, th.num { text-align: right; }
    td.mono { font-family: monospace; font-size: 11px; color: #6b7280; }
    .totals-wrap { display: flex; justify-content: flex-end; }
    .totals { width: 300px; border-collapse: collapse; }
    .totals td { padding: 5px 10px; border: none; }
    .totals td.num { text-align: right; }
    .totals tr.grand td { font-weight: bold; font-size: 13px; border-top: 2px solid #d1d5db; padding-top: 8px; }
    .notes { margin-top: 28px; padding: 12px; background: #f9fafb; border-radius: 6px; }
    .notes strong { display: block; margin-bottom: 4px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>${invoice.invoiceNumber}</h1>
  <div class="meta">
    <div><strong>Client:</strong> ${clientName}</div>
    <div><strong>Period:</strong> ${formatDateDisplay(invoice.periodFrom)} – ${formatDateDisplay(invoice.periodTo)}</div>
    <div><strong>Status:</strong> <span class="badge ${invoice.status === 'finalised' ? '' : 'draft'}">${invoice.status === 'finalised' ? 'Finalised' : 'Draft'}</span></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Ref</th>
        <th>Traveller</th>
        <th>Cost Centre</th>
        <th>Description</th>
        <th class="num">Ex-GST</th>
        <th class="num">GST</th>
        <th class="num">Incl. GST</th>
      </tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>
  <div class="totals-wrap">
    <table class="totals">
      <tr><td>Subtotal (ex-GST)</td><td class="num">$${(invoice.subtotalExGST || 0).toFixed(2)}</td></tr>
      <tr><td>GST</td><td class="num">$${(invoice.totalGST || 0).toFixed(2)}</td></tr>
      <tr class="grand"><td>Total (incl. GST)</td><td class="num">$${(invoice.totalInclGST || 0).toFixed(2)}</td></tr>
    </table>
  </div>
  ${invoice.notes ? `<div class="notes"><strong>Notes</strong>${invoice.notes}</div>` : ''}
</body>
</html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2"
          >
            <ArrowLeft size={14} /> Back to invoices
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-semibold text-gray-800 font-mono">{invoice.invoiceNumber}</h2>
            <StatusBadge status={invoice.status} />
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Period: {formatDateDisplay(invoice.periodFrom)} – {formatDateDisplay(invoice.periodTo)}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isAdmin && invoice.status === 'draft' && (
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
                      <th className="px-5 py-2 text-left text-xs font-medium text-gray-400">Traveller</th>
                      <th className="px-5 py-2 text-left text-xs font-medium text-gray-400">Description</th>
                      <th className="px-5 py-2 text-right text-xs font-medium text-gray-400">Ex-GST</th>
                      <th className="px-5 py-2 text-right text-xs font-medium text-gray-400">GST</th>
                      <th className="px-5 py-2 text-right text-xs font-medium text-gray-400">Incl. GST</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {items.map((item, idx) => (
                      <tr key={item.dedupKey || idx} className="hover:bg-gray-50/50">
                        <td className="px-5 py-3 font-mono text-xs text-gray-500">{item.tripRef || '—'}</td>
                        <td className="px-5 py-3 text-gray-700">{item.travellerName || '—'}</td>
                        <td className="px-5 py-3 text-gray-700">{item.description}</td>
                        <td className="px-5 py-3 text-right text-gray-700">{formatCurrency(item.amount)}</td>
                        <td className="px-5 py-3 text-right text-gray-500">
                          {formatCurrency((parseFloat(item.inclGST) || 0) - (parseFloat(item.amount) || 0))}
                        </td>
                        <td className="px-5 py-3 text-right font-medium text-gray-800">
                          {formatCurrency(item.inclGST)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })
        )}
      </div>

      {/* Totals panel */}
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

      {/* Meta */}
      <div className="text-xs text-gray-400 pb-2">
        {invoice.createdAt && `Created ${formatDateTime(invoice.createdAt)}`}
        {invoice.updatedAt && invoice.updatedAt !== invoice.createdAt && ` · Updated ${formatDateTime(invoice.updatedAt)}`}
      </div>
    </div>
  );
}
