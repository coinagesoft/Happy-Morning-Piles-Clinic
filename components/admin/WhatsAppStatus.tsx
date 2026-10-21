'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui/Toast';

type WaInfo = {
  status: 'disconnected' | 'connecting' | 'qr' | 'connected';
  qr: string | null;
  phone: string | null;
  error?: string | null;
};

interface Props {
  adminFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

export default function WhatsAppStatus({ adminFetch }: Props) {
  const [info, setInfo] = useState<WaInfo | null>(null);
  const [open, setOpen] = useState(false);
  const wasQr = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await adminFetch(`/api/admin/whatsapp?t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) setInfo(data);
    } catch {
      // keep last known status
    }
  }, [adminFetch]);

  // Slow poll normally, fast poll while the dialog is open
  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, open ? 2500 : 15000);
    return () => clearInterval(t);
  }, [refresh, open]);

  // Close the dialog automatically once the phone scans the QR
  useEffect(() => {
    if (info?.status === 'qr') wasQr.current = true;
    if (info?.status === 'connected' && wasQr.current) {
      wasQr.current = false;
      setOpen(false);
      toast.success('WhatsApp linked successfully.');
    }
  }, [info]);

  const unlink = async (skipConfirm = false) => {
    if (!skipConfirm && !window.confirm('Unlink the clinic WhatsApp?')) return;
    try {
      const res = await adminFetch('/api/admin/whatsapp', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to unlink');
      toast.success(skipConfirm ? 'Session reset. A new QR will appear shortly.' : 'WhatsApp unlinked.');
      if (!skipConfirm) setOpen(false);
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to unlink');
    }
  };

  const connected = info?.status === 'connected';
  const pending = info?.status === 'connecting' || info?.status === 'qr';
  const dot = connected ? '#22C55E' : pending ? '#F59E0B' : '#EF4444';
  const label = connected
    ? `WhatsApp +${info?.phone}`
    : pending
    ? 'WhatsApp connecting…'
    : 'WhatsApp not linked';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="WhatsApp connection"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
          background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.22)',
          color: '#E2E5F8', fontSize: 13.5, fontWeight: 600, padding: '8px 14px',
          borderRadius: 10, cursor: 'pointer',
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: dot }} />
        {label}
      </button>

      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(15,23,42,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              background: '#fff', color: '#0F172A', borderRadius: 16, padding: 28,
              maxWidth: 380, width: '100%', textAlign: 'center',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Clinic WhatsApp</h3>

            {connected ? (
              <>
                <p style={{ margin: '0 0 16px', fontSize: 14, color: '#475569' }}>
                  Logged in as <strong>+{info?.phone}</strong>
                </p>
                <button type="button" className="rx-btn rx-btn-outline" onClick={() => unlink()}>
                  Unlink / Log out
                </button>
              </>
            ) : (
              <>
                <p style={{ margin: '0 0 14px', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                  On the clinic phone: <strong>WhatsApp → Settings → Linked devices → Link a device</strong>, then scan this code.
                </p>
                {info?.qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={info.qr} alt="WhatsApp QR code" width={260} height={260} style={{ margin: '0 auto' }} />
                ) : (
                  <div style={{ padding: '40px 0 20px', color: '#64748b', fontSize: 14 }}>Generating QR code…</div>
                )}
                {!info?.qr && info?.error && (
                  <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#B45309', lineHeight: 1.5 }}>{info.error}</p>
                )}
                {!info?.qr && (
                  <button type="button" className="rx-btn rx-btn-outline" onClick={() => unlink(true)}>
                    Reset &amp; generate new QR
                  </button>
                )}
              </>
            )}

            <div>
              <button type="button" className="rx-btn rx-btn-ghost" style={{ marginTop: 14 }} onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}