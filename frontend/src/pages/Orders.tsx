import { Fragment, useState } from "react";
import { Order } from "../hooks/useWmsData";
import { useTable } from "../hooks/useTable";
import { formatDateTime } from "../utils/time";
import StatusBadge from "../components/StatusBadge";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import EmptyState from "../components/EmptyState";

const ORDER_TYPE_LABEL: Record<string, string> = { inbound: "入库", outbound: "出库" };

export default function OrdersPage({
  orders,
  loadLines,
  orderLines,
  materialName
}: {
  orders: Order[];
  loadLines: (orderId: number) => void;
  orderLines: Record<number, { id: number; material_id: number; qty: number; reserved_qty?: number; picked_qty?: number; packed_qty?: number }[]>;
  materialName: (id?: number | null) => string;
}) {
  const [typeFilter, setTypeFilter] = useState<"all" | "inbound" | "outbound">("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [visibleCols, setVisibleCols] = useLocalStorageState<Record<string, boolean>>("ord_cols", {
    order_no: true,
    order_type: true,
    status: true,
    partner: true,
    created_by: true,
    created_at: true,
    action: true
  });
  const [widths, setWidths] = useLocalStorageState<Record<string, number>>("ord_widths", {
    order_no: 1.3,
    order_type: 1,
    status: 1,
    partner: 1.2,
    created_by: 1,
    created_at: 1.2,
    action: 1
  });

  const filteredOrders = orders
    .filter((o) => (typeFilter === "all" ? true : o.order_type === typeFilter))
    .filter((o) => (statusFilter === "all" ? true : o.status === statusFilter))
    .filter((o) => (creatorFilter === "all" ? true : (o.created_by || "-") === creatorFilter));
  const table = useTable({
    rows: filteredOrders,
    filter: (row, q) => row.order_no.toLowerCase().includes(q) || (row.partner ?? "").toLowerCase().includes(q),
    stateKey: "ord"
  });
  const cols = [
    { key: "order_no", label: "单号" },
    { key: "order_type", label: "类型" },
    { key: "status", label: "状态" },
    { key: "partner", label: "伙伴" },
    { key: "created_by", label: "创建人" },
    { key: "created_at", label: "创建时间" },
    { key: "action", label: "操作" }
  ];
  const activeCols = cols.filter((c) => visibleCols[c.key] !== false);
  const template = activeCols.map((c) => `${widths[c.key] || 1}fr`).join(" ");

  return (
    <section className="card">
      <div className="title-row">
        <h2>订单管理</h2>
        <div className="row">
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value as "all" | "inbound" | "outbound"); table.reset(); }}>
            <option value="all">全部</option>
            <option value="inbound">入库</option>
            <option value="outbound">出库</option>
          </select>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); table.reset(); }}>
            <option value="all">状态: 全部</option>
            {[...new Set(orders.map((o) => o.status))].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={creatorFilter} onChange={(e) => { setCreatorFilter(e.target.value); table.reset(); }}>
            <option value="all">创建人: 全部</option>
            {[...new Set(orders.map((o) => o.created_by || "-"))].map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <button onClick={() => setShowSettings((v) => !v)}>{showSettings ? "隐藏列表设置" : "展开列表设置"}</button>
        </div>
      </div>

      {showSettings && (
      <div className="card">
        <h2>列表设置</h2>
        <div className="row">
          {cols.map((c) => (
            <label key={c.key} className="row">
              <input
                type="checkbox"
                checked={visibleCols[c.key] !== false}
                onChange={(e) => setVisibleCols({ ...visibleCols, [c.key]: e.target.checked })}
              />
              {c.label}
            </label>
          ))}
        </div>
        <div className="row">
          {activeCols.map((c) => (
            <label key={`w-${c.key}`} className="row">
              {c.label}宽度
              <input
                type="range"
                min={0.8}
                max={2.4}
                step={0.1}
                value={widths[c.key] || 1}
                onChange={(e) => setWidths({ ...widths, [c.key]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
      </div>
      )}

      <div className="toolbar">
        <input
          placeholder="搜索 单号 / 伙伴"
          value={table.query}
          onChange={(e) => { table.setQuery(e.target.value); table.reset(); }}
        />
        <div className="pager">
          <button onClick={table.prev} disabled={table.page <= 1}>上一页</button>
          <span>{table.page} / {table.pageCount} | {table.total} 条</span>
          <button onClick={table.next} disabled={table.page >= table.pageCount}>下一页</button>
        </div>
      </div>

      <div className="table">
        <div className="thead" style={{ gridTemplateColumns: template }}>
          {activeCols.map((c) => <span key={`h-${c.key}`}>{c.label}</span>)}
        </div>
        {table.pageItems.map((o) => (
          <Fragment key={o.id}>
            <div className="rowline" style={{ gridTemplateColumns: template }}>
              {visibleCols.order_no !== false && <span title={o.order_no}>{o.order_no}</span>}
              {visibleCols.order_type !== false && <span title={o.order_type}>{ORDER_TYPE_LABEL[o.order_type] || o.order_type}</span>}
              {visibleCols.status !== false && <span title={o.status}><StatusBadge value={o.status} /></span>}
              {visibleCols.partner !== false && <span title={o.partner ?? ""}>{o.partner ?? ""}</span>}
              {visibleCols.created_by !== false && <span title={o.created_by ?? "-"}>{o.created_by ?? "-"}</span>}
              {visibleCols.created_at !== false && <span title={o.created_at || "-"}>{o.created_at ? formatDateTime(o.created_at) : "-"}</span>}
              {visibleCols.action !== false && (
                <span className="row">
                  <button onClick={async () => {
                    if (!orderLines[o.id]) await loadLines(o.id);
                    setExpanded((prev) => ({ ...prev, [o.id]: !prev[o.id] }));
                  }}>{expanded[o.id] ? "收起明细" : "展开明细"}</button>
                </span>
              )}
            </div>
            {expanded[o.id] && (
              <div className="row-detail">
                <div className="detail-table">
                  <div className="detail-head">
                    <span>物料</span>
                    <span>需求数量</span>
                    <span>预留数量</span>
                    <span>已拣数量</span>
                    <span>已打包数量</span>
                  </div>
                  {(orderLines[o.id] || []).map((l) => (
                    <div key={l.id} className="detail-row">
                      <span>{(l as any).material_name || materialName(l.material_id)}</span>
                      <span>{l.qty}</span>
                      <span>{l.reserved_qty ?? 0}</span>
                      <span>{l.picked_qty ?? 0}</span>
                      <span>{l.packed_qty ?? 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Fragment>
        ))}
        {table.pageItems.length === 0 && <EmptyState title="暂无订单数据" subtitle="可在入库或出库页面创建订单" />}
      </div>
    </section>
  );
}
