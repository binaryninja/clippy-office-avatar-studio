export {
  Clippy3D,
  createClippy3D,
  createClippyPlugin,
  registerClippyAnimation,
  registerClippyProp,
  unregisterClippyAnimation,
  unregisterClippyProp,
} from "./lib/clippy-3d.js";
export { officePackPlugin } from "./lib/clippy-3d-plugin-examples.js";
export { createThumbTackAvatar, expressionProfile as thumbtackExpressionProfile } from "./lib/thumbtack-factory.js";
export { createClippyController } from "./avatars/clippy-controller.js";
export { createThumbtackController } from "./avatars/thumbtack-controller.js";
export { createAvatarViewer } from "./lib/avatar-viewer.js";
export { AVATAR_DEFINITIONS, AVATAR_ORDER, NO_PROP_VALUE, PIN_STAGE_TOP_Y } from "./config/avatars.js";
export { clamp, randomBetween, randomColor } from "./lib/utils.js";

