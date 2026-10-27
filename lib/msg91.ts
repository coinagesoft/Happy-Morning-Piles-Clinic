/**
 * MSG91 WhatsApp sender (official WhatsApp Business API via MSG91).
 *
 * Business-initiated messages must use pre-approved TEMPLATES.
 *
 * Env:
 *   MSG91_AUTH_KEY                        your MSG91 authkey
 *   MSG91_WHATSAPP_NUMBER                 connected WhatsApp number with country code (e.g. 919175140525)
 *   MSG91_WHATSAPP_NAMESPACE              template namespace (shown in the template JSON)
 *   MSG91_WHATSAPP_LANGUAGE               template language code, default "en"
 *   MSG91_WHATSAPP_TEMPLATE               reminder template name         (e.g. "reminder")
 *   MSG91_WHATSAPP_TEMPLATE_CONFIRMATION  booking-confirmation template   (e.g. "reminder1")
 *   MSG91_WHATSAPP_TEMPLATE_FOLLOWUP      follow-up reminder template     (e.g. "followup_reminder")
 */

const ENDPOINT =
  'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/';

function baseConfigured(): boolean {
  return Boolean(
    process.env.MSG91_AUTH_KEY &&
      process.env.MSG91_WHATSAPP_NUMBER &&
      process.env.MSG91_WHATSAPP_NAMESPACE
  );
}

/** Reminder template is configured (used by the reminder cron job). */
export function isMsg91Configured(): boolean {
  return baseConfigured() && Boolean(process.env.MSG91_WHATSAPP_TEMPLATE);
}

/** Booking-confirmation template is configured (used right after payment). */
export function isMsg91ConfirmationConfigured(): boolean {
  return baseConfigured() && Boolean(process.env.MSG91_WHATSAPP_TEMPLATE_CONFIRMATION);
}

/** Follow-up reminder template is configured (used for the follow-up date set in a prescription). */
export function isMsg91FollowUpConfigured(): boolean {
  return baseConfigured() && Boolean(process.env.MSG91_WHATSAPP_TEMPLATE_FOLLOWUP);
}

/** 10-digit Indian mobile (or already prefixed) -> 91XXXXXXXXXX */
export function toWhatsAppNumber(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '').replace(/^0+/, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

/** WhatsApp template variables cannot contain newlines/tabs or long runs of spaces. */
function cleanVar(value: string): string {
  const v = String(value ?? '').replace(/\s+/g, ' ').trim();
  return v || '-';
}

export async function sendMsg91WhatsApp(opts: {
  phone: string;
  /** Values for {{1}}, {{2}}, ... of the template body, in order. */
  bodyValues: string[];
  /** Template name. Defaults to MSG91_WHATSAPP_TEMPLATE (the reminder template). */
  template?: string;
}): Promise<void> {
  const templateName = opts.template || process.env.MSG91_WHATSAPP_TEMPLATE;

  if (!baseConfigured() || !templateName) {
    throw new Error(
      'MSG91 WhatsApp is not configured. Set MSG91_AUTH_KEY, MSG91_WHATSAPP_NUMBER, MSG91_WHATSAPP_NAMESPACE and a template name.'
    );
  }

  const to = toWhatsAppNumber(opts.phone);
  if (to.length < 11) {
    throw new Error('Patient does not have a valid mobile number.');
  }

  const components: Record<string, { type: 'text'; value: string }> = {};
  opts.bodyValues.forEach((v, i) => {
    components[`body_${i + 1}`] = { type: 'text', value: cleanVar(v) };
  });

  const payload = {
    integrated_number: (process.env.MSG91_WHATSAPP_NUMBER || '').replace(/\D/g, ''),
    content_type: 'template',
    payload: {
      messaging_product: 'whatsapp',
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: process.env.MSG91_WHATSAPP_LANGUAGE || 'en',
          policy: 'deterministic',
        },
        namespace: process.env.MSG91_WHATSAPP_NAMESPACE,
        to_and_components: [{ to: [to], components }],
      },
    },
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authkey: process.env.MSG91_AUTH_KEY as string,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });

  const text = await res.text();
  let body: { status?: string; hasError?: boolean; errors?: unknown; message?: string } = {};
  try {
    body = JSON.parse(text);
  } catch {
    // non-JSON response
  }

  const failed =
    !res.ok || body.hasError === true || (body.status && body.status.toLowerCase() === 'fail');
  if (failed) {
    throw new Error(`MSG91 WhatsApp failed (${res.status}): ${text.slice(0, 300)}`);
  }
}