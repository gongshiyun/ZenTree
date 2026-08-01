import { useState, useRef, useEffect, useCallback } from "react";
import { useRepoStore } from "../application/repoStore";
import { useT } from "../i18n";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDateStr(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Build the calendar grid (Monday-first) for the given view month. */
function buildGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  // Monday-based offset: JS getDay() 0=Sunday
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function DatePicker({ value, onChange }: Props) {
  const t = useT();
  const language = useRepoStore((s) => s.language);
  const locale = language === "zh" ? "zh-CN" : "en-US";
  const weekdays = t("datepicker.weekdays").split(",");
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(0);
  const [viewMonth, setViewMonth] = useState(0);
  const [popPos, setPopPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initial = parseDateStr(value) || new Date();
    setViewYear(initial.getFullYear());
    setViewMonth(initial.getMonth());
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const handleSelect = useCallback((d: Date) => {
    onChange(toDateStr(d));
    setOpen(false);
  }, [onChange]);

  const toggleOpen = useCallback(() => {
    setOpen((prev) => {
      if (prev) return false;
      // Position the popup relative to the viewport, clamped inside the window.
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return true;
      const POP_W = 240;
      const POP_H = 316;
      let left = rect.left;
      let top = rect.bottom + 6;
      if (left + POP_W > window.innerWidth - 8) left = Math.max(8, window.innerWidth - POP_W - 8);
      if (top + POP_H > window.innerHeight - 8) top = Math.max(8, rect.top - POP_H - 6);
      setPopPos({ left, top });
      return true;
    });
  }, []);

  const shiftMonth = useCallback((delta: number) => {
    setViewMonth((m) => {
      const next = new Date(viewYear, m + delta, 1);
      setViewYear(next.getFullYear());
      return next.getMonth();
    });
  }, [viewYear]);

  const today = new Date();
  const todayStr = toDateStr(today);
  const selected = parseDateStr(value);
  const cells = open ? buildGrid(viewYear, viewMonth) : [];
  const monthTitle = open
    ? new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(new Date(viewYear, viewMonth, 1))
    : "";

  return (
    <div className="filter-input filter-date date-picker" ref={rootRef}>
      <div className="date-picker-trigger" onClick={toggleOpen}>
        <span className={`date-picker-value${value ? "" : " empty"}`}>{value || t("datepicker.pickDate")}</span>
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
          <rect x="1.2" y="2" width="9.6" height="8.5" rx="1.5" />
          <path d="M1.2 5h9.6M3.4 1v2M8.6 1v2" />
        </svg>
      </div>
      {open && (
        <div className="date-picker-pop" style={{ position: "fixed", top: popPos.top, left: popPos.left }}>
          <div className="date-picker-head">
            <button type="button" className="date-picker-nav" onClick={() => shiftMonth(-1)} title={t("datepicker.prevMonth")}>&#8249;</button>
            <span className="date-picker-title">{monthTitle}</span>
            <button type="button" className="date-picker-nav" onClick={() => shiftMonth(1)} title={t("datepicker.nextMonth")}>&#8250;</button>
          </div>
          <div className="date-picker-week">
            {weekdays.map((w, i) => <span key={i} className="date-picker-weekday">{w}</span>)}
          </div>
          <div className="date-picker-grid">
            {cells.map((d, i) => {
              if (!d) return <span key={i} className="date-picker-cell empty" />;
              const str = toDateStr(d);
              const isSel = str === value;
              const isToday = str === todayStr;
              return (
                <button
                  key={i}
                  type="button"
                  className={`date-picker-cell${isSel ? " selected" : ""}${isToday ? " today" : ""}`}
                  onClick={() => handleSelect(d)}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="date-picker-actions">
            <button type="button" className="date-picker-action" onClick={() => { onChange(todayStr); setOpen(false); }}>{t("datepicker.today")}</button>
            <button type="button" className="date-picker-action" onClick={() => { onChange(""); setOpen(false); }}>{t("datepicker.clear")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
