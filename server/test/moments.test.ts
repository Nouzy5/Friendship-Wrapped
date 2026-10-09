import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { setPushSender, type PushPayload, type PushTarget } from "../src/lib/push.js";
import { settleNotifications } from "../src/modules/notifications/notifications.service.js";
import {
  createGroup,
  createInvite,
  groupWith,
  makeImage,
  postPhoto,
  resetDatabase,
  resetStorage,
  signUp,
  uploadPhoto,
  type Agent,
} from "./helpers.js";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
  await resetStorage();
});

afterEach(async () => {
  await settleNotifications();
  setPushSender(null);
});

afterAll(async () => {
  await resetDatabase();
  await resetStorage();
  await prisma.$disconnect();
});

const HOUR = 60 * 60 * 1000;

type MomentBody = {
  id: string;
  groupId: string;
  title: string;
  emoji: string | null;
  startsAt: string;
  endsAt: string;
  isOpen: boolean;
  createdBy: { username: string } | null;
  photoCount: number;
  cover: { photoId: string; thumbnailUrl: string } | null;
  canManage: boolean;
};

async function startMoment(agent: Agent, groupId: string, body: object = { title: "Friday at the lake" }) {
  const res = await agent.post(`/api/groups/${groupId}/moments`).send(body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.moment as MomentBody;
}

/** Posts a photo into a moment, returning the response (it may be refused). */
async function postInto(agent: Agent, groupId: string, momentId: string, caption?: string) {
  const fields: Record<string, string> = { momentId };
  if (caption) fields.caption = caption;
  return postPhoto(agent, groupId, await makeImage(), fields);
}

const momentPhotos = async (agent: Agent, momentId: string, query = "") => {
  const res = await agent.get(`/api/moments/${momentId}/photos${query}`);
  expect(res.status).toBe(200);
  return res.body as { photos: { id: string; momentId: string | null; uploader: { username: string } }[]; nextCursor: string | null };
};

describe("starting a moment", () => {
  it("lets any member start one, open for a few hours", async () => {
    const { members, group } = await groupWith(app, "alice", "bob");
    const before = Date.now();
    const moment = await startMoment(members[0]!.agent, group.id, { title: "  Friday at the lake ", emoji: "🌙" });

    expect(moment).toMatchObject({
      groupId: group.id,
      title: "Friday at the lake",
      emoji: "🌙",
      isOpen: true,
      createdBy: { username: "bob" },
      photoCount: 0,
      cover: null,
      canManage: true,
    });
    expect((new Date(moment.endsAt).getTime() - before) / HOUR).toBeCloseTo(3, 1); // 3 hours unless asked
    expect(new Date(moment.startsAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("lasts 1, 3, 12 or 24 hours as chosen, and nothing else", async () => {
    const { owner, group } = await groupWith(app, "alice");

    for (const durationHours of [1, 12, 24]) {
      const before = Date.now();
      const moment = await startMoment(owner.agent, group.id, { title: `For ${durationHours}`, durationHours });
      expect((new Date(moment.endsAt).getTime() - before) / HOUR).toBeCloseTo(durationHours, 1);
      await owner.agent.post(`/api/moments/${moment.id}/end`);
    }
    for (const durationHours of [0, 2, 48, -1, 3.5, "3", null]) {
      const res = await owner.agent.post(`/api/groups/${group.id}/moments`).send({ title: "Nope", durationHours });
      expect(res.status, JSON.stringify(durationHours)).toBe(400);
    }
  });

  it("needs a name, and an emoji if there is one", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const bad = [
      {},
      { title: "" },
      { title: "   " },
      { title: "x".repeat(61) },
      { title: "Two\nlines" },
      { title: "‮Reversed" },
      { title: "Fine", emoji: "not an emoji" },
      { title: "Fine", emoji: "🌙🌙" },
    ];
    for (const body of bad) {
      const res = await owner.agent.post(`/api/groups/${group.id}/moments`).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(await prisma.moment.count()).toBe(0);
    // No emoji is fine, and so is null.
    expect((await startMoment(owner.agent, group.id, { title: "Plain" })).emoji).toBeNull();
    await owner.agent.post(`/api/moments/${(await prisma.moment.findFirstOrThrow()).id}/end`);
    expect((await startMoment(owner.agent, group.id, { title: "Null", emoji: null })).emoji).toBeNull();
  });

  it("is for members only", async () => {
    const { group } = await groupWith(app, "alice");
    const stranger = await signUp(app, "mallory");

    expect((await stranger.agent.post(`/api/groups/${group.id}/moments`).send({ title: "Hi" })).status).toBe(404);
    expect((await stranger.agent.get(`/api/groups/${group.id}/moments`)).status).toBe(404);
    expect((await stranger.agent.get(`/api/groups/${group.id}/moments/open`)).status).toBe(404);
    expect((await request(app).post(`/api/groups/${group.id}/moments`).send({ title: "Hi" })).status).toBe(401);
    expect(await prisma.moment.count()).toBe(0);
  });

  it("allows one open moment at a time, and another once it has ended", async () => {
    const { owner, members, group } = await groupWith(app, "alice", "bob");
    const first = await startMoment(owner.agent, group.id);

    const second = await members[0]!.agent.post(`/api/groups/${group.id}/moments`).send({ title: "Too soon" });
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({ code: "MOMENT_ALREADY_OPEN", details: { momentId: first.id } });
    expect(await prisma.moment.count()).toBe(1);

    expect((await owner.agent.post(`/api/moments/${first.id}/end`)).status).toBe(200);
    expect((await startMoment(members[0]!.agent, group.id, { title: "Now" })).title).toBe("Now");
  });

  it("allows another once the first one has run out by itself", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const first = await startMoment(owner.agent, group.id);
    await prisma.moment.update({ where: { id: first.id }, data: { endsAt: new Date(Date.now() - 1000) } });

    expect((await startMoment(owner.agent, group.id, { title: "Next" })).title).toBe("Next");
  });

  it("lets only one of two people starting at the same moment through", async () => {
    const { owner, members, group } = await groupWith(app, "alice", "bob", "carol");
    const attempts = await Promise.all(
      [owner.agent, members[0]!.agent, members[1]!.agent].map((agent, index) =>
        agent.post(`/api/groups/${group.id}/moments`).send({ title: `Attempt ${index}` }),
      ),
    );

    expect(attempts.map((res) => res.status).toSorted()).toEqual([201, 409, 409]);
    expect(await prisma.moment.count()).toBe(1);
  });

  it("is separate for each group", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const other = await createGroup(owner.agent, { name: "Work", emoji: "💼" });

    await startMoment(owner.agent, group.id);
    expect((await startMoment(owner.agent, other.id, { title: "Offsite" })).groupId).toBe(other.id);
  });
});

describe("the open moment", () => {
  it("is what's happening now, or null", async () => {
    const { members, owner, group } = await groupWith(app, "alice", "bob");
    const open = (agent: Agent) => agent.get(`/api/groups/${group.id}/moments/open`);

    expect((await open(members[0]!.agent)).body).toEqual({ moment: null });
    const moment = await startMoment(owner.agent, group.id);
    expect((await open(members[0]!.agent)).body.moment).toMatchObject({ id: moment.id, isOpen: true, canManage: false });

    await prisma.moment.update({ where: { id: moment.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    expect((await open(members[0]!.agent)).body).toEqual({ moment: null });
  });
});

describe("posting into a moment", () => {
  it("collects the photos on the moment's page, oldest first, from everyone", async () => {
    const { owner, members, group } = await groupWith(app, "alice", "bob");
    const moment = await startMoment(owner.agent, group.id);

    const first = await postInto(owner.agent, group.id, moment.id, "arrived");
    const second = await postInto(members[0]!.agent, group.id, moment.id);
    const outside = await uploadPhoto(owner.agent, group.id); // posted to the group, not the moment
    expect(first.status).toBe(201);
    expect(first.body.photo.momentId).toBe(moment.id);
    expect(outside.momentId).toBeNull();

    const page = await momentPhotos(members[0]!.agent, moment.id);
    expect(page.photos.map((photo) => photo.id)).toEqual([first.body.photo.id, second.body.photo.id]);
    expect(page.photos.map((photo) => photo.momentId)).toEqual([moment.id, moment.id]);

    // The moment now shows them: a count and the newest as its cover.
    const view = (await members[0]!.agent.get(`/api/moments/${moment.id}`)).body.moment as MomentBody;
    expect(view.photoCount).toBe(2);
    expect(view.cover?.photoId).toBe(second.body.photo.id);
    // And the group feed still has everything, the moment's photos included.
    const feed = await owner.agent.get(`/api/groups/${group.id}/photos`);
    expect(feed.body.photos).toHaveLength(3);
  });

  it("pages through a moment's photos with a cursor", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const moment = await startMoment(owner.agent, group.id);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await postInto(owner.agent, group.id, moment.id)).body.photo.id);

    const first = await momentPhotos(owner.agent, moment.id, "?limit=2");
    expect(first.photos.map((p) => p.id)).toEqual(ids.slice(0, 2));
    const second = await momentPhotos(owner.agent, moment.id, `?limit=2&cursor=${first.nextCursor}`);
    expect(second.photos.map((p) => p.id)).toEqual(ids.slice(2, 4));
    const third = await momentPhotos(owner.agent, moment.id, `?limit=2&cursor=${second.nextCursor}`);
    expect(third.photos.map((p) => p.id)).toEqual(ids.slice(4));
    expect(third.nextCursor).toBeNull();
  });

  it("refuses a moment that has ended, a moment of another group, and one that isn't there", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const other = await createGroup(owner.agent, { name: "Work", emoji: "💼" });
    const ended = await startMoment(owner.agent, group.id, { title: "Over" });
    await owner.agent.post(`/api/moments/${ended.id}/end`);
    const elsewhere = await startMoment(owner.agent, other.id, { title: "Offsite" });

    const tooLate = await postInto(owner.agent, group.id, ended.id);
    expect(tooLate.status).toBe(409);
    expect(tooLate.body.error).toMatchObject({ code: "MOMENT_ENDED", details: { momentId: ended.id } });

    expect((await postInto(owner.agent, group.id, elsewhere.id)).status).toBe(400);
    expect((await postInto(owner.agent, group.id, "01a1215c-a668-766b-8625-d50ddaa38ab0")).status).toBe(404);
    expect((await postInto(owner.agent, group.id, "not-an-id")).status).toBe(400);
    // None of them left a photo behind.
    expect(await prisma.photo.count()).toBe(0);
  });

  it("also refuses once the time has run out without anyone ending it", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const moment = await startMoment(owner.agent, group.id);
    await prisma.moment.update({ where: { id: moment.id }, data: { endsAt: new Date(Date.now() - 1) } });

    expect((await postInto(owner.agent, group.id, moment.id)).status).toBe(409);
    // Posting to the group is unaffected.
    expect((await uploadPhoto(owner.agent, group.id)).id).toBeTruthy();
  });

  it("leaves out photos by people with a block between them and the viewer, from the list, count and cover", async () => {
    const { owner, members, group } = await groupWith(app, "alice", "bob", "carol");
    const [bob, carol] = members as [(typeof members)[0], (typeof members)[0]];
    const moment = await startMoment(owner.agent, group.id);
    await postInto(bob.agent, group.id, moment.id);
    const carols = await postInto(carol.agent, group.id, moment.id);

    await owner.agent.put(`/api/users/me/blocks/${bob.user.id}`);

    const page = await momentPhotos(owner.agent, moment.id);
    expect(page.photos.map((photo) => photo.uploader.username)).toEqual(["carol"]);
    const view = (await owner.agent.get(`/api/moments/${moment.id}`)).body.moment as MomentBody;
    expect(view.photoCount).toBe(1);
    expect(view.cover?.photoId).toBe(carols.body.photo.id);
    // Carol still sees both.
    expect((await momentPhotos(carol.agent, moment.id)).photos).toHaveLength(2);
  });

  it("goes with the photo when it is deleted", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const moment = await startMoment(owner.agent, group.id);
    const photo = (await postInto(owner.agent, group.id, moment.id)).body.photo;
    expect((await owner.agent.delete(`/api/photos/${photo.id}`)).status).toBe(204);

    expect((await momentPhotos(owner.agent, moment.id)).photos).toEqual([]);
    expect(((await owner.agent.get(`/api/moments/${moment.id}`)).body.moment as MomentBody).photoCount).toBe(0);
  });
});

describe("listing moments", () => {
  it("lists them newest first, the open one at the top, with a cursor", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const made: MomentBody[] = [];
    for (let i = 0; i < 5; i++) {
      made.push(await startMoment(owner.agent, group.id, { title: `Moment ${i}` }));
      if (i < 4) await owner.agent.post(`/api/moments/${made[i]!.id}/end`);
    }

    const first = await owner.agent.get(`/api/groups/${group.id}/moments?limit=2`);
    expect(first.body.moments.map((m: MomentBody) => m.title)).toEqual(["Moment 4", "Moment 3"]);
    expect(first.body.moments.map((m: MomentBody) => m.isOpen)).toEqual([true, false]);
    const rest = await owner.agent.get(`/api/groups/${group.id}/moments?limit=10&cursor=${first.body.nextCursor}`);
    expect(rest.body.moments.map((m: MomentBody) => m.title)).toEqual(["Moment 2", "Moment 1", "Moment 0"]);
    expect(rest.body.nextCursor).toBeNull();
  });

  it("only lists the group's own", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const other = await createGroup(owner.agent, { name: "Work", emoji: "💼" });
    await startMoment(owner.agent, other.id, { title: "Offsite" });

    expect((await owner.agent.get(`/api/groups/${group.id}/moments`)).body.moments).toEqual([]);
  });
});

describe("ending and deleting a moment", () => {
  it("lets its creator and the owner end it, but not other members", async () => {
    const { owner, members, group } = await groupWith(app, "alice", "bob", "carol");
    const [bob, carol] = members as [(typeof members)[0], (typeof members)[0]];

    const bobs = await startMoment(bob.agent, group.id);
    expect((await carol.agent.post(`/api/moments/${bobs.id}/end`)).status).toBe(403);
    expect(((await carol.agent.get(`/api/moments/${bobs.id}`)).body.moment as MomentBody).canManage).toBe(false);

    const ended = (await bob.agent.post(`/api/moments/${bobs.id}/end`)).body.moment as MomentBody;
    expect(ended.isOpen).toBe(false);
    expect(new Date(ended.endsAt).getTime()).toBeLessThanOrEqual(Date.now() + 1000);

    const next = await startMoment(carol.agent, group.id, { title: "Carol's" });
    expect((await owner.agent.post(`/api/moments/${next.id}/end`)).body.moment.isOpen).toBe(false); // the owner can
  });

  it("changes nothing when it has already ended", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const moment = await startMoment(owner.agent, group.id);
    const first = (await owner.agent.post(`/api/moments/${moment.id}/end`)).body.moment as MomentBody;
    const again = (await owner.agent.post(`/api/moments/${moment.id}/end`)).body.moment as MomentBody;

    expect(again.endsAt).toBe(first.endsAt);
  });

  it("deletes the moment but keeps its photos in the group", async () => {
    const { owner, members, group } = await groupWith(app, "alice", "bob");
    const moment = await startMoment(owner.agent, group.id);
    const photo = (await postInto(members[0]!.agent, group.id, moment.id)).body.photo;

    expect((await members[0]!.agent.delete(`/api/moments/${moment.id}`)).status).toBe(403);
    expect((await owner.agent.delete(`/api/moments/${moment.id}`)).status).toBe(204);

    expect((await owner.agent.get(`/api/moments/${moment.id}`)).status).toBe(404);
    const feed = await owner.agent.get(`/api/groups/${group.id}/photos`);
    expect(feed.body.photos.map((p: { id: string; momentId: string | null }) => [p.id, p.momentId])).toEqual([[photo.id, null]]);
  });

  it("is for members only", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const moment = await startMoment(owner.agent, group.id);
    const stranger = await signUp(app, "mallory");

    for (const res of [
      await stranger.agent.get(`/api/moments/${moment.id}`),
      await stranger.agent.get(`/api/moments/${moment.id}/photos`),
      await stranger.agent.post(`/api/moments/${moment.id}/end`),
      await stranger.agent.delete(`/api/moments/${moment.id}`),
    ]) {
      expect(res.status).toBe(404);
    }
    expect((await request(app).get(`/api/moments/${moment.id}`)).status).toBe(401);
    expect(await prisma.moment.count()).toBe(1);
  });

  it("is hidden from someone who has left the group", async () => {
    const { owner, members, group } = await groupWith(app, "alice", "bob");
    const moment = await startMoment(owner.agent, group.id);
    await members[0]!.agent.post(`/api/groups/${group.id}/leave`);

    expect((await members[0]!.agent.get(`/api/moments/${moment.id}`)).status).toBe(404);
  });
});

describe("moments and accounts", () => {
  it("stay with the group when their creator's account is deleted, without a creator", async () => {
    const { owner, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const moment = await startMoment(bob.agent, group.id);
    await postInto(bob.agent, group.id, moment.id);
    await postInto(owner.agent, group.id, moment.id);

    const res = await bob.agent.delete("/api/users/me").send({ password: "correct horse battery staple" });
    expect(res.status).toBe(204);

    const view = (await owner.agent.get(`/api/moments/${moment.id}`)).body.moment as MomentBody;
    expect(view).toMatchObject({ createdBy: null, photoCount: 1, canManage: true }); // the owner can still manage it
    expect((await momentPhotos(owner.agent, moment.id)).photos.map((p) => p.uploader.username)).toEqual(["alice"]);
  });

  it("go when the group does", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const moment = await startMoment(owner.agent, group.id);
    await postInto(owner.agent, group.id, moment.id);

    expect((await owner.agent.post(`/api/groups/${group.id}/leave`)).body).toMatchObject({ groupDeleted: true });
    expect(await prisma.moment.count({ where: { id: moment.id } })).toBe(0);
    expect(await prisma.photo.count()).toBe(0);
  });
});

describe("telling the group about a moment", () => {
  let sent: { to: string; payload: PushPayload }[] = [];
  const fakeSender = async (target: PushTarget, payload: PushPayload) => {
    sent.push({ to: target.endpoint.split("/").at(-1)!, payload });
  };
  const subscribe = (agent: Agent, name: string) =>
    agent.post("/api/notifications/subscriptions").send({
      endpoint: `https://push.example.com/send/${name}`,
      keys: { p256dh: `BKey-${name}`, auth: `auth-${name}` },
    });

  async function subscribedGroup(...names: string[]) {
    const setup = await groupWith(app, ...names);
    for (const [index, person] of [setup.owner, ...setup.members].entries()) await subscribe(person.agent, names[index]!);
    sent = [];
    setPushSender(fakeSender);
    return setup;
  }

  it("notifies everyone else, with where to look", async () => {
    const { owner, members, group } = await subscribedGroup("alice", "bob", "carol");
    const moment = await startMoment(members[0]!.agent, group.id, { title: "Friday at the lake", emoji: "🌙" });
    await settleNotifications();

    expect(sent.map(({ to }) => to).toSorted()).toEqual(["alice", "carol"]); // not Bob, who started it
    expect(sent[0]!.payload).toEqual({
      title: "🍻 The Boys",
      body: "Bob started a moment: 🌙 Friday at the lake",
      url: `/memories/moments/${moment.id}`,
      tag: `moments:${group.id}`,
    });
    expect(owner).toBeTruthy();
  });

  it("says it without an emoji too, and respects the setting, mutes and the master switch", async () => {
    const { owner, members, group } = await subscribedGroup("alice", "bob", "carol", "dave");
    const [bob, carol, dave] = members as [(typeof members)[0], (typeof members)[0], (typeof members)[0]];
    await owner.agent.patch("/api/users/me/settings").send({ notifications: { moments: false } });
    await carol.agent.patch(`/api/groups/${group.id}/members/me`).send({ muted: true });
    await dave.agent.patch("/api/users/me/settings").send({ notifications: { enabled: false } });
    sent = [];

    await startMoment(bob.agent, group.id, { title: "Barbecue" });
    await settleNotifications();
    expect(sent).toEqual([]);

    await owner.agent.patch("/api/users/me/settings").send({ notifications: { moments: true } });
    const ended = (await prisma.moment.findFirstOrThrow()).id;
    await bob.agent.post(`/api/moments/${ended}/end`);
    await startMoment(bob.agent, group.id, { title: "Barbecue again" });
    await settleNotifications();
    expect(sent.map(({ to, payload }) => [to, payload.body])).toEqual([["alice", "Bob started a moment: Barbecue again"]]);
  });

  it("is on by default", async () => {
    const alice = await signUp(app, "alice");

    expect((await alice.agent.get("/api/users/me/settings")).body.settings.notifications.moments).toBe(true);
    expect(await createInvite(alice.agent, (await createGroup(alice.agent)).id)).toBeTruthy();
  });
});
