'use client';

import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Medicine } from '@/lib/medicines';
import { toast } from '@/components/ui/Toast';
import {
  IconMedicineBottle,
  IconSearch,
  IconPlus,
  IconRefresh,
  IconCross,
  IconEdit,
  IconTrash,
  IconUpload,
  IconDownload,
  IconFilter,
  IconPill,
} from '@/components/admin/AdminIcons';

interface AdminMedicinesTabProps {
  medicines: Medicine[];
  isLoading: boolean;
  onRefresh: () => void | Promise<void>;
  adminFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const COMMON_POTENCY_OPTIONS = ['Q', '3X', '6X', '12X', '6C', '12C', '30C', '200C', '1M', '10M', '50M', 'CM'];
const MEDICINE_FORMS = [
  'Dilution',
  'Globules / Pills',
  'Mother Tincture (Q)',
  'Biochemic / Trituration',
  'Tablets',
  'Drops',
  'Ointment',
  'Syrup',
  'Other',
];

const PRESET_CATEGORIES = [
  'Trauma & Injury',
  'Digestive & Gastric',
  'Acute & Febrile',
  'Respiratory & Sinus',
  'Constitutional',
  'Emotional & Nervous',
  'Skin & Allergies',
  'Musculoskeletal / Joints',
  'Biochemic Tissue Salt',
  'Polycrest',
  'Pediatric',
  'General',
];

interface FormState {
  id?: string;
  name: string;
  potency: string;
  form: string;
  category: string;
  notes: string;
}

const emptyFormState: FormState = {
  name: '',
  potency: '30C, 200C',
  form: 'Dilution',
  category: 'General',
  notes: '',
};

export default function AdminMedicinesTab({
  medicines,
  isLoading,
  onRefresh,
  adminFetch,
}: AdminMedicinesTabProps) {
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [formFilter, setFormFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'category' | 'recent'>('name_asc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Add / Edit Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>(emptyFormState);
  const [isSaving, setIsSaving] = useState(false);

  // Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importRows, setImportRows] = useState<Array<{ name: string; potency?: string; form?: string; category?: string; notes?: string }>>([]);
  const [importFileName, setImportFileName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Delete State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Categories list derived from current items + presets
  const availableCategories = useMemo(() => {
    const set = new Set<string>(PRESET_CATEGORIES);
    medicines.forEach((m) => {
      if (m.category && m.category.trim()) set.add(m.category.trim());
    });
    return Array.from(set).sort();
  }, [medicines]);

  // Filtered & Sorted Medicines
  const filteredMedicines = useMemo(() => {
    let result = [...medicines];
    const q = searchQuery.trim().toLowerCase();

    if (q) {
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q) ||
          m.potency.toLowerCase().includes(q) ||
          m.form.toLowerCase().includes(q) ||
          m.notes.toLowerCase().includes(q)
      );
    }

    if (categoryFilter !== 'all') {
      result = result.filter((m) => m.category.toLowerCase() === categoryFilter.toLowerCase());
    }

    if (formFilter !== 'all') {
      result = result.filter((m) => m.form.toLowerCase().includes(formFilter.toLowerCase()));
    }

    result.sort((a, b) => {
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
      if (sortBy === 'category') return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
      if (sortBy === 'recent') return b.createdAt.localeCompare(a.createdAt);
      return 0;
    });

    return result;
  }, [medicines, searchQuery, categoryFilter, formFilter, sortBy]);

  // Pagination slicing & calculations
  const totalItems = filteredMedicines.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  const paginatedMedicines = useMemo(() => {
    return filteredMedicines.slice(startIndex, endIndex);
  }, [filteredMedicines, startIndex, endIndex]);

  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (safeCurrentPage <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages];
    }
    if (safeCurrentPage >= totalPages - 3) {
      return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', safeCurrentPage - 1, safeCurrentPage, safeCurrentPage + 1, '...', totalPages];
  };

  const hasActiveFilters = searchQuery.trim() !== '' || categoryFilter !== 'all' || formFilter !== 'all' || sortBy !== 'name_asc';

  const handleResetFilters = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setFormFilter('all');
    setSortBy('name_asc');
    setCurrentPage(1);
  };

  // Open Add Modal
  const handleOpenAdd = () => {
    setFormState({
      ...emptyFormState,
      category: availableCategories[0] || 'General',
    });
    setIsFormModalOpen(true);
  };

  // Open Edit Modal (Rename / Modify)
  const handleOpenEdit = (med: Medicine) => {
    setFormState({
      id: med.id,
      name: med.name,
      potency: med.potency,
      form: med.form,
      category: med.category,
      notes: med.notes,
    });
    setIsFormModalOpen(true);
  };

  // Submit Add or Edit
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = formState.name.trim();
    if (!name) {
      toast.error('Please enter a medicine name.');
      return;
    }

    setIsSaving(true);
    try {
      if (formState.id) {
        // Edit / Rename
        const res = await adminFetch('/api/admin/medicines', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: formState.id,
            name: formState.name.trim(),
            potency: formState.potency.trim(),
            form: formState.form.trim(),
            category: formState.category.trim(),
            notes: formState.notes.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update medicine.');
        toast.success(`Medicine "${name}" updated successfully.`);
      } else {
        // Add new
        const res = await adminFetch('/api/admin/medicines', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formState.name.trim(),
            potency: formState.potency.trim(),
            form: formState.form.trim(),
            category: formState.category.trim(),
            notes: formState.notes.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to add medicine.');
        toast.success(`Medicine "${name}" added to database.`);
      }

      setIsFormModalOpen(false);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error saving medicine.');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Medicine
  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}" from the medicine database?`)) {
      return;
    }

    setDeletingId(id);
    try {
      const res = await adminFetch(`/api/admin/medicines?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete medicine.');
      toast.success(`Medicine "${name}" removed from database.`);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error deleting medicine.');
    } finally {
      setDeletingId(null);
    }
  };

  // Toggle quick potency in form
  const togglePotency = (potencyVal: string) => {
    const current = formState.potency
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const index = current.indexOf(potencyVal);
    let next: string[];
    if (index >= 0) {
      next = current.filter((p) => p !== potencyVal);
    } else {
      next = [...current, potencyVal];
    }
    setFormState((prev) => ({ ...prev, potency: next.join(', ') }));
  };

  // Excel / CSV File Parsing via XLSX
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

        if (!json || json.length === 0) {
          toast.error('The selected file contains no data.');
          setImportRows([]);
          return;
        }

        // Normalize keys
        const parsedRows = json
          .map((row) => {
            const keys = Object.keys(row);
            const findVal = (...aliases: string[]) => {
              for (const a of aliases) {
                const matchKey = keys.find((k) => k.trim().toLowerCase() === a.toLowerCase());
                if (matchKey && row[matchKey] !== undefined) {
                  return String(row[matchKey]).trim();
                }
              }
              return '';
            };

            const name = findVal('name', 'medicine name', 'medicine', 'remedy', 'remedy name', 'item');
            const potency = findVal('potency', 'potencies', 'power', 'potency list');
            const form = findVal('form', 'type', 'preparation', 'dosage form');
            const category = findVal('category', 'class', 'group', 'therapeutic class');
            const notes = findVal('notes', 'indications', 'note', 'description', 'usage', 'comments');

            return {
              name,
              potency: potency || '30C, 200C',
              form: form || 'Dilution',
              category: category || 'General',
              notes,
            };
          })
          .filter((item) => item.name.length > 0);

        if (parsedRows.length === 0) {
          toast.error('Could not find a "Name" or "Medicine" column in the uploaded sheet.');
          setImportRows([]);
          return;
        }

        setImportRows(parsedRows);
        toast.info(`Found ${parsedRows.length} remedies ready for import.`);
      } catch (err) {
        console.error('File parsing error:', err);
        toast.error('Failed to parse spreadsheet file. Please check file format.');
      }
    };

    reader.readAsBinaryString(file);
  };

  // Perform Bulk Import
  const handleCommitImport = async () => {
    if (importRows.length === 0) {
      toast.error('No valid medicine rows to import.');
      return;
    }

    setIsImporting(true);
    try {
      const res = await adminFetch('/api/admin/medicines/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: importRows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed.');

      toast.success(
        `Import completed! ${data.added || 0} remedies added, ${data.updated || 0} existing updated.`,
        'Import Successful'
      );
      setIsImportModalOpen(false);
      setImportRows([]);
      setImportFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error importing medicines.');
    } finally {
      setIsImporting(false);
    }
  };

  // Download Excel Template
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Medicine Name': 'Arnica Montana',
        Potency: '30C, 200C, 1M',
        Form: 'Dilution',
        Category: 'Trauma & Injury',
        Notes: 'Soreness, blunt trauma, post-injury bruises',
      },
      {
        'Medicine Name': 'Nux Vomica',
        Potency: '30C, 200C',
        Form: 'Dilution',
        Category: 'Digestive & Gastric',
        Notes: 'Acidity, dyspepsia, ineffectual stool urging',
      },
      {
        'Medicine Name': 'Calcarea Phosphorica',
        Potency: '6X, 12X',
        Form: 'Biochemic / Trituration',
        Category: 'Biochemic Tissue Salt',
        Notes: 'Bone development, growing pains, calcium deficiency',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Medicines');
    XLSX.writeFile(wb, 'Happy_Morning_Medicine_Import_Template.xlsx');
  };

  // Export current medicine database to Excel
  const handleExportExcel = () => {
    if (medicines.length === 0) {
      toast.error('No medicines to export.');
      return;
    }

    const exportData = medicines.map((m, idx) => ({
      'Sr No': idx + 1,
      'Medicine Name': m.name,
      Potency: m.potency,
      Form: m.form,
      Category: m.category,
      Notes: m.notes,
      'Added Date': m.createdAt ? m.createdAt.slice(0, 10) : '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Remedies');
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Happy_Morning_Clinic_Medicines_${today}.xlsx`);
    toast.success(`Exported ${medicines.length} medicines to Excel.`);
  };

  return (
    <div className="tab-pane-fade">
      {/* Top Header Card */}
      <div className="directory-header-row">
        <div>
          <h3 className="section-title">Medicine &amp; Remedy Database</h3>
          <p className="section-subtitle">
            Configure clinic remedies, potencies, and formulations. Configured remedies are automatically suggested when writing prescriptions.
          </p>
        </div>

        <div className="appt-header-actions">
          <button
            type="button"
            className="btn-admin-primary"
            onClick={handleOpenAdd}
            title="Add a new medicine"
          >
            <IconPlus />
            <span>Add Medicine</span>
          </button>

          <button
            type="button"
            className="btn-reload"
            onClick={() => setIsImportModalOpen(true)}
            style={{ background: '#ECFDF5', borderColor: '#A7F3D0', color: '#047857' }}
            title="Import medicines from an Excel or CSV spreadsheet"
          >
            <IconUpload size={14} />
            <span>Import Excel</span>
          </button>

          <button
            type="button"
            className="btn-reload"
            onClick={handleExportExcel}
            title="Export all medicines to an Excel file"
          >
            <IconDownload size={14} />
            <span>Export Excel</span>
          </button>

          <button
            type="button"
            onClick={onRefresh}
            className="btn-reload"
            title="Refresh medicine database"
          >
            <IconRefresh size={14} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 4 Remedy KPI Cards (Matching Payment & Revenue Card Grid) */}
      <div className="admin-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon-box">
            <IconMedicineBottle size={22} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Total Remedies</span>
            <strong className="kpi-value">{medicines.length}</strong>
            <span className="kpi-meta">Remedies in clinic database</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-box" style={{ background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)', color: '#059669' }}>
            <IconPill size={22} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Dilutions</span>
            <strong className="kpi-value">
              {medicines.filter((m) => m.form.toLowerCase().includes('dilution')).length}
            </strong>
            <span className="kpi-meta">Potentized liquid remedies</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-box" style={{ background: 'linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%)', color: '#EA580C' }}>
            <IconMedicineBottle size={22} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Mother Tinctures &amp; Salts</span>
            <strong className="kpi-value">
              {medicines.filter((m) => m.form.toLowerCase().includes('tincture') || m.form.toLowerCase().includes('biochemic')).length}
            </strong>
            <span className="kpi-meta">Q tinctures &amp; biochemic salts</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-box" style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)', color: '#7C3AED' }}>
            <IconFilter size={22} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Therapeutic Categories</span>
            <strong className="kpi-value">{availableCategories.length}</strong>
            <span className="kpi-meta">Clinical therapeutic groups</span>
          </div>
        </div>
      </div>

      {/* Search and Filters Toolbar Card */}
      <div className="directory-toolbar-card">
        <div className="directory-toolbar-grid appt-toolbar-grid">
          {/* Live Search Input */}
          <div className="search-input-wrap">
            <span className="search-icon-box" aria-hidden="true">
              <IconSearch size={16} />
            </span>
            <input
              type="text"
              className="directory-search-input"
              placeholder="Search by remedy name, category, potencies, or clinical notes..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
            {searchQuery && (
              <button
                type="button"
                className="btn-clear-search"
                onClick={() => {
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                title="Clear search query"
              >
                <IconCross />
              </button>
            )}
          </div>

          {/* Form Filter */}
          <div className="filter-select-wrap">
            <span className="filter-icon-box" aria-hidden="true">
              <IconPill size={14} />
            </span>
            <select
              className="directory-filter-select"
              value={formFilter}
              onChange={(e) => {
                setFormFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="all">All Forms</option>
              <option value="dilution">Dilution</option>
              <option value="mother tincture">Mother Tincture (Q)</option>
              <option value="globules">Globules / Pellets</option>
              <option value="biochemic">Biochemic / Trituration</option>
              <option value="tablet">Tablets</option>
              <option value="ointment">Ointment</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="filter-select-wrap">
            <span className="filter-icon-box" aria-hidden="true">
              <IconFilter size={14} />
            </span>
            <select
              className="directory-filter-select"
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="all">All Categories ({availableCategories.length})</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Filter */}
          <div className="filter-select-wrap">
            <select
              className="directory-filter-select sort-select"
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as typeof sortBy);
                setCurrentPage(1);
              }}
            >
              <option value="name_asc">Sort: Name (A to Z)</option>
              <option value="name_desc">Sort: Name (Z to A)</option>
              <option value="category">Sort: Category</option>
              <option value="recent">Sort: Recently Added</option>
            </select>
          </div>
        </div>

        {/* Results row */}
        <div className="directory-results-row">
          <span>
            Showing{' '}
            <strong>
              {totalItems > 0 ? `${startIndex + 1}–${endIndex}` : 0}
            </strong>{' '}
            of <strong>{totalItems}</strong> remedy item
            {totalItems === 1 ? '' : 's'}
            {medicines.length > totalItems && (
              <span className="results-total-sub">
                {' '}
                ({medicines.length} total in clinic database)
              </span>
            )}
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              className="btn-reset-filters"
              onClick={handleResetFilters}
            >
              <IconCross />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Medicines Table Card */}
      <div className="admin-table-card">
        {isLoading && medicines.length === 0 ? (
          <div className="admin-loading-state">
            <div className="admin-empty-icon">
              <IconRefresh size={24} />
            </div>
            <h4>Loading Medicine Database...</h4>
            <p>Fetching remedy inventory and potencies.</p>
          </div>
        ) : filteredMedicines.length === 0 ? (
          <div className="admin-empty-state">
            <div className="admin-empty-icon">
              <IconMedicineBottle size={28} />
            </div>
            <h4>No Medicines Found</h4>
            <p>
              {hasActiveFilters
                ? 'No remedies match your chosen filters. Try resetting your search filters.'
                : 'No medicines have been added yet. Click "+ Add Medicine" or "Import Excel" to get started.'}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                className="btn-reset-filters"
                onClick={handleResetFilters}
              >
                Reset Filters
              </button>
            ) : (
              <button
                type="button"
                className="btn-admin-primary"
                onClick={handleOpenAdd}
              >
                <IconPlus />
                <span>Add First Medicine</span>
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>#</th>
                    <th>Remedy Name</th>
                    <th>Form</th>
                    <th>Common Potencies</th>
                    <th>Category</th>
                    <th>Clinical Notes / Indications</th>
                    <th className="th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedMedicines.map((med, index) => (
                    <tr key={med.id}>
                      <td>
                        <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600 }}>
                          {startIndex + index + 1}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              background: '#EEF0FF',
                              color: 'var(--primary)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <IconPill size={15} />
                          </span>
                          <div>
                            <strong
                              style={{
                                fontSize: '14.5px',
                                color: 'var(--primary-dark)',
                                display: 'block',
                              }}
                            >
                              {med.name}
                            </strong>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`mode-pill ${
                            med.form.toLowerCase().includes('tincture')
                              ? 'mode-offline'
                              : 'mode-online'
                          }`}
                          style={{ fontSize: '11.5px', padding: '3px 9px' }}
                        >
                          {med.form}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {med.potency ? (
                            med.potency.split(',').map((p, pIdx) => (
                              <span
                                key={pIdx}
                                style={{
                                  display: 'inline-block',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  background: '#F1F5F9',
                                  color: '#334155',
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  border: '1px solid #E2E8F0',
                                }}
                              >
                                {p.trim()}
                              </span>
                            ))
                          ) : (
                            <span style={{ fontSize: '12px', color: '#94A3B8' }}>—</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span
                          className="reason-pill"
                          style={{ fontSize: '11.5px', padding: '3px 8px' }}
                        >
                          {med.category || 'General'}
                        </span>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: '12.5px',
                            color: '#64748B',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            lineHeight: '1.4',
                            maxWidth: '320px',
                          }}
                          title={med.notes}
                        >
                          {med.notes || '—'}
                        </span>
                      </td>
                      <td>
                        <div className="cell-actions-wrap">
                          <button
                            type="button"
                            className="action-pill action-pill-notes"
                            title="Edit or rename medicine"
                            onClick={() => handleOpenEdit(med)}
                          >
                            <IconEdit size={13} />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            className="action-pill action-pill-del"
                            title="Delete medicine from database"
                            disabled={deletingId === med.id}
                            onClick={() => handleDelete(med.id, med.name)}
                          >
                            <IconTrash size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls Bar */}
            {totalItems > 0 && (
              <div className="admin-pagination-bar">
                <div className="pagination-info-wrap">
                  <span>
                    Showing <strong>{startIndex + 1}</strong> &ndash; <strong>{endIndex}</strong> of{' '}
                    <strong>{totalItems}</strong> remedies
                  </span>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#64748B' }}>Rows per page:</span>
                    <select
                      className="pagination-size-select"
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={15}>15</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>

                <div className="pagination-nav">
                  <button
                    type="button"
                    className="pagination-btn"
                    disabled={safeCurrentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    title="Previous page"
                  >
                    &lsaquo; Prev
                  </button>

                  {getPageNumbers().map((p, idx) =>
                    p === '...' ? (
                      <span key={`ellipsis-${idx}`} className="pagination-ellipsis">
                        &hellip;
                      </span>
                    ) : (
                      <button
                        type="button"
                        key={`page-${p}`}
                        className={`pagination-btn ${safeCurrentPage === p ? 'active' : ''}`}
                        onClick={() => setCurrentPage(Number(p))}
                      >
                        {p}
                      </button>
                    )
                  )}

                  <button
                    type="button"
                    className="pagination-btn"
                    disabled={safeCurrentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    title="Next page"
                  >
                    Next &rsaquo;
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* =========================================================================
          ADD / EDIT / RENAME MEDICINE DRAWER MODAL
          ========================================================================= */}
      {isFormModalOpen && (
        <div
          className="admin-drawer-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsFormModalOpen(false)}
        >
          <aside
            className="admin-drawer-panel"
            style={{ width: 'min(580px, 100vw)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="drawer-header">
              <div className="drawer-title-wrap">
                <span
                  className="drawer-icon-badge"
                  style={{ background: '#EEF0FF', color: 'var(--primary)' }}
                >
                  <IconMedicineBottle size={22} />
                </span>
                <div>
                  <h3>{formState.id ? 'Edit / Rename Medicine' : 'Add New Medicine'}</h3>
                  <p className="drawer-subtitle">
                    {formState.id
                      ? `Update configuration or rename ${formState.name}.`
                      : 'Add a remedy to the database for instant prescription suggestions.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-drawer-close"
                onClick={() => setIsFormModalOpen(false)}
                aria-label="Close"
              >
                <IconCross />
              </button>
            </header>

            <form
              onSubmit={handleSaveForm}
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                padding: '22px',
                gap: '16px',
              }}
            >
              <label className="rx-field">
                <span>Medicine / Remedy Name *</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Arnica Montana, Nux Vomica, Thuja"
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                  autoFocus
                />
              </label>

              <div className="rx-row-2">
                <label className="rx-field">
                  <span>Form / Preparation</span>
                  <select
                    value={formState.form}
                    onChange={(e) => setFormState({ ...formState, form: e.target.value })}
                  >
                    {MEDICINE_FORMS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="rx-field">
                  <span>Category</span>
                  <input
                    type="text"
                    list="medicine-categories-datalist"
                    placeholder="e.g. Trauma, Gastric, Polycrest"
                    value={formState.category}
                    onChange={(e) => setFormState({ ...formState, category: e.target.value })}
                  />
                  <datalist id="medicine-categories-datalist">
                    {availableCategories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </label>
              </div>

              <div className="rx-field">
                <span>Common Potencies (Quick Toggle)</span>
                <div className="rx-chips" style={{ marginBottom: '8px' }}>
                  {COMMON_POTENCY_OPTIONS.map((p) => {
                    const isSelected = formState.potency
                      .split(',')
                      .map((x) => x.trim().toLowerCase())
                      .includes(p.toLowerCase());
                    return (
                      <button
                        type="button"
                        key={p}
                        className={`rx-chip ${isSelected ? 'on' : ''}`}
                        onClick={() => togglePotency(p)}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  placeholder="Custom potencies (comma separated, e.g. 30C, 200C, 1M, Q)"
                  value={formState.potency}
                  onChange={(e) => setFormState({ ...formState, potency: e.target.value })}
                />
              </div>

              <label className="rx-field">
                <span>Clinical Notes / Key Indications (Optional)</span>
                <textarea
                  rows={4}
                  placeholder="e.g. Great soreness, blunt trauma, bruising. Aggravated by motion, relieved by rest."
                  value={formState.notes}
                  onChange={(e) => setFormState({ ...formState, notes: e.target.value })}
                />
              </label>

              <div
                style={{
                  marginTop: 'auto',
                  paddingTop: '20px',
                  borderTop: '1px solid var(--line)',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                }}
              >
                <button
                  type="button"
                  className="rx-btn rx-btn-ghost"
                  onClick={() => setIsFormModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rx-btn rx-btn-primary"
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : formState.id ? 'Save Changes' : 'Add Medicine'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}

      {/* =========================================================================
          IMPORT EXCEL / CSV MODAL
          ========================================================================= */}
      {isImportModalOpen && (
        <div
          className="admin-drawer-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsImportModalOpen(false)}
        >
          <aside
            className="admin-drawer-panel"
            style={{ width: 'min(720px, 100vw)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="drawer-header">
              <div className="drawer-title-wrap">
                <span
                  className="drawer-icon-badge"
                  style={{ background: '#ECFDF5', color: '#047857' }}
                >
                  <IconUpload size={22} />
                </span>
                <div>
                  <h3>Import Medicines from Excel / CSV</h3>
                  <p className="drawer-subtitle">
                    Upload an .xlsx, .xls, or .csv spreadsheet of medicines.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-drawer-close"
                onClick={() => setIsImportModalOpen(false)}
                aria-label="Close"
              >
                <IconCross />
              </button>
            </header>

            <div
              style={{
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                gap: '18px',
              }}
            >
              {/* Instructions banner */}
              <div
                style={{
                  padding: '14px 18px',
                  background: '#F8FAFC',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  fontSize: '13px',
                  color: '#475569',
                  lineHeight: '1.5',
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--primary-dark)', marginBottom: '4px' }}>
                  Supported Excel Columns:
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '6px 0' }}>
                  <code style={{ background: '#EEF2FF', padding: '2px 6px', borderRadius: '4px', color: '#4338CA' }}>Medicine Name *</code>
                  <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>Potency</code>
                  <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>Form</code>
                  <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>Category</code>
                  <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>Notes / Indications</code>
                </div>
                <div>
                  Existing medicines with the same name will be updated. New remedies will be added.
                </div>
                <div style={{ marginTop: '10px' }}>
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary)',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline',
                      fontSize: '13px',
                    }}
                  >
                    Download Sample Excel Template (.xlsx)
                  </button>
                </div>
              </div>

              {/* Upload Box */}
              <div
                style={{
                  border: '2px dashed #CBD5E1',
                  borderRadius: '14px',
                  padding: '30px 20px',
                  textAlign: 'center',
                  background: '#F8FAFC',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    background: '#EEF0FF',
                    color: 'var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px auto',
                  }}
                >
                  <IconUpload size={24} />
                </div>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '15px', color: 'var(--ink)' }}>
                  {importFileName ? importFileName : 'Click to Browse or Drop Excel / CSV File'}
                </h4>
                <p style={{ margin: 0, fontSize: '12.5px', color: '#64748B' }}>
                  Supports Microsoft Excel (.xlsx, .xls) and CSV files
                </p>
              </div>

              {/* Parsed Preview Table */}
              {importRows.length > 0 && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '8px',
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary-dark)' }}>
                      Preview: {importRows.length} Remedies Detected
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setImportRows([]);
                        setImportFileName('');
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--error)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Clear File
                    </button>
                  </div>

                  <div
                    style={{
                      maxHeight: '260px',
                      overflowY: 'auto',
                      border: '1px solid #E2E8F0',
                      borderRadius: '10px',
                    }}
                  >
                    <table className="admin-table" style={{ fontSize: '12.5px' }}>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Form</th>
                          <th>Potency</th>
                          <th>Category</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.slice(0, 15).map((row, idx) => (
                          <tr key={idx}>
                            <td>
                              <strong>{row.name}</strong>
                            </td>
                            <td>{row.form || 'Dilution'}</td>
                            <td>{row.potency || '—'}</td>
                            <td>{row.category || 'General'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importRows.length > 15 && (
                    <p style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
                      Showing first 15 of {importRows.length} items. All {importRows.length} will be imported.
                    </p>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div
                style={{
                  marginTop: 'auto',
                  paddingTop: '20px',
                  borderTop: '1px solid var(--line)',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                }}
              >
                <button
                  type="button"
                  className="rx-btn rx-btn-ghost"
                  onClick={() => setIsImportModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rx-btn rx-btn-primary"
                  disabled={importRows.length === 0 || isImporting}
                  onClick={handleCommitImport}
                >
                  {isImporting ? 'Importing...' : `Import ${importRows.length} Remedies`}
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}