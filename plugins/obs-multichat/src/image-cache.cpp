#include "image-cache.hpp"

#include <curl/curl.h>

namespace multichat {

static constexpr size_t MAX_BYTES = 2 * 1024 * 1024;
static constexpr size_t MAX_ENTRIES = 1000;

ImageCache &ImageCache::get()
{
	static ImageCache instance;
	return instance;
}

bool ImageCache::lookup(const std::string &url, QImage &out)
{
	if (url.rfind("https://", 0) != 0)
		return false;
	std::lock_guard lock(mtx_);
	auto it = entries_.find(url);
	if (it != entries_.end()) {
		if (it->second.state == State::Ready) {
			out = it->second.image;
			return true;
		}
		return false;
	}
	if (entries_.size() >= MAX_ENTRIES)
		entries_.clear();
	entries_.emplace(url, Entry{});
	queue_.push_back(url);
	if (!thread_.joinable())
		thread_ = std::thread([this] { run(); });
	cv_.notify_one();
	return false;
}

void ImageCache::shutdown()
{
	stop_ = true;
	cv_.notify_all();
	if (thread_.joinable())
		thread_.join();
}

static size_t collect(char *ptr, size_t size, size_t nmemb, void *user)
{
	auto *buf = static_cast<std::string *>(user);
	if (buf->size() + size * nmemb > MAX_BYTES)
		return 0;
	buf->append(ptr, size * nmemb);
	return size * nmemb;
}

void ImageCache::run()
{
	CURL *curl = curl_easy_init();
	while (true) {
		std::string url;
		{
			std::unique_lock lock(mtx_);
			cv_.wait(lock, [&] { return stop_.load() || !queue_.empty(); });
			if (stop_)
				break;
			url = queue_.front();
			queue_.pop_front();
		}

		std::string body;
		curl_easy_reset(curl);
		curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
		curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
		curl_easy_setopt(curl, CURLOPT_FAILONERROR, 1L);
		curl_easy_setopt(curl, CURLOPT_TIMEOUT, 15L);
		curl_easy_setopt(curl, CURLOPT_USERAGENT, "obs-multichat");
		curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, collect);
		curl_easy_setopt(curl, CURLOPT_WRITEDATA, &body);
		const bool ok = curl_easy_perform(curl) == CURLE_OK;

		QImage img;
		if (ok)
			img.loadFromData(reinterpret_cast<const uchar *>(body.data()), static_cast<int>(body.size()));

		{
			std::lock_guard lock(mtx_);
			auto &e = entries_[url];
			if (!img.isNull()) {
				// Keep emotes small in memory; they're drawn at text height.
				if (img.height() > 112)
					img = img.scaledToHeight(112, Qt::SmoothTransformation);
				e.image = img.convertToFormat(QImage::Format_ARGB32_Premultiplied);
				e.state = State::Ready;
			} else {
				e.state = State::Failed;
			}
		}
		rev_++;
	}
	curl_easy_cleanup(curl);
}

} // namespace multichat
