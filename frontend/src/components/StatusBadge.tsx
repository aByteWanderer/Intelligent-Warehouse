const LABELS: Record<string, string> = {
  ACTIVE: "启用",
  DISABLED: "停用",
  CREATED: "已创建",
  RECEIVED: "已收货",
  RESERVED: "已预留",
  PICKED: "已分拣",
  PACKED: "已打包",
  SHIPPED: "已出库",
  BOUND: "已绑定",
  UNBOUND: "未绑定"
};

const CLASS_MAP: Record<string, string> = {
  ACTIVE: "ok",
  RECEIVED: "ok",
  SHIPPED: "ok",
  RESERVED: "warn",
  PICKED: "warn",
  PACKED: "warn",
  CREATED: "info",
  BOUND: "info",
  UNBOUND: "muted",
  DISABLED: "danger"
};

export default function StatusBadge({ value }: { value?: string | null }) {
  const v = value || "-";
  const cls = CLASS_MAP[v] || "muted";
  return <span className={`status-badge ${cls}`}>{LABELS[v] || v}</span>;
}
