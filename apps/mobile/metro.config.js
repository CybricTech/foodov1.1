// Metro configuration for the Kitchyn Merchant app inside the foodo monorepo.
//
// This config teaches Metro to resolve and transpile the workspace packages
// (`@foodo/utils`, `@foodo/database`, `@foodo/tokens`) which export raw TS
// source from `./src`. Follows the official Expo monorepo guide:
// https://docs.expo.dev/guides/monorepo/
//
// IMPORTANT (monorepo friction notes, plan §3):
//   - `watchFolders` includes the repo root so Metro watches `packages/*`.
//   - `nodeModulesPaths` lets Metro resolve deps hoisted to the repo-root
//     node_modules as well as the app-local node_modules.
//   - `unstable_enablePackageExports` is left on (Metro default in SDK 54) so
//     `@supabase/supabase-js`'s package "exports" map resolves correctly.

const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole monorepo so edits to packages/* trigger fast refresh.
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from both the app and the workspace root node_modules.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 3. Keep hierarchical lookup ENABLED (Metro default). Disabling it breaks
//    resolution of Expo's own nested deps (expo-asset, etc.) in a hoisted
//    monorepo, per the official Expo monorepo guide. We rely on watchFolders +
//    nodeModulesPaths above for workspace resolution instead.

// 4. The shared workspace packages ship `.ts`/`.tsx` source directly; ensure
//    Metro treats those as source extensions (it does by default, but we make
//    it explicit so transpilation of `@foodo/*` src is guaranteed).
config.resolver.sourceExts = Array.from(
  new Set([...config.resolver.sourceExts, "ts", "tsx", "cjs", "mjs"])
);

const finalConfig = withNativeWind(config, {
  input: "./global.css",
});

// 5. Force a SINGLE copy of `react` and `react-native` into the bundle.
//    A transitive dep (nativewind → react-native-css-interop) nests its own
//    newer react-native, which Metro would otherwise bundle alongside the
//    Expo SDK copy — producing duplicate-RN codegen errors. We redirect every
//    `react`/`react-native` request to resolve from the app's node_modules by
//    resetting the resolution origin, guaranteeing one version (the SDK's).
const previousResolveRequest = finalConfig.resolver.resolveRequest;
const singletonOrigin = path.resolve(projectRoot, "node_modules", "__singleton__.js");
finalConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  // `react-native-gifted-charts` does `require('react-native-linear-gradient')`
  // first (for bare RN) and only falls back to `expo-linear-gradient` in a
  // try/catch. We use the Expo gradient, so alias the bare-RN package onto it
  // so Metro (which resolves both branches of the try/catch statically) doesn't
  // hard-fail on the missing module. No extra dependency is shipped.
  if (/^react-native-linear-gradient(\/|$)/.test(moduleName)) {
    return context.resolveRequest(context, "expo-linear-gradient", platform);
  }
  if (/^(react-native|react)(\/|$)/.test(moduleName)) {
    return context.resolveRequest(
      { ...context, originModulePath: singletonOrigin },
      moduleName,
      platform
    );
  }
  const next = previousResolveRequest ?? context.resolveRequest;
  return next(context, moduleName, platform);
};

module.exports = finalConfig;
