// =============================================================================
//  Adiel Junior — WasapiMicCapture
//  לכידת מיקרופון ב-Windows דרך WASAPI (event-driven, צריכת CPU נמוכה).
//  ממיר כל פורמט נפוץ ל-16kHz מונו float32.
// =============================================================================
#pragma once

#ifdef _WIN32
#include <windows.h>

#include <atomic>
#include <string>
#include <thread>

#include "audio/IAudioSource.h"
#include "core/Config.h"

namespace aj {

class WasapiMicCapture final : public IAudioSource {
public:
    explicit WasapiMicCapture(const Config& cfg) : m_cfg(cfg) {}
    ~WasapiMicCapture() override;

    bool start(Callback cb) override;
    void stop() override;
    int sampleRate() const override { return 16000; }
    std::string deviceName() const override { return m_deviceName; }

private:
    void run();

    const Config& m_cfg;
    std::atomic<bool> m_running{false};
    std::thread m_thread;
    Callback m_cb;
    std::string m_deviceName;
};

} // namespace aj
#endif // _WIN32
