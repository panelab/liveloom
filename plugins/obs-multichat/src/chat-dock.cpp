#include "chat-dock.hpp"
#include "chat-client.hpp"
#include "chat-render.hpp"
#include "image-cache.hpp"
#include "settings.hpp"

#include <obs-module.h>

#include <QDialog>
#include <QDialogButtonBox>
#include <QFormLayout>
#include <QHBoxLayout>
#include <QLabel>
#include <QLineEdit>
#include <QScrollBar>
#include <QToolButton>
#include <QVBoxLayout>

namespace multichat {

static QString tr_(const char *key)
{
	return QString::fromUtf8(obs_module_text(key));
}

QVariant ChatBrowser::loadResource(int type, const QUrl &name)
{
	if (type == QTextDocument::ImageResource && name.scheme() == QLatin1String("https")) {
		QImage img;
		if (ImageCache::get().lookup(name.toString().toStdString(), img))
			return img;
		return QImage();
	}
	return QTextBrowser::loadResource(type, name);
}

ChatDock::ChatDock(QWidget *parent) : QWidget(parent)
{
	auto *layout = new QVBoxLayout(this);
	layout->setContentsMargins(4, 4, 4, 4);
	layout->setSpacing(4);

	auto *header = new QHBoxLayout();
	header->setSpacing(6);
	dot_ = new QLabel(QStringLiteral("●"), this);
	status_ = new QLabel(this);
	status_->setTextInteractionFlags(Qt::TextSelectableByMouse);
	header->addWidget(dot_);
	header->addWidget(status_, 1);
	const char *icons[3] = {":/multichat/twitch.png", ":/multichat/kick.png", ":/multichat/youtube.png"};
	for (int i = 0; i < 3; i++) {
		platforms_[i] = new QLabel(this);
		platforms_[i]->setPixmap(QPixmap(QString::fromLatin1(icons[i])).scaled(16, 16, Qt::KeepAspectRatio, Qt::SmoothTransformation));
		platforms_[i]->setVisible(false);
		header->addWidget(platforms_[i]);
	}
	settings_ = new QToolButton(this);
	settings_->setText(QStringLiteral("⚙"));
	settings_->setToolTip(tr_("Dock.Settings"));
	settings_->setAutoRaise(true);
	header->addWidget(settings_);
	layout->addLayout(header);

	view_ = new ChatBrowser(this);
	view_->setOpenLinks(false);
	view_->setFrameShape(QFrame::NoFrame);
	view_->document()->setDefaultStyleSheet(QStringLiteral("p { margin-top: 0px; margin-bottom: 6px; }"));
	layout->addWidget(view_, 1);

	connect(settings_, &QToolButton::clicked, this, &ChatDock::openSettings);
	connect(&timer_, &QTimer::timeout, this, &ChatDock::poll);
	timer_.start(100);
	poll();
}

void ChatDock::poll()
{
	const uint64_t rev = ChatClient::get().revision();
	const uint64_t imgRev = ImageCache::get().revision();
	if (rev == lastRev_ && !(pendingImages_ && imgRev != lastImgRev_))
		return;
	lastRev_ = rev;
	lastImgRev_ = imgRev;
	updateHeader();
	rebuild();
}

void ChatDock::updateHeader()
{
	auto &client = ChatClient::get();
	const ConnState st = client.state();
	QString text;
	QString color;
	switch (st) {
	case ConnState::Connected:
		text = tr_("Status.Connected");
		color = QStringLiteral("#22c55e");
		break;
	case ConnState::Connecting:
		text = tr_("Status.Connecting");
		color = QStringLiteral("#3b82f6");
		break;
	case ConnState::NotConfigured:
		text = tr_("Status.NotConfigured");
		color = QStringLiteral("#a1a1aa");
		break;
	case ConnState::BadToken:
	case ConnState::Error:
		text = QString::fromStdString(client.stateMessage());
		color = QStringLiteral("#ef4444");
		break;
	}
	dot_->setStyleSheet(QStringLiteral("color: %1").arg(color));
	status_->setText(text);
	status_->setToolTip(QString::fromStdString(client.stateMessage()));

	for (auto &l : platforms_)
		l->setVisible(false);
	for (const auto &s : client.sources()) {
		const int i = s.platform == Platform::Twitch ? 0 : s.platform == Platform::Kick ? 1 : s.platform == Platform::YouTube ? 2 : -1;
		if (i < 0 || s.target.empty())
			continue;
		platforms_[i]->setVisible(true);
		const bool ok = s.state == "connected";
		platforms_[i]->setStyleSheet(ok ? QString() : QStringLiteral("opacity: 0.4"));
		platforms_[i]->setEnabled(ok);
		QString tip = QStringLiteral("%1: %2").arg(QString::fromStdString(s.target), QString::fromStdString(s.state));
		if (!s.message.empty())
			tip += QStringLiteral("\n") + QString::fromStdString(s.message);
		platforms_[i]->setToolTip(tip);
	}
}

void ChatDock::rebuild()
{
	auto *bar = view_->verticalScrollBar();
	const bool atBottom = bar->value() >= bar->maximum() - 4;
	const int oldValue = bar->value();

	RenderStyle style;
	style.font = view_->font();
	style.text = view_->palette().color(QPalette::Text);

	QString html;
	bool pending = false;
	const auto msgs = ChatClient::get().messages();
	if (msgs.empty()) {
		html = QStringLiteral("<p style=\"color:%1\">%2</p>")
			       .arg(view_->palette().color(QPalette::PlaceholderText).name(), tr_("Dock.Empty").toHtmlEscaped());
	}
	for (const auto &m : msgs)
		html += QStringLiteral("<p>") + messageHtml(m, style, pending) + QStringLiteral("</p>");
	pendingImages_ = pending;

	view_->setHtml(html);
	if (atBottom)
		bar->setValue(bar->maximum());
	else
		bar->setValue(oldValue);
}

void ChatDock::openSettings()
{
	Settings s = loadSettings();
	QDialog dlg(this);
	dlg.setWindowTitle(tr_("Settings.Title"));
	auto *form = new QFormLayout(&dlg);
	auto *server = new QLineEdit(QString::fromStdString(s.server), &dlg);
	auto *token = new QLineEdit(QString::fromStdString(s.token), &dlg);
	token->setEchoMode(QLineEdit::Password);
	server->setMinimumWidth(320);
	auto *help = new QLabel(tr_("Settings.Help"), &dlg);
	help->setWordWrap(true);
	auto *buttons = new QDialogButtonBox(QDialogButtonBox::Save | QDialogButtonBox::Cancel, &dlg);
	form->addRow(tr_("Settings.Server"), server);
	form->addRow(tr_("Settings.Token"), token);
	form->addRow(help);
	form->addRow(buttons);
	connect(buttons, &QDialogButtonBox::accepted, &dlg, &QDialog::accept);
	connect(buttons, &QDialogButtonBox::rejected, &dlg, &QDialog::reject);
	if (dlg.exec() != QDialog::Accepted)
		return;

	s.server = server->text().trimmed().toStdString();
	if (s.server.empty())
		s.server = DEFAULT_SERVER;
	s.token = token->text().trimmed().toStdString();
	saveSettings(s);
	ChatClient::get().configure(s.server, s.token);
}

} // namespace multichat
