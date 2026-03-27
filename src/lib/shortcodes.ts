import emojidata from "../../public/emojidata.json";
import joypixels from "../../public/joypixels.json";

let shortcodeMap: Record<string, string> = {};

(window as any).shortcodeMap = shortcodeMap;
(window as any).emojis = emojidata;

export async function loadShortcodes(): Promise<void> {
  try {
	for(const emoji of emojidata) {
		let shortcode = joypixels[emoji.hexcode];
		if (Array.isArray(shortcode)) {
			for (const elm of shortcode) {
				shortcodeMap[elm] = emoji.emoji;
			}
		} else if(shortcode)
			shortcodeMap[shortcode] = emoji.emoji;
	}
    return;
  } catch (error) {
    console.error("Failed to load shortcodes:", error);
  }

  shortcodeMap = {};
  (window as any).shortcodeMap = shortcodeMap;
}

