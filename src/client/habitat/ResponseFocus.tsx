import type { UserBoundaryRequest, AgentIdentity } from "./types";
import { DecisionCard } from "./DecisionCard";

interface ResponseFocusProps {
  requests: UserBoundaryRequest[];
  requestingAgents: Map<string, AgentIdentity | undefined>;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onAutoAuthorize: (id: string) => void;
  onClick: () => void;
}

export function ResponseFocus({
  requests,
  requestingAgents,
  onApprove,
  onReject,
  onAutoAuthorize,
  onClick,
}: ResponseFocusProps) {
  return (
    <div
      className="habitat-focus-area habitat-focus-response"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label="需要回应区，点击查看详情"
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
    >
      <h2 className="habitat-eyebrow">需要你</h2>
      {requests.length === 0 ? (
        <p style={{ color: "var(--habitat-mute)", fontSize: "0.85rem" }}>
          暂无待回应事项
        </p>
      ) : (
        <div aria-live="polite">
          {requests.map((req) => (
            <DecisionCard
              key={req.id}
              request={req}
              requestingAgent={requestingAgents.get(req.id)}
              onApprove={onApprove}
              onReject={onReject}
              onAutoAuthorize={onAutoAuthorize}
            />
          ))}
        </div>
      )}
    </div>
  );
}
