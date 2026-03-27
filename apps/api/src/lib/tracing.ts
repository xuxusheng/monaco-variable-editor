import { trace, context, propagation, type Span } from "@opentelemetry/api"
import { NodeSDK } from "@opentelemetry/sdk-node"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions"
import { W3CTraceContextPropagator } from "@opentelemetry/core"

let initialized = false

export function initTracing(): void {
  if (initialized) return

  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318"
  const otlpHeaders = process.env.OTEL_EXPORTER_OTLP_HEADERS

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "weave-api",
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? "0.1.0",
    "deployment.environment": process.env.NODE_ENV ?? "development",
  })

  const headers: Record<string, string> = {}
  if (otlpHeaders) {
    // 支持标准 OTEL 格式: key1=value1,key2=value2
    for (const pair of otlpHeaders.split(",")) {
      const [key, value] = pair.split("=", 2)
      if (key && value) {
        headers[key.trim()] = value.trim()
      }
    }
  }

  const traceExporter = new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
    headers,
  })

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    textMapPropagator: new W3CTraceContextPropagator(),
  })

  sdk.start()
  initialized = true
}

const tracer = trace.getTracer("weave-api")

export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span)
      return result
    } finally {
      span.end()
    }
  })
}

export { trace, context, propagation, type Span }
