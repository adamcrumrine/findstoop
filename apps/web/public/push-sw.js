// Web-push handlers, imported into the generated Workbox service worker via
// VitePWA's workbox.importScripts. Kept as a tiny standalone script so we can
// stay on the generateSW strategy (no custom sw build).
//
// Payload contract (JSON): { title, body, url?, tag? }
// url is an app path ("/tenant/pay-rent") the notification click opens,
// focusing an existing tab when one is already there.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Notification', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Update'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || undefined,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        // Same-origin tab already open → focus and navigate it.
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client && new URL(client.url).pathname !== url) {
            client.navigate(url)
          }
          return
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
