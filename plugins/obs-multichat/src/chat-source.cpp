#include "chat-source.hpp"
#include "chat-client.hpp"
#include "chat-render.hpp"
#include "image-cache.hpp"

#include <plugin-support.h>

#include <QObject>
#include <QPointer>
#include <QTimer>

#include <memory>
#include <mutex>
#include <set>

namespace multichat {

/**
 * Per-source state shared between OBS threads (create/update/render) and the
 * Qt UI thread that draws the frames.
 */
struct OverlayState {
	std::mutex mtx;
	RenderStyle style;
	int width = 450;
	int height = 600;
	bool needsRender = true;

	QImage frame;      // latest finished frame (ARGB32)
	bool frameDirty = false;
	gs_texture_t *texture = nullptr; // graphics thread only
	int texW = 0, texH = 0;

	int64_t nextChangeMs = 0;
	bool pendingImages = false;
};

/** Draws all Multichat sources on the Qt thread whenever chat changes. */
class OverlayHub : public QObject {
public:
	OverlayHub()
	{
		connect(&timer_, &QTimer::timeout, this, [this] { tick(); });
		timer_.start(50);
	}

	void add(const std::shared_ptr<OverlayState> &s)
	{
		std::lock_guard lock(mtx_);
		states_.insert(s);
	}
	void remove(const std::shared_ptr<OverlayState> &s)
	{
		std::lock_guard lock(mtx_);
		states_.erase(s);
	}

private:
	void tick()
	{
		const uint64_t rev = ChatClient::get().revision();
		const uint64_t imgRev = ImageCache::get().revision();
		const bool chatChanged = rev != lastRev_;
		const bool imagesChanged = imgRev != lastImgRev_;
		lastRev_ = rev;
		lastImgRev_ = imgRev;

		std::set<std::shared_ptr<OverlayState>> states;
		{
			std::lock_guard lock(mtx_);
			states = states_;
		}
		if (states.empty())
			return;

		std::vector<Message> msgs;
		bool loaded = false;
		const int64_t now = nowMs();
		for (const auto &s : states) {
			RenderStyle style;
			int w, h;
			{
				std::lock_guard lock(s->mtx);
				const bool due = s->needsRender || chatChanged || (imagesChanged && s->pendingImages) ||
						 (s->nextChangeMs && now >= s->nextChangeMs);
				if (!due)
					continue;
				s->needsRender = false;
				style = s->style;
				w = s->width;
				h = s->height;
			}
			if (!loaded) {
				msgs = ChatClient::get().messages();
				loaded = true;
			}
			OverlayFrame f = renderOverlay(msgs, style, w, h);
			QImage img = f.image.convertToFormat(QImage::Format_ARGB32);
			std::lock_guard lock(s->mtx);
			s->frame = std::move(img);
			s->frameDirty = true;
			s->nextChangeMs = f.nextChangeMs;
			s->pendingImages = f.pendingImages;
		}
	}

	QTimer timer_;
	std::mutex mtx_;
	std::set<std::shared_ptr<OverlayState>> states_;
	uint64_t lastRev_ = ~0ull;
	uint64_t lastImgRev_ = ~0ull;
};

static QPointer<OverlayHub> hub;

struct SourceData {
	obs_source_t *source;
	std::shared_ptr<OverlayState> state;
};

static uint32_t abgrAlpha(uint32_t c)
{
	return c >> 24;
}
static QColor fromObsColor(uint32_t c, bool withAlpha)
{
	return QColor(c & 0xff, (c >> 8) & 0xff, (c >> 16) & 0xff, withAlpha ? abgrAlpha(c) : 255);
}

static const char *source_name(void *)
{
	return obs_module_text("Source.Name");
}

static void source_update(void *data, obs_data_t *settings)
{
	auto *d = static_cast<SourceData *>(data);
	RenderStyle style;

	obs_data_t *font = obs_data_get_obj(settings, "font");
	const char *face = font ? obs_data_get_string(font, "face") : "";
	const int size = font ? (int)obs_data_get_int(font, "size") : 0;
	const int flags = font ? (int)obs_data_get_int(font, "flags") : 0;
	style.font = QFont(face && *face ? QString::fromUtf8(face) : QStringLiteral("Arial"));
	style.font.setPixelSize(size > 0 ? size : 28);
	style.font.setBold(flags & OBS_FONT_BOLD);
	style.font.setItalic(flags & OBS_FONT_ITALIC);
	obs_data_release(font);

	style.text = fromObsColor((uint32_t)obs_data_get_int(settings, "text_color"), false);
	style.bubble = fromObsColor((uint32_t)obs_data_get_int(settings, "bubble_color"), true);
	style.bubbles = obs_data_get_bool(settings, "bubbles");
	style.icons = obs_data_get_bool(settings, "icons");
	style.lifetimeSec = (int)obs_data_get_int(settings, "lifetime");
	style.maxMessages = (int)obs_data_get_int(settings, "max_messages");
	style.showTwitch = obs_data_get_bool(settings, "show_twitch");
	style.showKick = obs_data_get_bool(settings, "show_kick");
	style.showYouTube = obs_data_get_bool(settings, "show_youtube");

	std::lock_guard lock(d->state->mtx);
	d->state->style = style;
	d->state->width = std::max(50, (int)obs_data_get_int(settings, "width"));
	d->state->height = std::max(50, (int)obs_data_get_int(settings, "height"));
	d->state->needsRender = true;
}

static void *source_create(obs_data_t *settings, obs_source_t *source)
{
	auto *d = new SourceData{source, std::make_shared<OverlayState>()};
	source_update(d, settings);
	if (hub)
		hub->add(d->state);
	return d;
}

static void source_destroy(void *data)
{
	auto *d = static_cast<SourceData *>(data);
	if (hub)
		hub->remove(d->state);
	if (d->state->texture) {
		obs_enter_graphics();
		gs_texture_destroy(d->state->texture);
		obs_leave_graphics();
	}
	delete d;
}

static void source_defaults(obs_data_t *settings)
{
	obs_data_t *font = obs_data_create();
	obs_data_set_default_string(font, "face", "Arial");
	obs_data_set_default_int(font, "size", 28);
	obs_data_set_default_int(font, "flags", 0);
	obs_data_set_default_obj(settings, "font", font);
	obs_data_release(font);

	obs_data_set_default_int(settings, "width", 450);
	obs_data_set_default_int(settings, "height", 600);
	obs_data_set_default_int(settings, "text_color", 0xFFFFFFFF);
	obs_data_set_default_int(settings, "bubble_color", 0xA0000000);
	obs_data_set_default_bool(settings, "bubbles", true);
	obs_data_set_default_bool(settings, "icons", true);
	obs_data_set_default_int(settings, "lifetime", 0);
	obs_data_set_default_int(settings, "max_messages", 20);
	obs_data_set_default_bool(settings, "show_twitch", true);
	obs_data_set_default_bool(settings, "show_kick", true);
	obs_data_set_default_bool(settings, "show_youtube", true);
}

static obs_properties_t *source_properties(void *)
{
	obs_properties_t *props = obs_properties_create();
	obs_properties_add_int(props, "width", obs_module_text("Prop.Width"), 50, 3840, 10);
	obs_properties_add_int(props, "height", obs_module_text("Prop.Height"), 50, 2160, 10);
	obs_properties_add_font(props, "font", obs_module_text("Prop.Font"));
	obs_properties_add_color(props, "text_color", obs_module_text("Prop.TextColor"));
	obs_properties_add_bool(props, "bubbles", obs_module_text("Prop.Bubbles"));
	obs_properties_add_color_alpha(props, "bubble_color", obs_module_text("Prop.BubbleColor"));
	obs_properties_add_bool(props, "icons", obs_module_text("Prop.Icons"));
	obs_property_t *life = obs_properties_add_int(props, "lifetime", obs_module_text("Prop.Lifetime"), 0, 3600, 5);
	obs_property_int_set_suffix(life, " s");
	obs_property_set_long_description(life, obs_module_text("Prop.Lifetime.Help"));
	obs_properties_add_int(props, "max_messages", obs_module_text("Prop.MaxMessages"), 1, 100, 1);
	obs_properties_add_bool(props, "show_twitch", obs_module_text("Prop.ShowTwitch"));
	obs_properties_add_bool(props, "show_kick", obs_module_text("Prop.ShowKick"));
	obs_properties_add_bool(props, "show_youtube", obs_module_text("Prop.ShowYouTube"));
	return props;
}

static uint32_t source_width(void *data)
{
	auto *d = static_cast<SourceData *>(data);
	std::lock_guard lock(d->state->mtx);
	return (uint32_t)d->state->width;
}

static uint32_t source_height(void *data)
{
	auto *d = static_cast<SourceData *>(data);
	std::lock_guard lock(d->state->mtx);
	return (uint32_t)d->state->height;
}

static void source_render(void *data, gs_effect_t *)
{
	auto *d = static_cast<SourceData *>(data);
	auto &s = *d->state;
	{
		std::lock_guard lock(s.mtx);
		if (s.frameDirty && !s.frame.isNull()) {
			const int w = s.frame.width(), h = s.frame.height();
			const uint8_t *bits = s.frame.constBits();
			if (!s.texture || s.texW != w || s.texH != h) {
				if (s.texture)
					gs_texture_destroy(s.texture);
				s.texture = gs_texture_create(w, h, GS_BGRA, 1, &bits, GS_DYNAMIC);
				s.texW = w;
				s.texH = h;
			} else {
				gs_texture_set_image(s.texture, bits, (uint32_t)s.frame.bytesPerLine(), false);
			}
			s.frameDirty = false;
		}
	}
	if (s.texture)
		obs_source_draw(s.texture, 0, 0, 0, 0, false);
}

void registerChatSource()
{
	hub = new OverlayHub();

	obs_source_info info = {};
	info.id = "multichat_source";
	info.type = OBS_SOURCE_TYPE_INPUT;
	info.output_flags = OBS_SOURCE_VIDEO;
	info.icon_type = OBS_ICON_TYPE_TEXT;
	info.get_name = source_name;
	info.create = source_create;
	info.destroy = source_destroy;
	info.update = source_update;
	info.get_defaults = source_defaults;
	info.get_properties = source_properties;
	info.get_width = source_width;
	info.get_height = source_height;
	info.video_render = source_render;
	obs_register_source(&info);
}

void shutdownChatSources()
{
	delete hub.data();
}

} // namespace multichat
