// =============================================================================
//  Adiel Junior — WakeWordFactory
// =============================================================================
#include "audio/IWakeWord.h"

#include "core/Logger.h"

#ifdef ADIEL_HAVE_PORCUPINE
#include "audio/PorcupineWakeWord.h"
#endif
#include "audio/WakeWordStub.h"

namespace aj {

IWakeWord* createWakeWordEngine(const Config& cfg) {
#ifdef ADIEL_HAVE_PORCUPINE
    if (cfg.wakeEngine == "porcupine") {
        auto* eng = new PorcupineWakeWord();
        if (eng->init(cfg)) return eng;
        delete eng; // נופל למקש חם
    }
#endif
    if (cfg.wakeEngine == "sherpa") {
        logWarn("WakeWord: מנוע sherpa דורש בנייה עם sherpa-onnx — משתמש במקש חם");
    }
    return new WakeWordStub();
}

} // namespace aj
