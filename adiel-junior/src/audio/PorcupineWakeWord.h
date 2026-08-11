// =============================================================================
//  Adiel Junior — PorcupineWakeWord
//  מילת הפעלה "אדיאל ג'וניור" דרך Porcupine (Picovoice) C API.
//  טעינה דינמית של libpv_porcupine.dll — אין צורך בקישור סטטי,
//  ה-DLL פשוט יושב לצד ה-exe (צריכת CPU < 1%).
// =============================================================================
#pragma once

#include <atomic>
#include <cstdint>
#include <string>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#endif

#include "audio/IWakeWord.h"

namespace aj {

class PorcupineWakeWord final : public IWakeWord {
public:
    PorcupineWakeWord();
    ~PorcupineWakeWord() override;

    bool init(const Config& cfg) override;
    void feed(const float* samples, size_t count) override;
    void setOnDetected(OnDetected cb) override { m_onDetected = std::move(cb); }
    void setMuted(bool muted) override { m_muted = muted; }
    std::string name() const override { return "Porcupine (Picovoice)"; }

private:
    struct FnTable; // פונקציות דינמיות

    bool loadLibrary(const std::string& dllPath);

#ifdef _WIN32
    HMODULE m_lib = nullptr;
#endif
    struct FnTable* m_fn = nullptr;
    void* m_handle = nullptr; // pv_porcupine_t*

    int32_t m_frameLength = 512;
    bool m_ready = false;
    std::atomic<bool> m_muted{false};
    std::vector<int16_t> m_pcmBuf;
    OnDetected m_onDetected;
};

} // namespace aj
