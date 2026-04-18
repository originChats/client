import type { SlashList, SlashAdd, SlashRemove } from "@/msgTypes";
import type { SlashCommand } from "../../../types";
import { slashCommandsByServer } from "../../../state";

export function handleSlashList(msg: SlashList, sUrl: string): void {
  slashCommandsByServer.set(sUrl, msg.commands as SlashCommand[]);
}

export function handleSlashAdd(msg: SlashAdd, sUrl: string): void {
  const incoming: SlashCommand[] =
    (msg.commands as SlashCommand[]) || (msg.command ? [msg.command as SlashCommand] : []);
  if (incoming.length === 0) return;
  const existing = slashCommandsByServer.read(sUrl) || [];
  const merged = [...existing];
  for (const cmd of incoming) {
    const idx = merged.findIndex((c) => c.name === cmd.name);
    if (idx !== -1) {
      merged[idx] = cmd;
    } else {
      merged.push(cmd);
    }
  }
  slashCommandsByServer.set(sUrl, merged);
}

export function handleSlashRemove(msg: SlashRemove, sUrl: string): void {
  const toRemove: string[] = msg.commands || (msg.command ? [msg.command] : []);
  if (toRemove.length === 0) return;
  const existing = slashCommandsByServer.read(sUrl) || [];
  slashCommandsByServer.set(
    sUrl,
    existing.filter((c) => !toRemove.includes(c.name))
  );
}
