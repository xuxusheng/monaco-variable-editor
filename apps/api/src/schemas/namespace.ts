import { z } from "zod"

export const createNamespaceSchema = z.object({
  name: z.string().min(1, "空间名称不能为空").max(64, "空间名称不超过 64 个字符"),
  kestraNamespace: z.string().min(1).max(64),
  description: z.string().optional(),
})
