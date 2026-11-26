#include "settings.hpp"

#include <obs-module.h>
#include <util/platform.h>

namespace multichat {

static std::string configFile()
{
	char *dir = obs_module_config_path("");
	if (dir) {
		os_mkdirs(dir);
		bfree(dir);
	}
	char *path = obs_module_config_path("settings.json");
	std::string out = path ? path : "";
	bfree(path);
	return out;
}

Settings loadSettings()
{
	Settings s;
	const std::string path = configFile();
	obs_data_t *data = path.empty() ? nullptr : obs_data_create_from_json_file_safe(path.c_str(), "bak");
	if (!data)
		return s;
	const char *server = obs_data_get_string(data, "server");
	const char *token = obs_data_get_string(data, "token");
	if (server && *server)
		s.server = server;
	if (token)
		s.token = token;
	s.dockShown = obs_data_get_bool(data, "dock_shown");
	obs_data_release(data);
	return s;
}

void saveSettings(const Settings &s)
{
	const std::string path = configFile();
	if (path.empty())
		return;
	obs_data_t *data = obs_data_create();
	obs_data_set_string(data, "server", s.server.c_str());
	obs_data_set_string(data, "token", s.token.c_str());
	obs_data_set_bool(data, "dock_shown", s.dockShown);
	obs_data_save_json_safe(data, path.c_str(), "tmp", "bak");
	obs_data_release(data);
}

} // namespace multichat
