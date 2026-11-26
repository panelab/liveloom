#pragma once

#include "chat-types.hpp"

#include <atomic>
#include <condition_variable>
#include <deque>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace multichat {

/**
 * Connects to <server>/chat/events (Server-Sent Events) on a background
 * thread and keeps the merged chat in memory. UI code polls revision() and
 * copies what it needs, so no callbacks cross threads.
 */
class ChatClient {
public:
	static ChatClient &get();

	void configure(const std::string &server, const std::string &token);
	void shutdown();

	std::vector<Message> messages() const;
	std::vector<SourceStatus> sources() const;
	ConnState state() const;
	std::string stateMessage() const;
	/** Changes whenever anything above changes. */
	uint64_t revision() const { return rev_.load(); }

	static constexpr size_t MAX_MESSAGES = 200;

private:
	ChatClient() = default;
	void run();
	bool stream(const std::string &server, const std::string &token, uint64_t gen, long &httpCode,
		    std::string &error);
	void onBytes(const char *data, size_t len);
	void dispatch(const std::string &event, const std::string &data);
	void setState(ConnState s, const std::string &msg = {});
	void waitFor(int ms, uint64_t gen);
	bool cancelled(uint64_t gen) const { return stop_.load() || gen_.load() != gen; }

	static size_t writeCb(char *ptr, size_t size, size_t nmemb, void *user);
	static int progressCb(void *user, long long, long long, long long, long long);

	mutable std::mutex mtx_;
	std::condition_variable cv_;
	std::thread thread_;
	std::atomic<bool> stop_{false};
	std::atomic<uint64_t> gen_{0};
	std::atomic<uint64_t> rev_{0};
	uint64_t streamGen_ = 0;

	std::string server_, token_;
	std::deque<Message> messages_;
	std::vector<SourceStatus> sources_;
	ConnState state_ = ConnState::NotConfigured;
	std::string stateMsg_;

	// SSE parser (worker thread only)
	std::string buf_, event_, data_;
};

} // namespace multichat
