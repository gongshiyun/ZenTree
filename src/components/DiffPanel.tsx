import { useRepoStore } from "../stores/repoStore";
import DiffViewer from "./DiffViewer";

export default function DiffPanel() {
  const selectedDiffFile = useRepoStore((s) => s.selectedDiffFile);
  const setSelectedDiffFile = useRepoStore((s) => s.setSelectedDiffFile);
  const refreshAll = useRepoStore((s) => s.refreshAll);

  if (!selectedDiffFile) return null;

  return (
    <div className="diff-panel">
      <DiffViewer
        filePath={selectedDiffFile.path}
        isStaged={selectedDiffFile.isStaged}
        onClose={() => { setSelectedDiffFile(null); refreshAll(); }}
      />
    </div>
  );
}
