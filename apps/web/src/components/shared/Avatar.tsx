interface Props {
  url?: string | null
  name?: string | null
  email?: string | null
  size?: number          // px; defaults to 40
  className?: string     // extra classes for the wrapper (e.g., border colors)
}

// Single avatar component used across both portals. Renders the uploaded
// image if present; otherwise falls back to first + last initials drawn on a
// brand-colored circle. If we only have one word (or only an email), we use
// the first one or two letters.
export default function Avatar({ url, name, email, size = 40, className = '' }: Props) {
  const dim = `${size}px`
  if (url) {
    return (
      <img
        src={url}
        alt={name ?? email ?? 'Avatar'}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: dim, height: dim }}
      />
    )
  }
  const initials = initialsFrom(name, email)
  return (
    <div
      className={`rounded-full bg-brand-100 text-brand-700 inline-flex items-center justify-center font-bold shrink-0 select-none ${className}`}
      style={{ width: dim, height: dim, fontSize: Math.max(size * 0.38, 11) }}
      aria-label={name ?? email ?? 'Avatar'}
    >
      {initials || '?'}
    </div>
  )
}

export function initialsFrom(name?: string | null, email?: string | null): string {
  const source = (name && name.trim()) || (email && email.split('@')[0]) || ''
  if (!source) return ''
  // Strip punctuation, split on spaces/hyphens/underscores/dots.
  const parts = source.split(/[\s\-_.]+/).filter(Boolean)
  if (parts.length === 0) return source.slice(0, 2).toUpperCase()
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
