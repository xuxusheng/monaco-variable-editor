/**
 * trigger-yaml.ts — Build Kestra trigger wrapper YAML
 *
 * Takes a base workflow YAML and wraps it with a schedule or webhook trigger.
 */

import { parse as parseYaml, stringify } from "yaml"

export interface BuildTriggerFlowOpts {
  namespace: string
  flowId: string
  baseYaml: string
  triggerType: "schedule" | "webhook"
  triggerConfig: Record<string, unknown>
}

export function buildTriggerFlowYaml(opts: BuildTriggerFlowOpts): string {
  const { namespace, flowId, baseYaml, triggerType, triggerConfig } = opts

  if (triggerType === "schedule") {
    if (!triggerConfig.cron || typeof triggerConfig.cron !== "string") {
      throw new Error("cron expression is required for schedule triggers")
    }
  }

  // Parse base YAML and strip keys we'll override
  const parsed = parseYaml(baseYaml) as Record<string, unknown>
  delete parsed.id
  delete parsed.namespace
  delete parsed.triggers

  // Build trigger block
  let trigger: Record<string, unknown>
  if (triggerType === "schedule") {
    trigger = {
      id: "schedule",
      type: "io.kestra.plugin.core.trigger.Schedule",
      cron: triggerConfig.cron as string,
      timezone: triggerConfig.timezone as string,
    }
  } else {
    trigger = {
      id: "webhook",
      type: "io.kestra.plugin.core.trigger.Webhook",
      key: triggerConfig.secret as string,
    }
  }

  const flow: Record<string, unknown> = {
    id: flowId,
    namespace,
    ...parsed,
    triggers: [trigger],
  }

  const comment =
    "# Auto-generated trigger wrapper — DO NOT EDIT\n# Managed by Weave trigger management"

  return `${comment}\n\n${stringify(flow)}`
}
