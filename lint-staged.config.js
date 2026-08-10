/** @type {import("lint-staged").Configuration} */
export default {
  "*.{js,ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,html,css,yaml}": "prettier --write",
};
