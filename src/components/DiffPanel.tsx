import { useRepoStore } from "../application/repoStore";
import DiffViewer from "./DiffViewer";
import { useRef, useCallback, useState } from "react";

export default function DiffPanel() {
  const selectedDiffFile = useRepoStore((s) => s.selectedDiffFile);
  const setSelectedDiffFile = useRepoStore((s) => s.setSelectedDiffFile);
  const refreshAll = useRepoStore((s) => s.refreshAll);

  // Resize handling
  const [panelWidth, setPanelWidth] = useState(380);
  const isResizing = useRef(false);
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startW = panelWidth;
    const mm = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      setPanelWidth(Math.max(260, Math.min(700, startW - (ev.clientX - startX))));
    };
    const mu = () => {
      isResizing.current = false;
      document.removeEventListener("mousemove", mm);
      document.removeEventListener("mouseup", mu);
    };
    document.addEventListener("mousemove", mm);
    document.addEventListener("mouseup", mu);
  }, [panelWidth]);

  if (!selectedDiffFile) return null;

  return (
    <>
      <div className="diff-panel-resize" onMouseDown={handleResizeStart} />
      <div className="diff-panel" style={{ width: panelWidth }}>
        <DiffViewer
          filePath={selectedDiffFile.path}
          isStaged={selectedDiffFile.isStaged}
          commitHash={selectedDiffFile.commitHash}
          compareFrom={selectedDiffFile.fromRef}
          compareTo={selectedDiffFile.toRef}
          readOnly={!!selectedDiffFile.commitHash || !!selectedDiffFile.fromRef}
          onClose={() => { setSelectedDiffFile(null); refreshAll(); }}
        />
      </div>
    </>
  );
}
