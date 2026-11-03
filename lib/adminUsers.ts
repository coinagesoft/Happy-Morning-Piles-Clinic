import crypto from 'crypto';
import { promisify } from 'util';
import type { RowDataPacket } from 'mysql2/promise';
import { getPool, ensureDatabaseSchema } from './db';
import type { AdminRole } from './adminAuth';

const scrypt = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const VALID_ROLES: AdminRole[] = ['admin', 'doctor', 'receptionist', 'pharmacist'];

declare global {
  // eslint-disable-next-line no-var
  var __adminUsersTable: Promise<void> | undefined;
}

/** Password hash format: scrypt$<saltHex>$<hashHex> (same format as scripts/create-admin-user.mjs) */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length === 0) return false;
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | null = null;

/** Staff table (one row per login). Created automatically on first use. */
export function ensureAdminUsersTable(): Promise<void> {
  if (!global.__adminUsersTable) {
    global.__adminUsersTable = (async () => {
      await ensureDatabaseSchema();
      await getPool().execute(`
        CREATE TABLE IF NOT EXISTS admin_users (
          id VARCHAR(64) PRIMARY KEY,
          email VARCHAR(255) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          role VARCHAR(32) NOT NULL,
          title VARCHAR(255) NOT NULL DEFAULT '',
          doctor_slug VARCHAR(64) NULL,
          active TINYINT(1) NOT NULL DEFAULT 1,
          created_at VARCHAR(64) NOT NULL,
          updated_at VARCHAR(64) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((err) => {
      global.__adminUsersTable = undefined; // allow a retry on the next request
      throw err;
    });
  }
  return global.__adminUsersTable;
}

interface AdminUserRow extends RowDataPacket {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  title: string;
  doctor_slug: string | null;
  active: number;
}

export interface StaffUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  title: string;
  doctorSlug?: string;
}

/** Returns the staff member when email + password match an active account, otherwise null. */
export async function findStaffByCredentials(
  email: string,
  password: string
): Promise<StaffUser | null> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !password) return null;

  await ensureAdminUsersTable();
  const [rows] = await getPool().execute<AdminUserRow[]>(
    `SELECT id, email, password_hash, name, role, title, doctor_slug, active
     FROM admin_users WHERE email = ? LIMIT 1`,
    [cleanEmail]
  );
  const row = rows[0];

  // Always run one hash comparison so "unknown email" and "wrong password" take similar time.
  if (!dummyHash) dummyHash = hashPassword('not-a-real-password');
  const passwordOk = await verifyPassword(password, row ? row.password_hash : await dummyHash);

  if (!row || !passwordOk || !row.active) return null;
  if (!VALID_ROLES.includes(row.role as AdminRole)) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as AdminRole,
    title: row.title || '',
    doctorSlug: row.doctor_slug || undefined,
  };
}
