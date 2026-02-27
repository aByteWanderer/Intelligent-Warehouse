import { useState } from "react";
import { api } from "../api";

export default function LoginPage({
  onLogin
}: {
  onLogin: (token: string, user: { id: number; username: string }, permissions: string[]) => void;
}) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="login">
      <div className="card">
        <h2>登录</h2>
        {error && <div className="error">{error}</div>}
        <div className="form">
          <input placeholder="用户名" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button
            className="primary"
            onClick={async () => {
              try {
                setError(null);
                const res = await api.login({ username, password }) as any;
                localStorage.setItem("wms_token", res.token);
                onLogin(res.token, res.user, res.permissions || []);
              } catch (err) {
                setError((err as Error).message || "Login failed");
              }
            }}
          >
            登录
          </button>
        </div>
        <div className="muted">默认账号：admin / admin</div>
      </div>
    </div>
  );
}
