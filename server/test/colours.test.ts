import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { getObject } from "../src/lib/storage.js";
import { createInvite, groupWith, makeImage, resetDatabase, resetStorage, signUp, type Agent } from "./helpers.js";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
  await resetStorage();
});

afterAll(async () => {
  await resetDatabase();
  await resetStorage();
  await prisma.$disconnect();
});

const PALETTE = ["LIME", "COBALT", "TOMATO", "SUN", "BUBBLEGUM", "MINT", "LILAC", "PLUM", "SKY", "FOREST", "TANGERINE", "CHERRY"];

type Member = { color: string | null; user: { username: string } };

async function colours(agent: Agent, groupId: string) {
  const res = await agent.get(`/api/groups/${groupId}/members`);
  return Object.fromEntries((res.body.members as Member[]).map((m) => [m.user.username, m.color]));
}

function setMine(agent: Agent, groupId: string, body: object) {
  return agent.patch(`/api/groups/${groupId}/members/me`).send(body);
}

describe("member colours", () => {
  it("gives everyone the first free colour as they join, and the twelve run out", async () => {
    const names = Array.from({ length: 13 }, (_, i) => `user${String(i).padStart(2, "0")}`);
    const { owner, members, group } = await groupWith(app, ...names);

    const byName = await colours(owner.agent, group.id);
    expect(names.map((name) => byName[name])).toEqual([...PALETTE, null]);

    const created = await owner.agent.get(`/api/groups/${group.id}`);
    expect(created.body.group).toMatchObject({ myColor: "LIME", muted: false, avatarUrl: null });
    expect((await members.at(-1)!.agent.get(`/api/groups/${group.id}`)).body.group.myColor).toBeNull();

    // Leaving frees the colour for the next newcomer.
    expect((await members[2]!.agent.post(`/api/groups/${group.id}/leave`)).status).toBe(200); // SUN
    const late = await signUp(app, "late");
    const token = await createInvite(owner.agent, group.id);
    const joined = await late.agent.post(`/api/invites/${token}/accept`);
    expect(joined.body.group.myColor).toBe("SUN");
    // Fourteen people sign up here, each with a real password hash: more than the default 5 seconds on a slow machine.
  }, 30_000);

  it("lets you pick any colour nobody else in the group has", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;

    const taken = await setMine(bob.agent, group.id, { color: "LIME" });
    expect(taken.status).toBe(409);
    expect(taken.body.error).toMatchObject({ code: "COLOR_TAKEN", details: [{ path: "color", message: expect.any(String) }] });

    const changed = await setMine(bob.agent, group.id, { color: "CHERRY" });
    expect(changed.status).toBe(200);
    expect(changed.body.group).toMatchObject({ id: group.id, myColor: "CHERRY", myRole: "MEMBER" });
    // Your own colour again is fine; COBALT is free now.
    expect((await setMine(bob.agent, group.id, { color: "CHERRY" })).status).toBe(200);
    expect((await setMine(alice.agent, group.id, { color: "COBALT" })).body.group.myColor).toBe("COBALT");
    expect(await colours(alice.agent, group.id)).toEqual({ alice: "COBALT", bob: "CHERRY" });

    expect((await setMine(bob.agent, group.id, { color: "PINK" })).status).toBe(400);
    expect((await setMine(bob.agent, group.id, {})).status).toBe(400);
  });

  it("mutes a group just for you, and is for members only", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    const outsider = await signUp(app, "mallory");

    const muted = await setMine(members[0]!.agent, group.id, { muted: true });
    expect(muted.body.group).toMatchObject({ muted: true, myColor: "COBALT" });
    expect((await alice.agent.get("/api/groups")).body.groups[0].muted).toBe(false);
    expect((await members[0]!.agent.get("/api/groups")).body.groups[0].muted).toBe(true);

    expect((await setMine(outsider.agent, group.id, { muted: true })).status).toBe(404);
    expect((await request(app).patch(`/api/groups/${group.id}/members/me`).send({ muted: true })).status).toBe(401);
  });
});

describe("group photo", () => {
  const upload = async (agent: Agent, groupId: string) =>
    agent
      .put(`/api/groups/${groupId}/avatar`)
      .attach("avatar", await makeImage({ format: "png", width: 600, height: 400 }), {
        filename: "group.png",
        contentType: "image/png",
      });

  const storedKey = async (groupId: string) =>
    (await prisma.group.findUniqueOrThrow({ where: { id: groupId } })).avatarKey;

  it("is set and removed by the owner, and seen by members only", async () => {
    const { owner, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const outsider = await signUp(app, "mallory");

    expect((await upload(bob.agent, group.id)).status).toBe(403);
    expect((await upload(outsider.agent, group.id)).status).toBe(404);

    const first = await upload(owner.agent, group.id);
    expect(first.status).toBe(200);
    expect(first.body.group).toMatchObject({ id: group.id, myRole: "OWNER", myColor: "LIME" });
    expect(first.body.group.avatarUrl).toMatch(new RegExp(`^/api/groups/${group.id}/avatar\\?v=[0-9a-f]{16}$`));
    const firstKey = (await storedKey(group.id))!;
    expect(firstKey.startsWith(`groups/${group.id}/`)).toBe(true);

    // Everyone in the group sees it in their GroupView and can load it.
    expect((await bob.agent.get(`/api/groups/${group.id}`)).body.group.avatarUrl).toBe(first.body.group.avatarUrl);
    const image = await bob.agent.get(first.body.group.avatarUrl).buffer(true);
    expect(image.status).toBe(200);
    expect(image.headers["content-type"]).toBe("image/webp");
    expect((await outsider.agent.get(`/api/groups/${group.id}/avatar`)).status).toBe(404);

    // Replacing it changes the URL and removes the old file.
    const second = await upload(owner.agent, group.id);
    expect(second.body.group.avatarUrl).not.toBe(first.body.group.avatarUrl);
    expect(await getObject(firstKey)).toBeNull();

    expect((await bob.agent.delete(`/api/groups/${group.id}/avatar`)).status).toBe(403);
    const secondKey = (await storedKey(group.id))!;
    const removed = await owner.agent.delete(`/api/groups/${group.id}/avatar`);
    expect(removed.status).toBe(200);
    expect(removed.body.group.avatarUrl).toBeNull();
    expect(await getObject(secondKey)).toBeNull();
    expect((await bob.agent.get(`/api/groups/${group.id}/avatar`)).status).toBe(404);
  });

  it("goes with the group", async () => {
    const { owner, group } = await groupWith(app, "alice");
    await upload(owner.agent, group.id);
    const key = (await storedKey(group.id))!;

    expect((await owner.agent.post(`/api/groups/${group.id}/leave`)).body).toEqual({ groupDeleted: true });
    expect(await getObject(key)).toBeNull();
  });

  it("appears on the invite links you created", async () => {
    const { owner, group } = await groupWith(app, "alice");
    await upload(owner.agent, group.id);
    const { invites } = (await owner.agent.get("/api/users/me/invites")).body;
    expect(invites[0].group.avatarUrl).toMatch(/^\/api\/groups\/.+\/avatar\?v=/);
  });
});
