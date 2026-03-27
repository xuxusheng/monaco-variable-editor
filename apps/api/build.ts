import type { BunPlugin } from "bun"
import { bunPluginPino } from "bun-plugin-pino"

// Fix: Bun resolves @kestra-io/kestra-sdk to .d.ts instead of .mjs
// Intercept the load of KestraClient.d.ts and redirect to .mjs
const kestraSdkFix: BunPlugin = {
  name: "kestra-sdk-fix",
  setup(build) {
    build.onLoad({ filter: /KestraClient\.d\.ts$/ }, async (args) => {
      const mjsPath = args.path.replace(/\.d\.ts$/, ".mjs")
      const file = await Bun.file(mjsPath).text()
      return { contents: file, loader: "js" }
    })
  },
}

const result = await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir: "dist",
  target: "bun",
  packages: "bundle",
  plugins: [kestraSdkFix, bunPluginPino()],
})

if (!result.success) {
  console.error("Build failed:")
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

console.log("Build succeeded!")
