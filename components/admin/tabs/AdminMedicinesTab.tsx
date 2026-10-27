'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import type { Medicine } from '@/lib/medicines';
import { MedicineCategory, DEFAULT_MEDICINE_CATEGORIES } from '@/lib/medicineConstants';
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
  IconTag,
  IconFileSpreadsheet,
} from '@/components/admin/AdminIcons';

interface AdminMedicinesTabProps {
  userRole?: string;
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

interface FormState {
  id?: string;
  name: string;
  potency: string;
  form: string;
  category: string;
  customCategory?: string;
  notes: string;
}

const emptyFormState: FormState = {
  name: '',
  potency: '30C, 200C',
  form: 'Dilution',
  category: 'General',
  customCategory: '',
  notes: '',
};

interface CategoryFormState {
  id?: string;
  name: string;
  description: string;
}

export default function AdminMedicinesTab({
  userRole = 'doctor',
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

  // Categories Database State
  const [categories, setCategories] = useState<MedicineCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  // Category Manager Drawer Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>({ name: '', description: '' });
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');

  // Sample Templates Dropdown Menu State
  const [isSampleDropdownOpen, setIsSampleDropdownOpen] = useState(false);
  const sampleDropdownRef = useRef<HTMLDivElement | null>(null);

  // Add / Edit Medicine Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>(emptyFormState);
  const [isCustomCategoryMode, setIsCustomCategoryMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Import Modal State (Tabbed: Medicines vs Categories)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importTab, setImportTab] = useState<'medicines' | 'categories'>('medicines');

  // Medicines Import State
  const [importRows, setImportRows] = useState<Array<{ name: string; potency?: string; form?: string; category?: string; notes?: string }>>([]);
  const [importFileName, setImportFileName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Categories Import State
  const [importCategoryRows, setImportCategoryRows] = useState<Array<{ name: string; description?: string }>>([]);
  const [importCategoryFileName, setImportCategoryFileName] = useState('');
  const [isImportingCategories, setIsImportingCategories] = useState(false);
  const categoryFileInputRef = useRef<HTMLInputElement | null>(null);

  // Delete Medicine State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Close sample dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (sampleDropdownRef.current && !sampleDropdownRef.current.contains(event.target as Node)) {
        setIsSampleDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch Categories from Database
  const loadCategories = useCallback(async () => {
    setIsLoadingCategories(true);
    try {
      const res = await adminFetch(`/api/admin/medicines/categories?_t=${Date.now()}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (Array.isArray(data.categories)) {
        setCategories(data.categories);
      }
    } catch (err) {
      console.error('Failed to load medicine categories:', err);
    } finally {
      setIsLoadingCategories(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Derived available categories combining database categories + medicines
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    categories.forEach((c) => {
      if (c.name && c.name.trim()) set.add(c.name.trim());
    });
    medicines.forEach((m) => {
      if (m.category && m.category.trim()) set.add(m.category.trim());
    });
    // Fallback if empty
    if (set.size === 0) {
      DEFAULT_MEDICINE_CATEGORIES.forEach((c) => set.add(c.name));
    }
    return Array.from(set).sort();
  }, [categories, medicines]);

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

  // Filtered Categories inside Category Manager Drawer
  const filteredCategories = useMemo(() => {
    const q = categorySearchQuery.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    );
  }, [categories, categorySearchQuery]);

  // Pagination calculations
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

  // Open Add Medicine Modal
  const handleOpenAdd = () => {
    setIsCustomCategoryMode(false);
    setFormState({
      ...emptyFormState,
      category: availableCategories[0] || 'Piles & Haemorrhoids',
      customCategory: '',
    });
    setIsFormModalOpen(true);
  };

  // Open Edit Medicine Modal
  const handleOpenEdit = (med: Medicine) => {
    setIsCustomCategoryMode(false);
    setFormState({
      id: med.id,
      name: med.name,
      potency: med.potency,
      form: med.form,
      category: med.category,
      customCategory: '',
      notes: med.notes,
    });
    setIsFormModalOpen(true);
  };

  // Submit Add or Edit Medicine
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = formState.name.trim();
    if (!name) {
      toast.error('Please enter a medicine name.');
      return;
    }

    const finalCategory = isCustomCategoryMode && formState.customCategory?.trim()
      ? formState.customCategory.trim()
      : formState.category.trim();

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
            category: finalCategory,
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
            category: finalCategory,
            notes: formState.notes.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to add medicine.');
        toast.success(`Medicine "${name}" added to database.`);
      }

      setIsFormModalOpen(false);
      onRefresh();
      loadCategories();
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
      loadCategories();
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

  // =========================================================================
  // CATEGORY MANAGEMENT HANDLERS (Manual Add, Edit, Delete)
  // =========================================================================

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = categoryForm.name.trim();
    if (!name) {
      toast.error('Please enter a category name.');
      return;
    }

    setIsSavingCategory(true);
    try {
      if (categoryForm.id) {
        // Edit / Rename Category
        const res = await adminFetch('/api/admin/medicines/categories', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: categoryForm.id,
            name,
            description: categoryForm.description.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update category.');
        toast.success(`Category "${name}" updated successfully.`);
      } else {
        // Add new Category manually
        const res = await adminFetch('/api/admin/medicines/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            description: categoryForm.description.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create category.');
        toast.success(`Category "${name}" added successfully.`);
      }

      setCategoryForm({ name: '', description: '' });
      await loadCategories();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error saving category.');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleEditCategoryClick = (cat: MedicineCategory) => {
    setCategoryForm({
      id: cat.id,
      name: cat.name,
      description: cat.description || '',
    });
  };

  const handleCancelCategoryEdit = () => {
    setCategoryForm({ name: '', description: '' });
  };

  const handleDeleteCategory = async (cat: MedicineCategory) => {
    const remedyNote =
      cat.medicineCount > 0
        ? ` Note: ${cat.medicineCount} remedies currently under this category will be reassigned to "General".`
        : '';
    if (!window.confirm(`Are you sure you want to delete category "${cat.name}"?${remedyNote}`)) {
      return;
    }

    setDeletingCategoryId(cat.id);
    try {
      const res = await adminFetch(`/api/admin/medicines/categories?id=${encodeURIComponent(cat.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete category.');
      toast.success(`Category "${cat.name}" deleted.`);
      if (categoryForm.id === cat.id) {
        setCategoryForm({ name: '', description: '' });
      }
      await loadCategories();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error deleting category.');
    } finally {
      setDeletingCategoryId(null);
    }
  };

  // =========================================================================
  // EXCEL / CSV PARSING & IMPORT HANDLERS
  // =========================================================================

  // Parse Medicines File
  const handleMedicineFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
            const category = findVal('category', 'class', 'group', 'therapeutic class', 'clinical category');
            const notes = findVal('notes', 'indications', 'note', 'description', 'usage', 'comments', 'notes / indications');

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
          toast.error('Could not find a "Medicine Name" or "Name" column in the sheet.');
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

  // Parse Categories File
  const handleCategoryFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportCategoryFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

        if (!json || json.length === 0) {
          toast.error('The selected file contains no category data.');
          setImportCategoryRows([]);
          return;
        }

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

            const name = findVal('category name', 'category', 'name', 'group name', 'therapeutic class', 'group');
            const description = findVal('description', 'notes', 'indications', 'key focus', 'description / key focus', 'details');

            return {
              name,
              description,
            };
          })
          .filter((item) => item.name.length > 0);

        if (parsedRows.length === 0) {
          toast.error('Could not find a "Category Name" or "Category" column in the sheet.');
          setImportCategoryRows([]);
          return;
        }

        setImportCategoryRows(parsedRows);
        toast.info(`Found ${parsedRows.length} categories ready for import.`);
      } catch (err) {
        console.error('Category file parsing error:', err);
        toast.error('Failed to parse spreadsheet file. Please check file format.');
      }
    };

    reader.readAsBinaryString(file);
  };

  // Commit Medicines Import
  const handleCommitMedicineImport = async () => {
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
        'Medicines Imported'
      );
      setIsImportModalOpen(false);
      setImportRows([]);
      setImportFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      onRefresh();
      loadCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error importing medicines.');
    } finally {
      setIsImporting(false);
    }
  };

  // Commit Categories Import
  const handleCommitCategoryImport = async () => {
    if (importCategoryRows.length === 0) {
      toast.error('No valid category rows to import.');
      return;
    }

    setIsImportingCategories(true);
    try {
      const res = await adminFetch('/api/admin/medicines/categories/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: importCategoryRows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed.');

      toast.success(
        `Import completed! ${data.added || 0} categories added, ${data.updated || 0} updated.`,
        'Categories Imported'
      );
      setIsImportModalOpen(false);
      setImportCategoryRows([]);
      setImportCategoryFileName('');
      if (categoryFileInputRef.current) categoryFileInputRef.current.value = '';
      loadCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error importing categories.');
    } finally {
      setIsImportingCategories(false);
    }
  };

  // =========================================================================
  // SAMPLE EXCEL EXPORT TEMPLATES (WITH CLEAR DOCTOR INSTRUCTIONS & SAMPLES)
  // =========================================================================

  // 1. Medicines Sample Template Download
  const handleDownloadMedicineTemplate = () => {
    const templateData = [
      {
        'Medicine Name': 'Arnica Montana',
        Potency: '30C, 200C, 1M',
        Form: 'Dilution',
        Category: 'Trauma & Injury',
        'Notes / Indications': 'Soreness, blunt trauma, post-injury bruises, bleeding, muscular fatigue',
      },
      {
        'Medicine Name': 'Hamamelis Virginiana',
        Potency: 'Q, 30C, 200C',
        Form: 'Mother Tincture (Q)',
        Category: 'Piles & Haemorrhoids',
        'Notes / Indications': 'Bleeding piles, venous congestion, passive haemorrhage, rectal soreness',
      },
      {
        'Medicine Name': 'Aesculus Hippocastanum',
        Potency: '30C, 200C',
        Form: 'Dilution',
        Category: 'Piles & Haemorrhoids',
        'Notes / Indications': 'Painful blind piles, dry sensation as if rectum full of sticks, severe backache',
      },
      {
        'Medicine Name': 'Ratanhia Peruviana',
        Potency: '30C, 200C',
        Form: 'Dilution',
        Category: 'Fissure & Fistula',
        'Notes / Indications': 'Anal fissures, burning rectal pain for hours after hard stool, knife-like pain',
      },
      {
        'Medicine Name': 'Silicea (Silica)',
        Potency: '6X, 12X, 30C',
        Form: 'Biochemic / Trituration',
        Category: 'Fissure & Fistula',
        'Notes / Indications': 'Fistula in ano, promotes resolution of abscesses, hard straining stools',
      },
      {
        'Medicine Name': 'Nux Vomica',
        Potency: '30C, 200C',
        Form: 'Dilution',
        Category: 'Digestive & Gastric',
        'Notes / Indications': 'Ineffectual urging to stool, acidity, dyspepsia, sedentary lifestyle',
      },
      {
        'Medicine Name': 'Cascara Sagrada',
        Potency: 'Q',
        Form: 'Mother Tincture (Q)',
        Category: 'Constipation & Bowel Health',
        'Notes / Indications': 'Sluggish bowels, chronic constipation, intestinal atony, gentle laxative tonic',
      },
      {
        'Medicine Name': 'Calcarea Fluorica',
        Potency: '6X, 12X',
        Form: 'Biochemic / Trituration',
        Category: 'Biochemic Tissue Salt',
        'Notes / Indications': 'Varicose veins, fissures, indurated hard tissues, loss of venous elasticity',
      },
    ];

    const instructions = [
      {
        'Column Header': 'Medicine Name',
        'Is Required?': 'YES (Required)',
        'What to Put & Example': 'Homoeopathic remedy name (e.g. Arnica Montana, Hamamelis, Nux Vomica). If a remedy already exists, its info will be updated.',
      },
      {
        'Column Header': 'Potency',
        'Is Required?': 'Optional',
        'What to Put & Example': 'Available potencies separated by commas (e.g. 30C, 200C, 1M, Q, 6X, 12X). These appear as 1-click buttons when writing prescriptions.',
      },
      {
        'Column Header': 'Form',
        'Is Required?': 'Optional (default: Dilution)',
        'What to Put & Example': 'Preparation type. Choose from: Dilution, Globules / Pills, Mother Tincture (Q), Biochemic / Trituration, Tablets, Drops, Ointment, Syrup.',
      },
      {
        'Column Header': 'Category',
        'Is Required?': 'Optional (default: General)',
        'What to Put & Example': 'Therapeutic group (e.g. Piles & Haemorrhoids, Fissure & Fistula, Digestive & Gastric). New categories are automatically registered.',
      },
      {
        'Column Header': 'Notes / Indications',
        'Is Required?': 'Optional',
        'What to Put & Example': 'Key clinical symptoms, modalities, and guidance notes to help during consultation.',
      },
    ];

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(templateData);
    const ws2 = XLSX.utils.json_to_sheet(instructions);

    ws1['!cols'] = [{ wch: 26 }, { wch: 18 }, { wch: 25 }, { wch: 28 }, { wch: 65 }];
    ws2['!cols'] = [{ wch: 24 }, { wch: 22 }, { wch: 80 }];

    XLSX.utils.book_append_sheet(wb, ws1, 'Medicines');
    XLSX.utils.book_append_sheet(wb, ws2, 'Doctor_Guide_Instructions');
    XLSX.writeFile(wb, 'Happy_Morning_Clinic_Medicines_Sample_Template.xlsx');
    toast.success('Sample Medicines Template (.xlsx) downloaded successfully.');
    setIsSampleDropdownOpen(false);
  };

  // 2. Categories Sample Template Download
  const handleDownloadCategoryTemplate = () => {
    const templateData = [
      {
        'Category Name': 'Piles & Haemorrhoids',
        'Description / Key Focus': 'Internal & external piles, bleeding piles, venous congestion, and rectal fullness',
      },
      {
        'Category Name': 'Fissure & Fistula',
        'Description / Key Focus': 'Anal fissures, burning rectal pain, anal fistulae, perianal abscesses & suppuration',
      },
      {
        'Category Name': 'Constipation & Bowel Health',
        'Description / Key Focus': 'Chronic constipation, sluggish bowels, hard dry stools, and ineffectual stool urging',
      },
      {
        'Category Name': 'Digestive & Gastric',
        'Description / Key Focus': 'Hyperacidity, dyspepsia, heartburn, flatulence, bloating, and liver remedies',
      },
      {
        'Category Name': 'Trauma & Injury',
        'Description / Key Focus': 'Soreness, blunt physical trauma, bruises, lacerations, and post-procedure healing',
      },
      {
        'Category Name': 'Biochemic Tissue Salt',
        'Description / Key Focus': 'Schuessler 12 essential mineral cell salts for cellular deficiency and repair',
      },
      {
        'Category Name': 'Acute & Febrile',
        'Description / Key Focus': 'Sudden onset fever, chills, inflammatory reactions, and acute restlessness',
      },
      {
        'Category Name': 'Emotional & Nervous',
        'Description / Key Focus': 'Anxiety, stress, sleeplessness, restlessness, and psychosomatic tension',
      },
    ];

    const instructions = [
      {
        'Column Header': 'Category Name',
        'Is Required?': 'YES (Required)',
        'What to Put & Example': 'The clinical therapeutic group name (e.g. Piles & Haemorrhoids, Fissure & Fistula). Must be unique.',
      },
      {
        'Column Header': 'Description / Key Focus',
        'Is Required?': 'Optional',
        'What to Put & Example': 'Brief explanation of which conditions or remedy types belong in this category for clinic reference.',
      },
    ];

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(templateData);
    const ws2 = XLSX.utils.json_to_sheet(instructions);

    ws1['!cols'] = [{ wch: 30 }, { wch: 75 }];
    ws2['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 80 }];

    XLSX.utils.book_append_sheet(wb, ws1, 'Categories');
    XLSX.utils.book_append_sheet(wb, ws2, 'Instructions');
    XLSX.writeFile(wb, 'Happy_Morning_Clinic_Categories_Sample_Template.xlsx');
    toast.success('Sample Categories Template (.xlsx) downloaded successfully.');
    setIsSampleDropdownOpen(false);
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
            Configure clinic remedies, potencies, formulations, and therapeutic categories. Configured remedies are automatically suggested when writing prescriptions.
          </p>
        </div>

        <div className="appt-header-actions" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <button
            type="button"
            className="btn-admin-primary"
            onClick={handleOpenAdd}
            title="Add a new medicine manually"
          >
            <IconPlus />
            <span>Add Medicine</span>
          </button>

          <button
            type="button"
            className="btn-reload"
            onClick={() => setIsCategoryModalOpen(true)}
            style={{ background: '#F5F3FF', borderColor: '#DDD6FE', color: '#6D28D9' }}
            title="Manage Categories: Add manually, edit, delete, or import from Excel"
          >
            <IconTag size={14} />
            <span>Categories ({categories.length || availableCategories.length})</span>
          </button>

          <button
            type="button"
            className="btn-reload"
            onClick={() => {
              setImportTab('medicines');
              setIsImportModalOpen(true);
            }}
            style={{ background: '#ECFDF5', borderColor: '#A7F3D0', color: '#047857' }}
            title="Import medicines or categories from an Excel or CSV spreadsheet"
          >
            <IconUpload size={14} />
            <span>Import Excel</span>
          </button>

          {/* Sample Templates Dropdown */}
          <div ref={sampleDropdownRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn-reload"
              onClick={() => setIsSampleDropdownOpen(!isSampleDropdownOpen)}
              style={{ background: '#EFF6FF', borderColor: '#BFDBFE', color: '#1D4ED8' }}
              title="Download sample Excel templates for Doctor with guidance on what to put"
            >
              <IconFileSpreadsheet size={14} />
              <span>Sample Templates ▾</span>
            </button>

            {isSampleDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  zIndex: 40,
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                  minWidth: '240px',
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{ padding: '6px 10px', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Doctor Sample Templates (.xlsx)
                </div>
                <button
                  type="button"
                  onClick={handleDownloadMedicineTemplate}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'transparent',
                    color: '#1E293B',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F5F9')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <IconMedicineBottle size={15} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Medicines Template</div>
                    <div style={{ fontSize: '11.5px', color: '#64748B' }}>Remedy columns, potencies &amp; instructions</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadCategoryTemplate}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'transparent',
                    color: '#1E293B',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F5F9')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <IconTag size={15} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Categories Template</div>
                    <div style={{ fontSize: '11.5px', color: '#64748B' }}>Therapeutic groups &amp; focus descriptions</div>
                  </div>
                </button>
              </div>
            )}
          </div>

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
            onClick={() => {
              onRefresh();
              loadCategories();
            }}
            className="btn-reload"
            title="Refresh medicine database"
          >
            <IconRefresh size={14} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 4 Remedy KPI Cards */}
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
            <IconTag size={22} />
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
        <div className="directory-toolbar-grid appt-toolbar-grid" style={{ alignItems: 'center' }}>
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

          {/* Category Filter + Manage Categories Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="filter-select-wrap" style={{ flex: 1, minWidth: '170px' }}>
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

            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(true)}
              title="Manage Categories (Add manually, Edit, Delete, Import Excel)"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                height: '42px',
                padding: '0 12px',
                borderRadius: '10px',
                background: '#F5F3FF',
                border: '1px solid #DDD6FE',
                color: '#6D28D9',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <IconTag size={13} />
              <span>Manage</span>
            </button>
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
                        <strong style={{ color: 'var(--ink)', fontSize: '14px' }}>
                          {med.name}
                        </strong>
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 9px',
                            borderRadius: '12px',
                            background: '#F1F5F9',
                            color: '#334155',
                            fontSize: '12px',
                            fontWeight: 500,
                          }}
                        >
                          {med.form}
                        </span>
                      </td>
                      <td>
                        {med.potency ? (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {med.potency.split(',').map((p, i) => (
                              <span
                                key={i}
                                style={{
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  background: '#EEF2FF',
                                  color: 'var(--primary)',
                                  fontSize: '11.5px',
                                  fontWeight: 600,
                                }}
                              >
                                {p.trim()}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: '#94A3B8', fontSize: '12px' }}>—</span>
                        )}
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 9px',
                            borderRadius: '12px',
                            background: '#F5F3FF',
                            color: '#7C3AED',
                            fontSize: '12px',
                            fontWeight: 600,
                          }}
                        >
                          <IconTag size={11} />
                          {med.category || 'General'}
                        </span>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: '12.5px',
                            color: '#475569',
                            maxWidth: '320px',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                          title={med.notes}
                        >
                          {med.notes || '—'}
                        </span>
                      </td>
                      <td className="td-actions">
                        <div className="action-pill-group">
                          <button
                            type="button"
                            className="action-pill action-pill-edit"
                            title="Edit remedy or potencies"
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
          CATEGORY MANAGEMENT DRAWER MODAL
          ========================================================================= */}
      {isCategoryModalOpen && (
        <div
          className="admin-drawer-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsCategoryModalOpen(false)}
        >
          <aside
            className="admin-drawer-panel"
            style={{ width: 'min(640px, 100vw)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="drawer-header">
              <div className="drawer-title-wrap">
                <span
                  className="drawer-icon-badge"
                  style={{ background: '#F5F3FF', color: '#7C3AED' }}
                >
                  <IconTag size={22} />
                </span>
                <div>
                  <h3>Medicine Categories Manager</h3>
                  <p className="drawer-subtitle">
                    Add categories manually, import from Excel, or organize clinical groups.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-drawer-close"
                onClick={() => setIsCategoryModalOpen(false)}
                aria-label="Close"
              >
                <IconCross />
              </button>
            </header>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                padding: '20px',
                gap: '18px',
              }}
            >
              {/* Quick Action Buttons Bar */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '8px',
                  padding: '12px 16px',
                  background: '#F8FAFC',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                }}
              >
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setImportTab('categories');
                      setIsCategoryModalOpen(false);
                      setIsImportModalOpen(true);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      background: '#ECFDF5',
                      border: '1px solid #A7F3D0',
                      color: '#047857',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <IconUpload size={13} />
                    <span>Import Categories Excel</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadCategoryTemplate}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      background: '#EFF6FF',
                      border: '1px solid #BFDBFE',
                      color: '#1D4ED8',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <IconDownload size={13} />
                    <span>Download Sample Template</span>
                  </button>
                </div>

                <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
                  {categories.length} Categories Saved
                </span>
              </div>

              {/* Add / Edit Category Form Card */}
              <div
                style={{
                  background: '#FFFFFF',
                  border: categoryForm.id ? '2px solid #7C3AED' : '1px solid #E2E8F0',
                  borderRadius: '12px',
                  padding: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                  }}
                >
                  <strong style={{ fontSize: '13.5px', color: 'var(--ink)' }}>
                    {categoryForm.id ? '✏️ Edit / Rename Category' : '➕ Add Category Manually'}
                  </strong>
                  {categoryForm.id && (
                    <button
                      type="button"
                      onClick={handleCancelCategoryEdit}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#64748B',
                        fontSize: '12px',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                <form onSubmit={handleSaveCategory} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label className="rx-field" style={{ margin: 0 }}>
                    <span style={{ fontSize: '12.5px' }}>Category Name *</span>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Piles &amp; Haemorrhoids, Fissure &amp; Fistula, Constipation"
                      value={categoryForm.name}
                      onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                    />
                  </label>

                  <label className="rx-field" style={{ margin: 0 }}>
                    <span style={{ fontSize: '12.5px' }}>Description / Clinical Focus (Optional)</span>
                    <input
                      type="text"
                      placeholder="e.g. Bleeding, painful piles, venous congestion, anal prolapse"
                      value={categoryForm.description}
                      onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                    />
                  </label>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                    {categoryForm.id && (
                      <button
                        type="button"
                        className="rx-btn rx-btn-ghost"
                        onClick={handleCancelCategoryEdit}
                        style={{ height: '36px', padding: '0 14px', fontSize: '12.5px' }}
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="submit"
                      className="rx-btn rx-btn-primary"
                      disabled={isSavingCategory}
                      style={{
                        height: '36px',
                        padding: '0 16px',
                        fontSize: '12.5px',
                        background: '#7C3AED',
                        borderColor: '#6D28D9',
                      }}
                    >
                      {isSavingCategory ? 'Saving...' : categoryForm.id ? 'Save Changes' : '+ Add Category'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Categories List Section */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '10px',
                  }}
                >
                  <strong style={{ fontSize: '13px', color: 'var(--ink)' }}>Existing Categories</strong>
                  <div style={{ width: '220px' }}>
                    <input
                      type="text"
                      placeholder="Search categories..."
                      value={categorySearchQuery}
                      onChange={(e) => setCategorySearchQuery(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        fontSize: '12px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                      }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    maxHeight: '340px',
                    overflowY: 'auto',
                  }}
                >
                  {isLoadingCategories ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                      Loading categories...
                    </div>
                  ) : filteredCategories.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                      No categories found. Use the form above to add one.
                    </div>
                  ) : (
                    <table className="admin-table" style={{ fontSize: '12.5px' }}>
                      <thead>
                        <tr>
                          <th>Category Name</th>
                          <th>Focus / Description</th>
                          <th style={{ width: '85px', textAlign: 'center' }}>Remedies</th>
                          <th style={{ width: '90px', textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCategories.map((cat) => (
                          <tr key={cat.id}>
                            <td>
                              <strong style={{ color: 'var(--ink)' }}>{cat.name}</strong>
                            </td>
                            <td>
                              <span style={{ color: '#64748B', fontSize: '12px' }}>
                                {cat.description || '—'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: '10px',
                                  background: cat.medicineCount > 0 ? '#EEF2FF' : '#F1F5F9',
                                  color: cat.medicineCount > 0 ? 'var(--primary)' : '#94A3B8',
                                  fontWeight: 600,
                                  fontSize: '11px',
                                }}
                              >
                                {cat.medicineCount} med{cat.medicineCount === 1 ? '' : 's'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '4px' }}>
                                <button
                                  type="button"
                                  className="action-pill action-pill-edit"
                                  style={{ padding: '3px 8px' }}
                                  title="Edit category"
                                  onClick={() => handleEditCategoryClick(cat)}
                                >
                                  <IconEdit size={12} />
                                </button>
                                <button
                                  type="button"
                                  className="action-pill action-pill-del"
                                  style={{ padding: '3px 8px' }}
                                  title="Delete category"
                                  disabled={deletingCategoryId === cat.id}
                                  onClick={() => handleDeleteCategory(cat)}
                                >
                                  <IconTrash size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Close Button Footer */}
              <div
                style={{
                  marginTop: 'auto',
                  paddingTop: '16px',
                  borderTop: '1px solid var(--line)',
                  display: 'flex',
                  justifyContent: 'flex-end',
                }}
              >
                <button
                  type="button"
                  className="rx-btn rx-btn-primary"
                  onClick={() => setIsCategoryModalOpen(false)}
                >
                  Done
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

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
                  placeholder="e.g. Arnica Montana, Hamamelis, Nux Vomica, Aesculus"
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

                <div className="rx-field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Category</span>
                    <button
                      type="button"
                      onClick={() => setIsCustomCategoryMode(!isCustomCategoryMode)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      {isCustomCategoryMode ? 'Choose Existing' : '+ Type New Category'}
                    </button>
                  </div>

                  {isCustomCategoryMode ? (
                    <input
                      type="text"
                      placeholder="Type new category name..."
                      value={formState.customCategory || ''}
                      onChange={(e) => setFormState({ ...formState, customCategory: e.target.value })}
                      autoFocus
                    />
                  ) : (
                    <select
                      value={formState.category}
                      onChange={(e) => {
                        if (e.target.value === '__NEW__') {
                          setIsCustomCategoryMode(true);
                        } else {
                          setFormState({ ...formState, category: e.target.value });
                        }
                      }}
                    >
                      {availableCategories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value="__NEW__">+ Add Custom Category...</option>
                    </select>
                  )}
                </div>
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
                  placeholder="e.g. Bleeding piles with soreness; violent cutting pain in rectum; aggravated by motion."
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
          TABBED IMPORT EXCEL / CSV MODAL (MEDICINES & CATEGORIES)
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
            style={{ width: 'min(740px, 100vw)' }}
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
                  <h3>Import from Excel / CSV</h3>
                  <p className="drawer-subtitle">
                    Upload an .xlsx, .xls, or .csv spreadsheet for medicines or categories.
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

            {/* Modal Tabs Header */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                padding: '12px 24px 0 24px',
                borderBottom: '1px solid #E2E8F0',
                background: '#FAFAFA',
              }}
            >
              <button
                type="button"
                onClick={() => setImportTab('medicines')}
                style={{
                  padding: '10px 16px',
                  border: 'none',
                  background: 'none',
                  borderBottom: importTab === 'medicines' ? '2.5px solid var(--primary)' : '2.5px solid transparent',
                  color: importTab === 'medicines' ? 'var(--primary)' : '#64748B',
                  fontWeight: importTab === 'medicines' ? 700 : 500,
                  fontSize: '13.5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <IconMedicineBottle size={16} />
                <span>Import Medicines</span>
              </button>

              <button
                type="button"
                onClick={() => setImportTab('categories')}
                style={{
                  padding: '10px 16px',
                  border: 'none',
                  background: 'none',
                  borderBottom: importTab === 'categories' ? '2.5px solid #7C3AED' : '2.5px solid transparent',
                  color: importTab === 'categories' ? '#7C3AED' : '#64748B',
                  fontWeight: importTab === 'categories' ? 700 : 500,
                  fontSize: '13.5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <IconTag size={16} />
                <span>Import Categories</span>
              </button>
            </div>

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
              {/* TAB 1: MEDICINES IMPORT */}
              {importTab === 'medicines' && (
                <>
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
                      Supported Excel Columns for Medicines:
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '6px 0' }}>
                      <code style={{ background: '#EEF2FF', padding: '2px 6px', borderRadius: '4px', color: '#4338CA' }}>Medicine Name *</code>
                      <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>Potency</code>
                      <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>Form</code>
                      <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>Category</code>
                      <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>Notes / Indications</code>
                    </div>
                    <div>
                      Existing medicines with the same name will be updated. New remedies and categories will be created.
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      <button
                        type="button"
                        onClick={handleDownloadMedicineTemplate}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--primary)',
                          fontWeight: 700,
                          cursor: 'pointer',
                          padding: 0,
                          textDecoration: 'underline',
                          fontSize: '13px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <IconDownload size={13} />
                        <span>Download Sample Medicines Excel Template (.xlsx)</span>
                      </button>
                    </div>
                  </div>

                  {/* Upload Box */}
                  <div
                    style={{
                      border: '2px dashed #CBD5E1',
                      borderRadius: '14px',
                      padding: '28px 20px',
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
                      onChange={handleMedicineFileChange}
                      style={{ display: 'none' }}
                    />
                    <div
                      style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '12px',
                        background: '#EEF0FF',
                        color: 'var(--primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 10px auto',
                      }}
                    >
                      <IconUpload size={22} />
                    </div>
                    <h4 style={{ margin: '0 0 5px 0', fontSize: '15px', color: 'var(--ink)' }}>
                      {importFileName ? importFileName : 'Click to Browse or Drop Medicines File'}
                    </h4>
                    <p style={{ margin: 0, fontSize: '12.5px', color: '#64748B' }}>
                      Supports Microsoft Excel (.xlsx, .xls) and CSV spreadsheets
                    </p>
                  </div>

                  {/* Preview Table */}
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
                          maxHeight: '240px',
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

                  {/* Commit Action */}
                  <div
                    style={{
                      marginTop: 'auto',
                      paddingTop: '16px',
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
                      onClick={handleCommitMedicineImport}
                    >
                      {isImporting ? 'Importing...' : `Import ${importRows.length} Remedies`}
                    </button>
                  </div>
                </>
              )}

              {/* TAB 2: CATEGORIES IMPORT */}
              {importTab === 'categories' && (
                <>
                  {/* Instructions banner */}
                  <div
                    style={{
                      padding: '14px 18px',
                      background: '#F5F3FF',
                      borderRadius: '12px',
                      border: '1px solid #DDD6FE',
                      fontSize: '13px',
                      color: '#4C1D95',
                      lineHeight: '1.5',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: '#6D28D9', marginBottom: '4px' }}>
                      Supported Excel Columns for Categories:
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '6px 0' }}>
                      <code style={{ background: '#EDE9FE', padding: '2px 6px', borderRadius: '4px', color: '#6D28D9' }}>Category Name *</code>
                      <code style={{ background: '#FFFFFF', padding: '2px 6px', borderRadius: '4px', border: '1px solid #DDD6FE' }}>Description / Key Focus</code>
                    </div>
                    <div>
                      Upload clinical groups like "Piles &amp; Haemorrhoids", "Fissure &amp; Fistula", "Constipation", etc.
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      <button
                        type="button"
                        onClick={handleDownloadCategoryTemplate}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#6D28D9',
                          fontWeight: 700,
                          cursor: 'pointer',
                          padding: 0,
                          textDecoration: 'underline',
                          fontSize: '13px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <IconDownload size={13} />
                        <span>Download Sample Categories Excel Template (.xlsx)</span>
                      </button>
                    </div>
                  </div>

                  {/* Upload Box */}
                  <div
                    style={{
                      border: '2px dashed #CBD5E1',
                      borderRadius: '14px',
                      padding: '28px 20px',
                      textAlign: 'center',
                      background: '#F8FAFC',
                      cursor: 'pointer',
                      transition: 'border-color 0.2s',
                    }}
                    onClick={() => categoryFileInputRef.current?.click()}
                  >
                    <input
                      ref={categoryFileInputRef}
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      onChange={handleCategoryFileChange}
                      style={{ display: 'none' }}
                    />
                    <div
                      style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '12px',
                        background: '#EDE9FE',
                        color: '#6D28D9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 10px auto',
                      }}
                    >
                      <IconTag size={22} />
                    </div>
                    <h4 style={{ margin: '0 0 5px 0', fontSize: '15px', color: 'var(--ink)' }}>
                      {importCategoryFileName ? importCategoryFileName : 'Click to Browse or Drop Categories File'}
                    </h4>
                    <p style={{ margin: 0, fontSize: '12.5px', color: '#64748B' }}>
                      Supports Microsoft Excel (.xlsx, .xls) and CSV spreadsheets
                    </p>
                  </div>

                  {/* Preview Table */}
                  {importCategoryRows.length > 0 && (
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '8px',
                        }}
                      >
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#6D28D9' }}>
                          Preview: {importCategoryRows.length} Categories Detected
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setImportCategoryRows([]);
                            setImportCategoryFileName('');
                            if (categoryFileInputRef.current) categoryFileInputRef.current.value = '';
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
                          maxHeight: '240px',
                          overflowY: 'auto',
                          border: '1px solid #E2E8F0',
                          borderRadius: '10px',
                        }}
                      >
                        <table className="admin-table" style={{ fontSize: '12.5px' }}>
                          <thead>
                            <tr>
                              <th>Category Name</th>
                              <th>Description / Focus</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importCategoryRows.slice(0, 15).map((row, idx) => (
                              <tr key={idx}>
                                <td>
                                  <strong>{row.name}</strong>
                                </td>
                                <td>{row.description || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {importCategoryRows.length > 15 && (
                        <p style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
                          Showing first 15 of {importCategoryRows.length} categories. All {importCategoryRows.length} will be imported.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Commit Action */}
                  <div
                    style={{
                      marginTop: 'auto',
                      paddingTop: '16px',
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
                      disabled={importCategoryRows.length === 0 || isImportingCategories}
                      onClick={handleCommitCategoryImport}
                      style={{ background: '#7C3AED', borderColor: '#6D28D9' }}
                    >
                      {isImportingCategories ? 'Importing...' : `Import ${importCategoryRows.length} Categories`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
