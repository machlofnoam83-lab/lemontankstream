// =============================================================================
//  Adiel Junior — TtsFactory
// =============================================================================
#include "audio/ITts.h"

#include "core/Logger.h"

#ifdef ADIEL_HAVE_SHERTA_TTS
#include "audio/SherpaTts.h"
#endif
#ifdef ADIEL_HAVE_PIPER
#include "audio/PiperTts.h"
#endif
#include "audio/TtsStub.h"

namespace aj {

ITts* createTtsEngine(const Config& cfg) {
#ifdef ADIEL_HAVE_SHERTA_TTS
    if (cfg.ttsEngine == "sherpa") {
        auto* tts = new SherpaTts();
        if (tts->init(cfg)) return tts;
        logWarn("TTS: sherpa לא נטען — עובר לצפצוף הדגמה");
        delete tts;
        return new TtsStub();
    }
#endif
#ifdef ADIEL_HAVE_PIPER
    if (cfg.ttsEngine == "piper") {
        auto* tts = new PiperTts();
        if (tts->init(cfg)) return tts;
        logWarn("TTS: piper לא נטען — עובר לצפצוף הדגמה");
        delete tts;
        return new TtsStub();
    }
#endif
    if (cfg.ttsEngine == "sherpa" || cfg.ttsEngine == "piper") {
        logWarn("TTS: מנוע %s לא נבנה בבנייה זו — עובר לצפצוף הדגמה", cfg.ttsEngine.c_str());
    }
    return new TtsStub();
}

} // namespace aj
