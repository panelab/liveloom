#pragma once

#include "chat-types.hpp"

#include <QColor>
#include <QFont>
#include <QImage>
#include <QTextDocument>

#include <vector>

namespace multichat {

struct RenderStyle {
	QFont font;
	QColor text = Qt::white;
	QColor bubble = QColor(0, 0, 0, 160);
	bool icons = true;
	bool bubbles = true;
	int lifetimeSec = 0; // 0 = messages never fade out
	int maxMessages = 20;
	bool showTwitch = true, showKick = true, showYouTube = true;
};

/** Name color: the platform's color for the user, or a stable one from the name. */
QColor nameColor(const Message &m);

/**
 * HTML for one message. Emotes that are still downloading are written as
 * text; `pending` is set so the caller re-renders later.
 */
QString messageHtml(const Message &m, const RenderStyle &style, bool &pending);

/** A text document that resolves icon and emote images from memory. */
class ChatDocument : public QTextDocument {
public:
	using QTextDocument::QTextDocument;

protected:
	QVariant loadResource(int type, const QUrl &name) override;
};

struct OverlayFrame {
	QImage image;
	/** Local ms timestamp when the frame next needs redrawing (fade), or 0. */
	int64_t nextChangeMs = 0;
	bool pendingImages = false;
};

/** Draws the newest messages bottom-up into a transparent width×height image. */
OverlayFrame renderOverlay(const std::vector<Message> &messages, const RenderStyle &style, int width, int height);

bool platformVisible(const RenderStyle &s, Platform p);

} // namespace multichat
