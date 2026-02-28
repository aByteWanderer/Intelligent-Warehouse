import { Fragment, useState } from "react";
import { Order } from "../hooks/useWmsData";
import { useTable } from "../hooks/useTable";
import { formatDateTime } from "../utils/time";

const ORDER_TYPE_LABEL: Record<string, string> = { inbound: "入库", outbound: "出库" };
const ORDER_STATUS_LABEL: Record<string, string> = {
  CREATED: "已创建",
  RECEIVED: "已收货",
  RESERVED: "已预留",
  PICKED: "已分拣",
  PACKED: "已打包",
  SHIPPED: "已出库"
};

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
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

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

      <div className="table table-7">
        <div className="thead">
          <span>单号</span>
          <span>类型</span>
          <span>状态</span>
          <span>伙伴</span>
          <span>创建人</span>
          <span>创建时间</span>
          <span>操作</span>
        </div>
        {table.pageItems.map((o) => (
          <Fragment key={o.id}>
            <div className="rowline">
              <span title={o.order_no}>{o.order_no}</span>
              <span title={o.order_type}>{ORDER_TYPE_LABEL[o.order_type] || o.order_type}</span>
              <span title={o.status}>{ORDER_STATUS_LABEL[o.status] || o.status}</span>
              <span title={o.partner ?? ""}>{o.partner ?? ""}</span>
              <span title={o.created_by ?? "-"}>{o.created_by ?? "-"}</span>
              <span title={o.created_at || "-"}>{o.created_at ? formatDateTime(o.created_at) : "-"}</span>
              <span className="row">
                <button onClick={async () => {
                  if (!orderLines[o.id]) await loadLines(o.id);
                  setExpanded((prev) => ({ ...prev, [o.id]: !prev[o.id] }));
                }}>{expanded[o.id] ? "收起明细" : "展开明细"}</button>
              </span>
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
      </div>
    </section>
  );
}
