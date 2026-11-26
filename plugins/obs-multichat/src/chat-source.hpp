#pragma once

#include <obs-module.h>

namespace multichat {

/** Registers the "Multichat" source type. Call from obs_module_load (UI thread). */
void registerChatSource();
/** Stops the renderer. Call from obs_module_unload. */
void shutdownChatSources();

} // namespace multichat
