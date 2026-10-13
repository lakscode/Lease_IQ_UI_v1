import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { uploadLease } from '../api/client.js';
import { formatBytes } from '../utils/format.js';

const MAX_MB = 20;
const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx'];

const EMPTY_FORM = {
  title: '',
  tenant_name: '',
  landlord_name: '',
  property_address: '',
  start_date: '',
  end_date: '',
  monthly_rent: '',
  notes: '',
};

function validateFile(file) {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!ACCEPTED_EXTENSIONS.includes(ext)) return 'Only PDF, DOC and DOCX files are supported.';
  if (file.size > MAX_MB * 1024 * 1024) return `File is larger than ${MAX_MB} MB.`;
  return '';
}

export default function LeaseUpload() {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [uploaded, setUploaded] = useState(null);

  const pickFile = (selected) => {
    if (!selected) return;
    const problem = validateFile(selected);
    setError(problem);
    setFile(problem ? null : selected);
    setUploaded(null);
    if (!problem && !form.title) {
      setForm((f) => ({ ...f, title: selected.name.replace(/\.[^.]+$/, '') }));
    }
  };

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const reset = () => {
    setFile(null);
    setForm(EMPTY_FORM);
    setProgress(0);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!file) {
      setError('Please choose a lease document to upload.');
      return;
    }
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      setError('End date cannot be before start date.');
      return;
    }

    const data = new FormData();
    data.append('file', file);
    Object.entries(form).forEach(([key, value]) => data.append(key, value));

    setUploading(true);
    setError('');
    setProgress(0);
    try {
      const lease = await uploadLease(data, setProgress);
      setUploaded(lease);
      reset();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Upload lease</h1>
          <p className="muted">Add a lease document and its key terms.</p>
        </div>
      </div>

      {uploaded && (
        <div className="alert alert-success">
          <strong>{uploaded.title}</strong> was uploaded successfully.{' '}
          <Link to="/dashboard">Back to dashboard</Link>
        </div>
      )}

      <form className="card upload-form" onSubmit={handleSubmit}>
        <div
          className={`dropzone${dragging ? ' dropzone-active' : ''}${file ? ' dropzone-filled' : ''}`}
          onClick={() => !uploading && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!uploading) pickFile(e.dataTransfer.files?.[0]);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(',')}
            hidden
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          {file ? (
            <div className="file-chip">
              <span className="file-icon">📄</span>
              <div>
                <div className="cell-title">{file.name}</div>
                <div className="cell-sub">{formatBytes(file.size)}</div>
              </div>
              {!uploading && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    if (inputRef.current) inputRef.current.value = '';
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="dropzone-icon">⬆</div>
              <p>
                <strong>Click to choose</strong> or drag and drop a lease document
              </p>
              <p className="muted small">PDF, DOC or DOCX · up to {MAX_MB} MB</p>
            </>
          )}
        </div>

        <div className="form-grid">
          <label className="field field-full">
            <span>Lease title</span>
            <input name="title" value={form.title} onChange={updateField} placeholder="e.g. Suite 400 – Office Lease" />
          </label>
          <label className="field">
            <span>Tenant</span>
            <input name="tenant_name" value={form.tenant_name} onChange={updateField} />
          </label>
          <label className="field">
            <span>Landlord</span>
            <input name="landlord_name" value={form.landlord_name} onChange={updateField} />
          </label>
          <label className="field field-full">
            <span>Property address</span>
            <input name="property_address" value={form.property_address} onChange={updateField} />
          </label>
          <label className="field">
            <span>Start date</span>
            <input type="date" name="start_date" value={form.start_date} onChange={updateField} />
          </label>
          <label className="field">
            <span>End date</span>
            <input type="date" name="end_date" value={form.end_date} onChange={updateField} />
          </label>
          <label className="field">
            <span>Monthly rent (USD)</span>
            <input
              type="number"
              name="monthly_rent"
              min="0"
              step="0.01"
              value={form.monthly_rent}
              onChange={updateField}
            />
          </label>
          <label className="field field-full">
            <span>Notes</span>
            <textarea name="notes" rows={3} value={form.notes} onChange={updateField} />
          </label>
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}

        {uploading && (
          <div className="progress" aria-label="Upload progress">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
            <span className="progress-label">{progress < 100 ? `${progress}%` : 'Processing…'}</span>
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={reset} disabled={uploading}>
            Clear
          </button>
          <button type="submit" className="btn btn-primary" disabled={uploading || !file}>
            {uploading ? 'Uploading…' : 'Upload lease'}
          </button>
        </div>
      </form>
    </div>
  );
}
