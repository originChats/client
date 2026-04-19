export function canViewInChannel(userRoles: string[], viewRoles: string[] | undefined): boolean {
  if (!viewRoles || viewRoles.length === 0) return true;
  return viewRoles.some((r) => userRoles.includes(r));
}
