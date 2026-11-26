#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace multichat {

enum class Platform { Twitch, Kick, YouTube, Unknown };

Platform platformFromString(const std::string &s);
const char *platformId(Platform p); // "twitch" | "kick" | "youtube"

/** A run of text or an emote image inside a message. */
struct Part {
	bool emote = false;
	std::string text; // text, or the emote's name
	std::string url;  // emote image URL
};

struct Message {
	std::string id;
	Platform platform = Platform::Unknown;
	std::string author;
	std::string color; // "#rrggbb" or empty
	std::vector<Part> parts;
	std::string amount;      // YouTube Super Chat, e.g. "$5.00"
	int64_t receivedMs = 0; // local clock, for fading out on stream
};

/** One platform connection on the server ("connected", "offline", ...). */
struct SourceStatus {
	Platform platform = Platform::Unknown;
	std::string target;
	std::string state;
	std::string message;
};

/** A stream health warning from the server, with the exact fix. */
struct HealthIssue {
	std::string level; // "error" | "warning" | "info"
	std::string title;
	std::string fix;
};

enum class ConnState { NotConfigured, Connecting, Connected, BadToken, Error };

int64_t nowMs();

} // namespace multichat
