/**
 * Lightweight 5-field cron next-fire calculator.
 *
 * Supports asterisk, specific values, ranges (e.g. 1-5),
 * steps (e.g. star-slash-10), and lists (e.g. 1,3,5).
 * Does NOT support special strings like @hourly.
 *
 * Returns the next Date >= from that matches the cron expression,
 * or null if the expression cannot be parsed.
 */
export function nextCronFire(expr: string, from: Date = new Date()): Date | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null

  const [minField, hourField, domField, monField, dowField] = parts

  const minuteSet = parseField(minField, 0, 59)
  const hourSet = parseField(hourField, 0, 23)
  const domSet = parseField(domField, 1, 31)
  const monSet = parseField(monField, 1, 12)
  const dowSet = parseField(dowField, 0, 6)

  if (!minuteSet || !hourSet || !domSet || !monSet || !dowSet) return null

  // Search forward minute-by-minute up to 4 years
  const cursor = new Date(from)
  cursor.setSeconds(0, 0)
  // Start from the next whole minute if `from` has seconds
  if (from.getSeconds() > 0) cursor.setMinutes(cursor.getMinutes() + 1)

  const limit = new Date(cursor.getTime() + 4 * 365 * 24 * 60 * 60 * 1000)

  while (cursor < limit) {
    if (
      monSet.has(cursor.getMonth() + 1) &&
      domSet.has(cursor.getDate()) &&
      dowSet.has(cursor.getDay()) &&
      hourSet.has(cursor.getHours()) &&
      minuteSet.has(cursor.getMinutes())
    ) {
      return new Date(cursor)
    }
    cursor.setMinutes(cursor.getMinutes() + 1)
  }

  return null
}

function parseField(field: string, min: number, max: number): Set<number> | null {
  const result = new Set<number>()
  for (const part of field.split(",")) {
    let step = 1
    let rangeStr = part

    // Handle step
    const slashIdx = part.indexOf("/")
    if (slashIdx !== -1) {
      rangeStr = part.slice(0, slashIdx)
      const stepStr = part.slice(slashIdx + 1)
      step = Number(stepStr)
      if (!Number.isFinite(step) || step < 1) return null
    }

    if (rangeStr === "*") {
      for (let i = min; i <= max; i += step) result.add(i)
    } else if (rangeStr.includes("-")) {
      const [a, b] = rangeStr.split("-").map(Number)
      if (!Number.isFinite(a) || !Number.isFinite(b) || a < min || b > max || a > b) return null
      for (let i = a; i <= b; i += step) result.add(i)
    } else {
      const val = Number(rangeStr)
      if (!Number.isFinite(val) || val < min || val > max) return null
      if (step === 1) {
        result.add(val)
      } else {
        for (let i = val; i <= max; i += step) result.add(i)
      }
    }
  }
  return result
}
