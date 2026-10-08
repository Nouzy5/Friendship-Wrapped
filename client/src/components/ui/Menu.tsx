import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from "react";

export type MenuItem = {
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  onSelect?: () => void;
  /** A link instead (e.g. a download). */
  href?: string;
  download?: boolean;
};

type MenuProps = {
  /** The trigger's accessible name, e.g. "More options". */
  label: string;
  /** The trigger's content, usually an icon. */
  trigger: ReactNode;
  triggerClassName: string;
  items: MenuItem[];
  /** Which edge the list lines up with. */
  align?: "left" | "right";
};

/**
 * A button that opens a short list of actions. Escape or a tap outside closes it; arrow keys
 * move between the items, and focus goes back to the button afterwards.
 */
export function Menu({ label, trigger, triggerClassName, items, align = "right" }: MenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const list = wrapper.current?.querySelector<HTMLElement>("[role=menu]");
    list?.querySelector<HTMLElement>("[role=menuitem]")?.focus();

    const onPointer = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const entries = Array.from(list?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
        const index = entries.indexOf(document.activeElement as HTMLElement);
        const next = event.key === "ArrowDown" ? index + 1 : index - 1;
        entries[(next + entries.length) % entries.length]?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClasses = "flex min-h-12 w-full items-center gap-3 px-4 text-left text-base transition hover:bg-surface focus-visible:bg-surface focus-visible:outline-none";

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={`absolute top-full z-30 mt-1 min-w-56 animate-menu-in overflow-hidden rounded-2xl bg-raised py-1.5 text-fg shadow-xl shadow-black/15 ring-1 ring-line ${align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left"}`}
        >
          {items.map(({ label: itemLabel, icon: Icon, onSelect, href, download }) =>
            href ? (
              <a key={itemLabel} role="menuitem" href={href} download={download} onClick={() => setOpen(false)} className={itemClasses}>
                <Icon className="size-5 shrink-0" />
                {itemLabel}
              </a>
            ) : (
              <button
                key={itemLabel}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onSelect?.();
                }}
                className={itemClasses}
              >
                <Icon className="size-5 shrink-0" />
                {itemLabel}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
