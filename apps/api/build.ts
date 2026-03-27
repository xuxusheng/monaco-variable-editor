import { bunPluginPino } from "bun-plugin-pino"

const result = await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir: "dist",
  target: "bun",
  plugins: [bunPluginPino()],
})

if (!result.success) {
  console.error("Build failed:")
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

console.log("Build succeeded!")
