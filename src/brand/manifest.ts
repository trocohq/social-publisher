export const brandManifest = {
  "brand/troco-mark.svg":
    "d577f306ff034f6ee86fbc497a2d28158aa46b3cbb667d1068009a1f4631a422",
  "brand/troco-mark-inverse.svg":
    "4dddbd9361cd8bb0e77319705ece8152499a189d0d5f5d3be374767828b8bb43",
  "fonts/stolzl-regular.woff2":
    "c9d162816a718cbc2127556f95f6ffcad24bd2b0cb2ee1104f32ae39091ff881",
  "fonts/figtree-variable.ttf":
    "1851150b35645dab3a4ef935a349a2d1f5373221c0d5b6993d145210766c54de",
} as const;

export type BrandAssetPath = keyof typeof brandManifest;
