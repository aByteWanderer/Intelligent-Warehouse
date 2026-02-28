import { useState } from "react";
import { api } from "../api";
import { Material, Location } from "../hooks/useWmsData";
import FieldLabel from "../components/FieldLabel";
import Toast from "../components/Toast";
import { useToast } from "../hooks/useToast";

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
  const { toast, showToast } = useToast();

  return (
    <section className="card">
      <h2>库存调整</h2>
      <div className="muted">若库位已绑定容器，请改用“库位管理 -&gt; 容器库存”进行维护。</div>
      <Toast toast={toast} />
      <div className="form">
        <FieldLabel text="物料" />
        <select value={adjust.material_id} onChange={(e) => setAdjust({ ...adjust, material_id: Number(e.target.value) })}>
          <option value={0}>选择物料</option>
          {materials.map((m) => <option key={m.id} value={m.id}>{m.sku}</option>)}
        </select>
        <FieldLabel text="库位" />
        <select value={adjust.location_id} onChange={(e) => setAdjust({ ...adjust, location_id: Number(e.target.value) })}>
          <option value={0}>选择库位</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}
        </select>
        <FieldLabel text="数量变化" />
        <input type="number" value={adjust.delta} onChange={(e) => setAdjust({ ...adjust, delta: Number(e.target.value) })} />
        <button className="primary" onClick={async () => {
          try {
            await api.adjustInventory(adjust);
            await onRefresh();
            setAdjust({ material_id: 0, location_id: 0, delta: 0 });
            showToast("success", "库存调整成功");
          } catch (e) {
            showToast("error", (e as Error).message || "库存调整失败");
          }
        }}>
          提交调整
        </button>
      </div>
    </section>
  );
}
