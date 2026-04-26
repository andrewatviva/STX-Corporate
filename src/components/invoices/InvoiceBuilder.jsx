import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Search, CheckCircle, Edit2, Check, X } from 'lucide-react';
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

// Use local calendar date — toISOString() would shift to UTC and produce
// the wrong date for Australian users (UTC+10/11).
function toISO(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

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

// Must match the dashboard's SPEND_STATUSES so invoice totals are comparable.
// Pending-approval trips are excluded — they're not confirmed costs yet.
const BILLABLE_STATUSES = new Set(['approved', 'booked', 'travelling', 'completed']);

function toDate(val) {
  if (!val) return null;
  if (typeof val.toDate === 'function') return val.toDate();
  if (val._seconds != null) return new Date(val._seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

// Returns { exGST, gross } for all sectors.
// sector.cost is the total cost as entered (incl. GST for domestic; GST-free for international).
function calcSectorTotals(trip, gstRate = 0.1) {
  let exGST = 0;
  let gross  = 0;
  for (const s of (trip.sectors || [])) {
    const c = parseFloat(s.cost) || 0;
    gross += c;
    exGST += s.international ? c : c / (1 + gstRate);
  }
  return { exGST: parseFloat(exGST.toFixed(2)), gross: parseFloat(gross.toFixed(2)) };
}

function scanForUnbilledItems(trips, finalisedInvoices, periodFrom, periodTo) {
  // Build trip lookup so we can reconstruct sector amounts from old invoice line
  // items that predate the sectorAmount/sectorInclGST fields.
  const tripMap = new Map(trips.map(t => [t.id, t]));

  // Build set of dedup keys + per-trip sector totals already billed.
  // 'trip' line items bundle sector + fees; sectorAmount/sectorInclGST store
  // the sector-only portion so future delta scans aren't inflated by bundled fees.
  const invoiced = new Set();
  const billedSectorTotals = new Map(); // tripId → { exGST, inclGST }

  for (const inv of finalisedInvoices) {
    for (const item of (inv.lineItems || [])) {
      if (item.dedupKey) invoiced.add(item.dedupKey);
      for (const dk of (item.extraDedupKeys || [])) invoiced.add(dk);

      if (item.tripId) {
        if (item.lineType === 'trip') {
          let exGST, inclGST;
          if (item.sectorAmount != null) {
            // New format — sector-only amounts stored explicitly
            exGST   = parseFloat(item.sectorAmount)  || 0;
            inclGST = parseFloat(item.sectorInclGST) || 0;
          } else {
            // Old format — reconstruct sector amounts by subtracting bundled fees
            const trip = tripMap.get(item.tripId);
            const bundledKeys = new Set(item.extraDedupKeys || []);
            let feeExGST = 0, feeInclGST = 0;
            for (const fee of (trip?.fees || [])) {
              const fdk = `${item.tripId}_${fee.type}_${fee.appliedAt}`;
              if (!bundledKeys.has(fdk)) continue;
              const amt = parseFloat(fee.amount) || 0;
              const gst = parseFloat(fee.gstRate ?? 0.1);
              feeExGST   += amt;
              feeInclGST += amt * (1 + gst);
            }
            exGST   = (parseFloat(item.amount  || 0) - feeExGST);
            inclGST = (parseFloat(item.inclGST || 0) - feeInclGST);
          }
          const prev = billedSectorTotals.get(item.tripId) || { exGST: 0, inclGST: 0 };
          billedSectorTotals.set(item.tripId, { exGST: prev.exGST + exGST, inclGST: prev.inclGST + inclGST });
        } else if (item.lineType === 'adjustment') {
          const prev = billedSectorTotals.get(item.tripId) || { exGST: 0, inclGST: 0 };
          billedSectorTotals.set(item.tripId, {
            exGST:   prev.exGST   + (parseFloat(item.amount  || 0) || 0),
            inclGST: prev.inclGST + (parseFloat(item.inclGST || 0) || 0),
          });
        }
      }
    }
  }

  const from = new Date(periodFrom);
  const to   = new Date(periodTo + 'T23:59:59');
  const items = [];

  for (const trip of trips) {
    if (!BILLABLE_STATUSES.has(trip.status)) continue;

    const sectorsDedupKey      = `${trip.id}_sectors`;
    const sectorsAlreadyBilled = invoiced.has(sectorsDedupKey);
    const createdAt            = toDate(trip.createdAt);
    const tripCreatedInPeriod  = createdAt && createdAt >= from && createdAt <= to;

    if (!sectorsAlreadyBilled && tripCreatedInPeriod) {
      // ── New trip: sectors + all in-period fees → single line item ────────
      const { exGST: sectorExGST, gross: sectorGross } = calcSectorTotals(trip);

      let feeExGST   = 0;
      let feeInclGST = 0;
      const feeDedupKeys = [];
      for (const fee of (trip.fees || [])) {
        if (fee.waived) continue;
        const appliedAt = fee.appliedAt ? new Date(fee.appliedAt) : null;
        if (!appliedAt || appliedAt < from || appliedAt > to) continue;
        const fdk = `${trip.id}_${fee.type}_${fee.appliedAt}`;
        if (invoiced.has(fdk)) continue;
        const amt  = parseFloat(fee.amount) || 0;
        const gst  = parseFloat(fee.gstRate ?? 0.1);
        feeExGST   += amt;
        feeInclGST += parseFloat((amt * (1 + gst)).toFixed(2));
        feeDedupKeys.push(fdk);
      }

      const totalExGST   = parseFloat((sectorExGST  + feeExGST).toFixed(2));
      const totalInclGST = parseFloat((sectorGross   + feeInclGST).toFixed(2));

      if (totalInclGST > 0) {
        items.push({
          dedupKey:       sectorsDedupKey,
          extraDedupKeys: feeDedupKeys,  // stored so future scans skip these fees
          tripId:         trip.id,
          tripRef:        trip.tripRef || '',
          travellerName:  trip.travellerName || '',
          costCentre:     trip.costCentre || '',
          description:    trip.title || `Trip ${trip.tripRef || trip.id}`,
          amount:         totalExGST,
          sectorAmount:   sectorExGST,   // sector-only ex-GST — used by future delta scans
          sectorInclGST:  sectorGross,   // sector-only gross — used by future delta scans
          gstRate:        null,          // mixed — not a single rate
          inclGST:        totalInclGST,
          isManual:       false,
          lineType:       'trip',
        });
      }
    } else {
      // ── Already-invoiced trip or prior period: pick up new fees + cost delta ─

      // 1. New fees applied within the invoice period that haven't been billed yet
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
          extraDedupKeys: [],
          tripId:        trip.id,
          tripRef:       trip.tripRef || '',
          travellerName: trip.travellerName || '',
          costCentre:    trip.costCentre || '',
          description:   `${label} — ${trip.title || trip.tripRef || trip.id}`,
          amount,
          gstRate,
          inclGST:       parseFloat((amount * (1 + gstRate)).toFixed(2)),
          isManual:      false,
          lineType:      'fee',
        });
      }

      // 2. Sector cost delta — only for trips whose sectors were previously billed
      if (sectorsAlreadyBilled) {
        const { exGST: currentExGST, gross: currentGross } = calcSectorTotals(trip);
        const prev = billedSectorTotals.get(trip.id) || { exGST: 0, inclGST: 0 };
        const deltaInclGST = parseFloat((currentGross - prev.inclGST).toFixed(2));
        const deltaExGST   = parseFloat((currentExGST - prev.exGST).toFixed(2));

        if (deltaInclGST > 0.01) {
          items.push({
            dedupKey:      null, // no static key — accumulated via billedSectorTotals
            extraDedupKeys: [],
            tripId:        trip.id,
            tripRef:       trip.tripRef || '',
            travellerName: trip.travellerName || '',
            costCentre:    trip.costCentre || '',
            description:   `Cost adjustment — ${trip.title || trip.tripRef || trip.id}`,
            amount:        deltaExGST,
            gstRate:       null,
            inclGST:       deltaInclGST,
            isManual:      false,
            lineType:      'adjustment',
          });
        }
      }
    }
  }

  // Sort: trips → adjustments → fees; within each group by tripRef
  const LINE_ORDER = { trip: 0, adjustment: 1, fee: 2 };
  items.sort((a, b) => {
    const ao = LINE_ORDER[a.lineType] ?? 3;
    const bo = LINE_ORDER[b.lineType] ?? 3;
    if (ao !== bo) return ao - bo;
    return (a.tripRef || '').localeCompare(b.tripRef || '');
  });

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
  const [editingIdx, setEditingIdx]   = useState(null);
  const [editDraft,  setEditDraft]    = useState({ description: '', amount: '', inclGST: '' });

  const finalisedInvoices = useMemo(
    () => invoices.filter(inv => ['finalised', 'paid'].includes(inv.status) && inv.id !== editInvoice?.id),
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
    if (editingIdx === idx) setEditingIdx(null);
  }

  function startItemEdit(idx, item) {
    setEditingIdx(idx);
    setEditDraft({
      description: item.description || '',
      amount:      String(item.amount || 0),
      inclGST:     String(item.inclGST || 0),
    });
  }

  function saveItemEdit(idx) {
    const item   = lineItems[idx];
    const amt    = parseFloat(editDraft.amount) || 0;
    const isMixedGST = item.lineType === 'trip' || item.gstRate == null;
    const inclGST = isMixedGST
      ? parseFloat(editDraft.inclGST) || 0
      : parseFloat((amt * (1 + (item.gstRate ?? 0.1))).toFixed(2));
    setLineItems(prev => prev.map((li, i) => i !== idx ? li : {
      ...li, description: editDraft.description, amount: amt, inclGST,
    }));
    setEditingIdx(null);
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
              ? 'No unbilled trips or fees found for this period.'
              : 'Click "Scan for unbilled items" to find trips booked and fees applied in this period, or add a manual item.'}
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
                {lineItems.map((item, idx) => {
                  const isEditing    = !item.isManual && editingIdx === idx;
                  const isMixedGST   = item.lineType === 'trip' || item.gstRate == null;
                  const draftAmt     = parseFloat(editDraft.amount) || 0;
                  const draftInclGST = isMixedGST
                    ? parseFloat(editDraft.inclGST) || 0
                    : parseFloat((draftAmt * (1 + (item.gstRate ?? 0.1))).toFixed(2));

                  if (isEditing) {
                    return (
                      <tr key={item.dedupKey || idx} className="bg-blue-50/50">
                        <td className="px-4 py-2 font-mono text-xs text-gray-500">{item.tripRef || '—'}</td>
                        <td className="px-4 py-2 text-xs text-gray-600">{item.travellerName || '—'}</td>
                        <td className="px-4 py-2 text-xs text-gray-600">{item.costCentre || '—'}</td>
                        <td className="px-4 py-2">
                          <input
                            autoFocus
                            className="border border-blue-400 rounded px-2 py-1 text-xs w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                            value={editDraft.description}
                            onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))}
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <input
                            type="number" step="0.01"
                            className="border border-blue-400 rounded px-2 py-1 text-xs w-22 text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                            value={editDraft.amount}
                            onChange={e => setEditDraft(d => ({ ...d, amount: e.target.value }))}
                          />
                        </td>
                        <td className="px-4 py-2 text-right text-xs">
                          {isMixedGST ? (
                            <input
                              type="number" step="0.01" title="Incl. GST (gross)"
                              className="border border-blue-400 rounded px-2 py-1 text-xs w-22 text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                              value={editDraft.inclGST}
                              onChange={e => setEditDraft(d => ({ ...d, inclGST: e.target.value }))}
                            />
                          ) : (
                            <span className="text-gray-400">{formatCurrency(draftInclGST - draftAmt)}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-xs font-medium text-gray-700">
                          {formatCurrency(isMixedGST ? (parseFloat(editDraft.inclGST) || 0) : draftInclGST)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <button onClick={() => saveItemEdit(idx)} className="p-1 text-blue-600 hover:text-blue-800" title="Save"><Check size={13} /></button>
                            <button onClick={() => setEditingIdx(null)} className="p-1 text-gray-400 hover:text-gray-600" title="Cancel"><X size={13} /></button>
                            <button onClick={() => removeItem(idx)} className="p-1 text-gray-300 hover:text-red-500" title="Remove"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  if (item.isManual) {
                    return (
                      <tr key={item.dedupKey || idx} className="bg-blue-50/40">
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">
                          <input className="border border-gray-300 rounded px-2 py-1 text-xs w-20 font-mono" value={item.tripRef} placeholder="Ref" onChange={e => updateItem(idx, 'tripRef', e.target.value)} />
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          <input className="border border-gray-300 rounded px-2 py-1 text-xs w-28" value={item.travellerName} placeholder="Traveller" onChange={e => updateItem(idx, 'travellerName', e.target.value)} />
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          <input className="border border-gray-300 rounded px-2 py-1 text-xs w-28" value={item.costCentre} placeholder="Cost centre" onChange={e => updateItem(idx, 'costCentre', e.target.value)} />
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          <input className="border border-gray-300 rounded px-2 py-1 text-xs w-52" value={item.description} placeholder="Description" onChange={e => updateItem(idx, 'description', e.target.value)} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input type="number" className="border border-gray-300 rounded px-2 py-1 text-xs w-20 text-right" value={item.amount} step="0.01" min="0" onChange={e => updateItem(idx, 'amount', parseFloat(e.target.value) || 0)} />
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          <select className="border border-gray-300 rounded px-1 py-1 text-xs" value={item.gstRate} onChange={e => updateItem(idx, 'gstRate', parseFloat(e.target.value))}>
                            <option value={0.1}>10%</option>
                            <option value={0}>GST-free</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-800">{formatCurrency(item.inclGST)}</td>
                        {!isReadOnly && (
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-500 transition-colors" title="Remove"><Trash2 size={14} /></button>
                          </td>
                        )}
                      </tr>
                    );
                  }

                  // Scanned item — view mode
                  return (
                    <tr key={item.dedupKey || idx}>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.tripRef || '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{item.travellerName || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{item.costCentre || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-gray-700">{item.description}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(item.amount)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        {formatCurrency((parseFloat(item.inclGST) || 0) - (parseFloat(item.amount) || 0))}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">{formatCurrency(item.inclGST)}</td>
                      {!isReadOnly && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <button onClick={() => startItemEdit(idx, item)} className="p-1 text-gray-400 hover:text-blue-600 transition-colors" title="Edit"><Edit2 size={13} /></button>
                            <button onClick={() => removeItem(idx)} className="p-1 text-gray-300 hover:text-red-500 transition-colors" title="Remove"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
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
