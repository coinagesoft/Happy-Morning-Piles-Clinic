import mysql from 'mysql2/promise';

// Local MySQL by default. Override any value in .env.local (see .env.local.example).
const DB_NAME = process.env.DB_NAME || 'happy_morning';

const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10,
  idleTimeout: 60000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  queueLimit: 0,
  connectTimeout: 15000,
  charset: 'utf8mb4',
};

declare global {
  // eslint-disable-next-line no-var
  var __mysqlPool: mysql.Pool | undefined;
  // eslint-disable-next-line no-var
  var __schemaInitialized: boolean | undefined;
  // eslint-disable-next-line no-var
  var __schemaVersion: number | undefined;
  // eslint-disable-next-line no-var
  var __schemaPromiseVersion: number | undefined;
  // eslint-disable-next-line no-var
  var __schemaPromise: Promise<void> | null | undefined;
}

/** Creates the local database if it does not exist yet (needs a MySQL user with CREATE rights). */
async function ensureDatabaseExists(): Promise<void> {
  const { database: _db, ...serverConfig } = DB_CONFIG;
  const conn = await mysql.createConnection({
    host: serverConfig.host,
    port: serverConfig.port,
    user: serverConfig.user,
    password: serverConfig.password,
    charset: 'utf8mb4',
  });
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await conn.end();
  }
}

export function getPool(): mysql.Pool {
  if (!global.__mysqlPool) {
    global.__mysqlPool = mysql.createPool(DB_CONFIG);
  }
  return global.__mysqlPool;
}

/**
 * Bump this whenever a table / column is added below. Next.js hot reload keeps the
 * old "schema is ready" flag alive, so without a version a new column would only be
 * created after a full server restart.
 */
const SCHEMA_VERSION = 5;

export async function ensureDatabaseSchema(): Promise<void> {
  if (global.__schemaVersion === SCHEMA_VERSION) {
    return;
  }

  if (global.__schemaPromise && global.__schemaPromiseVersion === SCHEMA_VERSION) {
    return global.__schemaPromise;
  }

  global.__schemaPromiseVersion = SCHEMA_VERSION;

  const pool = getPool();
  global.__schemaPromise = (async () => {
  await ensureDatabaseExists();

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS appointments (
      id VARCHAR(64) PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      phone VARCHAR(32) NOT NULL,
      email VARCHAR(255) NOT NULL,
      age INT NOT NULL,
      reason VARCHAR(255) NOT NULL,
      appointment_date VARCHAR(16) NOT NULL,
      appointment_time VARCHAR(16) NOT NULL,
      message TEXT,
      meet_link VARCHAR(512),
      google_event_id VARCHAR(255),
      status VARCHAR(32) NOT NULL DEFAULT 'confirmed',
      payment_status VARCHAR(32) NOT NULL DEFAULT 'paid',
      amount DECIMAL(10, 2) NOT NULL DEFAULT 800.00,
      payment_method VARCHAR(64) NOT NULL DEFAULT 'Razorpay',
      payment_id VARCHAR(128),
      paid_at VARCHAR(64),
      notes TEXT,
      consultation_type VARCHAR(32) NOT NULL DEFAULT 'online',
      created_at VARCHAR(64) NOT NULL,
      INDEX idx_appt_date_time (appointment_date, appointment_time),
      INDEX idx_appt_email (email),
      INDEX idx_appt_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Safe migration for existing appointments table
  try {
    await pool.execute(`
      ALTER TABLE appointments ADD COLUMN consultation_type VARCHAR(32) NOT NULL DEFAULT 'online'
    `);
  } catch {
    // Column might already exist
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS patients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      full_name VARCHAR(255) NOT NULL,
      phone VARCHAR(32) NOT NULL,
      age INT NOT NULL,
      total_bookings INT NOT NULL DEFAULT 1,
      total_paid DECIMAL(10, 2) NOT NULL DEFAULT 800.00,
      last_visit_date VARCHAR(16),
      created_at VARCHAR(64) NOT NULL,
      updated_at VARCHAR(64) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      payment_id VARCHAR(128) NOT NULL UNIQUE,
      appointment_id VARCHAR(64) NOT NULL,
      patient_name VARCHAR(255) NOT NULL,
      patient_email VARCHAR(255) NOT NULL,
      patient_phone VARCHAR(32) NOT NULL,
      amount DECIMAL(10, 2) NOT NULL DEFAULT 800.00,
      payment_method VARCHAR(64) NOT NULL DEFAULT 'Razorpay',
      payment_status VARCHAR(32) NOT NULL DEFAULT 'paid',
      paid_at VARCHAR(64) NOT NULL,
      INDEX idx_payment_appt (appointment_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS doctor_availability (
      id VARCHAR(64) PRIMARY KEY,
      override_date VARCHAR(16) NOT NULL,
      override_type VARCHAR(32) NOT NULL,
      blocked_slots TEXT,
      reason VARCHAR(255) NOT NULL,
      created_at VARCHAR(64) NOT NULL,
      INDEX idx_override_date (override_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS clinic_settings (
      id INT PRIMARY KEY DEFAULT 1,
      slot_duration INT NOT NULL DEFAULT 45,
      buffer_time INT NOT NULL DEFAULT 0,
      sessions TEXT,
      updated_at VARCHAR(64) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Safe migrations: day-wise schedule + visiting location
  try {
    await pool.execute(`ALTER TABLE clinic_settings ADD COLUMN weekly LONGTEXT NULL`);
  } catch {
    // Column might already exist
  }
  try {
    await pool.execute(`ALTER TABLE clinic_settings ADD COLUMN locations TEXT NULL`);
  } catch {
    // Column might already exist
  }
  try {
    await pool.execute(`ALTER TABLE appointments ADD COLUMN location VARCHAR(255) NULL`);
  } catch {
    // Column might already exist
  }

  // Safe migrations: doctor assigned to an appointment
  try {
    await pool.execute(`ALTER TABLE appointments ADD COLUMN doctor_id VARCHAR(64) NULL`);
  } catch {
    // Column might already exist
  }
  try {
    await pool.execute(`ALTER TABLE appointments ADD COLUMN doctor_name VARCHAR(255) NULL`);
  } catch {
    // Column might already exist
  }
  try {
    await pool.execute(`ALTER TABLE appointments ADD INDEX idx_appt_doctor (doctor_id)`);
  } catch {
    // Index might already exist
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS google_oauth_tokens (
      id INT PRIMARY KEY DEFAULT 1,
      doctor_email VARCHAR(255) NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      token_type VARCHAR(64),
      expiry_date BIGINT,
      updated_at VARCHAR(64) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS prescriptions (
      id VARCHAR(64) PRIMARY KEY,
      appointment_id VARCHAR(64) NOT NULL UNIQUE,
      patient_name VARCHAR(255) NOT NULL,
      patient_email VARCHAR(255) NOT NULL,
      patient_phone VARCHAR(32) NOT NULL,
      patient_age INT NOT NULL DEFAULT 0,
      prescription_date VARCHAR(16) NOT NULL,
      diagnosis TEXT,
      medicines LONGTEXT,
      advice TEXT,
      follow_up VARCHAR(255),
      emailed_at VARCHAR(64),
      created_at VARCHAR(64) NOT NULL,
      updated_at VARCHAR(64) NOT NULL,
      INDEX idx_rx_email (patient_email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Safe migration: follow-up date (drives the follow-up reminders)
  try {
    await pool.execute(`ALTER TABLE prescriptions ADD COLUMN follow_up_date VARCHAR(16) NULL`);
  } catch {
    // Column might already exist
  }
  try {
    await pool.execute(`ALTER TABLE prescriptions ADD INDEX idx_rx_follow_up_date (follow_up_date)`);
  } catch {
    // Index might already exist
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS prescription_letterhead (
      id INT PRIMARY KEY DEFAULT 1,
      data TEXT,
      updated_at VARCHAR(64) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS medicines (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      potency VARCHAR(255) DEFAULT '',
      form VARCHAR(100) DEFAULT 'Dilution',
      category VARCHAR(150) DEFAULT '',
      notes TEXT,
      created_at VARCHAR(64) NOT NULL,
      updated_at VARCHAR(64) NOT NULL,
      INDEX idx_med_name (name),
      INDEX idx_med_category (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS medicine_categories (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(150) NOT NULL UNIQUE,
      description TEXT,
      created_at VARCHAR(64) NOT NULL,
      updated_at VARCHAR(64) NOT NULL,
      INDEX idx_category_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // One-time setup markers (e.g. "existing doctors were imported")
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS app_flags (
      flag_key VARCHAR(64) PRIMARY KEY,
      created_at VARCHAR(64) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Doctors managed by the Super Admin (each doctor gets their own login)
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS doctors (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      phone VARCHAR(32) NOT NULL DEFAULT '',
      specialization VARCHAR(255) NOT NULL DEFAULT '',
      qualification VARCHAR(255) NOT NULL DEFAULT '',
      registration_no VARCHAR(100) NOT NULL DEFAULT '',
      locations TEXT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at VARCHAR(64) NOT NULL,
      updated_at VARCHAR(64) NOT NULL,
      INDEX idx_doctor_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // ---------- Inventory, Purchase Orders, Invoices & Expenses ----------
  for (const col of [
    `ALTER TABLE medicines ADD COLUMN stock_qty INT NOT NULL DEFAULT 0`,
    `ALTER TABLE medicines ADD COLUMN reorder_level INT NOT NULL DEFAULT 10`,
    `ALTER TABLE medicines ADD COLUMN unit_cost DECIMAL(10, 2) NOT NULL DEFAULT 0.00`,
  ]) {
    try {
      await pool.execute(col);
    } catch {
      // Column might already exist
    }
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      contact_person VARCHAR(255) NOT NULL DEFAULT '',
      phone VARCHAR(32) NOT NULL DEFAULT '',
      email VARCHAR(255) NOT NULL DEFAULT '',
      gstin VARCHAR(32) NOT NULL DEFAULT '',
      address TEXT,
      notes TEXT,
      created_at VARCHAR(64) NOT NULL,
      updated_at VARCHAR(64) NOT NULL,
      INDEX idx_supplier_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id VARCHAR(64) PRIMARY KEY,
      po_number VARCHAR(64) NOT NULL UNIQUE,
      supplier_id VARCHAR(64) NULL,
      supplier_name VARCHAR(255) NOT NULL DEFAULT '',
      order_date VARCHAR(16) NOT NULL,
      expected_date VARCHAR(16) NOT NULL DEFAULT '',
      status VARCHAR(16) NOT NULL DEFAULT 'draft',
      notes TEXT,
      subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
      tax_total DECIMAL(12, 2) NOT NULL DEFAULT 0,
      total DECIMAL(12, 2) NOT NULL DEFAULT 0,
      created_at VARCHAR(64) NOT NULL,
      updated_at VARCHAR(64) NOT NULL,
      INDEX idx_po_status (status),
      INDEX idx_po_date (order_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id VARCHAR(64) PRIMARY KEY,
      po_id VARCHAR(64) NOT NULL,
      medicine_id VARCHAR(64) NULL,
      medicine_name VARCHAR(255) NOT NULL,
      potency VARCHAR(255) NOT NULL DEFAULT '',
      form VARCHAR(100) NOT NULL DEFAULT '',
      quantity INT NOT NULL DEFAULT 0,
      received_qty INT NOT NULL DEFAULT 0,
      unit_cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
      tax_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
      line_total DECIMAL(12, 2) NOT NULL DEFAULT 0,
      INDEX idx_poi_po (po_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS purchase_invoices (
      id VARCHAR(64) PRIMARY KEY,
      invoice_number VARCHAR(100) NOT NULL,
      supplier_id VARCHAR(64) NULL,
      supplier_name VARCHAR(255) NOT NULL DEFAULT '',
      po_id VARCHAR(64) NULL,
      invoice_date VARCHAR(16) NOT NULL,
      due_date VARCHAR(16) NOT NULL DEFAULT '',
      subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
      tax_total DECIMAL(12, 2) NOT NULL DEFAULT 0,
      total DECIMAL(12, 2) NOT NULL DEFAULT 0,
      amount_paid DECIMAL(12, 2) NOT NULL DEFAULT 0,
      notes TEXT,
      created_at VARCHAR(64) NOT NULL,
      updated_at VARCHAR(64) NOT NULL,
      INDEX idx_inv_date (invoice_date),
      INDEX idx_inv_supplier (supplier_id),
      INDEX idx_inv_po (po_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS invoice_payments (
      id VARCHAR(64) PRIMARY KEY,
      invoice_id VARCHAR(64) NOT NULL,
      amount DECIMAL(12, 2) NOT NULL,
      method VARCHAR(64) NOT NULL DEFAULT 'Cash',
      paid_on VARCHAR(16) NOT NULL,
      reference VARCHAR(255) NOT NULL DEFAULT '',
      created_at VARCHAR(64) NOT NULL,
      INDEX idx_ip_invoice (invoice_id),
      INDEX idx_ip_date (paid_on)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS expenses (
      id VARCHAR(64) PRIMARY KEY,
      expense_date VARCHAR(16) NOT NULL,
      category VARCHAR(100) NOT NULL DEFAULT 'Other',
      description VARCHAR(500) NOT NULL DEFAULT '',
      vendor VARCHAR(255) NOT NULL DEFAULT '',
      amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
      payment_method VARCHAR(64) NOT NULL DEFAULT 'Cash',
      reference VARCHAR(255) NOT NULL DEFAULT '',
      created_at VARCHAR(64) NOT NULL,
      updated_at VARCHAR(64) NOT NULL,
      INDEX idx_exp_date (expense_date),
      INDEX idx_exp_cat (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id VARCHAR(64) PRIMARY KEY,
      medicine_id VARCHAR(64) NOT NULL,
      medicine_name VARCHAR(255) NOT NULL,
      type VARCHAR(16) NOT NULL,
      qty_change INT NOT NULL,
      reference VARCHAR(128) NOT NULL DEFAULT '',
      reason VARCHAR(255) NOT NULL DEFAULT '',
      created_at VARCHAR(64) NOT NULL,
      INDEX idx_sm_med (medicine_id),
      INDEX idx_sm_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  global.__schemaInitialized = true;
  global.__schemaVersion = SCHEMA_VERSION;
  })().catch((err) => {
    // Let the next request retry instead of caching the failure forever
    global.__schemaPromise = null;
    global.__schemaPromiseVersion = undefined;
    throw err;
  });

  return global.__schemaPromise;
}