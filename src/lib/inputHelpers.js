// ─── Shared Input Helpers ─────────────────────────────────────────────────────
// Formatting, arrow-key handling, and commit animation for all input components.

/**
 * Format a numeric string with commas while the user is typing.
 * Preserves decimals and negative signs. Skips formatting for decimal-mode inputs.
 */
export function formatWhileEditing(raw, isDecimal = false) {
  if (!raw && raw !== '0') return ''
  const str = String(raw)

  // For decimal/percentage inputs, just clean non-numeric except . and -
  if (isDecimal) return str.replace(/[^0-9.\-]/g, '')

  // Strip everything except digits, commas, dots, minus
  let cleaned = str.replace(/[^0-9,.\-]/g, '')

  // Remove existing commas before re-inserting
  cleaned = cleaned.replace(/,/g, '')

  // Split on decimal point
  const parts = cleaned.split('.')
  const intPart = parts[0] || ''
  const decPart = parts.length > 1 ? '.' + parts[1] : ''

  // Insert commas into integer part
  const negative = intPart.startsWith('-')
  const digits = negative ? intPart.slice(1) : intPart
  const withCommas = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  return (negative ? '-' : '') + withCommas + decPart
}

/**
 * Parse a formatted string back to a number.
 */
export function parseFormatted(str) {
  if (!str && str !== '0') return NaN
  return parseFloat(String(str).replace(/,/g, ''))
}

/**
 * Handle arrow key increment/decrement on a numeric input.
 * Call this from onKeyDown. Returns true if the event was handled.
 */
export function handleArrowKeys(e, { value, step = 1, min, max, onChange }) {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return false

  e.preventDefault()
  const multiplier = e.shiftKey ? 10 : 1
  const delta = e.key === 'ArrowUp' ? step * multiplier : -step * multiplier
  let next = (value ?? 0) + delta

  // Round to avoid floating point drift
  const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 0
  next = parseFloat(next.toFixed(decimals))

  if (min !== undefined) next = Math.max(min, next)
  if (max !== undefined) next = Math.min(max, next)

  onChange(next)
  return true
}

/**
 * Flash a brief green highlight on an input to confirm value was saved.
 * Pass the input DOM element ref. Safe to call with null.
 */
export function flashCommit(el) {
  if (!el) return
  el.classList.remove('input-committed')
  void el.offsetWidth // force reflow
  el.classList.add('input-committed')
}
