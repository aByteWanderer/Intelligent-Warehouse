import { useMemo, useState } from "react";
import { useTable } from "../hooks/useTable";
import { Material } from "../hooks/useWmsData";
import { api } from "../api";

type Props = {
  materials: Material[];
  onRefresh: () => void;
  can: (perm: string) => boolean;
  includeInactive: boolean;
  onToggleInactive: (v: boolean) => void;
};

export default function Materials({ materials, onRefresh, can, includeInactive, onToggleInactive }: Props) {
  const [newMaterial, setNewMaterial] = useState({ sku: "", name: "", unit: "pcs", category: "general", is_common: 0 });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [edit, setEdit] = useState({ sku: "", name: "", unit: "", category: "", is_common: 0, is_active: 1 });

  const table = useTable({
    rows: materials,
    filter: (row, q) =>
      row.sku.toLowerCase().includes(q) ||
      row.name.toLowerCase().includes(q) ||
      row.category.toLowerCase().includes(q)
  });

  const commonCount = useMemo(() => materials.filter((m) => m.is_common).length, [materials]);

  return (
    <section className="card">
      <div className="title-row">
        <h2>物料管理</h2>
        <div className="row">
          <div className="muted">常用料: {commonCount}</div>
          <label className="row">
            <input type="checkbox" checked={includeInactive} onChange={(e) => onToggleInactive(e.target.checked)} />
            显示已停用
          </label>
        </div>
      </div>

      {can("materials.write") && (
        <div className="form">
          <input placeholder="SKU" value={newMaterial.sku} onChange={(e) => setNewMaterial({ ...newMaterial, sku: e.target.value })} />
          <input placeholder="名称" value={newMaterial.name} onChange={(e) => setNewMaterial({ ...newMaterial, name: e.target.value })} />
          <input placeholder="单位" value={newMaterial.unit} onChange={(e) => setNewMaterial({ ...newMaterial, unit: e.target.value })} />
          <input placeholder="分类" value={newMaterial.category} onChange={(e) => setNewMaterial({ ...newMaterial, category: e.target.value })} />
          <label className="row">
            <input type="checkbox" checked={!!newMaterial.is_common} onChange={(e) => setNewMaterial({ ...newMaterial, is_common: e.target.checked ? 1 : 0 })} />
            常用料
          </label>
          <button className="primary" onClick={async () => { await api.createMaterial(newMaterial); await onRefresh(); }}>
            新增物料
          </button>
        </div>
      )}

      <div className="toolbar">
        <input
          placeholder="搜索 SKU / 名称 / 分类"
          value={table.query}
          onChange={(e) => { table.setQuery(e.target.value); table.reset(); }}
        />
        <div className="pager">
          <button onClick={table.prev} disabled={table.page <= 1}>上一页</button>
          <span>{table.page} / {table.pageCount} | {table.total} 条</span>
          <button onClick={table.next} disabled={table.page >= table.pageCount}>下一页</button>
        </div>
      </div>

      <div className="table table-6">
        <div className="thead">
          <span>SKU</span>
          <span>名称</span>
          <span>单位</span>
          <span>分类</span>
          <span>状态</span>
          <span>操作</span>
        </div>
        {table.pageItems.map((m) => (
          <div key={m.id} className="rowline">
            {editingId === m.id ? (
              <>
                <span><input value={edit.sku} onChange={(e) => setEdit({ ...edit, sku: e.target.value })} /></span>
                <span><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></span>
                <span><input value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} /></span>
                <span><input value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></span>
                <span>
                  <label className="row">
                    <input type="checkbox" checked={!!edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked ? 1 : 0 })} />
                    启用
                  </label>
                </span>
                <span className="row">
                  <label className="row">
                    <input type="checkbox" checked={!!edit.is_common} onChange={(e) => setEdit({ ...edit, is_common: e.target.checked ? 1 : 0 })} />
                    常用
                  </label>
                  <button className="primary" onClick={async () => { await api.updateMaterial(m.id, edit); setEditingId(null); await onRefresh(); }}>保存</button>
                  <button onClick={() => setEditingId(null)}>取消</button>
                </span>
              </>
            ) : (
              <>
                <span>{m.sku}</span>
                <span>{m.name}</span>
                <span>{m.unit}</span>
                <span>{m.category}</span>
                <span>{m.is_active ? "启用" : "停用"}</span>
                <span className="row">
                  {can("materials.write") && (
                    <button onClick={() => { setEditingId(m.id); setEdit({ sku: m.sku, name: m.name, unit: m.unit, category: m.category, is_common: m.is_common, is_active: m.is_active }); }}>编辑</button>
                  )}
                  {can("materials.write") && (
                    <button onClick={async () => { await api.setMaterialCommon(m.id, m.is_common ? 0 : 1); await onRefresh(); }}>
                      {m.is_common ? "取消常用" : "设为常用"}
                    </button>
                  )}
                  {can("materials.delete") && (
                    <button onClick={async () => {
                      const ok = window.confirm(`删除物料 ${m.sku} ? 如果有库存或订单将自动停用。`);
                      if (!ok) return;
                      const res = await api.deleteMaterial(m.id, 0) as any;
                      if (res?.status === "soft_deleted") {
                        alert(`已停用: ${res.reason}`);
                      }
                      await onRefresh();
                    }}>
                      删除
                    </button>
                  )}
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
