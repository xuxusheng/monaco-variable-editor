import loader from "@monaco-editor/loader";
import { initMonaco } from "./monaco-init";

let initialized = false;

export async function setupMonacoWorker(): Promise<void> {
  if (initialized) return;

  const monaco = await initMonaco();
  loader.config({ monaco });

  self.MonacoEnvironment = {
    getWorker: function (_workerId: string, _label: string) {
      return new Worker(new URL("monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url), {
        type: "module",
      });
    },
  };

  initialized = true;
}
