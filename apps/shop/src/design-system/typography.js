/**
 * Andertal Typography System
 * Inter, line-height 1.4–1.6, premium marketplace scale.
 * Use via: import { typography } from '@/design-system/typography'
 * Or use Tailwind: text-h1, text-body, etc. (see tailwind.config.js)
 */

import { tokens } from "./tokens";

export const typography = {
  h1: {
    fontSize: tokens.fontSize.h1,
    lineHeight: tokens.lineHeight.tight,
    fontWeight: 600,
    fontFamily: tokens.fontFamily.sans,
    color: tokens.dark[900],
  },
  h2: {
    fontSize: tokens.fontSize.h2,
    lineHeight: tokens.lineHeight.tight,
    fontWeight: 600,
    fontFamily: tokens.fontFamily.sans,
    color: tokens.dark[900],
  },
  h3: {
    fontSize: tokens.fontSize.h3,
    lineHeight: tokens.lineHeight.tight,
    fontWeight: 600,
    fontFamily: tokens.fontFamily.sans,
    color: tokens.dark[900],
  },
  h4: {
    fontSize: tokens.fontSize.h4,
    lineHeight: tokens.lineHeight.normal,
    fontWeight: 600,
    fontFamily: tokens.fontFamily.sans,
    color: tokens.dark[800],
  },
  bodyLg: {
    fontSize: tokens.fontSize.bodyLg,
    lineHeight: tokens.lineHeight.normal,
    fontWeight: 400,
    fontFamily: tokens.fontFamily.sans,
    color: tokens.dark[800],
  },
  body: {
    fontSize: tokens.fontSize.body,
    lineHeight: tokens.lineHeight.normal,
    fontWeight: 400,
    fontFamily: tokens.fontFamily.sans,
    color: tokens.dark[800],
  },
  small: {
    fontSize: tokens.fontSize.small,
    lineHeight: tokens.lineHeight.relaxed,
    fontWeight: 400,
    fontFamily: tokens.fontFamily.sans,
    color: tokens.dark[600],
  },
  micro: {
    fontSize: tokens.fontSize.micro,
    lineHeight: tokens.lineHeight.relaxed,
    fontWeight: 400,
    fontFamily: tokens.fontFamily.sans,
    color: tokens.dark[500],
  },
};

export default typography;
