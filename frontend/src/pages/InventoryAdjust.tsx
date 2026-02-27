import { useState } from "react";
import { api } from "../api";
import { Material, Location } from "../hooks/useWmsData";

export default function InventoryAdjust({
  materials,
  locations,
  onRefresh
}: {
  materials: Material[];
  locations: Location[];
  onRefresh: () => void;
}) {
  const [adjust, setAdjust] = useState({ material_id: 0, location_id: 0, delta: 0 });

  return (
    <section className="card">
      <h2>库存调整</h2>
      <div className="form">
        <select value={adjust.material_id} onChange={(e) => setAdjust({ ...adjust, material_id: Number(e.target.value) })}>
          <option value={0}>选择物料</option>
          {materials.map((m) => <option key={m.id} value={m.id}>{m.sku}</option>)}
        </select>
        <select value={adjust.location_id} onChange={(e) => setAdjust({ ...adjust, location_id: Number(e.target.value) })}>
          <option value={0}>选择库位</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}
        </select>
        <input type="number" placeholder="数量变化" value={adjust.delta} onChange={(e) => setAdjust({ ...adjust, delta: Number(e.target.value) })} />
        <button className="primary" onClick={async () => { await api.adjustInventory(adjust); await onRefresh(); }}>
          提交调整
        </button>
      </div>
    </section>
  );
}
