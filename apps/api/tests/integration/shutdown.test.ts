import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:http";
import { join } from "node:path";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@opencord/shared/events";
import { io as connect, type Socket } from "socket.io-client";
import request from "supertest";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { createSocketServer } from "../../src/socket/index.js";
import type { SocketServer } from "../../src/socket/types.js";
import { requireTestDatabase } from "../setup.js";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Instance {
  io: SocketServer;
  origin: string;
}

const password = "correct horse battery staple";
const SETTLE_MS = 400;
const BOOT_TIMEOUT_MS = 30_000;
const entrypoint = join(import.meta.dirname, "../../src/index.ts");

const signUpBody = z.object({ user: z.object({ id: z.string() }) });

interface Account {
  id: string;
  cookie: string;
}

async function signUp(username: string): Promise<Account> {
  const res = await request(app)
    .post("/api/auth/sign-up/email")
    .send({
      email: `${username}@example.com`,
      name: username,
      password,
      username,
    });

  expect(res.status).toBe(200);

  const cookies = res.get("Set-Cookie") ?? [];

  return {
    id: signUpBody.parse(res.body).user.id,
    cookie: cookies.flatMap((cookie) => cookie.split(";", 1)).join("; "),
  };
}

async function startInstance(): Promise<Instance> {
  const httpServer = createServer(app);
  const io = createSocketServer(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", resolve);
  });

  const address = httpServer.address();

  if (address === null || typeof address === "string") {
    throw new Error("Expected the server to listen on a TCP port");
  }

  return { io, origin: `http://127.0.0.1:${String(address.port)}` };
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("draining one instance reaches only its own clients", () => {
  let one: Instance;
  let two: Instance;
  const clients: Client[] = [];

  beforeAll(() => {
    requireTestDatabase();
  });

  beforeEach(async () => {
    [one, two] = await Promise.all([startInstance(), startInstance()]);
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.close();
    }

    await Promise.all([one.io.close(), two.io.close()]);
  });

  async function open(instance: Instance, account: Account): Promise<Client> {
    const client: Client = connect(instance.origin, {
      autoConnect: false,
      extraHeaders: { cookie: account.cookie },
      reconnection: false,
      transports: ["websocket"],
    });

    clients.push(client);

    const greeted = new Promise<void>((resolve) => {
      client.once("connection:ready", () => {
        resolve();
      });
    });

    client.connect();

    await greeted;

    return client;
  }

  it("tells the draining instance's clients to reconnect, and nobody else's", async () => {
    const ada = await signUp("ada");

    const staying = await open(two, ada);
    const draining = await open(one, ada);

    let drainingTold = 0;
    let stayingTold = 0;

    draining.on("system:reconnect", () => {
      drainingTold += 1;
    });

    staying.on("system:reconnect", () => {
      stayingTold += 1;
    });

    one.io.local.emit("system:reconnect");

    await sleep(SETTLE_MS);

    expect(drainingTold).toBe(1);
    expect(stayingTold).toBe(0);
  });

  it("would reach the healthy sibling too if the flag were dropped", async () => {
    const ada = await signUp("ada");

    const staying = await open(two, ada);

    let stayingTold = 0;

    staying.on("system:reconnect", () => {
      stayingTold += 1;
    });

    one.io.emit("system:reconnect");

    await sleep(SETTLE_MS);

    expect(stayingTold).toBe(1);
  });
});

describe("SIGTERM drains the instance that received it", () => {
  const children: ChildProcess[] = [];
  const clients: Client[] = [];

  beforeAll(() => {
    requireTestDatabase();
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.close();
    }

    for (const child of children.splice(0)) {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }

    await sleep(SETTLE_MS);
  });

  async function freePort(): Promise<number> {
    const probe = createServer();

    await new Promise<void>((resolve) => {
      probe.listen(0, "127.0.0.1", resolve);
    });

    const address = probe.address();

    if (address === null || typeof address === "string") {
      throw new Error("Expected the probe to listen on a TCP port");
    }

    const { port } = address;

    await new Promise<void>((resolve) => {
      probe.close(() => {
        resolve();
      });
    });

    return port;
  }

  async function boot(instanceId: string): Promise<{
    child: ChildProcess;
    origin: string;
  }> {
    const port = await freePort();

    const child = spawn(process.execPath, ["--import", "tsx", entrypoint], {
      cwd: join(import.meta.dirname, "../.."),
      env: {
        ...process.env,
        INSTANCE_ID: instanceId,
        PORT: String(port),
      },
      stdio: ["ignore", "ignore", "pipe"],
    });

    children.push(child);

    const origin = `http://127.0.0.1:${String(port)}`;
    const deadline = Date.now() + BOOT_TIMEOUT_MS;

    for (;;) {
      if (child.exitCode !== null) {
        throw new Error(`${instanceId} exited before it listened`);
      }

      try {
        const res = await fetch(`${origin}/livez`);

        if (res.ok) {
          return { child, origin };
        }
      } catch {
        /* not listening yet */
      }

      if (Date.now() > deadline) {
        throw new Error(`${instanceId} never became reachable`);
      }

      await sleep(100);
    }
  }

  function attach(origin: string, account: Account): Promise<Client> {
    const client: Client = connect(origin, {
      autoConnect: false,
      extraHeaders: { cookie: account.cookie },
      reconnection: false,
      transports: ["websocket"],
    });

    clients.push(client);

    const greeted = new Promise<Client>((resolve) => {
      client.once("connection:ready", () => {
        resolve(client);
      });
    });

    client.connect();

    return greeted;
  }

  it("tells its own clients to reconnect before the socket closes, and exits cleanly", async () => {
    const ada = await signUp("ada");

    const draining = await boot("api-drain");
    const staying = await boot("api-stay");

    const drainingClient = await attach(draining.origin, ada);
    const stayingClient = await attach(staying.origin, ada);

    const order: string[] = [];

    drainingClient.on("system:reconnect", () => {
      order.push("reconnect");
    });
    drainingClient.on("disconnect", () => {
      order.push("disconnect");
    });

    let stayingTold = 0;

    stayingClient.on("system:reconnect", () => {
      stayingTold += 1;
    });

    const exited = new Promise<number | null>((resolve) => {
      draining.child.once("exit", (code) => {
        resolve(code);
      });
    });

    draining.child.kill("SIGTERM");

    expect(await exited).toBe(0);

    await sleep(SETTLE_MS);

    expect(order).toEqual(["reconnect", "disconnect"]);
    expect(stayingTold).toBe(0);
    expect(stayingClient.connected).toBe(true);
  }, 60_000);
});
