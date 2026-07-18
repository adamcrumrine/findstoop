// Viewport-aware toast host. On phones, toasts render bottom-center just
// above the fixed tab bar (the thumb zone, and clear of the notch); on
// desktop they keep the original top-right placement.

import { useEffect, useState } from 'react'
import { Toaster } from 'react-hot-toast'

const MOBILE_QUERY = '(max-width: 639px)'

export default function AppToaster() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY).matches : false,
  )

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return mobile ? (
    <Toaster
      position="bottom-center"
      containerStyle={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }}
    />
  ) : (
    <Toaster position="top-right" />
  )
}
