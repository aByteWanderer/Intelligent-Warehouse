import { useEffect, useState } from "react";
import { api } from "../api";
import FieldLabel from "../components/FieldLabel";
import FormModal from "../components/FormModal";
import Toast from "../components/Toast";
import { useToast } from "../hooks/useToast";

export default function UsersPage({ can }: { can: (perm: string) => boolean }) {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [form, setForm] = useState({ username: "", password: "", role_ids: [] as number[], is_active: 1 });
  const [editRoles, setEditRoles] = useState<Record<number, number[]>>({});
  const [showCreate, setShowCreate] = useState(false);
  const { toast, showToast } = useToast();

  async function load() {
    const [u, r] = await Promise.all([api.listUsers(), api.listRoles()]);
    setUsers(u as any[]);
    setRoles(r as any[]);
    const map: Record<number, number[]> = {};
    (u as any[]).forEach((user) => {
      const roleIds = (r as any[])
        .filter((role) => (user.roles || []).includes(role.name))
        .map((role) => role.id);
      map[user.id] = roleIds;
    });
    setEditRoles(map);
  }

  useEffect(() => {
    if (can("users.read")) {
      load();
    }
  }, []);

  if (!can("users.read")) {
    return <section className="card">无权限访问用户管理</section>;
  }

  return (
    <section className="card">
      <div className="title-row">
        <h2>用户列表</h2>
        {can("users.write") && <button className="primary" onClick={() => setShowCreate(true)}>新增用户</button>}
      </div>

      <Toast toast={toast} />

      {showCreate && (
        <FormModal title="新增用户" onClose={() => setShowCreate(false)}>
          <div className="form">
            <FieldLabel text="用户名" />
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <FieldLabel text="密码" />
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <FieldLabel text="角色" />
            <div className="row">
              {roles.map((r) => (
                <label key={r.id} className="row">
                  <input
                    type="checkbox"
                    checked={form.role_ids.includes(r.id)}
                    onChange={(e) => {
                      setForm((prev) => ({
                        ...prev,
                        role_ids: e.target.checked
                          ? [...prev.role_ids, r.id]
                          : prev.role_ids.filter((id) => id !== r.id)
                      }));
                    }}
                  />
                  {r.name}
                </label>
              ))}
            </div>
            <FieldLabel text="启用状态" />
            <label className="row">
              <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} />
              启用
            </label>
            <button className="primary" onClick={async () => {
              try {
                await api.createUser(form);
                await load();
                setForm({ username: "", password: "", role_ids: [], is_active: 1 });
                setShowCreate(false);
                showToast("success", "用户创建成功");
              } catch (e) {
                showToast("error", (e as Error).message || "用户创建失败");
              }
            }}>
              创建用户
            </button>
          </div>
        </FormModal>
      )}

      <div className="table table-4">
        <div className="thead">
          <span>用户名</span>
          <span>状态</span>
          <span>角色</span>
          <span>操作</span>
        </div>
        {users.map((u) => (
          <div key={u.id} className="rowline">
            <span title={u.username}>{u.username}</span>
            <span>{u.is_active ? "启用" : "停用"}</span>
            <span title={(u.roles || []).join(", ") || "-"}>{(u.roles || []).join(", ") || "-"}</span>
            <span className="row">
              {can("users.write") && (
                <>
                  <button onClick={async () => {
                    try {
                      await api.updateUser(u.id, { is_active: u.is_active ? 0 : 1 });
                      await load();
                      showToast("success", "用户状态已更新");
                    } catch (e) {
                      showToast("error", (e as Error).message || "更新失败");
                    }
                  }}>
                    {u.is_active ? "停用" : "启用"}
                  </button>
                  <button onClick={async () => {
                    try {
                      await api.updateUser(u.id, { role_ids: editRoles[u.id] || [] });
                      await load();
                      showToast("success", "角色分配已更新");
                    } catch (e) {
                      showToast("error", (e as Error).message || "角色更新失败");
                    }
                  }}>保存角色</button>
                </>
              )}
            </span>
            {can("users.write") && (
              <div className="lines">
                角色分配:
                <div className="row">
                  {roles.map((r) => (
                    <label key={`${u.id}-${r.id}`} className="row">
                      <input
                        type="checkbox"
                        checked={(editRoles[u.id] || []).includes(r.id)}
                        onChange={(e) => {
                          setEditRoles((prev) => {
                            const curr = prev[u.id] || [];
                            return {
                              ...prev,
                              [u.id]: e.target.checked ? [...curr, r.id] : curr.filter((id) => id !== r.id)
                            };
                          });
                        }}
                      />
                      {r.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
