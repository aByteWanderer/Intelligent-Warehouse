import { ReactNode, useEffect, useState } from "react";
import SkeletonTable from "./SkeletonTable";

type Props = {
  children: ReactNode;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onResetData?: () => void;
  canResetData?: boolean;
  activePath: string;
  user?: { id: number; username: string } | null;
  onLogout?: () => void;
  navItems: { path: string; label: string }[];
};

export default function PageShell({ children, loading, error, onRefresh, onResetData, canResetData, activePath, user, onLogout, navItems }: Props) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="app">
      <header className="hero">
        <div>
          <a href="#/" className="brand">WMS Intelligent Warehouse</a>
          <p>入库、出库、库存、物料、分拣、打包与一致性控制。</p>
          {error && <div className="error">{error}</div>}
          {loading && <div className="muted">加载中...</div>}
        </div>
        <div className="hero-actions">
          <button className="ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? "浅色模式" : "深色模式"}
          </button>
          {user && (
            <div className="user-pill">
              <span>{user.username}</span>
              {onLogout && <button onClick={onLogout}>退出</button>}
            </div>
          )}
          {canResetData && onResetData && <button className="danger" onClick={onResetData}>清空业务数据</button>}
          <button onClick={onRefresh}>刷新数据</button>
        </div>
      </header>

      <nav className="tabs">
        {navItems.map((item) => (
          <a
            key={item.path}
            href={`#${item.path}`}
            className={activePath === item.path ? "active" : ""}
          >
            {item.label}
          </a>
        ))}
      </nav>

      {loading ? <SkeletonTable rows={6} /> : children}
    </div>
  );
}
