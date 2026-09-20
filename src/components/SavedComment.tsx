import { useRef } from "react";
import { MessageSquare, Pencil } from "lucide-react";
import type { Comment } from "../core/review";
import Markdown from "./Markdown";

export default function SavedComment({
  comment,
  editContainer,
  onEdit,
}: {
  comment: Comment;
  editContainer: HTMLElement | null;
  onEdit: (comment: Comment, container: HTMLElement) => void;
}) {
  const editor = useRef<HTMLDivElement>(null);
  const editing = editContainer !== null && editContainer === editor.current;

  return (
    <div className="mx-3 my-2 rounded-md bg-mist-50 p-3 font-sans text-sm leading-5 text-mist-800 dark:bg-mist-800 dark:text-mist-200">
      <div className="mb-2 flex items-center gap-2">
        <MessageSquare size={15} className="shrink-0" />
        <span className="font-medium">{comment.author ?? "Your feedback"}</span>
        {comment.pending && (
          <span className="rounded-full border border-amber-700 px-1.5 text-xs font-medium leading-5 text-amber-700 dark:border-amber-400 dark:text-amber-400">
            Pending
          </span>
        )}
        {!editing && comment.editable !== false && (
          <button
            type="button"
            aria-label="Edit comment"
            title="Edit comment"
            className="-my-1 -mr-1 ml-auto inline-flex shrink-0 items-center justify-center rounded p-2 text-mist-500 hover:bg-mist-200 hover:text-mist-800 focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-mist-400 dark:hover:bg-mist-700 dark:hover:text-mist-200"
            onClick={() => {
              if (editor.current) onEdit(comment, editor.current);
            }}
          >
            <Pencil size={15} />
          </button>
        )}
      </div>
      {!editing && <Markdown text={comment.body} />}
      <div ref={editor} className="w-full min-w-0" />
    </div>
  );
}
