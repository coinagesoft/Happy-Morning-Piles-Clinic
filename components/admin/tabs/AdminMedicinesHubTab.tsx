'use client';

import React, { useState } from 'react';
import AdminMedicinesTab from '@/components/admin/tabs/AdminMedicinesTab';
import AdminInventoryTab from '@/components/admin/tabs/AdminInventoryTab';
import type { Medicine } from '@/lib/medicines';

interface Props {
  userRole?: string;
  medicines: Medicine[];
  isLoading: boolean;
  onRefresh: () => void | Promise<void>;
  adminFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

/** "Medicines & Inventory" tab: Medicine List (existing) + Inventory & Billing (new). */
export default function AdminMedicinesHubTab(props: Props) {
  const [section, setSection] = useState<'catalog' | 'inventory'>('catalog');
  return (
    <div>
      <div className="rx-chips" style={{ marginBottom: 14 }}>
        <button type="button" className={`rx-chip ${section === 'catalog' ? 'on' : ''}`} onClick={() => setSection('catalog')}>
          Medicine List
        </button>
        <button type="button" className={`rx-chip ${section === 'inventory' ? 'on' : ''}`} onClick={() => setSection('inventory')}>
          Inventory, Purchases &amp; Expenses
        </button>
      </div>
      {section === 'catalog' ? (
        <AdminMedicinesTab {...props} />
      ) : (
        <AdminInventoryTab adminFetch={props.adminFetch} userRole={props.userRole} />
      )}
    </div>
  );
}
