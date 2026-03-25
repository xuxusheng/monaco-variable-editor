import { CronExpressionParser } from "cron-parser"

export function nextCronFire(expr: string, from: Date = new Date()): Date | null {
  try {
    const interval = CronExpressionParser.parse(expr, {
      currentDate: from,
    })
    return interval.next().toDate()
  } catch {
    return null
  }
}

export function nextCronFires(
  expr: string,
  count: number,
  from: Date = new Date(),
): Date[] {
  try {
    const interval = CronExpressionParser.parse(expr, {
      currentDate: from,
    })
    const dates: Date[] = []
    for (let i = 0; i < count; i++) {
      dates.push(interval.next().toDate())
    }
    return dates
  } catch {
    return []
  }
}
