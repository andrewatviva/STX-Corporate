import React, { useState, useRef } from 'react';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { arrayUnion, arrayRemove } from 'firebase/firestore';
import { storage } from '../../firebase';
import { Paperclip, Upload, Trash2, FileText, Image, File, Download } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function fmtSize(bytes) {
  if (bytes < 1024)             return `${bytes} B`;
  if (bytes < 1024 * 1024)      return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ type }) {
  if (type?.startsWith('image/')) return <Image size={15} className="text-blue-400 shrink-0" />;
  if (type === 'application/pdf') return <FileText size={15} className="text-red-400 shrink-0" />;
  return <File size={15} className="text-gray-400 shrink-0" />;
}

export default function Attachments({ trip, clientId, onUpdate, canEdit }) {
  const { userProfile } = useAuth();
  const [uploading, setUploading]   = useState(false);
  const [progress, setProgress]     = useState(0);
  const [error, setError]           = useState('');
  const fileInputRef = useRef();

  const attachments = trip.attachments || [];

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError('File must be under 10 MB.');
      return;
    }

    setError('');
    setUploading(true);
    setProgress(0);

    const storagePath = `clients/${clientId}/trips/${trip.id}/${Date.now()}_${file.name}`;
    const task = uploadBytesResumable(ref(storage, storagePath), file);

    task.on(
      'state_changed',
      snap => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      err  => { setError(err.message); setUploading(false); },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          const meta = {
            name:           file.name,
            url,
            storagePath,
            size:           file.size,
            fileType:       file.type,
            uploadedAt:     new Date().toISOString(),
            uploadedBy:     userProfile?.uid || '',
            uploadedByName: [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ') || userProfile?.email || '',
          };
          await onUpdate({ attachments: arrayUnion(meta) });
        } catch (err) {
          setError(err.message);
        } finally {
          setUploading(false);
          setProgress(0);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      }
    );
  };

  const handleDelete = async (att) => {
    setError('');
    try {
      await deleteObject(ref(storage, att.storagePath));
    } catch (err) {
      if (err.code !== 'storage/object-not-found') {
        setError(err.message);
        return;
      }
    }
    try {
      await onUpdate({ attachments: arrayRemove(att) });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <Paperclip size={14} className="text-gray-400" />
          Attachments
          {attachments.length > 0 && (
            <span className="text-gray-400 font-normal">({attachments.length})</span>
          )}
        </h3>
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
              <Upload size={13} /> Upload file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
            />
          </>
        )}
      </div>

      {uploading && (
        <div className="mb-3 space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Uploading…</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {error && <p className="text-red-600 text-xs mb-2">{error}</p>}

      {attachments.length === 0 && !uploading ? (
        <p className="text-xs text-gray-400">No attachments. Upload boarding passes, confirmations, or other documents.</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((att, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50">
              <FileIcon type={att.fileType} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate font-medium">{att.name}</p>
                <p className="text-xs text-gray-400">
                  {fmtSize(att.size)}
                  {att.uploadedByName && ` · ${att.uploadedByName}`}
                  {att.uploadedAt && ` · ${new Date(att.uploadedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' })}`}
                </p>
              </div>
              <a
                href={att.url}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors"
                title="Download"
              >
                <Download size={14} />
              </a>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleDelete(att)}
                  className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
                  title="Delete attachment"
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
