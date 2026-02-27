import { useEffect, useState } from "react";
import { api } from "../api";

export default function UsersPage({ can }: { can: (perm: string) => boolean }) {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [form, setForm] = useState({ username: "", password: "", role_ids: [] as number[], is_active: 1 });
  const [editRoles, setEditRoles] = useState<Record<number, number[]>>({});

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
    <section className="grid">
      {can("users.write") && (
        <div className="card">
          <h2>新增用户</h2>
          <div className="form">
            <input placeholder="用户名" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <input type="password" placeholder="密码" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
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
            <label className="row">
              <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} />
              启用
            </label>
            <button className="primary" onClick={async () => { await api.createUser(form); await load(); }}>
              创建用户
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h2>用户列表</h2>
        <div className="list">
          {users.map((u) => (
            <div key={u.id} className="rowline">
              <span>{u.username} | {u.is_active ? "启用" : "停用"} | 角色: {(u.roles || []).join(", ")}</span>
              {can("users.write") && (
                <div className="row">
                  <div className="row">
                    {roles.map((r) => (
                      <label key={r.id} className="row">
                        <input
                          type="checkbox"
                          checked={(editRoles[u.id] || []).includes(r.id)}
                          onChange={(e) => {
                            setEditRoles((prev) => ({
                              ...prev,
                              [u.id]: e.target.checked
                                ? [...(prev[u.id] || []), r.id]
                                : (prev[u.id] || []).filter((id) => id !== r.id)
                            }));
                          }}
                        />
                        {r.name}
                      </label>
                    ))}
                  </div>
                  <button onClick={async () => { await api.updateUser(u.id, { role_ids: editRoles[u.id] || [] }); await load(); }}>
                    保存角色
                  </button>
                  <button onClick={async () => { await api.updateUser(u.id, { is_active: u.is_active ? 0 : 1 }); await load(); }}>
                    {u.is_active ? "停用" : "启用"}
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
