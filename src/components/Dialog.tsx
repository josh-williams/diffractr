import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export default function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();

    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={`m-auto max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-auto rounded-lg border border-mist-300 dark:border-mist-700 bg-mist-50 dark:bg-mist-950 p-0 text-sm text-mist-800 dark:text-mist-200 backdrop:bg-mist-950/40 ${wide ? "w-6xl" : "w-xl"}`}
      onCancel={onClose}
      aria-label={title}
    >
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-mist-200 dark:border-mist-800 bg-mist-50 dark:bg-mist-950 px-3 py-2">
        <h2>{title}</h2>
        <button
          className="inline-flex shrink-0 items-center justify-center rounded p-1 text-mist-500 dark:text-mist-400 hover:bg-mist-200 hover:dark:bg-mist-800 hover:text-mist-900 hover:dark:text-mist-100"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
