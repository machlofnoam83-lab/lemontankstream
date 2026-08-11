// =============================================================================
//  Adiel Junior — SherpaTts
//  דיבור מקומי בעברית: Sherpa-ONNX (VITS) C API — קישור ל-sherpa-onnx-c-api.
// =============================================================================
#pragma once

#include <atomic>
#include <string>

#include "audio/ITts.h"

namespace aj {

class SherpaTts final : public TtsBase {
public:
    SherpaTts();
    ~SherpaTts() override;

    bool init(const Config& cfg) override;
    bool ready() const override { return m_ready; }
    std::string name() const override { return "Sherpa-ONNX (VITS)"; }

protected:
    std::vector<float> synthesize(const std::string& text, int& outSampleRate) override;

private:
    const void* m_tts = nullptr; // const SherpaOnnxOfflineTts*
    std::atomic<bool> m_ready{false};
    int m_sid = 0;
    float m_speed = 1.0f;
};

} // namespace aj
