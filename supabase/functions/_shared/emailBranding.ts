// Landlord white-label branding for tenant-facing transactional email.
//
// When a landlord has set profiles.company_name (and optionally
// company_logo_url / brand_color — see migration 20260701000001), emails sent
// to their tenants present as coming from the landlord's company, with
// "via FindStoop" attribution always preserved. Landlords without a company
// name keep the stock FindStoop presentation exactly as before.
//
// Everything still sends from the same RESEND_FROM address — only the
// RFC 5322 display name changes. No new env vars, services, or DNS setup.

/** Default accent — the FindStoop teal used across all email templates. */
export const DEFAULT_ACCENT = '#00A896'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Normalize a landlord's company name for display: trim, collapse whitespace,
 * and strip characters that would break an RFC 5322 display name or allow
 * header injection (double quotes, angle brackets, backslashes, control
 * characters including CR/LF). Returns null when there's no usable name, so
 * callers can fall back to the stock FindStoop presentation.
 */
export function companyDisplayName(companyName: string | null | undefined): string | null {
  if (!companyName) return null
  const cleaned = companyName
    .replace(/["<>\\\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length > 0 ? cleaned : null
}

/**
 * From header for Resend. With a company name:
 *   "Hawk Investments via FindStoop" <noreply@findstoop.com>
 * (quoted, so legal-entity punctuation like "Hawk Investments, LLC" can't
 * break the header). Without one, exactly today's presentation:
 *   FindStoop <noreply@findstoop.com>
 */
export function emailFrom(companyName: string | null | undefined, fromAddress: string): string {
  const name = companyDisplayName(companyName)
  if (!name) return `FindStoop <${fromAddress}>`
  return `"${name} via FindStoop" <${fromAddress}>`
}

/**
 * Muted attribution footer:
 *   Sent by Hawk Investments via FindStoop
 * (or just "Sent via FindStoop" when no company). Keeps the platform brand
 * visible on white-labeled emails.
 */
export function emailFooterHtml(companyName?: string | null): string {
  const name = companyDisplayName(companyName)
  const line = name
    ? `Sent by ${escapeHtml(name)} via <a href="https://findstoop.com" style="color:#00A896;text-decoration:none">FindStoop</a>`
    : `Sent via <a href="https://findstoop.com" style="color:#00A896;text-decoration:none">FindStoop</a>`
  return `<p style="margin-top:24px;color:#8E8E93;font-size:12px;line-height:1.5;text-align:center">${line}</p>`
}

/**
 * Safe accent color for header bars / buttons: the landlord's brand_color if
 * it's a valid 6-digit hex (matches the DB CHECK constraint), else the
 * default FindStoop teal.
 */
export function brandAccent(brandColor: string | null | undefined): string {
  return brandColor && /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : DEFAULT_ACCENT
}

/**
 * Email header bar. With no company name this renders the exact FindStoop
 * wordmark header already used across all templates; with a company name it
 * shows the landlord's logo (https URLs only) or their company name in the
 * brand accent color.
 */
export function emailHeaderHtml(
  companyName?: string | null,
  companyLogoUrl?: string | null,
  brandColor?: string | null,
): string {
  const name = companyDisplayName(companyName)
  const accent = brandAccent(brandColor)
  const mark = !name
    ? `<span style="font-size:24px;font-weight:700;color:${DEFAULT_ACCENT};letter-spacing:-0.02em">FindStoop</span>`
    : companyLogoUrl && /^https:\/\/\S+$/.test(companyLogoUrl)
      ? `<img src="${escapeHtml(companyLogoUrl)}" alt="${escapeHtml(name)}" style="max-height:40px;max-width:220px" />`
      : `<span style="font-size:24px;font-weight:700;color:${accent};letter-spacing:-0.02em">${escapeHtml(name)}</span>`
  return `
        <div style="text-align:center;padding:24px 0;border-bottom:1px solid #eee;margin-bottom:24px">
          ${mark}
        </div>`
}
