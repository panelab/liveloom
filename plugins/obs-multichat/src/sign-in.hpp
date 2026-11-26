#pragma once

#include <QDialog>
#include <QPointer>

#include <atomic>
#include <memory>
#include <string>

class QLabel;
class QPushButton;

namespace multichat {

/** What the server hands the plugin after the user approves. */
struct SignInResult {
	std::string account;
	std::string server;
	std::string chatToken;
	std::string ingestUrl;
	std::string ingestKey;
};

/**
 * "Sign in to LiveLoom": requests a code, opens the browser on the approval
 * page, and polls until the user approves (device authorization flow).
 */
class SignInDialog : public QDialog {
	Q_OBJECT
public:
	SignInDialog(const std::string &server, QWidget *parent = nullptr);
	~SignInDialog() override;

	const SignInResult &result() const { return result_; }

private:
	void start();
	void showCode(const QString &code, const QString &url);
	void fail(const QString &message);

	std::string server_;
	SignInResult result_;
	QString url_;
	QLabel *title_;
	QLabel *code_;
	QLabel *status_;
	QPushButton *open_;
	QPushButton *retry_;
	std::shared_ptr<std::atomic<bool>> cancelled_;
};

/**
 * Writes LiveLoom's server and key into OBS's stream settings, and nudges the
 * stream encoder toward settings every platform accepts (2 s keyframes,
 * ≤ 6000 Kbps). Returns a human-readable summary of what changed.
 */
QString applyObsStreamSettings(const SignInResult &r);

} // namespace multichat
