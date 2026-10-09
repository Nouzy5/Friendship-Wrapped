import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { sha256Hex } from "../src/lib/tokens.js";
import {
  createGroup,
  createInvite,
  groupWith as sharedGroupWith,
  resetDatabase,
  signUp,
  type Agent,
} from "./helpers.js";

const app = createApp();

beforeEach(resetDatabase);

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

const groupWith = (...usernames: string[]) => sharedGroupWith(app, ...usernames);

describe("definition of done: two accounts share a private group", () => {
  it("lets A create a group and invite B, and both see the same members", async () => {
    const a = await signUp(app, "nicolas");
    const b = await signUp(app, "bob");

    const group = await createGroup(a.agent);
    expect(group).toMatchObject({ name: "The Boys", emoji: "🍻", memberCount: 1, myRole: "OWNER" });

    const token = await createInvite(a.agent, group.id);

    const preview = await b.agent.get(`/api/invites/${token}`);
    expect(preview.body.invite).toMatchObject({
      group: { name: "The Boys", emoji: "🍻", memberCount: 1 },
      memberOfGroupId: null,
    });

    const joined = await b.agent.post(`/api/invites/${token}/accept`);
    expect(joined.status).toBe(200);
    expect(joined.body.group).toMatchObject({ id: group.id, memberCount: 2, myRole: "MEMBER" });

    for (const agent of [a.agent, b.agent]) {
      const members = await agent.get(`/api/groups/${group.id}/members`);
      expect(members.body.members.map((m: { user: { username: string }; role: string }) => [m.user.username, m.role])).toEqual([
        ["nicolas", "OWNER"],
        ["bob", "MEMBER"],
      ]);
    }

    const bobsGroups = await b.agent.get("/api/groups");
    expect(bobsGroups.body.groups).toEqual([expect.objectContaining({ id: group.id, myRole: "MEMBER" })]);
  });
});

describe("creating groups", () => {
  it.each(["🍻", "🇸🇰", "👨‍👩‍👧‍👦", "1️⃣", "❤️"])("accepts the emoji %s", async (emoji) => {
    const { agent } = await signUp(app, "alice");
    const res = await agent.post("/api/groups").send({ name: "Trip", emoji });

    expect(res.status).toBe(201);
    expect(res.body.group.emoji).toBe(emoji);
  });

  it.each(["", "a", "🍻🍻", "x🍻", ":)"])("rejects the emoji %j", async (emoji) => {
    const { agent } = await signUp(app, "alice");
    const res = await agent.post("/api/groups").send({ name: "Trip", emoji });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe("emoji");
  });

  it("requires a name", async () => {
    const { agent } = await signUp(app, "alice");
    const res = await agent.post("/api/groups").send({ name: "   ", emoji: "🍻" });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe("name");
  });

  it.each([
    ["only invisible characters", "\u200B\u3164"],
    ["a direction override", "Trip\u202Epirt"],
    ["a line separator", "Trip\u2028two"],
  ])("rejects a name with %s", async (_, name) => {
    const { agent } = await signUp(app, "alice");
    const res = await agent.post("/api/groups").send({ name, emoji: "🍻" });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe("name");
  });

  it.each(["Zoë's crew", "مرحبا", "日本の友達", "😀 squad"])("accepts the name %s", async (name) => {
    const { agent } = await signUp(app, "alice");
    expect((await agent.post("/api/groups").send({ name, emoji: "🍻" })).status).toBe(201);
  });

  it("requires sign-in", async () => {
    const res = await request(app).post("/api/groups").send({ name: "Trip", emoji: "🍻" });
    expect(res.status).toBe(401);
  });
});

describe("privacy", () => {
  it("hides a group from non-members with 404s, so they can't tell it exists", async () => {
    const { group } = await groupWith("alice", "bob");
    const outsider = await signUp(app, "mallory");

    const attempts = [
      outsider.agent.get(`/api/groups/${group.id}`),
      outsider.agent.get(`/api/groups/${group.id}/members`),
      outsider.agent.patch(`/api/groups/${group.id}`).send({ name: "Pwned" }),
      outsider.agent.post(`/api/groups/${group.id}/invites`),
      outsider.agent.delete(`/api/groups/${group.id}/invites`),
      outsider.agent.post(`/api/groups/${group.id}/leave`),
    ];

    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(404);
    }
  });

  it("only lists the signed-in user's groups", async () => {
    await groupWith("alice", "bob");
    const loner = await signUp(app, "carol");

    const res = await loner.agent.get("/api/groups");
    expect(res.body.groups).toEqual([]);
  });

  it("rejects malformed group ids", async () => {
    const { agent } = await signUp(app, "alice");
    const res = await agent.get("/api/groups/not-a-uuid");
    expect(res.status).toBe(400);
  });
});

describe("owner permissions", () => {
  it("lets the owner rename the group and change its emoji", async () => {
    const { owner, group } = await groupWith("alice");
    const res = await owner.agent.patch(`/api/groups/${group.id}`).send({ name: "Summer 2026", emoji: "🏖️" });

    expect(res.status).toBe(200);
    expect(res.body.group).toMatchObject({ name: "Summer 2026", emoji: "🏖️" });
  });

  it("forbids members from editing the group", async () => {
    const { members, group } = await groupWith("alice", "bob");
    const res = await members[0]!.agent.patch(`/api/groups/${group.id}`).send({ name: "Bob's group" });

    expect(res.status).toBe(403);
  });

  it("lets the owner remove a member, who then loses access", async () => {
    const { owner, members, group } = await groupWith("alice", "bob");
    const bob = members[0]!;

    const removed = await owner.agent.delete(`/api/groups/${group.id}/members/${bob.user.id}`);
    expect(removed.status).toBe(204);

    expect((await bob.agent.get(`/api/groups/${group.id}`)).status).toBe(404);
    const after = await owner.agent.get(`/api/groups/${group.id}`);
    expect(after.body.group.memberCount).toBe(1);
  });

  it("kills every invite link when removing someone, so they can only come back with a new one", async () => {
    const { owner, members, group, token } = await groupWith("alice", "bob");
    const bob = members[0]!;

    expect((await owner.agent.delete(`/api/groups/${group.id}/members/${bob.user.id}`)).status).toBe(204);
    expect((await bob.agent.post(`/api/invites/${token}/accept`)).status).toBe(404);
    expect((await bob.agent.get(`/api/groups/${group.id}`)).status).toBe(404);

    const fresh = await createInvite(owner.agent, group.id);
    expect((await bob.agent.post(`/api/invites/${fresh}/accept`)).status).toBe(200);
  });

  it("treats ids in any letter case as the same id", async () => {
    const { owner, members, group } = await groupWith("alice", "bob");
    const bob = members[0]!;

    // The owner can't remove themselves by spelling their id in capitals.
    const self = await owner.agent.delete(`/api/groups/${group.id}/members/${owner.user.id.toUpperCase()}`);
    expect(self.status).toBe(400);

    const removed = await owner.agent.delete(`/api/groups/${group.id.toUpperCase()}/members/${bob.user.id.toUpperCase()}`);
    expect(removed.status).toBe(204);
    const roles = await prisma.groupMember.findMany({ where: { groupId: group.id }, select: { userId: true, role: true } });
    expect(roles).toEqual([{ userId: owner.user.id, role: "OWNER" }]);
  });

  it("forbids members from removing others", async () => {
    const { owner, members, group } = await groupWith("alice", "bob");
    const res = await members[0]!.agent.delete(`/api/groups/${group.id}/members/${owner.user.id}`);

    expect(res.status).toBe(403);
  });

  it("only removes members, and only for the owner", async () => {
    const { owner, members, group } = await groupWith("alice", "bob");
    const bob = members[0]!;
    const outsider = await signUp(app, "mallory");

    expect((await owner.agent.delete(`/api/groups/${group.id}/members/${outsider.user.id}`)).status).toBe(404);
    expect((await outsider.agent.delete(`/api/groups/${group.id}/members/${bob.user.id}`)).status).toBe(404);
    expect((await outsider.agent.delete(`/api/groups/${group.id}/members/${outsider.user.id}`)).status).toBe(404);
    expect((await bob.agent.delete(`/api/groups/${group.id}/members/${bob.user.id}`)).status).toBe(403);
  });

  it("doesn't let the owner remove themselves", async () => {
    const { owner, group } = await groupWith("alice", "bob");
    const res = await owner.agent.delete(`/api/groups/${group.id}/members/${owner.user.id}`);

    expect(res.status).toBe(400);
  });

  it("lets only the owner reset invite links, which kills existing links", async () => {
    const { owner, members, group, token } = await groupWith("alice", "bob");

    expect((await members[0]!.agent.delete(`/api/groups/${group.id}/invites`)).status).toBe(403);
    expect((await owner.agent.delete(`/api/groups/${group.id}/invites`)).status).toBe(204);
    expect((await request(app).get(`/api/invites/${token}`)).status).toBe(404);
  });
});

describe("invites", () => {
  it("can be previewed without signing in, but accepting requires an account", async () => {
    const { token } = await groupWith("alice");

    const preview = await request(app).get(`/api/invites/${token}`);
    expect(preview.status).toBe(200);
    expect(preview.body.invite.group.name).toBe("The Boys");

    const accept = await request(app).post(`/api/invites/${token}/accept`);
    expect(accept.status).toBe(401);
  });

  it("rejects malformed, unknown and expired links", async () => {
    const { token } = await groupWith("alice");
    const bob = await signUp(app, "bob");

    for (const bad of ["short", "x".repeat(22)]) {
      const res = await bob.agent.post(`/api/invites/${bad}/accept`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("INVITE_INVALID");
    }

    await prisma.inviteToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await bob.agent.post(`/api/invites/${token}/accept`)).status).toBe(404);
    expect(await prisma.groupMember.count()).toBe(1);
  });

  it("treats accepting twice as a no-op", async () => {
    const { members, token } = await groupWith("alice", "bob");
    const again = await members[0]!.agent.post(`/api/invites/${token}/accept`);

    expect(again.status).toBe(200);
    expect(again.body.group.memberCount).toBe(2);
  });

  it("tells existing members they're already in", async () => {
    const { owner, group, token } = await groupWith("alice");
    const res = await owner.agent.get(`/api/invites/${token}`);

    expect(res.body.invite.memberOfGroupId).toBe(group.id);
  });

  it("stores only a hash of the token", async () => {
    const { token } = await groupWith("alice");
    const invite = await prisma.inviteToken.findFirstOrThrow();

    expect(invite.id).toBe(sha256Hex(token));
    expect(invite.id).not.toContain(token);
  });

  it("stops working when its creator leaves the group", async () => {
    const { members, group } = await groupWith("alice", "bob");
    const bob = members[0]!;
    const bobsToken = await createInvite(bob.agent, group.id);

    await bob.agent.post(`/api/groups/${group.id}/leave`);

    expect((await request(app).get(`/api/invites/${bobsToken}`)).status).toBe(404);
  });

  it("names who sent a valid link", async () => {
    const { token } = await groupWith("alice");
    const res = await request(app).get(`/api/invites/${token}`);

    expect(res.body.invite.invitedBy).toBe("Alice");
  });
});

describe("invite lifetimes", () => {
  const DAY = 24 * 60 * 60 * 1000;

  async function lifetimeOf(agent: Agent, groupId: string, body?: object) {
    const before = Date.now();
    const res = await agent.post(`/api/groups/${groupId}/invites`).send(body);
    expect(res.status).toBe(201);
    return (new Date(res.body.invite.expiresAt).getTime() - before) / DAY;
  }

  it("lasts a week unless the creator picks another length", async () => {
    const { owner, group } = await groupWith("alice");

    expect(await lifetimeOf(owner.agent, group.id)).toBeCloseTo(7, 1);
    expect(await lifetimeOf(owner.agent, group.id, {})).toBeCloseTo(7, 1);
    expect(await lifetimeOf(owner.agent, group.id, { lifetimeDays: 1 })).toBeCloseTo(1, 1);
    expect(await lifetimeOf(owner.agent, group.id, { lifetimeDays: 7 })).toBeCloseTo(7, 1);
    expect(await lifetimeOf(owner.agent, group.id, { lifetimeDays: 30 })).toBeCloseTo(30, 1);
  });

  it("refuses any other length", async () => {
    const { owner, group } = await groupWith("alice");

    for (const lifetimeDays of [0, 2, 365, -1, 7.5, "7", null]) {
      const res = await owner.agent.post(`/api/groups/${group.id}/invites`).send({ lifetimeDays });
      expect(res.status, JSON.stringify(lifetimeDays)).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(await prisma.inviteToken.count()).toBe(1); // only the one groupWith made
  });

  it("lets any member choose, not just the owner", async () => {
    const { members, group } = await groupWith("alice", "bob");

    expect(await lifetimeOf(members[0]!.agent, group.id, { lifetimeDays: 30 })).toBeCloseTo(30, 1);
  });

  it("lists a link in its creator's account with the length they chose", async () => {
    const { owner, group } = await groupWith("alice");
    await owner.agent.post(`/api/groups/${group.id}/invites`).send({ lifetimeDays: 1 });

    const res = await owner.agent.get("/api/users/me/invites");
    const lengths = res.body.invites.map(
      (invite: { createdAt: string; expiresAt: string }) =>
        Math.round((new Date(invite.expiresAt).getTime() - new Date(invite.createdAt).getTime()) / DAY),
    );
    expect(lengths.sort()).toEqual([1, 7]);
  });
});

describe("expired invite links", () => {
  const expire = (ago: number) =>
    prisma.inviteToken.updateMany({ data: { expiresAt: new Date(Date.now() - ago) } });
  const DAY = 24 * 60 * 60 * 1000;

  it("say who sent them, so the page can say who to ask", async () => {
    const { members, group } = await groupWith("alice", "bob");
    const bob = members[0]!;
    const token = await createInvite(bob.agent, group.id);
    await prisma.inviteToken.updateMany({ where: { id: sha256Hex(token) }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const stranger = await signUp(app, "carol");
    for (const res of [
      await request(app).get(`/api/invites/${token}`),
      await stranger.agent.get(`/api/invites/${token}`),
      await stranger.agent.post(`/api/invites/${token}/accept`),
    ]) {
      expect(res.status).toBe(404); // older apps only look at the status
      expect(res.body.error).toMatchObject({
        code: "INVITE_EXPIRED",
        details: { invitedBy: "Bob", groupName: "The Boys", groupEmoji: "🍻" },
      });
    }
    expect(await prisma.groupMember.count({ where: { userId: stranger.user.id } })).toBe(0);
  });

  it("are told apart from links that were turned off or never existed", async () => {
    const { owner, group, token } = await groupWith("alice");
    await owner.agent.delete(`/api/groups/${group.id}/invites`);

    for (const dead of [token, "x".repeat(22), "short"]) {
      const res = await request(app).get(`/api/invites/${dead}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("INVITE_INVALID");
      expect(res.body.error.details).toBeUndefined();
    }
  });

  it("are kept for 30 days, then count as gone", async () => {
    const { token } = await groupWith("alice");

    await expire(29 * DAY);
    expect((await request(app).get(`/api/invites/${token}`)).body.error.code).toBe("INVITE_EXPIRED");

    await expire(31 * DAY);
    const res = await request(app).get(`/api/invites/${token}`);
    expect(res.body.error.code).toBe("INVITE_INVALID");
    expect(res.body.error.details).toBeUndefined();
  });

  it("are swept up by the next new link, but only once they are past the 30 days", async () => {
    const { owner, group } = await groupWith("alice");
    const recent = await createInvite(owner.agent, group.id);
    const old = await createInvite(owner.agent, group.id);
    await prisma.inviteToken.update({ where: { id: sha256Hex(recent) }, data: { expiresAt: new Date(Date.now() - 2 * DAY) } });
    await prisma.inviteToken.update({ where: { id: sha256Hex(old) }, data: { expiresAt: new Date(Date.now() - 40 * DAY) } });

    await createInvite(owner.agent, group.id);

    expect(await prisma.inviteToken.findUnique({ where: { id: sha256Hex(recent) } })).not.toBeNull();
    expect(await prisma.inviteToken.findUnique({ where: { id: sha256Hex(old) } })).toBeNull();
  });

  it("don't name anyone once their sender has left the group", async () => {
    const { members, group } = await groupWith("alice", "bob");
    const bob = members[0]!;
    const token = await createInvite(bob.agent, group.id);
    await prisma.inviteToken.updateMany({ where: { id: sha256Hex(token) }, data: { expiresAt: new Date(Date.now() - 1000) } });

    await bob.agent.post(`/api/groups/${group.id}/leave`);

    expect((await request(app).get(`/api/invites/${token}`)).body.error.code).toBe("INVITE_INVALID");
  });

  it("are left out of the sender's list of links that work", async () => {
    const { owner } = await groupWith("alice");
    await expire(1000);

    expect((await owner.agent.get("/api/users/me/invites")).body.invites).toEqual([]);
  });
});

describe("leaving", () => {
  it("removes a member's access", async () => {
    const { owner, members, group } = await groupWith("alice", "bob");
    const bob = members[0]!;

    const res = await bob.agent.post(`/api/groups/${group.id}/leave`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ groupDeleted: false });

    expect((await bob.agent.get(`/api/groups/${group.id}`)).status).toBe(404);
    expect((await owner.agent.get(`/api/groups/${group.id}`)).body.group.memberCount).toBe(1);
  });

  it("passes ownership to the longest-standing member when the owner leaves", async () => {
    const { owner, members, group } = await groupWith("alice", "bob", "carol");
    const [bob, carol] = members;

    await owner.agent.post(`/api/groups/${group.id}/leave`);

    expect((await bob!.agent.get(`/api/groups/${group.id}`)).body.group.myRole).toBe("OWNER");
    expect((await carol!.agent.get(`/api/groups/${group.id}`)).body.group.myRole).toBe("MEMBER");
    expect(await prisma.groupMember.count({ where: { groupId: group.id, role: "OWNER" } })).toBe(1);
  });

  it("deletes the group when its last member leaves", async () => {
    const { owner, group } = await groupWith("alice");

    const res = await owner.agent.post(`/api/groups/${group.id}/leave`);

    expect(res.body).toEqual({ groupDeleted: true });
    expect(await prisma.group.count()).toBe(0);
    expect(await prisma.inviteToken.count()).toBe(0);
  });
});
