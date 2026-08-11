// =============================================================================
//  Adiel Junior — WhisperStt
//  זיהוי דיבור מקומי: whisper.cpp C API, מודל עברית (ggml-*.bin).
// =============================================================================
#pragma once

#include <atomic>
#include <mutex>
#include <string>

#include "audio/IStt.h"

// Forward declaration — סקופ גלובלי (כמו ב-whisper.h)
struct whisper_context;

namespace aj {

class WhisperStt final : public IStt {
public:
    WhisperStt();
    ~WhisperStt() override;

    bool init(const Config& cfg) override;
    bool ready() const override { return m_ready; }
    std::string transcribe(const float* samples, size_t count) override;
    std::string name() const override { return "Whisper.cpp"; }

private:
    whisper_context* m_ctx = nullptr;
    std::atomic<bool> m_ready{false};
    std::mutex m_mtx;
    int m_threads = 4;
    std::string m_lang = "he";
};

} // namespace aj
