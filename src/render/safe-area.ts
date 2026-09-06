const REFERENCE_WIDTH = 1080;
const REFERENCE_HEIGHT = 1350;
const REFERENCE_HORIZONTAL_MARGIN = 40;
const REFERENCE_VERTICAL_MARGIN = 60;

export type SafeArea = Readonly<{
  x: number;
  y: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}>;

export function safeAreaFor(width: number, height: number): SafeArea {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("Canvas dimensions must be positive integers");
  }

  const x = Math.round((width * REFERENCE_HORIZONTAL_MARGIN) / REFERENCE_WIDTH);
  const y = Math.round((height * REFERENCE_VERTICAL_MARGIN) / REFERENCE_HEIGHT);

  return Object.freeze({
    x,
    y,
    right: width - x,
    bottom: height - y,
    width: width - x * 2,
    height: height - y * 2,
  });
}
