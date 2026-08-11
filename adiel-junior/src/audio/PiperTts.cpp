// =============================================================================
//  Adiel Junior — PiperTts (Windows, דורש piper + onnxruntime + espeak-ng)
// =============================================================================
#include "audio/PiperTts.h"

#include "core/Logger.h"

#ifdef ADIEL_HAVE_PIPER
#include <piper/piper.hpp>

#include <optional>

namespace aj {

PiperTts::PiperTts() {
    m_piperConfig = new piper::PiperConfig();
}

PiperTts::~PiperTts() {
    if (m_piperConfig) {
        piper::terminate(*static_cast<piper::PiperConfig*>(m_piperConfig));
        delete static_cast<piper::PiperConfig*>(m_piperConfig);
    }
    if (m_voice) delete static_cast<piper::Voice*>(m_voice);
    if (m_speakerId) delete static_cast<std::optional<piper::SpeakerId>*>(m_speakerId);
}

bool PiperTts::init(const Config& cfg) {
    if (m_ready) return true;
    try {
        auto* config = static_cast<piper::PiperConfig*>(m_piperConfig);
        if (!cfg.piperEspeakData.empty()) {
            config->eSpeakDataPath = cfg.piperEspeakData;
        }
        piper::initialize(*config);

        m_voice = new piper::Voice();
        m_speakerId = new std::optional<piper::SpeakerId>();
        piper::loadVoice(*config, cfg.piperVoiceModel, cfg.piperVoiceConfig,
                         *static_cast<piper::Voice*>(m_voice),
                         *static_cast<std::optional<piper::SpeakerId>*>(m_speakerId),
                         false /*useCuda*/);
        m_ready = true;
        logInfo("Piper: קול נטען (%s)", cfg.piperVoiceModel.c_str());
        return true;
    } catch (const std::exception& e) {
        logError("Piper: כשל באתחול: %s", e.what());
        return false;
    }
}

std::vector<float> PiperTts::synthesize(const std::string& text, int& outSampleRate) {
    if (!m_ready) return {};
    try {
        auto* config = static_cast<piper::PiperConfig*>(m_piperConfig);
        auto* voice = static_cast<piper::Voice*>(m_voice);
        std::vector<int16_t> audio;
        piper::SynthesisResult result;
        piper::textToAudio(*config, *voice, text, audio, result, [] {});
        outSampleRate = result.sampleRate;
        std::vector<float> out;
        out.reserve(audio.size());
        for (int16_t s : audio) out.push_back(static_cast<float>(s) / 32768.0f);
        return out;
    } catch (const std::exception& e) {
        logError("Piper: כשל בסינתוז: %s", e.what());
        return {};
    }
}

} // namespace aj

#else // !ADIEL_HAVE_PIPER

namespace aj {
PiperTts::PiperTts() = default;
PiperTts::~PiperTts() = default;
bool PiperTts::init(const Config&) { return false; }
std::vector<float> PiperTts::synthesize(const std::string&, int&) { return {}; }
} // namespace aj

#endif // ADIEL_HAVE_PIPER
