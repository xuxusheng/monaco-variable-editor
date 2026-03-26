import { z } from "zod"

export const scheduleTriggerConfigSchema = z.object({
  cron: z.string().min(1, "cron 表达式不能为空"),
  timezone: z.string().optional(),
})

export const webhookTriggerConfigSchema = z.object({
  secret: z.string().min(1, "Webhook secret 不能为空"),
})

export const triggerConfigSchema = z.union([
  scheduleTriggerConfigSchema,
  webhookTriggerConfigSchema,
])

export type TriggerConfig = z.infer<typeof triggerConfigSchema>
