/**
 * analysis/industryPacks/apparel/capital-flows.ts - 资金流数据
 *
 * 描述资金在供应链各节点间的流动：
 *   - 贷款（银行->制造/贸易公司）
 *   - 退税（税务->贸易公司/制造）
 *   - 纳税（各节点->税务）
 *   - 货款结算（上下游之间）
 *   - 投资（品牌->渠道/制造）
 *
 * Analyst 检测到 metric 信号异常时，按 coefficient 建因果边。
 * 如 loan_interest_rate_above_range -> fob_price_garment_above_range
 */

import type { CapitalFlow } from "../../../core/industry-pack";

export const apparelCapitalFlows: CapitalFlow[] = [
  // === 贷款流 ===
  {
    id: "cf-loan-to-manufacturing",
    from: "financial_risk",
    to: "manufacturing",
    flowType: "loan",
    metric: "loan_interest_rate",
    coefficient: 0.30,
    description: "银行贷款利率上升 -> 制造企业融资成本上升 -> FOB价格上涨",
  },
  {
    id: "cf-loan-to-trading",
    from: "financial_risk",
    to: "trading_co",
    flowType: "loan",
    metric: "loan_interest_rate",
    coefficient: 0.25,
    description: "信贷紧缩 -> 贸易公司资金链紧张 -> 采购能力下降/垫资成本上升",
  },
  {
    id: "cf-loan-to-yarn",
    from: "financial_risk",
    to: "yarn",
    flowType: "loan",
    metric: "loan_interest_rate",
    coefficient: 0.15,
    description: "纺纱厂融资成本上升 -> 纱线价格含资金成本",
  },
  {
    id: "cf-loan-to-brand",
    from: "financial_risk",
    to: "brand",
    flowType: "loan",
    metric: "loan_interest_rate",
    coefficient: 0.10,
    description: "品牌公司融资成本 -> 库存资金占用成本上升",
  },

  // === 退税流 ===
  {
    id: "cf-tax-refund-trading",
    from: "trading_co",
    to: "manufacturing",
    flowType: "tax_refund",
    metric: "tax_refund_rate",
    coefficient: 0.09,
    description: "出口退税 -> 降低贸易公司采购成本 -> 传导给制造端订单",
  },
  {
    id: "cf-tax-refund-manufacturing",
    from: "manufacturing",
    to: "manufacturing",
    flowType: "tax_refund",
    metric: "tax_refund_rate",
    coefficient: 0.05,
    description: "制造企业直接出口退税 -> 降低FOB实际成本",
  },

  // === 纳税流 ===
  {
    id: "cf-tax-manufacturing",
    from: "manufacturing",
    to: "brand",
    flowType: "tax_payment",
    metric: "tax_burden_rate",
    coefficient: 0.08,
    description: "制造企业纳税 -> 成本传导至出厂价 -> 品牌采购成本",
  },
  {
    id: "cf-tax-brand",
    from: "brand",
    to: "channel",
    flowType: "tax_payment",
    metric: "tax_burden_rate",
    coefficient: 0.06,
    description: "品牌公司纳税 -> 零售价含税",
  },
  {
    id: "cf-tax-channel",
    from: "channel",
    to: "consumer",
    flowType: "tax_payment",
    metric: "tax_burden_rate",
    coefficient: 0.13,
    description: "零售环节增值税/消费税 -> 消费者承担最终税负",
  },

  // === 货款结算流 ===
  {
    id: "cf-payment-trading-to-brand",
    from: "trading_co",
    to: "brand",
    flowType: "payment",
    metric: "accounts_receivable_days",
    coefficient: 0.90,
    description: "贸易公司->品牌货款结算（账期影响贸易公司现金流）",
  },
  {
    id: "cf-payment-brand-to-channel",
    from: "brand",
    to: "channel",
    flowType: "payment",
    metric: "accounts_receivable_days",
    coefficient: 0.85,
    description: "品牌->渠道货款结算（渠道账期影响品牌回款）",
  },
  {
    id: "cf-payment-channel-to-consumer",
    from: "channel",
    to: "consumer",
    flowType: "payment",
    metric: "accounts_receivable_days",
    coefficient: 0.70,
    description: "渠道->消费者（零售端账期/信用卡/分期影响消费）",
  },

  // === 投资流 ===
  {
    id: "cf-investment-brand-to-design",
    from: "brand",
    to: "design",
    flowType: "investment",
    metric: "working_capital",
    coefficient: 0.30,
    description: "品牌公司投资设计开发 -> 影响产品力和BOM成本",
  },
  {
    id: "cf-investment-brand-to-manufacturing",
    from: "brand",
    to: "manufacturing",
    flowType: "investment",
    metric: "working_capital",
    coefficient: 0.20,
    description: "品牌公司投资制造产能（OEM/ODM合作）-> 影响产能稳定性",
  },

  // === v3 Phase E：保理/信用证/供应链金融 ===
  {
    id: "cf-factoring-trading",
    from: "financial_risk",
    to: "trading_co",
    flowType: "loan",
    metric: "accounts_receivable_days",
    coefficient: 0.35,
    description: "应收账款保理融资 -> 账期越长融资成本越高 -> 贸易公司资金压力",
  },
  {
    id: "cf-lc-import",
    from: "financial_risk",
    to: "trading_co",
    flowType: "payment",
    metric: "loan_interest_rate",
    coefficient: 0.20,
    description: "进口信用证开证成本 -> 利率影响开证保证金 -> 贸易公司进口采购成本",
  },
  {
    id: "cf-supply-chain-finance-yarn",
    from: "financial_risk",
    to: "yarn",
    flowType: "loan",
    metric: "accounts_receivable_days",
    coefficient: 0.25,
    description: "纱线采购供应链金融 -> 账期融资成本 -> 纱线价格含资金成本",
  },
  {
    id: "cf-supply-chain-finance-fabric",
    from: "financial_risk",
    to: "fabric",
    flowType: "loan",
    metric: "accounts_receivable_days",
    coefficient: 0.20,
    description: "面料采购供应链金融 -> 织布厂账期融资 -> 面料价格含资金成本",
  },
  {
    id: "cf-investment-brand-to-channel",
    from: "brand",
    to: "channel",
    flowType: "investment",
    metric: "working_capital",
    coefficient: 0.25,
    description: "品牌投资渠道建设（门店装修/电商运营）-> 渠道扩张成本",
  },
];
