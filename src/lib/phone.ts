export function isStaffPhone(value: string): boolean {
  return /^\+?[\d\s()-]+$/.test(value.trim()) && /^\d{7,15}$/.test(value.replace(/\D/g, ''))
}

export function staffEmail(phone: string): string {
  if (!isStaffPhone(phone)) throw new Error('Enter a phone number with its country code')
  return `${phone.replace(/\D/g, '')}@staff.sfxburger.app`
}
