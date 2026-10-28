// Runs before the legacy app, so the app's own later text changes are not overwritten.
import { applyI18n } from "./index.js";

applyI18n(document);
