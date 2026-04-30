import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Search, User, Trash2, AlertCircle } from 'lucide-react';
import { collection, query, where, onSnapshot, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { usePassengers } from '../hooks/usePassengers';
import { useTeamScope, filterPassengersByScope } from '../hooks/useTeamScope';
import { usePermissions } from '../contexts/PermissionsContext';
import { PERMISSIONS } from '../utils/permissions';
import Modal from '../components/shared/Modal';
import PassengerForm from '../components/passengers/PassengerForm';
import PassengerDetail from '../components/passengers/PassengerDetail';

// ── Profile completeness ──────────────────────────────────────────────────────
const KEY_FIELDS = [
  'firstName', 'lastName', 'dateOfBirth', 'gender', 'email', 'phone',
  'emergencyName', 'emergencyPhone',
  'identityDocuments',
  'dietaryRequirements',
];

function calcCompleteness(p) {
  let filled = 0;
  for (const f of KEY_FIELDS) {
    const v = p[f];
    if (Array.isArray(v) ? v.length > 0 : v) filled++;
  }
  return Math.round((filled / KEY_FIELDS.length) * 100);
}

// ── Completeness pill ─────────────────────────────────────────────────────────
function CompletenessBadge({ pct }) {
  const color = pct >= 80 ? 'bg-green-100 text-green-700' : pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {pct}%
    </span>
  );
}

// ── Review status ─────────────────────────────────────────────────────────────
function reviewStatus(p) {
  if (!p.lastReviewedAt) return 'never';
  const months = (Date.now() - new Date(p.lastReviewedAt)) / (1000 * 60 * 60 * 24 * 30.44);
  if (months >= 12) return 'overdue';
  if (months >= 10) return 'due_soon';
  return 'ok';
}

function ReviewBadge({ passenger }) {
  const status = reviewStatus(passenger);
  if (status === 'ok') return null;
  const styles = {
    never:    'bg-red-100 text-red-700',
    overdue:  'bg-red-100 text-red-700',
    due_soon: 'bg-amber-100 text-amber-700',
  };
  const labels = {
    never:    'Never reviewed',
    overdue:  'Review overdue',
    due_soon: 'Review due soon',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

// ── Initials avatar ───────────────────────────────────────────────────────────
function Avatar({ passenger }) {
  const initials = [(passenger.firstName || '')[0], (passenger.lastName || '')[0]].filter(Boolean).join('').toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-semibold shrink-0">
      {initials || <User size={16} />}
    </div>
  );
}

// ── Access tags ───────────────────────────────────────────────────────────────
function AccessTags({ passenger }) {
  const tags = [];
  if (passenger.disabilityType?.length) tags.push('Accessibility needs');
  if (passenger.mobilityAids?.length)   tags.push('Mobility aid');
  if (passenger.carerRequired)          tags.push('Carer');
  if (passenger.dietaryRequirements?.length) tags.push('Dietary');
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map(t => (
        <span key={t} className="px-1.5 py-0.5 bg-purple-50 text-purple-700 text-xs rounded">
          {t}
        </span>
      ))}
    </div>
  );
}

// ── Profile change tracking ───────────────────────────────────────────────────
const FIELD_LABELS = {
  firstName:             'First name',
  lastName:              'Last name',
  preferredName:         'Preferred name',
  dateOfBirth:           'Date of birth',
  gender:                'Gender',
  email:                 'Email',
  phone:                 'Phone',
  emergencyName:         'Emergency contact name',
  emergencyPhone:        'Emergency contact phone',
  emergencyRelationship: 'Emergency contact relationship',
  emergencyEmail:        'Emergency contact email',
  identityDocuments:     'Identity documents',
  disabilityType:        'Disability / support needs',
  mobilityAids:          'Mobility aids',
  carerRequired:         'Carer requirement',
  carerName:             'Carer name',
  wheelchairTransfer:    'Wheelchair transfer method',
  wheelchairModel:       'Wheelchair model',
  wheelchairWeight:      'Wheelchair weight',
  wheelchairBatteryType: 'Battery type',
  wheelchairBatteryWh:   'Battery capacity (Wh)',
  wheelchairAssemblyNotes: 'Assembly / disassembly notes',
  dietaryRequirements:   'Dietary requirements',
  allergyNotes:          'Allergy / dietary notes',
  medicalNotes:          'Medical conditions',
  supportNotes:          'Additional support requirements',
  seatPreference:        'Seat preference',
  mealPreference:        'Meal preference',
  loyaltyPrograms:       'Loyalty programs',
  travelNotes:           'Travel notes',
  dataShareConsent:      'Data sharing consent',
};

const DIMENSION_FIELDS = ['wheelchairLengthCm', 'wheelchairWidthCm', 'wheelchairHeightCm'];

function diffPassenger(original, updated) {
  const changed = new Set();

  for (const [field, label] of Object.entries(FIELD_LABELS)) {
    const oldVal = original[field];
    const newVal = updated[field];
    const oldStr = Array.isArray(oldVal) ? JSON.stringify(oldVal) : String(oldVal ?? '');
    const newStr = Array.isArray(newVal) ? JSON.stringify(newVal) : String(newVal ?? '');
    if (oldStr !== newStr) changed.add(label);
  }

  // Group the three dimension fields into one label
  if (DIMENSION_FIELDS.some(f => String(original[f] ?? '') !== String(updated[f] ?? ''))) {
    changed.add('Wheelchair dimensions');
  }

  return [...changed];
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Profiles() {
  useEffect(() => {
    document.title = 'Passenger Profiles — STX Connect';
  }, []);
  const { userProfile } = useAuth();
  const { clientId, isSTX, activeClientId } = useTenant();
  const { hasPermission } = usePermissions();

  const effectiveClientId = isSTX ? activeClientId : clientId;

  const { passengers, loading, addPassenger, updatePassenger, deletePassenger } = usePassengers(effectiveClientId);
  const scope = useTeamScope(userProfile, effectiveClientId);

  // Team members for the portal-account-link dropdown in PassengerForm
  const [teamMembers, setTeamMembers] = useState([]);
  React.useEffect(() => {
    if (!effectiveClientId) return;
    const q = query(collection(db, 'users'), where('clientId', '==', effectiveClientId));
    return onSnapshot(q, snap => setTeamMembers(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [effectiveClientId]);

  const [search, setSearch]           = useState('');
  const [showModal, setShowModal]     = useState(false);
  const [editing, setEditing]         = useState(null);   // passenger object being edited
  const [selectedId, setSelectedId]   = useState(null);   // ID of passenger being viewed
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Derive selected passenger from live onSnapshot data so it auto-refreshes after edits
  const selected = useMemo(
    () => passengers.find(p => p.id === selectedId) ?? null,
    [passengers, selectedId]
  );

  const canEdit   = hasPermission(PERMISSIONS.PASSENGER_EDIT);

  // Apply team scope, then search filter
  const scopedPassengers = useMemo(() => {
    return filterPassengersByScope(passengers, scope, userProfile);
  }, [passengers, scope, userProfile]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return scopedPassengers;
    return scopedPassengers.filter(p => {
      const name = [p.firstName, p.lastName, p.preferredName].filter(Boolean).join(' ').toLowerCase();
      return name.includes(q) || (p.email || '').toLowerCase().includes(q);
    });
  }, [scopedPassengers, search]);

  const handleCreate = () => { setEditing(null); setShowModal(true); };
  const handleEdit   = (p) => { setEditing(p); setShowModal(true); };

  const handleSave = async (data) => {
    if (editing) {
      const changedFields = diffPassenger(editing, data);
      const byName = [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ') || userProfile?.email || '';
      const extra = changedFields.length > 0
        ? { changeLog: arrayUnion({ at: new Date().toISOString(), by: byName, byUid: userProfile?.uid || '', fields: changedFields }) }
        : {};
      await updatePassenger(editing.id, { ...data, updatedBy: userProfile.uid, ...extra });
      setSelectedId(editing.id); // Return to detail view with fresh data
    } else {
      await addPassenger({ ...data, createdBy: userProfile.uid });
    }
    setShowModal(false);
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    await deletePassenger(confirmDelete.id);
    setConfirmDelete(null);
    if (selectedId === confirmDelete.id) setSelectedId(null);
  };

  // If STX with no active client
  if (isSTX && !activeClientId) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Passenger Profiles</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-600">
          <User size={32} className="mx-auto mb-3 text-gray-500" />
          <p className="text-sm">Select a client from the top bar to view passenger profiles.</p>
        </div>
      </div>
    );
  }

  // If viewing a detail
  if (selected) {
    const completeness = calcCompleteness(selected);
    const linkedUser  = selected.userId ? teamMembers.find(m => m.id === selected.userId) : null;
    const manager     = linkedUser?.managerId ? teamMembers.find(m => m.id === linkedUser.managerId) : null;
    const managerName = manager ? [manager.firstName, manager.lastName].filter(Boolean).join(' ') : null;

    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setSelectedId(null)}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            ← Profiles
          </button>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <PassengerDetail
            passenger={selected}
            completeness={completeness}
            managerName={managerName}
            onEdit={() => handleEdit(selected)}
            onBack={() => setSelectedId(null)}
            clientId={effectiveClientId}
            canEdit={canEdit}
            onUpdate={(data) => updatePassenger(selected.id, data)}
          />
          {canEdit && (
            <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setConfirmDelete(selected)}
                className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700"
              >
                <Trash2 size={14} /> Delete profile
              </button>
            </div>
          )}
        </div>

        {/* Edit modal — available from detail view */}
        {showModal && (
          <Modal
            title="Edit passenger profile"
            onClose={() => { setShowModal(false); setEditing(null); }}
            wide
          >
            <PassengerForm
              passenger={editing}
              teamMembers={teamMembers}
              onSave={handleSave}
              onCancel={() => { setShowModal(false); setEditing(null); }}
            />
          </Modal>
        )}
        {confirmDelete && (
          <Modal title="Delete profile" onClose={() => setConfirmDelete(null)}>
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
                <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">
                  Permanently delete the profile for <strong>{confirmDelete.firstName} {confirmDelete.lastName}</strong>?
                  This cannot be undone.
                </p>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700">Delete profile</button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Passenger Profiles</h1>
        {canEdit && (
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            <Plus size={16} /> New profile
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-500"
        />
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-600 text-sm">Loading profiles…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <User size={28} className="mx-auto mb-3 text-gray-500" />
            <p className="text-sm text-gray-700">
              {search ? 'No profiles match your search.' : 'No passenger profiles yet.'}
            </p>
            {!search && canEdit && (
              <button
                onClick={handleCreate}
                className="mt-3 text-sm text-blue-600 hover:text-blue-800"
              >
                Create the first profile
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-700 uppercase tracking-wide">Passenger</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-700 uppercase tracking-wide hidden sm:table-cell">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-700 uppercase tracking-wide hidden md:table-cell">Accessibility</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-700 uppercase tracking-wide">Profile</th>
                {canEdit && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(p => {
                const completeness = calcCompleteness(p);
                const displayName = [p.title, p.preferredName || p.firstName, p.lastName].filter(Boolean).join(' ');
                return (
                  <tr
                    key={p.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedId(p.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar passenger={p} />
                        <div>
                          <p className="font-medium text-gray-900">{displayName}</p>
                          {p.preferredName && (
                            <p className="text-xs text-gray-600">{p.firstName} {p.lastName}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                      <p>{p.email || <span className="text-gray-500">—</span>}</p>
                      <p className="text-xs text-gray-600">{p.phone}</p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <AccessTags passenger={p} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <CompletenessBadge pct={completeness} />
                        <ReviewBadge passenger={p} />
                        <p className="text-xs text-gray-600">
                          {p.lastReviewedAt
                            ? `Reviewed ${new Date(p.lastReviewedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
                            : 'Never reviewed'}
                        </p>
                      </div>
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(p)}
                            className="px-2.5 py-1 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg hover:bg-blue-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setConfirmDelete(p)}
                            className="p-1.5 text-gray-600 hover:text-red-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Scope note for non-ops */}
      {scope?.type === 'self' && (
        <p className="mt-3 text-xs text-gray-600 text-center">
          Showing your own profile only. Contact your manager or operations team to view others.
        </p>
      )}

      {/* Create / Edit modal */}
      {showModal && (
        <Modal
          title={editing ? 'Edit passenger profile' : 'New passenger profile'}
          onClose={() => { setShowModal(false); setEditing(null); }}
          wide
        >
          <PassengerForm
            passenger={editing}
            teamMembers={teamMembers}
            onSave={handleSave}
            onCancel={() => { setShowModal(false); setEditing(null); }}
          />
        </Modal>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <Modal title="Delete profile" onClose={() => setConfirmDelete(null)}>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
              <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">
                Permanently delete the profile for <strong>{confirmDelete.firstName} {confirmDelete.lastName}</strong>?
                This cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancel
              </button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700">
                Delete profile
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
