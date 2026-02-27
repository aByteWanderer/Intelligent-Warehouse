import { useMemo, useState } from "react";
import { api } from "../api";
import { Material, Location, Order } from "../hooks/useWmsData";
import { useTable } from "../hooks/useTable";

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

export default function OutboundPage({ materials, locations, orders, onRefresh, loadLines, orderLines, materialName, can }: Props) {
  const [form, setForm] = useState({ order_no: "", customer: "", source_location_id: 0, staging_location_id: 0, material_id: 0, qty: 1 });

  const outboundOrders = useMemo(() => orders.filter((o) => o.order_type === "outbound"), [orders]);
  const defaultStagingId = form.staging_location_id || locations.find((l) => l.code === "STAGE")?.id || locations[0]?.id || 0;

  const table = useTable({
    rows: outboundOrders,
    filter: (row, q) => row.order_no.toLowerCase().includes(q) || (row.partner ?? "").toLowerCase().includes(q)
  });

  return (
    <section className="grid">
      {can("orders.write") && (
        <div className="card">
          <h2>新建出库</h2>
          <div className="form">
            <input placeholder="出库单号" value={form.order_no} onChange={(e) => setForm({ ...form, order_no: e.target.value })} />
            <input placeholder="客户" value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} />
            <select value={form.source_location_id} onChange={(e) => setForm({ ...form, source_location_id: Number(e.target.value) })}>
              <option value={0}>拣货库位</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}
            </select>
            <select value={form.staging_location_id} onChange={(e) => setForm({ ...form, staging_location_id: Number(e.target.value) })}>
              <option value={0}>暂存库位</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}
            </select>
            <select value={form.material_id} onChange={(e) => setForm({ ...form, material_id: Number(e.target.value) })}>
              <option value={0}>物料</option>
              {materials.map((m) => <option key={m.id} value={m.id}>{m.sku}</option>)}
            </select>
            <input type="number" placeholder="数量" value={form.qty} onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })} />
            <button className="primary" onClick={async () => {
              const body = {
                order_no: form.order_no,
                customer: form.customer,
                source_location_id: form.source_location_id,
                staging_location_id: form.staging_location_id || null,
                lines: [{ material_id: form.material_id, qty: form.qty }]
              };
              await api.createOutbound(body);
              await onRefresh();
            }}>
              创建出库单
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h2>出库记录</h2>
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

        <div className="list">
          {table.pageItems.map((o) => (
            <div key={o.id} className="rowline">
              <span>{o.order_no} | {o.status} | {o.partner ?? ""}</span>
              <div className="row">
                {can("outbound.reserve") && (
                  <button onClick={async () => { await api.reserveOutbound(o.id); await onRefresh(); }}>预留</button>
                )}
                {can("outbound.pick") && (
                  <button onClick={async () => { await api.pickOutbound(o.id, o.target_location_id ?? defaultStagingId); await onRefresh(); }}>分拣</button>
                )}
                {can("outbound.pack") && (
                  <button onClick={async () => { await api.packOutbound(o.id); await onRefresh(); }}>打包</button>
                )}
                {can("outbound.ship") && (
                  <button onClick={async () => { await api.shipOutbound(o.id); await onRefresh(); }}>出库</button>
                )}
                <button onClick={() => loadLines(o.id)}>明细</button>
              </div>
              {orderLines[o.id] && (
                <div className="lines">
                  {orderLines[o.id].map((l) => (
                    <div key={l.id}>
                      {(l as any).material_name || materialName(l.material_id)} | 需求 {l.qty} | 预留 {l.reserved_qty} | 已拣 {l.picked_qty} | 已打包 {l.packed_qty}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
