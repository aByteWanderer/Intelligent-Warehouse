import { useState } from "react";
import { api } from "../api";
import { Material, Location, Order } from "../hooks/useWmsData";
import { useTable } from "../hooks/useTable";

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

  const inboundOrders = orders.filter((o) => o.order_type === "inbound");

  const table = useTable({
    rows: inboundOrders,
    filter: (row, q) => row.order_no.toLowerCase().includes(q) || (row.partner ?? "").toLowerCase().includes(q)
  });

  return (
    <section className="grid">
      {can("orders.write") && (
        <div className="card">
          <h2>新建入库</h2>
          <div className="form">
            <input placeholder="入库单号" value={form.order_no} onChange={(e) => setForm({ ...form, order_no: e.target.value })} />
            <input placeholder="供应商" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
            <select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: Number(e.target.value) })}>
              <option value={0}>目标库位</option>
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
                supplier: form.supplier,
                location_id: form.location_id,
                lines: [{ material_id: form.material_id, qty: form.qty }]
              };
              await api.createInbound(body);
              await onRefresh();
            }}>
              创建入库单
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h2>入库记录</h2>
        <div className="toolbar">
          <input
            placeholder="搜索 单号 / 供应商"
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
                {can("inbound.receive") && (
                  <button onClick={async () => { await api.receiveInbound(o.id); await onRefresh(); }}>收货</button>
                )}
                <button onClick={() => loadLines(o.id)}>明细</button>
              </div>
              {orderLines[o.id] && (
                <div className="lines">
                  {orderLines[o.id].map((l) => (
                    <div key={l.id}>
                      {(l as any).material_name || materialName(l.material_id)} | 数量 {l.qty}
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
