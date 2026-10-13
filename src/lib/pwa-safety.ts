export function hasPendingConfirmation(
  storage: Pick<Storage, 'length' | 'key' | 'getItem'>,
) {
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (!key) continue
    if (/^sfx-(money|payment|debt|logistics|close)-v1:/.test(key)) {
      if (storage.getItem(key)) return true
    }
    if (key.startsWith('sfx-order-v1:')) {
      const raw = storage.getItem(key)
      if (raw && JSON.parse(raw).attempt) return true
    }
  }
  return false
}
export function updateBlockedReason(
  online: boolean,
  activeWrites: number,
  storage: Pick<Storage, 'length' | 'key' | 'getItem'>,
) {
  if (!online) return 'Reconnect before updating the app.'
  if (activeWrites > 0)
    return 'Wait for saving to finish before updating the app.'
  try {
    if (hasPendingConfirmation(storage))
      return 'Confirm your pending save using its Retry button before updating the app.'
  } catch {
    return 'Browser storage cannot be checked. Finish your work before closing or updating this tab.'
  }
  return null
}
