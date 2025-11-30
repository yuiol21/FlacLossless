import { EqualizerPreset } from './types';

// Standard 10-band EQ frequencies
export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const PRESETS: Record<string, EqualizerPreset> = {
  flat: {
    name: 'Flat',
    gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  bassBoost: {
    name: 'Bass Boost',
    gains: [8, 6, 4, 2, 0, 0, 0, 0, 0, 0],
  },
  vocalBoost: {
    name: 'Vocal Boost',
    gains: [-2, -2, -1, 1, 4, 5, 4, 2, 0, 0],
  },
  rock: {
    name: 'Rock',
    gains: [4, 3, 1, 0, -1, -1, 1, 3, 4, 5],
  },
  electronic: {
    name: 'Electronic',
    gains: [6, 5, 2, 0, -2, 0, 1, 3, 5, 6],
  }
};

export const DEMO_TRACK_URL = "https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3";
