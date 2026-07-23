/**
 * analysis/industryPacks/apparel/business-dimensions.ts - 企业经营维度
 *
 * 每个主要节点的企业经营层面指标：
 *   - 纳税（taxMetric）：综合税负率
 *   - 合规（complianceMetric）：ESG/劳工合规评分
 *   - 管理层（managementMetric）：管理层离职率
 *   - 客户构成（customerCompositionMetric）：客户集中度
 *   - 供应商依赖（supplierDependencyMetric）：供应商集中度
 *
 * 这些指标不直接传导产品成本，但影响企业经营健康度。
 * ChainHealth 引擎可以将这些指标纳入风险信号。
 */

import type { BusinessDimension } from "../../../core/industry-pack";

export const apparelBusinessDimensions: BusinessDimension[] = [
  {
    nodeId: "raw_material",
    customerCompositionMetric: "customer_concentration",
    supplierDependencyMetric: "supplier_dependency",
    description: "棉花供应商：客户集中度影响议价能力",
  },
  {
    nodeId: "yarn",
    taxMetric: "tax_burden_rate",
    complianceMetric: "esg_compliance_score",
    managementMetric: "management_turnover",
    customerCompositionMetric: "customer_concentration",
    description: "纺纱厂：税负、合规、管理层稳定性影响运营",
  },
  {
    nodeId: "fabric",
    taxMetric: "tax_burden_rate",
    complianceMetric: "esg_compliance_score",
    customerCompositionMetric: "customer_concentration",
    supplierDependencyMetric: "supplier_dependency",
    description: "织布染整厂：环保合规是核心风险（印染高污染）",
  },
  {
    nodeId: "manufacturing",
    taxMetric: "tax_burden_rate",
    complianceMetric: "esg_compliance_score",
    managementMetric: "management_turnover",
    customerCompositionMetric: "customer_concentration",
    supplierDependencyMetric: "supplier_dependency",
    description: "成衣工厂：劳工合规（工时/工资/安全）是核心审查点",
  },
  {
    nodeId: "trading_co",
    taxMetric: "tax_burden_rate",
    customerCompositionMetric: "customer_concentration",
    supplierDependencyMetric: "supplier_dependency",
    description: "贸易公司：客户/供应商集中度影响抗风险能力",
  },
  {
    nodeId: "brand",
    taxMetric: "tax_burden_rate",
    managementMetric: "management_turnover",
    customerCompositionMetric: "customer_concentration",
    description: "品牌公司：管理层稳定性影响战略连续性",
  },
  {
    nodeId: "channel",
    taxMetric: "tax_burden_rate",
    customerCompositionMetric: "customer_concentration",
    managementMetric: "management_turnover",
    description: "渠道商：客户构成和税负影响利润率",
  },
];
