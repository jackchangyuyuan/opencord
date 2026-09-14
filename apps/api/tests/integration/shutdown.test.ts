import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { join } from "node:path";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@opencord/shared/events";
import { io as connect, type Socket } from "socket.io-client";
import request from "supertest";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { redis } from "../../src/redis.js";
import { currentSocketServer } from "../../src/socket/emit.js";
import { createSocketServer } from "../../src/socket/index.js";
import type { SocketServer } from "../../src/socket/types.js";
import { requireTestDatabase } from "../setup.js";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Instance {
  io: SocketServer;
  close: () => Promise<void>;
  origin: string;
}

const password = "correct horse battery staple";
const SETTLE_MS = 400;
const BOOT_TIMEOUT_MS = 30_000;
const ATTACH_TIMEOUT_MS = 10_000;
const EXIT_TIMEOUT_MS = 20_000;
const STDERR_LIMIT = 4000;
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
  const sockets = await createSocketServer(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", resolve);
  });

  const address = httpServer.address();

  if (address === null || typeof address === "string") {
    throw new Error("Expected the server to listen on a TCP port");
  }

  return { ...sockets, origin: `http://127.0.0.1:${String(address.port)}` };
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

    await Promise.all([one.close(), two.close()]);
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

describe("closing a socket server releases what it opened", () => {
  const opened: ReturnType<typeof redis.duplicate>[] = [];

  beforeAll(() => {
    requireTestDatabase();
  });

  beforeEach(() => {
    const duplicate = redis.duplicate.bind(redis);

    opened.length = 0;

    vi.spyOn(redis, "duplicate").mockImplementation((options) => {
      const client = duplicate(options);

      opened.push(client);

      return client;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("quits the adapter's connections and forgets the server", async () => {
    const httpServer = createServer(app);
    const sockets = await createSocketServer(httpServer);

    expect(opened).toHaveLength(2);
    expect(currentSocketServer()).toBe(sockets.io);

    await sockets.close();

    expect(currentSocketServer()).toBeNull();

    await vi.waitFor(() => {
      expect(opened.map((client) => client.status)).toEqual(["end", "end"]);
    });

    await expect(sockets.close()).resolves.toBeUndefined();
  });
});

describe("SIGTERM drains the instance that received it", () => {
  interface Instance {
    child: ChildProcess;
    origin: string;
    id: string;
    stderr: () => string;
  }

  const booted: Instance[] = [];
  const clients: Client[] = [];

  beforeAll(() => {
    requireTestDatabase();
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.close();
    }

    await Promise.all(
      booted.splice(0).map(async (instance) => {
        if (instance.child.exitCode === null) {
          instance.child.kill("SIGKILL");
          await once(instance.child, "exit");
        }
      }),
    );
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

  async function boot(instanceId: string): Promise<Instance> {
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

    let captured = "";

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      captured = `${captured}${chunk}`.slice(-STDERR_LIMIT);
    });

    const instance: Instance = {
      child,
      origin: `http://127.0.0.1:${String(port)}`,
      id: instanceId,
      stderr: () => captured,
    };

    booted.push(instance);

    const deadline = Date.now() + BOOT_TIMEOUT_MS;

    for (;;) {
      if (child.exitCode !== null) {
        throw new Error(
          `${instanceId} exited with ${String(child.exitCode)} before it listened: ${captured}`,
        );
      }

      try {
        const res = await fetch(`${instance.origin}/livez`);

        if (res.ok) {
          return instance;
        }
      } catch {
        // Not listening yet.
      }

      if (Date.now() > deadline) {
        throw new Error(
          `${instanceId} never answered /livez within ${String(BOOT_TIMEOUT_MS)}ms: ${captured}`,
        );
      }

      await sleep(100);
    }
  }

  function attach(instance: Instance, account: Account): Promise<Client> {
    const client: Client = connect(instance.origin, {
      autoConnect: false,
      extraHeaders: { cookie: account.cookie },
      reconnection: false,
      transports: ["websocket"],
    });

    clients.push(client);

    return new Promise<Client>((resolve, reject) => {
      const done = (): void => {
        clearTimeout(timer);
        client.off("connection:ready", ready);
        client.off("connect_error", failed);
      };

      const ready = (): void => {
        done();
        resolve(client);
      };

      const failed = (error: Error): void => {
        done();
        reject(new Error(`${instance.id} refused a socket: ${error.message}`));
      };

      const timer = setTimeout(() => {
        done();
        reject(
          new Error(
            `${instance.id} did not greet a socket within ${String(ATTACH_TIMEOUT_MS)}ms: ${instance.stderr()}`,
          ),
        );
      }, ATTACH_TIMEOUT_MS);

      client.on("connection:ready", ready);
      client.on("connect_error", failed);
      client.connect();
    });
  }

  function exitOf(instance: Instance): Promise<number | null> {
    return new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        instance.child.off("exit", done);
        reject(
          new Error(
            `${instance.id} did not exit within ${String(EXIT_TIMEOUT_MS)}ms of SIGTERM: ${instance.stderr()}`,
          ),
        );
      }, EXIT_TIMEOUT_MS);

      const done = (code: number | null): void => {
        clearTimeout(timer);
        resolve(code);
      };

      instance.child.once("exit", done);
    });
  }

  it("tells its own clients to reconnect before the socket closes, and exits cleanly", async () => {
    const ada = await signUp("ada");

    const [draining, staying] = await Promise.all([
      boot("api-drain"),
      boot("api-stay"),
    ]);

    const [drainingClient, stayingClient] = await Promise.all([
      attach(draining, ada),
      attach(staying, ada),
    ]);

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

    const exited = exitOf(draining);

    draining.child.kill("SIGTERM");

    expect(await exited).toBe(0);

    await sleep(SETTLE_MS);

    expect(order).toEqual(["reconnect", "disconnect"]);
    expect(stayingTold).toBe(0);
    expect(stayingClient.connected).toBe(true);
  }, 60_000);
});
