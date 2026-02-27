import { useState } from "react";
import { Order } from "../hooks/useWmsData";
import { useTable } from "../hooks/useTable";

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

  const filteredOrders = orders.filter((o) => (typeFilter === "all" ? true : o.order_type === typeFilter));
  const table = useTable({
    rows: filteredOrders,
    filter: (row, q) => row.order_no.toLowerCase().includes(q) || (row.partner ?? "").toLowerCase().includes(q)
  });

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
        </div>
      </div>

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

      <div className="table table-5">
        <div className="thead">
          <span>单号</span>
          <span>类型</span>
          <span>状态</span>
          <span>伙伴</span>
          <span>操作</span>
        </div>
        {table.pageItems.map((o) => (
          <div key={o.id} className="rowline">
            <span>{o.order_no}</span>
            <span>{o.order_type}</span>
            <span>{o.status}</span>
            <span>{o.partner ?? ""}</span>
            <span className="row">
              <button onClick={() => loadLines(o.id)}>明细</button>
            </span>
            {orderLines[o.id] && (
              <div className="lines">
                {orderLines[o.id].map((l) => (
                  <div key={l.id}>
                    {(l as any).material_name || materialName(l.material_id)} | 需求 {l.qty} | 预留 {l.reserved_qty ?? 0} | 已拣 {l.picked_qty ?? 0} | 已打包 {l.packed_qty ?? 0}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
