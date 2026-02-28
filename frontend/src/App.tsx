import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import PageShell from "./components/PageShell";
import { useWmsData } from "./hooks/useWmsData";
import Dashboard from "./pages/Dashboard";
import Materials from "./pages/Materials";
import InventoryPage from "./pages/Inventory";
import InventoryAdjust from "./pages/InventoryAdjust";
import InboundPage from "./pages/Inbound";
import OutboundPage from "./pages/Outbound";
import OrdersPage from "./pages/Orders";
import RecordsPage from "./pages/Records";
import DocsPage from "./pages/Docs";
import LoginPage from "./pages/Login";
import UsersPage from "./pages/Users";
import RolesPage from "./pages/Roles";
import StoragePage from "./pages/Storage";

function getHashPath() {
  const hash = window.location.hash || "#/";
  const path = hash.replace(/^#/, "");
  return path || "/";
}

export default function App() {
  const data = useWmsData();
  const [orderLines, setOrderLines] = useState<Record<number, any[]>>({});
  const [path, setPath] = useState(getHashPath());
  const [user, setUser] = useState<{ id: number; username: string } | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);

  useEffect(() => {
    const onHash = () => setPath(getHashPath());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("wms_token");
    if (!token) return;
    api.me().then((res: any) => {
      setUser({ id: res.id, username: res.username });
      setPermissions(res.permissions || []);
      data.refreshAll(includeInactive ? 1 : 0, res.permissions || []);
    }).catch(() => {
      localStorage.removeItem("wms_token");
      setUser(null);
      setPermissions([]);
    });
  }, []);

  function can(code: string) {
    return permissions.includes(code);
  }

  async function loadLines(orderId: number) {
    const lines = await data.getOrderLines(orderId);
    setOrderLines((prev) => ({ ...prev, [orderId]: lines }));
  }

  function locName(id?: number | null) {
    if (!id) return "-";
    return data.locationById.get(id)?.code ?? `#${id}`;
  }

  function matName(id?: number | null) {
    if (!id) return "-";
    const m = data.materialById.get(id);
    return m ? `${m.sku} ${m.name}` : `#${id}`;
  }

  const navItems = useMemo(() => {
    const items = [{ path: "/", label: "总览" } as { path: string; label: string }];
    if (can("materials.read")) items.push({ path: "/materials", label: "物料" });
    if (can("inventory.read")) items.push({ path: "/inventory", label: "库存" });
    if (can("orders.read")) items.push({ path: "/inbound", label: "入库" }, { path: "/outbound", label: "出库" }, { path: "/orders", label: "订单" });
    if (can("locations.read") || can("areas.read") || can("containers.read")) items.push({ path: "/storage", label: "库位管理" });
    if (can("stock_moves.read")) items.push({ path: "/records", label: "记录" });
    if (can("users.read")) items.push({ path: "/users", label: "用户" });
    if (can("roles.read")) items.push({ path: "/roles", label: "角色" });
    items.push({ path: "/docs", label: "操作文档" });
    return items;
  }, [permissions.join("|")]);

  if (!user) {
    return (
      <LoginPage
        onLogin={(token, u, perms) => {
          localStorage.setItem("wms_token", token);
          setUser(u);
          setPermissions(perms);
          data.refreshAll(includeInactive ? 1 : 0, perms || []);
        }}
      />
    );
  }

  const page = (() => {
    if (path === "/materials") {
      if (!can("materials.read")) return <section className="card">无权限访问物料</section>;
      return (
        <Materials
          materials={data.materials}
          onRefresh={() => data.refreshAll(includeInactive ? 1 : 0, permissions)}
          can={can}
          includeInactive={includeInactive}
          onToggleInactive={(v) => { setIncludeInactive(v); data.refreshAll(v ? 1 : 0, permissions); }}
        />
      );
    }
    if (path === "/inventory") {
      if (!can("inventory.read")) return <section className="card">无权限访问库存</section>;
      return (
        <div className="grid">
          <InventoryPage inventory={data.inventory} materialName={matName} locationName={locName} />
          {can("inventory.adjust") && (
            <InventoryAdjust materials={data.materials} locations={data.locations} onRefresh={() => data.refreshAll(includeInactive ? 1 : 0, permissions)} />
          )}
        </div>
      );
    }
    if (path === "/inbound") {
      if (!can("orders.read")) return <section className="card">无权限访问入库</section>;
      return (
        <InboundPage
          materials={data.materials}
          locations={data.locations}
          orders={data.orders}
          onRefresh={() => data.refreshAll(includeInactive ? 1 : 0, permissions)}
          loadLines={loadLines}
          orderLines={orderLines}
          materialName={matName}
          can={can}
        />
      );
    }
    if (path === "/outbound") {
      if (!can("orders.read")) return <section className="card">无权限访问出库</section>;
      return (
        <OutboundPage
          materials={data.materials}
          locations={data.locations}
          orders={data.orders}
          onRefresh={() => data.refreshAll(includeInactive ? 1 : 0, permissions)}
          loadLines={loadLines}
          orderLines={orderLines}
          materialName={matName}
          can={can}
        />
      );
    }
    if (path === "/orders") {
      if (!can("orders.read")) return <section className="card">无权限访问订单</section>;
      return (
        <OrdersPage
          orders={data.orders}
          loadLines={loadLines}
          orderLines={orderLines}
          materialName={matName}
        />
      );
    }
    if (path === "/records") {
      if (!can("stock_moves.read")) return <section className="card">无权限访问记录</section>;
      return (
        <RecordsPage
          stockMoves={data.stockMoves}
          operationLogs={data.operationLogs}
          materialName={matName}
          locationName={locName}
        />
      );
    }
    if (path === "/users") {
      if (!can("users.read")) return <section className="card">无权限访问用户</section>;
      return <UsersPage can={can} />;
    }
    if (path === "/roles") {
      if (!can("roles.read")) return <section className="card">无权限访问角色</section>;
      return <RolesPage can={can} />;
    }
    if (path === "/storage") {
      if (!(can("locations.read") || can("areas.read") || can("containers.read"))) return <section className="card">无权限访问库位管理</section>;
      return <StoragePage locations={data.locations} materials={data.materials} can={can} onRefresh={() => data.refreshAll(includeInactive ? 1 : 0, permissions)} />;
    }
    if (path === "/docs") return <DocsPage />;
    return (
      <Dashboard
        materials={data.materials}
        inventory={data.inventory}
        orders={data.orders}
        stockMoves={data.stockMoves}
        materialName={matName}
        locationName={locName}
      />
    );
  })();

  return (
    <PageShell
      loading={data.loading}
      error={data.error}
      onRefresh={() => data.refreshAll(includeInactive ? 1 : 0, permissions)}
      canResetData={can("system.setup")}
      onResetData={async () => {
        if (!window.confirm("确认清空业务数据？将删除订单、库存、物料、仓库/区域/库位/容器等业务数据。")) return;
        await api.resetBusinessData({ include_master_data: 1 });
        await data.refreshAll(includeInactive ? 1 : 0, permissions);
      }}
      activePath={path}
      user={user}
      onLogout={async () => { await api.logout(); localStorage.removeItem("wms_token"); setUser(null); setPermissions([]); }}
      navItems={navItems}
    >
      {page}
    </PageShell>
  );
}
