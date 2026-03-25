let monacoInstance: typeof import("monaco-editor") | null = null;
let initPromise: Promise<typeof import("monaco-editor")> | null = null;

export async function initMonaco(): Promise<typeof import("monaco-editor")> {
  if (monacoInstance) return monacoInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const monaco = await import("monaco-editor/esm/vs/editor/editor.api.js");
    await import("monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js");
    monacoInstance = monaco as unknown as typeof import("monaco-editor");
    return monacoInstance;
  })();

  return initPromise;
}
