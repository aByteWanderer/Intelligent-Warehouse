import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

const PERM_GROUPS: { title: string; match: (code: string) => boolean }[] = [
  { title: "物料", match: (code) => code.startsWith("materials.") },
  { title: "库存", match: (code) => code.startsWith("inventory.") || code.startsWith("stock_moves.") },
  { title: "订单/出入库", match: (code) => code.startsWith("orders.") || code.startsWith("inbound.") || code.startsWith("outbound.") },
  { title: "用户与角色", match: (code) => code.startsWith("users.") || code.startsWith("roles.") },
  { title: "系统", match: (code) => code.startsWith("system.") }
];

export default function RolesPage({ can }: { can: (perm: string) => boolean }) {
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<{ code: string; description: string }[]>([]);
  const [form, setForm] = useState({ name: "", description: "", permission_codes: [] as string[] });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [edit, setEdit] = useState({ description: "", permission_codes: [] as string[] });

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
    <section className="grid">
      {can("roles.write") && (
        <div className="card">
          <h2>新增角色</h2>
          <div className="form">
            <input placeholder="角色名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input placeholder="描述" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            {renderPermCheckboxes(form.permission_codes, (next) => setForm({ ...form, permission_codes: next }))}
            <button className="primary" onClick={async () => { await api.createRole(form); await load(); }}>
              创建角色
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h2>角色列表</h2>
        <div className="list">
          {roles.map((r) => (
            <div key={r.id} className="rowline">
              {editingId === r.id ? (
                <div className="form">
                  <input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
                  {renderPermCheckboxes(edit.permission_codes, (next) => setEdit({ ...edit, permission_codes: next }))}
                </div>
              ) : (
                <div>
                  <div>{r.name} | {r.description}</div>
                  <div className="lines">权限: {(r.permissions || []).map((code: string) => permLabel(code)).join(", ")}</div>
                </div>
              )}
              {can("roles.write") && (
                <div className="row">
                  {editingId === r.id ? (
                    <>
                      <button className="primary" onClick={async () => { await api.updateRole(r.id, edit); setEditingId(null); await load(); }}>
                        保存
                      </button>
                      <button onClick={() => setEditingId(null)}>取消</button>
                    </>
                  ) : (
                    <button onClick={() => { setEditingId(r.id); setEdit({ description: r.description ?? "", permission_codes: r.permissions || [] }); }}>编辑</button>
                  )}
                  <button onClick={async () => {
                    const ok = window.confirm(`删除角色 ${r.name}?`);
                    if (!ok) return;
                    await api.deleteRole(r.id);
                    await load();
                  }}>
                    删除
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
