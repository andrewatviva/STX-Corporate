import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, User } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function TravellerAccessibilityCard({ passenger, collapsible = false, defaultExpanded = true }) {
  const [expanded, setExpanded] = useState(collapsible ? defaultExpanded : true);

  if (!passenger) return null;

  const hasWheelchair     = (passenger.mobilityAids || []).some(a => a === 'Manual Wheelchair' || a === 'Power Wheelchair');
  const hasPowerWheelchair = (passenger.mobilityAids || []).includes('Power Wheelchair');

  const hasRequirements =
    (passenger.disabilityType || []).length > 0 ||
    (passenger.mobilityAids || []).length > 0 ||
    passenger.carerRequired ||
    (passenger.dietaryRequirements || []).length > 0 ||
    passenger.allergyNotes?.trim() ||
    passenger.medicalNotes?.trim() ||
    passenger.supportNotes?.trim();

  const headerContent = (
    <>
      {hasRequirements
        ? <AlertTriangle size={14} aria-hidden="true" className="text-amber-600 shrink-0" />
        : <User size={14} aria-hidden="true" className="text-gray-500 shrink-0" />
      }
      <span className={`text-sm font-medium flex-1 ${hasRequirements ? 'text-amber-800' : 'text-gray-700'}`}>
        {hasRequirements ? 'Accessibility requirements on file' : 'No accessibility requirements recorded'}
      </span>
      {collapsible && (
        expanded
          ? <ChevronUp size={14} aria-hidden="true" className="text-gray-500 shrink-0" />
          : <ChevronDown size={14} aria-hidden="true" className="text-gray-500 shrink-0" />
      )}
    </>
  );

  return (
    <div className={`rounded-xl border overflow-hidden ${
      hasRequirements ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'
    }`}>
      {collapsible ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-amber-100 transition-colors"
        >
          {headerContent}
        </button>
      ) : (
        <div className="flex items-center gap-2 px-4 py-3">
          {headerContent}
        </div>
      )}

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {(passenger.disabilityType || []).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Disability / Support needs</p>
              <div className="flex flex-wrap gap-1.5">
                {passenger.disabilityType.map(d => (
                  <span key={d} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(passenger.mobilityAids || []).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Mobility aids</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {passenger.mobilityAids.map(a => (
                  <span key={a} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {a}
                  </span>
                ))}
              </div>
              {hasWheelchair && (passenger.wheelchairModel || passenger.wheelchairWeight || passenger.wheelchairLengthCm) && (
                <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-1 text-xs">
                  {passenger.wheelchairModel && (
                    <p><span className="text-gray-600 w-24 inline-block">Model</span><span className="text-gray-800">{passenger.wheelchairModel}</span></p>
                  )}
                  {passenger.wheelchairWeight && (
                    <p><span className="text-gray-600 w-24 inline-block">Weight</span><span className="text-gray-800">{passenger.wheelchairWeight} kg</span></p>
                  )}
                  {(passenger.wheelchairLengthCm || passenger.wheelchairWidthCm || passenger.wheelchairHeightCm) && (
                    <p>
                      <span className="text-gray-600 w-24 inline-block">Dimensions</span>
                      <span className="text-gray-800">
                        {[
                          passenger.wheelchairLengthCm && `L: ${passenger.wheelchairLengthCm} cm`,
                          passenger.wheelchairWidthCm  && `W: ${passenger.wheelchairWidthCm} cm`,
                          passenger.wheelchairHeightCm && `H: ${passenger.wheelchairHeightCm} cm`,
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </p>
                  )}
                  {passenger.wheelchairTransfer && (
                    <p><span className="text-gray-600 w-24 inline-block">Transfer</span><span className="text-gray-800">{passenger.wheelchairTransfer}</span></p>
                  )}
                  {passenger.wheelchairAssemblyNotes && (
                    <p><span className="text-gray-600 w-24 inline-block">Assembly</span><span className="text-gray-800">{passenger.wheelchairAssemblyNotes}</span></p>
                  )}
                </div>
              )}
              {hasPowerWheelchair && passenger.wheelchairBatteryType && (
                <div className="mt-2 bg-orange-50 border border-orange-200 rounded-lg p-3 text-xs">
                  <p className="font-semibold text-orange-800 mb-1.5">Battery (airline notification required)</p>
                  <p><span className="text-gray-600 w-24 inline-block">Type</span><span className="text-gray-800">{passenger.wheelchairBatteryType}</span></p>
                  {passenger.wheelchairBatteryWh && (
                    <p className="mt-0.5"><span className="text-gray-600 w-24 inline-block">Watt-hours</span><span className="text-gray-800">{passenger.wheelchairBatteryWh} Wh</span></p>
                  )}
                </div>
              )}
            </div>
          )}

          {passenger.carerRequired && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Carer / Support worker</p>
              <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-800">
                Carer required
                {passenger.carerName && <span className="text-gray-700 ml-1">— {passenger.carerName}</span>}
              </div>
            </div>
          )}

          {((passenger.dietaryRequirements || []).length > 0 || passenger.allergyNotes?.trim()) && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Dietary requirements</p>
              {(passenger.dietaryRequirements || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {passenger.dietaryRequirements.map(d => (
                    <span key={d} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {d}
                    </span>
                  ))}
                </div>
              )}
              {passenger.allergyNotes?.trim() && (
                <p className="text-xs text-gray-700">{passenger.allergyNotes}</p>
              )}
            </div>
          )}

          {(passenger.medicalNotes?.trim() || passenger.supportNotes?.trim()) && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Notes</p>
              <div className="space-y-1.5">
                {passenger.medicalNotes?.trim() && (
                  <p className="text-xs text-gray-700"><span className="font-medium">Medical: </span>{passenger.medicalNotes}</p>
                )}
                {passenger.supportNotes?.trim() && (
                  <p className="text-xs text-gray-700"><span className="font-medium">Support: </span>{passenger.supportNotes}</p>
                )}
              </div>
            </div>
          )}

          {!hasRequirements && (
            <p className="text-xs text-gray-500 italic">
              Accessibility information can be added to this traveller&apos;s passenger profile.
            </p>
          )}

          {passenger.id && (
            <div className="pt-2 border-t border-gray-200">
              <Link to="/profiles" className="text-xs text-blue-600 hover:text-blue-800 hover:underline">
                View full profile →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
