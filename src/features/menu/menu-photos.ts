import { useQuery } from '@tanstack/react-query'
import { client } from './menu-api'

const types = ['image/jpeg', 'image/png', 'image/webp']
export function validatePhoto(file: Pick<File, 'type' | 'size'>) {
  if (!types.includes(file.type)) throw new Error('Choose a JPG, PNG or WebP image')
  if (file.size > 15 * 1024 * 1024) throw new Error('Choose an image smaller than 15 MB')
  if (file.size === 0) throw new Error('This image file is empty')
}
// getRandomValues also works on the HTTP LAN URL used for phone reviews.
export function photoId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
export async function uploadPhoto(file: File, userId: string) {
  validatePhoto(file)
  const url = URL.createObjectURL(file)
  try {
    const image = new Image(); image.src = url; await image.decode()
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d'); if (!context) throw new Error('Could not prepare this image')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not prepare this image')), 'image/webp', 0.82))
    if (blob.size > 5 * 1024 * 1024) throw new Error('Prepared image exceeds 5 MB; choose a smaller image')
    const extension = blob.type === 'image/webp' ? 'webp' : 'png'
    const path = `${userId}/${photoId()}.${extension}`
    const { error } = await client().storage.from('menu-photos').upload(path, blob, { contentType: blob.type, upsert: false })
    if (error) throw new Error(error.message)
    return path
  } finally { URL.revokeObjectURL(url) }
}
export function usePhotoUrls(paths: (string | null)[]) {
  const unique = [...new Set(paths.filter((p): p is string => !!p))].sort()
  return useQuery({ queryKey: ['menu-photos', unique], enabled: unique.length > 0, staleTime: 8 * 60_000, refetchInterval: 8 * 60_000,
    queryFn: async () => {
      const { data, error } = await client().storage.from('menu-photos').createSignedUrls(unique, 600)
      if (error) throw new Error(error.message)
      const failed = data.find(item => item.error)
      if (failed) throw new Error(failed.error ?? 'Could not load a menu photo')
      return Object.fromEntries(data.map(item => [item.path!, item.signedUrl]))
    } })
}
