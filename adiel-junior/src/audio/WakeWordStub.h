// =============================================================================
//  Adiel Junior — WakeWordStub
//  מילת הפעלה ללא מודל: הפעלה ידנית (מקש חם) — גיבוי תמידי אם Porcupine לא זמין.
// =============================================================================
#pragma once

#include <atomic>
#include <functional>

#include "audio/IWakeWord.h"

namespace aj {

class WakeWordStub final : public IWakeWord {
public:
    bool init(const Config& cfg) override;
    void feed(const float*, size_t) override {}
    void setOnDetected(OnDetected cb) override { m_onDetected = std::move(cb); }
    void setMuted(bool muted) override { m_muted = muted; }
    std::string name() const override { return "WakeWordStub (מקש חם)"; }

    // הפעלה ידנית (מקש חם / פקודה)
    void trigger();

private:
    std::atomic<bool> m_muted{false};
    OnDetected m_onDetected;
    std::string m_keyword;
};

} // namespace aj
