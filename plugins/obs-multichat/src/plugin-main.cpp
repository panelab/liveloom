/*
Multichat for OBS: Twitch, Kick and YouTube chat merged into one dock and source.
Copyright (C) 2026

This program is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation; either version 2 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License along
with this program. If not, see <https://www.gnu.org/licenses/>
*/

#include "chat-client.hpp"
#include "chat-dock.hpp"
#include "chat-source.hpp"
#include "image-cache.hpp"
#include "settings.hpp"

#include <obs-frontend-api.h>
#include <obs-module.h>
#include <plugin-support.h>

#include <curl/curl.h>

#include <QDockWidget>
#include <QPointer>

static QPointer<multichat::ChatDock> chatDock;

/** OBS hides newly added plugin docks; float ours into view the first time. */
static void onFrontendEvent(enum obs_frontend_event event, void *)
{
	if (event != OBS_FRONTEND_EVENT_FINISHED_LOADING)
		return;
	multichat::Settings s = multichat::loadSettings();
	if (s.dockShown || !chatDock)
		return;
	if (auto *dw = qobject_cast<QDockWidget *>(chatDock->parentWidget())) {
		dw->setFloating(true);
		dw->resize(380, 560);
		dw->show();
		dw->raise();
	}
	s.dockShown = true;
	multichat::saveSettings(s);
}

static void initResources()
{
	Q_INIT_RESOURCE(resources);
}

OBS_DECLARE_MODULE()
OBS_MODULE_USE_DEFAULT_LOCALE(PLUGIN_NAME, "en-US")

MODULE_EXPORT const char *obs_module_description(void)
{
	return obs_module_text("Plugin.Description");
}

bool obs_module_load(void)
{
	curl_global_init(CURL_GLOBAL_DEFAULT);
	initResources();

	multichat::registerChatSource();

	const multichat::Settings s = multichat::loadSettings();
	multichat::ChatClient::get().configure(s.server, s.token);

	auto *dock = new multichat::ChatDock();
	if (obs_frontend_add_dock_by_id("multichat-dock", obs_module_text("Dock.Title"), dock)) {
		chatDock = dock;
		obs_frontend_add_event_callback(onFrontendEvent, nullptr);
	} else {
		obs_log(LOG_WARNING, "could not add dock");
		delete dock;
	}

	obs_log(LOG_INFO, "loaded (version %s)", PLUGIN_VERSION);
	return true;
}

void obs_module_unload(void)
{
	obs_frontend_remove_event_callback(onFrontendEvent, nullptr);
	multichat::shutdownChatSources();
	multichat::ChatClient::get().shutdown();
	multichat::ImageCache::get().shutdown();
	curl_global_cleanup();
	obs_log(LOG_INFO, "unloaded");
}
