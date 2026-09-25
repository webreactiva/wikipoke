// The terminal prompts `init` asks through, and the only door to @clack/prompts. It is a
// devDependency: running from the sources it is read from node_modules, and the build bundles this
// one module into dist/ with its licences, so the published package keeps no runtime dependency.
export { cancel, confirm, intro, isCancel, log, multiselect, note, outro, text } from "@clack/prompts";
