import {
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { X } from "lucide-react";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export const focusRing =
  "outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/70";

export const inputClass = cn(
  "w-full rounded border border-line bg-shell px-2 py-1.5 text-[11.5px] text-ink",
  "transition-colors duration-150 placeholder:text-muted/50",
  "outline-none focus:border-accent focus:ring-1 focus:ring-inset focus:ring-accent/25",
  "disabled:cursor-not-allowed disabled:opacity-40",
);

export const labelClass =
  "text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted/65";

export function useEscape(onClose: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
}

export function Overlay({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  useEscape(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "grid h-6 w-6 place-items-center rounded text-muted transition-colors duration-150 hover:bg-panel2 hover:text-ink",
        focusRing,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  width = "max-w-[560px]",
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  width?: string;
  children: ReactNode;
}) {
  return (
    <Overlay onClose={onClose}>
      <div
        className={cn(
          "flex max-h-full w-full flex-col overflow-hidden rounded-md border border-line bg-panel shadow-2xl",
          width,
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line bg-panel2 px-3 py-2">
          <div className="min-w-0">
            <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink">
              {title}
            </h2>
            {subtitle && <p className="truncate text-[10.5px] text-muted/70">{subtitle}</p>}
          </div>
          <IconButton label="Tutup (Esc)" onClick={onClose}>
            <X size={15} strokeWidth={1.75} />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </Overlay>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "border border-accent bg-accent text-white hover:bg-accent/90",
  secondary: "border border-line bg-panel2 text-ink hover:bg-panel2/70",
  ghost: "border border-transparent text-muted hover:bg-panel2 hover:text-ink",
  danger: "border border-danger/50 bg-danger/20 text-danger hover:bg-danger/30",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-[11px]",
  md: "h-8 px-3 text-[11.5px]",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-40",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        focusRing,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputClass, "pr-7", className)} {...props}>
      {children}
    </select>
  );
}

export function NumberInput({
  value,
  onChange,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(event) => onChange(Number(event.target.value) || 0)}
      className={cn(inputClass, "text-right font-mono tabular-nums", className)}
      {...props}
    />
  );
}

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

export function Th({
  children,
  align = "left",
  className,
}: {
  children?: ReactNode;
  align?: keyof typeof ALIGN;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "sticky top-0 z-10 whitespace-nowrap border-b border-line bg-panel2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted",
        ALIGN[align],
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className,
}: {
  children?: ReactNode;
  align?: keyof typeof ALIGN;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "border-b border-line/40 px-3 py-1.5 align-middle text-[11.5px] text-ink/90",
        ALIGN[align],
        className,
      )}
    >
      {children}
    </td>
  );
}

export function EmptyRow({ cols, label }: { cols: number; label: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-10 text-center text-[11.5px] text-muted">
        {label}
      </td>
    </tr>
  );
}

export function Field({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="rounded border border-line bg-shell px-2 py-1.5">
      <div className="text-[10.5px] uppercase tracking-[0.1em] text-muted/60">{label}</div>
      <div
        className={cn(
          "truncate text-[12px]",
          mono && "font-mono tabular-nums",
          accent ? "text-accent" : "text-ink/90",
        )}
      >
        {value}
      </div>
    </div>
  );
}
