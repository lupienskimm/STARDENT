"use client";
import { useEffect, useState } from "react";

type CreatoolApi = { visible: boolean; child?: boolean; toggle: () => void };
const api = () => (typeof window === "undefined" ? null : ((window as unknown as { Creatool?: CreatoolApi }).Creatool ?? null));

/** Shows or hides Azervera CREATOOL. Renders nothing until the editor has loaded, and nothing inside its device preview. */
export function CreatoolTlacitko({
  className,
  onPick,
  openLabel = "✎ Začít upravovat web",
  closeLabel = "Skrýt editor úprav",
}: {
  className?: string;
  onPick?: () => void;
  openLabel?: string;
  closeLabel?: string;
}) {
  const [state, setState] = useState<"none" | "hidden" | "visible">("none");
  useEffect(() => {
    const sync = () => {
      const c = api();
      setState(!c || c.child ? "none" : c.visible ? "visible" : "hidden");
    };
    sync();
    window.addEventListener("creatool:ready", sync);
    window.addEventListener("creatool:visibility", sync);
    return () => {
      window.removeEventListener("creatool:ready", sync);
      window.removeEventListener("creatool:visibility", sync);
    };
  }, []);
  if (state === "none") return null;
  return (
    <button
      type="button"
      className={className}
      data-creatool-ignore
      onClick={() => {
        api()?.toggle();
        onPick?.();
      }}
    >
      {state === "visible" ? closeLabel : openLabel}
    </button>
  );
}
