#include "chat-client.hpp"

#include <obs-module.h>
#include <plugin-support.h>
#include <curl/curl.h>

#include <algorithm>
#include <chrono>

namespace multichat {

int64_t nowMs()
{
	using namespace std::chrono;
	return duration_cast<milliseconds>(steady_clock::now().time_since_epoch()).count();
}

Platform platformFromString(const std::string &s)
{
	if (s == "twitch")
		return Platform::Twitch;
	if (s == "kick")
		return Platform::Kick;
	if (s == "youtube")
		return Platform::YouTube;
	return Platform::Unknown;
}

const char *platformId(Platform p)
{
	switch (p) {
	case Platform::Twitch:
		return "twitch";
	case Platform::Kick:
		return "kick";
	case Platform::YouTube:
		return "youtube";
	default:
		return "unknown";
	}
}

ChatClient &ChatClient::get()
{
	static ChatClient instance;
	return instance;
}

void ChatClient::configure(const std::string &server, const std::string &token)
{
	{
		std::lock_guard lock(mtx_);
		server_ = server;
		while (!server_.empty() && server_.back() == '/')
			server_.pop_back();
		token_ = token;
		messages_.clear();
		sources_.clear();
		health_.clear();
		live_ = false;
	}
	gen_++;
	rev_++;
	cv_.notify_all();
	if (!thread_.joinable()) {
		stop_ = false;
		thread_ = std::thread([this] { run(); });
	}
}

void ChatClient::shutdown()
{
	stop_ = true;
	cv_.notify_all();
	if (thread_.joinable())
		thread_.join();
}

std::vector<Message> ChatClient::messages() const
{
	std::lock_guard lock(mtx_);
	return {messages_.begin(), messages_.end()};
}

std::vector<SourceStatus> ChatClient::sources() const
{
	std::lock_guard lock(mtx_);
	return sources_;
}

std::vector<HealthIssue> ChatClient::healthIssues() const
{
	std::lock_guard lock(mtx_);
	return health_;
}

bool ChatClient::streamLive() const
{
	std::lock_guard lock(mtx_);
	return live_;
}

ConnState ChatClient::state() const
{
	std::lock_guard lock(mtx_);
	return state_;
}

std::string ChatClient::stateMessage() const
{
	std::lock_guard lock(mtx_);
	return stateMsg_;
}

void ChatClient::setState(ConnState s, const std::string &msg)
{
	{
		std::lock_guard lock(mtx_);
		if (state_ == s && stateMsg_ == msg)
			return;
		state_ = s;
		stateMsg_ = msg;
	}
	rev_++;
}

void ChatClient::waitFor(int ms, uint64_t gen)
{
	std::unique_lock lock(mtx_);
	cv_.wait_for(lock, std::chrono::milliseconds(ms), [&] { return cancelled(gen); });
}

void ChatClient::run()
{
	int failures = 0;
	while (!stop_) {
		const uint64_t gen = gen_.load();
		std::string server, token;
		{
			std::lock_guard lock(mtx_);
			server = server_;
			token = token_;
		}
		if (server.empty() || token.empty()) {
			setState(ConnState::NotConfigured, "Add your server and plugin token in settings");
			std::unique_lock lock(mtx_);
			cv_.wait(lock, [&] { return cancelled(gen); });
			continue;
		}

		setState(ConnState::Connecting, failures ? "Reconnecting…" : "Connecting…");
		long code = 0;
		std::string error;
		const bool gotData = stream(server, token, gen, code, error);
		if (cancelled(gen))
			continue;

		if (code == 401) {
			setState(ConnState::BadToken, "Invalid plugin token. Copy it again from the dashboard.");
			waitFor(60'000, gen);
			continue;
		}
		failures = gotData ? 1 : failures + 1;
		const int delay = std::min(30'000, 1000 * (1 << std::min(failures, 5)));
		// Plain-language reason; technical detail goes to the OBS log.
		std::string reason;
		if (code >= 500)
			reason = "LiveLoom is temporarily unavailable";
		else if (code == 404)
			reason = "This server doesn't have LiveLoom chat";
		else if (code >= 400)
			reason = "LiveLoom refused the connection";
		else if (gotData)
			reason = "Connection lost";
		else
			reason = "Can't reach LiveLoom";
		setState(ConnState::Error, reason + " · retrying in " + std::to_string(delay / 1000) + "s");
		obs_log(LOG_WARNING, "chat stream ended (%s), retry in %d ms", error.c_str(), delay);
		waitFor(delay, gen);
	}
}

bool ChatClient::stream(const std::string &server, const std::string &token, uint64_t gen, long &httpCode,
			std::string &error)
{
	CURL *curl = curl_easy_init();
	if (!curl) {
		error = "curl init failed";
		return false;
	}
	buf_.clear();
	event_.clear();
	data_.clear();
	streamGen_ = gen;

	const std::string url = server + "/chat/events";
	const std::string auth = "Authorization: Bearer " + token;
	curl_slist *headers = nullptr;
	headers = curl_slist_append(headers, auth.c_str());
	headers = curl_slist_append(headers, "Accept: text/event-stream");
	headers = curl_slist_append(headers, "Cache-Control: no-cache");

	char errbuf[CURL_ERROR_SIZE] = {0};
	curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
	curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
	const std::string ua = std::string("obs-multichat/") + PLUGIN_VERSION;
	curl_easy_setopt(curl, CURLOPT_USERAGENT, ua.c_str());
	curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
	curl_easy_setopt(curl, CURLOPT_FAILONERROR, 1L);
	curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 15L);
	// The server pings every 15s; treat 45s of silence as a dead connection.
	curl_easy_setopt(curl, CURLOPT_LOW_SPEED_LIMIT, 1L);
	curl_easy_setopt(curl, CURLOPT_LOW_SPEED_TIME, 45L);
	curl_easy_setopt(curl, CURLOPT_TCP_KEEPALIVE, 1L);
	curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, &ChatClient::writeCb);
	curl_easy_setopt(curl, CURLOPT_WRITEDATA, this);
	curl_easy_setopt(curl, CURLOPT_NOPROGRESS, 0L);
	curl_easy_setopt(curl, CURLOPT_XFERINFOFUNCTION, &ChatClient::progressCb);
	curl_easy_setopt(curl, CURLOPT_XFERINFODATA, this);
	curl_easy_setopt(curl, CURLOPT_ERRORBUFFER, errbuf);

	const CURLcode res = curl_easy_perform(curl);
	curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &httpCode);
	const bool connected = state() == ConnState::Connected;
	if (res != CURLE_OK)
		error = errbuf[0] ? errbuf : curl_easy_strerror(res);

	curl_slist_free_all(headers);
	curl_easy_cleanup(curl);
	return connected;
}

size_t ChatClient::writeCb(char *ptr, size_t size, size_t nmemb, void *user)
{
	auto *self = static_cast<ChatClient *>(user);
	if (self->cancelled(self->streamGen_))
		return 0; // aborts the transfer
	self->onBytes(ptr, size * nmemb);
	return size * nmemb;
}

int ChatClient::progressCb(void *user, long long, long long, long long, long long)
{
	auto *self = static_cast<ChatClient *>(user);
	return self->cancelled(self->streamGen_) ? 1 : 0;
}

void ChatClient::onBytes(const char *data, size_t len)
{
	if (state() != ConnState::Connected)
		setState(ConnState::Connected);
	buf_.append(data, len);
	size_t pos;
	while ((pos = buf_.find('\n')) != std::string::npos) {
		std::string line = buf_.substr(0, pos);
		buf_.erase(0, pos + 1);
		if (!line.empty() && line.back() == '\r')
			line.pop_back();

		if (line.empty()) { // end of event
			if (!data_.empty())
				dispatch(event_, data_);
			event_.clear();
			data_.clear();
		} else if (line[0] == ':') {
			// comment / ping
		} else if (line.rfind("event:", 0) == 0) {
			event_ = line.substr(line.size() > 6 && line[6] == ' ' ? 7 : 6);
		} else if (line.rfind("data:", 0) == 0) {
			if (!data_.empty())
				data_ += '\n';
			data_ += line.substr(line.size() > 5 && line[5] == ' ' ? 6 : 5);
		}
	}
	if (buf_.size() > 1 << 20)
		buf_.clear(); // malformed stream guard
}

static std::string str(obs_data_t *d, const char *key)
{
	const char *v = obs_data_get_string(d, key);
	return v ? v : "";
}

static Message parseMessage(obs_data_t *m, int64_t receivedMs)
{
	Message msg;
	msg.id = str(m, "id");
	msg.platform = platformFromString(str(m, "platform"));
	msg.amount = str(m, "amount");
	msg.receivedMs = receivedMs;

	obs_data_t *author = obs_data_get_obj(m, "author");
	if (author) {
		msg.author = str(author, "name");
		msg.color = str(author, "color");
		// (badges are a JSON array of strings, which obs_data can't represent; unused for now)
		obs_data_release(author);
	}

	obs_data_array_t *parts = obs_data_get_array(m, "parts");
	for (size_t i = 0, n = parts ? obs_data_array_count(parts) : 0; i < n; i++) {
		obs_data_t *p = obs_data_array_item(parts, i);
		Part part;
		if (str(p, "t") == "emote") {
			part.emote = true;
			part.text = str(p, "name");
			part.url = str(p, "url");
		} else {
			part.text = str(p, "v");
		}
		msg.parts.push_back(std::move(part));
		obs_data_release(p);
	}
	obs_data_array_release(parts);
	if (msg.parts.empty())
		msg.parts.push_back(Part{false, str(m, "text"), {}});
	return msg;
}

static std::vector<SourceStatus> parseSources(obs_data_t *root)
{
	std::vector<SourceStatus> out;
	obs_data_array_t *arr = obs_data_get_array(root, "sources");
	for (size_t i = 0, n = arr ? obs_data_array_count(arr) : 0; i < n; i++) {
		obs_data_t *s = obs_data_array_item(arr, i);
		SourceStatus st;
		st.platform = platformFromString(str(s, "platform"));
		st.target = str(s, "target");
		st.state = str(s, "state");
		st.message = str(s, "message");
		out.push_back(std::move(st));
		obs_data_release(s);
	}
	obs_data_array_release(arr);
	return out;
}

void ChatClient::dispatch(const std::string &event, const std::string &data)
{
	obs_data_t *root = obs_data_create_from_json(data.c_str());
	if (!root)
		return;
	const std::string type = str(root, "type");
	const int64_t now = nowMs();

	std::lock_guard lock(mtx_);
	if (type == "hello") {
		messages_.clear();
		obs_data_array_t *hist = obs_data_get_array(root, "history");
		for (size_t i = 0, n = hist ? obs_data_array_count(hist) : 0; i < n; i++) {
			obs_data_t *m = obs_data_array_item(hist, i);
			// History is shown in the dock but already "old" for on-stream fading.
			messages_.push_back(parseMessage(m, 0));
			obs_data_release(m);
		}
		obs_data_array_release(hist);
		sources_ = parseSources(root);
	} else if (type == "message") {
		obs_data_t *m = obs_data_get_obj(root, "message");
		if (m) {
			messages_.push_back(parseMessage(m, now));
			obs_data_release(m);
		}
	} else if (type == "status") {
		sources_ = parseSources(root);
	} else if (type == "health") {
		live_ = obs_data_get_bool(root, "live");
		health_.clear();
		obs_data_array_t *arr = obs_data_get_array(root, "issues");
		for (size_t i = 0, n = arr ? obs_data_array_count(arr) : 0; i < n; i++) {
			obs_data_t *it = obs_data_array_item(arr, i);
			health_.push_back({str(it, "level"), str(it, "title"), str(it, "fix")});
			obs_data_release(it);
		}
		obs_data_array_release(arr);
	}
	while (messages_.size() > MAX_MESSAGES)
		messages_.pop_front();
	obs_data_release(root);
	(void)event;
	rev_++;
}

} // namespace multichat
