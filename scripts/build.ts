// The half of the build tsc does not do: atlas's page, marked included, copied next to the
// compiled code, and the bin made executable.
import { chmodSync } from "node:fs";

import { writeAssets } from "../src/atlas/export.ts";

writeAssets("dist/atlas/web");
chmodSync("dist/bin/wikipoke.js", 0o755);
