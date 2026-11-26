#include "http.hpp"

#include <plugin-support.h>
#include <curl/curl.h>

namespace multichat {

static size_t collect(char *ptr, size_t size, size_t nmemb, void *user)
{
	auto *out = static_cast<std::string *>(user);
	if (out->size() + size * nmemb > (1 << 20))
		return 0;
	out->append(ptr, size * nmemb);
	return size * nmemb;
}

HttpResponse httpPostJson(const std::string &url, const std::string &json, long timeoutSec)
{
	HttpResponse r;
	CURL *curl = curl_easy_init();
	if (!curl) {
		r.error = "curl init failed";
		return r;
	}
	curl_slist *headers = nullptr;
	headers = curl_slist_append(headers, "Content-Type: application/json");
	headers = curl_slist_append(headers, "Accept: application/json");
	const std::string ua = std::string("obs-multichat/") + PLUGIN_VERSION;
	char errbuf[CURL_ERROR_SIZE] = {0};

	curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
	curl_easy_setopt(curl, CURLOPT_POST, 1L);
	curl_easy_setopt(curl, CURLOPT_POSTFIELDS, json.c_str());
	curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, (long)json.size());
	curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
	curl_easy_setopt(curl, CURLOPT_USERAGENT, ua.c_str());
	curl_easy_setopt(curl, CURLOPT_TIMEOUT, timeoutSec);
	curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
	curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, collect);
	curl_easy_setopt(curl, CURLOPT_WRITEDATA, &r.body);
	curl_easy_setopt(curl, CURLOPT_ERRORBUFFER, errbuf);

	const CURLcode res = curl_easy_perform(curl);
	if (res != CURLE_OK)
		r.error = errbuf[0] ? errbuf : curl_easy_strerror(res);
	curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &r.status);
	curl_slist_free_all(headers);
	curl_easy_cleanup(curl);
	return r;
}

std::string jsonEscape(const std::string &s)
{
	std::string out;
	out.reserve(s.size() + 2);
	for (const char c : s) {
		switch (c) {
		case '"':
			out += "\\\"";
			break;
		case '\\':
			out += "\\\\";
			break;
		case '\n':
			out += "\\n";
			break;
		case '\r':
			out += "\\r";
			break;
		case '\t':
			out += "\\t";
			break;
		default:
			if (static_cast<unsigned char>(c) < 0x20) {
				char buf[8];
				snprintf(buf, sizeof(buf), "\\u%04x", c);
				out += buf;
			} else {
				out += c;
			}
		}
	}
	return out;
}

} // namespace multichat
