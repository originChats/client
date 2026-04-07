import {
  crackedAuthError,
  showCrackedAuthModal,
  crackedAuthLoading,
  pendingCrackedCredentials,
} from "../ui-signals";

export function handleAuthError(
  msg: { cmd: "auth_error"; val: string },
  sUrl: string,
): void {
  crackedAuthError.value = msg.val;
  crackedAuthLoading.value = false;
  pendingCrackedCredentials.value = null;

  if (showCrackedAuthModal.value !== sUrl) {
    showCrackedAuthModal.value = sUrl;
  }
}
