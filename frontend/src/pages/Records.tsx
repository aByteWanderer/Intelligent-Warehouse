import { StockMove } from "../hooks/useWmsData";
import { useTable } from "../hooks/useTable";

type Props = {
  stockMoves: StockMove[];
  materialName: (id?: number | null) => string;
  locationName: (id?: number | null) => string;
};

export default function RecordsPage({ stockMoves, materialName, locationName }: Props) {
  const table = useTable({
    rows: stockMoves,
    filter: (row, q) =>
      row.move_type.toLowerCase().includes(q) ||
      materialName(row.material_id).toLowerCase().includes(q) ||
      locationName(row.from_location_id).toLowerCase().includes(q) ||
      locationName(row.to_location_id).toLowerCase().includes(q)
  });

  return (
    <section className="card">
      <div className="title-row">
        <h2>库存流水记录</h2>
        <div className="muted">所有库存变更都写入流水</div>
      </div>

      <div className="toolbar">
        <input
          placeholder="搜索 类型 / 物料 / 库位"
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
          <span>类型</span>
          <span>物料</span>
          <span>数量</span>
          <span>From</span>
          <span>To</span>
        </div>
        {table.pageItems.map((m) => (
          <div key={m.id} className="rowline">
            <span>{m.move_type}</span>
            <span>{materialName(m.material_id)}</span>
            <span>{m.qty}</span>
            <span>{locationName(m.from_location_id)}</span>
            <span>{locationName(m.to_location_id)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
