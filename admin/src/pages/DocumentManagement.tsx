import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../lib/OrgContext';
import { getLocale } from '../lib/i18n';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Employee {
  id: string;
  display_name: string | null;
  line_display_name: string | null;
}

interface EmployeeDocument {
  id: string;
  org_id: string;
  employee_id: string;
  doc_type: string;
  file_name: string;
  storage_path: string;
  file_size: number | null;
  mime_type: string | null;
  expiry_date: string | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DOC_TYPE_STYLES: Record<string, { bg: string; color: string; label: string; labelEn: string }> = {
  contract:    { bg: '#dbeafe', color: '#1d4ed8', label: '合約',   labelEn: 'Contract' },
  id_card:     { bg: '#fef9c3', color: '#a16207', label: '身分證', labelEn: 'ID Card' },
  resume:      { bg: '#dcfce7', color: '#15803d', label: '履歷',   labelEn: 'Resume' },
  certificate: { bg: '#f3e8ff', color: '#7e22ce', label: '證書',   labelEn: 'Certificate' },
  other:       { bg: '#f3f4f6', color: '#374151', label: '其他',   labelEn: 'Other' },
};

function DocTypeBadge({ type, zh }: { type: string; zh: boolean }) {
  const s = DOC_TYPE_STYLES[type] ?? DOC_TYPE_STYLES.other;
  return (
    <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>
      {zh ? s.label : s.labelEn}
    </span>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function daysUntil(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DocumentManagement() {
  const { orgId, currentUser } = useOrg();
  const zh = getLocale() === 'zh-TW';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<'list' | 'upload' | 'expiring'>('list');
  const [docs, setDocs] = useState<EmployeeDocument[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterType, setFilterType] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Upload form state
  const [uploadForm, setUploadForm] = useState({
    employee_id: '',
    doc_type: 'contract',
    expiry_date: '',
    notes: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    if (!orgId) return;
    supabase
      .from('users')
      .select('id, display_name, line_display_name')
      .eq('org_id', orgId)
      .then(({ data }) => setEmployees(data || []));
  }, [orgId]);

  const loadDocs = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    let q = supabase
      .from('employee_documents')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (filterEmployee) q = q.eq('employee_id', filterEmployee);
    if (filterType)     q = q.eq('doc_type', filterType);

    const { data } = await q;
    setDocs(data || []);
    setLoading(false);
  }, [orgId, filterEmployee, filterType]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const empName = (id: string) => {
    const e = employees.find(e => e.id === id);
    return e?.display_name || e?.line_display_name || id.slice(0, 8);
  };

  const handleDownload = async (doc: EmployeeDocument) => {
    const { data, error } = await supabase.storage
      .from('employee-documents')
      .createSignedUrl(doc.storage_path, 60);
    if (error || !data?.signedUrl) {
      alert(zh ? '無法取得下載連結' : 'Could not generate download link');
      return;
    }
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = doc.file_name;
    a.click();
  };

  const handleDelete = async (doc: EmployeeDocument) => {
    if (!confirm(zh ? `確定刪除「${doc.file_name}」？` : `Delete "${doc.file_name}"?`)) return;
    await supabase.storage.from('employee-documents').remove([doc.storage_path]);
    await supabase.from('employee_documents').delete().eq('id', doc.id);
    loadDocs();
  };

  const handleUpload = async () => {
    setUploadError('');
    if (!uploadForm.employee_id) { setUploadError(zh ? '請選擇員工' : 'Select an employee'); return; }
    if (!selectedFile) { setUploadError(zh ? '請選擇檔案' : 'Select a file'); return; }

    setUploading(true);
    const ext = selectedFile.name.split('.').pop();
    const path = `${orgId}/${uploadForm.employee_id}/${Date.now()}.${ext}`;

    const { error: storageError } = await supabase.storage
      .from('employee-documents')
      .upload(path, selectedFile, { contentType: selectedFile.type });

    if (storageError) {
      setUploadError(storageError.message);
      setUploading(false);
      return;
    }

    const { error: dbError } = await supabase.from('employee_documents').insert({
      org_id: orgId,
      employee_id: uploadForm.employee_id,
      doc_type: uploadForm.doc_type,
      file_name: selectedFile.name,
      storage_path: path,
      file_size: selectedFile.size,
      mime_type: selectedFile.type,
      expiry_date: uploadForm.expiry_date || null,
      notes: uploadForm.notes || null,
      uploaded_by: currentUser?.id ?? null,
    });

    if (dbError) {
      // Cleanup orphaned file
      await supabase.storage.from('employee-documents').remove([path]);
      setUploadError(dbError.message);
      setUploading(false);
      return;
    }

    setUploading(false);
    setUploadSuccess(true);
    setSelectedFile(null);
    setUploadForm({ employee_id: '', doc_type: 'contract', expiry_date: '', notes: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => setUploadSuccess(false), 3000);
    loadDocs();
  };

  // Expiring within 30 days
  const expiringDocs = docs.filter(d => {
    if (!d.expiry_date) return false;
    const days = daysUntil(d.expiry_date);
    return days >= 0 && days <= 30;
  }).sort((a, b) => a.expiry_date!.localeCompare(b.expiry_date!));

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>
          📁 {zh ? '文件管理' : 'Document Management'}
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
          {zh ? '員工合約、身份證件、證書等文件管理' : 'Manage employee contracts, ID documents, certificates'}
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div className="card" style={{ padding: '14px', textAlign: 'center' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#6366f1' }}>{docs.length}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{zh ? '總文件數' : 'Total Docs'}</div>
        </div>
        <div className="card" style={{ padding: '14px', textAlign: 'center' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#dc2626' }}>{expiringDocs.length}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{zh ? '即將到期' : 'Expiring Soon'}</div>
        </div>
        <div className="card" style={{ padding: '14px', textAlign: 'center' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#16a34a' }}>
            {docs.filter(d => d.doc_type === 'contract').length}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{zh ? '合約數' : 'Contracts'}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: '16px' }}>
        {([
          { key: 'list',     label: zh ? '📁 文件列表' : '📁 Documents' },
          { key: 'upload',   label: zh ? '📤 上傳文件' : '📤 Upload' },
          { key: 'expiring', label: `⏰ ${zh ? '即將到期' : 'Expiring'} ${expiringDocs.length > 0 ? `(${expiringDocs.length})` : ''}` },
        ] as const).map(({ key, label }) => (
          <button key={key} className={`tab-item ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: List ── */}
      {tab === 'list' && (
        <>
          <div className="card" style={{ padding: '14px', marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <select className="input-field" style={{ flex: '1 1 180px' }} value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}>
              <option value="">{zh ? '所有員工' : 'All Employees'}</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.display_name || e.line_display_name || e.id.slice(0, 8)}</option>
              ))}
            </select>
            <select className="input-field" style={{ flex: '0 0 140px' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">{zh ? '所有類型' : 'All Types'}</option>
              {Object.entries(DOC_TYPE_STYLES).map(([k, v]) => (
                <option key={k} value={k}>{zh ? v.label : v.labelEn}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{zh ? '載入中...' : 'Loading...'}</div>
          ) : docs.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '尚無文件。請至「上傳文件」頁上傳。' : 'No documents. Go to Upload tab to add files.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
              {docs.map(doc => (
                <div key={doc.id} className="card" style={{ padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <DocTypeBadge type={doc.doc_type} zh={zh} />
                    {doc.expiry_date && daysUntil(doc.expiry_date) <= 30 && (
                      <span style={{ fontSize: '10px', background: '#fee2e2', color: '#b91c1c', padding: '1px 6px', borderRadius: '8px' }}>
                        ⚠ {daysUntil(doc.expiry_date)}d
                      </span>
                    )}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px', wordBreak: 'break-all' }}>{doc.file_name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                    👤 {empName(doc.employee_id)}
                  </div>
                  {doc.file_size && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatBytes(doc.file_size)}</div>
                  )}
                  {doc.expiry_date && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {zh ? '到期' : 'Expires'}: {doc.expiry_date}
                    </div>
                  )}
                  {doc.notes && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                      {doc.notes}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleDownload(doc)}>
                      ⬇ {zh ? '下載' : 'Download'}
                    </button>
                    <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#b91c1c', border: 'none' }} onClick={() => handleDelete(doc)}>
                      🗑 {zh ? '刪除' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Tab: Upload ── */}
      {tab === 'upload' && (
        <div className="card" style={{ padding: '24px', maxWidth: '560px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px' }}>
            {zh ? '上傳員工文件' : 'Upload Employee Document'}
          </h2>

          <div style={{ display: 'grid', gap: '12px' }}>
            <div>
              <label className="detail-label">{zh ? '員工 *' : 'Employee *'}</label>
              <select
                className="input-field"
                value={uploadForm.employee_id}
                onChange={e => setUploadForm(f => ({ ...f, employee_id: e.target.value }))}
              >
                <option value="">{zh ? '選擇員工' : 'Select employee'}</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.display_name || e.line_display_name || e.id.slice(0, 8)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="detail-label">{zh ? '文件類型 *' : 'Document Type *'}</label>
              <select
                className="input-field"
                value={uploadForm.doc_type}
                onChange={e => setUploadForm(f => ({ ...f, doc_type: e.target.value }))}
              >
                {Object.entries(DOC_TYPE_STYLES).map(([k, v]) => (
                  <option key={k} value={k}>{zh ? v.label : v.labelEn}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="detail-label">{zh ? '檔案 *' : 'File *'}</label>
              <input
                ref={fileInputRef}
                type="file"
                className="input-field"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
              />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {zh ? '支援: PDF, JPG, PNG, DOCX (最大 50 MB)' : 'Supports: PDF, JPG, PNG, DOCX (max 50 MB)'}
              </div>
            </div>

            <div>
              <label className="detail-label">{zh ? '到期日' : 'Expiry Date'}</label>
              <input
                type="date"
                className="input-field"
                value={uploadForm.expiry_date}
                onChange={e => setUploadForm(f => ({ ...f, expiry_date: e.target.value }))}
              />
            </div>

            <div>
              <label className="detail-label">{zh ? '備註' : 'Notes'}</label>
              <textarea
                className="input-field"
                rows={3}
                value={uploadForm.notes}
                onChange={e => setUploadForm(f => ({ ...f, notes: e.target.value }))}
                placeholder={zh ? '選填' : 'Optional'}
              />
            </div>
          </div>

          {uploadError && (
            <div style={{ marginTop: '12px', color: '#dc2626', fontSize: '13px' }}>{uploadError}</div>
          )}
          {uploadSuccess && (
            <div style={{ marginTop: '12px', color: '#16a34a', fontSize: '13px' }}>
              ✓ {zh ? '上傳成功！' : 'Upload successful!'}
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ marginTop: '16px', width: '100%' }}
            onClick={handleUpload}
            disabled={uploading}
          >
            {uploading ? (zh ? '上傳中...' : 'Uploading...') : (zh ? '上傳文件' : 'Upload Document')}
          </button>
        </div>
      )}

      {/* ── Tab: Expiring ── */}
      {tab === 'expiring' && (
        <>
          {expiringDocs.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              ✓ {zh ? '未來 30 天內無即將到期文件' : 'No documents expiring within 30 days'}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {expiringDocs.map(doc => {
                const days = daysUntil(doc.expiry_date!);
                return (
                  <div key={doc.id} className="card" style={{ padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: `4px solid ${days <= 7 ? '#dc2626' : '#f97316'}` }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>{doc.file_name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        👤 {empName(doc.employee_id)} · <DocTypeBadge type={doc.doc_type} zh={zh} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: days <= 7 ? '#dc2626' : '#f97316' }}>
                        {days === 0 ? (zh ? '今日到期' : 'Expires today') : `${days}d`}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{doc.expiry_date}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
