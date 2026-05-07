/**
 * Reasons we intentionally suppress global unhandled rejection noise.
 *
 * Extensions and some third-party loaders reject promises with bare DOM Events;
 * Next dev overlay renders that as "[object Event]" without a usable stack.
 *
 * Must stay in sync with the tiny inline snippet in RootLayout (<Script beforeInteractive />).
 */

export function shouldSuppressUnhandledReason(reason) {
  if (!reason) return false;

  try {
    const tag = Object.prototype.toString.call(reason);

    switch (tag) {
      case "[object Event]":
      case "[object ErrorEvent]":
      case "[object ProgressEvent]":
      case "[object AnimationEvent]":
      case "[object UIEvent]":
        return true;
      default:
        break;
    }
  } catch {
    /* ignore */
  }

  if (typeof Event !== "undefined" && reason instanceof Event) return true;
  if (typeof ErrorEvent !== "undefined" && reason instanceof ErrorEvent) return true;

  const name =
    typeof reason === "object" && reason !== null && reason.constructor
      ? reason.constructor.name
      : undefined;
  return name === "Event" || name === "ProgressEvent" || name === "ErrorEvent";
}
