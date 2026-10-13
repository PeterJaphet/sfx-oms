/* global self, URL */
// Read-only service-worker coordination. This never queues financial requests.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'SFX_APP_TABS' || !event.ports[0]) return
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const scope = new URL(self.registration.scope)
        const count = clients.filter((client) => {
          const url = new URL(client.url)
          return (
            url.origin === scope.origin &&
            url.pathname.startsWith(scope.pathname)
          )
        }).length
        event.ports[0].postMessage(count)
      }),
  )
})
