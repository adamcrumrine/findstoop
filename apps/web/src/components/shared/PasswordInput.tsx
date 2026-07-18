// Password field with a show/hide toggle — typing a masked password on a
// phone keyboard is error-prone enough that every serious mobile app offers
// the peek. The toggle is tabIndex={-1} so keyboard flow stays
// field → field → submit.

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>

export default function PasswordInput({ className = '', ...rest }: Props) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} className={`${className} pr-10`} {...rest} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        tabIndex={-1}
        className="absolute right-1 top-1/2 -translate-y-1/2 p-2 rounded-lg text-mute hover:text-ink"
      >
        {show ? <EyeOff className="w-4 h-4" strokeWidth={1.75} /> : <Eye className="w-4 h-4" strokeWidth={1.75} />}
      </button>
    </div>
  )
}
