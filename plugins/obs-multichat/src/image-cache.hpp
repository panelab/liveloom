#pragma once

#include <QImage>

#include <atomic>
#include <condition_variable>
#include <deque>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>

namespace multichat {

/** Downloads emote images on a worker thread. Poll revision() to know when new ones land. */
class ImageCache {
public:
	static ImageCache &get();

	/** True (and fills `out`) if loaded; otherwise queues a download and returns false. */
	bool lookup(const std::string &url, QImage &out);
	uint64_t revision() const { return rev_.load(); }
	void shutdown();

private:
	ImageCache() = default;
	void run();

	enum class State { Pending, Ready, Failed };
	struct Entry {
		State state = State::Pending;
		QImage image;
	};

	std::mutex mtx_;
	std::condition_variable cv_;
	std::thread thread_;
	std::atomic<bool> stop_{false};
	std::atomic<uint64_t> rev_{0};
	std::unordered_map<std::string, Entry> entries_;
	std::deque<std::string> queue_;
};

} // namespace multichat
