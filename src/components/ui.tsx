"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";
import { ALL_DAYS, DAY_SHORT, type Day } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Иконки                                                              */
/* ------------------------------------------------------------------ */

const PATHS: Record<string, ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  wand: (
    <>
      <path d="m4 20 10-10M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 10l.7 1.3L21 12l-1.3.7L19 14l-.7-1.3L17 12l1.3-.7zM18 17l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z" />
      <path d="m12.5 11.5 3 3" />
    </>
  ),
  swap: (
    <>
      <path d="M4 8h13l-3-3M20 16H7l3 3" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.6M17.5 20a5.4 5.4 0 0 0-2-4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  book: (
    <>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z" />
      <path d="M5 19.5A1.5 1.5 0 0 1 6.5 18H19v3H6.5A1.5 1.5 0 0 1 5 19.5zM9 7h6M9 10.5h6" />
    </>
  ),
  door: (
    <>
      <path d="M4 21h16M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21" />
      <circle cx="14.5" cy="12.5" r="1.2" />
    </>
  ),
  tag: (
    <>
      <path d="M3 11.5V4.5A1.5 1.5 0 0 1 4.5 3h7L21 12.5 12.5 21z" />
      <circle cx="7.5" cy="7.5" r="1.4" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9zM10 18a2 2 0 0 0 4 0" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.5l3.5 2" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  trash: (
    <>
      <path d="M4 7h16M9 7V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8V7M6 7l1 13.2A1.8 1.8 0 0 0 8.8 22h6.4a1.8 1.8 0 0 0 1.8-1.8L18 7" />
      <path d="M10 11v7M14 11v7" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20h4L20 8l-4-4L4 16z" />
      <path d="m14 6 4 4" />
    </>
  ),
  download: <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" />,
  upload: <path d="M12 21V9m0 0 4 4m-4-4-4 4M4 5h16" />,
  printer: (
    <>
      <path d="M7 9V3h10v6M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
      <rect x="7" y="14" width="10" height="7" rx="1.5" />
    </>
  ),
  check: <path d="m4 12.5 5 5L20 6.5" />,
  alert: (
    <>
      <path d="M12 3.5 22 20H2z" />
      <path d="M12 9.5v5M12 17.4v.2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.6v.2" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6 6 18" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10" width="15" height="11" rx="2" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </>
  ),
  unlock: (
    <>
      <rect x="4.5" y="10" width="15" height="11" rx="2" />
      <path d="M8 10V7.5a4 4 0 0 1 7.7-1.5" />
    </>
  ),
  undo: <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12H8" />,
  redo: <path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h6" />,
  sparkle: (
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
  ),
  layers: <path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5" />,
  pin: (
    <>
      <path d="M9 3h6l-1 6 3.5 3.5H5.5L9 9z" />
      <path d="M12 12.5V21" />
    </>
  ),
  play: <path d="M7 4.5 19 12 7 19.5z" />,
  save: (
    <>
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M8 3v6h7V3M8 21v-6h8v6" />
    </>
  ),
};

export function Icon({
  name,
  className,
  strokeWidth = 1.7,
}: {
  name: keyof typeof PATHS | string;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-5 w-5 shrink-0", className)}
      aria-hidden
    >
      {PATHS[name] ?? PATHS.info}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Кнопки                                                              */
/* ------------------------------------------------------------------ */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger" | "soft";
  size?: "xs" | "sm" | "md";
  icon?: string;
};

export function Btn({
  variant = "outline",
  size = "sm",
  icon,
  className,
  children,
  ...rest
}: BtnProps) {
  const base =
    "focus-ring inline-flex items-center justify-center gap-2 rounded-lg font-medium tracking-tight transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 active:translate-y-px";
  const sizes = {
    xs: "px-2 py-1 text-[11px]",
    sm: "px-3 py-1.5 text-[13px]",
    md: "px-4 py-2.5 text-sm",
  }[size];
  const variants = {
    primary:
      "bg-action text-on-action hover:bg-action-hover font-semibold",
    soft: "bg-panel3 text-chalk hover:bg-panel2 border border-line",
    outline: "border border-line2 text-chalk hover:border-amber/70 hover:text-amber bg-transparent",
    ghost: "text-muted hover:text-chalk hover:bg-panel2",
    danger: "border border-coral/40 text-coral hover:bg-coral/12",
  }[variant];
  return (
    <button className={cn(base, sizes, variants, className)} {...rest}>
      {icon ? <Icon name={icon} className={size === "xs" ? "h-3.5 w-3.5" : "h-4 w-4"} /> : null}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Контейнеры                                                          */
/* ------------------------------------------------------------------ */

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
  dense,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  dense?: boolean;
}) {
  return (
    <section
      className={cn(
        "hairline rise rounded-[14px] border border-line bg-panel/85 backdrop-blur-[2px]",
        className,
      )}
    >
      {(title || actions) && (
        <header
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 border-b border-line/80",
            dense ? "px-4 py-2.5" : "px-5 py-3.5",
          )}
        >
          <div className="min-w-0">
            {title ? (
              <h2 className="font-display text-[13px] font-semibold tracking-[0.16em] text-chalk uppercase">
                {title}
              </h2>
            ) : null}
            {subtitle ? <p className="mt-1 text-xs text-muted">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      )}
      <div className={dense ? "p-3" : "p-5"}>{children}</div>
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-display text-[10px] font-semibold tracking-[0.3em] text-dim uppercase">
      {children}
    </p>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "chalk",
  icon,
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "chalk" | "amber" | "mint" | "coral" | "sky";
  icon?: string;
  onClick?: () => void;
}) {
  const toneClass = {
    chalk: "text-chalk",
    amber: "text-amber",
    mint: "text-mint",
    coral: "text-coral",
    sky: "text-sky",
  }[tone];
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "hairline card-hover group relative overflow-hidden rounded-[14px] border border-line bg-panel/80 px-4 py-3.5 text-left",
        onClick && "cursor-pointer focus-ring",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-medium tracking-[0.18em] text-dim uppercase">{label}</p>
          <p className={cn("font-display mt-1.5 text-[26px] leading-none font-bold tabular", toneClass)}>
            {value}
          </p>
          {hint ? <p className="mt-2 text-[11.5px] leading-snug text-muted">{hint}</p> : null}
        </div>
        {icon ? (
          <span className="rounded-lg border border-line bg-panel2 p-2 text-muted transition-colors group-hover:text-amber">
            <Icon name={icon} className="h-4 w-4" />
          </span>
        ) : null}
      </div>
    </Comp>
  );
}

export function Badge({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: "amber" | "mint" | "coral" | "sky" | "muted" | "danger";
  className?: string;
}) {
  const tones = {
    amber: "border-amber/35 bg-amber/12 text-amber",
    mint: "border-mint/35 bg-mint/12 text-mint",
    coral: "border-coral/35 bg-coral/12 text-coral",
    sky: "border-sky/35 bg-sky/12 text-sky",
    muted: "border-line2 bg-panel2 text-muted",
    danger: "border-coral/50 bg-coral/18 text-coral",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide whitespace-nowrap",
        tones,
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Формы                                                               */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      {label ? (
        <span className="mb-1.5 block text-[11px] font-semibold tracking-[0.12em] text-dim uppercase">
          {label}
        </span>
      ) : null}
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-dim">{hint}</span> : null}
    </label>
  );
}

const controlBase =
  "focus-ring w-full rounded-lg border border-line2 bg-panel px-3 py-2 text-sm text-chalk placeholder:text-dim transition-colors hover:border-line2 focus:border-focus";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlBase, className)} {...rest} />;
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlBase, "min-h-[80px] resize-y", className)} {...rest} />;
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(controlBase, "cursor-pointer appearance-none pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="focus-ring group flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-panel2/60 px-3 py-2 text-left transition-colors hover:border-line2"
    >
      <span className="min-w-0">
        {label ? <span className="block text-[13px] text-chalk">{label}</span> : null}
        {hint ? <span className="block text-[11px] text-dim">{hint}</span> : null}
      </span>
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-200",
          checked ? "border-mint/60 bg-mint/30" : "border-line2 bg-panel3",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all duration-200",
            checked ? "left-4.5 bg-mint" : "left-0.5 bg-dim",
          )}
        />
      </span>
    </button>
  );
}

export function DayPicker({
  value,
  onChange,
  size = "md",
}: {
  value: Day[];
  onChange: (days: Day[]) => void;
  size?: "sm" | "md";
}) {
  const toggle = (d: Day) =>
    onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => a - b));
  return (
    <div className="flex flex-wrap gap-1.5">
      {ALL_DAYS.map((d) => {
        const active = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => toggle(d)}
            className={cn(
              "focus-ring rounded-md border font-medium transition-all duration-150",
              size === "sm" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs",
              active
                ? "border-action/60 bg-panel3 text-action"
                : "border-line bg-panel2/60 text-dim hover:border-line2 hover:text-muted",
            )}
          >
            {DAY_SHORT[d]}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode; icon?: string }>;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex flex-wrap gap-1 rounded-xl border border-line bg-panel2/70 p-1", className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-all duration-200",
            value === o.value
              ? "bg-panel3 text-action"
              : "text-muted hover:text-chalk",
          )}
        >
          {o.icon ? <Icon name={o.icon} className="h-3.5 w-3.5" /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Icon name="search" className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-dim" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(controlBase, "pl-9")}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="focus-ring absolute top-2 right-2 rounded p-1 text-dim hover:text-coral"
        >
          <Icon name="x" className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Модальное окно                                                      */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-4xl", xl: "max-w-6xl" }[width];
  return (
    <div className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div
        className="fixed inset-0 bg-chalk/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "pop hairline relative z-10 my-auto w-full rounded-[16px] border border-line2 bg-panel shadow-[0_40px_120px_-40px_rgba(0,0,0,1)]",
          widths,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h3 id={titleId} className="font-display text-base font-semibold text-chalk">{title}</h3>
            {subtitle ? <p className="mt-1 text-xs text-muted">{subtitle}</p> : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="focus-ring rounded-lg border border-line p-1.5 text-muted transition-colors hover:border-coral/50 hover:text-coral"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon = "info",
  title,
  text,
  action,
}: {
  icon?: string;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line2/70 bg-panel2/30 px-6 py-12 text-center">
      <span className="rounded-xl border border-line bg-panel2 p-3 text-amber">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <div>
        <p className="font-display text-sm font-semibold text-chalk">{title}</p>
        {text ? <p className="mx-auto mt-1 max-w-md text-xs text-muted">{text}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ProgressBar({ value, tone = "amber" }: { value: number; tone?: "amber" | "mint" }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel3">
      <div
        className={cn(
          "relative h-full rounded-full transition-[width] duration-300 ease-out",
          tone === "amber" ? "bg-amber" : "bg-mint",
        )}
        style={{ width: `${pct}%` }}
      >
        <div className="sheen absolute inset-0 rounded-full" />
      </div>
    </div>
  );
}

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.06, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={cn("reveal", visible && "is-visible", className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export function ColorDot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-[3px]"
      style={{ width: size, height: size, backgroundColor: color }}
    />
  );
}

export function Row({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}
