import { useRef, useCallback, useEffect } from "react";
import Editor from "@monaco-editor/react";
import type { OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { getAllVariables, defaultVariableGroups } from "@/types/variables";
import type { VariableGroup } from "@/types/variables";
import { cn } from "@/lib/utils";
import { setupMonacoWorker } from "@/lib/monaco-worker";

interface MonacoVariableEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  variableGroups?: VariableGroup[];
  height?: string;
  className?: string;
}

export function MonacoVariableEditor({
  value = "",
  onChange,
  variableGroups = defaultVariableGroups,
  height = "400px",
  className,
}: MonacoVariableEditorProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const decorationIdsRef = useRef<string[]>([]);
  const allVariables = getAllVariables(variableGroups);

  useEffect(() => {
    void setupMonacoWorker();
  }, []);

  // Inject decoration styles
  useEffect(() => {
    const id = "variable-editor-styles";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      .var-hidden {
        font-size: 0 !important;
        opacity: 0 !important;
        display: inline-block !important;
        width: 0 !important;
      }
      .var-chip {
        background: linear-gradient(135deg, #dbeafe, #e0e7ff) !important;
        color: #3730a3 !important;
        border-radius: 6px !important;
        padding: 1px 10px !important;
        margin: 0 2px !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        border: 1px solid #a5b4fc !important;
        line-height: 20px !important;
        cursor: default !important;
        user-select: none !important;
        font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif !important;
        box-shadow: 0 1px 3px rgba(99, 102, 241, 0.15) !important;
      }
      .var-chip:hover {
        background: linear-gradient(135deg, #c7d2fe, #ddd6fe) !important;
        border-color: #818cf8 !important;
      }
      .var-after { font-size: 0 !important; }
    `;
    document.head.appendChild(style);
  }, []);

  const updateDecorations = useCallback(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;

    const text = model.getValue();
    const regex = /\{\{\s*(input\.\w+)\s*\}\}/g;
    const newDecorations: Monaco.editor.IModelDeltaDecoration[] = [];

    let match;
    while ((match = regex.exec(text)) !== null) {
      const startPos = model.getPositionAt(match.index);
      const endPos = model.getPositionAt(match.index + match[0].length);
      const variable = match[1];
      const item = allVariables.find((i) => i.value === variable);
      const label = item ? item.label : variable;

      newDecorations.push({
        range: new monaco.Range(
          startPos.lineNumber,
          startPos.column,
          endPos.lineNumber,
          endPos.column,
        ),
        options: {
          inlineClassName: "var-hidden",
          before: {
            content: `「${label}」`,
            inlineClassName: "var-chip",
          },
          after: { content: "\u200B", inlineClassName: "var-after" },
          hoverMessage: {
            value: item
              ? `**${item.label}**\n\n\`${item.value}\`\n\n${item.desc}`
              : `**${variable}**`,
          },
        },
      });
    }

    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, newDecorations);
  }, [allVariables]);

  const registerCompletionProvider = useCallback(
    (monaco: typeof Monaco) => {
      monaco.languages.registerCompletionItemProvider("plaintext", {
        triggerCharacters: ["{"],
        provideCompletionItems(model, position) {
          const lineContent = model.getLineContent(position.lineNumber);
          const textBeforeCursor = lineContent.substring(0, position.column - 1);

          const match = textBeforeCursor.match(/\{\{\s*(\w*)$/);
          if (!match) return { suggestions: [] };

          const openBraceIdx = textBeforeCursor.lastIndexOf("{{");
          const replaceRange = {
            startLineNumber: position.lineNumber,
            startColumn: openBraceIdx + 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          };

          const suggestions: Monaco.languages.CompletionItem[] = [];
          variableGroups.forEach((group) => {
            group.items.forEach((item) => {
              suggestions.push({
                label: item.label,
                kind: monaco.languages.CompletionItemKind.Variable,
                insertText: `{{ ${item.value} }}`,
                detail: `${group.name} · ${item.desc}`,
                documentation: `变量: {{ ${item.value} }}`,
                range: replaceRange,
                sortText: group.name + item.label,
                filterText: `${item.label} ${item.value}`,
              });
            });
          });

          return { suggestions };
        },
      });
    },
    [variableGroups],
  );

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      registerCompletionProvider(monaco);
      setTimeout(updateDecorations, 100);
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
        editor.trigger("keyboard", "editor.action.triggerSuggest", {});
      });
    },
    [registerCompletionProvider, updateDecorations],
  );

  const handleChange = useCallback(
    (newValue: string | undefined) => {
      setTimeout(updateDecorations, 50);
      onChange?.(newValue ?? "");
    },
    [updateDecorations, onChange],
  );

  return (
    <div className={cn("rounded-lg border border-border overflow-hidden shadow-sm", className)}>
      <Editor
        height={height}
        language="plaintext"
        theme="vs"
        value={value}
        onMount={handleMount}
        onChange={handleChange}
        options={{
          fontSize: 14,
          lineHeight: 28,
          minimap: { enabled: false },
          padding: { top: 16, bottom: 16 },
          scrollBeyondLastLine: false,
          wordWrap: "on",
          automaticLayout: true,
          suggest: {
            showIcons: true,
            showStatusBar: true,
            preview: true,
            previewMode: "prefix",
            shareSuggestSelections: false,
            showInlineDetails: true,
          },
          quickSuggestions: false,
          scrollbar: { verticalScrollbarSize: 8 },
        }}
      />
    </div>
  );
}
