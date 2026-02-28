import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Location, Material } from "../hooks/useWmsData";
import { formatDateTime } from "../utils/time";
import FieldLabel from "../components/FieldLabel";
import FormModal from "../components/FormModal";
import Toast from "../components/Toast";
import { useToast } from "../hooks/useToast";
import StatusBadge from "../components/StatusBadge";
import { useLocalStorageState } from "../hooks/useLocalStorageState";

type Props = {
  locations: Location[];
  materials: Material[];
  can: (perm: string) => boolean;
  onRefresh: () => void;
};

type TabKey = "factory" | "warehouse" | "area" | "location" | "layout" | "container" | "container_stock" | "container_move";

const FACTORY_STATUS = ["ACTIVE", "DISABLED"] as const;
const AREA_STATUS = ["ACTIVE", "DISABLED"] as const;
const LOCATION_STATUS = ["ACTIVE", "DISABLED"] as const;
const CONTAINER_STATUS = ["BOUND", "UNBOUND"] as const;
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "启用",
  DISABLED: "停用",
  BOUND: "已绑定",
  UNBOUND: "未绑定"
};
const FACTORY_TYPES = [
  { value: "GENERAL", label: "通用工厂" },
  { value: "PRODUCTION", label: "生产工厂" },
  { value: "OUTSOURCE", label: "外协工厂" }
];
const AREA_MATERIAL_TYPES = [
  { value: "GENERAL", label: "通用物料" },
  { value: "RAW", label: "原材料" },
  { value: "WIP", label: "在制品" },
  { value: "FINISHED", label: "成品" },
  { value: "PACKING", label: "包装耗材" }
];
const CONTAINER_TYPES = [
  { value: "BIN", label: "料箱" },
  { value: "TOTE", label: "周转箱" },
  { value: "PALLET", label: "托盘" },
  { value: "CARTON", label: "纸箱" }
];

export default function StoragePage({ locations, materials, can, onRefresh }: Props) {
  const [tab, setTab] = useLocalStorageState<TabKey>("storage_tab", "factory");
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [factories, setFactories] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [containers, setContainers] = useState<any[]>([]);
  const [containerInventory, setContainerInventory] = useState<any[]>([]);
  const [containerMoves, setContainerMoves] = useState<any[]>([]);

  const { toast, showToast } = useToast();
  const [modal, setModal] = useState<null | "addWarehouse" | "addFactory" | "addArea" | "addLocation" | "addContainer">(null);

  const [warehouseForm, setWarehouseForm] = useState({ code: "", name: "", factory_id: 0 });
  const [factoryForm, setFactoryForm] = useState({ code: "", name: "", location: "", description: "", factory_type: "GENERAL", status: "ACTIVE" });
  const [areaForm, setAreaForm] = useState({ code: "", name: "", material_type: "GENERAL", factory_id: 0, warehouse_id: 0, status: "ACTIVE", description: "" });
  const [locationForm, setLocationForm] = useState({ warehouse_id: 0, area_id: 0, code: "", name: "", status: "ACTIVE" });
  const [containerForm, setContainerForm] = useState({ code: "", container_type: "BIN", location_id: 0, description: "" });
  const [containerLocationQuery, setContainerLocationQuery] = useState("");

  const [editWarehouse, setEditWarehouse] = useState<{ id: number; name: string; factory_id: number } | null>(null);
  const [editFactory, setEditFactory] = useState<{ id: number; name: string; location: string; description: string; factory_type: string; status: string } | null>(null);
  const [editArea, setEditArea] = useState<{ id: number; name: string; material_type: string; factory_id: number; warehouse_id: number; status: string; description: string } | null>(null);
  const [editLocation, setEditLocation] = useState<{ id: number; area_id: number; name: string; status: string } | null>(null);
  const [editContainer, setEditContainer] = useState<{ id: number; container_type: string; description: string; status: string } | null>(null);

  const [stockForm, setStockForm] = useState({ container_id: 0, material_id: 0, delta: 0, reason: "manual" });

  const locationById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const materialById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);

  async function load() {
    const tasks: Promise<any>[] = [];
    tasks.push(can("locations.read") || can("locations.write") ? api.listWarehouses() : Promise.resolve([]));
    tasks.push(can("areas.read") ? api.listFactories() : Promise.resolve([]));
    tasks.push(can("areas.read") ? api.listAreas() : Promise.resolve([]));
    tasks.push(can("containers.read") ? api.listContainers() : Promise.resolve([]));
    tasks.push(can("containers.read") ? api.listContainerInventory() : Promise.resolve([]));
    tasks.push(can("container_moves.read") ? api.listContainerMoves() : Promise.resolve([]));

    const [w, f, a, c, ci, cm] = await Promise.all(tasks);
    setWarehouses(w as any[]);
    setFactories(f as any[]);
    setAreas(a as any[]);
    setContainers(c as any[]);
    setContainerInventory(ci as any[]);
    setContainerMoves(cm as any[]);
  }

  useEffect(() => {
    if (warehouses.length && !locationForm.warehouse_id) {
      setLocationForm((prev) => ({ ...prev, warehouse_id: warehouses[0].id }));
    }
  }, [warehouses.length]);

  useEffect(() => {
    load();
  }, [locations.length, materials.length]);

  const tabItems: { key: TabKey; label: string; visible: boolean }[] = [
    { key: "factory", label: "工厂", visible: can("areas.read") },
    { key: "warehouse", label: "仓库", visible: can("locations.read") || can("locations.write") },
    { key: "area", label: "区域", visible: can("areas.read") },
    { key: "location", label: "库位", visible: can("locations.read") || can("locations.write") },
    { key: "layout", label: "库位可视化", visible: can("locations.read") || can("containers.read") },
    { key: "container", label: "容器", visible: can("containers.read") || can("containers.write") },
    { key: "container_stock", label: "容器库存", visible: can("containers.read") || can("inventory.adjust") },
    { key: "container_move", label: "容器移动记录", visible: can("container_moves.read") }
  ];

  return (
    <section className="card">
      <div className="title-row">
        <h2>库位管理</h2>
        <div className="row">
          {tab === "warehouse" && can("locations.write") && <button className="primary" onClick={() => setModal("addWarehouse")}>新增仓库</button>}
          {tab === "factory" && can("areas.write") && <button className="primary" onClick={() => setModal("addFactory")}>新增工厂</button>}
          {tab === "area" && can("areas.write") && <button className="primary" onClick={() => setModal("addArea")}>新增区域</button>}
          {tab === "location" && can("locations.write") && <button className="primary" onClick={() => setModal("addLocation")}>新增库位</button>}
          {tab === "container" && can("containers.write") && <button className="primary" onClick={() => setModal("addContainer")}>新增容器</button>}
        </div>
      </div>

      <div className="tabs subtabs">
        {tabItems.filter((t) => t.visible).map((t) => (
          <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      <Toast toast={toast} />

      {modal === "addWarehouse" && (
        <FormModal title="新增仓库" onClose={() => setModal(null)}>
          <div className="form">
            <FieldLabel text="仓库编码" />
            <input value={warehouseForm.code} onChange={(e) => setWarehouseForm({ ...warehouseForm, code: e.target.value })} />
            <FieldLabel text="仓库名称" />
            <input value={warehouseForm.name} onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })} />
            <FieldLabel text="所属工厂" />
            <select value={warehouseForm.factory_id} onChange={(e) => setWarehouseForm({ ...warehouseForm, factory_id: Number(e.target.value) })}>
              <option value={0}>无</option>
              {factories.map((f) => <option key={f.id} value={f.id}>{f.code}</option>)}
            </select>
            <button className="primary" onClick={async () => {
              try {
                await api.createWarehouse({ code: warehouseForm.code, name: warehouseForm.name, factory_id: warehouseForm.factory_id || null });
                setWarehouseForm({ code: "", name: "", factory_id: 0 });
                setModal(null);
                await load();
                showToast("success", "仓库创建成功");
              } catch (e) {
                showToast("error", (e as Error).message || "仓库创建失败");
              }
            }}>保存</button>
          </div>
        </FormModal>
      )}

      {modal === "addFactory" && (
        <FormModal title="新增工厂" onClose={() => setModal(null)}>
          <div className="form">
            <FieldLabel text="工厂编码" />
            <input value={factoryForm.code} onChange={(e) => setFactoryForm({ ...factoryForm, code: e.target.value })} />
            <FieldLabel text="工厂名称" />
            <input value={factoryForm.name} onChange={(e) => setFactoryForm({ ...factoryForm, name: e.target.value })} />
            <FieldLabel text="工厂位置" />
            <input value={factoryForm.location} onChange={(e) => setFactoryForm({ ...factoryForm, location: e.target.value })} />
            <FieldLabel text="工厂描述" />
            <input value={factoryForm.description} onChange={(e) => setFactoryForm({ ...factoryForm, description: e.target.value })} />
            <FieldLabel text="工厂类型" />
            <select value={factoryForm.factory_type} onChange={(e) => setFactoryForm({ ...factoryForm, factory_type: e.target.value })}>
              {FACTORY_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <FieldLabel text="状态" />
            <select value={factoryForm.status} onChange={(e) => setFactoryForm({ ...factoryForm, status: e.target.value })}>
              {FACTORY_STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <button className="primary" onClick={async () => {
              try {
                await api.createFactory(factoryForm);
                setFactoryForm({ code: "", name: "", location: "", description: "", factory_type: "GENERAL", status: "ACTIVE" });
                setModal(null);
                await load();
                showToast("success", "工厂创建成功");
              } catch (e) {
                showToast("error", (e as Error).message || "工厂创建失败");
              }
            }}>保存</button>
          </div>
        </FormModal>
      )}

      {modal === "addArea" && (
        <FormModal title="新增区域" onClose={() => setModal(null)}>
          <div className="form">
            <FieldLabel text="区域编码" />
            <input value={areaForm.code} onChange={(e) => setAreaForm({ ...areaForm, code: e.target.value })} />
            <FieldLabel text="区域名称" />
            <input value={areaForm.name} onChange={(e) => setAreaForm({ ...areaForm, name: e.target.value })} />
            <FieldLabel text="物料类型" />
            <select value={areaForm.material_type} onChange={(e) => setAreaForm({ ...areaForm, material_type: e.target.value })}>
              {AREA_MATERIAL_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <FieldLabel text="关联工厂" />
            <select value={areaForm.factory_id} onChange={(e) => setAreaForm({ ...areaForm, factory_id: Number(e.target.value) })}>
              <option value={0}>无</option>
              {factories.map((f) => <option key={f.id} value={f.id}>{f.code}</option>)}
            </select>
            <FieldLabel text="关联仓库" />
            <select value={areaForm.warehouse_id} onChange={(e) => setAreaForm({ ...areaForm, warehouse_id: Number(e.target.value) })}>
              <option value={0}>请选择</option>
              {warehouses
                .filter((w) => !areaForm.factory_id || !w.factory_id || w.factory_id === areaForm.factory_id)
                .map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}
            </select>
            <FieldLabel text="状态" />
            <select value={areaForm.status} onChange={(e) => setAreaForm({ ...areaForm, status: e.target.value })}>
              {AREA_STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <button className="primary" onClick={async () => {
              if (!areaForm.warehouse_id) {
                showToast("error", "请选择关联仓库");
                return;
              }
              try {
                await api.createArea({ ...areaForm, factory_id: areaForm.factory_id || null });
                setAreaForm({ code: "", name: "", material_type: "GENERAL", factory_id: 0, warehouse_id: 0, status: "ACTIVE", description: "" });
                setModal(null);
                await load();
                showToast("success", "区域创建成功");
              } catch (e) {
                showToast("error", (e as Error).message || "区域创建失败");
              }
            }}>保存</button>
          </div>
        </FormModal>
      )}

      {modal === "addLocation" && (
        <FormModal title="新增库位" onClose={() => setModal(null)}>
          <div className="form">
            <FieldLabel text="所属仓库" />
            <select value={locationForm.warehouse_id} onChange={(e) => setLocationForm({ ...locationForm, warehouse_id: Number(e.target.value) })}>
              <option value={0}>请选择仓库</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} - {w.name}</option>)}
            </select>
            <FieldLabel text="区域" />
            <select value={locationForm.area_id} onChange={(e) => setLocationForm({ ...locationForm, area_id: Number(e.target.value) })}>
              <option value={0}>请选择区域</option>
              {areas
                .filter((a) => !a.warehouse_id || a.warehouse_id === locationForm.warehouse_id)
                .map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}
            </select>
            <FieldLabel text="库位编号" />
            <input value={locationForm.code} onChange={(e) => setLocationForm({ ...locationForm, code: e.target.value })} />
            <FieldLabel text="库位名称" />
            <input value={locationForm.name} onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })} />
            <FieldLabel text="状态" />
            <select value={locationForm.status} onChange={(e) => setLocationForm({ ...locationForm, status: e.target.value })}>
              {LOCATION_STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <button className="primary" onClick={async () => {
              if (!locationForm.warehouse_id) {
                showToast("error", "请选择所属仓库");
                return;
              }
              if (!locationForm.area_id) {
                showToast("error", "请选择区域");
                return;
              }
              try {
                await api.createLocation({
                  warehouse_id: locationForm.warehouse_id,
                  area_id: locationForm.area_id,
                  code: locationForm.code,
                  name: locationForm.name,
                  status: locationForm.status
                });
                setLocationForm({ warehouse_id: locationForm.warehouse_id, area_id: 0, code: "", name: "", status: "ACTIVE" });
                setModal(null);
                await onRefresh();
                await load();
                showToast("success", "库位创建成功");
              } catch (e) {
                showToast("error", (e as Error).message || "库位创建失败");
              }
            }}>保存</button>
          </div>
        </FormModal>
      )}

      {modal === "addContainer" && (
        <FormModal title="新增容器" onClose={() => setModal(null)}>
          <div className="form">
            <FieldLabel text="容器编号" />
            <input value={containerForm.code} onChange={(e) => setContainerForm({ ...containerForm, code: e.target.value })} />
            <FieldLabel text="容器类型" />
            <select value={containerForm.container_type} onChange={(e) => setContainerForm({ ...containerForm, container_type: e.target.value })}>
              {CONTAINER_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <FieldLabel text="绑定库位(可选)" />
            <input placeholder="搜索库位编码/名称" value={containerLocationQuery} onChange={(e) => setContainerLocationQuery(e.target.value)} />
            <select value={containerForm.location_id} onChange={(e) => setContainerForm({ ...containerForm, location_id: Number(e.target.value) })}>
              <option value={0}>不绑定</option>
              {locations
                .filter((l) => !containerLocationQuery || `${l.code} ${l.name}`.toLowerCase().includes(containerLocationQuery.toLowerCase()))
                .map((l) => <option key={l.id} value={l.id}>{l.code} - {l.name}</option>)}
            </select>
            <FieldLabel text="描述" />
            <input value={containerForm.description} onChange={(e) => setContainerForm({ ...containerForm, description: e.target.value })} />
            <button className="primary" onClick={async () => {
              try {
                await api.createContainer({
                  code: containerForm.code,
                  container_type: containerForm.container_type,
                  location_id: containerForm.location_id || null,
                  description: containerForm.description
                });
                setContainerForm({ code: "", container_type: "BIN", location_id: 0, description: "" });
                setContainerLocationQuery("");
                setModal(null);
                await onRefresh();
                await load();
                showToast("success", "容器创建成功");
              } catch (e) {
                showToast("error", (e as Error).message || "容器创建失败");
              }
            }}>保存</button>
          </div>
        </FormModal>
      )}

      {tab === "warehouse" && (can("locations.read") || can("locations.write")) && (
        <div className="table table-5">
          <div className="thead"><span>编码</span><span>名称</span><span>所属工厂</span><span>关联库位数</span><span>操作</span></div>
          {warehouses.map((w) => {
            const linkedCount = locations.filter((l) => l.warehouse_id === w.id).length;
            return (
              <div key={w.id} className="rowline">
                <span>{w.code}</span>
                <span>{editWarehouse?.id === w.id ? <input value={editWarehouse.name} onChange={(e) => setEditWarehouse({ ...editWarehouse, name: e.target.value })} /> : w.name}</span>
                <span>
                  {editWarehouse?.id === w.id
                    ? <select value={editWarehouse.factory_id} onChange={(e) => setEditWarehouse({ ...editWarehouse, factory_id: Number(e.target.value) })}><option value={0}>无</option>{factories.map((f) => <option key={f.id} value={f.id}>{f.code}</option>)}</select>
                    : (factories.find((f) => f.id === w.factory_id)?.code || "-")}
                </span>
                <span>{linkedCount}</span>
                <span className="row">
                  {can("locations.write") && (editWarehouse?.id === w.id ? (
                    <>
                      <button className="primary" onClick={async () => {
                        try {
                          await api.updateWarehouse(w.id, { name: editWarehouse.name, factory_id: editWarehouse.factory_id || null });
                          setEditWarehouse(null);
                          await load();
                          showToast("success", "仓库更新成功");
                        } catch (e) {
                          showToast("error", (e as Error).message || "仓库更新失败");
                        }
                      }}>保存</button>
                      <button onClick={() => setEditWarehouse(null)}>取消</button>
                    </>
                  ) : <button onClick={() => setEditWarehouse({ id: w.id, name: w.name, factory_id: w.factory_id || 0 })}>编辑</button>)}
                  {can("locations.write") && <button onClick={async () => {
                    try {
                      await api.deleteWarehouse(w.id);
                      await load();
                      showToast("success", "仓库删除成功");
                    } catch (e) {
                      showToast("error", (e as Error).message || "仓库删除失败");
                    }
                  }}>删除</button>}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {tab === "factory" && can("areas.read") && (
        <div className="table table-6">
          <div className="thead"><span>编码</span><span>名称</span><span>类型</span><span>位置</span><span>状态</span><span>操作</span></div>
          {factories.map((f) => (
            <div key={f.id} className="rowline">
              <span>{f.code}</span>
              <span>{editFactory?.id === f.id ? <input value={editFactory.name} onChange={(e) => setEditFactory({ ...editFactory, name: e.target.value })} /> : f.name}</span>
              <span>
                {editFactory?.id === f.id
                  ? <select value={editFactory.factory_type} onChange={(e) => setEditFactory({ ...editFactory, factory_type: e.target.value })}>{FACTORY_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
                  : (FACTORY_TYPES.find((t) => t.value === f.factory_type)?.label || f.factory_type || "-")}
              </span>
              <span>{editFactory?.id === f.id ? <input value={editFactory.location} onChange={(e) => setEditFactory({ ...editFactory, location: e.target.value })} /> : (f.location || "-")}</span>
              <span>{editFactory?.id === f.id ? <select value={editFactory.status} onChange={(e) => setEditFactory({ ...editFactory, status: e.target.value })}>{FACTORY_STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select> : <StatusBadge value={f.status} />}</span>
              <span className="row">
                {can("areas.write") && (editFactory?.id === f.id ? (
                  <>
                    <button className="primary" onClick={async () => {
                      try {
                        await api.updateFactory(f.id, editFactory);
                        setEditFactory(null);
                        await load();
                        showToast("success", "工厂更新成功");
                      } catch (e) {
                        showToast("error", (e as Error).message || "工厂更新失败");
                      }
                    }}>保存</button>
                    <button onClick={() => setEditFactory(null)}>取消</button>
                  </>
                ) : <button onClick={() => setEditFactory({ id: f.id, name: f.name, location: f.location || "", description: f.description || "", factory_type: f.factory_type || "GENERAL", status: f.status || "ACTIVE" })}>编辑</button>)}
                {can("areas.write") && <button onClick={async () => {
                  try {
                    await api.deleteFactory(f.id);
                    await load();
                    showToast("success", "工厂删除成功");
                  } catch (e) {
                    showToast("error", (e as Error).message || "工厂删除失败");
                  }
                }}>删除</button>}
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === "area" && can("areas.read") && (
        <div className="table table-7">
          <div className="thead"><span>编码</span><span>名称</span><span>物料类型</span><span>工厂</span><span>仓库</span><span>状态</span><span>操作</span></div>
          {areas.map((a) => (
            <div key={a.id} className="rowline">
              <span>{a.code}</span>
              <span>{editArea?.id === a.id ? <input value={editArea.name} onChange={(e) => setEditArea({ ...editArea, name: e.target.value })} /> : a.name}</span>
              <span>{editArea?.id === a.id ? <select value={editArea.material_type} onChange={(e) => setEditArea({ ...editArea, material_type: e.target.value })}>{AREA_MATERIAL_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select> : (AREA_MATERIAL_TYPES.find((t) => t.value === a.material_type)?.label || a.material_type || "-")}</span>
              <span>{editArea?.id === a.id ? <select value={editArea.factory_id} onChange={(e) => setEditArea({ ...editArea, factory_id: Number(e.target.value) })}><option value={0}>无</option>{factories.map((f) => <option key={f.id} value={f.id}>{f.code}</option>)}</select> : (factories.find((f) => f.id === a.factory_id)?.code || "-")}</span>
              <span>{editArea?.id === a.id ? <select value={editArea.warehouse_id} onChange={(e) => setEditArea({ ...editArea, warehouse_id: Number(e.target.value) })}><option value={0}>无</option>{warehouses.filter((w) => !editArea.factory_id || !w.factory_id || w.factory_id === editArea.factory_id).map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}</select> : (warehouses.find((w) => w.id === a.warehouse_id)?.code || "-")}</span>
              <span>{editArea?.id === a.id ? <select value={editArea.status} onChange={(e) => setEditArea({ ...editArea, status: e.target.value })}>{AREA_STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select> : <StatusBadge value={a.status} />}</span>
              <span className="row">
                {can("areas.write") && (editArea?.id === a.id ? (
                  <>
                    <button className="primary" onClick={async () => {
                      try {
                        await api.updateArea(a.id, { ...editArea, factory_id: editArea.factory_id || null, warehouse_id: editArea.warehouse_id || null });
                        setEditArea(null);
                        await load();
                        showToast("success", "区域更新成功");
                      } catch (e) {
                        showToast("error", (e as Error).message || "区域更新失败");
                      }
                    }}>保存</button>
                    <button onClick={() => setEditArea(null)}>取消</button>
                  </>
                ) : <button onClick={() => setEditArea({ id: a.id, name: a.name, material_type: a.material_type || "GENERAL", factory_id: a.factory_id || 0, warehouse_id: a.warehouse_id || 0, status: a.status || "ACTIVE", description: a.description || "" })}>编辑</button>)}
                {can("areas.write") && <button onClick={async () => {
                  try {
                    await api.deleteArea(a.id);
                    await load();
                    showToast("success", "区域删除成功");
                  } catch (e) {
                    showToast("error", (e as Error).message || "区域删除失败");
                  }
                }}>删除</button>}
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === "location" && (can("locations.read") || can("locations.write")) && (
        <div className="table table-6">
          <div className="thead"><span>编号</span><span>名称</span><span>区域</span><span>状态</span><span>绑定状态</span><span>操作</span></div>
          {locations.map((l) => (
            <div key={l.id} className="rowline">
              <span>{l.code}</span>
              <span>{editLocation?.id === l.id ? <input value={editLocation.name} onChange={(e) => setEditLocation({ ...editLocation, name: e.target.value })} /> : l.name}</span>
              <span>{editLocation?.id === l.id ? <select value={editLocation.area_id} onChange={(e) => setEditLocation({ ...editLocation, area_id: Number(e.target.value) })}><option value={0}>无</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}</select> : (areas.find((a) => a.id === (l as any).area_id)?.code || "-")}</span>
              <span>{editLocation?.id === l.id ? <select value={editLocation.status} onChange={(e) => setEditLocation({ ...editLocation, status: e.target.value })}>{LOCATION_STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select> : <StatusBadge value={(l as any).status || "ACTIVE"} />}</span>
              <span><StatusBadge value={(l as any).binding_status || "UNBOUND"} /></span>
              <span className="row">
                {can("locations.write") && (editLocation?.id === l.id ? (
                  <>
                    <button className="primary" onClick={async () => {
                      try {
                        await api.updateLocation(l.id, { name: editLocation.name, area_id: editLocation.area_id || null, status: editLocation.status });
                        setEditLocation(null);
                        await onRefresh();
                        await load();
                        showToast("success", "库位更新成功");
                      } catch (e) {
                        showToast("error", (e as Error).message || "库位更新失败");
                      }
                    }}>保存</button>
                    <button onClick={() => setEditLocation(null)}>取消</button>
                  </>
                ) : <button onClick={() => setEditLocation({ id: l.id, area_id: ((l as any).area_id || 0), name: l.name, status: ((l as any).status || "ACTIVE") })}>编辑</button>)}
                {can("locations.write") && <button onClick={async () => {
                  try {
                    await api.deleteLocation(l.id);
                    await onRefresh();
                    await load();
                    showToast("success", "库位删除成功");
                  } catch (e) {
                    showToast("error", (e as Error).message || "库位删除失败");
                  }
                }}>删除</button>}
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === "layout" && (can("locations.read") || can("containers.read")) && (
        <div className="grid">
          {factories.map((f) => {
            const wList = warehouses.filter((w) => !w.factory_id || w.factory_id === f.id);
            return (
              <div key={`layout-f-${f.id}`} className="card">
                <h2>{f.code} - {f.name}</h2>
                {wList.map((w) => {
                  const aList = areas.filter((a) => !a.warehouse_id || a.warehouse_id === w.id);
                  return (
                    <div key={`layout-w-${w.id}`} className="card">
                      <h2>仓库: {w.code}</h2>
                      {aList.map((a) => {
                        const lList = locations.filter((l) => (l as any).area_id === a.id);
                        return (
                          <div key={`layout-a-${a.id}`}>
                            <div className="muted">区域: {a.code} ({a.name})</div>
                            <div className="layout-grid">
                              {lList.map((l) => {
                                const c = containers.find((x) => x.location_id === l.id);
                                return (
                                  <div key={`layout-l-${l.id}`} className="layout-cell">
                                    <div>{l.code}</div>
                                    <div><StatusBadge value={(l as any).status || "ACTIVE"} /></div>
                                    <div><StatusBadge value={(l as any).binding_status || "UNBOUND"} /></div>
                                    <div className="muted">{c ? `容器:${c.code}` : "无容器"}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {tab === "container" && (can("containers.read") || can("containers.write") || can("container_moves.write")) && (
        <div className="table table-7">
          <div className="thead"><span>编号</span><span>类型</span><span>状态</span><span>当前库位</span><span>绑定/移动</span><span>更新时间</span><span>操作</span></div>
          {containers.map((c) => (
            <div key={c.id} className="rowline">
              <span>{c.code}</span>
              <span>{editContainer?.id === c.id ? <select value={editContainer.container_type} onChange={(e) => setEditContainer({ ...editContainer, container_type: e.target.value })}>{CONTAINER_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select> : (CONTAINER_TYPES.find((t) => t.value === c.container_type)?.label || c.container_type || "-")}</span>
              <span>{editContainer?.id === c.id ? <select value={editContainer.status} onChange={(e) => setEditContainer({ ...editContainer, status: e.target.value })}>{CONTAINER_STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select> : <StatusBadge value={c.status} />}</span>
              <span>{c.location_id ? (locationById.get(c.location_id)?.code || c.location_id) : "未绑定"}</span>
              <span className="row">
                {can("containers.write") && !c.location_id && (
                  <select defaultValue={0} onChange={async (e) => {
                    const locationId = Number(e.target.value);
                    if (!locationId) return;
                    try {
                      await api.bindContainer(c.id, locationId);
                      await onRefresh();
                      await load();
                      showToast("success", "容器绑定成功");
                    } catch (err) {
                      showToast("error", (err as Error).message || "容器绑定失败");
                    }
                  }}>
                    <option value={0}>绑定到库位</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}
                  </select>
                )}
                {can("container_moves.write") && c.location_id && (
                  <select defaultValue={0} onChange={async (e) => {
                    const locationId = Number(e.target.value);
                    if (!locationId) return;
                    try {
                      await api.moveContainer(c.id, locationId, "ui move");
                      await onRefresh();
                      await load();
                      showToast("success", "容器移动成功");
                    } catch (err) {
                      showToast("error", (err as Error).message || "容器移动失败");
                    }
                  }}>
                    <option value={0}>移动到库位</option>
                    {locations.filter((l) => l.id !== c.location_id).map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}
                  </select>
                )}
              </span>
              <span>{formatDateTime(c.created_at)}</span>
              <span className="row">
                {can("containers.write") && (editContainer?.id === c.id ? (
                  <>
                    <button className="primary" onClick={async () => {
                      try {
                        await api.updateContainer(c.id, {
                          container_type: editContainer.container_type,
                          description: editContainer.description,
                          status: editContainer.status
                        });
                        setEditContainer(null);
                        await load();
                        showToast("success", "容器更新成功");
                      } catch (e) {
                        showToast("error", (e as Error).message || "容器更新失败");
                      }
                    }}>保存</button>
                    <button onClick={() => setEditContainer(null)}>取消</button>
                  </>
                ) : <button onClick={() => setEditContainer({ id: c.id, container_type: c.container_type || "BIN", description: c.description || "", status: c.status || "UNBOUND" })}>编辑</button>)}
                {can("containers.write") && c.location_id && <button onClick={async () => {
                  try {
                    await api.unbindContainer(c.id);
                    await onRefresh();
                    await load();
                    showToast("success", "容器解绑成功");
                  } catch (e) {
                    showToast("error", (e as Error).message || "容器解绑失败");
                  }
                }}>解绑</button>}
                {can("containers.write") && <button onClick={async () => {
                  try {
                    await api.deleteContainer(c.id);
                    await onRefresh();
                    await load();
                    showToast("success", "容器删除成功");
                  } catch (e) {
                    showToast("error", (e as Error).message || "容器删除失败");
                  }
                }}>删除</button>}
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === "container_stock" && (can("containers.read") || can("inventory.adjust")) && (
        <div className="grid">
          {can("inventory.adjust") && (
            <div className="card">
              <h2>容器库存维护</h2>
              <div className="form">
                <FieldLabel text="容器" />
                <select value={stockForm.container_id} onChange={(e) => setStockForm({ ...stockForm, container_id: Number(e.target.value) })}>
                  <option value={0}>选择容器</option>
                  {containers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                </select>
                <FieldLabel text="物料" />
                <select value={stockForm.material_id} onChange={(e) => setStockForm({ ...stockForm, material_id: Number(e.target.value) })}>
                  <option value={0}>选择物料</option>
                  {materials.map((m) => <option key={m.id} value={m.id}>{m.sku}</option>)}
                </select>
                <FieldLabel text="数量增减" />
                <input type="number" value={stockForm.delta} onChange={(e) => setStockForm({ ...stockForm, delta: Number(e.target.value) })} />
                <FieldLabel text="原因" />
                <input value={stockForm.reason} onChange={(e) => setStockForm({ ...stockForm, reason: e.target.value })} />
                <button className="primary" onClick={async () => {
                  try {
                    await api.adjustContainerStock(stockForm.container_id, { material_id: stockForm.material_id, delta: stockForm.delta, reason: stockForm.reason });
                    setStockForm({ container_id: 0, material_id: 0, delta: 0, reason: "manual" });
                    await onRefresh();
                    await load();
                    showToast("success", "容器库存调整成功");
                  } catch (e) {
                    showToast("error", (e as Error).message || "容器库存调整失败");
                  }
                }}>提交</button>
              </div>
            </div>
          )}

          <div className="card">
            <h2>容器库存列表</h2>
            <div className="table table-5">
              <div className="thead"><span>容器</span><span>物料</span><span>数量</span><span>预留</span><span>版本</span></div>
              {containerInventory.map((row) => (
                <div key={row.id} className="rowline">
                  <span>{containers.find((c) => c.id === row.container_id)?.code || row.container_id}</span>
                  <span>{materialById.get(row.material_id)?.sku || row.material_id}</span>
                  <span>{row.quantity}</span>
                  <span>{row.reserved}</span>
                  <span>{row.version}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "container_move" && can("container_moves.read") && (
        <div className="table table-6">
          <div className="thead"><span>容器</span><span>From</span><span>To</span><span>操作人</span><span>备注</span><span>时间</span></div>
          {containerMoves.slice(0, 100).map((m) => (
            <div key={m.id} className="rowline">
              <span>{containers.find((c) => c.id === m.container_id)?.code || m.container_id}</span>
              <span>{locationById.get(m.from_location_id)?.code || "-"}</span>
              <span>{locationById.get(m.to_location_id)?.code || "-"}</span>
              <span>{m.operator || "-"}</span>
              <span>{m.note || "-"}</span>
              <span>{formatDateTime(m.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
