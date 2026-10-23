/**
 * MSG91 WhatsApp sender (official WhatsApp Business API via MSG91).
 *
 * Reminders are business-initiated messages, so WhatsApp only allows them as
 * pre-approved TEMPLATES. Create the template in MSG91 (see REMINDERS_SETUP.md),
 * then fill in the env vars below.
 *
 * Env:
 *   MSG91_AUTH_KEY            your MSG91 authkey
 *   MSG91_WHATSAPP_NUMBER     the WhatsApp number connected to MSG91, with country code (e.g. 917066747811)
 *   MSG91_WHATSAPP_TEMPLATE   approved template name
 *   MSG91_WHATSAPP_NAMESPACE  template namespace (shown in the MSG91 template details)
 *   MSG91_WHATSAPP_LANGUAGE   template language code, default "en"
 */

const ENDPOINT =
  'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/';

export function isMsg91Configured(): boolean {
  return Boolean(
    process.env.MSG91_AUTH_KEY &&
      process.env.MSG91_WHATSAPP_NUMBER &&
      process.env.MSG91_WHATSAPP_TEMPLATE &&
      process.env.MSG91_WHATSAPP_NAMESPACE
  );
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
}): Promise<void> {
  if (!isMsg91Configured()) {
    throw new Error(
      'MSG91 WhatsApp is not configured. Set MSG91_AUTH_KEY, MSG91_WHATSAPP_NUMBER, MSG91_WHATSAPP_TEMPLATE and MSG91_WHATSAPP_NAMESPACE.'
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
        name: process.env.MSG91_WHATSAPP_TEMPLATE,
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
