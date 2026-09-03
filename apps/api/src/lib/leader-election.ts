import { randomUUID } from "node:crypto";

import { config } from "../config.js";
import { redis } from "../redis.js";

export const LEADER_KEY = `${config.JOB_LOCK_NAMESPACE}:leader`;
export const LEASE_SECONDS = 30;
export const RENEW_SECONDS = 10;

const RENEW_LUA = `if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("expire",KEYS[1],ARGV[2]) else return 0 end`;
const RELEASE_LUA = `if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`;

export const leaderToken = randomUUID();

export async function acquireLeadership(): Promise<boolean> {
  const acquired = await redis.set(
    LEADER_KEY,
    leaderToken,
    "EX",
    LEASE_SECONDS,
    "NX",
  );

  return acquired === "OK";
}

export async function renewLeadership(): Promise<boolean> {
  const renewed = await redis.eval(
    RENEW_LUA,
    1,
    LEADER_KEY,
    leaderToken,
    String(LEASE_SECONDS),
  );

  return renewed === 1;
}

export async function releaseLeadership(): Promise<boolean> {
  const released = await redis.eval(RELEASE_LUA, 1, LEADER_KEY, leaderToken);

  return released === 1;
}
