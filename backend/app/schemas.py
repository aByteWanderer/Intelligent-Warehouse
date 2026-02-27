from pydantic import BaseModel, Field


class WarehouseCreate(BaseModel):
    code: str
    name: str


class LocationCreate(BaseModel):
    warehouse_id: int
    code: str
    name: str


class MaterialCreate(BaseModel):
    sku: str
    name: str
    unit: str = "pcs"
    category: str = "general"
    is_common: int = 0


class MaterialUpdate(BaseModel):
    sku: str | None = None
    name: str | None = None
    unit: str | None = None
    category: str | None = None
    is_common: int | None = None
    is_active: int | None = None


class MaterialCommonUpdate(BaseModel):
    is_common: int = Field(0, ge=0, le=1)


class InventoryAdjust(BaseModel):
    material_id: int
    location_id: int
    delta: int
    reason: str = "manual"


class OrderLineCreate(BaseModel):
    material_id: int
    qty: int


class InboundCreate(BaseModel):
    order_no: str
    supplier: str = ""
    location_id: int
    lines: list[OrderLineCreate]


class OutboundCreate(BaseModel):
    order_no: str
    customer: str = ""
    source_location_id: int
    staging_location_id: int | None = None
    lines: list[OrderLineCreate]


class OutboundReserve(BaseModel):
    force: int = Field(0, ge=0, le=1)


class OutboundPick(BaseModel):
    staging_location_id: int


class OutboundPack(BaseModel):
    pack_all: int = Field(1, ge=0, le=1)


class OutboundShip(BaseModel):
    ship_all: int = Field(1, ge=0, le=1)


class LoginRequest(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    password: str
    role_ids: list[int] = []
    is_active: int = 1


class UserUpdate(BaseModel):
    password: str | None = None
    role_ids: list[int] | None = None
    is_active: int | None = None


class RoleCreate(BaseModel):
    name: str
    description: str = ""
    permission_codes: list[str] = []


class RoleUpdate(BaseModel):
    description: str | None = None
    permission_codes: list[str] | None = None
