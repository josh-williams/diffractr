import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  actionSchema,
  reviewStateSchema,
  remoteCommentSchema,
  apiErrorSchema,
} from "../core/github-feedback.mjs";
import { anchorSchema } from "../core/review";
import type { Anchor, Comment, Snapshot } from "../core/review";
import Dialog from "./Dialog";
import { X } from "lucide-react";

type RemoteComment = z.infer<typeof remoteCommentSchema>;

type ReviewState = z.infer<typeof reviewStateSchema>;

type ReviewAction = z.infer<typeof actionSchema>;

type Draft = { body: string; operationId: string; anchor: Anchor | null };

const clean = (body: string) =>
  body.replace(/\n?<!-- diffractr:[a-f0-9-]+ -->/g, "");

const control =
  "rounded border border-mist-300 bg-white outline-blue-600 dark:outline-blue-400 px-3 py-1.5 disabled:opacity-50 dark:border-mist-700 dark:bg-mist-900";

function recover(key: string): Draft | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");

    const parsed = z
      .object({
        body: z.string(),
        operationId: z.string(),
        anchor: anchorSchema.nullable(),
      })
      .safeParse(value);

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const recoverySchema = z.object({
  summary: z.string().nullable(),
  summaryBase: z.string(),
  editing: remoteCommentSchema.nullable(),
  editText: z.string(),
});

function recoverEdits(key: string) {
  try {
    return recoverySchema.parse(
      JSON.parse(localStorage.getItem(key) ?? "null"),
    );
  } catch {
    return { summary: null, summaryBase: "", editing: null, editText: "" };
  }
}

export default function GitHubFeedback({
  snapshot,
  anchor,
  closeAnchor,
  open,
  onOpen,
  close,
  onComments,
  onCount,
}: {
  snapshot: Snapshot;
  anchor: Anchor | null;
  closeAnchor: () => void;
  open: boolean;
  onOpen: () => void;
  close: () => void;
  onComments: (comments: Comment[]) => void;
  onCount: (count: number) => void;
}) {
  const key = `diffractr:unsaved:${snapshot.id}`;

  const [draft, setDraft] = useState<Draft>(
    () => recover(key) ?? { body: "", operationId: "", anchor: null },
  );

  const [state, setState] = useState<ReviewState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fallback, setFallback] = useState("");
  const [recovery] = useState(() => recoverEdits(`${key}:edits`));
  const [summary, setSummary] = useState<string | null>(recovery.summary);
  const [summaryBase, setSummaryBase] = useState(recovery.summaryBase);

  const [editing, setEditing] = useState<RemoteComment | null>(
    recovery.editing,
  );

  const [editText, setEditText] = useState(recovery.editText);

  const [event, setEvent] = useState<"COMMENT" | "APPROVE" | "REQUEST_CHANGES">(
    "COMMENT",
  );

  const [notice, setNotice] = useState("");
  const [manageComments, setManageComments] = useState(false);
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const popoverRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const popover = popoverRef.current;

    if (!popover) return;

    if (open) {
      popover.showPopover();
      popover.querySelector("textarea")?.focus();
    } else if (popover.matches(":popover-open")) popover.hidePopover();
  }, [open]);
  useEffect(() => {
    try {
      if (summary !== null || editing)
        localStorage.setItem(
          `${key}:edits`,
          JSON.stringify({ summary, summaryBase, editing, editText }),
        );
      else localStorage.removeItem(`${key}:edits`);
    } catch {
      setNotice(
        "Browser recovery storage is unavailable. Keep this window open until saved.",
      );
    }
  }, [key, summary, summaryBase, editing, editText]);
  const locked = useRef(false);
  const readVersion = useRef(0);

  const [recoveredOpen, setRecoveredOpen] = useState(() =>
    Boolean(recover(key)?.body),
  );

  const onCommentsRef = useRef(onComments);
  useEffect(() => {
    onCommentsRef.current = onComments;
  }, [onComments]);

  async function request(
    action?: ReviewAction & { expectedUser: string },
  ): Promise<ReviewState> {
    const token = new URLSearchParams(window.location.hash.slice(1)).get(
      "snapshot",
    );

    const options: RequestInit = {
      headers: { Authorization: `Bearer ${token}` },
    };

    if (action) {
      options.method = "POST";
      options.headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      options.body = JSON.stringify(action);
    }

    const response = await fetch("/api/github-review", options);
    const result = await response.json();

    if (!response.ok) throw new Error(apiErrorSchema.parse(result).error);

    return reviewStateSchema.parse(result);
  }

  function accept(result: ReviewState) {
    setState(result);
    onCount(result.comments.length);
    onCommentsRef.current(
      result.comments.flatMap((c) => {
        const file = snapshot.files.find((f) => f.path === c.path);

        // Older/external comments remain visible in the review dialog without guessing locations.
        if (!file || c.original_commit_id !== snapshot.head) return [];

        if (!c.side) return [];
        const side = c.side === "LEFT" ? "deletions" : "additions";
        const end = c.original_line;

        if (!end) return [];

        return [
          {
            id: String(c.id),
            snapshotId: snapshot.id,
            fileId: file.id,
            side,
            start: c.original_start_line ?? end,
            end,
            body: clean(c.body),
          } satisfies Comment,
        ];
      }),
    );
  }

  async function refresh() {
    if (locked.current) return;
    locked.current = true;
    readVersion.current++;
    setBusy(true);

    try {
      accept(await request());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect to GitHub.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (locked.current) return;
      const version = ++readVersion.current;

      try {
        const result = await request();

        if (active && version === readVersion.current) {
          accept(result);
          setError("");
        }
      } catch (e) {
        if (active && version === readVersion.current)
          setError(
            e instanceof Error ? e.message : "Could not connect to GitHub.",
          );
      }
    };

    void load();
    window.addEventListener("focus", load);

    return () => {
      active = false;
      window.removeEventListener("focus", load);
    };
  }, [snapshot, open]);

  function updateDraft(next: Draft) {
    setDraft(next);

    try {
      if (next.body) localStorage.setItem(key, JSON.stringify(next));
      else localStorage.removeItem(key);
    } catch {
      setNotice(
        "Browser recovery storage is unavailable. Keep this window open until saved.",
      );
    }
  }

  async function mutate(action: ReviewAction) {
    if (locked.current || !state) return null;
    locked.current = true;
    readVersion.current++;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const result = await request({ ...action, expectedUser: state.user });
      accept(result);

      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect to GitHub.");

      return null;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  const activeAnchor = draft.anchor ?? anchor;

  async function save(inSummary = false) {
    if (!activeAnchor || !draft.body.trim()) return;
    const operationId = draft.operationId || crypto.randomUUID();
    updateDraft({ ...draft, anchor: activeAnchor, operationId });

    const result = await mutate({
      action: "add",
      ...activeAnchor,
      body: draft.body,
      operationId,
      fallback: inSummary,
    });

    if (!result) return;

    if (result.fallback) {
      setFallback(result.fallback);

      return;
    }

    updateDraft({ body: "", operationId: "", anchor: null });
    setFallback("");
    setRecoveredOpen(false);
    closeAnchor();
    setNotice("Saved to GitHub as a draft.");
  }

  async function submit() {
    if (!state) return;

    const result = await mutate({
      action: "submit",
      reviewId: state.review?.id ?? null,
      operationId: submissionId,
      body: summary ?? clean(state.review?.body ?? ""),
      event,
      expected: JSON.stringify({
        body: summary === null ? (state.review?.body ?? "") : summaryBase,
        comments: state.comments.map((c) => [c.id, c.body]),
      }),
    });

    if (result) {
      setSummary(null);
      setSubmissionId(crypto.randomUUID());
      setNotice("Review submitted to GitHub.");
      close();
    }
  }

  const composer = Boolean(
    anchor || (!open && recoveredOpen && draft.body && draft.anchor),
  );

  return (
    <>
      {draft.body && !composer && (
        <button
          className={control}
          onClick={() => {
            close();
            setRecoveredOpen(true);
          }}
        >
          Resume unsaved comment
        </button>
      )}
      {notice && !open && (
        <p role="status" className="px-4 py-1 text-xs">
          {notice}
        </p>
      )}
      {error && !open && !composer && (
        <div
          role="alert"
          className="px-4 py-2 text-sm text-red-600 dark:text-red-400"
        >
          {error} <button onClick={() => void refresh()}>Retry</button>
        </div>
      )}
      {state && state.head !== snapshot.head && (
        <div className="px-4 py-1 text-xs text-mist-500">
          New commits are available. Reviewing {snapshot.head?.slice(0, 7)}.
        </div>
      )}
      {composer && (
        <Dialog
          title="Leave feedback"
          onClose={() => {
            setRecoveredOpen(false);
            closeAnchor();
          }}
        >
          <div className="space-y-3 p-4">
            <p className="text-xs text-mist-500">
              {snapshot.files.find((f) => f.id === activeAnchor?.fileId)?.path}{" "}
              · {activeAnchor?.side === "additions" ? "New" : "Old"} lines{" "}
              {activeAnchor?.start}–{activeAnchor?.end}
            </p>
            <label className="block">
              Comment
              <textarea
                autoFocus
                className={`${control} mt-2 w-full`}
                rows={5}
                value={draft.body}
                disabled={busy}
                onChange={(e) => {
                  updateDraft({
                    body: e.target.value,
                    anchor: activeAnchor,
                    operationId: draft.operationId || crypto.randomUUID(),
                  });
                  setFallback("");
                }}
              />
            </label>
            {notice && <p role="status">{notice}</p>}
            {fallback && (
              <div className="space-y-2">
                <p>{fallback}</p>
                <p className="text-xs text-mist-500">
                  The summary entry will include this file, range, captured
                  revision, quoted code, and your comment.
                </p>
                <button
                  className={control}
                  disabled={busy}
                  onClick={() => void save(true)}
                >
                  Include in review summary
                </button>
              </div>
            )}
            {error && <p role="alert">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                className={control}
                disabled={busy}
                onClick={() => {
                  updateDraft({ body: "", operationId: "", anchor: null });
                  setFallback("");
                  closeAnchor();
                }}
              >
                Discard
              </button>
              <button
                className={control}
                disabled={busy || !state || !draft.body.trim()}
                onClick={() => void save()}
              >
                {busy ? "Saving…" : "Save draft to GitHub"}
              </button>
            </div>
          </div>
        </Dialog>
      )}

      <div
        ref={popoverRef}
        id="finish-review-popover"
        popover="auto"
        onBeforeToggle={(e) => {
          if (e.newState !== "open") return;
          const button = document.getElementById("finish-review-button");
          const rect = button?.getBoundingClientRect();
          e.currentTarget.style.top = `${(rect?.bottom ?? 48) + 8}px`;
        }}
        onToggle={(e) => {
          if (e.newState === "open") onOpen();
          else close();
        }}
        className="fixed left-auto right-4 m-0 shadow-md w-[min(28rem,calc(100vw-2rem))] max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-lg border border-mist-300 bg-mist-50 p-0 text-sm text-mist-800 dark:border-mist-700 dark:bg-mist-950 dark:text-mist-200 md:right-6"
      >
        <header className="flex items-center justify-between border-b border-mist-200 px-3 py-2 dark:border-mist-800">
          <h2 className="font-medium">Finish your review</h2>
          <button
            type="button"
            aria-label="Close review"
            onClick={close}
            className="rounded p-1 text-mist-500 hover:text-mist-900 dark:hover:text-mist-100"
          >
            <X size={16} />
          </button>
        </header>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-3 p-3">
            <textarea
              aria-label="Review summary"
              placeholder="Leave a comment"
              rows={4}
              disabled={busy}
              className={`${control} w-full resize-y`}
              value={summary ?? clean(state?.review?.body ?? "")}
              onChange={(e) => {
                if (summary === null) setSummaryBase(state?.review?.body ?? "");
                setSummary(e.target.value);
              }}
            />
            <fieldset className="space-y-2">
              <legend className="sr-only">Review outcome</legend>
              {/* SAFETY: Literal tuples preserve the three supported GitHub review events. */}
              {(
                [
                  [
                    "COMMENT",
                    "Comment",
                    "Submit feedback without explicit approval.",
                  ],
                  ["APPROVE", "Approve", "Approve these changes."],
                  [
                    "REQUEST_CHANGES",
                    "Request changes",
                    "Request changes before merging.",
                  ],
                ] as const
              ).map(([value, title, description]) => (
                <label
                  key={value}
                  className="flex items-start gap-2 has-disabled:opacity-50"
                >
                  <input
                    className="mt-1 accent-blue-600 dark:accent-blue-400"
                    type="radio"
                    name="review-outcome"
                    value={value}
                    checked={event === value}
                    disabled={
                      busy ||
                      (value !== "COMMENT" && state?.user === state?.author)
                    }
                    onChange={() => setEvent(value)}
                  />
                  <span>
                    <span className="block font-medium">{title}</span>
                    <span className="text-xs text-mist-500 dark:text-mist-400">
                      {description}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            {error && (
              <p role="alert" className="text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            {summary !== null &&
              state &&
              summaryBase !== (state.review?.body ?? "") && (
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() => setSummary(null)}
                >
                  Use updated GitHub summary
                </button>
              )}
            {(draft.body || editing) && (
              <p className="text-xs text-mist-500">
                Save or discard your unfinished comment before submitting.
              </p>
            )}
          </div>
          <footer className="flex items-center gap-3 border-t border-mist-200 p-3 dark:border-mist-800">
            <button
              type="submit"
              className="rounded bg-blue-700 px-3 py-1.5 font-medium text-white enabled:hover:bg-blue-600 disabled:opacity-50"
              disabled={
                busy ||
                !state ||
                Boolean(editing) ||
                Boolean(draft.body) ||
                (event !== "APPROVE" &&
                  !(summary ?? clean(state.review?.body ?? "")).trim() &&
                  !state.comments.length)
              }
            >
              {busy ? "Submitting…" : "Submit review"}
            </button>
            <button
              type="button"
              className="text-xs text-mist-500 dark:text-mist-400"
              disabled={!state?.comments.length && !editing}
              onClick={() => {
                close();
                setManageComments(true);
              }}
            >
              {state?.comments.length ?? 0} pending{" "}
              {(state?.comments.length ?? 0) === 1 ? "comment" : "comments"}
            </button>
          </footer>
        </form>
      </div>
      {manageComments && (
        <Dialog
          title="Pending comments"
          onClose={() => setManageComments(false)}
        >
          <div className="max-h-[70vh] space-y-3 overflow-auto p-3">
            {editing && !state?.comments.some((c) => c.id === editing.id) && (
              <div>
                <p>
                  Your unsaved edit belongs to a comment no longer in this
                  pending review.
                </p>
                <textarea
                  aria-label="Recovered comment edit"
                  className={`${control} w-full`}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                />
                <button className={control} onClick={() => setEditing(null)}>
                  Discard recovered edit
                </button>
              </div>
            )}
            {state?.comments.map((c) => (
              <article
                key={c.id}
                className="space-y-2 rounded border border-mist-200 p-3 dark:border-mist-700"
              >
                <p className="text-xs text-mist-500 wrap-anywhere">
                  {c.path} · {c.side === "LEFT" ? "Old" : "New"} lines{" "}
                  {c.original_start_line ?? c.original_line}–{c.original_line}
                </p>
                {editing?.id === c.id ? (
                  <>
                    <textarea
                      disabled={busy}
                      aria-label="Edit draft comment"
                      className={`${control} w-full`}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                    />
                    <button
                      className={control}
                      disabled={busy || !editText.trim()}
                      onClick={async () => {
                        if (
                          await mutate({
                            action: "edit",
                            id: c.id,
                            body: editText,
                            expected: clean(editing.body),
                          })
                        )
                          setEditing(null);
                      }}
                    >
                      Save changes
                    </button>
                    <button
                      className={control}
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap wrap-anywhere">
                      {clean(c.body)}
                    </p>
                    <div className="flex gap-2">
                      <button
                        className={control}
                        disabled={busy}
                        onClick={() => {
                          setEditing(c);
                          setEditText(clean(c.body));
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className={control}
                        disabled={busy}
                        onClick={() =>
                          void mutate({
                            action: "delete",
                            id: c.id,
                            expected: clean(c.body),
                          })
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </article>
            ))}

            {error && <p role="alert">{error}</p>}
          </div>
        </Dialog>
      )}
    </>
  );
}
