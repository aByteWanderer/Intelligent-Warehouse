import { Fragment, useState } from "react";
import { api } from "../api";
import { Material, Location, Order } from "../hooks/useWmsData";
import { useTable } from "../hooks/useTable";
import { formatDateTime } from "../utils/time";
import FieldLabel from "../components/FieldLabel";
import FormModal from "../components/FormModal";
import Toast from "../components/Toast";
import { useToast } from "../hooks/useToast";
import StatusBadge from "../components/StatusBadge";
import WorkflowBar from "../components/WorkflowBar";
import EmptyState from "../components/EmptyState";

type Props = {
  materials: Material[];
  locations: Location[];
  orders: Order[];
  onRefresh: () => void;
  loadLines: (orderId: number) => void;
  orderLines: Record<number, { id: number; material_id: number; qty: number }[]>;
  materialName: (id?: number | null) => string;
  can: (perm: string) => boolean;
};

export default function InboundPage({ materials, locations, orders, onRefresh, loadLines, orderLines, materialName, can }: Props) {
  const [form, setForm] = useState({ order_no: "", supplier: "", location_id: 0, material_id: 0, qty: 1 });
  const [showCreate, setShowCreate] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<"all" | "CREATED" | "RECEIVED">("all");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const { toast, showToast } = useToast();

  const inboundOrders = orders.filter((o) => o.order_type === "inbound")
    .filter((o) => statusFilter === "all" ? true : o.status === statusFilter)
    .filter((o) => creatorFilter === "all" ? true : (o.created_by || "-") === creatorFilter);

  const table = useTable({
    rows: inboundOrders,
    filter: (row, q) => row.order_no.toLowerCase().includes(q) || (row.partner ?? "").toLowerCase().includes(q),
    stateKey: "inb"
  });

  return (
    <section className="card">
      <div className="title-row">
        <h2>入库记录</h2>
        {can("orders.write") && <button className="primary" onClick={() => setShowCreate(true)}>新建入库单</button>}
      </div>

      <Toast toast={toast} />

      {showCreate && (
        <FormModal title="新建入库单" onClose={() => setShowCreate(false)}>
          <div className="form">
            <FieldLabel text="入库单号" />
            <input value={form.order_no} onChange={(e) => setForm({ ...form, order_no: e.target.value })} />
            <FieldLabel text="供应商" />
            <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
            <FieldLabel text="目标库位" />
            <select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: Number(e.target.value) })}>
              <option value={0}>请选择</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}
            </select>
            <FieldLabel text="物料" />
            <select value={form.material_id} onChange={(e) => setForm({ ...form, material_id: Number(e.target.value) })}>
              <option value={0}>请选择</option>
              {materials.map((m) => <option key={m.id} value={m.id}>{m.sku}</option>)}
            </select>
            <FieldLabel text="数量" />
            <input type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })} />
            <button className="primary" onClick={async () => {
              const body = {
                order_no: form.order_no,
                supplier: form.supplier,
                location_id: form.location_id,
                lines: [{ material_id: form.material_id, qty: form.qty }]
              };
              try {
                await api.createInbound(body);
                await onRefresh();
                setForm({ order_no: "", supplier: "", location_id: 0, material_id: 0, qty: 1 });
                setShowCreate(false);
                showToast("success", "入库单创建成功");
              } catch (e) {
                showToast("error", (e as Error).message || "创建入库单失败");
              }
            }}>
              创建入库单
            </button>
          </div>
        </FormModal>
      )}

      <div className="toolbar">
        <div className="row">
          <input
            placeholder="搜索 单号 / 供应商"
            value={table.query}
            onChange={(e) => { table.setQuery(e.target.value); table.reset(); }}
          />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as "all" | "CREATED" | "RECEIVED"); table.reset(); }}>
            <option value="all">状态: 全部</option>
            <option value="CREATED">状态: 已创建</option>
            <option value="RECEIVED">状态: 已收货</option>
          </select>
          <select value={creatorFilter} onChange={(e) => { setCreatorFilter(e.target.value); table.reset(); }}>
            <option value="all">创建人: 全部</option>
            {[...new Set(orders.filter((o) => o.order_type === "inbound").map((o) => o.created_by || "-"))].map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
        <div className="pager">
          <button onClick={table.prev} disabled={table.page <= 1}>上一页</button>
          <span>{table.page} / {table.pageCount} | {table.total} 条</span>
          <button onClick={table.next} disabled={table.page >= table.pageCount}>下一页</button>
        </div>
      </div>

      <div className="table table-6">
        <div className="thead">
          <span>单号</span>
          <span>状态</span>
          <span>供应商</span>
          <span>操作人</span>
          <span>创建时间</span>
          <span>操作</span>
        </div>
        {table.pageItems.map((o) => (
          <Fragment key={o.id}>
            <div className="rowline">
              <span title={o.order_no}>{o.order_no}</span>
              <span title={o.status}><StatusBadge value={o.status} /></span>
              <span title={o.partner ?? "-"}>{o.partner ?? "-"}</span>
              <span title={o.created_by ?? "-"}>{o.created_by ?? "-"}</span>
              <span title={o.created_at || "-"}>{o.created_at ? formatDateTime(o.created_at) : "-"}</span>
              <span className="row">
                <WorkflowBar
                  steps={["已创建", "已收货"]}
                  current={o.status === "RECEIVED" ? "已收货" : "已创建"}
                  doneSet={new Set(o.status === "RECEIVED" ? ["已创建", "已收货"] : ["已创建"])}
                />
                {can("inbound.receive") && (
                  <button
                    disabled={o.status !== "CREATED"}
                    onClick={async () => {
                      try {
                        await api.receiveInbound(o.id);
                        await onRefresh();
                        showToast("success", "收货成功");
                      } catch (e) {
                        showToast("error", (e as Error).message || "收货失败");
                      }
                    }}
                  >
                    收货
                  </button>
                )}
                <button onClick={async () => {
                  if (!orderLines[o.id]) await loadLines(o.id);
                  setExpanded((prev) => ({ ...prev, [o.id]: !prev[o.id] }));
                }}>{expanded[o.id] ? "收起明细" : "展开明细"}</button>
              </span>
            </div>
            {expanded[o.id] && (
              <div className="row-detail">
                <div className="detail-table">
                  <div className="detail-head detail-2">
                    <span>物料</span>
                    <span>数量</span>
                  </div>
                  {(orderLines[o.id] || []).map((l) => (
                    <div key={l.id} className="detail-row detail-2">
                      <span>{(l as any).material_name || materialName(l.material_id)}</span>
                      <span>{l.qty}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Fragment>
        ))}
        {table.pageItems.length === 0 && <EmptyState title="暂无入库记录" subtitle="可先新建入库单后操作收货" />}
      </div>
    </section>
  );
}
