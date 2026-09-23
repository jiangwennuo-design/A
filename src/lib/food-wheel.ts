const wheelPalette = ["#b98568", "#e4b999", "#91aa96", "#8fa9b6", "#d6aeb0", "#eadfc9"];

export function buildFoodWheelGradient(count: number): string {
  if (count <= 0) return "#e8dfd1";
  const segment = 360 / count;
  const stops = Array.from({ length: count }, (_, index) => {
    const start = index * segment;
    const end = (index + 1) * segment;
    return `${wheelPalette[index % wheelPalette.length]} ${start.toFixed(5)}deg ${end.toFixed(5)}deg`;
  });
  return `conic-gradient(from 0deg, ${stops.join(",")})`;
}

export function pickFoodIndex(length: number, lastIndex: number | null, random = Math.random) {
  if (length <= 0) return -1;
  let selected = Math.floor(random() * length);
  if (length > 1 && selected === lastIndex) selected = Math.floor(random() * length);
  return selected;
}

export function rotationForFoodIndex(
  currentRotation: number,
  selectedIndex: number,
  count: number,
  extraTurns: number,
) {
  if (count <= 0 || selectedIndex < 0 || selectedIndex >= count) return currentRotation;
  const segmentAngle = 360 / count;
  const selectedCenter = (selectedIndex + 0.5) * segmentAngle;
  const currentNormalized = ((currentRotation % 360) + 360) % 360;
  const targetNormalized = ((-selectedCenter % 360) + 360) % 360;
  const forwardDelta = (targetNormalized - currentNormalized + 360) % 360;
  return currentRotation + Math.max(1, Math.floor(extraTurns)) * 360 + forwardDelta;
}

export function selectedIndexAtPointer(rotation: number, count: number) {
  if (count <= 0) return -1;
  const segmentAngle = 360 / count;
  const wheelAngleAtPointer = ((-rotation % 360) + 360) % 360;
  return Math.min(count - 1, Math.floor(wheelAngleAtPointer / segmentAngle));
}
