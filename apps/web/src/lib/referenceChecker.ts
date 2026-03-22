/**
 * referenceChecker — 检测 YAML 中的变量/密钥/输入引用是否有效
 *
 * 支持的引用格式：
 *   {{ secret('xxx') }}
 *   {{ vars.xxx }}
 *   {{ inputs.xxx }}
 */

export type ReferenceType = "secret" | "variable" | "input"

export interface MissingReference {
  type: ReferenceType
  name: string
  /** YAML 行号（仅 checkReferences 提供） */
  line?: number
}

export interface ReferenceCheckResult {
  missing: MissingReference[]
}

// 匹配 {{ secret('xxx') }} 或 {{ secret("xxx") }}
const SECRET_RE = /\{\{\s*secret\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\}\}/g

// 匹配 {{ vars.xxx }}，允许任意字符作为变量名
const VAR_RE = /\{\{\s*vars\.(\w+)\s*\}\}/g

// 匹配 {{ inputs.xxx }}，允许任意字符作为输入名
const INPUT_RE = /\{\{\s*inputs\.(\w+)\s*\}\}/g

function getLineNumber(yaml: string, index: number): number {
  let line = 1
  for (let i = 0; i < index; i++) {
    if (yaml[i] === "\n") line++
  }
  return line
}

export function checkReferences(
  yaml: string,
  existing: {
    secrets: string[]
    variables: string[]
    inputs: string[]
  },
): ReferenceCheckResult {
  const missing: MissingReference[] = []

  // Secret 引用
  for (const match of yaml.matchAll(SECRET_RE)) {
    const name = match[1]
    if (!existing.secrets.includes(name)) {
      missing.push({ type: "secret", name, line: getLineNumber(yaml, match.index) })
    }
  }

  // Variable 引用
  for (const match of yaml.matchAll(VAR_RE)) {
    const name = match[1]
    if (!existing.variables.includes(name)) {
      missing.push({ type: "variable", name, line: getLineNumber(yaml, match.index) })
    }
  }

  // Input 引用
  for (const match of yaml.matchAll(INPUT_RE)) {
    const name = match[1]
    if (!existing.inputs.includes(name)) {
      missing.push({ type: "input", name, line: getLineNumber(yaml, match.index) })
    }
  }

  return { missing }
}

/**
 * 检查节点 spec 中的引用是否有效
 * @param spec 节点的 spec 对象
 * @param existing 已有的 secrets/variables/inputs
 * @returns 缺失的引用列表（无 line 字段）
 */
export function checkNodeReferences(
  spec: Record<string, unknown>,
  existing: {
    secrets: string[]
    variables: string[]
    inputs: string[]
  },
): MissingReference[] {
  // 将 spec 递归转为字符串
  const text = JSON.stringify(spec)
  const missing: MissingReference[] = []

  for (const match of text.matchAll(SECRET_RE)) {
    if (!existing.secrets.includes(match[1])) {
      missing.push({ type: "secret", name: match[1] })
    }
  }
  for (const match of text.matchAll(VAR_RE)) {
    if (!existing.variables.includes(match[1])) {
      missing.push({ type: "variable", name: match[1] })
    }
  }
  for (const match of text.matchAll(INPUT_RE)) {
    if (!existing.inputs.includes(match[1])) {
      missing.push({ type: "input", name: match[1] })
    }
  }

  return missing
}

/** 从 YAML 字符串中提取所有被引用的 secret/variable/input 名称（不检查是否存在） */
export function extractAllReferences(yaml: string): {
  secrets: Set<string>
  variables: Set<string>
  inputs: Set<string>
} {
  const secrets = new Set<string>()
  const variables = new Set<string>()
  const inputs = new Set<string>()

  for (const match of yaml.matchAll(SECRET_RE)) {
    secrets.add(match[1])
  }
  for (const match of yaml.matchAll(VAR_RE)) {
    variables.add(match[1])
  }
  for (const match of yaml.matchAll(INPUT_RE)) {
    inputs.add(match[1])
  }

  return { secrets, variables, inputs }
}
