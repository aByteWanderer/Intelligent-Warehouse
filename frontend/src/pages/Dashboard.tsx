import { useMemo } from "react";
import { Inventory, Material, Order, StockMove } from "../hooks/useWmsData";

export default function Dashboard({
  materials,
  inventory,
  orders,
  stockMoves,
  materialName,
  locationName
}: {
  materials: Material[];
  inventory: Inventory[];
  orders: Order[];
  stockMoves: StockMove[];
  materialName: (id?: number | null) => string;
  locationName: (id?: number | null) => string;
}) {
  const inboundOrders = useMemo(() => orders.filter((o) => o.order_type === "inbound"), [orders]);
  const outboundOrders = useMemo(() => orders.filter((o) => o.order_type === "outbound"), [orders]);

  return (
    <section className="grid">
      <div className="card">
        <h2>库存概览</h2>
        <div className="table">
          <div className="thead">
            <span>物料</span>
            <span>库位</span>
            <span>可用</span>
            <span>预留</span>
          </div>
          {inventory.slice(0, 8).map((inv) => (
            <div key={inv.id} className="rowline">
              <span>{materialName(inv.material_id)}</span>
              <span>{locationName(inv.location_id)}</span>
              <span>{inv.quantity}</span>
              <span>{inv.reserved}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>订单概览</h2>
        <div className="summary">
          <div>
            <div className="label">入库订单</div>
            <div className="value">{inboundOrders.length}</div>
          </div>
          <div>
            <div className="label">出库订单</div>
            <div className="value">{outboundOrders.length}</div>
          </div>
          <div>
            <div className="label">物料总数</div>
            <div className="value">{materials.length}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>最新库存流水</h2>
        <div className="table table-5">
          <div className="thead">
            <span>类型</span>
            <span>物料</span>
            <span>数量</span>
            <span>From</span>
            <span>To</span>
          </div>
          {stockMoves.slice(0, 6).map((m) => (
            <div key={m.id} className="rowline">
              <span>{m.move_type}</span>
              <span>{materialName(m.material_id)}</span>
              <span>{m.qty}</span>
              <span>{locationName(m.from_location_id)}</span>
              <span>{locationName(m.to_location_id)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
