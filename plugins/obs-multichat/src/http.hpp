#pragma once

#include <string>

namespace multichat {

struct HttpResponse {
	long status = 0;
	std::string body;
	std::string error; // transport error, empty on success
};

/** Blocking JSON POST (call from a worker thread). */
HttpResponse httpPostJson(const std::string &url, const std::string &json, long timeoutSec = 15);

/** Escapes a string for embedding in JSON. */
std::string jsonEscape(const std::string &s);

} // namespace multichat
