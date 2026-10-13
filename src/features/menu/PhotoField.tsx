import { useEffect, useState } from 'react'
import { ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { validatePhoto, usePhotoUrls } from './menu-photos'

export function MenuPhoto({ src, name }: { src?: string; name: string }) {
  const [failedSource, setFailedSource] = useState<string>()
  return <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-chip">{src && failedSource !== src ? <img src={src} alt={name} className="h-full w-full object-cover" loading="lazy" onError={() => setFailedSource(src)} /> : <ImageIcon aria-hidden="true" className="h-8 w-8 text-muted" />}</div>
}
export function PhotoField({ path, file, onChange, disabled }: { path: string | null; file: File | null; onChange: (file: File | null, path: string | null) => void; disabled: boolean }) {
  const urls = usePhotoUrls([path])
  const [preview, setPreview] = useState<string>()
  useEffect(() => {
    if (!file) { setPreview(undefined); return }
    const url = URL.createObjectURL(file); setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  return <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Photo (optional)</legend>
    {file || path ? <MenuPhoto key={preview ?? path} src={preview ?? (path ? urls.data?.[path] : undefined)} name="Menu photo preview" /> : null}
    <label className="block text-sm text-muted" htmlFor="menu-photo">JPG, PNG or WebP, up to 15 MB. Images are resized for phones.</label>
    <input id="menu-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} className="block min-h-11 w-full min-w-0 rounded-lg border bg-card p-2 text-sm file:mr-2 file:rounded-md file:border-0 file:bg-chip file:p-2 file:text-ink" onChange={event => {
      const next = event.target.files?.[0]; if (!next) return
      try { validatePhoto(next); onChange(next, path) } catch (error) { toast.error((error as Error).message); event.target.value = '' }
    }} />
    {file || path ? <Button variant="secondary" size="secondary" className="text-sm" disabled={disabled} onClick={() => onChange(null, null)}>Remove photo</Button> : null}
    {urls.error ? <p role="alert" className="text-sm text-brand-strong">{urls.error.message}</p> : null}
  </fieldset>
}
