import { Children, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { paginateDesktop } from "@/lib/desktop-pages";
import type { DesktopAppearanceConfig } from "@/lib/appearance";
import "@/styles/desktop-pages.css";

export function DesktopPages({
  children,
  widget,
  config,
}: {
  children: ReactNode;
  widget?: ReactNode;
  config: DesktopAppearanceConfig;
}) {
  const root = useRef<HTMLDivElement>(null);
  const widgetElement = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({
    height: 220,
    rowHeight: config.iconSize + 38,
    gap: config.gridGap,
    columnGap: config.gridGap,
    columns: config.gridColumns,
    widgetHeight: 0,
  });
  const [current, setCurrent] = useState(0);
  const currentRef = useRef(0);
  const hasWidget = Boolean(widget);
  const items = useMemo(() => Children.toArray(children), [children]);
  const pages = useMemo(
    () =>
      paginateDesktop(
        items,
        metrics.columns,
        metrics.height,
        metrics.rowHeight,
        metrics.gap,
        widget ? metricsWidget(config, metrics.widgetHeight) : 0,
      ),
    [items, metrics, widget, config],
  );

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const grid = element.querySelector<HTMLElement>('[data-ui="app-grid"]');
        const gap = grid ? parseFloat(getComputedStyle(grid).rowGap) || 0 : config.gridGap;
        const buttons = Array.from(element.querySelectorAll<HTMLElement>('[data-ui="app"]'));
        const rowHeight = Math.max(
          config.iconSize + 35,
          ...buttons.map((button) => {
            const id = button.dataset["appId"] || "";
            return button.getBoundingClientRect().height + Math.abs(config.apps[id]?.y ?? 0) * 2;
          }),
        );
        const colWidth = Math.max(
          config.iconSize,
          ...buttons.map((button) => {
            const id = button.dataset["appId"] || "";
            return (
              (button.querySelector('[data-ui="app-icon"]')?.getBoundingClientRect().width || 0) +
              Math.abs(config.apps[id]?.x ?? 0) * 2
            );
          }),
        );
        // Respect chosen columns; only use fewer if full-size icons physically cannot fit.
        const columns = Math.max(
          1,
          Math.min(config.gridColumns, Math.floor(element.clientWidth / Math.max(1, colWidth))),
        );
        // Keep icon sizes and chosen columns; tighten only horizontal gutters when necessary.
        const renderedColumnGap = grid
          ? parseFloat(getComputedStyle(grid).columnGap) || 0
          : config.gridGap;
        const injectedColumnGap = grid
          ? parseFloat(grid.style.getPropertyValue("--desktop-page-column-gap"))
          : NaN;
        const requestedColumnGap =
          renderedColumnGap === injectedColumnGap ? gap : renderedColumnGap;
        const columnGap =
          columns > 1
            ? Math.min(
                requestedColumnGap,
                Math.max(0, (element.clientWidth - colWidth * columns) / (columns - 1)),
              )
            : config.gridGap;
        const widgetHeight = widgetElement.current?.getBoundingClientRect().height ?? 0;
        const next = {
          height: element.clientHeight,
          rowHeight: Math.ceil(rowHeight),
          gap,
          columns,
          columnGap,
          widgetHeight,
        };
        setMetrics((previous) =>
          JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
        );
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (widgetElement.current) observer.observe(widgetElement.current);
    element.querySelectorAll('[data-ui="app"]').forEach((button) => observer.observe(button));
    measure();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [config, hasWidget]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const next = Math.min(currentRef.current, pages.length - 1);
    const left = next * element.clientWidth;
    if (Math.abs(element.scrollLeft - left) > 1) element.scrollLeft = left;
    currentRef.current = next;
    setCurrent((previous) => (previous === next ? previous : next));
  }, [pages.length, metrics.columns, metrics.height]);
  const go = (index: number) =>
    root.current?.scrollTo({
      left: index * root.current.clientWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  return (
    <>
      <div
        className="desktop-pages"
        data-ui="desktop-pages"
        ref={root}
        onScroll={(event) => {
          const element = event.currentTarget;
          const next = Math.round(element.scrollLeft / Math.max(1, element.clientWidth));
          currentRef.current = next;
          setCurrent((previous) => (previous === next ? previous : next));
        }}
        onKeyDown={(event) => {
          if (
            event.target === event.currentTarget &&
            ["ArrowLeft", "ArrowRight"].includes(event.key)
          ) {
            event.preventDefault();
            go(
              Math.max(
                0,
                Math.min(pages.length - 1, current + (event.key === "ArrowRight" ? 1 : -1)),
              ),
            );
          }
        }}
        tabIndex={0}
        aria-label="桌面分页"
      >
        {pages.map((page, index) => (
          <section
            className="desktop-page"
            data-ui="desktop-page"
            data-page-index={index}
            key={index}
            aria-label={`第 ${index + 1} 页`}
          >
            {index === 0 && widget && (
              <div className="desktop-page-widget" ref={widgetElement}>
                {widget}
              </div>
            )}
            <section
              className="phone-app-grid"
              data-ui="app-grid"
              aria-label={`第 ${index + 1} 页应用`}
              style={
                {
                  "--desktop-page-columns": metrics.columns,
                  "--desktop-page-column-gap": `${metrics.columnGap}px`,
                } as React.CSSProperties
              }
            >
              {page}
            </section>
          </section>
        ))}
      </div>
      <nav className="desktop-page-indicator" data-ui="page-indicator" aria-label="切换桌面页">
        {pages.map((_, index) => (
          <button
            type="button"
            key={index}
            aria-label={`切换到第 ${index + 1} 页`}
            aria-current={current === index ? "page" : undefined}
            onClick={() => go(index)}
          />
        ))}
      </nav>
    </>
  );
}

function metricsWidget(config: DesktopAppearanceConfig, height?: number) {
  return height ?? Math.max(145, config.iconSize * 2);
}
