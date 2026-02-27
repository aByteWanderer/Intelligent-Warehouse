const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

function getToken() {
  return localStorage.getItem("wms_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
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
  listLocations: () => request("/locations"),
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
  listStockMoves: () => request("/stock_moves")
};
