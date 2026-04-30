import React, { useState, useRef } from 'react';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { arrayUnion, arrayRemove } from 'firebase/firestore';
import { storage } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { FolderLock, Upload, Trash2, FileText, Image, File, Download, X } from 'lucide-react';

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

const DOC_TYPES = [
  'Medical Clearance',
  'NDIS Letter',
  'Equipment Card',
  'Travel Insurance',
  'Airline Approval Letter',
  'MEDIF / FREMEC',
  'Identification',
  'Prescription',
  'Other',
];

const TYPE_COLORS = {
  'Medical Clearance':     'bg-red-100 text-red-700',
  'NDIS Letter':           'bg-purple-100 text-purple-700',
  'Equipment Card':        'bg-blue-100 text-blue-700',
  'Travel Insurance':      'bg-green-100 text-green-700',
  'Airline Approval Letter': 'bg-sky-100 text-sky-700',
  'MEDIF / FREMEC':        'bg-sky-100 text-sky-700',
  'Identification':        'bg-gray-100 text-gray-700',
  'Prescription':          'bg-amber-100 text-amber-700',
  'Other':                 'bg-gray-100 text-gray-600',
};

function fmtSize(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ type }) {
  if (type?.startsWith('image/')) return <Image size={15} className="text-blue-400 shrink-0" />;
  if (type === 'application/pdf') return <FileText size={15} className="text-red-400 shrink-0" />;
  return <File size={15} className="text-gray-400 shrink-0" />;
}

export default function DocumentVault({ passengerId, clientId, documents = [], onUpdate, canEdit }) {
  const { userProfile } = useAuth();
  const fileInputRef = useRef();

  const [showUploadForm, setShowUploadForm] = useState(false);
  const [pendingFile, setPendingFile]       = useState(null);
  const [docType, setDocType]               = useState(DOC_TYPES[0]);
  const [docLabel, setDocLabel]             = useState('');
  const [uploading, setUploading]           = useState(false);
  const [progress, setProgress]             = useState(0);
  const [error, setError]                   = useState('');

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError('File must be under 20 MB.');
      return;
    }
    setError('');
    setPendingFile(file);
    setDocLabel(file.name.replace(/\.[^.]+$/, '')); // default label = filename without extension
    setShowUploadForm(true);
    e.target.value = '';
  };

  const handleUpload = () => {
    if (!pendingFile || !passengerId || !clientId) return;
    setError('');
    setUploading(true);
    setProgress(0);

    const storagePath = `clients/${clientId}/passengers/${passengerId}/documents/${Date.now()}_${pendingFile.name}`;
    const task = uploadBytesResumable(ref(storage, storagePath), pendingFile);

    task.on(
      'state_changed',
      snap => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      err  => { setError(err.message); setUploading(false); },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          const meta = {
            name:           docLabel.trim() || pendingFile.name,
            type:           docType,
            fileName:       pendingFile.name,
            url,
            storagePath,
            size:           pendingFile.size,
            fileType:       pendingFile.type,
            uploadedAt:     new Date().toISOString(),
            uploadedBy:     userProfile?.uid || '',
            uploadedByName: [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ') || userProfile?.email || '',
          };
          await onUpdate({ documents: arrayUnion(meta) });
          setPendingFile(null);
          setDocLabel('');
          setDocType(DOC_TYPES[0]);
          setShowUploadForm(false);
        } catch (err) {
          setError(err.message);
        } finally {
          setUploading(false);
          setProgress(0);
        }
      }
    );
  };

  const handleDelete = async (doc) => {
    setError('');
    try {
      await deleteObject(ref(storage, doc.storagePath));
    } catch (err) {
      if (err.code !== 'storage/object-not-found') {
        setError(err.message);
        return;
      }
    }
    try {
      await onUpdate({ documents: arrayRemove(doc) });
    } catch (err) {
      setError(err.message);
    }
  };

  const cancelUpload = () => {
    setPendingFile(null);
    setDocLabel('');
    setDocType(DOC_TYPES[0]);
    setShowUploadForm(false);
    setError('');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <FolderLock size={14} className="text-gray-400" />
          Document Vault
          {documents.length > 0 && (
            <span className="text-gray-400 font-normal">({documents.length})</span>
          )}
        </h3>
        {canEdit && !showUploadForm && (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800"
            >
              <Upload size={13} /> Upload document
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx"
              onChange={handleFileSelect}
            />
          </>
        )}
      </div>

      {error && <p className="text-red-600 text-xs mb-2">{error}</p>}

      {/* Upload form */}
      {showUploadForm && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-blue-700">Upload document</p>
            <button type="button" onClick={cancelUpload} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">Selected file</p>
            <p className="text-sm text-gray-800 font-medium truncate">{pendingFile?.name}</p>
            <p className="text-xs text-gray-400">{pendingFile && fmtSize(pendingFile.size)}</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Document type</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-500"
              value={docType}
              onChange={e => setDocType(e.target.value)}
            >
              {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Display name</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-500"
              value={docLabel}
              onChange={e => setDocLabel(e.target.value)}
              placeholder="e.g. Medical clearance — March 2025"
            />
          </div>

          {uploading && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Uploading…</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading || !pendingFile}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <button
              type="button"
              onClick={cancelUpload}
              disabled={uploading}
              className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Document list */}
      {documents.length === 0 && !showUploadForm ? (
        <p className="text-xs text-gray-400">
          No documents stored. Upload medical clearances, NDIS letters, equipment cards, or other travel documents.
        </p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50">
              <FileIcon type={doc.fileType} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm text-gray-800 font-medium truncate">{doc.name}</p>
                  {doc.type && (
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[doc.type] || 'bg-gray-100 text-gray-600'}`}>
                      {doc.type}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  {fmtSize(doc.size)}
                  {doc.uploadedByName && ` · ${doc.uploadedByName}`}
                  {doc.uploadedAt && ` · ${new Date(doc.uploadedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' })}`}
                </p>
              </div>
              <a
                href={doc.url}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors"
                title="View / download"
              >
                <Download size={14} />
              </a>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleDelete(doc)}
                  className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
                  title="Delete document"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
