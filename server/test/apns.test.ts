import { generateKeyPairSync, verify, type KeyObject } from "node:crypto";
import http2 from "node:http2";
import type { AddressInfo } from "node:net";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  ApnsError,
  ApnsTimeoutError,
  apnsBody,
  collapseId,
  createApnsSender,
  isDeviceGone,
  signProviderToken,
  type ApnsConnection,
} from "../src/lib/apns.js";
import type { PushPayload } from "../src/lib/push.js";

const payload: PushPayload = {
  title: "🍻 The Boys",
  body: "Bob posted a photo",
  url: "/photos/abc",
  tag: "photos:group-1",
};
const DEVICE = "ab".repeat(32);

let privateKey: KeyObject;
let publicKey: KeyObject;

beforeAll(() => {
  ({ privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" }));
});

type Received = { headers: http2.IncomingHttpHeaders; body: string };

/** A stand-in for Apple's server (plain HTTP/2 on localhost) that answers with whatever `respond` says. */
async function startApple(respond: (request: Received, stream: http2.ServerHttp2Stream, count: number) => void) {
  const server = http2.createServer();
  const sessions = new Set<http2.ServerHttp2Session>();
  const received: Received[] = [];
  server.on("session", (session) => {
    sessions.add(session);
    session.on("close", () => sessions.delete(session));
  });
  server.on("stream", (stream, headers) => {
    let body = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => (body += chunk));
    stream.on("end", () => {
      const request = { headers, body };
      received.push(request);
      respond(request, stream, received.length);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    received,
    sessions,
    close: () => {
      for (const session of sessions) session.destroy();
      server.close();
    },
  };
}

const accept = (_request: Received, stream: http2.ServerHttp2Stream) => {
  stream.respond({ ":status": 200 });
  stream.end();
};

const refuse = (status: number, reason: string) => (_request: Received, stream: http2.ServerHttp2Stream) => {
  stream.respond({ ":status": status, "content-type": "application/json" });
  stream.end(JSON.stringify({ reason }));
};

const cleanup: (() => void)[] = [];
afterEach(() => {
  while (cleanup.length) cleanup.pop()!();
});

async function connect(
  respond: Parameters<typeof startApple>[0],
  options: { timeoutMs?: number; now?: () => number } = {},
): Promise<{ apple: Awaited<ReturnType<typeof startApple>>; connection: ApnsConnection }> {
  const apple = await startApple(respond);
  const connection = createApnsSender({
    key: privateKey,
    keyId: "ABC123DEFG",
    teamId: "TEAM123456",
    topic: "com.example.app",
    origins: { SANDBOX: apple.origin, PRODUCTION: apple.origin },
    ...options,
  });
  cleanup.push(apple.close, connection.close);
  return { apple, connection };
}

describe("what is sent to Apple", () => {
  it("is a signed alert addressed to the app, replacing earlier ones with the same tag", async () => {
    const { apple, connection } = await connect(accept, { now: () => 1_800_000_000_000 });
    await connection.send({ token: DEVICE, environment: "SANDBOX" }, payload);

    const [request] = apple.received;
    expect(request!.headers).toMatchObject({
      ":method": "POST",
      ":path": `/3/device/${DEVICE}`,
      "apns-topic": "com.example.app",
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-collapse-id": "photos:group-1",
      "apns-expiration": String(1_800_000_000 + 24 * 60 * 60),
      "content-type": "application/json",
    });
    expect(JSON.parse(request!.body)).toEqual({
      aps: { alert: { title: "🍻 The Boys", body: "Bob posted a photo" }, sound: "default" },
      url: "/photos/abc",
    });
    expect(request!.body).toBe(apnsBody(payload));
  });

  it("carries a provider token Apple can verify with the team's public key", async () => {
    const { apple, connection } = await connect(accept, { now: () => 1_800_000_000_000 });
    await connection.send({ token: DEVICE, environment: "PRODUCTION" }, payload);

    const authorization = apple.received[0]!.headers.authorization as string;
    expect(authorization.startsWith("bearer ")).toBe(true);
    const [header, claims, signature] = authorization.slice("bearer ".length).split(".") as [string, string, string];
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "ES256", kid: "ABC123DEFG" });
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({ iss: "TEAM123456", iat: 1_800_000_000 });
    expect(
      verify("sha256", Buffer.from(`${header}.${claims}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url")),
    ).toBe(true);
    // Raw r||s, 64 bytes: a DER signature would not be a valid JWT.
    expect(Buffer.from(signature, "base64url")).toHaveLength(64);
  });

  it("reuses the provider token for 40 minutes, then signs a new one", async () => {
    let clock = 1_800_000_000_000;
    const { apple, connection } = await connect(accept, { now: () => clock });
    const send = () => connection.send({ token: DEVICE, environment: "SANDBOX" }, payload);

    await send();
    clock += 39 * 60 * 1000;
    await send();
    clock += 2 * 60 * 1000;
    await send();

    const tokens = apple.received.map((request) => request.headers.authorization);
    expect(tokens[1]).toBe(tokens[0]);
    expect(tokens[2]).not.toBe(tokens[0]);
  });

  it("goes to the sandbox or the production server, depending on the token", async () => {
    const sandbox = await startApple(accept);
    const production = await startApple(accept);
    const connection = createApnsSender({
      key: privateKey,
      keyId: "ABC123DEFG",
      teamId: "TEAM123456",
      topic: "com.example.app",
      origins: { SANDBOX: sandbox.origin, PRODUCTION: production.origin },
    });
    cleanup.push(sandbox.close, production.close, connection.close);

    await connection.send({ token: DEVICE, environment: "SANDBOX" }, payload);
    await connection.send({ token: DEVICE, environment: "PRODUCTION" }, payload);
    await connection.send({ token: DEVICE, environment: "PRODUCTION" }, payload);

    expect(sandbox.received).toHaveLength(1);
    expect(production.received).toHaveLength(2);
  });

  it("keeps a collapse ID within Apple's 64 bytes", () => {
    expect(collapseId("photos:group-1")).toBe("photos:group-1");
    const long = `wrapped:${"x".repeat(80)}`;
    expect(collapseId(long)).toHaveLength(64);
    expect(collapseId(long)).toBe(collapseId(long));
    expect(collapseId(long)).not.toBe(collapseId(`${long}y`));
  });

  it("signs provider tokens the same way for a given moment", () => {
    const a = signProviderToken(privateKey, "ABC123DEFG", "TEAM123456", 1_800_000_000_000).split(".");
    expect(a).toHaveLength(3);
    expect(JSON.parse(Buffer.from(a[1]!, "base64url").toString()).iat).toBe(1_800_000_000);
  });
});

describe("when Apple refuses", () => {
  it("reports the status and reason, and tells a dead token from a temporary problem", async () => {
    const cases: [number, string, boolean][] = [
      [410, "Unregistered", true],
      [400, "BadDeviceToken", true],
      [400, "DeviceTokenNotForTopic", true],
      [400, "PayloadEmpty", false],
      [429, "TooManyRequests", false],
      [500, "InternalServerError", false],
      [503, "ServiceUnavailable", false],
    ];
    for (const [status, reason, gone] of cases) {
      const { connection } = await connect(refuse(status, reason));
      const error = await connection.send({ token: DEVICE, environment: "SANDBOX" }, payload).catch((e: unknown) => e);
      expect(error, `${status} ${reason}`).toBeInstanceOf(ApnsError);
      expect(error).toMatchObject({ statusCode: status, reason });
      expect(isDeviceGone(error), `${status} ${reason}`).toBe(gone);
    }
    expect(isDeviceGone(new Error("socket hang up"))).toBe(false);
  });

  it("copes with an answer that isn't JSON", async () => {
    const { connection } = await connect((_request, stream) => {
      stream.respond({ ":status": 502 });
      stream.end("<html>Bad gateway</html>");
    });

    const error = await connection.send({ token: DEVICE, environment: "SANDBOX" }, payload).catch((e: unknown) => e);
    expect(error).toMatchObject({ statusCode: 502, reason: null });
  });

  it("signs a fresh provider token once when Apple says ours has expired", async () => {
    let clock = 1_800_000_000_000;
    const { apple, connection } = await connect(
      (request, stream, count) => (count === 1 ? refuse(403, "ExpiredProviderToken")(request, stream) : accept(request, stream)),
      { now: () => (clock += 1000) },
    );

    await connection.send({ token: DEVICE, environment: "SANDBOX" }, payload);

    expect(apple.received).toHaveLength(2);
    expect(apple.received[1]!.headers.authorization).not.toBe(apple.received[0]!.headers.authorization);
  });

  it("gives up if a fresh provider token is refused too", async () => {
    const { apple, connection } = await connect(refuse(403, "ExpiredProviderToken"));

    await expect(connection.send({ token: DEVICE, environment: "SANDBOX" }, payload)).rejects.toMatchObject({
      statusCode: 403,
      reason: "ExpiredProviderToken",
    });
    expect(apple.received).toHaveLength(2);
  });

  it("does not wait for ever for an answer", async () => {
    const { apple, connection } = await connect(() => {}, { timeoutMs: 150 });

    await expect(connection.send({ token: DEVICE, environment: "SANDBOX" }, payload)).rejects.toBeInstanceOf(ApnsTimeoutError);
    expect(apple.received).toHaveLength(1); // a slow Apple isn't asked twice
  });
});

describe("the connection to Apple", () => {
  it("is reused for the next notification", async () => {
    const { apple, connection } = await connect(accept);
    await connection.send({ token: DEVICE, environment: "SANDBOX" }, payload);
    await connection.send({ token: DEVICE, environment: "SANDBOX" }, payload);
    await Promise.all([1, 2, 3].map(() => connection.send({ token: DEVICE, environment: "SANDBOX" }, payload)));

    expect(apple.received).toHaveLength(5);
    expect(apple.sessions.size).toBe(1);
  });

  it("is replaced when Apple closes it between notifications", async () => {
    const { apple, connection } = await connect((_request, stream, count) => {
      accept(_request, stream);
      if (count === 1) stream.session?.close(); // like Apple closing an idle connection
    });

    await connection.send({ token: DEVICE, environment: "SANDBOX" }, payload);
    await connection.send({ token: DEVICE, environment: "SANDBOX" }, payload);

    expect(apple.received).toHaveLength(2);
  });

  it("tries once more on a new connection if one dies before answering", async () => {
    const { apple, connection } = await connect((request, stream, count) => {
      if (count === 1) stream.session?.destroy();
      else accept(request, stream);
    });

    await connection.send({ token: DEVICE, environment: "SANDBOX" }, payload);

    expect(apple.received).toHaveLength(2);
    // Both are the same notification, so if the first did get through, the phone shows it once.
    expect(apple.received[1]!.headers["apns-collapse-id"]).toBe(apple.received[0]!.headers["apns-collapse-id"]);
  });

  it("fails, instead of retrying for ever, if Apple can't be reached at all", async () => {
    const connection = createApnsSender({
      key: privateKey,
      keyId: "ABC123DEFG",
      teamId: "TEAM123456",
      topic: "com.example.app",
      origins: { SANDBOX: "http://127.0.0.1:1", PRODUCTION: "http://127.0.0.1:1" },
      timeoutMs: 2000,
    });
    cleanup.push(connection.close);

    await expect(connection.send({ token: DEVICE, environment: "SANDBOX" }, payload)).rejects.toBeInstanceOf(Error);
  });
});
