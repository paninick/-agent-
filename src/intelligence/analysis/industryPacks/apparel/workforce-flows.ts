/**
 * analysis/industryPacks/apparel/workforce-flows.ts - 人员流数据
 *
 * 描述供应链各节点的人员结构与薪酬：
 *   - 农工（raw_material）: 种植/采摘
 *   - 纺纱工（yarn）: 挡车/落纱
 *   - 织造工（fabric）: 织布/染整
 *   - 缝纫工/QC/管理（manufacturing）: 成衣生产
 *   - 设计师（design）: 设计/打版
 *   - 品牌/营销（brand）: 品牌管理/市场营销
 *   - 店员/电商（channel）: 零售/电商运营
 *
 * Analyst 检测到 headcount/wage 信号异常时，建因果边到产能/成本指标。
 * 如 sewer_headcount_below_range -> utilization_pct_below_range
 */

import type { WorkforceFlow } from "../../../core/industry-pack";

export const apparelWorkforceFlows: WorkforceFlow[] = [
  // === 原材料端：农工 ===
  {
    id: "wf-farm-worker",
    nodeId: "raw_material",
    role: "farm_worker",
    headcountMetric: "farm_worker_headcount",
    wageMetric: "farm_worker_wage",
    productivityMetric: "cotton_yield_per_hectare",
    description: "棉花种植/采摘工人 - 人力密集，影响棉花产量和成本",
  },

  // === 纺纱端：纺纱工 ===
  {
    id: "wf-spinner",
    nodeId: "yarn",
    role: "spinner",
    headcountMetric: "spinner_headcount",
    wageMetric: "spinner_wage",
    productivityMetric: "utilization_pct",
    description: "纺纱挡车工 - 自动化程度中等，人数影响产能利用率",
  },

  // === 面料端：织造工 ===
  {
    id: "wf-weaver",
    nodeId: "fabric",
    role: "weaver",
    headcountMetric: "weaver_headcount",
    wageMetric: "weaver_wage",
    productivityMetric: "utilization_pct",
    description: "织布/染整工人 - 染整环节高度依赖人工经验",
  },

  // === 成衣制造端：缝纫工/QC/管理 ===
  {
    id: "wf-sewer",
    nodeId: "manufacturing",
    role: "sewer",
    headcountMetric: "sewer_headcount",
    wageMetric: "sewer_wage",
    productivityMetric: "oee",
    description: "缝纫工 - 成衣制造最核心人力，工资占FOB成本30-50%",
  },
  {
    id: "wf-qc",
    nodeId: "manufacturing",
    role: "qc",
    headcountMetric: "qc_headcount",
    wageMetric: "qc_wage",
    description: "质检员 - 影响良品率和返工率",
  },
  {
    id: "wf-manager",
    nodeId: "manufacturing",
    role: "manager",
    headcountMetric: "manager_headcount",
    wageMetric: "manager_wage",
    description: "工厂管理层 - 影响运营效率和订单交付",
  },

  // === 设计端：设计师 ===
  {
    id: "wf-designer",
    nodeId: "design",
    role: "designer",
    headcountMetric: "designer_headcount",
    wageMetric: "designer_salary",
    productivityMetric: "bom_accuracy",
    description: "设计师 - 影响产品开发速度和BOM准确性",
  },

  // === 品牌端：品牌/营销 ===
  {
    id: "wf-marketer",
    nodeId: "brand",
    role: "marketer",
    headcountMetric: "marketer_headcount",
    wageMetric: "marketer_salary",
    description: "品牌管理/市场营销人员 - 影响品牌健康度和定价能力",
  },

  // === 渠道端：店员/电商 ===
  {
    id: "wf-retail-staff",
    nodeId: "channel",
    role: "retail_staff",
    headcountMetric: "retail_staff_headcount",
    wageMetric: "retail_staff_wage",
    productivityMetric: "sell_through_rate",
    description: "门店导购 - 影响终端转化率和动销率",
  },
  {
    id: "wf-ecom-staff",
    nodeId: "channel",
    role: "ecom_staff",
    headcountMetric: "ecommerce_staff_headcount",
    wageMetric: "ecommerce_staff_wage",
    description: "电商运营人员 - 影响线上渠道销售效率",
  },

  // === v3 Phase E：补充人员流 ===
  {
    id: "wf-buyer",
    nodeId: "trading_co",
    role: "buyer",
    headcountMetric: "buyer_headcount",
    wageMetric: "buyer_salary",
    description: "采购买手 - 影响原料采购价格谈判和供应商选择",
  },
  {
    id: "wf-streamer",
    nodeId: "channel",
    role: "streamer",
    headcountMetric: "streamer_headcount",
    wageMetric: "streamer_salary",
    productivityMetric: "sell_through_rate",
    description: "直播带货主播 - 影响电商渠道转化率和GMV",
  },
  {
    id: "wf-pattern-maker",
    nodeId: "design",
    role: "pattern_maker",
    headcountMetric: "pattern_maker_headcount",
    wageMetric: "pattern_maker_salary",
    productivityMetric: "bom_accuracy",
    description: "版师 - 影响打样速度和样衣质量，BOM准确性依赖版师经验",
  },
  {
    id: "wf-technician",
    nodeId: "manufacturing",
    role: "technician",
    headcountMetric: "technician_headcount",
    wageMetric: "technician_salary",
    productivityMetric: "oee",
    description: "工艺师/设备技师 - 影响产线效率和设备稼动率(OEE)",
  },
];
