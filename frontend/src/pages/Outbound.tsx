import { Fragment, useMemo, useState } from "react";
import { api } from "../api";
import { Material, Location, Order } from "../hooks/useWmsData";
import { useTable } from "../hooks/useTable";
import { formatDateTime } from "../utils/time";
import FieldLabel from "../components/FieldLabel";
import FormModal from "../components/FormModal";
import Toast from "../components/Toast";
import { useToast } from "../hooks/useToast";

type Props = {
  materials: Material[];
  locations: Location[];
  orders: Order[];
  onRefresh: () => void;
  loadLines: (orderId: number) => void;
  orderLines: Record<number, { id: number; material_id: number; qty: number; reserved_qty: number; picked_qty: number; packed_qty: number }[]>;
  materialName: (id?: number | null) => string;
  can: (perm: string) => boolean;
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  CREATED: "已创建",
  RESERVED: "已预留",
  PICKED: "已分拣",
  PACKED: "已打包",
  SHIPPED: "已出库"
};

export default function OutboundPage({ materials, locations, orders, onRefresh, loadLines, orderLines, materialName, can }: Props) {
  const [form, setForm] = useState({ order_no: "", customer: "", source_location_id: 0, staging_location_id: 0, material_id: 0, qty: 1 });
  const [showCreate, setShowCreate] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const { toast, showToast } = useToast();

  const outboundOrders = useMemo(() => orders.filter((o) => o.order_type === "outbound"), [orders]);
  const defaultStagingId = form.staging_location_id || locations.find((l) => l.code === "STAGE")?.id || locations[0]?.id || 0;

  const table = useTable({
    rows: outboundOrders,
    filter: (row, q) => row.order_no.toLowerCase().includes(q) || (row.partner ?? "").toLowerCase().includes(q)
  });

  function nextAction(status: string) {
    if (status === "CREATED") return "预留";
    if (status === "RESERVED") return "分拣";
    if (status === "PICKED") return "打包";
    if (status === "PACKED") return "出库";
    if (status === "SHIPPED") return "完成";
    return "待处理";
  }

  return (
    <section className="card">
      <div className="title-row">
        <h2>出库记录</h2>
        {can("orders.write") && <button className="primary" onClick={() => setShowCreate(true)}>新建出库单</button>}
      </div>

      <Toast toast={toast} />

      {showCreate && (
        <FormModal title="新建出库单" onClose={() => setShowCreate(false)}>
          <div className="form">
            <FieldLabel text="出库单号" />
            <input value={form.order_no} onChange={(e) => setForm({ ...form, order_no: e.target.value })} />
            <FieldLabel text="客户" />
            <input value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} />
            <FieldLabel text="拣货库位" />
            <select value={form.source_location_id} onChange={(e) => setForm({ ...form, source_location_id: Number(e.target.value) })}>
              <option value={0}>请选择</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}
            </select>
            <FieldLabel text="暂存库位" />
            <select value={form.staging_location_id} onChange={(e) => setForm({ ...form, staging_location_id: Number(e.target.value) })}>
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
                customer: form.customer,
                source_location_id: form.source_location_id,
                staging_location_id: form.staging_location_id || null,
                lines: [{ material_id: form.material_id, qty: form.qty }]
              };
              try {
                await api.createOutbound(body);
                await onRefresh();
                setForm({ order_no: "", customer: "", source_location_id: 0, staging_location_id: 0, material_id: 0, qty: 1 });
                setShowCreate(false);
                showToast("success", "出库单创建成功");
              } catch (e) {
                showToast("error", (e as Error).message || "创建出库单失败");
              }
            }}>
              创建出库单
            </button>
          </div>
        </FormModal>
      )}

      <div className="toolbar">
        <input
          placeholder="搜索 单号 / 客户"
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
          <span>状态</span>
          <span>下一步</span>
          <span>客户</span>
          <span>操作人</span>
          <span>创建时间</span>
          <span>操作</span>
        </div>
        {table.pageItems.map((o) => (
          <Fragment key={o.id}>
            <div className="rowline">
              <span title={o.order_no}>{o.order_no}</span>
              <span title={o.status}>{ORDER_STATUS_LABEL[o.status] || o.status}</span>
              <span title={nextAction(o.status)}>{nextAction(o.status)}</span>
              <span title={o.partner ?? "-"}>{o.partner ?? "-"}</span>
              <span title={o.created_by ?? "-"}>{o.created_by ?? "-"}</span>
              <span title={o.created_at || "-"}>{o.created_at ? formatDateTime(o.created_at) : "-"}</span>
              <span className="row">
                {can("outbound.reserve") && (
                  <button
                    disabled={o.status !== "CREATED"}
                    onClick={async () => {
                      try {
                        await api.reserveOutbound(o.id);
                        await onRefresh();
                        showToast("success", "预留成功");
                      } catch (e) {
                        showToast("error", (e as Error).message || "预留失败");
                      }
                    }}
                  >
                    预留
                  </button>
                )}
                {can("outbound.pick") && (
                  <button
                    disabled={o.status !== "RESERVED"}
                    onClick={async () => {
                      try {
                        await api.pickOutbound(o.id, o.target_location_id ?? defaultStagingId);
                        await onRefresh();
                        showToast("success", "分拣成功");
                      } catch (e) {
                        showToast("error", (e as Error).message || "分拣失败");
                      }
                    }}
                  >
                    分拣
                  </button>
                )}
                {can("outbound.pack") && (
                  <button
                    disabled={o.status !== "PICKED"}
                    onClick={async () => {
                      try {
                        await api.packOutbound(o.id);
                        await onRefresh();
                        showToast("success", "打包成功");
                      } catch (e) {
                        showToast("error", (e as Error).message || "打包失败");
                      }
                    }}
                  >
                    打包
                  </button>
                )}
                {can("outbound.ship") && (
                  <button
                    disabled={o.status !== "PACKED"}
                    onClick={async () => {
                      try {
                        await api.shipOutbound(o.id);
                        await onRefresh();
                        showToast("success", "出库成功");
                      } catch (e) {
                        showToast("error", (e as Error).message || "出库失败");
                      }
                    }}
                  >
                    出库
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
                      <span>{l.reserved_qty}</span>
                      <span>{l.picked_qty}</span>
                      <span>{l.packed_qty}</span>
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
