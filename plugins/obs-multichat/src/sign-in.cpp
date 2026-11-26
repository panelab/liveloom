#include "sign-in.hpp"
#include "http.hpp"

#include <obs-frontend-api.h>
#include <obs-module.h>
#include <plugin-support.h>
#include <util/config-file.h>
#include <util/platform.h>

#include <QCoreApplication>
#include <QDesktopServices>
#include <QStringList>
#include <QFont>
#include <QHBoxLayout>
#include <QLabel>
#include <QMetaObject>
#include <QPushButton>
#include <QSysInfo>
#include <QUrl>
#include <QVBoxLayout>

#include <algorithm>
#include <chrono>
#include <cstring>
#include <thread>

namespace multichat {

static QString tr_(const char *key)
{
	return QString::fromUtf8(obs_module_text(key));
}

static std::string str(obs_data_t *d, const char *key)
{
	const char *v = obs_data_get_string(d, key);
	return v ? v : "";
}

SignInDialog::SignInDialog(const std::string &server, QWidget *parent)
	: QDialog(parent),
	  server_(server),
	  cancelled_(std::make_shared<std::atomic<bool>>(false))
{
	setWindowTitle(tr_("SignIn.Title"));
	setMinimumWidth(380);
	auto *layout = new QVBoxLayout(this);
	layout->setSpacing(10);
	layout->setSizeConstraint(QLayout::SetMinimumSize);

	title_ = new QLabel(tr_("SignIn.Requesting"), this);
	title_->setWordWrap(true);
	code_ = new QLabel(this);
	QFont f = code_->font();
	f.setPointSizeF(f.pointSizeF() * 2.2);
	f.setBold(true);
	f.setLetterSpacing(QFont::AbsoluteSpacing, 4);
	f.setStyleHint(QFont::Monospace);
	f.setFamily(QStringLiteral("monospace"));
	code_->setFont(f);
	code_->setAlignment(Qt::AlignCenter);
	code_->setTextInteractionFlags(Qt::TextSelectableByMouse);
	code_->setVisible(false);
	status_ = new QLabel(this);
	status_->setWordWrap(true);
	status_->setStyleSheet(QStringLiteral("color: palette(mid)"));

	auto *buttons = new QHBoxLayout();
	open_ = new QPushButton(tr_("SignIn.OpenBrowser"), this);
	open_->setVisible(false);
	retry_ = new QPushButton(tr_("SignIn.Retry"), this);
	retry_->setVisible(false);
	auto *cancel = new QPushButton(tr_("SignIn.Cancel"), this);
	buttons->addWidget(open_);
	buttons->addWidget(retry_);
	buttons->addStretch(1);
	buttons->addWidget(cancel);

	layout->addWidget(title_);
	layout->addWidget(code_);
	layout->addWidget(status_);
	layout->addLayout(buttons);

	connect(open_, &QPushButton::clicked, this, [this] { QDesktopServices::openUrl(QUrl(url_)); });
	connect(retry_, &QPushButton::clicked, this, [this] { start(); });
	connect(cancel, &QPushButton::clicked, this, &QDialog::reject);
	QMetaObject::invokeMethod(this, [this] { start(); }, Qt::QueuedConnection);
}

SignInDialog::~SignInDialog()
{
	*cancelled_ = true;
}

void SignInDialog::showCode(const QString &code, const QString &url)
{
	url_ = url;
	title_->setText(tr_("SignIn.Instructions"));
	code_->setText(code);
	code_->setVisible(true);
	open_->setVisible(true);
	status_->setText(tr_("SignIn.Waiting"));
	adjustSize();
	QDesktopServices::openUrl(QUrl(url));
}

void SignInDialog::fail(const QString &message)
{
	title_->setText(message);
	code_->setVisible(false);
	open_->setVisible(false);
	retry_->setVisible(true);
	status_->clear();
}

void SignInDialog::start()
{
	retry_->setVisible(false);
	code_->setVisible(false);
	title_->setText(tr_("SignIn.Requesting"));
	*cancelled_ = true; // stop any previous poll
	cancelled_ = std::make_shared<std::atomic<bool>>(false);
	auto cancelled = cancelled_;
	QPointer<SignInDialog> self(this);
	const std::string server = server_;
	const std::string client = "OBS on " + QSysInfo::machineHostName().toStdString();

	std::thread([self, cancelled, server, client] {
		auto onUi = [self, cancelled](auto fn) {
			QMetaObject::invokeMethod(
				qApp,
				[self, cancelled, fn] {
					if (self && !*cancelled)
						fn(self.data());
				},
				Qt::QueuedConnection);
		};

		HttpResponse r = httpPostJson(server + "/api/device/code",
					      "{\"client_name\":\"" + jsonEscape(client.substr(0, 60)) + "\"}");
		obs_data_t *d = r.status == 200 ? obs_data_create_from_json(r.body.c_str()) : nullptr;
		if (!d) {
			const QString why = r.error.empty() ? QStringLiteral("HTTP %1").arg(r.status)
							    : QString::fromStdString(r.error);
			onUi([why](SignInDialog *s) { s->fail(tr_("SignIn.Unreachable") + QStringLiteral("\n") + why); });
			return;
		}
		const std::string deviceCode = str(d, "device_code");
		const QString userCode = QString::fromStdString(str(d, "user_code"));
		const QString url = QString::fromStdString(str(d, "verification_uri_complete"));
		const int interval = std::max(2, (int)obs_data_get_int(d, "interval"));
		const int64_t expiresIn = obs_data_get_int(d, "expires_in");
		obs_data_release(d);
		onUi([userCode, url](SignInDialog *s) { s->showCode(userCode, url); });

		const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(expiresIn > 0 ? expiresIn : 600);
		const std::string body = "{\"device_code\":\"" + jsonEscape(deviceCode) + "\"}";
		while (!*cancelled && std::chrono::steady_clock::now() < deadline) {
			for (int i = 0; i < interval * 10 && !*cancelled; i++)
				std::this_thread::sleep_for(std::chrono::milliseconds(100));
			if (*cancelled)
				return;
			HttpResponse t = httpPostJson(server + "/api/device/token", body);
			obs_data_t *td = obs_data_create_from_json(t.body.c_str());
			if (!td)
				continue; // network hiccup: keep polling
			const std::string error = str(td, "error");
			if (t.status == 200 && error.empty()) {
				SignInResult res{str(td, "account"), str(td, "server"), str(td, "chat_token"),
						 str(td, "ingest_url"), str(td, "ingest_key")};
				obs_data_release(td);
				onUi([res](SignInDialog *s) {
					s->result_ = res;
					s->accept();
				});
				return;
			}
			const QString msg = QString::fromStdString(str(td, "message"));
			obs_data_release(td);
			if (error == "authorization_pending")
				continue;
			onUi([msg](SignInDialog *s) { s->fail(msg.isEmpty() ? tr_("SignIn.Failed") : msg); });
			return;
		}
		onUi([](SignInDialog *s) { s->fail(tr_("SignIn.Expired")); });
	}).detach();
}

/** Lowers bitrate to 6000 and sets 2 s keyframes in an encoder settings object. */
static bool tuneEncoderSettings(obs_data_t *s)
{
	bool changed = false;
	if (obs_data_get_int(s, "keyint_sec") != 2) {
		obs_data_set_int(s, "keyint_sec", 2);
		changed = true;
	}
	if (obs_data_get_int(s, "bitrate") > 6000) {
		obs_data_set_int(s, "bitrate", 6000);
		changed = true;
	}
	return changed;
}

QString applyObsStreamSettings(const SignInResult &r)
{
	QStringList done;

	// 1. Stream service: Custom RTMP pointing at LiveLoom.
	obs_data_t *svcSettings = obs_data_create();
	obs_data_set_string(svcSettings, "server", r.ingestUrl.c_str());
	obs_data_set_string(svcSettings, "key", r.ingestKey.c_str());
	obs_data_set_bool(svcSettings, "use_auth", false);
	obs_service_t *svc = obs_service_create("rtmp_custom", "default_service", svcSettings, nullptr);
	obs_data_release(svcSettings);
	if (svc) {
		obs_frontend_set_streaming_service(svc);
		obs_frontend_save_streaming_service();
		obs_service_release(svc);
		done << tr_("Apply.Service");
	}

	// 2. Encoder: 2 s keyframes, ≤ 6000 Kbps (only ever lowers bitrate).
	config_t *profile = obs_frontend_get_profile_config();
	const char *mode = profile ? config_get_string(profile, "Output", "Mode") : nullptr;
	if (mode && strcmp(mode, "Advanced") == 0) {
		char *dir = obs_frontend_get_current_profile_path();
		if (dir) {
			const std::string path = std::string(dir) + "/streamEncoder.json";
			bfree(dir);
			obs_data_t *enc = obs_data_create_from_json_file_safe(path.c_str(), "bak");
			if (!enc)
				enc = obs_data_create();
			if (tuneEncoderSettings(enc)) {
				obs_data_save_json_safe(enc, path.c_str(), "tmp", "bak");
				done << tr_("Apply.Encoder");
			}
			// Also update the live encoder object so it applies without restarting OBS.
			if (obs_output_t *out = obs_frontend_get_streaming_output()) {
				if (obs_encoder_t *venc = obs_output_get_video_encoder(out)) {
					obs_data_t *cur = obs_encoder_get_settings(venc);
					if (tuneEncoderSettings(cur))
						obs_encoder_update(venc, cur);
					obs_data_release(cur);
				}
				obs_output_release(out);
			}
			obs_data_release(enc);
		}
	} else if (profile) {
		// Simple mode always uses 2 s keyframes; just cap the bitrate.
		if (config_get_int(profile, "SimpleOutput", "VBitrate") > 6000) {
			config_set_int(profile, "SimpleOutput", "VBitrate", 6000);
			config_save_safe(profile, "tmp", nullptr);
			done << tr_("Apply.Bitrate");
		}
	}
	return done.join(QStringLiteral("\n"));
}

} // namespace multichat
