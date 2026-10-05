import type { ReactElement } from "react";
import { FolderOpen } from "lucide-react";

interface ImportPanelProps {
  title: string;
  description: string;
  buttonLabel: string;
  onChooseFolder: () => void;
  loading?: boolean;
}

export function ImportPanel({
  title,
  description,
  buttonLabel,
  onChooseFolder,
  loading = false,
}: ImportPanelProps): ReactElement {
  return (
    <div className="dropzone">
      <div className="drop-icon">
        <FolderOpen size={42} />
      </div>

      <h2>{title}</h2>

      <p>{description}</p>

      <button
        className="choose-button"
        type="button"
        onClick={onChooseFolder}
        disabled={loading}
      >
        {loading
          ? "Importing..."
          : buttonLabel}
      </button>
    </div>
  );
}