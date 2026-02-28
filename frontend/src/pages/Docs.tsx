export default function DocsPage() {
  return (
    <section className="card">
      <h2>操作文档</h2>
      <div className="doc">
        <h3>数据来源</h3>
        <p>所有页面数据来自后端 API。点击页面刷新后会重新拉取物料、仓库、区域、库位、容器、库存、订单与记录。</p>

        <h3>仓库管理</h3>
        <p>仓库是库位的上级实体，库位通过 warehouse_id 关联仓库。支持新增、编辑、删除。</p>
        <p>删除规则：若仓库下存在任意库位，仓库不可删除。</p>

        <h3>物料管理</h3>
        <p>用于维护 SKU、名称、单位、分类与常用料标记。分类使用中文下拉选择。</p>
        <p>删除规则：如果物料有库存或关联订单，将自动停用（软删除），订单明细保留物料快照。</p>

        <h3>区域与库位管理</h3>
        <p>区域可配置物料类型、工厂、状态。库位必须关联仓库和区域，并有启用/停用状态。</p>
        <p>删除规则：库位若有库存或已绑定容器不可删除。</p>

        <h3>容器管理</h3>
        <p>容器类型、状态均使用中文下拉。容器可在新增时直接绑定库位，且支持库位搜索。</p>
        <p>一个库位同一时刻只能绑定一个容器；容器可解绑与移动，移动会生成容器移动记录。</p>

        <h3>库存管理</h3>
        <p>库存页面展示每个物料在库位上的可用与预留数量。库存调整会写入库存流水。</p>
        <p>若库位已绑定容器，需通过容器库存维护，不允许直接做库位库存调整。</p>

        <h3>入库流程</h3>
        <p>创建入库单 → 收货。收货后库存增加，并写入库存流水。</p>
        <p>已收货单据不可再次收货，按钮会置灰禁用。</p>

        <h3>出库流程</h3>
        <p>定义：拣货库位=出库来源库位；暂存库位=分拣后临时集货库位。创建出库单时两者不允许相同。</p>
        <p>预留：仅增加拣货库位库存 reserved，不改 quantity。</p>
        <p>分拣：拣货库位 reserved 扣减；暂存库位 quantity 增加；并写 OUTBOUND_PICK 流水。</p>
        <p>打包：更新订单行 packed_qty，状态变为 PACKED，不改库存。</p>
        <p>出库：从暂存库位 quantity 扣减并写 OUTBOUND_SHIP 流水，状态变为 SHIPPED。</p>
        <p>操作按钮受状态控制：不可执行步骤按钮置灰禁用。</p>

        <h3>订单管理</h3>
        <p>支持按类型筛选与搜索。明细使用“展开行表格”展示，包含需求、预留、分拣、打包数量。</p>

        <h3>记录与对账</h3>
        <p>库存流水用于审计与一致性验证，确保所有变更有迹可循。</p>
        <p>操作日志已扩展记录：操作前值、操作后值、请求来源、trace_id，便于问题追踪与审计。</p>

        <h3>幂等与防重放</h3>
        <p>关键写接口支持 Idempotency-Key（如库存调整、出入库关键动作）。前端会自动携带幂等键，短时间重复点击不会重复扣加库存。</p>

        <h3>数据库迁移</h3>
        <p>系统已引入 Alembic 管理数据库结构，请先执行 alembic upgrade head，再启动后端服务。</p>

        <h3>自动化测试</h3>
        <p>后端已新增关键业务测试：仓库删除约束、出库状态机、并发库存一致性。</p>

        <h3>权限矩阵</h3>
        <div className="table table-4">
          <div className="thead"><span>模块</span><span>页面</span><span>关键权限</span><span>说明</span></div>
          <div className="rowline"><span>物料</span><span>物料管理</span><span>materials.read/write/delete</span><span>查看、新增编辑、停用/删除</span></div>
          <div className="rowline"><span>库存</span><span>库存/库存调整</span><span>inventory.read/adjust</span><span>库存查看、调整</span></div>
          <div className="rowline"><span>订单</span><span>入库/出库/订单</span><span>orders.read/write + inbound/outbound.*</span><span>订单流程控制</span></div>
          <div className="rowline"><span>库位</span><span>库位管理</span><span>locations.* / areas.* / containers.*</span><span>仓库、区域、库位、容器维护</span></div>
          <div className="rowline"><span>系统</span><span>头部管理</span><span>system.setup</span><span>清空业务数据等系统操作</span></div>
        </div>

        <h3>数据清理</h3>
        <p>页面顶部提供“清空业务数据”按钮（需 system.setup 权限），用于回归测试前重置业务数据。</p>
        <p>清理范围包含订单、库存、容器、库位、仓库、物料等业务表，用户、角色、权限账号不受影响。</p>

        <h3>库位可视化评估</h3>
        <p>建议落地二维仓位图（仓库-区域-库位网格）作为第一阶段：支持库位状态、占用情况、容器编号热力展示。</p>
        <p>后续可扩展到拖拽式容器移动（受权限与状态约束），以及按区域/容器类型筛选。</p>

        <h3>权限控制</h3>
        <p>系统启用角色与权限控制，所有接口都需要授权。用户需要被分配角色并授予相应权限后才能操作。</p>
      </div>
    </section>
  );
}
