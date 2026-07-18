// Slim connectivity banner. Installed-PWA users regularly open the app with
// no signal; without this, dead taps and never-resolving skeletons are the
// only feedback. Pairs with useForegroundRefresh, which refetches page data
// when the browser fires `online`.

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { WifiOff } from 'lucide-react'

export default function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  useEffect(() => {
    const goOffline = () => setOnline(false)
    const goOnline = () => {
      setOnline(true)
      toast.success('Back online', { id: 'connectivity', duration: 2000 })
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  if (online) return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[90] bg-gray-900 text-white text-xs font-medium text-center flex items-center justify-center gap-1.5 pb-1.5"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.375rem)' }}
    >
      <WifiOff className="w-3.5 h-3.5" strokeWidth={2} />
      You're offline — changes won't save until you reconnect.
    </div>
  )
}
