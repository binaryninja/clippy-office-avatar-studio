/**
 * Shared controller interface validation and utilities.
 *
 * Every avatar controller must implement the same interface so that the studio
 * runtime can drive any avatar uniformly. This module provides early validation
 * and shared helpers to reduce duplication across engine implementations.
 */

const REQUIRED_CONTROLLER_KEYS = [
  "group",
  "setState",
  "update",
  "setVoiceActivity",
  "setVoiceViseme",
  "dispose",
  "getCatalog",
];

/**
 * Validate that a controller object implements the full avatar controller
 * interface. Throws on violation so bugs are caught at creation time.
 */
export function assertControllerInterface(controller, engineName) {
  if (!controller || typeof controller !== "object") {
    throw new Error(`Engine "${engineName}" factory must return an object.`);
  }

  for (const key of REQUIRED_CONTROLLER_KEYS) {
    if (!(key in controller)) {
      throw new Error(
        `Engine "${engineName}" controller missing required member: "${key}". ` +
        `Required interface: [${REQUIRED_CONTROLLER_KEYS.join(", ")}]`,
      );
    }
  }
}
