// Edit a tenant's contact details.
//
// The email field is the one that matters and the one that needs a warning:
// it is the tenant's sign-in identity, not just a display value, so changing
// it changes how they get into their account. The update runs through the
// update-tenant edge function because RLS gives managers no write path to
// profiles, and auth.users is off-limits to every client.

import { useState } from 'react'
import { Loader2, X, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import ModalShell from '../shared/ModalShell'
import { formatPhone } from '@findstoop/shared/lib/format'
import type { Profile } from '@findstoop/shared/types/profile'

interface EditTenantModalProps {
  tenant: Profile
  onClose: () => void
  onSaved: (patch: { full_name: string; email: string; phone: string | null }) => void
}

interface ConflictInfo {
  id: string
  name: string | null
  created_at: string
  leases: number
  payments: number
}

const inputCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'

export default function EditTenantModal({ tenant, onClose, onSaved }: EditTenantModalProps) {
  const [fullName, setFullName] = useState(tenant.full_name ?? '')
  const [email, setEmail] = useState(tenant.email ?? '')
  const [phone, setPhone] = useState(tenant.phone ? formatPhone(tenant.phone) : '')
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState<ConflictInfo | null>(null)

  const emailChanged = email.trim().toLowerCase() !== (tenant.email ?? '').trim().toLowerCase()

  const save = async () => {
    if (!fullName.trim()) {
      toast.error('Name cannot be empty')
      return
    }
    setSaving(true)
    setConflict(null)
    const { data, error } = await supabase.functions.invoke('update-tenant', {
      body: {
        tenant_id: tenant.id,
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
      },
    })

    // Non-2xx comes back as a FunctionsHttpError with the body on
    // error.context — the 409 collision detail lives there, and it's the whole
    // point of the check, so dig it out rather than showing a bare "failed".
    if (error) {
      let payload: { message?: string; code?: string; conflict?: ConflictInfo } | null = null
      try {
        const ctx = (error as { context?: Response }).context
        if (ctx && typeof ctx.json === 'function') payload = await ctx.json()
      } catch { /* fall through to the generic message */ }
      setSaving(false)
      if (payload?.code === 'email_in_use' && payload.conflict) {
        setConflict(payload.conflict)
        return
      }
      toast.error(payload?.message ?? error.message ?? 'Could not save changes')
      return
    }

    setSaving(false)
    if (!data?.ok) {
      toast.error(data?.message ?? 'Could not save changes')
      return
    }

    onSaved({
      full_name: data.tenant?.full_name ?? fullName.trim(),
      email: data.tenant?.email ?? email.trim(),
      phone: data.tenant?.phone ?? null,
    })
    toast.success(data.email_changed ? 'Saved — sign-in address updated' : 'Saved')
    onClose()
  }

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-md" aria-label="Edit tenant">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 className="text-base font-semibold text-ink">Edit tenant</h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-mute hover:text-ink hover:bg-gray-100"
          aria-label="Close"
        >
          <X className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
        <div>
          <label htmlFor="edit-tenant-name" className="block text-sm font-medium text-ink mb-1">Full name</label>
          <input
            id="edit-tenant-name"
            className={inputCls}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="edit-tenant-email" className="block text-sm font-medium text-ink mb-1">Email</label>
          <input
            id="edit-tenant-email"
            type="email"
            autoComplete="off"
            className={inputCls}
            value={email}
            onChange={(e) => { setEmail(e.target.value); setConflict(null) }}
          />
          <p className="text-xs text-mute mt-1">
            This is how {fullName.trim() || 'they'} sign{fullName.trim() ? 's' : ''} in.
          </p>
        </div>

        {emailChanged && !conflict && (
          <div className="flex gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" strokeWidth={1.75} />
            <p className="text-xs text-amber-900 leading-relaxed">
              Changing the email moves their sign-in to the new address immediately. Their old
              address will stop working. Make sure the request came from the tenant.
            </p>
          </div>
        )}

        {conflict && (
          <div className="flex gap-2.5 bg-red-50 border border-red-200 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" strokeWidth={1.75} />
            <div className="text-xs text-red-900 leading-relaxed">
              <p className="font-medium">That address already belongs to another account.</p>
              <p className="mt-1">
                {conflict.name ?? 'Unnamed account'}, created{' '}
                {new Date(conflict.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                {' '}— {conflict.leases} lease{conflict.leases === 1 ? '' : 's'},{' '}
                {conflict.payments} payment{conflict.payments === 1 ? '' : 's'}.
              </p>
              <p className="mt-1.5">
                Most often this is the same person signing up again under a new address. Merging
                the two decides which history survives, so it isn't done automatically — reach out
                for help combining them.
              </p>
            </div>
          </div>
        )}

        <div>
          <label htmlFor="edit-tenant-phone" className="block text-sm font-medium text-ink mb-1">
            Phone <span className="font-normal text-mute">(optional)</span>
          </label>
          <input
            id="edit-tenant-phone"
            type="tel"
            className={inputCls}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(614) 555-0123"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-2 rounded-lg text-sm font-medium text-mute hover:text-ink hover:bg-gray-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-medium"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />}
          Save changes
        </button>
      </div>
    </ModalShell>
  )
}
