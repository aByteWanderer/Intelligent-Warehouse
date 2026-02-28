const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";
const idempotencyCache = new Map<string, { key: string; ts: number }>();

function getToken() {
  return localStorage.getItem("wms_token");
}

function buildIdempotencyKey(method: string, path: string, body?: BodyInit | null) {
  const signature = `${method}:${path}:${typeof body === "string" ? body : ""}`;
  const now = Date.now();
  const hit = idempotencyCache.get(signature);
  if (hit && now - hit.ts < 5000) {
    return hit.key;
  }
  const key = `${now}-${Math.random().toString(36).slice(2)}`;
  idempotencyCache.set(signature, { key, ts: now });
  return key;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const method = (options.method || "GET").toUpperCase();
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Request-Source": "wms-web" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (method !== "GET") {
    headers["Idempotency-Key"] = buildIdempotencyKey(method, path, options.body || null);
  }
  const optionHeaders = (options.headers || {}) as Record<string, string>;

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { ...headers, ...optionHeaders },
    ...options
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      if (Array.isArray(data?.detail)) {
        msg = data.detail.map((item: any) => item?.msg || "").filter(Boolean).join("; ");
      } else {
        msg = data?.detail || data?.message || JSON.stringify(data);
      }
    } catch {
      const text = await res.text();
      msg = text || msg;
    }
    throw new Error(msg);
  }
  if (res.status === 204) return {} as T;
  return res.json();
}

export const api = {
  login: (body: unknown) => request("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  me: () => request("/auth/me"),
  logout: () => request("/auth/logout", { method: "POST" }),
  listPermissions: () => request("/permissions"),
  listUsers: () => request("/users"),
  createUser: (body: unknown) => request("/users", { method: "POST", body: JSON.stringify(body) }),
  updateUser: (id: number, body: unknown) => request(`/users/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  listRoles: () => request("/roles"),
  createRole: (body: unknown) => request("/roles", { method: "POST", body: JSON.stringify(body) }),
  updateRole: (id: number, body: unknown) => request(`/roles/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteRole: (id: number) => request(`/roles/${id}`, { method: "DELETE" }),
  setupDemo: () => request("/setup/demo", { method: "POST" }),
  listWarehouses: () => request("/warehouses"),
  createWarehouse: (body: unknown) => request("/warehouses", { method: "POST", body: JSON.stringify(body) }),
  updateWarehouse: (id: number, body: unknown) => request(`/warehouses/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteWarehouse: (id: number) => request(`/warehouses/${id}`, { method: "DELETE" }),
  listLocations: () => request("/locations"),
  createLocation: (body: unknown) => request("/locations", { method: "POST", body: JSON.stringify(body) }),
  updateLocation: (id: number, body: unknown) => request(`/locations/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteLocation: (id: number) => request(`/locations/${id}`, { method: "DELETE" }),
  listFactories: () => request("/factories"),
  createFactory: (body: unknown) => request("/factories", { method: "POST", body: JSON.stringify(body) }),
  updateFactory: (id: number, body: unknown) => request(`/factories/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteFactory: (id: number) => request(`/factories/${id}`, { method: "DELETE" }),
  listAreas: () => request("/areas"),
  createArea: (body: unknown) => request("/areas", { method: "POST", body: JSON.stringify(body) }),
  updateArea: (id: number, body: unknown) => request(`/areas/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteArea: (id: number) => request(`/areas/${id}`, { method: "DELETE" }),
  listContainers: () => request("/containers"),
  createContainer: (body: unknown) => request("/containers", { method: "POST", body: JSON.stringify(body) }),
  updateContainer: (id: number, body: unknown) => request(`/containers/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteContainer: (id: number) => request(`/containers/${id}`, { method: "DELETE" }),
  bindContainer: (id: number, location_id: number) => request(`/containers/${id}/bind`, { method: "POST", body: JSON.stringify({ location_id }) }),
  unbindContainer: (id: number) => request(`/containers/${id}/unbind`, { method: "POST" }),
  moveContainer: (id: number, to_location_id: number, note = "") => request(`/containers/${id}/move`, { method: "POST", body: JSON.stringify({ to_location_id, note }) }),
  listContainerInventory: () => request("/container_inventory"),
  adjustContainerStock: (id: number, body: unknown) => request(`/containers/${id}/stock/adjust`, { method: "POST", body: JSON.stringify(body) }),
  listContainerMoves: () => request("/container_moves"),
  listMaterials: (include_inactive = 0) => request(`/materials?include_inactive=${include_inactive}`),
  createMaterial: (body: unknown) => request("/materials", { method: "POST", body: JSON.stringify(body) }),
  updateMaterial: (id: number, body: unknown) => request(`/materials/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteMaterial: (id: number, force = 0) => request(`/materials/${id}?force=${force}`, { method: "DELETE" }),
  setMaterialCommon: (id: number, is_common: number) =>
    request(`/materials/${id}/common`, { method: "POST", body: JSON.stringify({ is_common }) }),
  listInventory: () => request("/inventory"),
  adjustInventory: (body: unknown) => request("/inventory/adjust", { method: "POST", body: JSON.stringify(body) }),
  createInbound: (body: unknown) => request("/inbounds", { method: "POST", body: JSON.stringify(body) }),
  receiveInbound: (id: number) => request(`/inbounds/${id}/receive`, { method: "POST" }),
  createOutbound: (body: unknown) => request("/outbounds", { method: "POST", body: JSON.stringify(body) }),
  reserveOutbound: (id: number) => request(`/outbounds/${id}/reserve`, { method: "POST", body: JSON.stringify({ force: 0 }) }),
  pickOutbound: (id: number, staging_location_id: number) =>
    request(`/outbounds/${id}/pick`, { method: "POST", body: JSON.stringify({ staging_location_id }) }),
  packOutbound: (id: number) => request(`/outbounds/${id}/pack`, { method: "POST", body: JSON.stringify({ pack_all: 1 }) }),
  shipOutbound: (id: number) => request(`/outbounds/${id}/ship`, { method: "POST", body: JSON.stringify({ ship_all: 1 }) }),
  listOrders: () => request("/orders"),
  listOrderLines: (id: number) => request(`/orders/${id}/lines`),
  listStockMoves: () => request("/stock_moves"),
  listOperationLogs: () => request("/operation_logs"),
  resetBusinessData: (body: { include_master_data: number }) => request("/setup/reset", { method: "POST", body: JSON.stringify(body) })
};
