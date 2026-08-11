// =============================================================================
//  Adiel Junior — WhisperStt (Windows, קישור סטטי ל-whisper.cpp)
// =============================================================================
#include "audio/WhisperStt.h"

#include "core/Logger.h"

#ifdef ADIEL_HAVE_WHISPER
#include <whisper.h>

namespace aj {

WhisperStt::WhisperStt() = default;

WhisperStt::~WhisperStt() {
    if (m_ctx) whisper_free(m_ctx);
}

bool WhisperStt::init(const Config& cfg) {
    std::lock_guard<std::mutex> lock(m_mtx);
    if (m_ready) return true;

    logInfo("Whisper: טוען מודל %s ...", cfg.whisperModel.c_str());
    whisper_context_params cparams = whisper_context_default_params();
    cparams.use_gpu = cfg.whisperUseGpu;
    m_ctx = whisper_init_from_file_with_params(cfg.whisperModel.c_str(), cparams);
    if (!m_ctx) {
        logError("Whisper: כשל בטעינת המודל");
        return false;
    }
    m_threads = cfg.whisperThreads > 0 ? cfg.whisperThreads : 4;
    m_lang = "he"; // מודל עברית (או auto-detect אם ריק)
    m_ready = true;
    logInfo("Whisper: מודל טעון, %d חוטים, GPU=%s", m_threads,
            cfg.whisperUseGpu ? "כן" : "לא");
    return true;
}

std::string WhisperStt::transcribe(const float* samples, size_t count) {
    std::lock_guard<std::mutex> lock(m_mtx);
    if (!m_ready || !m_ctx || !samples || count == 0) return {};

    whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.print_special  = false;
    params.print_progress = false;
    params.print_realtime = false;
    params.n_threads      = m_threads;
    params.language       = m_lang.c_str();
    params.translate      = false;
    params.no_context     = true;
    params.no_timestamps  = true;
    params.single_segment = false;

    logDebug("Whisper: מתמלל %zu דגימות (%.1f שניות)", count, count / 16000.0);
    if (whisper_full(m_ctx, params, samples, static_cast<int>(count)) != 0) {
        logWarn("Whisper: כשל בתמלול");
        return {};
    }

    std::string text;
    const int n = whisper_full_n_segments(m_ctx);
    for (int i = 0; i < n; ++i) {
        const char* seg = whisper_full_get_segment_text(m_ctx, i);
        if (seg) text += seg;
    }
    // ניקוי רווחים
    while (!text.empty() && (text.back() == ' ' || text.back() == '\n')) text.pop_back();
    logInfo("Whisper: \"%s\"", text.c_str());
    return text;
}

} // namespace aj

#else // !ADIEL_HAVE_WHISPER

namespace aj {
WhisperStt::WhisperStt() = default;
WhisperStt::~WhisperStt() = default;
bool WhisperStt::init(const Config&) { return false; }
std::string WhisperStt::transcribe(const float*, size_t) { return {}; }
} // namespace aj

#endif // ADIEL_HAVE_WHISPER
