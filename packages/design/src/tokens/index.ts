export * from './color.js';
export * from './scale.js';

import { primitive, semantic, feature } from './color.js';
import {
  space,
  radius,
  font,
  fontSize,
  fontWeight,
  shadow,
  duration,
  easing,
  zIndex,
} from './scale.js';

/** Every token, one object. Consumed by the CSS emitter and by runtime code. */
export const tokens = {
  color: { primitive, semantic, feature },
  space,
  radius,
  font,
  fontSize,
  fontWeight,
  shadow,
  duration,
  easing,
  zIndex,
} as const;

export type Tokens = typeof tokens;
export type ThemeName = 'dark' | 'light';
