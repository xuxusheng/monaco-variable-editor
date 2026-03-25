import slugify from "@sindresorhus/slugify"

export function nameToSlug(name: string): string {
  return slugify(name) || "task"
}

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
