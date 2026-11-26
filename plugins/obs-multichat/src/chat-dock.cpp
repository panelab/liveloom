#include "chat-dock.hpp"
#include "chat-client.hpp"
#include "chat-render.hpp"
#include "image-cache.hpp"
#include "settings.hpp"
#include "sign-in.hpp"

#include <obs-frontend-api.h>
#include <obs-module.h>

#include <QDialog>
#include <QDialogButtonBox>
#include <QFormLayout>
#include <QFrame>
#include <QHBoxLayout>
#include <QLabel>
#include <QLineEdit>
#include <QMessageBox>
#include <QPushButton>
#include <QScrollBar>
#include <QToolButton>
#include <QVBoxLayout>

#include <algorithm>

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
	layout->setSpacing(6);

	// Header: connection status · platform indicators · settings
	auto *header = new QHBoxLayout();
	header->setSpacing(6);
	dot_ = new QLabel(QStringLiteral("●"), this);
	status_ = new QLabel(this);
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
	settings_->setIcon(QIcon(QStringLiteral(":/multichat/settings.png")));
	settings_->setIconSize(QSize(16, 16));
	settings_->setToolTip(tr_("Dock.Settings"));
	settings_->setAccessibleName(tr_("Dock.Settings"));
	settings_->setAutoRaise(true);
	header->addWidget(settings_);
	layout->addLayout(header);

	// Sign-in prompt (shown until the dock is connected)
	signInBox_ = new QFrame(this);
	signInBox_->setFrameShape(QFrame::StyledPanel);
	auto *signInLayout = new QVBoxLayout(signInBox_);
	auto *signInText = new QLabel(tr_("Dock.SignInPrompt"), signInBox_);
	signInText->setWordWrap(true);
	signInButton_ = new QPushButton(tr_("Dock.SignIn"), signInBox_);
	signInButton_->setDefault(true);
	signInLayout->addWidget(signInText);
	signInLayout->addWidget(signInButton_);
	layout->addWidget(signInBox_);

	// Stream health warning (shown while live and something needs fixing)
	healthBox_ = new QFrame(this);
	healthBox_->setObjectName(QStringLiteral("multichatHealth"));
	auto *healthLayout = new QHBoxLayout(healthBox_);
	healthLayout->setContentsMargins(8, 6, 8, 6);
	healthIcon_ = new QLabel(healthBox_);
	healthIcon_->setAlignment(Qt::AlignTop);
	healthText_ = new QLabel(healthBox_);
	healthText_->setWordWrap(true);
	healthText_->setTextFormat(Qt::RichText);
	healthLayout->addWidget(healthIcon_);
	healthLayout->addWidget(healthText_, 1);
	healthBox_->setVisible(false);
	layout->addWidget(healthBox_);

	view_ = new ChatBrowser(this);
	view_->setOpenLinks(false);
	view_->setFrameShape(QFrame::NoFrame);
	view_->document()->setDefaultStyleSheet(QStringLiteral("p { margin-top: 0px; margin-bottom: 6px; }"));
	layout->addWidget(view_, 1);

	connect(settings_, &QToolButton::clicked, this, &ChatDock::openSettings);
	connect(signInButton_, &QPushButton::clicked, this, [this] { signIn(loadSettings().server); });
	connect(&timer_, &QTimer::timeout, this, &ChatDock::poll);
	timer_.start(100);
	poll();
}

void ChatDock::signIn(const std::string &server)
{
	SignInDialog dlg(server.empty() ? DEFAULT_SERVER : server, this);
	if (dlg.exec() != QDialog::Accepted)
		return;
	const SignInResult &r = dlg.result();

	Settings s = loadSettings();
	s.server = r.server.empty() ? server : r.server;
	s.token = r.chatToken;
	s.account = r.account;
	saveSettings(s);
	ChatClient::get().configure(s.server, s.token);

	if (obs_frontend_streaming_active()) {
		QMessageBox::information(this, tr_("SignIn.Done"), tr_("Apply.WhileLive"));
		return;
	}
	const QString changed = applyObsStreamSettings(r);
	QMessageBox::information(this, tr_("SignIn.Done"),
				 tr_("Apply.Summary").arg(QString::fromStdString(r.account)) + QStringLiteral("\n\n") + changed);
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
	updateHealth();
	rebuild();
}

void ChatDock::updateHeader()
{
	auto &client = ChatClient::get();
	const ConnState st = client.state();
	QString text;
	QString color;
	switch (st) {
	case ConnState::Connected: {
		const std::string account = loadSettings().account;
		text = account.empty() ? tr_("Status.Connected") : QString::fromStdString(account);
		color = QStringLiteral("#22c55e");
		break;
	}
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
	signInBox_->setVisible(st == ConnState::NotConfigured || st == ConnState::BadToken);

	for (auto &l : platforms_)
		l->setVisible(false);
	for (const auto &s : client.sources()) {
		const int i = s.platform == Platform::Twitch ? 0 : s.platform == Platform::Kick ? 1 : s.platform == Platform::YouTube ? 2 : -1;
		if (i < 0 || s.target.empty())
			continue;
		platforms_[i]->setVisible(true);
		platforms_[i]->setEnabled(s.state == "connected");
		QString tip = QStringLiteral("%1: %2").arg(QString::fromStdString(s.target), QString::fromStdString(s.state));
		if (!s.message.empty())
			tip += QStringLiteral("\n") + QString::fromStdString(s.message);
		platforms_[i]->setToolTip(tip);
	}
}

void ChatDock::updateHealth()
{
	auto &client = ChatClient::get();
	const auto issues = client.healthIssues();
	if (!client.streamLive() || issues.empty()) {
		healthBox_->setVisible(false);
		return;
	}
	const bool error = std::any_of(issues.begin(), issues.end(), [](const HealthIssue &i) { return i.level == "error"; });
	const QString accent = error ? QStringLiteral("#f31260") : QStringLiteral("#f5a524");
	healthBox_->setStyleSheet(QStringLiteral("#multichatHealth { border: 1px solid %1; border-radius: 4px; background: rgba(%2, 0.08); }")
					  .arg(accent, error ? QStringLiteral("243,18,96") : QStringLiteral("245,165,36")));
	healthIcon_->setPixmap(QPixmap(error ? QStringLiteral(":/multichat/error.png") : QStringLiteral(":/multichat/warning.png"))
				       .scaled(16, 16, Qt::KeepAspectRatio, Qt::SmoothTransformation));
	QString html;
	for (size_t i = 0; i < issues.size() && i < 2; i++) {
		if (i)
			html += QStringLiteral("<br>");
		html += QStringLiteral("<b>%1</b><br><span>%2</span>")
				.arg(QString::fromStdString(issues[i].title).toHtmlEscaped(),
				     QString::fromStdString(issues[i].fix).toHtmlEscaped());
	}
	if (issues.size() > 2)
		html += QStringLiteral("<br><i>") + tr_("Health.More").arg(issues.size() - 2) + QStringLiteral("</i>");
	healthText_->setText(html);
	healthBox_->setVisible(true);
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

	auto *account = new QLabel(s.account.empty() ? tr_("Settings.NotSignedIn") : QString::fromStdString(s.account), &dlg);
	auto *signInBtn = new QPushButton(s.token.empty() ? tr_("Dock.SignIn") : tr_("Settings.SignInAgain"), &dlg);
	auto *signOutBtn = new QPushButton(tr_("Settings.SignOut"), &dlg);
	signOutBtn->setEnabled(!s.token.empty());
	auto *accountRow = new QHBoxLayout();
	accountRow->addWidget(account, 1);
	accountRow->addWidget(signInBtn);
	accountRow->addWidget(signOutBtn);
	form->addRow(tr_("Settings.Account"), accountRow);

	auto *server = new QLineEdit(QString::fromStdString(s.server), &dlg);
	auto *token = new QLineEdit(QString::fromStdString(s.token), &dlg);
	token->setEchoMode(QLineEdit::Password);
	server->setMinimumWidth(320);
	auto *advanced = new QLabel(tr_("Settings.Advanced"), &dlg);
	advanced->setWordWrap(true);
	advanced->setStyleSheet(QStringLiteral("color: palette(mid)"));
	form->addRow(advanced);
	form->addRow(tr_("Settings.Server"), server);
	form->addRow(tr_("Settings.Token"), token);
	auto *buttons = new QDialogButtonBox(QDialogButtonBox::Save | QDialogButtonBox::Cancel, &dlg);
	form->addRow(buttons);

	connect(buttons, &QDialogButtonBox::accepted, &dlg, &QDialog::accept);
	connect(buttons, &QDialogButtonBox::rejected, &dlg, &QDialog::reject);
	connect(signInBtn, &QPushButton::clicked, &dlg, [&] {
		const std::string srv = server->text().trimmed().toStdString();
		dlg.reject();
		signIn(srv.empty() ? DEFAULT_SERVER : srv);
	});
	connect(signOutBtn, &QPushButton::clicked, &dlg, [&] {
		Settings cleared = loadSettings();
		cleared.token.clear();
		cleared.account.clear();
		saveSettings(cleared);
		ChatClient::get().configure(cleared.server, cleared.token);
		dlg.reject();
	});
	if (dlg.exec() != QDialog::Accepted)
		return;

	s.server = server->text().trimmed().toStdString();
	if (s.server.empty())
		s.server = DEFAULT_SERVER;
	const std::string newToken = token->text().trimmed().toStdString();
	if (newToken != s.token)
		s.account.clear(); // a pasted token isn't tied to a known account name
	s.token = newToken;
	saveSettings(s);
	ChatClient::get().configure(s.server, s.token);
}

} // namespace multichat
