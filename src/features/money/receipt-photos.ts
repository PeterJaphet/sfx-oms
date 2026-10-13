import { assertOnline } from '@/lib/connectivity'
import { useQuery } from '@tanstack/react-query'
import { client } from '@/features/menu/menu-api'
import { photoId, validatePhoto } from '@/features/menu/menu-photos'

export async function uploadReceipt(
  file: File,
  userId: string,
  businessDate: string,
) {
  assertOnline()
  validatePhoto(file)
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const scale = Math.min(
      1,
      1600 / Math.max(image.naturalWidth, image.naturalHeight),
    )
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not prepare receipt image')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error('Could not prepare receipt image')),
        'image/jpeg',
        0.85,
      ),
    )
    if (blob.size > 5242880)
      throw new Error('Prepared receipt exceeds 5 MB; choose a smaller image')
    const path = `${userId}/${businessDate}/${photoId()}.jpg`
    const result = await client()
      .storage.from('receipts')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
    if (result.error) throw new Error(result.error.message)
    return path
  } finally {
    URL.revokeObjectURL(url)
  }
}
export function useReceipt(path: string | null) {
  return useQuery({
    queryKey: ['money', 'receipt', path],
    enabled: !!path,
    staleTime: 480000,
    refetchInterval: 480000,
    queryFn: async () => {
      const result = await client()
        .storage.from('receipts')
        .createSignedUrl(path!, 600)
      if (result.error) throw new Error(result.error.message)
      return result.data.signedUrl
    },
  })
}
