import { z } from 'zod'

export const extraQuantitySchema = z.object({ addon_id: z.string(), quantity: z.number().int().min(1).max(999) })
export const extraSelectionSchema = extraQuantitySchema.extend({ quantity: z.number().int('Enter a whole number').min(0, 'Use 0 to remove an extra').max(999, 'Use at most 999') })
export const extraSnapshotSchema = z.object({ name: z.string(), price: z.number(), quantity: z.number().int().min(1).max(999).optional() })
export function extraText(extras: z.infer<typeof extraSnapshotSchema>[], dishQuantity: number) {
  return extras.map(extra => {
    // Older snapshots selected one of each extra for every dish.
    const quantity = extra.quantity ?? dishQuantity
    return quantity > 1 ? `${quantity} × ${extra.name}` : extra.name
  }).join(', ')
}
