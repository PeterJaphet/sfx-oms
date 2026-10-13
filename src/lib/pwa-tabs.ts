export function countAppTabs(worker: Pick<ServiceWorker, 'postMessage'>) {
  return new Promise<number>((resolve, reject) => {
    const channel = new MessageChannel()
    const cleanup = () => {
      clearTimeout(timer)
      channel.port1.close()
      channel.port2.close()
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Could not check open app tabs. Try updating again.'))
    }, 3000)
    channel.port1.onmessage = (event) => {
      const count: unknown = event.data
      cleanup()
      if (typeof count === 'number' && Number.isInteger(count) && count > 0)
        resolve(count)
      else
        reject(new Error('Could not check open app tabs. Try updating again.'))
    }
    try {
      worker.postMessage({ type: 'SFX_APP_TABS' }, [channel.port2])
    } catch (e) {
      cleanup()
      reject(e)
    }
  })
}
