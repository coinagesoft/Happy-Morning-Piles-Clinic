#!/usr/bin/env node
/**
 * Create, update or deactivate a staff login (doctor / receptionist / pharmacist / admin).
 *
 * Run from the project root (Node 20.6+ so --env-file works):
 *
 *   node --env-file=.env.local scripts/create-admin-user.mjs \
 *     --email sumed@yourclinic.com --name "Dr. Sumed Madan" --role doctor --doctor sumed-madan
 *
 *   node --env-file=.env.local scripts/create-admin-user.mjs \
 *     --email frontdesk@yourclinic.com --name "Front Desk" --role receptionist
 *
 *   node --env-file=.env.local scripts/create-admin-user.mjs --email sumed@yourclinic.com --deactivate
 *
 * The password is asked for (hidden). Running it again for the same email resets the password.
 * Doctor slugs come from lib/doctorsTeam.ts.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const ROLES = ['admin', 'doctor', 'receptionist', 'pharmacist'];
const here = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function doctorSlugs() {
  const file = path.resolve(here, '..', 'lib', 'doctorsTeam.ts');
  const src = fs.readFileSync(file, 'utf8');
  return [...src.matchAll(/slug:\s*'([^']+)'/g)].map((m) => m[1]);
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const write = rl._writeToOutput.bind(rl);
    let muted = false;
    rl._writeToOutput = (s) => {
      if (!muted) write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true; // the prompt text is already printed; hide what is typed
  });
}

// Same format as lib/adminUsers.ts: scrypt$<saltHex>$<hashHex>
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function fail(msg) {
  console.error(`\nError: ${msg}\n`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const email = String(args.email || '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail('Pass a valid --email.');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'happy_morning',
  charset: 'utf8mb4',
});

try {
  await pool.execute(`
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

  const now = new Date().toISOString();

  if (args.deactivate) {
    const [res] = await pool.execute(
      'UPDATE admin_users SET active = 0, updated_at = ? WHERE email = ?',
      [now, email]
    );
    if (!res.affectedRows) fail(`No login found for ${email}.`);
    console.log(`Deactivated ${email}. They can no longer sign in.`);
  } else {
    const role = String(args.role || '');
    if (!ROLES.includes(role)) fail(`--role must be one of: ${ROLES.join(', ')}`);
    const name = String(args.name || '').trim();
    if (!name) fail('Pass --name "Full Name".');

    let doctorSlug = null;
    if (role === 'doctor') {
      const slugs = doctorSlugs();
      doctorSlug = String(args.doctor || '').trim();
      if (!slugs.includes(doctorSlug)) {
        fail(`A doctor login needs --doctor <slug>. Available: ${slugs.join(', ')}`);
      }
    } else if (args.doctor) {
      fail('--doctor is only for --role doctor.');
    }

    const title =
      String(args.title || '').trim() ||
      { doctor: 'Consulting Doctor', receptionist: 'Front Desk', pharmacist: 'Pharmacy', admin: 'Administrator' }[role];

    const password = String(args.password || process.env.NEW_USER_PASSWORD || (await promptHidden('Password (min 10 characters): ')));
    if (password.length < 10) fail('Password must be at least 10 characters.');
    if (password.length > 256) fail('Password is too long.');

    const [existing] = await pool.execute('SELECT id FROM admin_users WHERE email = ?', [email]);
    const id = existing.length ? existing[0].id : crypto.randomUUID();

    await pool.execute(
      `INSERT INTO admin_users
         (id, email, password_hash, name, role, title, doctor_slug, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE
         password_hash = VALUES(password_hash), name = VALUES(name), role = VALUES(role),
         title = VALUES(title), doctor_slug = VALUES(doctor_slug), active = 1, updated_at = VALUES(updated_at)`,
      [id, email, hashPassword(password), name, role, title, doctorSlug, now, now]
    );
    console.log(
      `${existing.length ? 'Updated' : 'Created'} ${role} login: ${email}${doctorSlug ? ` (doctor: ${doctorSlug})` : ''}`
    );
  }
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
