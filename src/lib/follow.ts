import { followUser, unfollowUser } from "./rotur-api";
import { roturFollowing } from "../state";

export async function toggleFollowUser(
  username: string,
  isFollowing: boolean,
  setIsFollowing: (v: boolean) => void,
  setProfile: (p: any) => void,
  profile: any,
  onError: (e: any) => void = console.error
): Promise<void> {
  try {
    if (isFollowing) {
      await unfollowUser(username);
      setIsFollowing(false);
      roturFollowing.value = new Set([...roturFollowing.value].filter((u) => u !== username));
      if (profile) {
        setProfile({ ...profile, followers: Math.max(0, (profile.followers || 1) - 1) });
      }
    } else {
      await followUser(username);
      setIsFollowing(true);
      roturFollowing.value = new Set([...roturFollowing.value, username]);
      if (profile) {
        setProfile({ ...profile, followers: (profile.followers || 0) + 1 });
      }
    }
  } catch (e) {
    onError(e);
  }
}
