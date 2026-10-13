import { useSyncExternalStore } from 'react'
import { getActiveWrites, isOnline, subscribeConnection } from './connectivity'
export function useOnline() {
  return useSyncExternalStore(subscribeConnection, isOnline, () => true)
}
export function useActiveWrites() {
  return useSyncExternalStore(subscribeConnection, getActiveWrites, () => 0)
}
