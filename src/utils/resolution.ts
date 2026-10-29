/**
 * Resolution naming that matches YouTube.
 *
 * Streaming sites do not name a quality after the raw frame height. They place
 * the video on a 16:9 ladder (2160p, 1440p, 1080p, 720p, 480p, 360p, 240p, 144p)
 * so that a 3840x1920 trailer is "2160p" and a 1080x1920 Short is "1080p", not
 * "1920p". The effective height is the larger of the short side and the long
 * side scaled to 16:9, snapped to the nearest standard rung.
 */
const LADDER = [4320, 2160, 1440, 1080, 720, 480, 360, 240, 144];

export function qualityHeight(width?: number | null, height?: number | null): number {
  const w = width ?? 0;
  const h = height ?? 0;
  if (h <= 0) return 0;
  if (w <= 0) return h;

  const long = Math.max(w, h);
  const short = Math.min(w, h);
  const effective = Math.max(short, Math.round((long * 9) / 16));

  // Encoders round dimensions (854x480, 426x240), so allow a small tolerance.
  const rung = LADDER.find(r => Math.abs(effective - r) / r <= 0.02);
  return rung ?? effective;
}

/** "1080p", "1080p60" (YouTube adds the frame rate above 30). 4K / 2K come from the tier pill. */
export function qualityLabel(
  width?: number | null,
  height?: number | null,
  fps?: number | null,
): string {
  const q = qualityHeight(width, height);
  const rate = fps && fps > 30 ? Math.round(fps) : 0;
  return rate ? `${q}p${rate}` : `${q}p`;
}
