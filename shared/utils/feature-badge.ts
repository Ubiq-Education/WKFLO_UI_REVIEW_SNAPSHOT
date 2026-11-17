const FEATURE_TYPE_COLORS: Record<string, string> = {
  Text: '#3b82f6',
  Gallery: '#7f67af',
};

const FALLBACK_COLOR = '#6b7280';

export function getFeatureTypeColor(featureType: string): string {
  return FEATURE_TYPE_COLORS[featureType] || FALLBACK_COLOR;
}
