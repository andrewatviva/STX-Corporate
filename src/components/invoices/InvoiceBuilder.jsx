import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Search, CheckCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../utils/formatters';

const QUICK_PERIODS = [
  { key: 'thisMonth',   label: 'This month' },
  { key: 'lastMonth',   label: 'Last month' },
  { key: 'thisQuarter', label: 'This quarter' },
  { key: 'lastQuarter', label: 'Last quarter' },
  { key: 'thisFY',      label: 'This FY' },
  { key: 'lastFY',      label: 'Last FY' },
];

function toISO(d) { return d.toISOString().slice(0, 10); }

function getQuickRange(key) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (key) {
    case 'thisMonth':   return { from: toISO(new Date(y, m, 1)),     to: toISO(new Date(y, m + 1, 0)) };
    case 'lastMonth':   return { from: toISO(new Date(y, m - 1, 1)), to: toISO(new Date(y, m, 0)) };
    case 'thisQuarter': {
      const q = Math.floor(m / 3);
      return { from: toISO(new Date(y, q * 3, 1)), to: toISO(new Date(y, q * 3 + 3, 0)) };
    }
    case 'lastQuarter': {
      const q = Math.floor(m / 3);
      const pq = q === 0 ? 3 : q - 1;
      const py = q === 0 ? y - 1 : y;
      return { from: toISO(new Date(py, pq * 3, 1)), to: toISO(new Date(py, pq * 3 + 3, 0)) };
    }
    case 'thisFY': {
      const fy = m >= 6 ? y : y - 1;
      return { from: `${fy}-07-01`, to: `${fy + 1}-06-30` };
    }
    case 'lastFY': {
      const fy = m >= 6 ? y - 1 : y - 2;
      return { from: `${fy}-07-01`, to: `${fy + 1}-06-30` };
    }
    default: return { from: '', to: '' };
  }
}

function scanForUnbilledItems(trips, finalisedInvoices, periodFrom, periodTo) {
  const invoiced = new Set();
  for (const inv of finalisedInvoices) {
    for (const item of (inv.lineItems || [])) {
      if (item.dedupKey) invoiced.add(item.dedupKey);
    }
  }

  const from = new Date(periodFrom);
  const to   = new Date(periodTo + 'T23:59:59');
  const items = [];

  for (const trip of trips) {
    for (const fee of (trip.fees || [])) {
      if (fee.waived) continue;
      const appliedAt = fee.appliedAt ? new Date(fee.appliedAt) : null;
      if (!appliedAt || appliedAt < from || appliedAt > to) continue;

      const dedupKey = `${trip.id}_${fee.type}_${fee.appliedAt}`;
      if (invoiced.has(dedupKey)) continue;

      const amount  = parseFloat(fee.amount) || 0;
      const gstRate = parseFloat(fee.gstRate ?? 0.1);
      const label   = fee.type === 'management' ? 'Management fee'
                    : fee.type === 'amendment'  ? 'Amendment fee'
                    : fee.label || 'Fee';

      items.push({
        dedupKey,
        tripId:        trip.id,
        tripRef:       trip.tripRef || '',
        travellerName: trip.travellerName || '',
        costCentre:    trip.costCentre || '',
        description:   `${label} — ${trip.title || trip.tripRef || trip.id}`,
        amount,
        gstRate,
        inclGST:       parseFloat((amount * (1 + gstRate)).toFixed(2)),
        isManual:      false,
      });
    }
  }

  return items;
}

export default function InvoiceBuilder({
  trips, invoices, clientId, editInvoice,
  onSave, onCancel, createInvoice, updateInvoice,
}) {
  const { userProfile } = useAuth();
  const isAdmin   = userProfile?.role === 'stx_admin';
  const isReadOnly = !isAdmin;

  const initPeriod = editInvoice
    ? { from: editInvoice.periodFrom, to: editInvoice.periodTo }
    : getQuickRange('lastMonth');

  const [quickPeriod, setQuickPeriod] = useState(editInvoice ? null : 'lastMonth');
  const [periodFrom, setPeriodFrom]   = useState(initPeriod.from);
  const [periodTo,   setPeriodTo]     = useState(initPeriod.to);
  const [lineItems,  setLineItems]    = useState(editInvoice?.lineItems || []);
  const [notes,      setNotes]        = useState(editInvoice?.notes || '');
  const [scanned,    setScanned]      = useState(!!editInvoice);
  const [saving,     setSaving]       = useState(false);

  const finalisedInvoices = useMemo(
    () => invoices.filter(inv => inv.status === 'finalised' && inv.id !== editInvoice?.id),
    [invoices, editInvoice]
  );

  function handleQuickPeriod(key) {
    setQuickPeriod(key);
    const { from, to } = getQuickRange(key);
    setPeriodFrom(from);
    setPeriodTo(to);
    setScanned(false);
  }

  function handleScan() {
    const found = scanForUnbilledItems(trips, finalisedInvoices, periodFrom, periodTo);
    setLineItems(prev => {
      const manual = prev.filter(i => i.isManual);
      return [...found, ...manual];
    });
    setScanned(true);
  }

  function addManualItem() {
    setLineItems(prev => [...prev, {
      dedupKey:      `manual_${Date.now()}`,
      tripId:        '',
      tripRef:       '',
      travellerName: '',
      costCentre:    '',
      description:   '',
      amount:        0,
      gstRate:       0.1,
      inclGST:       0,
      isManual:      true,
    }]);
  }

  function updateItem(idx, field, value) {
    setLineItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      if (field === 'amount' || field === 'gstRate') {
        const amt = parseFloat(field === 'amount' ? value : item.amount) || 0;
        const gst = parseFloat(field === 'gstRate' ? value : item.gstRate) ?? 0.1;
        updated.inclGST = parseFloat((amt * (1 + gst)).toFixed(2));
      }
      return updated;
    }));
  }

  function removeItem(idx) {
    setLineItems(prev => prev.filter((_, i) => i !== idx));
  }

  const totals = useMemo(() => {
    const exGST = lineItems.reduce((s, i) => s + (parseFloat(i.amount)  || 0), 0);
    const inclGST = lineItems.reduce((s, i) => s + (parseFloat(i.inclGST) || 0), 0);
    return { exGST, gst: inclGST - exGST, inclGST };
  }, [lineItems]);

  async function handleSave(status) {
    if (!clientId) return;
    setSaving(true);
    try {
      const data = {
        status,
        periodFrom,
        periodTo,
        lineItems,
        notes,
        subtotalExGST: totals.exGST,
        totalGST:      totals.gst,
        totalInclGST:  totals.inclGST,
        createdBy:     userProfile?.uid,
      };
      if (editInvoice) {
        await updateInvoice(clientId, editInvoice.id, data);
        onSave(editInvoice.id);
      } else {
        const id = await createInvoice(clientId, data);
        onSave(id);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">
            {editInvoice ? `Edit ${editInvoice.invoiceNumber}` : 'New Invoice'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">Scan for unbilled fees, then add any manual items</p>
        </div>
        <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">
          Cancel
        </button>
      </div>

      {/* Period selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Invoice period</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {QUICK_PERIODS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleQuickPeriod(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                quickPeriod === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">From</label>
            <input
              type="date"
              value={periodFrom}
              onChange={e => { setPeriodFrom(e.target.value); setQuickPeriod(null); setScanned(false); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">To</label>
            <input
              type="date"
              value={periodTo}
              onChange={e => { setPeriodTo(e.target.value); setQuickPeriod(null); setScanned(false); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleScan}
            disabled={!periodFrom || !periodTo}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            <Search size={14} />
            Scan for unbilled items
          </button>
        </div>
      </div>

      {/* Line items table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-medium text-gray-700">
            Line items{lineItems.length > 0 && (
              <span className="ml-1.5 text-gray-400 font-normal">({lineItems.length})</span>
            )}
          </h3>
          {!isReadOnly && (
            <button
              onClick={addManualItem}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus size={14} /> Add manual item
            </button>
          )}
        </div>

        {lineItems.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            {scanned
              ? 'No unbilled fees found for this period.'
              : 'Click "Scan for unbilled items" to find fees, or add a manual item.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Ref</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Traveller</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Cost centre</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Ex-GST</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">GST</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Incl. GST</th>
                  {!isReadOnly && <th className="px-4 py-3 w-8" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lineItems.map((item, idx) => (
                  <tr key={item.dedupKey || idx} className={item.isManual ? 'bg-blue-50/40' : ''}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {item.isManual ? (
                        <input
                          className="border border-gray-300 rounded px-2 py-1 text-xs w-20 font-mono"
                          value={item.tripRef}
                          placeholder="Ref"
                          onChange={e => updateItem(idx, 'tripRef', e.target.value)}
                        />
                      ) : (item.tripRef || '—')}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {item.isManual ? (
                        <input
                          className="border border-gray-300 rounded px-2 py-1 text-xs w-28"
                          value={item.travellerName}
                          placeholder="Traveller"
                          onChange={e => updateItem(idx, 'travellerName', e.target.value)}
                        />
                      ) : (item.travellerName || '—')}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {item.isManual ? (
                        <input
                          className="border border-gray-300 rounded px-2 py-1 text-xs w-28"
                          value={item.costCentre}
                          placeholder="Cost centre"
                          onChange={e => updateItem(idx, 'costCentre', e.target.value)}
                        />
                      ) : (item.costCentre || <span className="text-gray-300">—</span>)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {item.isManual ? (
                        <input
                          className="border border-gray-300 rounded px-2 py-1 text-xs w-52"
                          value={item.description}
                          placeholder="Description"
                          onChange={e => updateItem(idx, 'description', e.target.value)}
                        />
                      ) : item.description}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.isManual ? (
                        <input
                          type="number"
                          className="border border-gray-300 rounded px-2 py-1 text-xs w-20 text-right"
                          value={item.amount}
                          step="0.01"
                          min="0"
                          onChange={e => updateItem(idx, 'amount', parseFloat(e.target.value) || 0)}
                        />
                      ) : (
                        <span className="text-gray-700">{formatCurrency(item.amount)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {item.isManual ? (
                        <select
                          className="border border-gray-300 rounded px-1 py-1 text-xs"
                          value={item.gstRate}
                          onChange={e => updateItem(idx, 'gstRate', parseFloat(e.target.value))}
                        >
                          <option value={0.1}>10%</option>
                          <option value={0}>GST-free</option>
                        </select>
                      ) : (
                        formatCurrency((parseFloat(item.inclGST) || 0) - (parseFloat(item.amount) || 0))
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">
                      {formatCurrency(item.inclGST)}
                    </td>
                    {!isReadOnly && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => removeItem(idx)}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                          title="Remove"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Totals + notes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Notes</h3>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
            rows={4}
            placeholder="Billing notes or internal comments…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            disabled={isReadOnly}
          />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-medium text-gray-700 mb-4">Totals</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal (ex-GST)</span>
              <span>{formatCurrency(totals.exGST)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>GST</span>
              <span>{formatCurrency(totals.gst)}</span>
            </div>
            <div className="flex justify-between font-semibold text-gray-800 pt-2 border-t border-gray-100 text-base">
              <span>Total (incl. GST)</span>
              <span>{formatCurrency(totals.inclGST)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Save buttons */}
      {!isReadOnly && (
        <div className="flex items-center gap-3 justify-end pb-4">
          <button
            onClick={() => handleSave('draft')}
            disabled={saving || lineItems.length === 0}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving…' : 'Save as draft'}
          </button>
          <button
            onClick={() => handleSave('finalised')}
            disabled={saving || lineItems.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            <CheckCircle size={14} />
            {saving ? 'Finalising…' : 'Finalise invoice'}
          </button>
        </div>
      )}
    </div>
  );
}
