import { defineConfig } from "eslint/config";
import jestDom from "eslint-plugin-jest-dom";
import testingLibrary from "eslint-plugin-testing-library";

export const testingLibraryConfig = defineConfig([
  {
    name: "opencord/testing-library",
    extends: [
      testingLibrary.configs["flat/react"],
      jestDom.configs["flat/recommended"],
    ],
  },
]);
