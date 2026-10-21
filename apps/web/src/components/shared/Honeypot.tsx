// Honeypot — a form field people never see but naive bots fill in. A form
// that arrives with it filled is a bot: callers answer with a fake success
// and save nothing, so the bot learns nothing.
//
// Hidden off-screen (not display:none, which some bots skip), out of the tab
// order, hidden from screen readers, and named so password managers and
// autofill leave it alone.

interface Props {
  value: string
  onChange: (v: string) => void
}

export default function Honeypot({ value, onChange }: Props) {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
      <label>
        Website
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  )
}
