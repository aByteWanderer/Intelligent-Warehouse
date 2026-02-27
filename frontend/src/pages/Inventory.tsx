import { useTable } from "../hooks/useTable";
import { Inventory } from "../hooks/useWmsData";

type Props = {
  inventory: Inventory[];
  materialName: (id?: number | null) => string;
  locationName: (id?: number | null) => string;
};

export default function InventoryPage({ inventory, materialName, locationName }: Props) {
  const table = useTable({
    rows: inventory,
    filter: (row, q) =>
      materialName(row.material_id).toLowerCase().includes(q) ||
      locationName(row.location_id).toLowerCase().includes(q)
  });

  return (
    <section className="card">
      <div className="title-row">
        <h2>库存列表</h2>
        <div className="muted">含可用与预留</div>
      </div>

      <div className="toolbar">
        <input
          placeholder="搜索 物料 / 库位"
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
        <div className="thead">
          <span>物料</span>
          <span>库位</span>
          <span>可用</span>
          <span>预留</span>
        </div>
        {table.pageItems.map((inv) => (
          <div key={inv.id} className="rowline">
            <span>{materialName(inv.material_id)}</span>
            <span>{locationName(inv.location_id)}</span>
            <span>{inv.quantity}</span>
            <span>{inv.reserved}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
