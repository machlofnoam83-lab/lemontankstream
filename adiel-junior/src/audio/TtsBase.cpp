// =============================================================================
//  Adiel Junior — TtsBase: חוט דיבור + תור
// =============================================================================
#include "audio/ITts.h"

#include "core/Logger.h"

#ifdef _WIN32
#include "audio/WasapiAudioOut.h"
#endif

namespace aj {

TtsBase::TtsBase() {
    m_thread = std::thread([this] { worker(); });
}

TtsBase::~TtsBase() {
    m_running = false;
    m_queue.close();
    if (m_thread.joinable()) m_thread.join();
}

void TtsBase::speak(const std::string& text, std::function<void()> onDone) {
    if (!m_running.load() || text.empty()) {
        if (onDone) onDone();
        return;
    }
    m_queue.push({text, std::move(onDone)});
}

void TtsBase::stop() {
    // מפסיק את הדיבור הנוכחי ומרוקן את התור
    m_interrupt = true;
    m_queue.clear();
}

void TtsBase::worker() {
    while (m_running.load()) {
        auto job = m_queue.pop();
        if (!job) break;

        m_interrupt = false;
        m_playing = true;
        int rate = 22050;
        std::vector<float> samples = synthesize(job->text, rate);
        if (samples.empty()) {
            logWarn("TTS: סינתוז ריק עבור \"%s\"", job->text.c_str());
            m_playing = false;
            if (job->onDone) job->onDone();
            continue;
        }
        if (!m_interrupt.load()) {
            playSamples(samples, rate);
        }
        m_playing = false;
        if (job->onDone) job->onDone();
    }
}

void TtsBase::playSamples(const std::vector<float>& samples, int sampleRate) {
#ifdef _WIN32
    WasapiAudioOut out;
    if (out.open(sampleRate)) {
        out.play(samples, m_interrupt);
    }
#else
    (void)samples;
    (void)sampleRate;
    logInfo("TTS: השמעה לא זמינה בפלטפורמה זו (עברו על %zu דגימות)", samples.size());
#endif
}

} // namespace aj
