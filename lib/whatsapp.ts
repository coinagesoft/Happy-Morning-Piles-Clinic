import path from 'path';
import fs from 'fs';
import pino from 'pino';
import QRCode from 'qrcode';
import type { WASocket } from '@whiskeysockets/baileys';

/**
 * Free, automatic WhatsApp sending using a linked device (like WhatsApp Web).
 * The clinic scans a QR code once; the session is stored in AUTH_DIR.
 *
 * NOTE: this uses the unofficial WhatsApp Web protocol (Baileys). It needs a
 * long-running Node server (npm run dev / npm start on a VPS), NOT serverless hosting.
 */

const AUTH_DIR = process.env.WHATSAPP_AUTH_DIR || path.join(process.cwd(), '.whatsapp-auth');

export type WhatsAppStatus = 'disconnected' | 'connecting' | 'qr' | 'connected';

interface WaState {
  sock: WASocket | null;
  status: WhatsAppStatus;
  qr: string | null; // data URL of the QR image
  phone: string | null;
  starting: Promise<void> | null;
  error: string | null; // why the last attempt failed (shown in the admin dialog)
  retryAt: number; // don't auto-restart before this timestamp (prevents reconnect loops)
}

declare global {
  // eslint-disable-next-line no-var
  var __waState: WaState | undefined;
}

function state(): WaState {
  if (!global.__waState) {
    global.__waState = {
      sock: null, status: 'disconnected', qr: null, phone: null, starting: null,
      error: null, retryAt: 0,
    };
  }
  return global.__waState;
}

export class WhatsAppNotConnectedError extends Error {
  constructor() {
    super('WhatsApp is not connected. Scan the QR code to link the clinic WhatsApp.');
    this.name = 'WhatsAppNotConnectedError';
  }
}

async function connect(): Promise<void> {
  const s = state();
  const baileys = await import('@whiskeysockets/baileys');
  const makeWASocket = baileys.default;
  const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = baileys;

  const { state: auth, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  let version: [number, number, number] | undefined;
  try {
    const latest = await fetchLatestBaileysVersion();
    version = latest.version;
    if (!latest.isLatest) {
      console.warn('[whatsapp] could not fetch the latest WhatsApp Web version, using built-in', version);
    }
  } catch {
    version = undefined; // fall back to the library's built-in version
  }

  s.status = 'connecting';
  const sock = makeWASocket({
    ...(version ? { version } : {}),
    auth,
    logger: pino({ level: 'silent' }),
    browser: Browsers.macOS('Desktop'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  s.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    // Ignore events from an old socket that was already replaced
    if (s.sock !== sock) return;
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        s.qr = await QRCode.toDataURL(qr, { margin: 1, width: 280 });
        s.status = 'qr';
        s.error = null;
      } catch (err) {
        console.error('[whatsapp] QR generation failed:', err);
        s.error = 'QR image generation failed. Check the server console.';
      }
    }

    if (connection === 'open') {
      s.status = 'connected';
      s.qr = null;
      s.error = null;
      s.retryAt = 0;
      s.phone = sock.user?.id ? sock.user.id.split(':')[0].split('@')[0] : null;
      console.log('[whatsapp] connected as', s.phone);
    }

    if (connection === 'close') {
      const err = lastDisconnect?.error as
        | { output?: { statusCode?: number }; message?: string }
        | undefined;
      const code = err?.output?.statusCode;
      const reason = err?.message;
      s.sock = null;
      s.status = 'disconnected';
      s.qr = null;
      s.phone = null;
      console.log('[whatsapp] connection closed, code:', code, reason || '');

      if (
        code === DisconnectReason.loggedOut ||
        code === DisconnectReason.badSession ||
        code === DisconnectReason.multideviceMismatch
      ) {
        // Phone unlinked the device / saved session is invalid -> wipe it so a fresh QR can be shown
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        s.error = 'The saved WhatsApp session was no longer valid and was cleared. A new QR code will appear.';
        s.retryAt = 0;
      } else if (code === DisconnectReason.restartRequired) {
        // Normal right after scanning the QR: WhatsApp asks for an immediate reconnect
        s.error = null;
        s.retryAt = 0;
        void ensureWhatsAppStarted();
      } else if (code === DisconnectReason.connectionReplaced) {
        // The same session is open somewhere else (another server / a copy of this project).
        // Reconnecting immediately would just start a tug-of-war, so back off and tell the admin.
        s.error =
          'This WhatsApp session is open somewhere else (another server or a copy of this project). ' +
          'Stop the other one, or use "Reset & generate new QR".';
        s.retryAt = Date.now() + 60_000;
      } else {
        s.error = `Could not connect to WhatsApp (code ${code ?? 'unknown'}${reason ? `: ${reason}` : ''}). Retrying…`;
        s.retryAt = Date.now() + 5_000;
      }
    }
  });
}

/** Starts the WhatsApp connection if it isn't running yet (safe to call repeatedly). */
export async function ensureWhatsAppStarted(): Promise<void> {
  const s = state();
  if (s.sock || s.starting) return s.starting ?? undefined;
  if (Date.now() < s.retryAt) return;
  s.starting = connect()
    .catch((err) => {
      console.error('[whatsapp] failed to start:', err);
      s.status = 'disconnected';
      s.sock = null;
      s.error = `Failed to start WhatsApp: ${err instanceof Error ? err.message : String(err)}`;
      s.retryAt = Date.now() + 5_000;
    })
    .finally(() => {
      s.starting = null;
    });
  return s.starting;
}

export async function getWhatsAppStatus(): Promise<{
  status: WhatsAppStatus;
  qr: string | null;
  phone: string | null;
  error: string | null;
}> {
  await ensureWhatsAppStarted();
  const s = state();
  return { status: s.status, qr: s.qr, phone: s.phone, error: s.error };
}

async function waitUntilConnected(timeoutMs: number): Promise<void> {
  const s = state();
  const deadline = Date.now() + timeoutMs;
  while (s.status === 'connecting' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
  }
}

export function normalizeIndianPhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '').replace(/^0+/, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

export async function sendWhatsAppPdf(opts: {
  phone: string;
  pdf: Buffer;
  fileName: string;
  caption: string;
}): Promise<{ to: string }> {
  await ensureWhatsAppStarted();
  const s = state();
  await waitUntilConnected(15_000);

  if (s.status !== 'connected' || !s.sock) {
    throw new WhatsAppNotConnectedError();
  }

  const number = normalizeIndianPhone(opts.phone);
  if (number.length < 11) {
    throw new Error('The patient does not have a valid mobile number.');
  }

  const lookup = await s.sock.onWhatsApp(`${number}@s.whatsapp.net`);
  const match = lookup?.[0];
  if (!match?.exists) {
    throw new Error(`+${number} is not registered on WhatsApp.`);
  }

  await s.sock.sendMessage(match.jid, {
    document: opts.pdf,
    mimetype: 'application/pdf',
    fileName: opts.fileName,
    caption: opts.caption,
  });

  return { to: number };
}

export async function logoutWhatsApp(): Promise<void> {
  const s = state();
  const sock = s.sock;
  // Detach first so the old socket's "close" event can't touch the fresh state
  s.sock = null;
  try {
    await sock?.logout();
  } catch {
    // already disconnected
  }
  s.status = 'disconnected';
  s.qr = null;
  s.phone = null;
  s.error = null;
  s.retryAt = 0;
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
}