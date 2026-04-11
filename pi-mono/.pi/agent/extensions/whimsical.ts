import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Claude like whimsical messages to show while the agent is working on something.
 * 
 * Source: https://github.com/mitsuhiko/agent-stuff/blob/main/pi-extensions/whimsical.ts
 */

const messages = [
    // Short
    "Futtering...",
    "Vibing...",
    "Whirring...",
    "Honking...",
    "Musing...",
    "Pondering...",

    // Long
    "Ah c'mere to me...",
    "Sure look...",
    "Sure you know yerself...",
    "There's always some handling...",
    "Giving it socks...",
    "Flat to the mat...",
    "Up to high doh...",
    "Up to my eyeballs...",
    "Sure that's a day for the fire...",
    "If there was work in the bed, he'd sleep on the floor...",
    "Thinking something fierce...",
    "Untangling spaghetti...",
    "Sacrificing to the demo gods...",
    "Monster energy break...",
    "Politely asking the CPU...",
    "Flirting with the database...",
    "Suckin' diesel...",
    "Quick oil change...",

];

function pickRandom(): string {
    return messages[Math.floor(Math.random() * messages.length)];
}

export default function (pi: ExtensionAPI) {
    pi.on("turn_start", async (_event, ctx) => {
        ctx.ui.setWorkingMessage(pickRandom());
    });

    pi.on("turn_end", async (_event, ctx) => {
        ctx.ui.setWorkingMessage(); // Reset for next time
    });
}
