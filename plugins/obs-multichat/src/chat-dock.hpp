#pragma once

#include <QTextBrowser>
#include <QTimer>
#include <QWidget>

class QLabel;
class QToolButton;

namespace multichat {

/** Text browser that resolves emote images from the shared cache. */
class ChatBrowser : public QTextBrowser {
	Q_OBJECT
public:
	using QTextBrowser::QTextBrowser;

protected:
	QVariant loadResource(int type, const QUrl &name) override;
};

/** "Multichat" dock: merged chat for the streamer, inside OBS. */
class ChatDock : public QWidget {
	Q_OBJECT
public:
	explicit ChatDock(QWidget *parent = nullptr);

private:
	void poll();
	void rebuild();
	void updateHeader();
	void openSettings();

	QLabel *dot_;
	QLabel *status_;
	QLabel *platforms_[3];
	QToolButton *settings_;
	ChatBrowser *view_;
	QTimer timer_;
	uint64_t lastRev_ = ~0ull;
	uint64_t lastImgRev_ = ~0ull;
	bool pendingImages_ = false;
};

} // namespace multichat
