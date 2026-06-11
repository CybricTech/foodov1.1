// Babel configuration for the Kitchyn Merchant app.
//
// - `babel-preset-expo` with the NativeWind jsxImportSource handles RN + NativeWind.
// - `react-native-worklets/plugin` MUST be listed last (it replaces the old
//   `react-native-reanimated/plugin` in Reanimated 4 / SDK 54).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: ["react-native-worklets/plugin"],
  };
};
