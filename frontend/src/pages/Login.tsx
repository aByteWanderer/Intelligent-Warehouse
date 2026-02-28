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
  const [submitting, setSubmitting] = useState(false);

  function normalizeError(message: string) {
    if (message.includes("invalid credentials")) return "用户名或密码错误，请重新输入。";
    if (message.includes("inactive user")) return "当前账号已被停用，请联系管理员。";
    if (message.includes("Failed to fetch")) return "无法连接后端服务，请确认后端已启动。";
    return `登录失败：${message}`;
  }

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
            disabled={submitting}
            onClick={async () => {
              try {
                setSubmitting(true);
                setError(null);
                const res = await api.login({ username, password }) as any;
                localStorage.setItem("wms_token", res.token);
                onLogin(res.token, res.user, res.permissions || []);
              } catch (err) {
                setError(normalizeError((err as Error).message || "Login failed"));
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? "登录中..." : "登录"}
          </button>
        </div>
        <div className="muted">默认账号：admin / admin</div>
      </div>
    </div>
  );
}
