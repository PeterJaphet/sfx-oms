import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export function Sheet({ open, onOpenChange, title, description, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: ReactNode
}) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/50" />
      <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto border-l bg-ground p-4 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0"><Dialog.Title className="break-words font-heading text-2xl font-extrabold">{title}</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted">{description}</Dialog.Description></div>
          <Dialog.Close aria-label="Close" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-card"><X className="h-5 w-5" /></Dialog.Close>
        </div>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
