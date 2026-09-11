// managed by wikipoke: `wikipoke hooks add opencode` rewrites this file.
//
// OpenCode loads every .js file in .opencode/plugin/ on its own. This one runs the wiki's notifier
// once per session and puts what it prints in front of the agent. The notifier never calls a model
// and prints nothing when the wiki is current, so a current wiki adds nothing to the prompt.
import { execFileSync } from "node:child_process";

const briefed = new Map();

function brief(session, directory) {
  if (!briefed.has(session)) {
    let text = "";
    try {
      text = execFileSync("sh", ["{{WIKI}}/.wikipoke-hook.sh"], {
        cwd: directory,
        encoding: "utf8",
        timeout: 20000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      // a notifier that cannot run says nothing, like a current wiki
    }
    briefed.set(session, text);
  }
  return briefed.get(session);
}

export const wikipoke = async ({ directory }) => ({
  "experimental.chat.system.transform": async (input, output) => {
    const text = brief(input?.sessionID ?? directory, directory);
    if (text) output.system.push(`The code wiki in {{WIKI}}/ owes work:\n${text}\nThe wikipoke-ingest skill reconciles it.`);
  },
});

export default wikipoke;
