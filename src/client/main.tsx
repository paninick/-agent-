/**
 * client/main.tsx - Agent OS 入口
 *
 * 视图路由：驾驶舱（情报仪表盘） / 智能体编队（Agent 栖息地） / 其他占位
 * ErrorBoundary 包裹整个 App，防止渲染错误导致白屏。
 */

import { createRoot } from "react-dom/client";
import { useState, type ComponentType, type ReactNode } from "react";
import "./styles.css";
import { IntelligenceDashboard } from "./IntelligenceDashboard";
import { ErrorBoundary } from "./ErrorBoundary";
import { HabitatWorkspace } from "./habitat/HabitatWorkspace";
import { TrustPanel } from "./habitat/TrustPanel";
import { TasksView } from "./TasksView";
import { ChannelsView } from "./ChannelsView";
import { CostView } from "./CostView";
import { GoalsView } from "./GoalsView";
import { SkillsView } from "./SkillsView";
import { createMockHabitatSnapshot } from "./habitat/habitatMock";
import {
  Hexagon, LayoutDashboard, Target, Workflow, Bot, Boxes,
  Plug, WalletCards, ShieldCheck, Settings, Search, Bell, ChevronDown,
} from "lucide-react/dist/esm/lucide-react.mjs";

type ViewId =
  | "dashboard"
  | "goals"
  | "tasks"
  | "agents"
  | "skills"
  | "channels"
  | "cost"
  | "audit";

interface NavItem {
  id: ViewId;
  label: string;
  Icon: ComponentType<{ size?: number }>;
  badge?: number;
}

const NAVIGATION: NavItem[] = [
  { id: "dashboard", label: "驾驶舱", Icon: LayoutDashboard },
  { id: "goals", label: "目标中心", Icon: Target, badge: 3 },
  { id: "tasks", label: "任务运行", Icon: Workflow },
  { id: "agents", label: "智能体编队", Icon: Bot },
  { id: "skills", label: "技能与工具", Icon: Boxes },
  { id: "channels", label: "渠道集成", Icon: Plug },
  { id: "cost", label: "成本中心", Icon: WalletCards },
  { id: "audit", label: "审计与策略", Icon: ShieldCheck },
];

/** 占位视图（尚未实现的模块） */
function PlaceholderView({ title }: { title: string }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      minHeight: 400,
      color: "var(--ink-muted, #8b95a1)",
      gap: 12,
    }}>
      <div style={{ fontSize: 48, opacity: 0.3 }}>○</div>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--ink-primary, #e8eaed)" }}>{title}</h2>
      <p style={{ fontSize: 14 }}>该模块正在开发中</p>
    </div>
  );
}

/** 根据当前视图渲染主内容 */
function renderView(view: ViewId): ReactNode {
  switch (view) {
    case "dashboard":
      return <IntelligenceDashboard />;
    case "agents":
      return <HabitatWorkspace />;
    case "goals":
      return <GoalsView />;
    case "tasks":
      return <TasksView />;
    case "skills":
      return <SkillsView />;
    case "channels":
      return <ChannelsView />;
    case "cost":
      return <CostView />;
    case "audit":
      return <TrustPanel snapshot={createMockHabitatSnapshot()} />;
    default:
      return <IntelligenceDashboard />;
  }
}

function App() {
  const [activeView, setActiveView] = useState<ViewId>("dashboard");

  return (
    <div className="app-frame">
      <aside className="product-rail" aria-label="产品导航">
        <div className="brand-lockup"><span className="brand-mark"><Hexagon size={18} /></span><div><strong>Agent OS</strong><small>SWARM OPERATIONS</small></div></div>
        <nav className="primary-nav">
          <p>工作空间</p>
          {NAVIGATION.map(({ id, label, Icon, badge }) => (
            <button
              className={activeView === id ? "nav-item active" : "nav-item"}
              type="button"
              key={id}
              aria-current={activeView === id ? "page" : undefined}
              onClick={() => setActiveView(id)}
            >
              <Icon size={16} /><span>{label}</span>{badge != null ? <b>{badge}</b> : null}
            </button>
          ))}
        </nav>
        <div className="rail-footer">
          <button className="nav-item" type="button"><Settings size={16} /><span>系统设置</span></button>
          <div className="system-health"><span /><div><strong>系统运行正常</strong><small>10 agents · 9 sources</small></div></div>
        </div>
      </aside>

      <div className="app-surface">
        <header className="product-bar">
          <div className="workspace-switcher"><span>华东供应链运营</span><ChevronDown size={14} /></div>
          <div className="product-bar-actions">
            <button type="button" aria-label="搜索"><Search size={17} /></button>
            <button type="button" aria-label="通知" className="notification-button"><Bell size={17} /><span /></button>
            <div className="operator-avatar">林</div>
          </div>
        </header>
        <main className="shell">
          <div className="workspace">{renderView(activeView)}</div>
        </main>
      </div>
    </div>
  );
}

export { App };

if (typeof document !== "undefined" && document.getElementById("root")) {
  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
}
