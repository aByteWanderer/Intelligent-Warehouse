import { useState } from "react";
import { OperationLog, StockMove } from "../hooks/useWmsData";
import { useTable } from "../hooks/useTable";
import { formatDateTime } from "../utils/time";

type Props = {
  stockMoves: StockMove[];
  operationLogs: OperationLog[];
  materialName: (id?: number | null) => string;
  locationName: (id?: number | null) => string;
};

export default function RecordsPage({ stockMoves, operationLogs, materialName, locationName }: Props) {
  const [moveTypeFilter, setMoveTypeFilter] = useState("all");
  const [moveOperatorFilter, setMoveOperatorFilter] = useState("all");
  const [opModuleFilter, setOpModuleFilter] = useState("all");
  const [opActionFilter, setOpActionFilter] = useState("all");
  const [opOperatorFilter, setOpOperatorFilter] = useState("all");

  const moveRows = stockMoves
    .filter((r) => moveTypeFilter === "all" ? true : r.move_type === moveTypeFilter)
    .filter((r) => moveOperatorFilter === "all" ? true : (r.operator || "-") === moveOperatorFilter);
  const moveTable = useTable({
    rows: moveRows,
    filter: (row, q) =>
      row.move_type.toLowerCase().includes(q) ||
      (row.operator || "").toLowerCase().includes(q) ||
      materialName(row.material_id).toLowerCase().includes(q) ||
      locationName(row.from_location_id).toLowerCase().includes(q) ||
      locationName(row.to_location_id).toLowerCase().includes(q),
    stateKey: "rec_move"
  });

  const opRows = operationLogs
    .filter((r) => opModuleFilter === "all" ? true : r.module === opModuleFilter)
    .filter((r) => opActionFilter === "all" ? true : r.action === opActionFilter)
    .filter((r) => opOperatorFilter === "all" ? true : (r.operator || "-") === opOperatorFilter);
  const opTable = useTable({
    rows: opRows,
    filter: (row, q) =>
      row.module.toLowerCase().includes(q) ||
      row.action.toLowerCase().includes(q) ||
      (row.operator || "").toLowerCase().includes(q) ||
      row.detail.toLowerCase().includes(q),
    stateKey: "rec_op"
  });

  return (
    <section className="grid">
      <div className="card">
        <div className="title-row">
          <h2>库存流水记录</h2>
          <div className="muted">记录库存变更 + 操作人 + 时间</div>
        </div>

        <div className="toolbar">
          <div className="row">
            <input
              placeholder="搜索 类型 / 物料 / 库位 / 操作人"
              value={moveTable.query}
              onChange={(e) => { moveTable.setQuery(e.target.value); moveTable.reset(); }}
            />
            <select value={moveTypeFilter} onChange={(e) => { setMoveTypeFilter(e.target.value); moveTable.reset(); }}>
              <option value="all">类型: 全部</option>
              {[...new Set(stockMoves.map((m) => m.move_type))].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={moveOperatorFilter} onChange={(e) => { setMoveOperatorFilter(e.target.value); moveTable.reset(); }}>
              <option value="all">操作人: 全部</option>
              {[...new Set(stockMoves.map((m) => m.operator || "-"))].map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="pager">
            <button onClick={moveTable.prev} disabled={moveTable.page <= 1}>上一页</button>
            <span>{moveTable.page} / {moveTable.pageCount} | {moveTable.total} 条</span>
            <button onClick={moveTable.next} disabled={moveTable.page >= moveTable.pageCount}>下一页</button>
          </div>
        </div>

        <div className="table table-7">
          <div className="thead">
            <span>类型</span>
            <span>物料</span>
            <span>数量</span>
            <span>From</span>
            <span>To</span>
            <span>操作人</span>
            <span>时间</span>
          </div>
          {moveTable.pageItems.map((m) => (
            <div key={m.id} className="rowline">
              <span title={m.move_type}>{m.move_type}</span>
              <span title={materialName(m.material_id)}>{materialName(m.material_id)}</span>
              <span>{m.qty}</span>
              <span title={locationName(m.from_location_id)}>{locationName(m.from_location_id)}</span>
              <span title={locationName(m.to_location_id)}>{locationName(m.to_location_id)}</span>
              <span title={m.operator || "-"}>{m.operator || "-"}</span>
              <span title={m.created_at}>{formatDateTime(m.created_at)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="title-row">
          <h2>操作日志</h2>
          <div className="muted">记录系统关键操作</div>
        </div>

        <div className="toolbar">
          <div className="row">
            <input
              placeholder="搜索 模块 / 动作 / 操作人 / 详情"
              value={opTable.query}
              onChange={(e) => { opTable.setQuery(e.target.value); opTable.reset(); }}
            />
            <select value={opModuleFilter} onChange={(e) => { setOpModuleFilter(e.target.value); opTable.reset(); }}>
              <option value="all">模块: 全部</option>
              {[...new Set(operationLogs.map((r) => r.module))].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={opActionFilter} onChange={(e) => { setOpActionFilter(e.target.value); opTable.reset(); }}>
              <option value="all">动作: 全部</option>
              {[...new Set(operationLogs.map((r) => r.action))].map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={opOperatorFilter} onChange={(e) => { setOpOperatorFilter(e.target.value); opTable.reset(); }}>
              <option value="all">操作人: 全部</option>
              {[...new Set(operationLogs.map((r) => r.operator || "-"))].map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="pager">
            <button onClick={opTable.prev} disabled={opTable.page <= 1}>上一页</button>
            <span>{opTable.page} / {opTable.pageCount} | {opTable.total} 条</span>
            <button onClick={opTable.next} disabled={opTable.page >= opTable.pageCount}>下一页</button>
          </div>
        </div>

        <div className="table table-6">
          <div className="thead">
            <span>模块</span>
            <span>动作</span>
            <span>对象</span>
            <span>详情</span>
            <span>操作人</span>
            <span>时间</span>
          </div>
          {opTable.pageItems.map((row) => (
            <div key={row.id} className="rowline">
              <span title={row.module}>{row.module}</span>
              <span title={row.action}>{row.action}</span>
              <span title={`${row.entity}#${row.entity_id ?? "-"}`}>{row.entity}#{row.entity_id ?? "-"}</span>
              <span title={row.detail}>{row.detail || "-"}</span>
              <span title={row.operator || "-"}>{row.operator || "-"}</span>
              <span title={row.created_at}>{formatDateTime(row.created_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
