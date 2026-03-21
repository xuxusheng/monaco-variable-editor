/**
 * slug.ts — 中文名 → URL-safe slug 转换
 * 用于 Kestra YAML 的 task id 生成
 */

/** 中文名 → slug */
export function nameToSlug(name: string): string {
  return (
    name
      .replace(/[^\w\u4e00-\u9fff\u3400-\u4dbf-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "task"
  )
}

/** 带防碰撞的 slug 生成（用于批量生成时保证唯一） */
export function uniqueSlug(name: string, existingSlugs: Set<string>): string {
  let slug = nameToSlug(name)
  let final = slug
  let counter = 1
  while (existingSlugs.has(final)) {
    final = `${slug}-${counter++}`
  }
  existingSlugs.add(final)
  return final
}
