let shortcodeMap: Record<string, string> = {};

export async function loadShortcodes(): Promise<void> {
  try {
    const response = await fetch("/shortcodes.json");
    if (!response.ok) return;
    const data = await response.json();
    shortcodeMap = {};
    for (const item of data) {
      shortcodeMap[item.emoji] = item.emoji;
      if (item.label) {
        shortcodeMap[`:${item.label}:`] = item.emoji;
        const underscoreKey = `:${item.label.replace(/ /g, "_")}:`;
        if (underscoreKey !== `:${item.label}:`) {
          shortcodeMap[underscoreKey] = item.emoji;
        }
      }
      if (item.shortcodes) {
        for (const shortcode of item.shortcodes) {
          shortcodeMap[shortcode] = item.emoji;
        }
      }
    }
    (window as any).shortcodeMap = shortcodeMap;
    (window as any).shortcodes = data;
    return;
  } catch (error) {
    console.error("Failed to load shortcodes:", error);
  }

  shortcodeMap = {};
  (window as any).shortcodeMap = shortcodeMap;
  (window as any).shortcodes = [];
}

export function getShortcodeMap(): Record<string, string> {
  return shortcodeMap;
}

function setShortcodeMap(map: Record<string, string>) {
  shortcodeMap = map;
  (window as any).shortcodeMap = map;
}
