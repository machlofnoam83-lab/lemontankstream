// =============================================================================
//  Adiel Junior — PiperTts
//  דיבור מקומי: Piper TTS C++ SDK (rhasspy/piper) — דורש onnxruntime + espeak-ng.
// =============================================================================
#pragma once

#include <atomic>
#include <string>

#include "audio/ITts.h"

namespace aj {

class PiperTts final : public TtsBase {
public:
    PiperTts();
    ~PiperTts() override;

    bool init(const Config& cfg) override;
    bool ready() const override { return m_ready; }
    std::string name() const override { return "Piper (VITS)"; }

protected:
    std::vector<float> synthesize(const std::string& text, int& outSampleRate) override;

private:
    void* m_voice = nullptr;          // piper::Voice*
    void* m_piperConfig = nullptr;    // piper::PiperConfig*
    void* m_speakerId = nullptr;      // std::optional<piper::SpeakerId>*
    std::atomic<bool> m_ready{false};
};

} // namespace aj
