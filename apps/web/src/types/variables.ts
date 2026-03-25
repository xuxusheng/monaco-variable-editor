export interface VariableItem {
  label: string;
  value: string;
  desc: string;
  icon?: string;
}

export interface VariableGroup {
  name: string;
  items: VariableItem[];
}

export const defaultVariableGroups: VariableGroup[] = [
  {
    name: "用户信息",
    items: [
      { label: "用户名", value: "input.userName", desc: "用户的登录名", icon: "👤" },
      { label: "邮箱", value: "input.email", desc: "用户邮箱地址", icon: "📧" },
      { label: "手机号", value: "input.phone", desc: "用户手机号码", icon: "📱" },
      { label: "用户ID", value: "input.userId", desc: "用户唯一标识", icon: "🆔" },
    ],
  },
  {
    name: "订单信息",
    items: [
      { label: "订单号", value: "input.orderId", desc: "当前订单编号", icon: "📦" },
      { label: "商品名称", value: "input.productName", desc: "商品名称", icon: "🏷️" },
      { label: "金额", value: "input.amount", desc: "订单金额（元）", icon: "💰" },
      { label: "地址", value: "input.address", desc: "收货地址", icon: "📍" },
    ],
  },
  {
    name: "公司信息",
    items: [
      { label: "公司名称", value: "input.companyName", desc: "所属公司", icon: "🏢" },
      { label: "部门", value: "input.department", desc: "所属部门", icon: "🏛️" },
      { label: "时间戳", value: "input.timestamp", desc: "操作时间", icon: "🕐" },
    ],
  },
];

export function getAllVariables(groups: VariableGroup[]): VariableItem[] {
  return groups.flatMap((g) => g.items);
}

export function parseVariables(
  text: string,
): Array<{ raw: string; variable: string; start: number; end: number }> {
  const regex = /\{\{\s*(input\.\w+)\s*\}\}/g;
  const results: Array<{ raw: string; variable: string; start: number; end: number }> = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    results.push({
      raw: match[0],
      variable: match[1],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return results;
}
