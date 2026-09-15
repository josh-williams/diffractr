import { inventory, type AuthoredAnalysis } from "../core/analysis";
import { indexChanges, type Snapshot } from "../core/review";

export const snapshot: Snapshot = {
  id: "example-invitations-v1",
  repository: "acme/workspace",
  branch: "feature/team-invitations",
  base: "main · example baseline",
  files: [
    {
      id: "model",
      path: "src/invitations/model.ts",
      role: "production",
      before: `export interface Invitation {
  id: string;
  email: string;
  teamId: string;
  createdAt: Date;
}
`,
      after: `export interface Invitation {
  id: string;
  email: string;
  teamId: string;
  createdAt: Date;
  expiresAt: Date;
}
`,
    },
    {
      id: "service",
      path: "src/invitations/service.ts",
      role: "production",
      before: `import { db } from '../db';
import { mailer } from '../mailer';

export async function createInvitation(email: string, teamId: string) {
  const invitation = await db.invitations.create({ email, teamId });
  await mailer.sendInvitation(invitation);
  return invitation;
}

export async function acceptInvitation(id: string, userId: string) {
  const invitation = await db.invitations.findById(id);
  if (!invitation) throw new Error('Invitation not found');
  await db.memberships.create({ teamId: invitation.teamId, userId });
  await db.invitations.delete(id);
}

export async function resendInvitation(id: string) {
  const invitation = await db.invitations.findById(id);
  if (!invitation) throw new Error('Invitation not found');
  await mailer.sendInvitation(invitation);
}
`,
      after: `import { db } from '../db';
import { mailer } from '../mailer';

export async function createInvitation(email: string, teamId: string) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const invitation = await db.invitations.create({ email, teamId, expiresAt });
  await mailer.sendInvitation(invitation);
  return invitation;
}

export async function acceptInvitation(id: string, userId: string) {
  const invitation = await db.invitations.findById(id);
  if (!invitation) throw new Error('Invitation not found');
  if (invitation.expiresAt.getTime() <= Date.now()) {
    throw new Error('Invitation expired');
  }
  await db.memberships.create({ teamId: invitation.teamId, userId });
  await db.invitations.delete(id);
}

export async function resendInvitation(id: string) {
  const invitation = await db.invitations.findById(id);
  if (!invitation) throw new Error('Invitation not found');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const renewed = await db.invitations.update(id, { expiresAt });
  await mailer.sendInvitation(renewed);
}
`,
    },
    {
      id: "expiry-tests",
      path: "tests/invitations/expiry.test.ts",
      role: "tests",
      before: null,
      after: `import { expect, it, vi } from 'vitest';
import { createInvitation, acceptInvitation } from '../../src/invitations/service';
import { seedInvitation, membershipCount } from '../fixtures';

it('creates an invitation valid for seven days', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-01T12:00:00Z'));
  try {
    const invitation = await createInvitation('member@example.com', 'team-1');
    expect(invitation.expiresAt.toISOString()).toBe('2026-08-08T12:00:00.000Z');
  } finally {
    vi.useRealTimers();
  }
});

it('rejects acceptance at the expiry boundary', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-08T12:00:00Z'));
  try {
    await seedInvitation({ id: 'invite-1', expiresAt: new Date() });
    await expect(acceptInvitation('invite-1', 'user-1')).rejects.toThrow('Invitation expired');
    expect(await membershipCount('user-1')).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
`,
    },
    {
      id: "resend-tests",
      path: "tests/invitations/resend.test.ts",
      role: "tests",
      before: null,
      after: `import { expect, it, vi } from 'vitest';
import { resendInvitation } from '../../src/invitations/service';
import { seedInvitation, findInvitation } from '../fixtures';

it('renews the invitation when it is resent', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-08T12:00:00Z'));
  try {
    await seedInvitation({ id: 'invite-1', expiresAt: new Date() });
    await resendInvitation('invite-1');
    const invitation = await findInvitation('invite-1');
    expect(invitation.expiresAt.toISOString()).toBe('2026-08-15T12:00:00.000Z');
  } finally {
    vi.useRealTimers();
  }
});
`,
    },
    {
      id: "generated",
      path: "generated/api/invitation.ts",
      role: "generated",
      before: `// Generated from the API schema. Do not edit.
export type InvitationResponse = {
  id: string;
  email: string;
  createdAt: string;
};
`,
      after: `// Generated from the API schema. Do not edit.
export type InvitationResponse = {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
};
`,
    },
    {
      id: "schema",
      path: "api/invitations.yaml",
      role: "other",
      before: `Invitation:
  type: object
  properties:
    id:
      type: string
    email:
      type: string
`,
      after: `Invitation:
  type: object
  properties:
    id:
      type: string
    email:
      type: string
    expiresAt:
      type: string
      format: date-time
`,
    },
  ],
};

const units = indexChanges(snapshot);

const serviceUnits = units.filter((u) => u.fileId === "service");

const expiryUnits = units.filter(
  (u) => u.fileId !== "resend-tests" && u.id !== serviceUnits.at(-1)?.id,
);

const resendUnits = units.filter((u) => !expiryUnits.includes(u));

const expiryCheck = serviceUnits[1];

const renewal = serviceUnits[2];

export const analysis: AuthoredAnalysis = {
  version: 1,
  snapshotId: snapshot.id,
  title: "Give team invitations an expiry",
  description:
    "Invitations now have a seven-day lifetime. Expired links can no longer create memberships, and resending an invitation renews its validity. The API exposes the expiry date to clients.",
  groups: [
    {
      title: "Expire invitations after seven days",
      description:
        "New invitations receive an expiry timestamp seven days from creation. Acceptance checks that timestamp before creating a membership, so expired invitations leave membership unchanged. The API schema and generated response type expose the new field.\n\nTests cover the seven-day lifetime and rejection at the exact expiry boundary.\n\n```mermaid\nflowchart LR\n  Find[Find invitation] --> Check[Check expiry]\n  Check --> Reject[Reject expired invitation]\n  Check --> Create[Create membership]\n```",
      changes: inventory(snapshot)
        .filter((b) => b.unit && expiryUnits.some((u) => u.id === b.unit!.id))
        .map((b) => ({ block: b.id })),
    },
    {
      title: "Renew invitations when resent",
      description:
        "Resending an invitation gives it a fresh seven-day lifetime before sending the email. The existing invitation is updated in place, keeping the same identifier. A test checks that resending extends its expiry.",
      changes: inventory(snapshot)
        .filter((b) => b.unit && resendUnits.some((u) => u.id === b.unit!.id))
        .map((b) => ({ block: b.id })),
    },
  ],
  flags: [
    {
      text: "An invitation expires at the exact cutoff timestamp. Check whether this matches the intended product behavior.",
      anchor: {
        block: inventory(snapshot).find((b) => b.unit?.id === expiryCheck.id)!
          .id,
      },
    },
    {
      text: "Renewal keeps the same invitation identifier. Anyone holding the previous link can use it during the renewed window.",
      anchor: {
        block: inventory(snapshot).find((b) => b.unit?.id === renewal.id)!.id,
      },
    },
  ],
};
