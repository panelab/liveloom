#pragma once

#include <string>

namespace multichat {

constexpr const char *DEFAULT_SERVER = "https://stream.discerns.app";

/** Plugin-wide settings, saved in the OBS plugin config folder. */
struct Settings {
	std::string server = DEFAULT_SERVER;
	std::string token;
	bool dockShown = false; // show the dock once on first install
};

Settings loadSettings();
void saveSettings(const Settings &s);

} // namespace multichat
