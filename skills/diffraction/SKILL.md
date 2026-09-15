---
name: diffraction
description: Prepare a local Diffraction review of repository changes, organized by behavior with explanations and anchored flags, and open it in the browser. Use when a user asks for a Diffraction review or an organized walkthrough of local changes.
---

# Diffraction review

Use Diffraction's CLI to capture source facts and validate your organization. Read [the review format](references/format.md) before authoring analysis.

The CLI is bundled with this skill's source checkout. Invoke it with `node <skill-directory>/scripts/run.mjs <command>`. It requires the checkout's npm dependencies and built viewer; installation instructions are in the project's README. If dependencies or `dist/index.html` are missing, run `npm ci` and `npm run build` from that checkout.

1. Run `capture --repo <repository>` with the comparison base supplied by the user, if any. When automatic base resolution is ambiguous, inspect repository metadata to choose the intended base or ask the user; do not silently choose an unrelated branch. Capture includes all net changes since the merge base. It prints a temporary directory containing `capture.json`, `diff.txt`, and `analysis.yaml`.
2. Read the numbered diff. Inspect any other repository code, tests, documentation, and available context needed to understand the change. The agent keeps its normal tools. Source coordinates and block selections must refer to the saved capture, even if live files change afterward. Recapture if the user wants the newer state reviewed.
3. Edit `analysis.yaml`. Explain the overall change and arrange groups by behavior or intent, bringing implementation and relevant tests together. Select whole blocks unless a block contains multiple behaviors; use row ranges for those splits. The tool-generated references are already in the diff. Do not reproduce or modify captured source.
4. Add concise flags for consequential, non-obvious details a reader may overlook: assumptions, changed boundaries, surprising consequences, or possible defects encountered while understanding the change. Do not run a separate defect hunt or invent concerns to fill a quota. Flags may be absent. Aim for 1–3 sentences each. Group descriptions may range from a sentence to a couple of paragraphs, with Mermaid diagrams when they clarify behavior.
5. Run `validate <capture-directory>`. Correct unknown references, range errors, missing coverage, or overlapping ownership using `inspect <capture-directory> --block B7` as needed. If a valid grouping remains unattainable, explain the specific limitation and open the complete-diff fallback rather than presenting an invalid grouping as complete.
6. Run `open <capture-directory>` and keep the server running. Return the complete URL, including its snapshot fragment. If the default port is occupied, use a free port with `--port`; do not stop an unrelated server. Browser feedback can be exported for further work in the current agent session.

Review groups organize a captured change; they are not independently buildable commits. Keep each changed row in exactly one group. If two behaviors share one changed line, choose one owner and explain the relationship. This workflow does not imply permission to modify repository source, commit, push, or publish anything.
