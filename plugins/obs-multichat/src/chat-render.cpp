#include "chat-render.hpp"
#include "image-cache.hpp"

#include <QAbstractTextDocumentLayout>
#include <QPainter>
#include <QPainterPath>
#include <QUrl>

#include <algorithm>

namespace multichat {

static constexpr int FADE_MS = 800;

static const char *iconResource(Platform p)
{
	switch (p) {
	case Platform::Twitch:
		return ":/multichat/twitch.png";
	case Platform::Kick:
		return ":/multichat/kick.png";
	case Platform::YouTube:
		return ":/multichat/youtube.png";
	default:
		return nullptr;
	}
}

QColor nameColor(const Message &m)
{
	QColor c(QString::fromStdString(m.color));
	if (c.isValid()) {
		// Very dark names are unreadable on a dark bubble; lift them.
		if (c.lightness() < 90)
			c = c.lighter(180);
		return c;
	}
	static const QColor palette[] = {{255, 99, 99}, {99, 179, 255}, {120, 220, 120}, {255, 180, 80},
					 {200, 140, 255}, {255, 140, 200}, {90, 220, 220}, {240, 220, 100}};
	const size_t h = qHash(QString::fromStdString(m.author));
	return palette[h % (sizeof(palette) / sizeof(palette[0]))];
}

bool platformVisible(const RenderStyle &s, Platform p)
{
	switch (p) {
	case Platform::Twitch:
		return s.showTwitch;
	case Platform::Kick:
		return s.showKick;
	case Platform::YouTube:
		return s.showYouTube;
	default:
		return true;
	}
}

QString messageHtml(const Message &m, const RenderStyle &style, bool &pending)
{
	const int px = std::max(8, style.font.pixelSize() > 0 ? style.font.pixelSize() : QFontInfo(style.font).pixelSize());
	const int img = int(px * 1.25);
	QString html;

	if (style.icons) {
		if (const char *icon = iconResource(m.platform))
			html += QStringLiteral("<img src=\"%1\" width=\"%2\" height=\"%2\" style=\"vertical-align: middle\">&nbsp;")
					.arg(QString::fromLatin1(icon))
					.arg(img);
	}
	html += QStringLiteral("<span style=\"color:%1; font-weight:700\">%2</span>")
			.arg(nameColor(m).name(), QString::fromStdString(m.author).toHtmlEscaped());
	if (!m.amount.empty())
		html += QStringLiteral("&nbsp;<span style=\"background-color:#e6a700; color:#000\">&nbsp;%1&nbsp;</span>")
				.arg(QString::fromStdString(m.amount).toHtmlEscaped());
	html += QStringLiteral("<span style=\"color:%1\">: </span>").arg(style.text.name());

	QString body;
	for (const auto &p : m.parts) {
		if (p.emote) {
			QImage tmp;
			if (ImageCache::get().lookup(p.url, tmp)) {
				const int h = int(px * 1.6);
				const int w = std::max(1, tmp.width() * h / std::max(1, tmp.height()));
				body += QStringLiteral("<img src=\"%1\" width=\"%2\" height=\"%3\" style=\"vertical-align: middle\">")
						.arg(QString::fromStdString(p.url).toHtmlEscaped())
						.arg(w)
						.arg(h);
			} else {
				pending = true;
				body += QString::fromStdString(p.text).toHtmlEscaped();
			}
		} else {
			body += QString::fromStdString(p.text).toHtmlEscaped();
		}
	}
	html += QStringLiteral("<span style=\"color:%1\">%2</span>").arg(style.text.name(), body);
	return html;
}

QVariant ChatDocument::loadResource(int type, const QUrl &name)
{
	if (type == QTextDocument::ImageResource) {
		const QString s = name.toString();
		if (s.startsWith(QLatin1String("https://"))) {
			QImage img;
			if (ImageCache::get().lookup(s.toStdString(), img))
				return img;
			return QImage();
		}
	}
	return QTextDocument::loadResource(type, name);
}

OverlayFrame renderOverlay(const std::vector<Message> &messages, const RenderStyle &style, int width, int height)
{
	OverlayFrame frame;
	frame.image = QImage(std::max(1, width), std::max(1, height), QImage::Format_ARGB32_Premultiplied);
	frame.image.fill(Qt::transparent);

	const int pad = std::max(6, QFontInfo(style.font).pixelSize() / 3);
	const int gap = std::max(4, pad / 2);
	const int bubbleW = width - 2;
	const int64_t now = nowMs();
	const int64_t lifeMs = int64_t(style.lifetimeSec) * 1000;

	struct Laid {
		ChatDocument *doc;
		int h;
		double opacity;
	};
	std::vector<Laid> laid;
	int y = height;
	int shown = 0;

	for (auto it = messages.rbegin(); it != messages.rend() && shown < style.maxMessages; ++it) {
		const Message &m = *it;
		if (!platformVisible(style, m.platform))
			continue;

		double opacity = 1.0;
		if (lifeMs > 0) {
			if (m.receivedMs == 0)
				continue; // backlog from before the plugin connected: don't show on stream
			const int64_t age = now - m.receivedMs;
			if (age >= lifeMs)
				continue;
			const int64_t fadeStart = lifeMs - FADE_MS;
			if (age >= fadeStart) {
				opacity = 1.0 - double(age - fadeStart) / FADE_MS;
				frame.nextChangeMs = now + 33;
			} else {
				const int64_t at = m.receivedMs + fadeStart;
				if (!frame.nextChangeMs || at < frame.nextChangeMs)
					frame.nextChangeMs = at;
			}
		}

		auto *doc = new ChatDocument();
		doc->setDefaultFont(style.font);
		doc->setDocumentMargin(0);
		doc->setTextWidth(bubbleW - 2 * pad);
		doc->setHtml(messageHtml(m, style, frame.pendingImages));
		const int h = int(doc->size().height()) + 2 * pad;
		if (y - h < 0 && !laid.empty()) {
			delete doc;
			break;
		}
		y -= h + gap;
		laid.push_back({doc, h, opacity});
		shown++;
	}

	QPainter p(&frame.image);
	p.setRenderHints(QPainter::Antialiasing | QPainter::TextAntialiasing | QPainter::SmoothPixmapTransform);
	int top = height;
	for (auto &l : laid) {
		top -= l.h;
		p.setOpacity(l.opacity);
		if (style.bubbles) {
			QPainterPath path;
			path.addRoundedRect(QRectF(1, top, bubbleW, l.h), pad, pad);
			p.fillPath(path, style.bubble);
		}
		p.save();
		p.translate(1 + pad, top + pad);
		QAbstractTextDocumentLayout::PaintContext ctx;
		ctx.palette.setColor(QPalette::Text, style.text);
		l.doc->documentLayout()->draw(&p, ctx);
		p.restore();
		top -= gap;
		delete l.doc;
	}
	return frame;
}

} // namespace multichat
