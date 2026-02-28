import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import FieldLabel from "../components/FieldLabel";
import FormModal from "../components/FormModal";
import Toast from "../components/Toast";
import { useToast } from "../hooks/useToast";

const PERM_GROUPS: { title: string; match: (code: string) => boolean }[] = [
  { title: "物料", match: (code) => code.startsWith("materials.") },
  { title: "库存", match: (code) => code.startsWith("inventory.") || code.startsWith("stock_moves.") },
  { title: "订单/出入库", match: (code) => code.startsWith("orders.") || code.startsWith("inbound.") || code.startsWith("outbound.") },
  { title: "库位/区域/容器", match: (code) => code.startsWith("locations.") || code.startsWith("areas.") || code.startsWith("containers.") || code.startsWith("container_moves.") },
  { title: "用户与角色", match: (code) => code.startsWith("users.") || code.startsWith("roles.") },
  { title: "系统", match: (code) => code.startsWith("system.") }
];

export default function RolesPage({ can }: { can: (perm: string) => boolean }) {
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<{ code: string; description: string }[]>([]);
  const [form, setForm] = useState({ name: "", description: "", permission_codes: [] as string[] });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [edit, setEdit] = useState({ description: "", permission_codes: [] as string[] });
  const [showCreate, setShowCreate] = useState(false);
  const { toast, showToast } = useToast();

  async function load() {
    const [r, p] = await Promise.all([api.listRoles(), api.listPermissions()]);
    setRoles(r as any[]);
    setPermissions(p as any[]);
  }

  useEffect(() => {
    if (can("roles.read")) {
      load();
    }
  }, []);

  if (!can("roles.read")) {
    return <section className="card">无权限访问角色管理</section>;
  }

  const permLabel = (code: string) => permissions.find((p) => p.code === code)?.description ?? code;

  const grouped = useMemo(() => {
    const groups: Record<string, { code: string; description: string }[]> = {};
    permissions.forEach((perm) => {
      const group = PERM_GROUPS.find((g) => g.match(perm.code))?.title ?? "其他";
      if (!groups[group]) groups[group] = [];
      groups[group].push(perm);
    });
    return groups;
  }, [permissions]);

  const renderPermCheckboxes = (selected: string[], onChange: (next: string[]) => void) => (
    <div className="perm-groups">
      {Object.entries(grouped).map(([group, items]) => (
        <div key={group} className="perm-group">
          <div className="perm-title">{group}</div>
          <div className="row">
            {items.map((perm) => (
              <label key={perm.code} className="row">
                <input
                  type="checkbox"
                  checked={selected.includes(perm.code)}
                  onChange={(e) => {
                    onChange(
                      e.target.checked
                        ? [...selected, perm.code]
                        : selected.filter((p) => p !== perm.code)
                    );
                  }}
                />
                {perm.description} ({perm.code})
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <section className="card">
      <div className="title-row">
        <h2>角色管理</h2>
        {can("roles.write") && <button className="primary" onClick={() => setShowCreate(true)}>新增角色</button>}
      </div>

      <Toast toast={toast} />

      {showCreate && (
        <FormModal title="新增角色" onClose={() => setShowCreate(false)}>
          <div className="form">
            <FieldLabel text="角色名称" />
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <FieldLabel text="描述" />
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <FieldLabel text="权限" />
            {renderPermCheckboxes(form.permission_codes, (next) => setForm({ ...form, permission_codes: next }))}
            <button className="primary" onClick={async () => {
              try {
                await api.createRole(form);
                setForm({ name: "", description: "", permission_codes: [] });
                setShowCreate(false);
                await load();
                showToast("success", "角色创建成功");
              } catch (e) {
                showToast("error", (e as Error).message || "角色创建失败");
              }
            }}>
              创建角色
            </button>
          </div>
        </FormModal>
      )}

      <div className="table table-4">
        <div className="thead">
          <span>角色名称</span>
          <span>描述</span>
          <span>权限</span>
          <span>操作</span>
        </div>
        {roles.map((role) => (
          <div key={role.id} className="rowline">
            <span>{role.name}</span>
            <span>{editingId === role.id ? <input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /> : (role.description || "-")}</span>
            <span title={(role.permissions || []).map((code: string) => permLabel(code)).join(";")}>
              {(role.permissions || []).map((code: string) => permLabel(code)).join(";") || "-"}
            </span>
            <span className="row">
              {can("roles.write") && (editingId === role.id ? (
                <>
                  <button className="primary" onClick={async () => {
                    try {
                      await api.updateRole(role.id, edit);
                      setEditingId(null);
                      await load();
                      showToast("success", "角色更新成功");
                    } catch (e) {
                      showToast("error", (e as Error).message || "角色更新失败");
                    }
                  }}>保存</button>
                  <button onClick={() => setEditingId(null)}>取消</button>
                </>
              ) : (
                <button onClick={() => {
                  setEditingId(role.id);
                  setEdit({
                    description: role.description || "",
                    permission_codes: role.permissions || []
                  });
                }}>编辑</button>
              ))}
              {can("roles.write") && (
                <button onClick={async () => {
                  try {
                    await api.deleteRole(role.id);
                    await load();
                    showToast("success", "角色删除成功");
                  } catch (e) {
                    showToast("error", (e as Error).message || "角色删除失败");
                  }
                }}>删除</button>
              )}
            </span>
            {editingId === role.id && (
              <div className="lines">
                <div>权限调整:</div>
                {renderPermCheckboxes(edit.permission_codes, (next) => setEdit({ ...edit, permission_codes: next }))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
