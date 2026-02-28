import { useMemo, useState } from "react";
import { useTable } from "../hooks/useTable";
import { Material } from "../hooks/useWmsData";
import { api } from "../api";
import FieldLabel from "../components/FieldLabel";
import FormModal from "../components/FormModal";
import Toast from "../components/Toast";
import { useToast } from "../hooks/useToast";
import { getHashParam, setHashParam } from "../utils/hashParams";
import StatusBadge from "../components/StatusBadge";

type Props = {
  materials: Material[];
  onRefresh: () => void;
  can: (perm: string) => boolean;
  includeInactive: boolean;
  onToggleInactive: (v: boolean) => void;
};

const MATERIAL_CATEGORIES = [
  { value: "general", label: "通用物料" },
  { value: "raw", label: "原材料" },
  { value: "wip", label: "在制品" },
  { value: "finished", label: "成品" },
  { value: "pack", label: "包装耗材" },
  { value: "tool", label: "工装器具" }
];

export default function Materials({ materials, onRefresh, can, includeInactive, onToggleInactive }: Props) {
  const [newMaterial, setNewMaterial] = useState({ sku: "", name: "", unit: "pcs", category: "general", is_common: 0 });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [edit, setEdit] = useState({ sku: "", name: "", unit: "", category: "", is_common: 0, is_active: 1 });
  const [showCreate, setShowCreate] = useState(false);
  const [commonFilter, setCommonFilterRaw] = useState<"all" | "common" | "non_common">(() => (getHashParam("mat_common", "all") as "all" | "common" | "non_common"));
  const [categoryFilter, setCategoryFilterRaw] = useState(() => getHashParam("mat_cat", "all"));
  const { toast, showToast } = useToast();

  function setCommonFilter(v: "all" | "common" | "non_common") {
    setCommonFilterRaw(v);
    setHashParam("mat_common", v === "all" ? null : v);
  }

  function setCategoryFilter(v: string) {
    setCategoryFilterRaw(v);
    setHashParam("mat_cat", v === "all" ? null : v);
  }

  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      if (commonFilter === "common" && !m.is_common) return false;
      if (commonFilter === "non_common" && m.is_common) return false;
      if (categoryFilter !== "all" && m.category !== categoryFilter) return false;
      return true;
    });
  }, [materials, commonFilter, categoryFilter]);

  const table = useTable({
    rows: filteredMaterials,
    filter: (row, q) =>
      row.sku.toLowerCase().includes(q) ||
      row.name.toLowerCase().includes(q) ||
      row.category.toLowerCase().includes(q),
    stateKey: "mat"
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
          {can("materials.write") && <button className="primary" onClick={() => setShowCreate(true)}>新增物料</button>}
        </div>
      </div>

      <Toast toast={toast} />

      {showCreate && (
        <FormModal title="新增物料" onClose={() => setShowCreate(false)}>
          <div className="form">
            <FieldLabel text="SKU" />
            <input value={newMaterial.sku} onChange={(e) => setNewMaterial({ ...newMaterial, sku: e.target.value })} />
            <FieldLabel text="名称" />
            <input value={newMaterial.name} onChange={(e) => setNewMaterial({ ...newMaterial, name: e.target.value })} />
            <FieldLabel text="单位" />
            <input value={newMaterial.unit} onChange={(e) => setNewMaterial({ ...newMaterial, unit: e.target.value })} />
            <FieldLabel text="分类" />
            <select value={newMaterial.category} onChange={(e) => setNewMaterial({ ...newMaterial, category: e.target.value })}>
              {MATERIAL_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <label className="row">
              <input type="checkbox" checked={!!newMaterial.is_common} onChange={(e) => setNewMaterial({ ...newMaterial, is_common: e.target.checked ? 1 : 0 })} />
              常用料
            </label>
            <button className="primary" onClick={async () => {
              try {
                await api.createMaterial(newMaterial);
                await onRefresh();
                setNewMaterial({ sku: "", name: "", unit: "pcs", category: "general", is_common: 0 });
                setShowCreate(false);
                showToast("success", "物料新增成功");
              } catch (e) {
                showToast("error", (e as Error).message || "物料新增失败");
              }
            }}>
              保存
            </button>
          </div>
        </FormModal>
      )}

      <div className="toolbar">
        <div className="row">
          <input
            placeholder="搜索 SKU / 名称 / 分类"
            value={table.query}
            onChange={(e) => { table.setQuery(e.target.value); table.reset(); }}
          />
          <select value={commonFilter} onChange={(e) => { setCommonFilter(e.target.value as "all" | "common" | "non_common"); table.reset(); }}>
            <option value="all">常用筛选: 全部</option>
            <option value="common">常用筛选: 仅常用</option>
            <option value="non_common">常用筛选: 仅非常用</option>
          </select>
          <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); table.reset(); }}>
            <option value="all">分类筛选: 全部</option>
            {MATERIAL_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="pager">
          <button onClick={table.prev} disabled={table.page <= 1}>上一页</button>
          <span>{table.page} / {table.pageCount} | {table.total} 条</span>
          <button onClick={table.next} disabled={table.page >= table.pageCount}>下一页</button>
        </div>
      </div>

      <div className="table table-7">
        <div className="thead">
          <span>SKU</span>
          <span>名称</span>
          <span>单位</span>
          <span>分类</span>
          <span>是否常用</span>
          <span>状态</span>
          <span>操作</span>
        </div>
        {table.pageItems.map((m) => (
          <div key={m.id} className="rowline">
            <span title={m.sku}>{editingId === m.id ? <input value={edit.sku} onChange={(e) => setEdit({ ...edit, sku: e.target.value })} /> : m.sku}</span>
            <span title={m.name}>{editingId === m.id ? <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /> : m.name}</span>
            <span title={m.unit}>{editingId === m.id ? <input value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} /> : m.unit}</span>
            <span title={m.category}>
              {editingId === m.id
                ? <select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{MATERIAL_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
                : (MATERIAL_CATEGORIES.find((c) => c.value === m.category)?.label || m.category)}
            </span>
            <span>{m.is_common ? "是" : "否"}</span>
            <span><StatusBadge value={m.is_active ? "ACTIVE" : "DISABLED"} /></span>
            <span className="row">
              {can("materials.write") && (editingId === m.id ? (
                <>
                  <button className="primary" onClick={async () => {
                    try {
                      await api.updateMaterial(m.id, edit);
                      setEditingId(null);
                      await onRefresh();
                      showToast("success", "物料更新成功");
                    } catch (e) {
                      showToast("error", (e as Error).message || "物料更新失败");
                    }
                  }}>保存</button>
                  <button onClick={() => setEditingId(null)}>取消</button>
                </>
              ) : (
                <button onClick={() => {
                  setEditingId(m.id);
                  setEdit({
                    sku: m.sku,
                    name: m.name,
                    unit: m.unit,
                    category: m.category,
                    is_common: m.is_common,
                    is_active: m.is_active
                  });
                }}>编辑</button>
              ))}
              {can("materials.write") && (
                <button onClick={async () => {
                  try {
                    await api.setMaterialCommon(m.id, m.is_common ? 0 : 1);
                    await onRefresh();
                    showToast("success", m.is_common ? "已取消常用料" : "已设为常用料");
                  } catch (e) {
                    showToast("error", (e as Error).message || "操作失败");
                  }
                }}>
                  {m.is_common ? "取消常用" : "设为常用"}
                </button>
              )}
              {can("materials.delete") && (
                <button onClick={async () => {
                  try {
                    const res = await api.deleteMaterial(m.id, 0) as any;
                    await onRefresh();
                    showToast("success", res.status === "soft_deleted" ? "物料已停用" : "物料已删除");
                  } catch (e) {
                    showToast("error", (e as Error).message || "物料删除失败");
                  }
                }}>
                  删除/停用
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
