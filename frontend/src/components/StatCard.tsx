import type { ReactElement } from "react";
import type { LucideIcon } from "lucide-react";

export type StatTone =
  | "purple"
  | "green"
  | "blue"
  | "amber"
  | "red";

export interface StatCardData {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: StatTone;
}

interface StatCardProps {
  item: StatCardData;
}

export function StatCard({
  item,
}: StatCardProps): ReactElement {
  const Icon = item.icon;

  return (
    <div
      className={`stat-card ${item.tone}`}
      style={{
        width: "100%",
        minWidth: 0,
        minHeight: "128px",
        boxSizing: "border-box",
      }}
    >
      <div className="stat-icon-wrap">
        <Icon size={24} />
      </div>

      <div className="stat-value">
        {item.value}
      </div>

      <div className="stat-label">
        {item.label}
      </div>
    </div>
  );
}