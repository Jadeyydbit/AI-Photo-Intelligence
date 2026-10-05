import type { ReactElement } from "react";
import type { LucideIcon } from "lucide-react";
import { CheckCircle2 } from "lucide-react";

export type AppView =
  | "home"
  | "all-photos"
  | "people"
  | "places"
  | "albums"
  | "duplicates"
  | "favorites"
  | "create-albums"
  | "settings"
  | "profile";

export interface SidebarItem {
  icon: LucideIcon;
  label: string;
  view: Exclude<AppView, "profile">;
}

interface SidebarProps {
  items: SidebarItem[];
  activeView: AppView;
  onOpenView: (view: AppView) => void;
}

export function Sidebar({
  items,
  activeView,
  onOpenView,
}: SidebarProps): ReactElement {
  return (
    <aside className="sidebar">
      <div className="brand-row">
        <div className="brand-mark">
          AI
        </div>

        <span>
          AI Photo Intelligence
        </span>
      </div>

      <nav
        className="sidebar-nav"
        aria-label="Main navigation"
      >
        {items.map((item) => {
          const Icon = item.icon;
          const isActive =
            activeView === item.view;

          return (
            <button
              key={item.view}
              type="button"
              className={`nav-item ${
                isActive ? "active" : ""
              }`}
              onClick={() =>
                onOpenView(item.view)
              }
              aria-current={
                isActive ? "page" : undefined
              }
            >
              <Icon size={18} />

              <span>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="status-card">
        <div className="status-header">
          <CheckCircle2 size={16} />

          <span>
            Local Mode
          </span>
        </div>

        <p>
          All data is processed locally on
          your device.
        </p>
      </div>
    </aside>
  );
}