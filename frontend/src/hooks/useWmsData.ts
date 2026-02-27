import { useMemo, useState } from "react";
import { api } from "../api";

type Material = {
  id: number;
  sku: string;
  name: string;
  unit: string;
  category: string;
  is_common: number;
  is_active: number;
};

type Location = { id: number; code: string; name: string; warehouse_id: number };

type Inventory = {
  id: number;
  material_id: number;
  location_id: number;
  quantity: number;
  reserved: number;
  version: number;
};

type Order = {
  id: number;
  order_no: string;
  order_type: string;
  status: string;
  partner?: string;
  source_location_id?: number | null;
  target_location_id?: number | null;
};

type OrderLine = { id: number; material_id: number; material_name?: string | null; material_sku?: string | null; qty: number; reserved_qty: number; picked_qty: number; packed_qty: number };

type StockMove = { id: number; material_id: number; qty: number; move_type: string; from_location_id: number | null; to_location_id: number | null };

type WmsData = {
  materials: Material[];
  locations: Location[];
  inventory: Inventory[];
  orders: Order[];
  stockMoves: StockMove[];
  loading: boolean;
  error: string | null;
  refreshAll: (includeInactive?: number, permissions?: string[]) => Promise<void>;
  materialById: Map<number, Material>;
  locationById: Map<number, Location>;
  getOrderLines: (orderId: number) => Promise<OrderLine[]>;
};

export function useWmsData(): WmsData {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stockMoves, setStockMoves] = useState<StockMove[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const materialById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const locationById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  async function refreshAll(includeInactive = 0, permissions: string[] = []) {
    try {
      setLoading(true);
      setError(null);
      const tasks: Promise<any>[] = [];
      const pushOrEmpty = (condition: boolean, fn: () => Promise<any>) => {
        tasks.push(condition ? fn() : Promise.resolve([]));
      };

      pushOrEmpty(permissions.includes("materials.read"), () => api.listMaterials(includeInactive));
      pushOrEmpty(permissions.includes("materials.read"), () => api.listLocations());
      pushOrEmpty(permissions.includes("inventory.read"), () => api.listInventory());
      pushOrEmpty(permissions.includes("orders.read"), () => api.listOrders());
      pushOrEmpty(permissions.includes("stock_moves.read"), () => api.listStockMoves());

      const [m, l, i, o, s] = await Promise.all(tasks);

      if (permissions.includes("materials.read")) {
        setMaterials(m as Material[]);
        setLocations(l as Location[]);
      } else {
        setMaterials([]);
        setLocations([]);
      }
      setInventory(permissions.includes("inventory.read") ? (i as Inventory[]) : []);
      setOrders(permissions.includes("orders.read") ? (o as Order[]) : []);
      setStockMoves(permissions.includes("stock_moves.read") ? (s as StockMove[]) : []);
    } catch (err) {
      setError((err as Error).message || "Request failed");
    } finally {
      setLoading(false);
    }
  }

  async function getOrderLines(orderId: number) {
    const lines = await api.listOrderLines(orderId);
    return lines as OrderLine[];
  }

  return {
    materials,
    locations,
    inventory,
    orders,
    stockMoves,
    loading,
    error,
    refreshAll,
    materialById,
    locationById,
    getOrderLines
  };
}

export type { Material, Location, Inventory, Order, OrderLine, StockMove };
