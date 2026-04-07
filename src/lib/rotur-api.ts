/**
 * Centralized Rotur API client.
 *
 * **Security invariant:** The raw auth token (token.value) is ONLY ever sent
 * to api.rotur.dev as a query parameter.  No other domain receives it.
 * Short-lived validators (obtained via /generate_validator) may be passed to
 * other services (photos.rotur.dev, WebSocket servers, etc.) because they
 * expire quickly and are not equivalent to the token.
 */

import { token } from "../state";
import type {
  RoturProfile,
  RoturGroup,
  RoturGroupDetails,
  RoturStanding,
  RoturGift,
  RoturFollowersResult,
  RoturFollowingResult,
  RoturStatusUpdate,
  RoturEconomyStats,
  RoturUserStats,
} from "../types";

// ── Configuration ────────────────────────────────────────────────────────────

/** The single origin that the raw token is allowed to reach. */
const ROTUR_API_BASE = "https://api.rotur.dev";
const ROTUR_AVATARS_BASE = "https://avatars.rotur.dev";
const ROTUR_AUTH_URL = "https://rotur.dev/auth";
export const ROTUR_GIFT_URL = "https://rotur.dev/gift";

// ── Internal helpers ─────────────────────────────────────────────────────────

function requireToken(): string {
  const t = token.value;
  if (!t) throw new Error("Not authenticated");
  return t;
}

/**
 * Build a URL under api.rotur.dev.
 * If `authenticated` is true the raw token is appended as `?auth=`.
 */
function buildUrl(
  path: string,
  params?: Record<string, string>,
  authenticated = false,
): string {
  const u = new URL(ROTUR_API_BASE + path);
  if (authenticated) {
    u.searchParams.set("auth", requireToken());
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      u.searchParams.set(k, v);
    }
  }
  return u.toString();
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMessage = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data.error) errorMessage = data.error;
    } catch {}
    throw new Error(errorMessage);
  }
  return res.json();
}

/** GET to api.rotur.dev (public endpoint, no token). */
async function get<T>(
  path: string,
  params?: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(buildUrl(path, params), { signal });
  return handleResponse<T>(res);
}

/** GET to api.rotur.dev (authenticated – token in query string). */
async function authGet<T>(
  path: string,
  params?: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(buildUrl(path, params, true), { signal });
  return handleResponse<T>(res);
}

/** POST to api.rotur.dev (authenticated – token in query string only). */
async function authPost<T>(
  path: string,
  body?: Record<string, any>,
  params?: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  if (body) {
    body.auth = token;
  }
  const res = await fetch(buildUrl(path, params, true), {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  return handleResponse<T>(res);
}

/** DELETE to api.rotur.dev (authenticated). */
async function authDelete<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const res = await fetch(buildUrl(path, params, true), { method: "DELETE" });
  return handleResponse<T>(res);
}

// ── Auth / Account ───────────────────────────────────────────────────────────

/** Get the authenticated user's account data. */
async function getMe(signal?: AbortSignal): Promise<any> {
  return authGet<any>("/me", undefined, signal);
}

/** Validate auth and return the /me response; returns null if token is invalid. */
export async function validateToken(signal?: AbortSignal): Promise<any | null> {
  try {
    return await getMe(signal);
  } catch {
    return null;
  }
}

/** Build the auth redirect URL (no token – just a page link). */
export function getAuthRedirectUrl(returnTo: string): string {
  return `${ROTUR_AUTH_URL}?return_to=${encodeURIComponent(returnTo)}`;
}

// ── Profile ──────────────────────────────────────────────────────────────────

/** Fetch a user's public profile. Passes auth token when available so the
 *  response includes `followed` (you→them) and `follows_me` (them→you).
 *  The API's `status` field (UserStatus object) is remapped to `customStatus`
 *  to avoid collision with the `RoturAccount.status` presence field. */
export async function getProfile(
  username: string,
  includePosts = false,
  signal?: AbortSignal,
): Promise<RoturProfile> {
  const params: Record<string, string> = {
    name: username,
    include_posts: includePosts ? "1" : "0",
  };
  const t = token.value;
  if (t) params.auth = t;
  const raw = await get<any>("/profile", params, signal);
  // Remap API `status` (UserStatus object) → `customStatus` so it doesn't
  // collide with the presence-string `status` field on RoturAccount.
  const { status: apiStatus, ...rest } = raw;
  const profile: RoturProfile = rest;
  if (apiStatus && typeof apiStatus === "object") {
    profile.customStatus = apiStatus as RoturStatusUpdate;
  }
  return profile;
}

/** Check if a username exists (no auth needed). */
async function userExists(
  username: string,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const data = await get<any>("/exists", { name: username }, signal);
    return !!data.exists;
  } catch {
    return false;
  }
}

/** Update a profile field (bio, pronouns, pfp, banner). Token in query only. */
export async function updateProfile(key: string, value: string): Promise<any> {
  return authPost<any>("/me/update", { key, value });
}

// ── Validator ────────────────────────────────────────────────────────────────

/**
 * Generate a short-lived validator via api.rotur.dev.
 * The raw token goes to api.rotur.dev; the returned validator is safe to pass
 * to other services.
 */
export async function generateValidator(validatorKey: string): Promise<string> {
  const data = await authGet<{ validator: string }>("/generate_validator", {
    key: validatorKey,
  });
  if (!data.validator) throw new Error("No validator returned from API");
  return data.validator;
}

// ── Friends ──────────────────────────────────────────────────────────────────

/** Get friends / requests / blocked from /me. */
export async function getFriends(signal?: AbortSignal): Promise<{
  friends: string[];
  requests: string[];
  blocked: string[];
}> {
  const data = await getMe(signal);
  return {
    friends: data["sys.friends"] || [],
    requests: data["sys.requests"] || [],
    blocked: data["sys.blocked"] || [],
  };
}

export async function sendFriendRequestApi(username: string): Promise<any> {
  return authPost<any>(`/friends/request/${encodeURIComponent(username)}`);
}

export async function acceptFriendRequestApi(username: string): Promise<any> {
  return authPost<any>(`/friends/accept/${encodeURIComponent(username)}`);
}

export async function rejectFriendRequestApi(username: string): Promise<any> {
  return authPost<any>(`/friends/reject/${encodeURIComponent(username)}`);
}

export async function removeFriendApi(username: string): Promise<any> {
  return authPost<any>(`/friends/remove/${encodeURIComponent(username)}`);
}

// ── Blocking ─────────────────────────────────────────────────────────────────

export async function blockUserApi(username: string): Promise<any> {
  return authPost<any>(`/me/block/${encodeURIComponent(username)}`);
}

export async function unblockUserApi(username: string): Promise<any> {
  return authPost<any>(`/me/unblock/${encodeURIComponent(username)}`);
}

// ── Following ────────────────────────────────────────────────────────────────

export async function followUser(username: string): Promise<any> {
  return authGet<any>("/follow", { username });
}

export async function unfollowUser(username: string): Promise<any> {
  return authGet<any>("/unfollow", { username });
}

/** Get a user's followers (public, no auth). */
async function getFollowers(
  username: string,
  signal?: AbortSignal,
): Promise<RoturFollowersResult> {
  return get<RoturFollowersResult>("/followers", { username }, signal);
}

/** Get who a user is following (public, no auth). */
export async function getFollowing(
  username: string,
  signal?: AbortSignal,
): Promise<RoturFollowingResult> {
  return get<RoturFollowingResult>("/following", { username }, signal);
}

// ── Status ───────────────────────────────────────────────────────────────────

/**
 * Update the current user's simple status.
 * The API accepts a single `content` query param (max 250 chars).
 * Prefix with an emoji manually if desired, e.g. "😊 Feeling great".
 */
export async function updateStatus(content: string): Promise<any> {
  return authGet<any>("/status/update", { content });
}

export async function clearStatus(): Promise<any> {
  return authGet<any>("/status/clear");
}

/** Get a user's custom status (public, no auth). Returns null if no active status. */
export async function getStatus(
  username: string,
  signal?: AbortSignal,
): Promise<RoturStatusUpdate | null> {
  try {
    const data = await get<{ status: RoturStatusUpdate }>(
      "/status/get",
      { name: username },
      signal,
    );
    return data.status ?? null;
  } catch {
    return null;
  }
}

// ── Groups ───────────────────────────────────────────────────────────────────

export async function getMyGroups(signal?: AbortSignal): Promise<RoturGroup[]> {
  const data = await authGet<{ groups: RoturGroup[] }>(
    "/groups/mine",
    undefined,
    signal,
  );
  return data.groups || [];
}

export async function searchGroups(
  query: string,
  signal?: AbortSignal,
): Promise<RoturGroup[]> {
  const data = await authGet<{ groups: RoturGroup[] }>(
    "/groups/search",
    { q: query },
    signal,
  );
  return data.groups || [];
}

async function getGroup(
  grouptag: string,
  signal?: AbortSignal,
): Promise<RoturGroupDetails> {
  return authGet<RoturGroupDetails>(
    `/groups/${encodeURIComponent(grouptag)}`,
    undefined,
    signal,
  );
}

export async function joinGroup(grouptag: string): Promise<any> {
  return authPost<any>(`/groups/${encodeURIComponent(grouptag)}/join`);
}

export async function leaveGroup(grouptag: string): Promise<any> {
  return authPost<any>(`/groups/${encodeURIComponent(grouptag)}/leave`);
}

// ── Standing ─────────────────────────────────────────────────────────────────

/** Get a user's standing/reputation (public, no auth). */
export async function getStanding(
  username: string,
  signal?: AbortSignal,
): Promise<RoturStanding | null> {
  try {
    return await get<RoturStanding>("/get_standing", { username }, signal);
  } catch {
    return null;
  }
}

// ── Gifts ────────────────────────────────────────────────────────────────────

export async function createGift(
  amount: number,
  note?: string,
  expiresInHrs?: number,
): Promise<{ code: string }> {
  return authPost<{ code: string }>("/gifts/create", {
    amount,
    note,
    expires_in_hrs: expiresInHrs || 0,
  });
}

/** Get gift details (public, no auth). */
export async function getGift(
  code: string,
  signal?: AbortSignal,
): Promise<{ gift: RoturGift }> {
  return get<{ gift: RoturGift }>(
    `/gifts/${encodeURIComponent(code)}`,
    undefined,
    signal,
  );
}

export async function claimGift(code: string): Promise<any> {
  return authPost<any>(`/gifts/claim/${encodeURIComponent(code)}`);
}

async function cancelGift(id: string): Promise<any> {
  return authPost<any>(`/gifts/cancel/${encodeURIComponent(id)}`);
}

async function getMyGifts(
  signal?: AbortSignal,
): Promise<{ gifts: RoturGift[] }> {
  return authGet<{ gifts: RoturGift[] }>("/gifts/mine", undefined, signal);
}

// ── Economy / Stats ──────────────────────────────────────────────────────────

/** Public stats endpoints – no auth. */
async function getEconomyStats(
  signal?: AbortSignal,
): Promise<RoturEconomyStats> {
  return get<RoturEconomyStats>("/stats/economy", undefined, signal);
}

async function getUserStats(
  signal?: AbortSignal,
): Promise<RoturUserStats> {
  return get<RoturUserStats>("/stats/users", undefined, signal);
}

export async function claimDaily(): Promise<any> {
  return authGet<any>("/claim_daily");
}

export async function getClaimTime(signal?: AbortSignal): Promise<any> {
  return authGet<any>("/claim_time", undefined, signal);
}

/** Transfer credits. Token only in query param, not in body. */
async function transferCredits(
  to: string,
  amount: number,
): Promise<any> {
  return authPost<any>("/me/transfer", { to, amount });
}

// ── Posts / Feed ──────────────────────────────────────────────────────────────

async function getFeed(signal?: AbortSignal): Promise<any> {
  return get<any>("/feed", undefined, signal);
}

async function getFollowingFeed(signal?: AbortSignal): Promise<any> {
  return authGet<any>("/following_feed", undefined, signal);
}

// ── Notifications ────────────────────────────────────────────────────────────

async function getNotifications(signal?: AbortSignal): Promise<any> {
  return authGet<any>("/notifications", undefined, signal);
}

// ── Badges ───────────────────────────────────────────────────────────────────

async function getBadges(signal?: AbortSignal): Promise<any> {
  return authGet<any>("/badges", undefined, signal);
}

// ── Notes ────────────────────────────────────────────────────────────────────

async function setUserNote(
  username: string,
  note: string,
): Promise<any> {
  return authPost<any>(`/me/note/${encodeURIComponent(username)}`, { note });
}

async function deleteUserNote(username: string): Promise<any> {
  return authDelete<any>(`/me/note/${encodeURIComponent(username)}`);
}

// ── Link codes ───────────────────────────────────────────────────────────────

async function getLinkCode(signal?: AbortSignal): Promise<any> {
  return get<any>("/link/code", undefined, signal);
}

async function getLinkStatus(signal?: AbortSignal): Promise<any> {
  return get<any>("/link/status", undefined, signal);
}

async function linkCodeToAccount(code: string): Promise<any> {
  return authPost<any>("/link/code", { code });
}
